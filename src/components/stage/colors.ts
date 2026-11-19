"use client";
/** Цвета сцены читаются из CSS-переменных и обновляются при смене темы (data-theme и prefers-color-scheme). */
import { useSyncExternalStore } from "react";
import { CATEGORIES, type CategoryId } from "@/lib/catalog";

export type StageColors = {
  dark: boolean;
  ply: string;
  ink: string;
  surface: string;
  accent: string;
  cats: Record<CategoryId, string>;
};

const FALLBACK: StageColors = {
  dark: false,
  ply: "#d4b07c",
  ink: "#1c231f",
  surface: "#fafbf8",
  accent: "#2e57d1",
  cats: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color])) as Record<CategoryId, string>,
};

function read(): StageColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    dark: cs.colorScheme.includes("dark"),
    ply: v("--ply", FALLBACK.ply),
    ink: v("--ink", FALLBACK.ink),
    surface: v("--surface", FALLBACK.surface),
    accent: v("--accent", FALLBACK.accent),
    cats: Object.fromEntries(CATEGORIES.map((c) => [c.id, v(`--cat-${c.id}`, c.color)])) as Record<CategoryId, string>,
  };
}

let current: StageColors | null = null;
let currentKey = "";

function snapshot(): StageColors {
  const next = read();
  const key = JSON.stringify(next);
  if (key !== currentKey) {
    current = next;
    currentKey = key;
  }
  return current ?? next;
}

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onChange);
  };
}

export function useStageColors(): StageColors {
  return useSyncExternalStore(subscribe, snapshot, () => FALLBACK);
}

function subscribeReduced(onChange: () => void) {
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
