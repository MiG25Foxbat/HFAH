/**
 * Авторизация владельца для страниц и Server Actions (cookies() из Next).
 * Каждая админская Server Action ОБЯЗАНА начинаться с `await requireOwner()`.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "./rate-limit";
import { clientIp, shortHash } from "./http";
import {
  SESSION_COOKIE,
  changeOwnerPassword,
  createSession,
  destroySession,
  findSession,
  verifyOwnerPassword,
  type OwnerSession,
} from "./session";

export { SESSION_COOKIE, MIN_PASSWORD_LENGTH } from "./session";
export type { OwnerSession } from "./session";

async function setSessionCookie(id: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Текущий сеанс владельца или null (не редиректит). */
export async function getOwnerSession(): Promise<OwnerSession | null> {
  return findSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Сеанс владельца; без него — редирект на /admin/login. Вызывать в начале каждой админской страницы и Server Action. */
export async function requireOwner(): Promise<OwnerSession> {
  const session = await getOwnerSession();
  if (!session) redirect("/admin/login");
  return session;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * Вход: 10 попыток за 15 минут с одного IP и 50 за 15 минут всего (страховка, если IP подделан).
 * При успехе выставляет cookie `ladno_sid`.
 */
export async function login(password: string): Promise<AuthResult> {
  const global = await rateLimit("login:all", 50, 900);
  const limit = global.ok ? await rateLimit(`login:${shortHash(clientIp(await headers()))}`, 10, 900) : global;
  if (!limit.ok) {
    return { ok: false, error: `Слишком много попыток входа. Подождите ${Math.ceil(limit.retryAfterSec / 60)} мин.` };
  }
  if (!(await verifyOwnerPassword(password))) return { ok: false, error: "Неверный пароль." };
  const { id, expiresAt } = await createSession();
  await setSessionCookie(id, expiresAt);
  return { ok: true };
}

/** Выход: удаляет сеанс из БД и cookie. */
export async function logout(): Promise<void> {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** Смена пароля: все прежние сеансы закрываются, текущий браузер получает новый. */
export async function changePassword(current: string, next: string): Promise<AuthResult> {
  const r = await changeOwnerPassword(current, next);
  if (!r.ok) return r;
  await setSessionCookie(r.id, r.expiresAt);
  return { ok: true };
}
