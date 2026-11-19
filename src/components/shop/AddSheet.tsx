"use client";
import { useMemo, useState } from "react";
import { makeItem } from "@/lib/cart";
import { cartAdd } from "@/lib/cart-store";
import { UNIT_LABEL, type Service } from "@/lib/catalog";
import { buildPricingSnapshot, formatMinutes, formatQty, formatRub, QTY_RULES, type PricingSettings } from "@/lib/pricing";
import { excludedInText } from "@/lib/shop";
import type { ExcludedItem } from "@/lib/settings";
import { pushToast } from "@/lib/toast";
import { openCart } from "@/lib/ui-store";
import { Button, Callout, CheckRow, TextArea } from "@/components/ui/controls";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Sheet } from "@/components/ui/Sheet";
import { ExcludedNote } from "./ExcludedNote";
import { MATERIALS_NOTE } from "./PriceSummary";

const COMPLEX_HELP = "Работа на высоте, тесное или труднодоступное место, старая проводка или трубы.";
const MIN_DESCRIPTION = 10;

/** Настройка работы перед добавлением в корзину: снизу на телефоне, панель справа на десктопе. */
export function AddSheet({
  service,
  pricing,
  excluded,
  onClose,
}: {
  service: Service | null;
  pricing: PricingSettings;
  excluded: readonly ExcludedItem[];
  onClose: () => void;
}) {
  return (
    <Sheet open={!!service} onClose={onClose} title={service?.title ?? ""}>
      {service && <AddForm key={service.id} service={service} pricing={pricing} excluded={excluded} onClose={onClose} />}
    </Sheet>
  );
}

function AddForm({ service, pricing, excluded, onClose }: { service: Service; pricing: PricingSettings; excluded: readonly ExcludedItem[]; onClose: () => void }) {
  const manual = service.pricing === "manual";
  const [qty, setQty] = useState<number>(QTY_RULES[service.unit].min);
  const [complex, setComplex] = useState(false);
  const [dismantle, setDismantle] = useState(false);
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [full, setFull] = useState(false);

  // тот же движок, что и в корзине и на сервере: цена строки и время
  const line = useMemo(() => {
    const snap = buildPricingSnapshot([service], pricing, {
      lines: [{ serviceId: service.id, qty: manual ? 1 : qty, complex, dismantle, description }],
      urgent: false,
      outOfTown: false,
    });
    return snap.lines[0];
  }, [service, pricing, manual, qty, complex, dismantle, description]);

  const tooShort = manual && description.trim().length < MIN_DESCRIPTION;
  const hourly = service.pricing === "hourly";
  const unitPrice = hourly ? pricing.hourRate : service.price;
  const excludedHit = manual ? excludedInText(excluded, description) : [];

  const submit = () => {
    if (tooShort) {
      setTouched(true);
      document.getElementById("add-description")?.focus();
      return;
    }
    const r = cartAdd(makeItem(service, { qty, complex, dismantle, description }));
    if (r.full) {
      setFull(true);
      return;
    }
    const msg = r.merged
      ? `Такая работа уже в корзине: ${service.title}. Количество увеличено${r.capped ? " до максимума" : ""}.`
      : `Добавлено: ${service.title}`;
    pushToast({ message: msg, actionLabel: "Корзина", onAction: openCart, tag: "added", ttl: 3500 });
    onClose();
  };

  return (
    <div className="grid gap-5">
      {service.description && <p className="leading-snug text-muted">{service.description}</p>}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-field bg-surface-2 px-4 py-3 text-[0.9375rem]">
        <div>
          <dt className="text-muted">{hourly ? "Цена часа" : "Цена"}</dt>
          <dd className="font-medium tabular-nums">{manual ? "По фото" : `${formatRub(unitPrice as number)} за ${UNIT_LABEL[service.unit]}`}</dd>
        </div>
        <div>
          <dt className="text-muted">Норма времени</dt>
          <dd className="font-medium tabular-nums">{service.minutes > 0 ? `${formatMinutes(service.minutes)} на ${UNIT_LABEL[service.unit]}` : "по фото"}</dd>
        </div>
      </dl>

      {manual ? (
        <>
          <TextArea
            id="add-description"
            label="Что нужно сделать"
            hint="Опишите задачу своими словами: что, где, какого размера. Стоимость — по фото: мастер оценит после просмотра."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched(true)}
            error={touched && tooShort ? `Опишите задачу подробнее — не короче ${MIN_DESCRIPTION} символов.` : undefined}
            maxLength={1000}
            autoComplete="off"
          />
          <ExcludedNote items={excludedHit} soft />
          <p className="rounded-field bg-surface-2 px-4 py-3 text-[0.9375rem] leading-snug">При оформлении заявки нужно приложить хотя бы одно фото места работы.</p>
        </>
      ) : (
        <>
          <div className="grid gap-2">
            <span className="text-[0.9375rem] font-medium">{hourly ? "Сколько часов" : "Количество"}</span>
            <QtyStepper unit={service.unit} value={qty} onChange={setQty} label={hourly ? "Часы" : "Количество"} />
          </div>
          <div className="grid gap-2">
            <CheckRow checked={complex} onChange={(e) => setComplex(e.target.checked)} title="Сложные условия" badge={`+${pricing.complexPct}%`} description={COMPLEX_HELP} />
            {service.dismantleAllowed && (
              <CheckRow
                checked={dismantle}
                onChange={(e) => setDismantle(e.target.checked)}
                title="Демонтаж старого"
                badge={`+${pricing.dismantlePct}%`}
                description="Снять и убрать прежнюю деталь перед установкой новой."
              />
            )}
          </div>
        </>
      )}

      <div className="grid gap-1" aria-live="polite" aria-atomic="true">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium">За работу</span>
          <span className="text-[1.5rem] font-semibold tabular-nums">{line.total === null ? "По фото" : formatRub(line.total)}</span>
        </div>
        {line.total !== null && (
          <p className="text-[0.875rem] leading-snug text-muted">
            {formatQty(qty)} {UNIT_LABEL[service.unit]}
            {line.pct > 0 ? `, надбавка ${line.pct}%` : ""}
            {line.minutes > 0 ? `, ${formatMinutes(line.minutes)}` : ""}
          </p>
        )}
        {line.total !== null && line.total < pricing.minOrder && (
          <p className="text-[0.875rem] leading-snug text-muted">Минимальный заказ — {formatRub(pricing.minOrder)}: если работ меньше, доплата до него видна в корзине.</p>
        )}
        {manual && <p className="text-[0.875rem] leading-snug text-muted">Стоимость — по фото. Мастер оценит после просмотра и позвонит.</p>}
      </div>

      <p className="text-[0.8125rem] leading-snug text-muted">{MATERIALS_NOTE}</p>
      {full && <Callout tone="error" role="alert">В заявке не больше 30 позиций. Уберите лишнее из корзины или оформите то, что уже добавлено.</Callout>}
      <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-line bg-surface px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button onClick={submit} className="w-full">
          Добавить в корзину
        </Button>
      </div>
    </div>
  );
}
