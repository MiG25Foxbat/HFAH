"use client";
/* eslint-disable react-hooks/immutability -- R3F: объекты three и общие refs сцены мутируются императивно из useFrame и эффектов, это норма для рендера без перерисовок React */
/** R3F-сцена. Подгружается лениво (dynamic, без SSR) только если есть WebGL. */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CategoryId } from "@/lib/catalog";
import type { Characters } from "@/lib/settings";
import { createActivity, type Activity } from "./activity";
import { useReducedMotion, useStageColors } from "./colors";
import { Lights } from "./lights";
import { Ground, Podium } from "./podium";
import { Rig, type RigApi } from "./rig";
import { Showcase, type Anchors, type PhaseHandler } from "./showcase";

export type SceneProps = {
  category: CategoryId;
  characters: Characters;
  /** Сцена на экране и вкладка видна; иначе кадры не рисуются. */
  active: boolean;
  /** Растёт при нажатии «Повторить». */
  retryToken: number;
  /** Подпись для скринридеров (описание canvas). */
  label: string;
  apiRef: RefObject<RigApi | null>;
  /** DOM-пузырь реплики: сцена только двигает его по проекции головы, содержимым владеет Stage. */
  bubbleRef: RefObject<HTMLDivElement | null>;
  onPhase: PhaseHandler;
};

const BUBBLE_PAD = 10;
const BUBBLE_GAP = 12;
const RESET_ZONE = 12 + 44 + 8; // кнопка «Сбросить ракурс»: отступ + размер + запас

/** Рисует по требованию: непрерывно только пока что-то движется; в покое — idle ~30 к/с, при reduced motion — только по таймеру. */
function Driver({ activity, active, onSlow }: { activity: { current: Activity }; active: boolean; onSlow: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const timer = useRef(0);
  const probe = useRef({ n: 0, sum: 0, done: false });

  useEffect(() => {
    activity.current.visible = active;
    if (active) invalidate();
  }, [active, activity, invalidate]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useFrame((state, delta) => {
    const a = activity.current;
    if (!a.visible) return;
    if (a.rig || a.ring || a.show) {
      state.invalidate();
      // Замер на «горячих» кадрах: если держим меньше ~36 к/с, один раз снижаем разрешение до 1x.
      const p = probe.current;
      if (!p.done && delta < 0.25) {
        p.n++;
        if (p.n > 30) p.sum += delta;
        if (p.n === 90) {
          p.done = true;
          if (p.sum / 59 > 1 / 36) onSlow();
        }
      }
      return;
    }
    const wait = a.idle ? 28 : a.wake !== null ? a.wake * 1000 : null;
    if (wait !== null && !timer.current) {
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        state.invalidate();
      }, wait);
    }
  });
  return null;
}

/** Ставит DOM-пузырь над головой по проекции: внутри сцены, не закрывает глаза и кнопку сброса. */
function BubbleAnchor({
  bubbleRef,
  anchors,
  groupRef,
}: {
  bubbleRef: RefObject<HTMLDivElement | null>;
  anchors: { current: Anchors };
  groupRef: RefObject<THREE.Group | null>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const dims = useRef({ w: 0, h: 0 });
  const tmp = useMemo(() => ({ head: new THREE.Vector3(), eye: new THREE.Vector3() }), []);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      dims.current.w = el.offsetWidth;
      dims.current.h = el.offsetHeight;
      invalidate();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bubbleRef, invalidate]);

  useFrame((state) => {
    const el = bubbleRef.current;
    const g = groupRef.current;
    if (!el || !g || !anchors.current.valid) return;
    const { width: W, height: H } = state.size;
    const { w, h } = dims.current;
    // Матрицы этого кадра ещё не пересчитаны рендером: без этого пузырь отставал бы на кадр.
    g.updateMatrixWorld();
    state.camera.updateMatrixWorld();
    tmp.head.copy(anchors.current.head);
    g.localToWorld(tmp.head).project(state.camera);
    tmp.eye.copy(anchors.current.eye);
    g.localToWorld(tmp.eye).project(state.camera);
    const hx = (tmp.head.x * 0.5 + 0.5) * W;
    const hy = (-tmp.head.y * 0.5 + 0.5) * H;
    const ey = (-tmp.eye.y * 0.5 + 0.5) * H;

    const x = THREE.MathUtils.clamp(hx - w / 2, BUBBLE_PAD, Math.max(BUBBLE_PAD, W - w - BUBBLE_PAD));
    const y = Math.min(hy - BUBBLE_GAP, ey - 8) - h; // над головой и выше глаз
    const hitsReset = x + w > W - RESET_ZONE && y + h > H - RESET_ZONE;
    const fits = y >= BUBBLE_PAD && !hitsReset && w > 0;
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(Math.max(y, BUBBLE_PAD))}px, 0)`;
    el.style.setProperty("--tail-x", `${Math.round(THREE.MathUtils.clamp(hx - x, 18, Math.max(18, w - 18)))}px`);
    el.dataset.fit = fits ? "1" : "0";
  });
  return null;
}

function A11y({ label }: { label: string }) {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
  }, [el, label]);
  return null;
}

export default function StageScene({ category, characters, active, retryToken, label, apiRef, bubbleRef, onPhase }: SceneProps) {
  const colors = useStageColors();
  const reduced = useReducedMotion();
  const [dpr, setDpr] = useState<number | [number, number]>([1, 1.75]);
  const activity = useRef<Activity>(createActivity());
  const anchors = useRef<Anchors>({ head: new THREE.Vector3(0, 1.6, 0), eye: new THREE.Vector3(0, 1.2, 0), valid: false });
  const rigGroup = useRef<THREE.Group>(null);

  return (
    <Canvas
      frameloop="demand"
      flat
      shadows="percentage"
      dpr={dpr}
      camera={{ fov: 30, near: 0.1, far: 40, position: [0, 3, 8] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.NeutralToneMapping;
        state.gl.domElement.addEventListener("webglcontextrestored", () => state.invalidate());
        if (process.env.NODE_ENV !== "production") (window as unknown as { __stage?: unknown }).__stage = state;
      }}
    >
      <A11y label={label} />
      <Lights dark={colors.dark} />
      <Rig category={category} apiRef={apiRef} activity={activity} reduced={reduced} groupRef={rigGroup}>
        <Podium category={category} colors={colors} reduced={reduced} activity={activity} />
        <Showcase
          category={category}
          facesEnabled={characters.facesEnabled}
          reduced={reduced}
          retryToken={retryToken}
          activity={activity}
          anchors={anchors}
          onPhase={onPhase}
        />
      </Rig>
      <Ground dark={colors.dark} />
      <BubbleAnchor bubbleRef={bubbleRef} anchors={anchors} groupRef={rigGroup} />
      <Driver activity={activity} active={active} onSlow={() => setDpr(1)} />
    </Canvas>
  );
}
