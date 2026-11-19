/** Схемы и типы настроек компании (таблица `settings`, разделы jsonb). Изоморфно: подходит и для форм кабинета. */
import { z } from "zod";

const money = (label: string) =>
  z.number({ error: `${label}: укажите число` }).int(`${label}: только целые рубли`).min(0, `${label}: не меньше 0`).max(1_000_000, `${label}: слишком много`);
const pct = (label: string) =>
  z.number({ error: `${label}: укажите число` }).int(`${label}: целое число процентов`).min(0, `${label}: не меньше 0`).max(300, `${label}: не больше 300`);

/** Что компания не берёт. keywords — основы слов (без «ё», регистр не важен) для поиска в описаниях заявки. */
export const excludedItemSchema = z.object({
  title: z.string().trim().min(2, "Укажите название").max(120),
  hint: z.string().trim().max(300).default(""),
  keywords: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(30).default([]),
});

export const companySchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(60),
  city: z.string().trim().max(80),
  territory: z.string().trim().max(300),
  /** Короткий слоган. */
  accent: z.string().trim().max(160),
  /** Пустые строки = канал не указан; интерфейс не должен показывать пустой контакт как настоящий. */
  contacts: z.object({
    phone: z.string().trim().max(40),
    telegram: z.string().trim().max(80),
    whatsapp: z.string().trim().max(40),
    email: z.string().trim().max(120),
  }),
  excluded: z.array(excludedItemSchema).max(30),
  /** Показывать раздел «Для офисов» и выбор «Организация» при оформлении. Значения по умолчанию — для старых записей без этих полей. */
  orgsEnabled: z.boolean().default(true),
  /** Организация может отметить «Нужен счёт и закрывающие документы». */
  invoiceEnabled: z.boolean().default(true),
  /** Короткий текст условий для организаций (на странице «Для офисов» и при оформлении). */
  orgNote: z.string().trim().max(300, "Условия — не длиннее 300 символов").default(""),
});

export const pricingSchema = z.object({
  hourRate: money("Цена часа"),
  minOrder: money("Минимальный заказ"),
  complexPct: pct("Сложные условия"),
  dismantlePct: pct("Демонтаж"),
  urgentPct: pct("Срочный выезд"),
  outOfTownFee: money("Выезд за город"),
});

/** off — выключена, play — играть без скидки, bonus — бонус на следующий заказ. */
export const gameSchema = z.object({
  mode: z.enum(["off", "play", "bonus"]),
  bonusAmount: money("Сумма бонуса"),
  validDays: z.number().int().min(1, "Срок: от 1 дня").max(365, "Срок: до 365 дней"),
  minNextOrder: money("Минимум следующего заказа"),
});

export const charactersSchema = z.object({
  personality: z.enum(["calm", "cheerful", "business"]),
  facesEnabled: z.boolean(),
  phrasesEnabled: z.boolean(),
});

export const settingsSchema = z.object({
  company: companySchema,
  pricing: pricingSchema,
  game: gameSchema,
  characters: charactersSchema,
});

export const settingsSectionSchemas = {
  company: companySchema,
  pricing: pricingSchema,
  game: gameSchema,
  characters: charactersSchema,
} as const;

export type ExcludedItem = z.infer<typeof excludedItemSchema>;
export type Company = z.infer<typeof companySchema>;
export type GameSettings = z.infer<typeof gameSchema>;
export type Characters = z.infer<typeof charactersSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSectionName = keyof typeof settingsSectionSchemas;
