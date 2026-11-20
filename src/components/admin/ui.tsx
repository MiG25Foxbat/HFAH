/** Общие элементы кабинета: кнопки, панели, значки, сообщение о сохранении. Цвета — только токены из globals.css. */
import type { ReactNode } from "react";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-types";
import type { ActionResult } from "@/lib/admin/schemas";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const BUTTON_BASE =
  "inline-flex touch-manipulation items-center justify-center gap-2 rounded-field text-[0.9375rem] font-medium transition-colors cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_VARIANT = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  danger: "border border-danger text-danger hover:bg-surface-2",
  dangerSolid: "bg-danger text-bg hover:brightness-110",
  quiet: "text-ink hover:bg-surface-2",
} as const;

/** Классы кнопки или ссылки-кнопки. Высота ≥ 48 px; «sm» — не ниже 44 px (зона касания). */
export function button(variant: keyof typeof BUTTON_VARIANT = "secondary", size: "md" | "sm" = "md", extra?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], size === "md" ? "min-h-12 px-5" : "min-h-11 px-4", extra);
}

/** Квадратная кнопка только со значком: зона касания 44×44. Подпись обязательна (aria-label). */
export function iconButton(extra?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANT.secondary, "size-11 shrink-0", extra);
}

export const inputClass =
  "block w-full min-h-12 scroll-mt-36 min-[900px]:scroll-mt-6 rounded-field border border-line bg-bg px-3.5 py-2.5 text-base text-ink placeholder:text-muted aria-[invalid=true]:border-danger disabled:opacity-60";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
  tone,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "warn";
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cx(
        "rounded-panel border bg-surface p-4 min-[900px]:p-6",
        tone === "warn" ? "border-danger" : "border-line",
        className,
      )}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="wrap-anywhere text-balance text-[1.25rem] font-semibold leading-tight">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 max-w-prose text-[0.9375rem] text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, lead, leadClass, actions }: { title: ReactNode; lead?: ReactNode; leadClass?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-balance text-[1.625rem] font-semibold leading-tight">{title}</h1>
        {lead && <p className={cx("mt-1.5 max-w-prose text-[0.9375rem] text-muted", leadClass)}>{lead}</p>}
      </div>
      {actions}
    </div>
  );
}

const STATUS_STYLE: Record<OrderStatus, { box: string; dot: string }> = {
  new: { box: "bg-accent text-accent-ink", dot: "bg-accent-ink" },
  agreed: { box: "border border-ok text-ok", dot: "bg-ok" },
  done: { box: "bg-surface-2 text-ink", dot: "bg-muted" },
  cancelled: { box: "border border-line text-muted", dot: "bg-line" },
};

/** Статус: цвет, точка и подпись — не только цвет. */
export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      data-status={status}
      className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8125rem] font-medium", s.box, className)}
    >
      <span aria-hidden className={cx("size-1.5 rounded-full", s.dot)} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

/** Небольшая пометка рядом с данными («срочно», «за городом»). */
export function Tag({ children, tone }: { children: ReactNode; tone?: "warn" | "ply" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.8125rem]",
        tone === "warn" ? "border-danger text-danger" : tone === "ply" ? "border-ply text-ink" : "border-line text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Итог сохранения: читается скринридером, ошибка общая (не у поля) показывается здесь же. */
export function FormStatus({ result, pending, className }: { result: ActionResult | null; pending?: boolean; className?: string }) {
  let text = "";
  let tone = "text-ink";
  if (pending) {
    text = "Сохраняем…";
    tone = "text-muted";
  } else if (result?.ok) {
    text = result.message ?? "Сохранено.";
    tone = "text-ok";
  } else if (result && !result.ok) {
    text = result.error ?? (result.fields ? "Проверьте поля, отмеченные ошибкой." : "Не удалось сохранить.");
    tone = "text-danger";
  }
  return (
    <p role="status" aria-live="polite" className={cx("min-h-6 text-[0.9375rem]", tone, className)}>
      {text}
    </p>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cx("size-4 animate-spin", className)} fill="none" stroke="currentColor" strokeWidth="3">
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
