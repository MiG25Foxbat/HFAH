import { z } from "zod";
import { api, assertSameOrigin, ApiError, json, readJson } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createOrder } from "@/lib/server/orders";
import { orderSchema, zodFields } from "@/lib/order-schema";

/**
 * POST /api/orders. Заголовок Idempotency-Key (UUID) обязателен.
 * 201 { number, token, url } — новая заявка; 200 с теми же полями — повтор того же запроса; 409 — ключ с другим содержимым.
 */
export const POST = api(async (request: Request) => {
  assertSameOrigin(request);
  const key = request.headers.get("idempotency-key") ?? "";
  if (!z.uuid().safeParse(key).success) {
    throw new ApiError(400, "Нужен заголовок Idempotency-Key (UUID).", { code: "bad_idempotency_key" });
  }
  await enforceRateLimit(request, "orders", 10, 3600);

  const parsed = orderSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(422, "Проверьте поля формы.", { code: "validation", fields: zodFields(parsed.error) });
  }
  const order = await createOrder(parsed.data, key);
  return json({ number: order.number, token: order.token, url: order.url }, { status: order.replay ? 200 : 201 });
});
