/**
 * Ядро сеансов владельца: работает с БД и не зависит от Next (проверяется тестами и обработчиками маршрутов).
 * Обёртки над cookies() для страниц и Server Actions — в auth.ts.
 */
import "server-only";
import { sql } from "./db";
import { looksLikeToken, randomToken, sha256Hex } from "./tokens";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "ladno_sid";
export const SESSION_DAYS = 14;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export interface OwnerSession {
  idHash: string;
  expiresAt: Date;
}

/** Создаёт сеанс: возвращает значение cookie (в БД только sha256) и срок. */
export async function createSession(): Promise<{ id: string; expiresAt: Date }> {
  const id = randomToken();
  const [row] = await sql<{ expiresAt: Date }[]>`
    insert into sessions (id_hash, expires_at)
    values (${sha256Hex(id)}, now() + make_interval(days => ${SESSION_DAYS}::int))
    returning expires_at`;
  return { id, expiresAt: row.expiresAt };
}

/** Живой сеанс по значению cookie или null. Просроченные не находятся. */
export async function findSession(id: string | null | undefined): Promise<OwnerSession | null> {
  if (!id || !looksLikeToken(id)) return null;
  const [row] = await sql<OwnerSession[]>`
    update sessions set last_seen_at = now()
    where id_hash = ${sha256Hex(id)} and expires_at > now()
    returning id_hash, expires_at`;
  return row ?? null;
}

/** Сеанс по заголовку Cookie запроса (для обработчиков маршрутов). */
export function findSessionForRequest(request: Request): Promise<OwnerSession | null> {
  const raw = request.headers.get("cookie") ?? "";
  const value = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return findSession(value);
}

export async function destroySession(id: string | null | undefined): Promise<void> {
  if (id) await sql`delete from sessions where id_hash = ${sha256Hex(id)}`;
}

/** Пароль владельца верен? Если владельца нет (не засеян) — false. */
export async function verifyOwnerPassword(password: string): Promise<boolean> {
  if (!password || password.length > MAX_PASSWORD_LENGTH) return false;
  const [row] = await sql<{ passwordHash: string }[]>`select password_hash from owner where id = 1`;
  return row ? verifyPassword(password, row.passwordHash) : false;
}

export type ChangePasswordResult = { ok: true; id: string; expiresAt: Date } | { ok: false; error: string };

/**
 * Смена пароля: проверяет текущий, ставит новый, УДАЛЯЕТ ВСЕ сеансы и создаёт один новый (его id возвращается,
 * чтобы выставить cookie). Всё в одной транзакции.
 */
export async function changeOwnerPassword(current: string, next: string): Promise<ChangePasswordResult> {
  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Новый пароль — не короче ${MIN_PASSWORD_LENGTH} символов.` };
  if (next.length > MAX_PASSWORD_LENGTH) return { ok: false, error: "Новый пароль слишком длинный." };
  if (!(await verifyOwnerPassword(current))) return { ok: false, error: "Текущий пароль неверен." };
  const hash = await hashPassword(next);
  const id = randomToken();
  const expiresAt = await sql.begin(async (tx) => {
    await tx`update owner set password_hash = ${hash}, password_changed_at = now() where id = 1`;
    await tx`delete from sessions`;
    const [row] = await tx<{ expiresAt: Date }[]>`
      insert into sessions (id_hash, expires_at)
      values (${sha256Hex(id)}, now() + make_interval(days => ${SESSION_DAYS}::int))
      returning expires_at`;
    return row.expiresAt;
  });
  return { ok: true, id, expiresAt };
}
