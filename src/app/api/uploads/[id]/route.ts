import { z } from "zod";
import { api, assertSameOrigin, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { sha256Hex } from "@/lib/server/tokens";
import { sql } from "@/lib/server/db";

/** DELETE /api/uploads/[id] с заголовком X-Upload-Key — удаляет только ещё не прикреплённое к заявке фото. */
export const DELETE = api(async (request: Request, ctx: RouteContext<"/api/uploads/[id]">) => {
  assertSameOrigin(request);
  await enforceRateLimit(request, "upload-delete", 60, 3600);
  const { id } = await ctx.params;
  const key = request.headers.get("x-upload-key") ?? "";
  if (!z.uuid().safeParse(id).success || !key) throw new ApiError(404, "Фото не найдено.", { code: "not_found" });
  const rows = await sql`
    delete from photos where id = ${id} and order_id is null and upload_key_hash = ${sha256Hex(key)} returning id`;
  if (!rows.length) throw new ApiError(404, "Фото не найдено.", { code: "not_found" });
  return new Response(null, { status: 204 });
});
