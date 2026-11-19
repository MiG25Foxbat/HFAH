"use client";
import { Button } from "@/components/ui/controls";
import { PriceSummary } from "@/components/shop/PriceSummary";
import type { CartItem } from "@/lib/cart";
import { UNIT_LABEL } from "@/lib/catalog";
import { formatQty, formatRub, type PricingSettings, type PricingSnapshot } from "@/lib/pricing";
import { openCart } from "@/lib/ui-store";

/** Состав заявки и расчёт рядом с формой: обновляется сразу при отметках «Срочный выезд» и «Выезд за город». */
export function CheckoutSummary({
  items,
  snap,
  pricing,
  lineErrors,
}: {
  items: readonly CartItem[];
  snap: PricingSnapshot | null;
  pricing: PricingSettings;
  /** Ошибки по позициям: ключ — индекс позиции. */
  lineErrors: Record<number, string>;
}) {
  return (
    <div className="grid gap-5 rounded-panel border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.25rem] font-semibold">Состав заявки</h2>
        <Button variant="ghost" onClick={openCart} className="-mr-3 min-h-11 px-3 text-[0.9375rem]">
          Изменить
        </Button>
      </div>
      <ul className="grid divide-y divide-line">
        {items.map((it, i) => {
          const line = snap?.lines.find((l) => l.key === it.key);
          return (
            <li key={it.key} className="grid gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium leading-snug">{it.title}</span>
                <span className="shrink-0 tabular-nums">{line?.total == null ? "По фото" : formatRub(line.total)}</span>
              </div>
              <p className="text-[0.875rem] leading-snug text-muted">
                {it.manual ? "Стоимость — по фото" : `${formatQty(it.qty)} ${UNIT_LABEL[it.unit]}`}
                {it.complex ? ", сложные условия" : ""}
                {it.dismantle ? ", демонтаж старого" : ""}
              </p>
              {it.manual && it.description && <p className="break-words text-[0.875rem] leading-snug">{it.description}</p>}
              {lineErrors[i] && (
                <p className="text-[0.875rem] leading-snug text-danger">
                  {lineErrors[i]}{" "}
                  <button type="button" data-field={`lines.${i}.description`} onClick={openCart} className="font-medium underline underline-offset-4">
                    Изменить описание
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {snap && <PriceSummary totals={snap} minutes={snap.minutes} manualCount={items.filter((i) => i.manual).length} urgentPct={pricing.urgentPct} minOrder={pricing.minOrder} />}
    </div>
  );
}
