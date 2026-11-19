"use client";

import { useCallback, useEffect, useState } from "react";
import { savePricingAction, saveServiceAction } from "@/app/admin/actions";
import { parsePricingForm, parseServiceForm } from "@/lib/admin/schemas";
import { UNIT_LABEL, type Service } from "@/lib/catalog";
import { formatMinutes, formatRub } from "@/lib/pricing";
import type { PricingSettings } from "@/lib/pricing";
import { Check, TextArea, TextField } from "./fields";
import { FormStatus, Panel, Spinner, Tag, button, cx } from "./ui";
import { useForm } from "./use-save";

// ---- общие настройки цен ----

type PricingValues = Record<keyof PricingSettings, string>;

const PRICING_FIELDS: { key: keyof PricingSettings; label: string; suffix: string; hint: string }[] = [
  { key: "hourRate", label: "Цена часа", suffix: "₽", hint: "По ней считаются все почасовые работы." },
  { key: "minOrder", label: "Минимальный заказ", suffix: "₽", hint: "Если работы дешевле, добавляется доплата до этой суммы." },
  { key: "complexPct", label: "Сложные условия", suffix: "%", hint: "Высота, тесное место, старая проводка или трубы. Процент к цене работы." },
  { key: "dismantlePct", label: "Демонтаж старого", suffix: "%", hint: "Процент к работам на замену, где отмечен демонтаж." },
  { key: "urgentPct", label: "Срочный выезд", suffix: "%", hint: "Процент от суммы работ с учётом минимума." },
  { key: "outOfTownFee", label: "Выезд за город", suffix: "₽", hint: "Фиксированная доплата: без процентов и минимума." },
];

export function PricingForm({ initial }: { initial: PricingSettings }) {
  const [v, setV] = useState<PricingValues>(() => Object.fromEntries(Object.entries(initial).map(([k, n]) => [k, String(n)])) as PricingValues);
  const { pending, result, submit, error, formRef } = useForm(savePricingAction, parsePricingForm, v);

  return (
    <Panel id="pricing" title="Цена часа, минимум и доплаты">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(v);
        }}
        className="grid gap-5"
      >
        <div className="grid gap-5 min-[700px]:grid-cols-2">
          {PRICING_FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              suffix={f.suffix}
              inputMode="numeric"
              autoComplete="off"
              value={v[f.key]}
              onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))}
              error={error(f.key)}
              hint={f.hint}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="submit" disabled={pending} className={button("primary")}>
            {pending && <Spinner />}
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
          <FormStatus result={result} pending={pending} />
        </div>
      </form>
    </Panel>
  );
}

// ---- работа из прайса ----

function priceLine(s: Service, hourRate: number): string {
  if (s.pricing === "manual") return "по фото";
  if (s.pricing === "hourly") return `по цене часа, ${formatRub(hourRate)}`;
  return `${formatRub(s.price as number)} за ${UNIT_LABEL[s.unit]}`;
}

function timeLine(s: Service): string {
  if (s.pricing === "manual") return "время по фото";
  if (s.pricing === "hourly") return "норма — час";
  return s.minutes > 0 ? formatMinutes(s.minutes) : "время не задано";
}

interface ServiceValues {
  price: string;
  minutes: string;
  dismantleAllowed: boolean;
  active: boolean;
  memo: string;
}

