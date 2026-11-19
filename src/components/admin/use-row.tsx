"use client";

import { useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/admin/schemas";
import { Icon } from "./Icon";
import { iconButton } from "./ui";
import { useSave } from "./use-save";

const call = (fn: () => Promise<ActionResult>) => fn();

/** Быстрые действия в строке списка (порядок, скрыть, удалить): ожидание и результат одним хуком. `run(() => action(...))`. */
export function useQuickAction() {
  return useSave(call);
}

/**
 * Кнопки «выше» и «ниже». После перестановки строка меняет место в списке, и браузер может потерять фокус: возвращаем его на ту
 * же кнопку, чтобы с клавиатуры можно было нажимать подряд. Крайняя позиция не отключает кнопку (aria-disabled), иначе фокус
 * ушёл бы со страницы.
 */
export function MoveButtons({
  name,
  isFirst,
  isLast,
  pending,
  onMove,
}: {
  /** Название для скринридера: «Выше: Мебель». */
  name: string;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  const refs = { up: useRef<HTMLButtonElement>(null), down: useRef<HTMLButtonElement>(null) };
  const want = useRef<{ dir: "up" | "down"; until: number } | null>(null);

  useEffect(() => {
    const w = want.current;
    if (!w) return;
    if (Date.now() > w.until) {
      want.current = null;
      return;
    }
    const el = refs[w.dir].current;
    if (el && (document.activeElement === document.body || !document.activeElement)) el.focus();
  });

  const button = (dir: "up" | "down") => {
    const edge = dir === "up" ? isFirst : isLast;
    const label = `${dir === "up" ? "Выше" : "Ниже"}: ${name}`;
    return (
      <button
        key={dir}
        ref={refs[dir]}
        type="button"
        aria-label={label}
        title={label}
        aria-disabled={edge || pending ? true : undefined}
        onClick={() => {
          if (edge || pending) return;
          want.current = { dir, until: Date.now() + 3000 };
          onMove(dir);
        }}
        className={iconButton(edge || pending ? "opacity-50" : undefined)}
      >
        <Icon name={dir} />
      </button>
    );
  };

  return (
    <span role="group" aria-label={`Порядок: ${name}`} className="inline-flex gap-2">
      {button("up")}
      {button("down")}
    </span>
  );
}
