import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

/** Случайный токен 32 байта, base64url (43 символа): id сеанса, ключ загрузки. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 в hex — так в БД хранятся токены, ключи и id сеансов (сами значения не хранятся). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Токен выглядит как токен (43 символа base64url) — дешёвая проверка до обращения к БД. */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Приватный токен заявки: HMAC-SHA256(TOKEN_SECRET, Idempotency-Key), base64url.
 * Детерминирован, поэтому повтор запроса с тем же ключом возвращает ту же ссылку, а в БД лежит только sha256.
 */
export function orderToken(idempotencyKey: string): string {
  const secret = process.env.TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("TOKEN_SECRET не задан или короче 32 символов (см. .env.example)");
  return createHmac("sha256", secret).update(idempotencyKey.toLowerCase()).digest("base64url");
}
