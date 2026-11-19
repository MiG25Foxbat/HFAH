/**
 * Проверка форм кабинета. ЧИСТЫЙ модуль: ту же проверку делает форма в браузере (сообщения у полей) и Server Action
 * (источник истины). Значения форм приходят строками; результат — типизированные данные или `{ поле: сообщение }`.
 * Ключи полей — пути: "finalPrice", "excluded.0.title".
 */
import { z } from "zod";
import { zodFields, normalizePhone } from "@/lib/order-schema";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";
import {
  charactersSchema,
  companySchema,
  gameSchema,
  pricingSchema,
  type Characters,
  type Company,
  type GameSettings,
} from "@/lib/settings";
import { fromInputs, isClock, isDay, normalizeTelegram } from "./format";

/** Ответ любой админской Server Action. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error?: string; fields?: Record<string, string> };

export type Parsed<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> };

const fail = (fields: Record<string, string>): { ok: false; fields: Record<string, string> } => ({ ok: false, fields });

const MAX_RUB = 1_000_000;

/** «1 500», «1500,0» → число; пусто → undefined (zod скажет «укажите число»). */
function toNumber(raw: unknown): number | undefined {
  const s = String(raw ?? "").replace(/[\s ]/g, "").replace(",", ".");
  return s === "" ? undefined : Number(s);
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// ---- заявка: цена, время, статус ----

const dealFormSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { error: "Выберите статус" }),
    finalPrice: z.string().trim().regex(/^\d{0,7}$/, "Цена — целое число рублей, например 3500"),
    agreedDate: z.string().trim().refine((v) => v === "" || isDay(v), "Укажите дату выезда"),
    agreedTime: z.string().trim().refine((v) => v === "" || isClock(v), "Укажите время, например 14:30"),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.finalPrice !== "" && Number(v.finalPrice) > MAX_RUB) issue("finalPrice", "Цена — не больше 1 000 000 ₽");
    const hasDate = v.agreedDate !== "";
    const hasTime = v.agreedTime !== "";
    if (hasDate && !hasTime) issue("agreedTime", "К дате добавьте время выезда");
    if (hasTime && !hasDate) issue("agreedDate", "К времени добавьте дату выезда");
    if (v.status === "agreed") {
      if (v.finalPrice === "") issue("finalPrice", "Для статуса «Согласована» укажите итоговую цену");
      if (!hasDate) issue("agreedDate", "Для статуса «Согласована» укажите дату выезда");
      if (!hasTime) issue("agreedTime", "Для статуса «Согласована» укажите время выезда");
    }
  });

export interface DealInput {
  status: OrderStatus;
  finalPrice: number | null;
  /** Согласованное время выезда (московские дата и время → момент). */
  agreedAt: Date | null;
}

export function parseDealForm(values: unknown): Parsed<DealInput> {
  const r = dealFormSchema.safeParse(values);
  if (!r.success) return fail(zodFields(r.error));
  const v = r.data;
  const agreedAt = v.agreedDate && v.agreedTime ? fromInputs(v.agreedDate, v.agreedTime) : null;
  if (v.agreedDate && v.agreedTime && !agreedAt) return fail({ agreedDate: "Такой даты или времени нет" });
  return { ok: true, data: { status: v.status, finalPrice: v.finalPrice === "" ? null : Number(v.finalPrice), agreedAt } };
}

export const NOTE_MAX = 2000;

export function parseNoteForm(values: unknown): Parsed<{ note: string }> {
  const r = z.object({ note: z.string().trim().max(NOTE_MAX, `Заметка — не длиннее ${NOTE_MAX} символов`) }).safeParse(values);
  return r.success ? { ok: true, data: r.data } : fail(zodFields(r.error));
}

// ---- настройки ----

const PRICING_KEYS = ["hourRate", "minOrder", "complexPct", "dismantlePct", "urgentPct", "outOfTownFee"] as const;
const GAME_NUMBER_KEYS = ["bonusAmount", "validDays", "minNextOrder"] as const;

export function parsePricingForm(values: unknown): Parsed<z.infer<typeof pricingSchema>> {
  const o = asRecord(values);
  const r = pricingSchema.safeParse(Object.fromEntries(PRICING_KEYS.map((k) => [k, toNumber(o[k])])));
  return r.success ? { ok: true, data: r.data } : fail(zodFields(r.error));
}

