"use client";
/* eslint-disable react-hooks/immutability -- R3F: объекты three и общие refs сцены мутируются императивно из useFrame и эффектов, это норма для рендера без перерисовок React */
/** Подиум-«рулетка»: фанерный круг с лентой делений по краю; при смене категории кольцо проворачивается. */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { StageColors } from "./colors";
import type { Activity } from "./activity";

export const PODIUM_R = 1.2;
const BASE_H = 0.16;
const TICKS = 120;
const TICK_STEP = (Math.PI * 2) / TICKS;

function drawTape(canvas: HTMLCanvasElement, ply: string, ink: string, accent: string, family: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const S = canvas.width;
  const c = S / 2;
  ctx.clearRect(0, 0, S, S);

  ctx.fillStyle = ply;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  // Слои фанеры: тонкие волнистые линии, обрезанные кругом.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) {
    const y = ((i + 0.5) * S) / 40;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(S * 0.3, y + ((i * 7) % 9) - 4, S * 0.65, y - ((i * 5) % 9) + 4, S, y + ((i * 3) % 7) - 3);
    ctx.stroke();
  }
  ctx.restore();

  // Лента: светлее фанеры, с тонкими границами.
  const outer = 0.965 * c;
  const inner = 0.64 * c;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  ctx.arc(c, c, inner, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Деления: короткие, средние, длинные с числами.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(c * 0.09)}px ${family}`;
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2;
    const major = i % 10 === 0;
    const mid = i % 5 === 0;
    const len = (major ? 0.115 : mid ? 0.08 : 0.05) * c;
    const r1 = outer - 0.014 * c;
    ctx.strokeStyle = major && i === 0 ? accent : ink;
    ctx.lineWidth = major ? 6 : mid ? 4 : 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1);
    ctx.lineTo(c + Math.sin(a) * (r1 - len), c - Math.cos(a) * (r1 - len));
    ctx.stroke();
    if (major) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a + Math.PI);
      ctx.fillStyle = i === 0 ? accent : ink;
      ctx.fillText(String(i), 0, r1 - 0.115 * c - 0.07 * c);
      ctx.restore();
    }
  }
}

export function Podium({
  index,
  count,
  color,
  colors,
  reduced,
  activity,
}: {
  /** Номер выбранной категории и общее число категорий: кольцо делится поровну, отметка встаёт на нужное деление. */
  index: number;
  count: number;
  /** Цвет категории: ободок подиума. */
  color: string;
  colors: StageColors;
  reduced: boolean;
  activity: { current: Activity };
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const ringRef = useRef<THREE.Group>(null);
  const rimRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringTarget = useRef(0);
  const rimTarget = useMemo(() => new THREE.Color(), []);

  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  }, []);

  // Своё создаём — своё освобождаем (кэшированные GLB не трогаем).
  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    let alive = true;
    const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const redraw = () => {
      if (!alive) return;
      drawTape(canvas, colors.ply, colors.ink, colors.accent, family);
      texture.needsUpdate = true;
      invalidate();
    };
    redraw();
    // Шрифт интерфейса мог ещё не загрузиться: перерисовать цифры, когда будет готов.
    document.fonts?.ready.then(redraw);
    return () => {
      alive = false;
    };
  }, [canvas, texture, colors.ply, colors.ink, colors.accent, gl, invalidate]);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    // угол категории — на ближайшее деление ленты (120 делений), чтобы отметка не стояла между штрихами
    const t = Math.round((Math.max(0, index) * Math.PI * 2) / Math.max(1, count) / TICK_STEP) * TICK_STEP;
    // Кратчайший путь: цель в пределах половины оборота от текущего угла.
    const k = Math.round((ring.rotation.y - t) / (Math.PI * 2));
    ringTarget.current = t + k * Math.PI * 2;
    rimTarget.set(color);
    if (reduced) {
      ring.rotation.y = ringTarget.current;
      rimRef.current?.color.copy(rimTarget);
    }
    invalidate();
  }, [index, count, color, reduced, rimTarget, invalidate]);

  useFrame((_, delta) => {
    const ring = ringRef.current;
    const rim = rimRef.current;
    if (!ring || !rim) return;
    const dt = Math.min(delta, 0.05);
    const dy = ringTarget.current - ring.rotation.y;
    // Мягкая пружина без перелёта: кольцо «докручивается» к новой отметке.
    ring.rotation.y = Math.abs(dy) < 0.0005 ? ringTarget.current : THREE.MathUtils.damp(ring.rotation.y, ringTarget.current, 6, dt);
    const a = 1 - Math.exp(-dt * 8);
    rim.color.lerp(rimTarget, a);
    const dc = Math.abs(rim.color.r - rimTarget.r) + Math.abs(rim.color.g - rimTarget.g) + Math.abs(rim.color.b - rimTarget.b);
    if (dc < 0.002) rim.color.copy(rimTarget);
    activity.current.ring = Math.abs(dy) > 0.0005 || dc >= 0.002;
  });

  const side = useMemo(() => `#${new THREE.Color(colors.ply).multiplyScalar(0.7).getHexString()}`, [colors.ply]);

  return (
    <group name="podium">
      <mesh position-y={-BASE_H / 2} castShadow receiveShadow>
        <cylinderGeometry args={[PODIUM_R, PODIUM_R + 0.04, BASE_H, 72]} />
        <meshStandardMaterial color={side} roughness={0.85} />
      </mesh>
      <group ref={ringRef}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow>
          <circleGeometry args={[PODIUM_R, 96]} />
          <meshStandardMaterial map={texture} roughness={0.8} />
        </mesh>
      </group>
      <mesh rotation-x={Math.PI / 2} position-y={0.004}>
        <torusGeometry args={[PODIUM_R - 0.012, 0.016, 8, 96]} />
        <meshStandardMaterial ref={rimRef} color={color} roughness={0.55} />
      </mesh>
      {/* Неподвижная отметка: показывает, какое деление «выбрано». */}
      <mesh position={[0, 0.03, PODIUM_R - 0.1]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.065, 0.16, 3]} />
        <meshStandardMaterial color={colors.accent} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Ground({ dark }: { dark: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-BASE_H - 0.002} receiveShadow>
      <circleGeometry args={[3.4, 64]} />
      <shadowMaterial transparent opacity={dark ? 0.5 : 0.26} />
    </mesh>
  );
}
