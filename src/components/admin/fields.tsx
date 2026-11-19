"use client";

import { useId, type ComponentProps, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx, inputClass } from "./ui";

interface FieldProps {
  label: ReactNode;
  /** Классы подписи (например, скрыть её визуально на телефоне, оставив для скринридера). */
  labelClass?: string;
  hint?: ReactNode;
  /** Сообщение об ошибке рядом с полем. */
  error?: string;
}

/** Подпись, подсказка и ошибка вокруг поля; связывает их с полем через aria-describedby. */
function Shell({
  id,
  label,
  labelClass,
  hint,
  error,
  className,
  children,
}: FieldProps & { id: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={cx("mb-1.5 block text-[0.9375rem] font-medium", labelClass)}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[0.875rem] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint: unknown, error: unknown) => [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;

export function TextField({
  label,
  labelClass,
  hint,
  error,
  suffix,
  wrapperClass,
  ...input
}: FieldProps & { suffix?: string; wrapperClass?: string } & ComponentProps<"input">) {
  const id = useId();
  return (
    <Shell id={id} label={label} labelClass={labelClass} hint={hint} error={error} className={wrapperClass}>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...input}
          className={cx(inputClass, suffix && "pr-14", input.className)}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted">{suffix}</span>}
      </div>
    </Shell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  wrapperClass,
  ...area
}: FieldProps & { wrapperClass?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={wrapperClass}>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...area}
        className={cx(inputClass, "resize-y leading-normal", area.className)}
      />
    </Shell>
  );
}

export function SelectField({
  label,
  labelClass,
  hint,
  error,
  wrapperClass,
  children,
  ...select
}: FieldProps & { wrapperClass?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} labelClass={labelClass} hint={hint} error={error} className={wrapperClass}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
        className={cx(inputClass, select.className)}
      >
        {children}
      </select>
    </Shell>
  );
}

/** Переключатель «да / нет»: настоящий checkbox, вся строка — зона касания ≥ 44 px. */
export function Check({
  label,
  hint,
  ...input
}: { label: ReactNode; hint?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" {...input} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent" />
      <span>
        <span className="block text-[0.9375rem] font-medium leading-snug">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.8125rem] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
}

/** Выбор одного из нескольких: «cards» — с пояснением, «chips» — короткие подписи в ряд. */
export function OptionGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  layout = "cards",
  error,
  hint,
}: {
  legend: ReactNode;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  layout?: "cards" | "chips";
  error?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={describedBy(id, hint, error)} className="min-w-0">
      <legend className="mb-1.5 text-[0.9375rem] font-medium">{legend}</legend>
      <div className={layout === "chips" ? "flex flex-wrap gap-2" : "grid gap-2"}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "cursor-pointer border transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
              layout === "chips"
                ? "flex min-h-11 items-center rounded-full border-line bg-bg px-4 text-[0.9375rem] has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink"
                : "flex items-start gap-3 rounded-field border-line bg-bg p-3.5 has-[:checked]:border-accent has-[:checked]:bg-surface-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className={layout === "chips" ? "sr-only" : "mt-1 size-4 shrink-0 cursor-pointer accent-accent"}
            />
            <span className="min-w-0">
              <span className={layout === "chips" ? "" : "block font-medium"}>{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-[0.875rem] text-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[0.875rem] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
