"use client";
/* eslint-disable react-hooks/immutability -- R3F: объекты three и общие refs сцены мутируются императивно из useFrame и эффектов, это норма для рендера без перерисовок React */
/**
 * R3F-сцена игры: подиум, вращающая группа и свет — из сцены витрины (stage), персонаж и налёт — своя Session.
 * Рисует по требованию: кадры идут, пока что-то движется (жест, штрих, анимация), в покое — анимация idle ~30 к/с.
 */
import { useEffect, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CategoryId } from "@/lib/catalog";
import { clearCharacter, loadCharacter } from "@/components/stage/assets";
import { createActivity, type Activity } from "@/components/stage/activity";
import { useReducedMotion, useStageColors } from "@/components/stage/colors";
import { Lights } from "@/components/stage/lights";
import { Ground, Podium } from "@/components/stage/podium";
import { Rig, type RigApi } from "@/components/stage/rig";
import { Session, type Mode } from "./session";

export type ScenePhase = "loading" | "ready" | "error";

export type GameSceneProps = {
  category: CategoryId;
  facesEnabled: boolean;
  mode: Mode;
  /** Новая партия: новые пятна. */
  round: number;
  /** Растёт при «Повторить»: модель грузится заново. */
  retryToken: number;
  label: string;
  apiRef: RefObject<RigApi | null>;
  /** DOM-кольцо кисти поверх сцены (двигает Session). */
  ringRef: RefObject<HTMLDivElement | null>;
  onPhase: (phase: ScenePhase) => void;
  onProgress: (percent: number) => void;
  onDone: () => void;
};

function A11y({ label }: { label: string }) {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
  }, [el, label]);
  return null;
}

/** Просит кадры, пока что-то движется; в покое — раз в ~33 мс, если играет idle (при reduced motion — нет). */
function Driver({ activity }: { activity: { current: Activity } }) {
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useFrame((state) => {
    const a = activity.current;
    if (document.hidden) return;
    if (a.rig || a.ring || a.show) {
      state.invalidate();
      return;
    }
    if (a.idle && !timer.current) {
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        state.invalidate();
      }, 33);
    }
  });
  return null;
}

function Player({
  category,
  facesEnabled,
  mode,
  round,
  retryToken,
  reduced,
  activity,
  apiRef,
  ringRef,
  onPhase,
  onProgress,
  onDone,
}: Omit<GameSceneProps, "label"> & { reduced: boolean; activity: { current: Activity } }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const groupRef = useRef<THREE.Group>(null);
  const session = useRef<Session | null>(null);
  const latest = useRef({ faces: facesEnabled, reduced, mode, onPhase, onProgress, onDone });
  const handledRetry = useRef(0);

  useEffect(() => {
    latest.current = { faces: facesEnabled, reduced, mode, onPhase, onProgress, onDone };
    session.current?.setMode(mode);
    session.current?.setFaces(facesEnabled);
    session.current?.setReduced(reduced);
    invalidate();
  });

  useEffect(() => {
    let cancelled = false;
    let made: Session | null = null;
    let devOff: (() => void) | undefined;
    const group = groupRef.current;
    if (retryToken !== handledRetry.current) {
      handledRetry.current = retryToken;
      clearCharacter(category);
    }
    latest.current.onPhase("loading");
    loadCharacter(category).then(
      async (asset) => {
        if (cancelled || !group) return;
        try {
          made = await Session.create({
            category,
            asset,
            faces: latest.current.faces,
            reduced: latest.current.reduced,
            camera: camera as THREE.PerspectiveCamera,
            canvas: gl.domElement,
            gl,
            invalidate,
            rigApi: () => apiRef.current,
            onProgress: (p) => latest.current.onProgress(p),
            onDone: () => latest.current.onDone(),
          });
        } catch {
          latest.current.onPhase("error");
          return;
        }
        if (cancelled) {
          made.dispose(); // закрыли или сменили партию, пока считалась достижимость
          made = null;
          return;
        }
        session.current = made;
        group.add(made.pivot);
        made.bind(gl.domElement.parentElement ?? gl.domElement, ringRef.current);
        made.setMode(latest.current.mode);
        if (process.env.NODE_ENV !== "production") {
          const s = made;
          void import("./devtools").then((m) => {
            if (!cancelled) devOff = m.install(s, { camera: camera as THREE.PerspectiveCamera, group, apiRef, gl });
          });
        }
        latest.current.onPhase("ready");
        invalidate();
      },
      () => {
        if (!cancelled) latest.current.onPhase("error");
      },
    );
    return () => {
      cancelled = true;
      devOff?.();
      if (made) {
        group?.remove(made.pivot);
        made.dispose();
      }
      if (session.current === made) session.current = null;
    };
  }, [category, round, retryToken, gl, camera, invalidate, apiRef, ringRef]);

  useFrame((_, delta) => {
    const s = session.current;
    if (!s) return;
    const busy = s.update(Math.min(delta, 0.05));
    activity.current.show = busy;
    activity.current.idle = s.idling;
  });

  return <group ref={groupRef} name="game-character" />;
}

export default function GameScene(props: GameSceneProps) {
  const colors = useStageColors();
  const reduced = useReducedMotion();
  const activity = useRef<Activity>(createActivity());
  const rigGroup = useRef<THREE.Group>(null);
  const { label, ...rest } = props;

  return (
    <Canvas
      frameloop="demand"
      flat
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={{ fov: 30, near: 0.1, far: 40, position: [0, 3, 8] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.NeutralToneMapping;
        state.gl.domElement.addEventListener("webglcontextrestored", () => state.invalidate());
      }}
    >
      <A11y label={label} />
      <Lights dark={colors.dark} />
      <Rig category={props.category} apiRef={props.apiRef} activity={activity} reduced={reduced} groupRef={rigGroup}>
        <Podium category={props.category} colors={colors} reduced={reduced} activity={activity} />
        <Player {...rest} reduced={reduced} activity={activity} />
      </Rig>
      <Ground dark={colors.dark} />
      <Driver activity={activity} />
    </Canvas>
  );
}
