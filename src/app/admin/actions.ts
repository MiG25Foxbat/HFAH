"use server";

/**
 * Все изменения из кабинета — только Server Actions: Next сверяет Origin с Host (защита от чужих сайтов), а каждое
 * действие первой строкой требует владельца (`requireOwner()` → редирект на вход), затем проверяет вход через zod.
 * Исключение — loginAction: ей владелец ещё не нужен. Результат — `ActionResult`, не записи БД.
 */
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH, SESSION_COOKIE, changePassword, login, logout, requireOwner } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { clientIp, shortHash } from "@/lib/server/http";
import { deleteOrder, saveDeal, saveNote } from "@/lib/server/admin/orders";
import { setBonusStatus } from "@/lib/server/admin/bonus";
import { destroyAllSessions, saveSection, saveService } from "@/lib/server/admin/tariffs";
import {
  BONUS_STATUSES,
  loginSchema,
  parseDealForm,
  parseNoteForm,
  parsePasswordForm,
  type ActionResult,
} from "@/lib/admin/schemas";

const GENERIC_ERROR = "Не удалось сохранить. Повторите попытку чуть позже.";

/** Неожиданные ошибки (БД, сеть) → понятный ответ без деталей; редиректы Next пропускаются дальше. */
async function guarded(run: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const result = await run();
    if (result.ok) refresh();
    return result;
  } catch (e) {
    const err = e as { digest?: string; name?: string; code?: string; message?: string };
    if (typeof err.digest === "string" && err.digest.startsWith("NEXT_")) throw e;
    // в лог — только суть: драйвер БД может нести тексты запроса с персональными данными
    console.error("[admin-action]", err.name, err.code, err.message);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ---- вход и выход ----

/** Вход по паролю. Ограничение частоты — внутри login(). После успеха — редирект в кабинет. */
export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await login(parsed.data.password);
  if (!result.ok) return { ok: false, error: result.error };
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await requireOwner();
  await logout();
  redirect("/admin/login");
}

export async function logoutAllAction(): Promise<void> {
  await requireOwner();
  await destroyAllSessions();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/** Смена пароля: после неё все прежние сеансы закрыты, текущий браузер получает новый. */
export async function changePasswordAction(values: unknown): Promise<ActionResult> {
  await requireOwner();
  const parsed = parsePasswordForm(values, MIN_PASSWORD_LENGTH);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  // проверка текущего пароля — перебор для украденного сеанса: не больше 10 попыток за 15 минут
  const limit = await rateLimit(`pwchange:${shortHash(clientIp(await headers()))}`, 10, 900);
  if (!limit.ok) return { ok: false, error: `Слишком много попыток. Подождите ${Math.ceil(limit.retryAfterSec / 60)} мин.` };
  return guarded(async () => {
    const result = await changePassword(parsed.data.current, parsed.data.next);
    if (!result.ok) return { ok: false, fields: { [result.error.startsWith("Текущий") ? "current" : "next"]: result.error } };
    return { ok: true, message: "Пароль изменён. Все остальные сеансы закрыты, в этом браузере вы остались в кабинете." };
  });
}

// ---- заявки ----

export async function saveDealAction(orderId: string, values: unknown): Promise<ActionResult> {
  await requireOwner();
  const parsed = parseDealForm(values);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  return guarded(() => saveDeal(orderId, parsed.data));
}

export async function saveNoteAction(orderId: string, values: unknown): Promise<ActionResult> {
  await requireOwner();
  const parsed = parseNoteForm(values);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  return guarded(() => saveNote(orderId, parsed.data.note));
}

/** Удаляет заявку вместе с фото (необратимо; подтверждение — в интерфейсе) и открывает список. */
export async function deleteOrderAction(orderId: string): Promise<ActionResult> {
  await requireOwner();
  const result = await guarded(() => deleteOrder(orderId));
  if (result.ok) redirect("/admin?deleted=1");
  return result;
}

export async function setBonusStatusAction(codeId: number, status: string): Promise<ActionResult> {
  await requireOwner();
  if (!(BONUS_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Неизвестный статус кода." };
  return guarded(() => setBonusStatus(Number(codeId), status as (typeof BONUS_STATUSES)[number]));
}

// ---- тарифы и настройки ----

export async function saveServiceAction(serviceId: string, values: unknown): Promise<ActionResult> {
  await requireOwner();
  return guarded(() => saveService(serviceId, values));
}

export async function savePricingAction(values: unknown): Promise<ActionResult> {
  await requireOwner();
  return guarded(() => saveSection("pricing", values));
}

export async function saveCompanyAction(values: unknown): Promise<ActionResult> {
  await requireOwner();
  return guarded(() => saveSection("company", values));
}

export async function saveGameAction(values: unknown): Promise<ActionResult> {
  await requireOwner();
  return guarded(() => saveSection("game", values));
}

export async function saveCharactersAction(values: unknown): Promise<ActionResult> {
  await requireOwner();
  return guarded(() => saveSection("characters", values));
}
