"use client";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { IconButton } from "./controls";
import { clearToasts } from "@/lib/toast";
import { ToastHost } from "./Toasts";

const SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;
const DESKTOP = "(min-width: 900px)";

/** true на экранах ≥ 900 px (там лист выезжает справа, а не снизу). На сервере — false. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Липкая нижняя панель действий. */
  footer?: ReactNode;
}

/**
 * Модальный лист: снизу на телефоне (закрывается свайпом за шапку), панель справа на ≥ 900 px.
 * Основа — нативный <dialog>.showModal(): фокус удерживается внутри, Esc закрывает, фон недоступен.
 * Выход анимируется (AnimatePresence), фокус возвращается на кнопку, которая открыла лист.
 */
export function Sheet({ open, onClose, ...rest }: SheetProps) {
  return <AnimatePresence>{open ? <Panel key="panel" onClose={onClose} {...rest} /> : null}</AnimatePresence>;
}

function Panel({ onClose, title, children, footer }: Omit<SheetProps, "open">) {
  const ref = useRef<HTMLDialogElement>(null);
  const controls = useDragControls();
  const desktop = useDesktop();
  const reduce = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    clearToasts(); // старые уведомления не должны оказаться поверх кнопок только что открытого листа
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const hidden = reduce ? { opacity: 0 } : desktop ? { x: "100%" } : { y: "100%" };
  const shown = reduce ? { opacity: 1 } : desktop ? { x: 0 } : { y: 0 };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        initial={hidden}
        animate={shown}
        exit={hidden}
        transition={reduce ? { duration: 0.15 } : SPRING}
        drag={desktop || reduce ? false : "y"}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) onClose();
        }}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[22px] border border-b-0 border-line bg-surface min-[900px]:inset-x-auto min-[900px]:top-0 min-[900px]:right-0 min-[900px]:h-full min-[900px]:max-h-none min-[900px]:w-[440px] min-[900px]:rounded-l-[22px] min-[900px]:rounded-tr-none min-[900px]:border-b min-[900px]:border-r-0"
      >
        <div className="shrink-0 touch-none select-none" onPointerDown={(e) => !desktop && controls.start(e)}>
          <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line min-[900px]:hidden" />
          <div className="flex items-center justify-between gap-3 py-1 pl-5 pr-2">
            <h2 id={titleId} className="py-2 text-[1.25rem] font-semibold">
              {title}
            </h2>
            <IconButton label="Закрыть" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
              <CloseIcon />
            </IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {/* тосты листа: нулевой высоты, у нижней кромки области прокрутки, прямо над панелью действий */}
        <div className="relative h-0">
          <ToastHost where="sheet" />
        </div>
        {footer && <div className="shrink-0 border-t border-line bg-surface px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </motion.div>
    </dialog>
  );
}
