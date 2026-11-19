/**
 * Оформление: форма, черновик, тело запроса, отпечаток для Idempotency-Key, проверка. Чистые функции.
 * Черновик хранится в localStorage (`DRAFT_KEY`); согласие на обработку данных в него НЕ попадает:
 * его нужно отметить осознанно при каждой отправке (после перезагрузки это один тап).
 */
import { ACCESS_FIELDS, orderSchema, zodFields, type Materials, type OrderInputRaw } from "./order-schema";
import type { CartItem } from "./cart";

export const DRAFT_KEY = "ladno-draft-v1";
/** Непривязанные фото сервер удаляет через 24 ч; помечаем устаревшие чуть раньше. */
export const PHOTO_TTL_MS = 23 * 3600_000;
export const MAX_PHOTOS = 3;

export type AccessField = (typeof ACCESS_FIELDS)[number];

export interface FormValues {
  name: string;
  phone: string;
  address: string;
  access: Record<AccessField, string>;
  outOfTown: boolean;
  urgent: boolean;
  materials: Materials | "";
  desiredDate: string;
  desiredTime: string;
  comment: string;
}

export const emptyForm = (): FormValues => ({
  name: "",
  phone: "",
  address: "",
  access: { entrance: "", intercom: "", floor: "", elevator: "", parking: "" },
  outOfTown: false,
  urgent: false,
  materials: "",
  desiredDate: "",
  desiredTime: "",
  comment: "",
});

export interface PhotoItem {
  /** Локальный id (до ответа сервера). */
  lid: string;
  name: string;
  /** Маленькое превью (dataURL) — переживает перезагрузку. */
  thumb: string;
  status: "uploading" | "done" | "error";
  progress: number;
  /** Ссылка на загруженный файл: только у `done`. */
  ref?: { id: string; key: string };
  uploadedAt?: number;
  error?: string;
}

export interface SubmitAttempt {
  /** Idempotency-Key этой отправки. */
  key: string;
  /** Отпечаток отправленного тела: при другом теле нужен новый ключ. */
  fp: string;
}

export interface Draft {
  form: FormValues;
  photos: PhotoItem[];
  submit: SubmitAttempt | null;
}

export const emptyDraft = (): Draft => ({ form: emptyForm(), photos: [], submit: null });

