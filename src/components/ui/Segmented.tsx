"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";

/**
 * Сегментированный переключатель: настоящие radio (стрелки и фокус работают из коробки), выбранный сегмент — плашка,
 * которая переезжает пружиной (stiffness 380, damping 34, как остальное движение интерфейса). При reduced motion — сразу.
 */
export function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  className = "",
}: {
  name: string;
  legend: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const group = useId();
  const reduce = useReducedMotion();
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-field border border-line bg-surface-2 p-1">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label key={o.value} className="relative cursor-pointer">
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="peer sr-only" />
              {checked && (
                <motion.span
                  layoutId={`segmented-${group}`}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
                  className="absolute inset-0 rounded-[10px] bg-accent"
                />
              )}
              <span className="relative flex min-h-12 items-center justify-center rounded-[10px] px-3 text-center font-medium transition-colors peer-checked:text-accent-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
