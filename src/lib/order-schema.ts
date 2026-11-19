/**
 * Проверка заявки. Изоморфно: сервер проверяет входящий JSON этой схемой, форма в браузере может
 * использовать её же для сообщений у полей. Ошибки — по-русски, ключи — пути полей: "phone", "lines.0.qty".
 */
import { z } from "zod";

// Сообщения zod по умолчанию — русские (на случай ошибок, для которых ниже нет своего текста).
z.config(z.locales.ru());

/** Окна времени из формы. Допустим и точный час «HH:MM» (его вводят из «позвоните к 14:30»). */
export const TIME_SLOTS = ["09:00–12:00", "12:00–15:00", "15:00–18:00", "18:00–21:00"] as const;

export const MATERIALS = ["have", "self", "master", "unknown"] as const;
export type Materials = (typeof MATERIALS)[number];
export const MATERIALS_LABEL: Record<Materials, string> = {
  have: "Уже есть у меня",
  self: "Куплю сам",
  master: "Пусть купит мастер, оплата по чеку",
  unknown: "Пока не знаю",
};

export const ACCESS_FIELDS = ["entrance", "intercom", "floor", "elevator", "parking"] as const;

/** Российский номер → «+7XXXXXXXXXX» или null. Принимает 8…, +7…, 7…, с пробелами и скобками. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  const national = d.length === 11 && (d[0] === "7" || d[0] === "8") ? d.slice(1) : d.length === 10 ? d : "";
  return /^[3489]\d{9}$/.test(national) ? `+7${national}` : null;
}

/** Сегодняшняя дата в Москве (UTC+3 круглый год) как «YYYY-MM-DD». */
export function todayMoscow(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const shortText = z.preprocess(emptyToUndefined, z.string().trim().max(40, "Не длиннее 40 символов").optional());

const isCalendarDate = (s: string) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export const lineSchema = z.object({
  serviceId: z
    .string({ error: "Выберите работу" })
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Неизвестная работа"),
  qty: z.number({ error: "Укажите количество" }).finite("Укажите количество"),
  complex: z.boolean().default(false),
  dismantle: z.boolean().default(false),
  description: z.string().trim().max(1000, "Описание — не длиннее 1000 символов").optional(),
});

export const photoRefSchema = z.object({
  id: z.uuid("Фото не найдено — загрузите его снова"),
  key: z.string().min(20, "Фото не найдено — загрузите его снова").max(100),
});

export const orderSchema = z
  .object({
    name: z
      .string({ error: "Укажите имя" })
      .trim()
      .min(2, "Укажите имя — как к вам обращаться")
      .max(80, "Имя — не длиннее 80 символов"),
    phone: z
      .string({ error: "Укажите телефон — по нему мастер согласует выезд." })
      .transform((v, ctx) => {
        const n = normalizePhone(v);
        if (!n) ctx.issues.push({ code: "custom", message: "Укажите телефон — по нему мастер согласует выезд.", input: v });
        return n ?? "";
      }),
    address: z
      .string({ error: "Укажите адрес" })
      .trim()
      .min(5, "Укажите адрес: улица, дом, квартира")
      .max(300, "Адрес — не длиннее 300 символов"),
    access: z
      .object({
        entrance: shortText,
        intercom: shortText,
        floor: shortText,
        elevator: shortText,
        parking: shortText,
      })
      .default({})
      .transform((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v)) as Partial<Record<(typeof ACCESS_FIELDS)[number], string>>),
    outOfTown: z.boolean().default(false),
    urgent: z.boolean().default(false),
    materials: z.enum(MATERIALS, { error: "Выберите, кто покупает материалы" }),
    desiredDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД")
        .refine(isCalendarDate, "Такой даты нет")
        .optional(),
    ),
    desiredTime: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine(
          (v) => (TIME_SLOTS as readonly string[]).includes(v) || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
          "Выберите время из списка или укажите в формате 14:30",
        )
        .optional(),
    ),
    comment: z.string().trim().max(1000, "Комментарий — не длиннее 1000 символов").default(""),
    consent: z.literal(true, { error: "Нужно согласие на обработку персональных данных" }),
    lines: z
      .array(lineSchema, { error: "Добавьте в заявку хотя бы одну работу" })
      .min(1, "Добавьте в заявку хотя бы одну работу")
      .max(30, "В одной заявке — не больше 30 позиций"),
    photos: z
      .array(photoRefSchema)
      .max(3, "Можно приложить не больше 3 фото")
      .default([])
      .refine((p) => new Set(p.map((x) => x.id)).size === p.length, "Одно и то же фото приложено дважды"),
  })
  .superRefine((o, ctx) => {
    if (o.desiredTime && !o.desiredDate) {
      ctx.addIssue({ code: "custom", path: ["desiredTime"], message: "Для конкретного времени укажите дату" });
    }
    if (o.desiredDate) {
      const today = todayMoscow();
      const max = todayMoscow(new Date(Date.now() + 365 * 86_400_000));
      if (o.desiredDate < today) ctx.addIssue({ code: "custom", path: ["desiredDate"], message: "Дата уже прошла — выберите сегодня или позже" });
      else if (o.desiredDate > max) ctx.addIssue({ code: "custom", path: ["desiredDate"], message: "Выберите дату не дальше чем через год" });
    }
  });

/** То, что приходит в POST /api/orders (до проверки). */
export type OrderInputRaw = z.input<typeof orderSchema>;
/** Проверенная и нормализованная заявка. */
export type OrderData = z.output<typeof orderSchema>;

/** Ошибки zod → `{ "phone": "сообщение", "lines.0.qty": "…" }`; по одному (первому) сообщению на поле. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
