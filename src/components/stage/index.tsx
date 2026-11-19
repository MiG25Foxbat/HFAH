"use client";
/**
 * Stage — 3D-персонаж категории на подиуме-рулетке. Контракт: <Stage category categories characters className /> .
 * Высоту и ширину задаёт родитель. Сама 3D-сцена (three, R3F) грузится лениво, только если есть WebGL;
 * до этого, при ошибке и без WebGL показывается постер. Заказ от 3D не зависит.
 */
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import type { CharacterKey } from "@/lib/catalog";
import type { Settings } from "@/lib/settings";
import { CHARACTER_NAME, pickPhrase } from "@/lib/phrases";
import type { RigApi } from "./rig";
import type { Phase } from "./showcase";
import type { StageCategory } from "./types";

export type { StageCategory } from "./types";

const StageScene = dynamic(() => import("./scene"), { ssr: false });

export type StageProps = {
  /** Выбранная категория: персонаж и цвет ободка подиума. */
  category: StageCategory;
  /** Все видимые категории по порядку: по их числу делится кольцо подиума. */
  categories: readonly StageCategory[];
  characters: Settings["characters"];
  className?: string;
};

const posterUrl = (character: CharacterKey) => `/posters/${character}.webp`;
const BUBBLE_MS = 6000;

// --- среда ---------------------------------------------------------------------------------------

let webglProbe: boolean | undefined;
function hasWebGL(): boolean {
  if (webglProbe !== undefined) return webglProbe;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    webglProbe = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // пробный контекст не держим
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}
const noopSubscribe = () => () => {};

function subscribeHidden(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** Включить флаг после задержки: быстрые загрузки не мигают индикатором. */
function useDelayed(on: boolean, ms: number) {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setV(true), ms);
    return () => {
      clearTimeout(t);
      setV(false);
    };
  }, [on, ms]);
  return on && v;
}

// --- ошибки canvas ---------------------------------------------------------------------------------

class StageBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// --- постер ----------------------------------------------------------------------------------------

