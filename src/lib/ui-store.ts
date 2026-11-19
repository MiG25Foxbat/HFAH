"use client";
import { createStore, useStore } from "./store";
import { clearToasts } from "./toast";

/** Открыта ли корзина. Кнопка в шапке и нижняя панель открывают лист, который смонтирован в layout. */
const cartOpen = createStore(false);
export const useCartOpen = () => useStore(cartOpen, false);
export const openCart = () => {
  clearToasts(); // «Добавлено: …» с кнопкой «Корзина» не должно висеть поверх открытой корзины
  cartOpen.set(true);
};
export const closeCart = () => cartOpen.set(false);
