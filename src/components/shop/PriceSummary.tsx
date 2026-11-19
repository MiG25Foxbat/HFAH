import { formatMinutes, formatRub } from "@/lib/pricing";
import { worksCount } from "@/lib/format";

export const MATERIALS_NOTE = "Цена — только за работу. Материалы и запчасти оплачиваются отдельно.";

export interface SummaryTotals {
  subtotal: number;
  topUp: number;
  urgent: number;
  worksTotal: number;
  outOfTown: number;
  /** Часть цены, известная сейчас. Это НЕ цена заказа, если есть работы «По фото». */
  knownTotal: number | null;
  hasManual: boolean;
  minimumIsPreliminary: boolean;
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[0.9375rem] text-muted">
        {label}
        {note && <span className="block text-[0.8125rem]">{note}</span>}
      </dt>
      <dd className="shrink-0 text-right tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Итоги расчёта: корзина, оформление, страница заявки. Известная сумма и «оценка по фото» всегда раздельно:
 * неизвестное никогда не показывается как 0 ₽, а `knownTotal` при работах «По фото» не называется ценой заказа.
 */
export function PriceSummary({
  totals,
  minutes,
  manualCount = 0,
  urgentPct,
  minOrder,
  title = "Предварительный расчёт",
}: {
  totals: SummaryTotals;
  minutes: number;
  manualCount?: number;
  urgentPct?: number;
  minOrder?: number;
  title?: string;
}) {
  const { subtotal, topUp, urgent, worksTotal, outOfTown, knownTotal, hasManual } = totals;
  const rounding = worksTotal - (subtotal + topUp + urgent);
  const onlyManual = hasManual && subtotal === 0;
  const timeText = minutes > 0 ? `${formatMinutes(minutes)}${hasManual ? " + время по фото" : ""}` : hasManual ? "по фото" : "—";

  return (
    <section aria-label={title} className="grid gap-3">
      <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
      {onlyManual ? (
        <div aria-live="polite" aria-atomic="true">
          {outOfTown > 0 ? (
            <p className="leading-snug">
              Сейчас известно: выезд за город <span className="font-semibold tabular-nums">{formatRub(outOfTown)}</span>. Работы — оценка по фото.
            </p>
          ) : (
            <p className="leading-snug">Стоимость — по фото. Мастер оценит после просмотра и позвонит.</p>
          )}
        </div>
      ) : (
        <>
          <dl className="divide-y divide-line">
            {subtotal > 0 && <Row label="Работы" value={formatRub(subtotal)} />}
            {topUp > 0 && (
              <Row
                label={`Доплата до минимального заказа${minOrder ? ` (${formatRub(minOrder)})` : ""}`}
                note={totals.minimumIsPreliminary ? "предварительно: есть работы по фото" : undefined}
                value={`+${formatRub(topUp)}`}
              />
            )}
            {urgent > 0 && <Row label={`Срочный выезд${urgentPct ? ` (+${urgentPct}%)` : ""}`} value={`+${formatRub(urgent)}`} />}
            {rounding > 0 && <Row label="Округление до 10 ₽" value={`+${formatRub(rounding)}`} />}
            {outOfTown > 0 && <Row label="Выезд за город" value={`+${formatRub(outOfTown)}`} />}
          </dl>
          <div aria-live="polite" aria-atomic="true" className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <span className="font-medium">{hasManual ? "Сейчас известно" : "Предварительная стоимость"}</span>
            <span className="text-[1.375rem] font-semibold tabular-nums">{knownTotal === null ? "—" : formatRub(knownTotal)}</span>
          </div>
        </>
      )}
      {hasManual && (
        <p className="rounded-field bg-surface-2 px-3 py-2 text-[0.9375rem] leading-snug">
          <span className="font-medium">Оценка по фото{manualCount > 0 ? `: ${worksCount(manualCount)}` : ""}.</span> Цену назовёт мастер после просмотра фото.
        </p>
      )}
      <dl>
        <Row label="Ориентировочное время выезда" value={timeText} />
      </dl>
      <p className="text-[0.8125rem] leading-snug text-muted">{MATERIALS_NOTE} Итоговую цену подтверждает мастер после разговора.</p>
    </section>
  );
}
