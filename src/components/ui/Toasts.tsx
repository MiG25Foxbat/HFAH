"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dismissToast, pauseToast, resumeToast, useToasts } from "@/lib/toast";
import { CloseIcon } from "./icons";

const SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;

/**
 * Тосты («Удалено: … — Вернуть»). Две копии: страничная и внутри открытого листа (модальный <dialog> закрывает всё,
 * что вне его, — тост на странице там нельзя было бы нажать). Лишняя копия скрыта CSS (client.css).
 */
export function ToastHost({ where }: { where: "page" | "sheet" }) {
  const toasts = useToasts();
  const reduce = useReducedMotion();
  return (
    <div
      data-toast-host={where}
      role="status"
      aria-live="polite"
      className={`pointer-events-none z-50 flex flex-col items-center gap-2 ${
        where === "sheet" ? "absolute inset-x-0 bottom-2 px-3" : "fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] px-4"
      }`}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.15 } }}
            transition={SPRING}
            onPointerEnter={() => pauseToast(t.id)}
            onPointerLeave={() => resumeToast(t.id)}
            onFocus={() => pauseToast(t.id)}
            onBlur={() => resumeToast(t.id)}
            className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-field bg-ink py-1 pl-4 pr-1 text-bg"
          >
            <p className="min-w-0 flex-1 py-2 text-[0.9375rem] leading-snug">{t.message}</p>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismissToast(t.id);
                }}
                className="min-h-11 shrink-0 rounded-field px-3 text-[0.9375rem] font-semibold underline underline-offset-4 hover:bg-bg/15"
              >
                {t.actionLabel}
              </button>
            )}
            <button type="button" aria-label="Закрыть уведомление" onClick={() => dismissToast(t.id)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-bg/15">
              <CloseIcon className="size-5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
