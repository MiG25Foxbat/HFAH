/**
 * Только для разработки и e2e (подключается динамически из GameScene под `NODE_ENV !== "production"`, в сборку не попадает).
 * window.__game: состояние партии и «синтетическая чистка» — лучи с разных сторон по всей модели через ту же
 * Session.probe()/eraseHit(), что и настоящая кисть.
 */
import * as THREE from "three";
import type { RigApi } from "@/components/stage/rig";
import type { RefObject } from "react";
import type { Session } from "./session";

let counter = 0;

export type GameDebug = {
  /** Номер партии: меняется с каждой новой Session. */
  id: number;
  reach: () => { tris: number; seen: number; good: number } | null;
  progress: () => number;
  /** Настоящая доля непрозрачных пикселей маски сейчас / в начале (читает canvas). */
  measure: () => number;
  spots: { u: number; v: number; r: number; kind: string }[];
  done: () => boolean;
  yaw: () => number;
  /** Счётчики памяти рендерера (проверка освобождения текстур). */
  gpu: () => { textures: number; geometries: number; frames: number };
  /** Сколько раз Session просила обновить текстуру маски (не больше одного раза за кадр). */
  uploads: () => number;
  /** Текущее значение затухания налёта после победы (1 — полностью виден). */
  fade: () => number;
  /** Экранные координаты точки пятна и видно ли её сейчас (не закрыта ли геометрией). */
  spotScreen: (i: number) => { x: number; y: number; visible: boolean };
  /** Экранный прямоугольник персонажа (по габаритам) для штрихов. */
  bodyRect: () => { x: number; y: number; w: number; h: number };
  /** По каждому пятну: сколько его маски осталось (0…1) и ближайшая деталь персонажа (диагностика недосягаемых участков). */
  spotRemain: () => { i: number; kind: string; remain: number; near: string; dist: number }[];
  /** Диагностика: сколько остаточных текселей маски не задел ни один луч синтетической чистки. */
  diagnose: () => { remnant: number; unhit: number; hit: number };
  /** Прогресс после каждого ракурса последней синтетической чистки. */
  trace: () => number[];
  cleanAll: (opts?: { yaws?: number; elevs?: number[]; grid?: number; radius?: number; maxViews?: number; full?: boolean }) => Promise<number>;
};

declare global {
  interface Window {
    __game?: GameDebug;
  }
}

