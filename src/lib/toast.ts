"use client";
import { createStore, useStore } from "./store";

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Тосты с одним тегом не копятся: новый заменяет прежний («Добавлено: …» при нескольких добавлениях подряд). */
  tag?: string;
}

const EMPTY: readonly Toast[] = [];
const store = createStore<readonly Toast[]>(EMPTY);
const timers = new Map<number, { t: ReturnType<typeof setTimeout>; left: number; at: number }>();
let seq = 0;
const MAX = 3;

export const useToasts = () => useStore(store, EMPTY);

export function dismissToast(id: number) {
  const x = timers.get(id);
  if (x) clearTimeout(x.t);
  timers.delete(id);
  store.set(store.get().filter((t) => t.id !== id));
}

function arm(id: number, ms: number) {
  timers.set(id, { t: setTimeout(() => dismissToast(id), ms), left: ms, at: Date.now() });
}

/** Тост на `ttl` мс (по умолчанию 6 с, как для «Вернуть»). Максимум три сразу: старые вытесняются. */
export function pushToast(t: Omit<Toast, "id"> & { ttl?: number }): number {
  const id = ++seq;
  const { ttl = 6000, ...rest } = t;
  if (rest.tag) store.get().filter((x) => x.tag === rest.tag).forEach((x) => dismissToast(x.id));
  const all = [...store.get(), { id, ...rest }];
  all.slice(0, Math.max(0, all.length - MAX)).forEach((old) => dismissToast(old.id));
  store.set([...store.get(), { id, ...rest }].slice(-MAX));
  arm(id, ttl);
  return id;
}

/** Пока на тосте курсор или фокус, таймер стоит (WCAG 2.2.1). */
export function pauseToast(id: number) {
  const x = timers.get(id);
  if (!x) return;
  clearTimeout(x.t);
  timers.set(id, { ...x, left: Math.max(1500, x.left - (Date.now() - x.at)) });
}

export function resumeToast(id: number) {
  const x = timers.get(id);
  if (x) arm(id, x.left);
}

export function clearToasts() {
  store.get().forEach((t) => dismissToast(t.id));
}
