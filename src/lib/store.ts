"use client";
import { useSyncExternalStore } from "react";

/** Крошечное хранилище для useSyncExternalStore: общее состояние интерфейса без провайдеров. */
export function createStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      subs.forEach((f) => f());
    },
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>, server: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => server);
}