export function parseGameForm(values: unknown): Parsed<GameSettings> {
  const o = asRecord(values);
  const r = gameSchema.safeParse({ mode: o.mode, ...Object.fromEntries(GAME_NUMBER_KEYS.map((k) => [k, toNumber(o[k])])) });
  return r.success ? { ok: true, data: r.data } : fail(zodFields(r.error));
}

export function parseCharactersForm(values: unknown): Parsed<Characters> {
  const r = charactersSchema.safeParse(values);
  return r.success ? { ok: true, data: r.data } : fail(zodFields(r.error));
}

/** Форма «Компании»: всё строками; ключевые слова «не берём» — одной строкой через запятую. */
export interface CompanyForm {
  name: string;
  city: string;
  territory: string;
  accent: string;
  phone: string;
  telegram: string;
  whatsapp: string;
  email: string;
  orgsEnabled: boolean;
  invoiceEnabled: boolean;
  orgNote: string;
  excluded: { title: string; hint: string; keywords: string }[];
}

const emailSchema = z.email();

export function parseCompanyForm(values: unknown): Parsed<Company> {
  const o = asRecord(values);
  const text = (k: string) => String(o[k] ?? "").trim();
  const fields: Record<string, string> = {};

  const contact = (key: "phone" | "whatsapp", label: string): string => {
    const raw = text(key);
    if (!raw) return "";
    const n = normalizePhone(raw);
    if (!n) fields[key] = `${label}: укажите российский номер, например +7 916 123-45-67`;
    return n ?? "";
  };
  const phone = contact("phone", "Телефон");
  const whatsapp = contact("whatsapp", "WhatsApp");

  let telegram = "";
  if (text("telegram")) {
    const t = normalizeTelegram(text("telegram"));
    if (t) telegram = t;
    else fields.telegram = "Telegram: имя пользователя от 5 символов, например @zaprosto_master";
  }
  const email = text("email").toLowerCase();
  if (email && !emailSchema.safeParse(email).success) fields.email = "Почта: проверьте адрес, например master@example.ru";

  const rows = Array.isArray(o.excluded) ? o.excluded : [];
  const excluded = rows.map((row, i) => {
    const r = asRecord(row);
    const keywords = [
      ...new Set(
        String(r.keywords ?? "")
          .split(/[,;\n]/)
          .map((k) => k.trim().toLowerCase().replaceAll("ё", "е"))
          .filter(Boolean),
      ),
    ];
    const short = keywords.find((k) => k.length < 2);
    if (short) fields[`excluded.${i}.keywords`] = `Слово «${short}» слишком короткое — не меньше 2 букв`;
    return { title: String(r.title ?? "").trim(), hint: String(r.hint ?? "").trim(), keywords };
  });

  const r = companySchema.safeParse({
    name: text("name"),
    city: text("city"),
    territory: text("territory"),
    accent: text("accent"),
    contacts: { phone, telegram, whatsapp, email },
    excluded,
    orgsEnabled: o.orgsEnabled,
    invoiceEnabled: o.invoiceEnabled,
    orgNote: text("orgNote"),
  });
  if (!r.success) {
    for (const issue of r.error.issues) {
      const path = issue.path.filter((p) => p !== "contacts");
      // excluded.0.keywords.1 → excluded.0.keywords
      const key = (path[0] === "excluded" ? path.slice(0, 3) : path.slice(0, 1)).join(".") || "_";
      fields[key] ??= issue.message;
    }
  }
  return Object.keys(fields).length ? fail(fields) : r.success ? { ok: true, data: r.data } : fail({ _: "Проверьте форму" });
}

// ---- доступ ----

export function parsePasswordForm(values: unknown, minLength: number): Parsed<{ current: string; next: string }> {
  const o = asRecord(values);
  const current = String(o.current ?? "");
  const next = String(o.next ?? "");
  const repeat = String(o.repeat ?? "");
  const fields: Record<string, string> = {};
  if (!current) fields.current = "Введите текущий пароль";
  if (next.length < minLength) fields.next = `Новый пароль — не короче ${minLength} символов`;
  else if (next === current) fields.next = "Новый пароль совпадает с текущим";
  if (repeat !== next) fields.repeat = "Пароли не совпадают";
  return Object.keys(fields).length ? fail(fields) : { ok: true, data: { current, next } };
}

export const loginSchema = z.object({ password: z.string().min(1, "Введите пароль").max(200, "Слишком длинный пароль") });

export const BONUS_STATUSES = ["issued", "redeemed", "void"] as const;
export type BonusStatus = (typeof BONUS_STATUSES)[number];