/** Строка прайса: цена, время и памятка; «Изменить» раскрывает форму прямо в строке. */
export function ServiceRow({ service: s, hourRate }: { service: Service; hourRate: number }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const panelId = `edit-${s.id}`;

  return (
    <li className={cx("py-4 [contain-intrinsic-size:auto_96px] [content-visibility:auto]", !s.active && "bg-surface-2/40")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {s.title}
            {!s.active && <Tag tone="warn">Скрыта от клиентов</Tag>}
          </p>
          <p className="flex flex-wrap gap-x-4 text-[0.9375rem] tabular-nums text-muted">
            <span className="text-ink">{priceLine(s, hourRate)}</span>
            <span>{timeLine(s)}</span>
            {s.pricing === "fixed" && s.dismantleAllowed && <span>Есть демонтаж старого</span>}
          </p>
          <p className="mt-1 line-clamp-2 text-[0.875rem] text-muted">{s.memo ? `Памятка: ${s.memo}` : "Памятка не заполнена"}</p>
          {saved && !open && (
            <p role="status" className="mt-1 text-[0.875rem] text-ok">
              Сохранено. Новые заявки считаются по этим данным.
            </p>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Закрыть редактор" : "Изменить"}: ${s.title}`}
          onClick={() => {
            setSaved(false);
            setOpen((o) => !o);
          }}
          className={button("secondary", "sm")}
        >
          {open ? "Закрыть" : "Изменить"}
        </button>
      </div>
      {open && (
        <ServiceEditor
          id={panelId}
          service={s}
          onSaved={() => {
            setOpen(false);
            setSaved(true);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </li>
  );
}

function ServiceEditor({ id, service: s, onSaved, onCancel }: { id: string; service: Service; onSaved: () => void; onCancel: () => void }) {
  const [v, setV] = useState<ServiceValues>({
    price: s.price === null ? "" : String(s.price),
    minutes: String(s.minutes),
    dismantleAllowed: s.dismantleAllowed,
    active: s.active,
    memo: s.memo,
  });
  const action = useCallback((values: ServiceValues) => saveServiceAction(s.id, values), [s.id]);
  const parse = useCallback((values: ServiceValues) => parseServiceForm(values, s.pricing), [s.pricing]);
  const { pending, result, submit, error, formRef } = useForm(action, parse, v);
  const set = <K extends keyof ServiceValues>(k: K, value: ServiceValues[K]) => setV((p) => ({ ...p, [k]: value }));

  useEffect(() => {
    if (result?.ok) onSaved();
  }, [result, onSaved]);

  return (
    <form
      id={id}
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(v);
      }}
      className="mt-4 grid gap-4 rounded-field border border-line bg-bg p-4"
    >
      {s.pricing === "fixed" ? (
        <div className="grid gap-4 min-[560px]:grid-cols-2">
          <TextField
            label="Цена за единицу"
            suffix="₽"
            inputMode="numeric"
            autoComplete="off"
            value={v.price}
            onChange={(e) => set("price", e.target.value)}
            error={error("price")}
            hint={`За ${UNIT_LABEL[s.unit]}, целое число рублей.`}
          />
          <TextField
            label="Норма времени"
            suffix="мин"
            inputMode="numeric"
            autoComplete="off"
            value={v.minutes}
            onChange={(e) => set("minutes", e.target.value)}
            error={error("minutes")}
            hint="На одну единицу. По нормам считается время выезда."
          />
        </div>
      ) : (
        <p className="text-[0.9375rem] text-muted">
          {s.pricing === "hourly"
            ? "Цену этой работы задаёт «Цена часа» в общих настройках выше."
            : "Цены нет: мастер оценивает работу по фото и описанию клиента."}
        </p>
      )}
      {s.pricing === "fixed" && (
        <Check label="Можно отметить демонтаж старого" hint="Тогда к цене добавляется процент за демонтаж." checked={v.dismantleAllowed} onChange={(e) => set("dismantleAllowed", e.target.checked)} />
      )}
      <Check label="Показывать клиентам" hint="Если выключить, работу нельзя добавить в новую заявку. Старые заявки не меняются." checked={v.active} onChange={(e) => set("active", e.target.checked)} />
      <TextArea
        label="Памятка для выезда"
        rows={4}
        value={v.memo}
        onChange={(e) => set("memo", e.target.value)}
        maxLength={1000}
        error={error("memo")}
        hint="Инструмент и материалы. Видна только вам, попадает в «Памятку для выезда» новых заявок."
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button("primary")}>
          {pending && <Spinner />}
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button type="button" onClick={onCancel} className={button("secondary")}>
          Отмена
        </button>
        <FormStatus result={result} pending={pending} />
      </div>
    </form>
  );
}
