"use client";
import { useMemo } from "react";
import { Button, ButtonLink } from "@/components/ui/controls";
import { cartSnapshot } from "@/lib/cart";
import { useCart } from "@/lib/cart-store";
import { UNIT_LABEL, type Service } from "@/lib/catalog";
import { worksCount } from "@/lib/format";
import { formatMinutes, formatRub, type PricingSettings } from "@/lib/pricing";
import { openCart } from "@/lib/ui-store";

/** Строка работы с ценой и кнопкой «Добавить»: одна на главной и на «Для офисов», чтобы цены и корзина не расходились. */
export function ServiceRow({ s, pricing, category, onAdd }: { s: Service; pricing: PricingSettings; category?: { title: string; color: string }; onAdd: () => void }) {
  const { lines } = useCart();
  const inCart = lines.filter((l) => l.serviceId === s.id).reduce((sum, l) => sum + l.qty, 0);
  const price = s.pricing === "manual" ? "По фото" : `${formatRub(s.pricing === "hourly" ? pricing.hourRate : (s.price as number))} за ${UNIT_LABEL[s.unit]}`;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-4">
      <div className="min-w-0">
        {category && (
          <span className="mb-0.5 flex items-center gap-1.5 text-[0.8125rem] text-muted">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: category.color }} />
            {category.title}
          </span>
        )}
        <h3 className="font-medium leading-snug">{s.title}</h3>
        {s.description && <p className="mt-0.5 line-clamp-2 text-[0.875rem] leading-snug text-muted">{s.description}</p>}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <span className="font-medium tabular-nums">{price}</span>
          {s.minutes > 0 && s.pricing === "fixed" && <span className="text-[0.8125rem] text-muted tabular-nums">{formatMinutes(s.minutes)}</span>}
        </p>
        {inCart > 0 && <p className="mt-1 text-[0.8125rem] text-ok">В корзине: {s.pricing === "manual" ? worksCount(inCart) : `${String(inCart).replace(".", ",")} ${UNIT_LABEL[s.unit]}`}</p>}
      </div>
      <Button variant="secondary" onClick={onAdd} aria-label={`Добавить: ${s.title}`} className="min-w-28">
        Добавить
      </Button>
    </li>
  );
}

/** Нижняя панель: сколько работ и на какую сумму; нажатие открывает корзину, «Оформить» ведёт к заявке (`checkoutHref` — например, с выбранной организацией). */
export function CartBar({ services, pricing, checkoutHref = "/checkout" }: { services: Service[]; pricing: PricingSettings; checkoutHref?: string }) {
  const { lines } = useCart();
  const snap = useMemo(() => cartSnapshot(services, pricing, lines), [services, pricing, lines]);
  if (!lines.length) return null;
  const sum = !snap ? "" : snap.hasManual ? (snap.knownTotal != null ? `${formatRub(snap.knownTotal)} + по фото` : "по фото") : formatRub(snap.knownTotal ?? 0);
  return (
    <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mt-6 flex items-center gap-2 rounded-panel border border-line bg-surface p-2 pl-4">
      <button type="button" onClick={openCart} className="min-h-12 min-w-0 flex-1 rounded-field text-left" aria-label={`Открыть корзину: ${worksCount(lines.length)}${sum ? `, ${sum}` : ""}`}>
        <span className="block font-medium">{worksCount(lines.length)}</span>
        <span className="block truncate text-[0.9375rem] text-muted tabular-nums">{sum}</span>
      </button>
      <ButtonLink href={checkoutHref}>Оформить</ButtonLink>
    </div>
  );
}
