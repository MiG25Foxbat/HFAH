"use client";
import { useState } from "react";
import type { Unit } from "@/lib/catalog";
import { QTY_RULES, clampQty, formatQty } from "@/lib/pricing";
import { MinusIcon, PlusIcon } from "./icons";

const UNIT_WORD: Record<Unit, string> = { pcs: "шт", m: "пог. м", m2: "м²", hour: "ч" };

/**
 * Количество: кнопки «−» и «+» (шаг и границы по единице, правила — QTY_RULES) и ввод с клавиатуры.
 * Введённое значение приводится к допустимому при выходе из поля или по Enter.
 */
export function QtyStepper({
  unit,
  value,
  onChange,
  label,
  compact = false,
}: {
  unit: Unit;
  value: number;
  onChange: (qty: number) => void;
  label: string;
  compact?: boolean;
}) {
  const rule = QTY_RULES[unit];
  const [text, setText] = useState<string | null>(null);
  const btn = compact ? "size-11" : "size-12";
  const step = (dir: 1 | -1) => onChange(clampQty(unit, value + dir * rule.step));
  const commit = () => {
    if (text !== null) {
      const n = parseFloat(text.replace(",", "."));
      if (Number.isFinite(n)) onChange(clampQty(unit, n));
    }
    setText(null);
  };
  const atMin = value <= rule.min;
  const atMax = value >= rule.max;
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1">
      <div className="inline-flex items-center rounded-field border border-line bg-surface">
        <button
          type="button"
          aria-label="Уменьшить количество"
          aria-disabled={atMin}
          onClick={() => !atMin && step(-1)}
          className={`${btn} grid place-items-center rounded-l-field transition-colors active:bg-surface-2 aria-disabled:opacity-40`}
        >
          <MinusIcon />
        </button>
        <input
          inputMode="decimal"
          aria-label={`${label}, ${UNIT_WORD[unit]}`}
          value={text ?? formatQty(value)}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className={`${compact ? "h-11 w-14" : "h-12 w-16"} border-x border-line bg-transparent text-center text-base tabular-nums`}
        />
        <button
          type="button"
          aria-label="Увеличить количество"
          aria-disabled={atMax}
          onClick={() => !atMax && step(1)}
          className={`${btn} grid place-items-center rounded-r-field transition-colors active:bg-surface-2 aria-disabled:opacity-40`}
        >
          <PlusIcon />
        </button>
      </div>
      <span className="min-w-8 px-1 text-[0.9375rem] text-muted">{UNIT_WORD[unit]}</span>
    </div>
  );
}
