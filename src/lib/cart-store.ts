"use client";
import { useSyncExternalStore } from "react";
import {
  CART_KEY,
  EMPTY_CART,
  addItem,
  parseCart,
  reconcile,
  removeItem,
  restoreItem,
  serializeCart,
  updateItem,
  type AddResult,
  type CartItem,
  type CartState,
  type ItemPatch,
} from "./cart";
import type { Service } from "./catalog";
import { pushToast } from "./toast";

/**
 * Корзина в браузере: одно общее состояние, хранится в localStorage (версионный ключ, всё в try/catch),
 * синхронизируется между вкладками. На сервере и при гидратации — пустая корзина.
 */
let state: CartState = EMPTY_CART;
let loaded = false;
let bound = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = parseCart(localStorage.getItem(CART_KEY));
  } catch {
    // localStorage недоступен (приватный режим): корзина живёт до перезагрузки
  }
}

function commit(next: CartState) {
  state = next;
  try {
    if (next.lines.length) localStorage.setItem(CART_KEY, serializeCart(next));
    else localStorage.removeItem(CART_KEY);
  } catch {
    // см. выше
  }
  subs.forEach((f) => f());
}

function subscribe(cb: () => void) {
  load();
  subs.add(cb);
  if (!bound) {
    bound = true;
    window.addEventListener("storage", (e) => {
      if (e.key !== CART_KEY) return;
      state = parseCart(e.newValue);
      subs.forEach((f) => f());
    });
  }
  return () => void subs.delete(cb);
}

const getSnapshot = () => {
  load();
  return state;
};

export const useCart = (): CartState => useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_CART);

/** false при серверной отрисовке и гидратации, true после: корзина из localStorage уже прочитана. */
export const useCartReady = (): boolean =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export function cartAdd(item: CartItem): AddResult {
  load();
  const r = addItem(state, item);
  if (!r.full) commit(r.state);
  return r;
}

export function cartUpdate(key: string, patch: ItemPatch) {
  load();
  const title = state.lines.find((l) => l.key === key)?.title ?? "";
  const r = updateItem(state, key, patch);
  if (r.state !== state) commit(r.state);
  // строка исчезает из списка, потому что стала такой же, как соседняя: скажем об этом
  if (r.mergedInto) pushToast({ message: `Объединено с такой же позицией: ${title}`, ttl: 4000 });
  return r;
}

/** Удаляет позицию и показывает тост «Удалено: … — Вернуть» на 6 секунд. */
export function cartRemove(key: string) {
  load();
  const { state: next, removed } = removeItem(state, key);
  if (!removed) return;
  commit(next);
  pushToast({
    message: `Удалено: ${removed.item.title}`,
    actionLabel: "Вернуть",
    onAction: () => commit(restoreItem(state, removed.item, removed.index)),
  });
}

export function cartClear() {
  load();
  commit(EMPTY_CART);
}

/** Сверка с каталогом при загрузке: неизвестные и отключённые работы убираются, пользователю говорим об этом. */
export function cartReconcile(services: readonly Service[]) {
  load();
  if (!state.lines.length) return;
  const r = reconcile(state, services);
  if (r.dropped.length || r.adjusted) commit(r.state);
  if (r.dropped.length) {
    pushToast({
      message: `Из корзины убрали: ${r.dropped.join(", ")}. Этой работы больше нет в прайсе.`,
      ttl: 10000,
    });
  }
}