/** Постер из Blender; если файла нет — спокойная CSS-заглушка в цвете категории. */
function Poster({ character, color, decorative }: { character: CharacterKey; color: string; decorative: boolean }) {
  const [failed, setFailed] = useState<CharacterKey | null>(null);
  if (failed === character) {
    const c = color;
    return (
      <div
        aria-hidden
        className="relative aspect-square w-[min(70%,17rem)] rounded-full border-2 border-ply"
        style={{ background: `color-mix(in srgb, ${c} 22%, transparent)` }}
      >
        <div
          className="absolute inset-[6%] rounded-full opacity-70"
          style={{
            background: "repeating-conic-gradient(var(--ply) 0 1deg, transparent 1deg 6deg)",
            mask: "radial-gradient(farthest-side, transparent 82%, #000 84%)",
            WebkitMask: "radial-gradient(farthest-side, transparent 82%, #000 84%)",
          }}
        />
        <div className="absolute inset-[34%] rounded-full" style={{ background: c }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- постер маленький, уже оптимизирован в Blender; оптимизатор Next не нужен
    <img
      src={posterUrl(character)}
      alt={decorative ? "" : `Персонаж: ${CHARACTER_NAME[character]}`}
      width={1024}
      height={1024}
      decoding="async"
      fetchPriority="high"
      draggable={false}
      className="h-full w-full object-contain"
      onError={() => setFailed(character)}
    />
  );
}

const ResetIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

// --- Stage -----------------------------------------------------------------------------------------

export function Stage({ category, categories, characters, className }: StageProps) {
  const character = category.character;
  const webgl = useSyncExternalStore(noopSubscribe, hasWebGL, () => null);
  const hidden = useSyncExternalStore(subscribeHidden, () => document.hidden, () => false);
  const hintId = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<RigApi | null>(null);

  const [inView, setInView] = useState(true);
  const [status, setStatus] = useState<{ phase: Phase; character: CharacterKey }>({ phase: "loading", character });
  const [everReady, setEverReady] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [boundaryKey, setBoundaryKey] = useState(0);
  const [crash, setCrash] = useState<Error | null>(null);

  // Реплика: новая на каждую смену категории; seed меняем прямо при рендере (допустимый шаблон «состояние от пропса»).
  const [seed, setSeed] = useState(0);
  const [seenCategory, setSeenCategory] = useState(category.id);
  if (seenCategory !== category.id) {
    setSeenCategory(category.id);
    setSeed((s) => s + 1);
  }
  const [dismissed, setDismissed] = useState("");

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const handlePhase = useCallback((phase: Phase, c: CharacterKey) => {
    setStatus({ phase, character: c });
    if (phase === "ready") setEverReady(true);
  }, []);

  const phase: Phase = status.character === character ? status.phase : "loading";
  const unavailableByGl = webgl === false || (crash !== null && /webgl/i.test(crash.message));
  const failed = !unavailableByGl && (phase === "error" || crash !== null);
  const live = webgl === true && !unavailableByGl && !failed;
  const interactive = live && everReady;
  const showSpinner = useDelayed(live && phase === "loading", 300);

  const phraseKey = `${category.id}:${seed}`;
  const text = pickPhrase(character, characters.personality, seed);
  const bubbleShown = interactive && phase === "ready" && characters.phrasesEnabled && dismissed !== phraseKey;
  useEffect(() => {
    if (!bubbleShown) return;
    const t = setTimeout(() => setDismissed(phraseKey), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [bubbleShown, phraseKey]);

  // Постеры остальных категорий греем после первого показа, чтобы переключение было мгновенным и без WebGL.
  useEffect(() => {
    if (!everReady) return;
    for (const c of new Set(categories.map((x) => x.character))) new Image().src = posterUrl(c);
  }, [everReady, categories]);

  const retry = () => {
    setStatus({ phase: "loading", character });
    setRetryToken((t) => t + 1);
    if (crash) {
      setCrash(null);
      setEverReady(false);
      setBoundaryKey((k) => k + 1);
    }
  };

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
  const posterShown = !everReady || !live;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Просмотр 3D-персонажа"
      aria-describedby={hintId}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={onKeyDown}
      data-stage={character}
      data-stage-state={unavailableByGl ? "no-webgl" : failed ? "error" : interactive ? "ready" : "loading"}
      style={{ touchAction: "pan-y pinch-zoom", WebkitTouchCallout: "none" }}
      className={`relative isolate select-none overflow-hidden rounded-[var(--radius-panel)] bg-surface-2 outline-offset-[-3px] ${
        interactive ? "cursor-grab active:cursor-grabbing" : ""
      } ${className ?? "h-full"}`}
    >
      <span id={hintId} className="sr-only">
        Перетащите, чтобы повернуть. Стрелки на клавиатуре вращают персонажа, Home возвращает исходный ракурс.
      </span>

      {/* Постер: пока грузится сцена, при ошибке и без WebGL. Внизу оставляем место под сообщение. */}
      <div
        className={`absolute inset-0 p-3 transition-opacity duration-300 ${posterShown ? "opacity-100" : "pointer-events-none opacity-0"} ${
          failed ? "z-[5] bg-surface-2 pb-28" : !live ? "pb-20" : ""
        }`}
        aria-hidden={posterShown ? undefined : true}
      >
        <div className="flex h-full w-full items-center justify-center">
          <Poster character={character} color={category.color} decorative={live} />
        </div>
      </div>

      {webgl === true && !unavailableByGl && (
        <div className="absolute inset-0">
          <StageBoundary key={boundaryKey} onError={setCrash}>
            <StageScene
              category={category}
              categories={categories}
              characters={characters}
              active={inView && !hidden}
              retryToken={retryToken}
              label={`3D-персонаж: ${name}. Перетащите, чтобы повернуть.`}
              apiRef={apiRef}
              bubbleRef={bubbleRef}
              onPhase={handlePhase}
            />
          </StageBoundary>
        </div>
      )}

      {/* Реплика: позицию задаёт сцена по проекции головы; текст дублируется в aria-live. */}
      <div
        ref={bubbleRef}
        aria-hidden
        data-fit="0"
        className="group pointer-events-none absolute left-0 top-0 z-10 w-max max-w-[min(17rem,calc(100%-20px))] data-[fit=0]:invisible"
      >
        <div
          data-show={bubbleShown ? "1" : "0"}
          className="relative origin-bottom translate-y-1.5 scale-[0.97] rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] leading-snug text-ink opacity-0 transition-[opacity,transform] duration-200 ease-out after:absolute after:left-[var(--tail-x,50%)] after:top-full after:-mt-[6px] after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-b after:border-r after:border-line after:bg-surface data-[show=1]:translate-y-0 data-[show=1]:scale-100 data-[show=1]:opacity-100"
        >
          {everReady ? text : ""}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {bubbleShown ? text : ""}
      </p>

      {interactive && (
        <button
          type="button"
          aria-label="Сбросить ракурс"
          title="Сбросить ракурс"
          onClick={() => apiRef.current?.reset()}
          className="absolute bottom-3 right-3 z-20 grid size-11 cursor-pointer place-items-center rounded-full border border-line bg-surface/85 text-ink backdrop-blur transition-transform active:scale-95"
        >
          <ResetIcon />
        </button>
      )}

      {showSpinner && (
        <div role="status" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          <span className="sr-only">Загрузка 3D</span>
          <span aria-hidden className="block size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      )}

      {unavailableByGl && (
        <p role="status" className="absolute inset-x-4 bottom-4 z-20 text-center text-[0.9375rem] leading-snug text-muted">
          3D недоступно на этом устройстве — заказ работает как обычно
        </p>
      )}

      {failed && (
        <div className="absolute inset-x-4 bottom-4 z-20 flex flex-col items-center gap-3 text-center" role="alert">
          <p className="text-[0.9375rem] leading-snug text-ink">Не удалось загрузить 3D</p>
          <button
            type="button"
            onClick={retry}
            className="h-12 cursor-pointer rounded-[var(--radius-field)] bg-accent px-6 font-medium text-accent-ink transition-transform active:scale-[0.98]"
          >
            Повторить
          </button>
        </div>
      )}
    </div>
  );
}
