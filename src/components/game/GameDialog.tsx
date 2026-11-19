"use client";
/**
 * Игра в полноэкранном диалоге (нативный <dialog>: фокус остаётся внутри, Esc закрывает). Подгружается лениво,
 * вместе с тяжёлым 3D-кодом, только после «Играть». Сцена и ввод — GameScene/Session, здесь интерфейс вокруг.
 */
import { Component, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/controls";
import { AlertIcon, CloseIcon } from "@/components/ui/icons";
import type { CharacterKey } from "@/lib/catalog";
import type { BonusCodePublic } from "@/lib/order-types";
import { CHARACTER_NAME } from "@/lib/phrases";
import type { RigApi } from "@/components/stage/rig";
import { claimBonus } from "./api";
import { BonusCard } from "./BonusCard";
import GameScene, { type ScenePhase } from "./GameScene";
import type { Mode } from "./session";

export type GameDialogProps = {
  token: string;
  gameMode: "play" | "bonus";
  /** Персонаж и цвет подиума: из снимка заявки. */
  character: CharacterKey;
  color: string;
  /** Уже выданный по этой заявке код (повторная игра нового не даёт). */
  bonus: BonusCodePublic | null;
  facesEnabled: boolean;
  onBonus: (bonus: BonusCodePublic) => void;
  onClose: () => void;
};

const HINT: Record<Mode, string> = {
  clean: "Водите пальцем или мышью по пятнам — они стираются.",
  rotate: "Перетащите, чтобы повернуть предмет и найти пятна с другой стороны. В этом режиме ничего не стирается.",
};
/** Если canvas не создался (нет WebGL2, потеряно устройство), игра показывает ошибку, а не роняет страницу. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const MODES: { id: Mode; label: string }[] = [
  { id: "clean", label: "Чистка" },
  { id: "rotate", label: "Поворот" },
];

export default function GameDialog({ token, gameMode, character, color, bonus, facesEnabled, onBonus, onClose }: GameDialogProps) {
  const titleId = useId();
  const hintId = useId();
  const progressId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const apiRef = useRef<RigApi | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const bonusRef = useRef(bonus);

  const [hadBonus, setHadBonus] = useState(() => !!bonus); // код уже был выдан до текущей партии
  const [mode, setMode] = useState<Mode>("clean");
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<ScenePhase>("loading");
  const [round, setRound] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [boundaryKey, setBoundaryKey] = useState(0);
  const [done, setDone] = useState(false);
  const [claim, setClaim] = useState<{ state: "idle" | "pending" | "error"; message?: string }>({ state: "idle" });

  useEffect(() => {
    bonusRef.current = bonus;
  });

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // Страница под диалогом не должна прокручиваться (колесо и «резинка» на телефоне).
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, []);

  async function runClaim() {
    setClaim({ state: "pending" });
    const res = await claimBonus(token);
    if (res.ok) {
      onBonus(res.bonus);
      setClaim({ state: "idle" });
    } else {
      setClaim({ state: "error", message: res.message });
    }
  }

  function handleDone() {
    setDone(true);
    if (gameMode === "bonus" && !bonusRef.current) void runClaim();
  }

  function again() {
    setHadBonus(!!bonusRef.current);
    setRound((r) => r + 1);
    setPercent(0);
    setDone(false);
    setClaim({ state: "idle" });
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const api = apiRef.current;
    if (!api || e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case "ArrowLeft":
        api.rotate(-0.26, 0);
        break;
      case "ArrowRight":
        api.rotate(0.26, 0);
        break;
      case "ArrowUp":
        api.rotate(0, 0.08);
        break;
      case "ArrowDown":
        api.rotate(0, -0.08);
        break;
      case "Home":
        api.reset();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const name = CHARACTER_NAME[character];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={hintId}
      onClose={onClose}
      data-testid="game-dialog"
      className="m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 id={titleId} className="text-[1.25rem] font-semibold">
            Отмойте персонажа
          </h2>
          <IconButton label="Закрыть игру" data-testid="game-close" onClick={() => dialogRef.current?.close()}>
            <CloseIcon />
          </IconButton>
        </header>

        <div
          role="group"
          aria-label="Игровое поле: 3D-предмет"
          tabIndex={0}
          onKeyDown={onKeyDown}
          data-testid="game-stage"
          data-phase={phase}
          className="relative min-h-[14rem] flex-1 select-none overflow-hidden bg-surface-2 outline-offset-[-3px]"
        >
          <SceneBoundary key={boundaryKey} onError={() => setPhase("error")}>
            <GameScene
              character={character}
              color={color}
              facesEnabled={facesEnabled}
              mode={mode}
              round={round}
              retryToken={retryToken}
              label={`3D-персонаж: ${name}. Предмет покрыт ржавчиной и налётом. Игра рассчитана на касание и мышь.`}
              apiRef={apiRef}
              ringRef={ringRef}
              onPhase={setPhase}
              onProgress={setPercent}
              onDone={handleDone}
            />
          </SceneBoundary>
          <div
            ref={ringRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-10 rounded-full border-2 border-accent bg-accent/10 opacity-0"
          />
          {phase === "loading" && (
            <div role="status" className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
              <span className="sr-only">Загрузка 3D</span>
              <span aria-hidden className="block size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
            </div>
          )}
          {phase === "error" && (
            <div role="alert" className="absolute inset-0 z-20 grid place-content-center justify-items-center gap-3 bg-surface-2 p-6 text-center">
              <p>Не удалось загрузить 3D. Заказ от этого не зависит.</p>
              <Button
                onClick={() => {
                  setPhase("loading");
                  setRetryToken((t) => t + 1);
                  setBoundaryKey((k) => k + 1);
                }}
              >
                Повторить
              </Button>
            </div>
          )}
        </div>

        <div className="max-h-[58dvh] overflow-y-auto border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {!done ? (
            <div className="mx-auto grid w-full max-w-xl gap-2">
              <div role="group" aria-label="Режим" className="grid grid-cols-2 gap-1 rounded-field border border-line bg-surface-2 p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={mode === m.id}
                    data-testid={`mode-${m.id}`}
                    onClick={() => setMode(m.id)}
                    className="min-h-12 cursor-pointer rounded-[10px] px-3 text-base font-medium transition-colors aria-pressed:bg-accent aria-pressed:text-accent-ink"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p id={hintId} className="min-h-[2.9em] text-[0.9375rem] leading-snug text-muted" data-testid="game-hint">
                {HINT[mode]}
              </p>
              <div>
                <div className="flex items-baseline justify-between text-[0.9375rem]">
                  <span id={progressId}>Очищено</span>
                  <span className="font-medium tabular-nums" data-testid="game-percent">
                    {percent}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-labelledby={progressId}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-valuetext={`${percent}%`}
                  className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line"
                >
                  <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto grid w-full max-w-xl gap-3" data-testid="game-result">
              <p id={hintId} role="status" className="text-[1.25rem] font-semibold leading-tight">
                {gameMode === "bonus" && bonus ? (hadBonus ? "Предмет чистый. Код по этой заявке уже выдан." : "Предмет чистый — вот ваш код") : "Предмет чистый"}
              </p>
              {gameMode === "play" && (
                <p className="text-[0.9375rem] leading-snug text-muted">Спасибо за игру. Это просто так: скидки нет, цена заказа не меняется.</p>
              )}
              {gameMode === "bonus" && bonus && <BonusCard bonus={bonus} />}
              {gameMode === "bonus" && !bonus && claim.state === "pending" && (
                <p role="status" className="text-[0.9375rem] text-muted">
                  Получаем бонусный код…
                </p>
              )}
              {gameMode === "bonus" && !bonus && claim.state === "error" && (
                <div role="alert" className="flex items-start gap-3 rounded-field border border-danger p-3 text-[0.9375rem] leading-snug">
                  <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
                  <div className="grid gap-2">
                    <p>{claim.message}</p>
                    <div>
                      <Button variant="secondary" onClick={() => void runClaim()} data-testid="claim-retry">
                        Повторить
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={again} data-testid="game-again">
                  Сыграть ещё
                </Button>
                <Button onClick={() => dialogRef.current?.close()} data-testid="game-done-close">
                  Закрыть
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
