"use client";

import { useEffect, useId, useState } from "react";
import {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  setCategoryActiveAction,
  updateCategoryAction,
} from "@/app/admin/actions";
import { parseCategoryForm, type CategoryFormValues } from "@/lib/admin/catalog-forms";
import { CATEGORY_SWATCHES, CHARACTER_KEYS, CHARACTER_LABEL, type Category } from "@/lib/catalog";
import { Check, SelectField, TextField } from "./fields";
import { ConfirmDelete } from "./Confirm";
import { Icon } from "./Icon";
import { FormStatus, Panel, Spinner, Tag, button, cx } from "./ui";
import { MoveButtons, useQuickAction } from "./use-row";
import { useForm } from "./use-save";

export type CategoryRow = Category & { works: number };

/** Выбор цвета из образцов: кружки 44×44, настоящие radio (стрелки на клавиатуре, подпись у каждого). */
function Swatches({ value, onChange, name, error }: { value: string; onChange: (hex: string) => void; name: string; error?: string }) {
  const id = useId();
  const current = value.toUpperCase();
  // цвет, которого нет в наборе (задан раньше), остаётся доступным: иначе при сохранении он бы тихо сменился
  const list = CATEGORY_SWATCHES.some((s) => s.hex === current) || !/^#[0-9A-F]{6}$/.test(current) ? CATEGORY_SWATCHES : [...CATEGORY_SWATCHES, { hex: current, name: "Прежний цвет" }];
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined} className="min-w-0">
      <legend className="mb-1 text-[0.9375rem] font-medium">Цвет</legend>
      <div className="-m-0.5 flex flex-wrap">
        {list.map((s) => (
          <label
            key={s.hex}
            title={s.name}
            className="relative grid size-11 cursor-pointer place-items-center rounded-full has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name={name} value={s.hex} aria-label={s.name} checked={current === s.hex} onChange={() => onChange(s.hex)} className="peer sr-only" />
            <span aria-hidden className="size-8 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface peer-checked:ring-ink" style={{ background: s.hex }} />
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[0.875rem] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Поля категории: название, цвет, персонаж, видимость. Одна форма для создания и правки. */
function CategoryForm({
  initial,
  submitLabel,
  pendingLabel,
  action,
  onDone,
  onCancel,
  showActive,
}: {
  initial: CategoryFormValues;
  submitLabel: string;
  pendingLabel: string;
  action: (values: CategoryFormValues) => ReturnType<typeof createCategoryAction>;
  onDone: () => void;
  onCancel: () => void;
  showActive: boolean;
}) {
  const [v, setV] = useState<CategoryFormValues>(initial);
  const { pending, result, submit, error, formRef } = useForm(action, parseCategoryForm, v);
  const set = <K extends keyof CategoryFormValues>(k: K, value: CategoryFormValues[K]) => setV((p) => ({ ...p, [k]: value }));

  useEffect(() => {
    if (result?.ok) onDone();
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
      <TextField label="Название" name="title" autoComplete="off" value={v.title} onChange={(e) => set("title", e.target.value)} error={error("title")} placeholder="Например, окна и двери…" />
      <Swatches name="color" value={v.color} onChange={(hex) => set("color", hex)} error={error("color")} />
      <SelectField label="Персонаж" name="character" value={v.character} onChange={(e) => set("character", e.target.value)} error={error("character")} hint="Какой 3D-персонаж встречает клиента в этой категории.">
        {CHARACTER_KEYS.map((k) => (
          <option key={k} value={k}>
            {CHARACTER_LABEL[k]}
          </option>
        ))}
      </SelectField>
      {showActive && <Check label="Показывать клиентам" hint="Если выключить, категория и все её работы пропадут с сайта." checked={v.active} onChange={(e) => set("active", e.target.checked)} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button("primary")}>
          {pending && <Spinner />}
          {pending ? pendingLabel : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={button("secondary")}>
          Отмена
        </button>
        <FormStatus result={result} pending={pending} />
      </div>
    </form>
  );
}

function CategoryItem({ c, index, count }: { c: CategoryRow; index: number; count: number }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const { pending, result, run } = useQuickAction();
  const panelId = `edit-category-${c.id}`;

  return (
    <li className={cx("py-4", !c.active && "bg-surface-2/40")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1.5 size-3.5 shrink-0 rounded-full" style={{ background: c.color }} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <span className="min-w-0 wrap-anywhere">{c.title}</span>
            {!c.active && <Tag tone="warn">Скрыта от клиентов</Tag>}
          </p>
          <p className="flex flex-wrap gap-x-4 text-[0.9375rem] text-muted">
            <span>Персонаж: {CHARACTER_LABEL[c.character]}</span>
            <span className="tabular-nums">Работ: {c.works}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MoveButtons name={c.title} isFirst={index === 0} isLast={index === count - 1} pending={pending} onMove={(dir) => run(() => moveCategoryAction(c.id, dir))} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Закрыть редактор категории" : "Изменить категорию"}: ${c.title}`}
          onClick={() => {
            setSaved(false);
            setOpen((o) => !o);
          }}
          className={button("secondary", "sm")}
        >
          {open ? "Закрыть" : "Изменить"}
        </button>
        <button type="button" aria-label={`${c.active ? "Скрыть" : "Показать"} категорию: ${c.title}`} disabled={pending} onClick={() => run(() => setCategoryActiveAction(c.id, !c.active))} className={button("secondary", "sm")}>
          {c.active ? "Скрыть" : "Показать"}
        </button>
        {c.works === 0 ? (
          <ConfirmDelete label="Удалить" ariaLabel={`Удалить категорию: ${c.title}`} title={`Удалить категорию «${c.title}»?`} confirmLabel="Удалить категорию" pending={pending} onConfirm={() => run(() => deleteCategoryAction(c.id))}>
            <p>Категория пуста, работ в ней нет. Она исчезнет из списка и с сайта. Заявки это не затрагивает.</p>
          </ConfirmDelete>
        ) : null}
      </div>
      {c.works > 0 && (
        <p data-testid="category-delete-hint" className="mt-2 text-[0.8125rem] text-muted">
          Удалить можно пустую категорию: сначала перенесите или удалите её работы ({c.works}).
        </p>
      )}
      {(pending || result) && <FormStatus result={result} pending={pending} className="mt-2" />}
      {saved && !open && (
        <p role="status" className="mt-2 text-[0.9375rem] text-ok">
          Сохранено. Новые заявки запомнят это название.
        </p>
      )}
      {open && (
        <div id={panelId}>
          <CategoryForm
            initial={{ title: c.title, color: c.color, character: c.character, active: c.active }}
            submitLabel="Сохранить"
            pendingLabel="Сохраняем…"
            action={(values) => updateCategoryAction(c.id, values)}
            onDone={() => {
              setOpen(false);
              setSaved(true);
            }}
            onCancel={() => setOpen(false)}
            showActive
          />
        </div>
      )}
    </li>
  );
}

/** Категории в порядке сайта: переименовать, сменить цвет и персонажа, скрыть, переставить, удалить пустую, создать новую. */
export function CategoriesPanel({ categories, max }: { categories: CategoryRow[]; max: number }) {
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const used = new Set(categories.map((c) => c.color.toUpperCase()));
  const freeColor = (CATEGORY_SWATCHES.find((s) => !used.has(s.hex)) ?? CATEGORY_SWATCHES[0]).hex;

  return (
    <Panel
      id="categories"
      className="scroll-mt-24"
      title="Категории"
      description="Порядок здесь — порядок на сайте. Скрытая категория пропадает с сайта вместе со всеми работами. Удалить можно только пустую категорию. Клиент видит категорию, когда в ней есть хотя бы одна показываемая работа."
    >
      {categories.length === 0 && <p className="mb-4 text-muted">Категорий нет. Создайте первую: в ней появятся работы.</p>}
      <ol className="-my-4 divide-y divide-line">
        {categories.map((c, i) => (
          <CategoryItem key={c.id} c={c} index={i} count={categories.length} />
        ))}
      </ol>
      <div className="mt-4 border-t border-line pt-4">
        {categories.length >= max ? (
          <p className="text-[0.9375rem] text-muted">Достигнут предел: {max} категорий. Удалите пустую, чтобы добавить новую.</p>
        ) : adding ? (
          <CategoryForm
            initial={{ title: "", color: freeColor, character: "other", active: true }}
            submitLabel="Создать категорию"
            pendingLabel="Создаём…"
            action={createCategoryAction}
            onDone={() => {
              setAdding(false);
              setNote("Категория создана и стоит последней. Добавьте в неё работы.");
            }}
            onCancel={() => setAdding(false)}
            showActive={false}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNote("");
              setAdding(true);
            }}
            className={button("secondary")}
          >
            <Icon name="plus" className="size-5" />
            Добавить категорию
          </button>
        )}
        {note && !adding && (
          <p role="status" className="mt-3 text-[0.9375rem] text-ok">
            {note}
          </p>
        )}
      </div>
    </Panel>
  );
}
