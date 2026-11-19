"use client";
import { useSyncExternalStore } from "react";
import { GameOffer } from "@/components/game/GameOffer";

const MODES = ["off", "play", "bonus"] as const;
const noop = () => () => {};

export function GameDev() {
  const search = useSyncExternalStore(noop, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const asked = params.get("mode");
  const mode = MODES.find((m) => m === asked) ?? "bonus";
  const faces = params.get("faces") !== "0";

  return (
    <main className="mx-auto grid max-w-[720px] gap-4 p-4">
      <h1 className="text-xl font-semibold">Стенд игры (dev)</h1>
      <p className="break-all text-muted">
        token: {token || "— не задан, добавьте ?token=…"}; mode: {mode}
      </p>
      {token && <GameOffer token={token} mode={mode} facesEnabled={faces} />}
    </main>
  );
}
