"use client";
import { useSyncExternalStore } from "react";
import { DRAFT_KEY, emptyDraft, parseDraft, serializeDraft, type Draft } from "./checkout";

/**
 * Черновик формы оформления: общее состояние + запись в localStorage с небольшой задержкой
 * (и сразу при уходе со страницы). На сервере — пустой черновик.
 */
const SERVER_DRAFT = emptyDraft();
let state: Draft = SERVER_DRAFT;
let loaded = false;
let bound = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = parseDraft(localStorage.getItem(DRAFT_KEY));
  } catch {
    state = emptyDraft();
  }
}

export function flushDraft() {
  clearTimeout(timer);
  timer = undefined;
  try {
    localStorage.setItem(DRAFT_KEY, serializeDraft(state));
  } catch {
    // нет места или приватный режим: черновик живёт до перезагрузки
  }
}

function subscribe(cb: () => void) {
  load();
  subs.add(cb);
  if (!bound) {
    bound = true;
    window.addEventListener("pagehide", () => timer && flushDraft());
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && timer && flushDraft());
  }
  return () => void subs.delete(cb);
}

const getSnapshot = () => {
  load();
  return state;
};

export const useDraft = (): Draft => useSyncExternalStore(subscribe, getSnapshot, () => SERVER_DRAFT);

/** Текущий черновик вне React (обработчики загрузки фото, которые живут дольше одной отрисовки). */
export const getDraft = getSnapshot;

export function draftUpdate(fn: (d: Draft) => Draft) {
  load();
  state = fn(state);
  clearTimeout(timer);
  timer = setTimeout(flushDraft, 300);
  subs.forEach((f) => f());
}

export function draftClear() {
  clearTimeout(timer);
  timer = undefined;
  state = emptyDraft();
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // см. выше
  }
  subs.forEach((f) => f());
}
