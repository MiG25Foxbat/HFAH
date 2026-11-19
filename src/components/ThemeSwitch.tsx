"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Choice = "light" | "dark" | "system";

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
];

const listeners = new Set<() => void>();
let memory: Choice | null = null;

function readStored(): Choice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const getSnapshot = () => (memory ??= readStored());
const getServerSnapshot = (): Choice => "system";

function subscribe(onChange: () => void) {
  const onStorage = () => {
    memory = null;
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function choose(choice: Choice) {
  memory = choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // хранилище недоступно (приватный режим): тема сменится до перезагрузки
  }
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  listeners.forEach((l) => l());
}

/** Переключатель темы: Светлая / Тёмная / Как в системе. Настоящие radio — стрелки и фокус работают из коробки. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <fieldset className={`flex min-w-0 gap-1 rounded-full border border-line bg-surface p-1 ${className}`}>
      <legend className="sr-only">Тема оформления</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input
            type="radio"
            name="theme"
            value={o.value}
            checked={current === o.value}
            onChange={() => choose(o.value)}
            className="peer sr-only"
          />
          <span className="flex min-h-11 items-center rounded-full px-3 text-[0.8125rem] font-medium text-muted transition-colors peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
            {o.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
