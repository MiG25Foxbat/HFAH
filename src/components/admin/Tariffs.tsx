"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createServiceAction,
  deleteServiceAction,
  moveServiceAction,
  savePricingAction,
  saveServiceAction,
  setServiceActiveAction,
} from "@/app/admin/actions";
import {
  PRICING_KINDS,
  PRICING_LABEL,
  UNITS,
  UNIT_CHOICE,
  parseNewServiceForm,
  parseServiceForm,
  type NewServiceFormValues,
} from "@/lib/admin/catalog-forms";
import { parsePricingForm } from "@/lib/admin/schemas";
import { UNIT_LABEL, type Category, type Service } from "@/lib/catalog";
import { formatMinutes, formatRub } from "@/lib/pricing";
import type { PricingSettings } from "@/lib/pricing";
import { ConfirmDelete } from "./Confirm";
import { Check, SelectField, TextArea, TextField } from "./fields";
import { Icon } from "./Icon";
import { FormStatus, Panel, Spinner, Tag, button, cx } from "./ui";
import { MoveButtons, useQuickAction } from "./use-row";
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
  title: string;
  description: string;
  category: string;
  office: boolean;
  price: string;
  minutes: string;
  dismantleAllowed: boolean;
  active: boolean;
  memo: string;
}

type CategoryOption = Pick<Category, "id" | "title" | "active">;

