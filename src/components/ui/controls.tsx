import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { CheckIcon } from "./icons";

/** Базовые элементы: кнопки ≥ 48 px, поля ≥ 48 px, подписи и ошибки привязаны через aria-describedby. */

const press = "transition-[transform,background-color,border-color,opacity] duration-150 active:scale-[0.98] motion-reduce:active:scale-100";
const variants = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "border border-line bg-surface text-danger hover:bg-surface-2",
} as const;
type Variant = keyof typeof variants;

export const buttonClass = (variant: Variant = "primary", extra = "") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-field px-5 text-base font-medium ${press} disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${extra}`;

export function Button({ variant = "primary", className = "", type = "button", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...p} />;
}

export function ButtonLink({ variant = "primary", className = "", ...p }: React.ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...p} />;
}

export function AnchorButton({ variant = "secondary", className = "", ...p }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a className={buttonClass(variant, className)} {...p} />;
}

/** Кнопка-иконка 48×48 (зона касания ≥ 44). `label` обязателен: иконка без текста недоступна. */
export function IconButton({ label, className = "", children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-grid size-12 shrink-0 place-items-center rounded-full text-ink ${press} hover:bg-surface-2 ${className}`}
      {...p}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-field border border-line bg-surface px-4 py-2.5 text-base text-ink placeholder:text-muted/70 aria-[invalid=true]:border-danger disabled:opacity-60";

interface ShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

/** Подпись сверху, подсказка, поле, ошибка рядом с полем (живая область: ошибка озвучивается при появлении). */
export function FieldShell({ id, label, hint, error, optional, children }: ShellProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[0.9375rem] font-medium">
        {label}
        {optional && <span className="ml-2 font-normal text-muted">необязательно</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-[0.8125rem] leading-snug text-muted">
          {hint}
        </p>
      )}
      {children}
      <div aria-live="polite">
        {error && (
          <p id={`${id}-err`} className="text-[0.875rem] leading-snug text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

const describe = (id: string, hint: unknown, error?: string) => [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;

type FieldBase = { id: string; label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean };

export function TextField({ id, label, hint, error, optional, className = "", ...p }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input id={id} name={id.replace(/^f-/, "")} data-field={id.replace(/^f-/, "")} aria-invalid={!!error} aria-describedby={describe(id, hint, error)} className={`${inputClass} ${className}`} {...p} />
    </FieldShell>
  );
}

export function TextArea({ id, label, hint, error, optional, className = "", ...p }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        id={id}
        name={id.replace(/^f-/, "")}
        data-field={id.replace(/^f-/, "")}
        aria-invalid={!!error}
        aria-describedby={describe(id, hint, error)}
        className={`${inputClass} min-h-28 resize-y leading-normal ${className}`}
        {...p}
      />
    </FieldShell>
  );
}

/** Флажок на всю ширину строки: зона касания — вся плашка (≥ 48 px). */
export function CheckRow({
  title,
  description,
  badge,
  className = "",
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "title"> & { title: ReactNode; description?: ReactNode; badge?: ReactNode }) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-field border border-line bg-surface px-4 py-3 transition-colors has-[:checked]:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${className}`}
    >
      <span className="relative mt-0.5 grid size-6 shrink-0 place-items-center">
        <input type="checkbox" className="peer absolute inset-0 size-6 cursor-pointer appearance-none rounded-md border-2 border-muted bg-surface checked:border-accent checked:bg-accent aria-[invalid=true]:border-danger" {...p} />
        <CheckIcon className="pointer-events-none relative size-4 text-accent-ink opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{title}</span>
          {badge && <span className="text-[0.9375rem] tabular-nums text-muted">{badge}</span>}
        </span>
        {description && <span className="mt-0.5 block text-[0.875rem] leading-snug text-muted">{description}</span>}
      </span>
    </label>
  );
}

/** Плашка с пояснением или сообщением об ошибке. */
export function Callout({ tone = "info", children, className = "", ...p }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const tones = {
    info: "border-line bg-surface-2",
    warn: "border-ply bg-surface-2",
    error: "border-danger bg-surface",
    ok: "border-ok bg-surface",
  } as const;
  return (
    <div className={`rounded-field border px-4 py-3 text-[0.9375rem] leading-snug ${tones[tone]} ${className}`} {...p}>
      {children}
    </div>
  );
}
