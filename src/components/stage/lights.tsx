"use client";
/* eslint-disable react-hooks/immutability -- R3F: объекты three мутируются императивно из эффектов, это норма для рендера без перерисовок React */
/** Свет и окружение сцены: один и тот же для витрины (scene.tsx) и игры (game/GameScene.tsx). */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";

export function Lights({ dark }: { dark: boolean }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.environmentIntensity = dark ? 0.55 : 0.75;
  }, [scene, dark]);
  return (
    <>
      <hemisphereLight args={["#ffffff", dark ? "#3a3f3b" : "#9aa097", dark ? 0.25 : 0.4]} />
      {/* Ключ: сверху-слева-спереди, отбрасывает тень. */}
      <directionalLight
        position={[-1.8, 5, 2.4]}
        intensity={dark ? 2.1 : 2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2.4}
        shadow-camera-right={2.4}
        shadow-camera-top={2.6}
        shadow-camera-bottom={-2.4}
        shadow-camera-near={1}
        shadow-camera-far={12}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={3}
      />
      {/* Заполняющий справа, холоднее; контровой сзади. */}
      <directionalLight position={[3.6, 2.2, 3]} intensity={0.7} color="#dfe8ff" />
      <directionalLight position={[1.4, 3.6, -4]} intensity={1.1} color="#fff6ea" />
      {/* Локальное окружение из софтбоксов: ни сети, ни HDRI-файлов. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 1]} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={2} color="#fff4e6" position={[-5, 2, 4]} scale={[4, 5, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#dfe9ff" position={[5, 1.5, 2]} scale={[3, 4, 1]} />
        <Lightformer form="ring" intensity={1.5} position={[0, 2, -5]} scale={4} />
      </Environment>
    </>
  );
}