export function install(s: Session, ctx: { camera: THREE.PerspectiveCamera; group: THREE.Group; apiRef: RefObject<RigApi | null>; gl: THREE.WebGLRenderer }) {
  const initial = s.grime.measureAlpha();
  const hitMap = new Uint8Array(512 * 512);
  const trace: number[] = [];
  const initialPerSpot = s.grime.spots.map((sp) => {
    const R = Math.ceil(sp.r * 1.2);
    const x0 = Math.max(0, Math.floor(sp.u * 512 - R));
    const y0 = Math.max(0, Math.floor(sp.v * 512 - R));
    const d = (s.grime.canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(x0, y0, Math.min(512 - x0, R * 2), Math.min(512 - y0, R * 2)).data;
    let sum = 0;
    for (let k = 3; k < d.length; k += 4) sum += d[k];
    return sum;
  });
  const screen = (world: THREE.Vector3) => {
    ctx.camera.updateMatrixWorld();
    const rect = s.canvasRect();
    const p = world.clone().project(ctx.camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  const game: GameDebug = {
    id: ++counter,
    reach: () => s.grime.reachStats,
    progress: () => s.grime.progress(),
    measure: () => (initial > 0 ? s.grime.measureAlpha() / initial : 0),
    spots: s.grime.spots.map(({ u, v, r, kind }) => ({ u, v, r, kind })),
    done: () => s.done,
    yaw: () => ctx.group.parent?.rotation.y ?? 0,
    gpu: () => ({ textures: ctx.gl.info.memory.textures, geometries: ctx.gl.info.memory.geometries, frames: ctx.gl.info.render.frame }),
    uploads: () => s.grime.uploads,
    fade: () => s.grime.fade.value,
    spotScreen: (i) => {
      s.pivot.updateMatrixWorld(true);
      const world = s.pivot.localToWorld(s.grime.spots[i].point.clone());
      const { x, y } = screen(world);
      const hit = s.screenHit(x, y);
      return { x, y, visible: !!hit && hit.point.distanceTo(world) < 0.06 };
    },
    bodyRect: () => {
      s.pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(s.pivot);
      const pts = [box.min, box.max].flatMap((a) => [box.min.z, box.max.z].map((z) => new THREE.Vector3(a.x, a.y, z)));
      const xs = pts.map((p) => screen(p).x);
      const ys = pts.map((p) => screen(p).y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    },
    spotRemain: () => {
      const ctx2d = s.grime.canvas.getContext("2d") as CanvasRenderingContext2D;
      const parts: { name: string; box: THREE.Box3 }[] = [];
      s.pivot.updateMatrixWorld(true);
      s.pivot.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name !== "Body") parts.push({ name: m.name, box: new THREE.Box3().setFromObject(m) });
      });
      return s.grime.spots.map((sp, i) => {
        const R = Math.ceil(sp.r * 1.2);
        const x0 = Math.max(0, Math.floor(sp.u * 512 - R));
        const y0 = Math.max(0, Math.floor(sp.v * 512 - R));
        const w = Math.min(512 - x0, R * 2);
        const h = Math.min(512 - y0, R * 2);
        const d = ctx2d.getImageData(x0, y0, w, h).data;
        let sum = 0;
        for (let k = 3; k < d.length; k += 4) sum += d[k];
        const base = initialPerSpot[i] || 1;
        const world = s.pivot.localToWorld(sp.point.clone());
        let near = "";
        let dist = Infinity;
        for (const p of parts) {
          const dd = p.box.distanceToPoint(world);
          if (dd < dist) [near, dist] = [p.name, dd];
        }
        return { i, kind: sp.kind, remain: sum / base, near, dist: Math.round(dist * 100) / 100 };
      });
    },
    diagnose: () => {
      const d = (s.grime.canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 512, 512).data;
      let remnant = 0;
      let unhit = 0;
      let hitN = 0;
      for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
          if (d[(y * 512 + x) * 4 + 3] < 26) continue;
          remnant++;
          let near = false;
          for (let j = -3; j <= 3 && !near; j++) for (let i = -3; i <= 3 && !near; i++) {
            const xx = x + i;
            const yy = y + j;
            if (xx >= 0 && yy >= 0 && xx < 512 && yy < 512 && hitMap[yy * 512 + xx]) near = true;
          }
          if (near) hitN++;
          else unhit++;
        }
      }
      return { remnant, unhit, hit: hitN };
    },
    trace: () => trace,
    cleanAll: async ({ yaws = 12, elevs = [0.2, 0.6, 1.0], grid = 30, radius = 0.12, maxViews = 999, full = false } = {}) => {
      s.pivot.updateMatrixWorld(true);
      const sphere = new THREE.Box3().setFromObject(s.pivot).getBoundingSphere(new THREE.Sphere());
      const rc = s.raycasterRef;
      const dir = new THREE.Vector3();
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      const origin = new THREE.Vector3();
      let views = 0;
      const wasDone = s.done;
      if (full) s.done = true; // диагностика: полная зачистка без победы, чтобы увидеть, что осталось недосягаемым
      for (const elev of elevs) {
        for (let y = 0; y < yaws; y++) {
          if ((s.done && !full) || views++ >= maxViews) {
            if (full) s.done = wasDone;
            return s.grime.progress();
          }
          const yaw = (y / yaws) * Math.PI * 2;
          dir.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
          right.set(0, 1, 0).cross(dir).normalize();
          up.crossVectors(dir, right);
          for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
              origin
                .copy(sphere.center)
                .addScaledVector(dir, sphere.radius + 1)
                .addScaledVector(right, (i / (grid - 1) - 0.5) * 2 * sphere.radius)
                .addScaledVector(up, (j / (grid - 1) - 0.5) * 2 * sphere.radius);
              rc.set(origin, dir.clone().negate());
              const hit = s.probe();
              if (hit) {
                s.eraseHit(hit, radius);
                if (hit.uv) hitMap[Math.min(511, Math.floor(hit.uv.y * 512)) * 512 + Math.min(511, Math.floor(hit.uv.x * 512))] = 1;
              }
            }
          }
          if (!full) s.afterErase();
          trace.push(Math.round(s.grime.progress() * 1000) / 1000);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (full) s.done = wasDone;
      return s.grime.progress();
    },
  };
  window.__game = game;
  return () => {
    if (window.__game === game) delete window.__game;
  };
}
