import { api, ApiError, json } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getPublicOrder } from "@/lib/server/orders";

/** GET /api/orders/[token] — публичное представление заявки (см. PublicOrder). Без телефона, адреса, заметки и фото. */
export const GET = api(async (request: Request, ctx: RouteContext<"/api/orders/[token]">) => {
  await enforceRateLimit(request, "order-read", 120, 60);
  const { token } = await ctx.params;
  const order = await getPublicOrder(token);
  if (!order) throw new ApiError(404, "Заявка не найдена.", { code: "not_found" });
  return json(order);
});
