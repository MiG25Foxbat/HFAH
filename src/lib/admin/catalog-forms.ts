/**
 * Формы редактора каталога («Тарифы»): категории и работы. ЧИСТЫЙ модуль: ту же проверку делает форма в браузере
 * (сообщения у полей) и Server Action (источник истины). Значения форм приходят строками.
 */
import { z } from "zod";
import { CHARACTER_KEYS, type CharacterKey, type PricingKind, type Unit } from "@/lib/catalog";
import { zodFields } from "@/lib/order-schema";
import type { Parsed } from "./schemas";

const fail = (fields: Record<string, string>): { ok: false; fields: Record<string, string> } => ({ ok: false, fields });
const MAX_RUB = 1_000_000;
const intIn = (s: string, min: number, max: number) => (/^\d{1,9}$/.test(s) && Number(s) >= min && Number(s) <= max ? Number(s) : null);

/** Название: пустое — «Укажите название», слишком короткое и слишком длинное — свои тексты. Первое сообщение у поля — самое точное. */
const nameSchema = (max: number) =>
  z.string({ error: "Укажите название" }).trim().min(1, "Укажите название").min(2, "Название — не короче 2 символов").max(max, `Название — не длиннее ${max} символов`);

/**
 * Цена и норма времени фиксированной работы. Проверяются всегда вместе с остальными полями формы, чтобы владелец видел все
 * ошибки сразу, а не по одной после каждого нажатия.
 */
function fixedPart(raw: unknown): { fields: Record<string, string>; price: number | null; minutes: number | null } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const price = intIn(String(o.price ?? "").trim(), 0, MAX_RUB);
  const minutes = intIn(String(o.minutes ?? "").trim(), 0, 1440);
  const fields: Record<string, string> = {};
  if (price === null) fields.price = "Цена — целое число рублей от 0 до 1 000 000";
  if (minutes === null) fields.minutes = "Норма — целое число минут от 0 до 1440";
  return { fields, price, minutes };
}

/** Сколько категорий можно создать: больше — не помещаются в чипы и на кольцо подиума. */
export const MAX_CATEGORIES = 12;

// ---- категории ----

export interface CategoryInput {
  title: string;
  color: string;
  character: CharacterKey;
  active: boolean;
}

export interface CategoryFormValues {
  title: string;
  color: string;
  character: string;
  active: boolean;
}

