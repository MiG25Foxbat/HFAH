"use client";
import { useId } from "react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { ContrastIcon } from "@/components/ui/icons";

/** Тема в шапке: кнопка открывает нативный popover с переключателем «Светлая / Тёмная / Как в системе». Esc и клик снаружи закрывают. */
export function ThemeMenu() {
  const id = useId();
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label="Тема оформления"
        className="inline-grid size-12 place-items-center rounded-full transition-colors hover:bg-surface-2"
      >
        <ContrastIcon />
      </button>
      <div id={id} popover="auto" className="fixed inset-auto right-4 top-[calc(var(--header-h)+0.25rem)] m-0 rounded-panel border border-line bg-surface p-2 text-ink">
        <ThemeSwitch />
      </div>
    </>
  );
}
