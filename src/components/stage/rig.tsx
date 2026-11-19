"use client";
/* eslint-disable react-hooks/immutability -- R3F: объекты three и общие refs сцены мутируются императивно из useFrame и эффектов, это норма для рендера без перерисовок React */
/**
 * Вращение «как на поворотном столе»: поворачивается группа (подиум + персонаж), свет и камера неподвижны.
 * Свой контроллер вместо OrbitControls: OrbitControls ставит touch-action: none и перехватывает вертикальную
 * прокрутку страницы на телефоне. Здесь touch-action: pan-y — вертикальный свайп прокручивает страницу
 * (браузер присылает pointercancel), горизонтальный вращает. Колесо не перехватывается, зума нет.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Activity } from "./activity";

export type RigApi = {
  /** Поворот на dYaw рад по горизонтали и dElev рад по высоте камеры (клавиатура). */
  rotate: (dYaw: number, dElev: number) => void;
  /** Анимированный возврат к исходному ракурсу. */
  reset: () => void;
};

export const DEFAULT_ELEV = 0.36;
const ELEV_MIN = 0.12;
const ELEV_MAX = 1.05;
const OVERSHOOT = 0.12; // насколько можно «растянуть» предел при жесте (резинка)
const FRICTION = 3.2; // 1/с: затухание инерции вращения
const MAX_SPIN = 9; // рад/с

// Что должно поместиться в кадр: подиум по ширине, от макушки до переднего края подиума по высоте.
// Сверху остаётся запас в пикселях под реплику (две-три строки): так она помещается и на низкой сцене телефона.
const FRAME_W = 2.9;
const CONTENT_H = 2.25;
const BOTTOM_PAD = 24; // px запаса под передним краем подиума
const CONTENT_MID = 0.5; // «вверх» (в экранных единицах) от центра подиума до середины содержимого

const rubber = (x: number) => OVERSHOOT * (1 - Math.exp(-x / OVERSHOOT));
const softClamp = (v: number) => (v < ELEV_MIN ? ELEV_MIN - rubber(ELEV_MIN - v) : v > ELEV_MAX ? ELEV_MAX + rubber(v - ELEV_MAX) : v);

export function Rig({
  apiRef,
  activity,
  reduced,
  groupRef,
  children,
}: {
  apiRef: RefObject<RigApi | null>;
  activity: { current: Activity };
  reduced: boolean;
  groupRef: RefObject<THREE.Group | null>;
  children: ReactNode;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const reducedRef = useRef(reduced);
  const st = useRef({
    yaw: 0,
    yawVel: 0,
    elevRaw: DEFAULT_ELEV,
    dragging: false,
    resetting: false,
    pid: -1,
    lx: 0,
    ly: 0,
    lt: 0,
  });

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    el.style.touchAction = "pan-y pinch-zoom";

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (s.dragging) return;
      s.dragging = true;
      s.resetting = false;
      s.pid = e.pointerId;
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.lt = e.timeStamp;
      s.yawVel = 0;
      el.setPointerCapture(e.pointerId);
      activity.current.rig = true;
      invalidate();
    };
    const onMove = (e: PointerEvent) => {
      if (!s.dragging || e.pointerId !== s.pid) return;
      const dx = e.clientX - s.lx;
      const dy = e.clientY - s.ly;
      const dt = Math.max(1, e.timeStamp - s.lt) / 1000;
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.lt = e.timeStamp;
      const w = Math.max(el.clientWidth, 280);
      const h = Math.max(el.clientHeight, 280);
      const dYaw = (dx / w) * Math.PI * 2; // перетащить через всю ширину = оборот
      s.yaw += dYaw;
      s.elevRaw += (dy / h) * 1.6;
      s.yawVel = THREE.MathUtils.lerp(s.yawVel, dYaw / dt, 0.4);
      invalidate();
    };
    const onEnd = (e: PointerEvent) => {
      if (!s.dragging || e.pointerId !== s.pid) return;
      s.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // Палец остановился перед отпусканием — не бросаем. Отмена (браузер начал прокрутку) — тоже.
      const still = e.type === "pointercancel" || e.timeStamp - s.lt > 90 || reducedRef.current;
      s.yawVel = still ? 0 : THREE.MathUtils.clamp(s.yawVel, -MAX_SPIN, MAX_SPIN);
      invalidate();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);

    const nearestTurn = () => Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2;
    (apiRef as { current: RigApi | null }).current = {
      rotate(dYaw, dElev) {
        s.resetting = false;
        if (reducedRef.current) s.yaw += dYaw;
        else s.yawVel = THREE.MathUtils.clamp(s.yawVel + dYaw * FRICTION, -MAX_SPIN, MAX_SPIN);
        s.elevRaw = THREE.MathUtils.clamp(s.elevRaw + dElev, ELEV_MIN, ELEV_MAX);
        invalidate();
      },
      reset() {
        s.yawVel = 0;
        if (reducedRef.current) {
          s.yaw = nearestTurn();
          s.elevRaw = DEFAULT_ELEV;
        } else {
          s.resetting = true;
        }
        invalidate();
      },
    };

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", onEnd);
      (apiRef as { current: RigApi | null }).current = null;
    };
  }, [gl, invalidate, activity, apiRef]);

  useFrame((state, delta) => {
    const s = st.current;
    const dt = Math.min(delta, 0.05);
    if (!s.dragging) {
      if (s.resetting) {
        const ty = Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2;
        s.yaw = THREE.MathUtils.damp(s.yaw, ty, 9, dt);
        s.elevRaw = THREE.MathUtils.damp(s.elevRaw, DEFAULT_ELEV, 9, dt);
        if (Math.abs(s.yaw - ty) < 0.002 && Math.abs(s.elevRaw - DEFAULT_ELEV) < 0.002) {
          s.yaw = ty;
          s.elevRaw = DEFAULT_ELEV;
          s.resetting = false;
        }
      } else {
        if (Math.abs(s.yawVel) > 0.01) {
          s.yaw += s.yawVel * dt;
          s.yawVel *= Math.exp(-dt * FRICTION);
        } else s.yawVel = 0;
        const clamped = THREE.MathUtils.clamp(s.elevRaw, ELEV_MIN, ELEV_MAX);
        if (s.elevRaw !== clamped) {
          s.elevRaw = Math.abs(s.elevRaw - clamped) < 0.001 ? clamped : THREE.MathUtils.damp(s.elevRaw, clamped, 12, dt);
        }
      }
    }
    const elev = softClamp(s.elevRaw);

    const group = groupRef.current;
    if (group) group.rotation.y = s.yaw;

    const cam = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const reserve = THREE.MathUtils.clamp(height * 0.3, 72, 112);
    const dH = (CONTENT_H * height) / ((height - reserve - BOTTOM_PAD) * 2 * tanHalf);
    const d = Math.max(dH, FRAME_W / (2 * tanHalf * (width / height)));
    const unit = height / (2 * d * tanHalf); // пикселей на единицу мира в точке съёмки
    const ty = (CONTENT_MID + (reserve - BOTTOM_PAD) / 2 / unit) / Math.cos(DEFAULT_ELEV);
    cam.position.set(0, ty + d * Math.sin(elev), d * Math.cos(elev));
    cam.lookAt(0, ty, 0);

    activity.current.rig = s.dragging || s.resetting || s.yawVel !== 0 || s.elevRaw < ELEV_MIN || s.elevRaw > ELEV_MAX;
  });

  return <group ref={groupRef}>{children}</group>;
}