const categorySchema = z.object({
  title: nameSchema(40),
  color: z.string({ error: "Выберите цвет" }).regex(/^#[0-9A-Fa-f]{6}$/, "Выберите цвет из образцов"),
  character: z.enum(CHARACTER_KEYS, { error: "Выберите персонажа" }),
  active: z.boolean().default(true),
});

export function parseCategoryForm(values: unknown): Parsed<CategoryInput> {
  const r = categorySchema.safeParse(values);
  if (!r.success) return fail(zodFields(r.error));
  return { ok: true, data: { ...r.data, color: r.data.color.toUpperCase() } };
}

// ---- работы ----

export const UNITS: readonly Unit[] = ["pcs", "m", "m2", "hour"];
export const PRICING_KINDS: readonly PricingKind[] = ["fixed", "hourly", "manual"];

export const PRICING_LABEL: Record<PricingKind, string> = {
  fixed: "Фиксированная цена",
  hourly: "Почасовая, по цене часа",
  manual: "По фото, цену называет мастер",
};

/** Единицы в форме: подписи для выбора («за шт»). */
export const UNIT_CHOICE: Record<Unit, string> = {
  pcs: "штука",
  m: "погонный метр",
  m2: "квадратный метр",
  hour: "час",
};

/** Что можно менять у существующей работы. Ключи, которых нет в запросе, не меняются. */
export interface ServicePatchInput {
  title?: string;
  description?: string;
  category?: string;
  office?: boolean;
  price?: number;
  minutes?: number;
  dismantleAllowed?: boolean;
  memo: string;
  active: boolean;
}

const serviceFormSchema = z.object({
  title: nameSchema(120).optional(),
  description: z.string().trim().max(500, "Описание — не длиннее 500 символов").optional(),
  category: z.string().min(1, "Выберите категорию").max(80).optional(),
  office: z.boolean().optional(),
  price: z.string().trim().default(""),
  minutes: z.string().trim().default(""),
  dismantleAllowed: z.boolean().default(false),
  active: z.boolean(),
  memo: z.string().trim().max(1000, "Памятка — не длиннее 1000 символов"),
});

/**
 * Что можно менять у работы. Цена и норма времени — только у работ с фиксированной ценой: у почасовой цену задаёт
 * «цена часа», у «по фото» цены нет вообще. Единица и вид расчёта задаются при создании и дальше не меняются.
 */
export function parseServiceForm(values: unknown, pricing: PricingKind): Parsed<ServicePatchInput> {
  const r = serviceFormSchema.safeParse(values);
  const fixed = pricing === "fixed" ? fixedPart(values) : null;
  const fields = { ...(fixed?.fields ?? {}), ...(r.success ? {} : zodFields(r.error)) };
  if (!r.success || Object.keys(fields).length) return fail(fields);
  const v = r.data;
  const patch: ServicePatchInput = { memo: v.memo, active: v.active };
  if (v.title !== undefined) patch.title = v.title;
  if (v.description !== undefined) patch.description = v.description;
  if (v.category !== undefined) patch.category = v.category;
  if (v.office !== undefined) patch.office = v.office;
  if (fixed) {
    patch.price = fixed.price as number;
    patch.minutes = fixed.minutes as number;
    patch.dismantleAllowed = v.dismantleAllowed;
  }
  return { ok: true, data: patch };
}

export interface NewServiceInput {
  title: string;
  description: string;
  unit: Unit;
  pricing: PricingKind;
  price: number | null;
  minutes: number;
  dismantleAllowed: boolean;
  memo: string;
  office: boolean;
  active: boolean;
}

export interface NewServiceFormValues {
  title: string;
  description: string;
  unit: string;
  pricing: string;
  price: string;
  minutes: string;
  dismantleAllowed: boolean;
  memo: string;
  office: boolean;
}

const newServiceSchema = z.object({
  title: nameSchema(120),
  description: z.string().trim().max(500, "Описание — не длиннее 500 символов").default(""),
  pricing: z.enum(PRICING_KINDS as [PricingKind, ...PricingKind[]], { error: "Выберите вид расчёта" }),
  unit: z.enum(UNITS as [Unit, ...Unit[]], { error: "Выберите единицу" }).default("pcs"),
  price: z.string().trim().default(""),
  minutes: z.string().trim().default(""),
  dismantleAllowed: z.boolean().default(false),
  memo: z.string().trim().max(1000, "Памятка — не длиннее 1000 символов").default(""),
  office: z.boolean().default(false),
});

/**
 * Новая работа. Вид расчёта определяет остальное, как требует БД: почасовая — единица «час», норма 60 минут, цены нет
 * (её задаёт «цена часа»); «по фото» — штука, нормы и цены нет; фиксированная — цена и норма обязательны.
 */
export function parseNewServiceForm(values: unknown): Parsed<NewServiceInput> {
  const r = newServiceSchema.safeParse(values);
  // цена и норма проверяются вместе с остальным, если вид расчёта не выбран или «фиксированная цена» (по умолчанию в форме)
  const kind = values && typeof values === "object" ? (values as Record<string, unknown>).pricing : undefined;
  const fixed = r.success ? (r.data.pricing === "fixed" ? fixedPart(values) : null) : kind === "fixed" ? fixedPart(values) : null;
  const fields = { ...(fixed?.fields ?? {}), ...(r.success ? {} : zodFields(r.error)) };
  if (!r.success || Object.keys(fields).length) return fail(fields);
  const v = r.data;
  const base = { title: v.title, description: v.description, memo: v.memo, office: v.office, active: true };
  if (v.pricing === "hourly") {
    return { ok: true, data: { ...base, unit: "hour", pricing: "hourly", price: null, minutes: 60, dismantleAllowed: false } };
  }
  if (v.pricing === "manual") {
    return { ok: true, data: { ...base, unit: "pcs", pricing: "manual", price: null, minutes: 0, dismantleAllowed: false } };
  }
  const { price, minutes } = fixed as NonNullable<typeof fixed>;
  return { ok: true, data: { ...base, unit: v.unit, pricing: "fixed", price: price as number, minutes: minutes as number, dismantleAllowed: v.dismantleAllowed } };
}
