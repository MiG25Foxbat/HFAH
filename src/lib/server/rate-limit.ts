import "server-only";
import { ApiError, clientIp, shortHash } from "./http";
import { sql } from "./db";

export interface RateLimitResult {
  ok: boolean;
  count: number;
  /** Через сколько секунд окно закончится. */
  retryAfterSec: number;
}

/**
 * Фиксированное окно в Postgres (работает на serverless). Атомарно: один upsert увеличивает счётчик.
 * Попытка засчитывается и когда лимит уже превышен.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const [row] = await sql<{ count: number; windowStart: Date }[]>`
    insert into rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}::int) * ${windowSec}::int), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count, window_start`;
  // изредка чистим старые окна
  if (Math.random() < 0.01) void sql`delete from rate_limits where window_start < now() - interval '2 days'`.catch(() => {});
  return {
    ok: row.count <= limit,
    count: row.count,
    retryAfterSec: Math.max(1, Math.ceil((row.windowStart.getTime() + windowSec * 1000 - Date.now()) / 1000)),
  };
}

/** rateLimit по IP клиента для области `scope`; при превышении — ApiError 429 с Retry-After. */
export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSec: number): Promise<void> {
  const r = await rateLimit(`${scope}:${shortHash(clientIp(request))}`, limit, windowSec);
  if (!r.ok) {
    throw new ApiError(429, "Слишком много запросов. Попробуйте позже.", {
      code: "rate_limited",
      headers: { "Retry-After": String(r.retryAfterSec) },
    });
  }
}