/** Строка прайса: цена, время и памятка; порядок, скрыть, удалить; «Изменить» раскрывает форму прямо в строке. */
export function ServiceRow({
  service: s,
  hourRate,
  categories,
  index,
  count,
}: {
  service: Service;
  hourRate: number;
  categories: CategoryOption[];
  /** Место в категории и число работ в ней (для кнопок «выше» и «ниже»). */
  index: number;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const { pending, result, run } = useQuickAction();
  const panelId = `edit-${s.id}`;

  return (
    <li className={cx("py-4 [contain-intrinsic-size:auto_96px] [content-visibility:auto]", !s.active && "bg-surface-2/40")}>
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span className="min-w-0 wrap-anywhere">{s.title}</span>
          {!s.active && <Tag tone="warn">Скрыта от клиентов</Tag>}
          {s.office && <Tag tone="ply">Для офиса</Tag>}
        </p>
        <p className="flex flex-wrap gap-x-4 text-[0.9375rem] tabular-nums text-muted">
          <span className="text-ink">{priceLine(s, hourRate)}</span>
          <span>{timeLine(s)}</span>
          {s.pricing === "fixed" && s.dismantleAllowed && <span>Есть демонтаж старого</span>}
        </p>
        <p className="mt-1 line-clamp-2 wrap-anywhere text-[0.875rem] text-muted">{s.memo ? `Памятка: ${s.memo}` : "Памятка не заполнена"}</p>
        {saved && !open && (
          <p role="status" className="mt-1 text-[0.875rem] text-ok">
            Сохранено. Новые заявки считаются по этим данным.
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MoveButtons name={s.title} isFirst={index === 0} isLast={index === count - 1} pending={pending} onMove={(dir) => run(() => moveServiceAction(s.id, dir))} />
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
        <button type="button" aria-label={`${s.active ? "Скрыть" : "Показать"}: ${s.title}`} disabled={pending} onClick={() => run(() => setServiceActiveAction(s.id, !s.active))} className={button("secondary", "sm")}>
          {s.active ? "Скрыть" : "Показать"}
        </button>
        <ConfirmDelete label="Удалить" ariaLabel={`Удалить: ${s.title}`} title={`Удалить «${s.title}»?`} confirmLabel="Удалить работу" pending={pending} onConfirm={() => run(() => deleteServiceAction(s.id))}>
          <p>
            Работа исчезнет из прайса и с сайта. Прошлые заявки не изменятся: они хранят состав и цены на момент отправки. Если работу нужно только убрать с сайта на время,
            лучше нажать «Скрыть».
          </p>
        </ConfirmDelete>
      </div>
      {(pending || result) && <FormStatus result={result} pending={pending} className="mt-2" />}
      {open && (
        <ServiceEditor
          id={panelId}
          service={s}
          categories={categories}
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

function CategorySelect({ value, onChange, categories, error }: { value: string; onChange: (id: string) => void; categories: CategoryOption[]; error?: string }) {
  return (
    <SelectField label="Категория" name="category" value={value} onChange={(e) => onChange(e.target.value)} error={error} hint="При переносе работа встаёт в конец выбранной категории.">
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
          {c.active ? "" : " (скрыта)"}
        </option>
      ))}
    </SelectField>
  );
}

function ServiceEditor({
  id,
  service: s,
  categories,
  onSaved,
  onCancel,
}: {
  id: string;
  service: Service;
  categories: CategoryOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ServiceValues>({
    title: s.title,
    description: s.description,
    category: s.category,
    office: s.office,
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
      <TextField label="Название" name="title" autoComplete="off" value={v.title} onChange={(e) => set("title", e.target.value)} error={error("title")} />
      <TextArea label="Описание" name="description" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} error={error("description")} hint="Одно-два предложения: что входит в работу. Видно клиенту." />
      <CategorySelect value={v.category} onChange={(c) => set("category", c)} categories={categories} error={error("category")} />
      {s.pricing === "fixed" ? (
        <div className="grid gap-4 min-[560px]:grid-cols-2">
          <TextField
            label="Цена за единицу"
            name="price"
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
            name="minutes"
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
      <Check label="Подходит для офиса" hint="Работа попадает в раздел «Для офисов» на сайте." checked={v.office} onChange={(e) => set("office", e.target.checked)} />
      <Check label="Показывать клиентам" hint="Если выключить, работу нельзя добавить в новую заявку. Старые заявки не меняются." checked={v.active} onChange={(e) => set("active", e.target.checked)} />
      <TextArea
        label="Памятка для выезда"
        name="memo"
        rows={4}
        value={v.memo}
        onChange={(e) => set("memo", e.target.value)}
       
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

// ---- новая работа ----

const EMPTY_NEW: NewServiceFormValues = {
  title: "",
  description: "",
  unit: "pcs",
  pricing: "fixed",
  price: "",
  minutes: "",
  dismantleAllowed: false,
  memo: "",
  office: false,
};

function NewServiceForm({ categoryId, categoryTitle, onDone, onCancel }: { categoryId: string; categoryTitle: string; onDone: (message: string) => void; onCancel: () => void }) {
  const [v, setV] = useState<NewServiceFormValues>(EMPTY_NEW);
  const action = useCallback((values: NewServiceFormValues) => createServiceAction(categoryId, values), [categoryId]);
  const { pending, result, submit, error, formRef } = useForm(action, parseNewServiceForm, v);
  const set = <K extends keyof NewServiceFormValues>(k: K, value: NewServiceFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const fixed = v.pricing === "fixed";

  useEffect(() => {
    if (result?.ok) onDone(result.message ?? "Работа добавлена.");
  }, [result, onDone]);

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(v);
      }}
      className="mt-4 grid gap-4 rounded-field border border-line bg-bg p-4"
    >
      <h3 className="wrap-anywhere text-[1.0625rem] font-semibold">Новая работа в категории «{categoryTitle}»</h3>
      <TextField label="Название" name="title" autoComplete="off" value={v.title} onChange={(e) => set("title", e.target.value)} error={error("title")} placeholder="Например, замена розетки…" />
      <TextArea label="Описание" name="description" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} error={error("description")} hint="Одно-два предложения: что входит в работу. Видно клиенту." />
      <SelectField label="Как считается цена" name="pricing" value={v.pricing} onChange={(e) => set("pricing", e.target.value)} error={error("pricing")} hint={v.pricing === "hourly" ? "Цену задаёт «Цена часа» в общих настройках, норма — один час." : v.pricing === "manual" ? "Клиент опишет задачу и приложит фото, цену назовёте вы." : undefined}>
        {PRICING_KINDS.map((k) => (
          <option key={k} value={k}>
            {PRICING_LABEL[k]}
          </option>
        ))}
      </SelectField>
      {fixed && (
        <>
          <SelectField label="Единица" name="unit" value={v.unit} onChange={(e) => set("unit", e.target.value)} error={error("unit")} hint="За что назначена цена: штука, метр, квадратный метр или час.">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_CHOICE[u]}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <TextField label="Цена за единицу" name="price" suffix="₽" inputMode="numeric" autoComplete="off" value={v.price} onChange={(e) => set("price", e.target.value)} error={error("price")} hint="Целое число рублей." />
            <TextField label="Норма времени" name="minutes" suffix="мин" inputMode="numeric" autoComplete="off" value={v.minutes} onChange={(e) => set("minutes", e.target.value)} error={error("minutes")} hint="На одну единицу. По нормам считается время выезда." />
          </div>
          <Check label="Можно отметить демонтаж старого" hint="Тогда к цене добавляется процент за демонтаж." checked={v.dismantleAllowed} onChange={(e) => set("dismantleAllowed", e.target.checked)} />
        </>
      )}
      <Check label="Подходит для офиса" hint="Работа попадает в раздел «Для офисов» на сайте." checked={v.office} onChange={(e) => set("office", e.target.checked)} />
      <TextArea label="Памятка для выезда" name="memo" rows={3} value={v.memo} onChange={(e) => set("memo", e.target.value)} error={error("memo")} hint="Инструмент и материалы. Видна только вам." />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button("primary")}>
          {pending && <Spinner />}
          {pending ? "Добавляем…" : "Добавить работу"}
        </button>
        <button type="button" onClick={onCancel} className={button("secondary")}>
          Отмена
        </button>
        <FormStatus result={result} pending={pending} />
      </div>
    </form>
  );
}

/** «Добавить работу» в конце списка категории: кнопка раскрывает форму, результат остаётся под кнопкой. */
export function AddService({ categoryId, categoryTitle }: { categoryId: string; categoryTitle: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="mt-4 border-t border-line pt-4">
      {open ? (
        <NewServiceForm
          categoryId={categoryId}
          categoryTitle={categoryTitle}
          onDone={(message) => {
            setOpen(false);
            setNote(message);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          aria-label={`Добавить работу в категорию: ${categoryTitle}`}
          onClick={() => {
            setNote("");
            setOpen(true);
          }}
          className={button("secondary")}
        >
          <Icon name="plus" className="size-5" />
          Добавить работу
        </button>
      )}
      {note && !open && (
        <p role="status" className="mt-3 text-[0.9375rem] text-ok">
          {note}
        </p>
      )}
    </div>
  );
}
