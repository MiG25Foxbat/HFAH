"use client";
/**
 * Предложение сыграть на странице заявки: спокойная карточка после состава заявки. Игра необязательна и заказ
 * не трогает: цена не меняется, код бонуса владелец применяет вручную. Сама игра (three, R3F) — отдельный чанк,
 * он грузится только после «Играть».
 */
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/controls";
import type { CategoryId } from "@/lib/catalog";
import type { BonusCodePublic } from "@/lib/order-types";
import type { GameSettings } from "@/lib/settings";
import { formatRub } from "@/lib/pricing";
import { fetchOrder } from "./api";
import { BonusCard } from "./BonusCard";
import { orderCategory } from "./category";

const GameDialog = dynamic(() => import("./GameDialog"), {
  ssr: false,
  loading: () => (
    <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-bg/80">
      <span className="sr-only">Загрузка игры</span>
      <span aria-hidden className="block size-7 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  ),
});

type Info = { category: CategoryId; bonus: BonusCodePublic | null; game: GameSettings | null };

// --- «Не сейчас»: запоминаем в localStorage по токену; если хранилища нет — хотя бы до перезагрузки ----------

const hiddenInMemory = new Set<string>();
const listeners = new Set<() => void>();
const storeKey = (token: string) => `zaprosto:game-hidden:${token}`;

function isHidden(token: string): boolean {
  if (hiddenInMemory.has(token)) return true;
  try {
    return localStorage.getItem(storeKey(token)) === "1";
  } catch {
    return false;
  }
}
function hide(token: string) {
  hiddenInMemory.add(token);
  try {
    localStorage.setItem(storeKey(token), "1");
  } catch {
    /* приватный режим: останется только до перезагрузки */
  }
  listeners.forEach((l) => l());
}
function subscribeHidden(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// --- WebGL ---------------------------------------------------------------------------------------

let webglProbe: boolean | undefined;
function hasWebGL(): boolean {
  if (webglProbe !== undefined) return webglProbe;
  try {
    const gl = document.createElement("canvas").getContext("webgl2"); // three 0.187 работает только на WebGL 2
    webglProbe = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // пробный контекст не держим
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}
const noopSubscribe = () => () => {};

const daysWord = (n: number) => {
  const m100 = n % 100;
  const m10 = n % 10;
  return m100 >= 11 && m100 <= 14 ? "дней" : m10 === 1 ? "день" : m10 >= 2 && m10 <= 4 ? "дня" : "дней";
};

export function GameOffer({ token, mode, facesEnabled = true }: { token: string; mode: "off" | "play" | "bonus"; facesEnabled?: boolean }) {
  const titleId = useId();
  const playRef = useRef<HTMLButtonElement>(null);
  const hidden = useSyncExternalStore(subscribeHidden, () => isHidden(token), () => null);
  const webgl = useSyncExternalStore(noopSubscribe, hasWebGL, () => null);
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (mode === "off") return;
    const ac = new AbortController();
    void fetchOrder(token, ac.signal).then((order) => {
      if (ac.signal.aborted) return;
      setInfo(order ? { category: orderCategory(order.lines), bonus: order.bonus, game: order.game } : { category: "other", bonus: null, game: null });
    });
    return () => ac.abort();
  }, [token, mode]);

  if (mode === "off" || info === null || hidden === null) return null;
  const { bonus, game } = info;
  if (hidden && !bonus) return null; // «Не сейчас»; уже выданный код остаётся на виду

  const close = () => {
    setOpen(false);
    // После выдачи кода карточка меняется, и прежняя кнопка пропадает: возвращаем фокус на новую.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body || !document.activeElement) playRef.current?.focus();
    });
  };

  const bonusLine = game
    ? `В конце — бонус ${formatRub(game.bonusAmount)} на следующий заказ от ${formatRub(game.minNextOrder)}, действует ${game.validDays} ${daysWord(game.validDays)}. Применяется вручную после проверки.`
    : "В конце — бонус на следующий заказ. Применяется вручную после проверки.";

  return (
    <section aria-labelledby={titleId} className="grid gap-3 rounded-panel border border-line bg-surface p-5" data-testid="game-offer">
      <h2 id={titleId} className="text-[1.25rem] font-semibold">
        {bonus ? "Ваш бонус за игру" : "Пока ждёте звонка — отмойте персонажа"}
      </h2>

      {bonus ? (
        <>
          <BonusCard bonus={bonus} />
          <p className="max-w-prose text-[0.9375rem] leading-snug text-muted">Можно сыграть ещё раз для удовольствия — новый код за повторную игру не выдаётся.</p>
        </>
      ) : (
        <>
          <p className="max-w-prose text-[0.9375rem] leading-snug">Проведите пальцем по ржавчине и налёту, пока предмет не станет чистым. Игра необязательна.</p>
          <p className="max-w-prose text-[0.9375rem] leading-snug text-muted" data-testid="game-offer-terms">
            {mode === "bonus" ? bonusLine : "Просто так, без скидки."}
          </p>
        </>
      )}

      {webgl === false ? (
        <p role="status" className="max-w-prose text-[0.9375rem] leading-snug text-muted">
          3D недоступно на этом устройстве — игру показать не можем. Заказ работает как обычно.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button ref={playRef} type="button" className={buttonClass(bonus ? "secondary" : "primary")} onClick={() => setOpen(true)} data-testid="game-play">
            {bonus ? "Сыграть ещё раз" : "Играть"}
          </button>
          {!bonus && (
            <button type="button" className={buttonClass("ghost")} onClick={() => hide(token)} data-testid="game-hide">
              Не сейчас
            </button>
          )}
        </div>
      )}

      {open && (
        <GameDialog
          token={token}
          gameMode={mode}
          category={info.category}
          bonus={bonus}
          facesEnabled={facesEnabled}
          onBonus={(b) => setInfo((i) => (i ? { ...i, bonus: b } : i))}
          onClose={close}
        />
      )}
    </section>
  );
}
