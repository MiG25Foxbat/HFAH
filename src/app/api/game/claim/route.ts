import { z } from "zod";
import { api, assertSameOrigin, ApiError, json, readJson } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { claimBonus } from "@/lib/server/bonus";

/** POST /api/game/claim { token } — бонусный код за игру (один на заявку, повтор возвращает тот же). 409, если бонус выключен. */
export const POST = api(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(request, "claim", 20, 3600);
  const body = z.object({ token: z.string().min(1).max(100) }).safeParse(await readJson(request));
  if (!body.success) throw new ApiError(400, "Не указана заявка.", { code: "bad_request" });
  return json(await claimBonus(body.data.token));
});