export function serializeDraft(d: Draft): string {
  return JSON.stringify({
    v: 1,
    form: d.form,
    // в черновик попадают только загруженные фото: у незавершённых нет ссылки, повторять нечем
    photos: d.photos
      .filter((p) => p.status === "done" && p.ref)
      .map((p) => ({ lid: p.lid, name: p.name, thumb: p.thumb, ref: p.ref, uploadedAt: p.uploadedAt })),
    submit: d.submit,
  });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const bool = (v: unknown) => v === true;

/** Читает черновик. Битый JSON и чужая версия — пустой черновик; устаревшие фото помечаются ошибкой с просьбой добавить снова. */
export function parseDraft(raw: string | null | undefined, now: number = Date.now()): Draft {
  if (!raw) return emptyDraft();
  let data: Record<string, unknown> | null;
  try {
    data = JSON.parse(raw) as Record<string, unknown> | null;
  } catch {
    return emptyDraft();
  }
  if (!data || data.v !== 1 || typeof data.form !== "object" || !data.form) return emptyDraft();
  const f = data.form as Record<string, unknown>;
  const a = (typeof f.access === "object" && f.access ? f.access : {}) as Record<string, unknown>;
  const materials = ["have", "self", "master", "unknown"].includes(f.materials as string) ? (f.materials as Materials) : "";
  const form: FormValues = {
    name: str(f.name, 80),
    phone: str(f.phone, 40),
    address: str(f.address, 300),
    access: Object.fromEntries(ACCESS_FIELDS.map((k) => [k, str(a[k], 40)])) as Record<AccessField, string>,
    outOfTown: bool(f.outOfTown),
    urgent: bool(f.urgent),
    materials,
    desiredDate: /^\d{4}-\d{2}-\d{2}$/.test(str(f.desiredDate, 10)) ? str(f.desiredDate, 10) : "",
    desiredTime: str(f.desiredTime, 11),
    comment: str(f.comment, 1000),
  };
  const photos: PhotoItem[] = [];
  for (const p of Array.isArray(data.photos) ? (data.photos as Record<string, unknown>[]) : []) {
    const ref = p?.ref as { id?: unknown; key?: unknown } | undefined;
    if (!ref || typeof ref.id !== "string" || typeof ref.key !== "string" || typeof p.lid !== "string") continue;
    const uploadedAt = typeof p.uploadedAt === "number" ? p.uploadedAt : 0;
    const base = { lid: p.lid, name: str(p.name, 120), thumb: str(p.thumb, 60_000), uploadedAt };
    if (photos.length >= MAX_PHOTOS) break;
    photos.push(
      now - uploadedAt > PHOTO_TTL_MS
        ? { ...base, status: "error", progress: 0, error: "Срок хранения фото истёк — удалите его и добавьте снова." }
        : { ...base, status: "done", progress: 100, ref: { id: ref.id, key: ref.key } },
    );
  }
  const s = data.submit as { key?: unknown; fp?: unknown } | null;
  const submit = s && typeof s.key === "string" && typeof s.fp === "string" ? { key: s.key, fp: s.fp } : null;
  return { form, photos, submit };
}

/** Тело POST /api/orders. Сервер пересчитывает цены сам: суммы не отправляются. */
export function buildPayload(form: FormValues, items: readonly CartItem[], photos: readonly PhotoItem[], consent: boolean): OrderInputRaw {
  const access = Object.fromEntries(ACCESS_FIELDS.flatMap((k) => (form.access[k].trim() ? [[k, form.access[k].trim()]] : [])));
  return {
    name: form.name,
    phone: form.phone,
    address: form.address,
    access,
    outOfTown: form.outOfTown,
    urgent: form.urgent,
    // пусто до выбора: схема ответит «Выберите, кто покупает материалы»
    materials: (form.materials || undefined) as Materials,
    desiredDate: form.desiredDate,
    desiredTime: form.desiredDate ? form.desiredTime : "",
    comment: form.comment,
    consent: consent as true,
    lines: items.map((i) => ({
      serviceId: i.serviceId,
      qty: i.qty,
      complex: i.complex,
      dismantle: i.dismantle,
      ...(i.manual ? { description: i.description ?? "" } : {}),
    })),
    photos: photos.filter((p) => p.status === "done" && p.ref).map((p) => p.ref as { id: string; key: string }),
  };
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Короткий неконтрольный отпечаток (cyrb53): нужен только чтобы заметить, что тело заявки изменилось. */
export function fingerprint(payload: unknown): string {
  const s = stable(payload);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Тот же ключ, пока тело не изменилось (повтор после сбоя сети не создаст дубль); изменилось — новый ключ. */
export function nextAttempt(prev: SubmitAttempt | null, payload: unknown, newKey: () => string): SubmitAttempt {
  const fp = fingerprint(payload);
  return prev && prev.fp === fp ? prev : { key: newKey(), fp };
}

/**
 * Проверка перед отправкой: схема сервера плюс правила «Другое» (описание ≥ 10 символов, минимум одно фото).
 * Ключи — пути полей: "phone", "lines.0.description", "photos".
 */
export function validateOrder(payload: OrderInputRaw, items: readonly CartItem[], photosDone: number): Record<string, string> {
  const parsed = orderSchema.safeParse(payload);
  const errors = parsed.success ? {} : zodFields(parsed.error);
  items.forEach((it, i) => {
    if (it.manual && (it.description ?? "").trim().length < 10) {
      errors[`lines.${i}.description`] = "Опишите задачу подробнее — не короче 10 символов.";
    }
  });
  if (items.some((i) => i.manual) && photosDone < 1 && !errors.photos) {
    errors.photos = "Для задачи «Другое» приложите хотя бы одно фото — по нему мастер оценит работу.";
  }
  return errors;
}
