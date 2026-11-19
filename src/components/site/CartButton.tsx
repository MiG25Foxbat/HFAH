"use client";
import { useCart } from "@/lib/cart-store";
import { worksCount } from "@/lib/format";
import { openCart } from "@/lib/ui-store";
import { CartIcon } from "@/components/ui/icons";

/** Кнопка корзины в шапке: число работ в бейдже; на широком экране с подписью. */
export function CartButton() {
  const n = useCart().lines.length;
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={n ? `Корзина: ${worksCount(n)}` : "Корзина пуста"}
      className="relative inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full px-3 transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-95 motion-reduce:active:scale-100 min-[900px]:px-4"
    >
      <CartIcon />
      <span className="hidden font-medium min-[900px]:inline" aria-hidden="true">
        Корзина
      </span>
      {n > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.75rem] font-semibold leading-5 text-accent-ink tabular-nums min-[900px]:static"
        >
          {n}
        </span>
      )}
    </button>
  );
}
