"use client";
/* eslint-disable react-hooks/immutability -- R3F: объекты three и общие refs сцены мутируются императивно из useFrame и эффектов, это норма для рендера без перерисовок React */
/**
 * Витрина персонажа. Императивно (без перерисовок React на кадр): не более двух персонажей одновременно —
 * уходящий и входящий. Побеждает последний выбор: при быстрых переключениях старые переходы обрываются,
 * повторный выбор той же категории «оживляет» уходящий экземпляр с текущего положения.
 *
 * Экземпляры — SkeletonUtils.clone кэшированного GLB: геометрия общая (не освобождаем), материалы свои
 * (клонируем, освобождаем). Готовые экземпляры лежат в пуле с прогретыми шейдерами, поэтому переключение
 * не подвисает на компиляции.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { CATEGORIES, type CategoryId } from "@/lib/catalog";
import { clearCharacter, loadCharacter, peekCharacter, type CharacterAsset } from "./assets";
import type { Activity } from "./activity";

export type Phase = "loading" | "ready" | "error";
export type PhaseHandler = (phase: Phase, category: CategoryId) => void;
export type Anchors = { head: THREE.Vector3; eye: THREE.Vector3; valid: boolean };

const TARGET_H = 1.6;
const IN_S = 0.4;
const OUT_S = 0.25;
const FADE_S = 0.2; // reduced motion: простое перекрёстное затухание
const SQUASH = { sy: 0.04, sxz: 1.25, y: -0.35 };

type Pose = { sy: number; sxz: number; y: number; o: number };
type Inst = {
  category: CategoryId;
  pivot: THREE.Group;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  idle?: THREE.AnimationAction;
  wave?: THREE.AnimationAction;
  blink?: THREE.AnimationAction;
  mats: THREE.Material[];
  face: THREE.Object3D | null;
  lids: THREE.Object3D[];
  headY: number;
  eyeY: number;
  phase: "in" | "idle" | "out";
  t: number;
  dur: number;
  from: Pose;
  opacity: number;
  nextBlink: number;
  nextWave: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutBack = (u: number) => {
  const c1 = 1.3;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};
const easeInCubic = (u: number) => u * u * u;
const lerp = THREE.MathUtils.lerp;

function setOpacity(inst: Inst, o: number) {
  inst.opacity = o;
  for (const m of inst.mats) {
    const baseT = m.userData.baseTransparent as boolean;
    const want = o < 1 || baseT;
    if (m.transparent !== want) {
      m.transparent = want;
      m.needsUpdate = true;
    }
    m.opacity = (m.userData.baseOpacity as number) * o;
  }
}

function applyFaces(inst: Inst, on: boolean) {
  if (inst.face) inst.face.visible = on;
  for (const l of inst.lids) l.visible = on;
}

function instantiate(category: CategoryId, asset: CharacterAsset): Inst {
  const root = SkeletonUtils.clone(asset.scene) as THREE.Group;
  const owned = new Map<THREE.Material, THREE.Material>();
  const mats: THREE.Material[] = [];
  const own = (src: THREE.Material) => {
    let c = owned.get(src);
    if (!c) {
      c = src.clone();
      c.userData = { baseOpacity: src.opacity, baseTransparent: src.transparent };
      owned.set(src, c);
      mats.push(c);
    }
    return c;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
  });

  const fit = new THREE.Group();
  fit.add(root);
  fit.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fit);
  const h = box.max.y - box.min.y;
  if (h > 0.01) {
    const k = TARGET_H / h;
    fit.scale.setScalar(k);
    fit.position.y = -box.min.y * k; // низ по центру подиума
  }
  fit.updateMatrixWorld(true);
  const headY = new THREE.Box3().setFromObject(fit).max.y;
  const face = root.getObjectByName("Face") ?? null;
  const eyeY = face ? new THREE.Box3().setFromObject(face).max.y : headY * 0.8;
  const lids = ["Lid_L", "Lid_R"].map((n) => root.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);

  const pivot = new THREE.Group();
  pivot.add(fit);

  const mixer = new THREE.AnimationMixer(root);
  const action = (name: string, once: boolean) => {
    const clip = THREE.AnimationClip.findByName(asset.animations, name);
    if (!clip) return undefined;
    const a = mixer.clipAction(clip);
    if (once) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
    }
    return a;
  };

  return {
    category,
    pivot,
    root,
    mixer,
    idle: action("Idle", false),
    wave: action("Wave", true),
    blink: action("Blink", true),
    mats,
    face,
    lids,
    headY,
    eyeY,
    phase: "in",
    t: 0,
    dur: IN_S,
    from: { ...SQUASH, o: 0 },
    opacity: 1,
    nextBlink: 0,
    nextWave: 0,
  };
}

function disposeInst(inst: Inst) {
  inst.mixer.stopAllAction();
  inst.mixer.uncacheRoot(inst.root);
  for (const m of inst.mats) m.dispose(); // только клоны материалов; геометрия и текстуры принадлежат кэшу
}

export function Showcase({
  category,
  facesEnabled,
  reduced,
  retryToken,
  activity,
  anchors,
  onPhase,
}: {
  category: CategoryId;
  facesEnabled: boolean;
  reduced: boolean;
  retryToken: number;
  activity: { current: Activity };
  anchors: { current: Anchors };
  onPhase: PhaseHandler;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  const groupRef = useRef<THREE.Group>(null);
  const slots = useRef<Inst[]>([]);
  const pool = useRef(new Map<CategoryId, Inst>());
  const seen = useRef(new Set<CategoryId>());
  const flags = useRef({ faces: facesEnabled, reduced });
  const onPhaseRef = useRef(onPhase);
  const handledRetry = useRef(0);
  const preloadStarted = useRef(false);
  const alive = useRef(false);
  const releaseRef = useRef<(i: Inst) => void>(() => {});

  useEffect(() => {
    onPhaseRef.current = onPhase;
  });

  useEffect(() => {
    flags.current.faces = facesEnabled;
    for (const i of [...slots.current, ...pool.current.values()]) applyFaces(i, facesEnabled);
    invalidate();
  }, [facesEnabled, invalidate]);

  useEffect(() => {
    flags.current.reduced = reduced;
    for (const i of [...slots.current, ...pool.current.values()]) if (i.idle) i.idle.paused = reduced;
    invalidate();
  }, [reduced, invalidate]);

  useEffect(() => {
    alive.current = true;
    const list = slots.current;
    const idlePool = pool.current;
    const group = groupRef.current;
    return () => {
      alive.current = false;
      for (const i of [...list, ...idlePool.values()]) disposeInst(i);
      list.length = 0;
      idlePool.clear();
      group?.clear();
      preloadStarted.current = false;
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const list = slots.current;
    let cancelled = false;

    const snapshot = (i: Inst): Pose => ({ sy: i.pivot.scale.y, sxz: i.pivot.scale.x, y: i.pivot.position.y, o: i.opacity });
    const begin = (i: Inst, phase: "in" | "out", from: Pose) => {
      i.phase = phase;
      i.t = 0;
      i.dur = flags.current.reduced ? FADE_S : phase === "in" ? IN_S : OUT_S;
      i.from = from;
    };
    const release = (i: Inst) => {
      const k = list.indexOf(i);
      if (k >= 0) list.splice(k, 1);
      group.remove(i.pivot);
      i.mixer.stopAllAction();
      i.pivot.scale.set(1, 1, 1);
      i.pivot.position.y = 0;
      setOpacity(i, 1);
      if (pool.current.has(i.category)) disposeInst(i);
      else pool.current.set(i.category, i);
    };
    releaseRef.current = release;

    const mount = (cat: CategoryId, asset: CharacterAsset) => {
      let inst = list.find((s) => s.category === cat);
      if (inst && inst.phase !== "out") return;
      if (inst) {
        begin(inst, "in", snapshot(inst)); // оживляем уходящего с текущего положения
      } else {
        inst = pool.current.get(cat) ?? instantiate(cat, asset);
        pool.current.delete(cat);
        applyFaces(inst, flags.current.faces);
        begin(inst, "in", { ...SQUASH, o: 0 });
        if (flags.current.reduced) {
          setOpacity(inst, 0);
        } else {
          inst.pivot.scale.set(SQUASH.sxz, SQUASH.sy, SQUASH.sxz);
          inst.pivot.position.y = SQUASH.y;
        }
        if (inst.idle) {
          inst.idle.reset().play();
          inst.idle.paused = flags.current.reduced;
        }
        inst.mixer.update(0);
        list.push(inst);
        group.add(inst.pivot);
      }
      for (const o of [...list]) {
        if (o === inst) continue;
        if (o.phase === "out") release(o);
        else begin(o, "out", snapshot(o));
      }
      anchors.current.head.set(0, inst.headY, 0);
      anchors.current.eye.set(0, inst.eyeY, 0);
      anchors.current.valid = true;
      invalidate();
      if (!preloadStarted.current) {
        preloadStarted.current = true;
        void preloadRest();
      }
    };

    const idle = () =>
      new Promise<void>((resolve) => {
        const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
        if (ric) ric(() => resolve(), { timeout: 1500 });
        else setTimeout(resolve, 200);
      });

    // После первого показа: догружаем остальные четыре модели и прогреваем шейдеры.
    const preloadRest = async () => {
      for (const { id } of CATEGORIES) {
        try {
          const asset = await loadCharacter(id);
          await idle();
          if (!alive.current) return;
          if (pool.current.has(id) || list.some((s) => s.category === id)) continue;
          const inst = instantiate(id, asset);
          inst.mixer.stopAllAction();
          applyFaces(inst, flags.current.faces);
          try {
            await gl.compileAsync(inst.pivot, camera, scene);
          } catch {
            /* прогрев необязателен */
          }
          if (!alive.current) {
            disposeInst(inst);
            return;
          }
          if (pool.current.has(id)) disposeInst(inst);
          else pool.current.set(id, inst);
        } catch {
          /* ошибка проявится, когда категорию выберут: там есть «Повторить» */
        }
      }
    };

    if (retryToken !== handledRetry.current) {
      handledRetry.current = retryToken;
      clearCharacter(category);
    }
    const hit = peekCharacter(category);
    if (hit) {
      mount(category, hit);
      onPhaseRef.current("ready", category);
    } else {
      onPhaseRef.current("loading", category);
      loadCharacter(category).then(
        (asset) => {
          if (cancelled || !alive.current) return; // побеждает последний выбор
          mount(category, asset);
          onPhaseRef.current("ready", category);
        },
        () => {
          if (!cancelled) onPhaseRef.current("error", category);
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [category, retryToken, gl, scene, camera, invalidate, anchors]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = state.clock.elapsedTime;
    const list = slots.current;
    const reducedNow = flags.current.reduced;
    let busy = false;
    let wake = Infinity;

    for (let k = list.length - 1; k >= 0; k--) {
      const i = list[k];
      i.mixer.update(dt);

      if (i.phase === "in" || i.phase === "out") {
        busy = true;
        i.t += dt;
        const u = Math.min(1, i.t / i.dur);
        const isIn = i.phase === "in";
        if (reducedNow) {
          setOpacity(i, lerp(i.from.o, isIn ? 1 : 0, u));
        } else {
          const e = isIn ? easeOutBack(u) : easeInCubic(u);
          const to = isIn ? { sy: 1, sxz: 1, y: 0 } : { sy: SQUASH.sy, sxz: 1.2, y: -0.4 };
          const sxz = lerp(i.from.sxz, to.sxz, e);
          i.pivot.scale.set(sxz, lerp(i.from.sy, to.sy, e), sxz);
          i.pivot.position.y = lerp(i.from.y, to.y, e);
        }
        if (u >= 1) {
          if (isIn) {
            i.phase = "idle";
            i.pivot.scale.set(1, 1, 1);
            i.pivot.position.y = 0;
            setOpacity(i, 1);
            i.nextBlink = now + (reducedNow ? rand(8, 14) : rand(3, 7));
            i.nextWave = now + rand(18, 32);
            if (!seen.current.has(i.category)) {
              seen.current.add(i.category);
              if (!reducedNow) i.wave?.reset().play(); // приветствие — один раз на категорию
            }
          } else {
            releaseRef.current(i);
            continue;
          }
        }
      } else {
        if (now >= i.nextBlink) {
          if (flags.current.faces) i.blink?.reset().play();
          i.nextBlink = now + (reducedNow ? rand(8, 14) : rand(3, 7));
        }
        if (now >= i.nextWave) {
          if (!reducedNow) i.wave?.reset().play();
          i.nextWave = now + rand(18, 32);
        }
        wake = Math.min(wake, i.nextBlink - now, i.nextWave - now);
      }
      if (i.wave?.isRunning() || i.blink?.isRunning()) busy = true;
    }

    activity.current.show = busy;
    activity.current.idle = !reducedNow && list.length > 0;
    activity.current.wake = Number.isFinite(wake) ? Math.max(0, wake) : null;
  });

  return <group ref={groupRef} name="showcase" />;
}
