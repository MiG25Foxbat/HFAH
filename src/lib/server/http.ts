import "server-only";
import { createHash } from "node:crypto";

/** Ошибка API: превращается в JSON `{ error, code, fields? }` с нужным статусом. Сообщения — по-русски. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public opts: { code?: string; fields?: Record<string, string>; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** JSON-ответ; Cache-Control: no-store всегда. */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

/**
 * Обёртка обработчика маршрута: превращает ApiError в JSON-ответ, неизвестные ошибки — в 500 без деталей,
 * и всем ответам ставит Cache-Control: no-store.
 */
export function api<C = unknown>(handler: (request: Request, ctx: C) => Promise<Response>) {
  return async (request: Request, ctx?: C): Promise<Response> => {
    try {
      const res = await handler(request, ctx as C);
      res.headers.set("Cache-Control", res.headers.get("Cache-Control") ?? "no-store");
      return res;
    } catch (e) {
      if (e instanceof ApiError) {
        return json(
          { error: e.message, code: e.opts.code ?? "error", ...(e.opts.fields ? { fields: e.opts.fields } : {}) },
          { status: e.status, headers: e.opts.headers },
        );
      }
      // в лог — только суть ошибки: объект ошибки драйвера может нести тексты запроса с персональными данными
      const err = e as { name?: string; message?: string; code?: string };
      console.error("[api]", request.method, new URL(request.url).pathname, err.name, err.code, err.message);
      return json({ error: "Что-то пошло не так. Повторите попытку чуть позже.", code: "internal" }, { status: 500 });
    }
  };
}

/**
 * Защита изменяющих запросов от чужих сайтов: заголовок Origin обязателен и должен совпасть с APP_ORIGIN
 * или с адресом, на который пришёл запрос. Иначе 403.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.APP_ORIGIN) allowed.add(new URL(process.env.APP_ORIGIN).origin);
  if (!origin || !allowed.has(origin)) {
    throw new ApiError(403, "Запрос отклонён: неверный источник.", { code: "bad_origin" });
  }
}

/**
 * IP клиента для лимитов. Левые значения X-Forwarded-For присылает сам клиент, им верить нельзя:
 * берём заголовок из CLIENT_IP_HEADER (его ставит платформа, на Vercel — `x-real-ip`),
 * иначе самое правое значение X-Forwarded-For (его дописал ближайший прокси). Локально — "local".
 */
export function clientIp(source: Request | Headers): string {
  const h = source instanceof Headers ? source : source.headers;
  const trusted = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trusted) return h.get(trusted)?.split(",").pop()?.trim() || "local";
  return h.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
}

/** Читает JSON-тело (до maxBytes). 415/413/400 с понятным текстом. */
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "Ожидается JSON.", { code: "bad_content_type" });
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError(413, "Слишком большой запрос.", { code: "too_large" });
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Не удалось разобрать запрос.", { code: "bad_json" });
  }
}

/** Короткий отпечаток значения для ключей (например, IP не хранится в открытом виде). */
export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
