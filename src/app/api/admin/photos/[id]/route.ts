import { z } from "zod";
import { api, ApiError } from "@/lib/server/http";
import { findSessionForRequest } from "@/lib/server/session";
import { sql } from "@/lib/server/db";

/** GET /api/admin/photos/[id] — фото заявки, только владельцу (cookie сеанса). */
export const GET = api(async (request: Request, ctx: RouteContext<"/api/admin/photos/[id]">) => {
  if (!(await findSessionForRequest(request))) throw new ApiError(401, "Требуется вход.", { code: "unauthorized" });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "Фото не найдено.", { code: "not_found" });
  const [photo] = await sql<{ mime: string; data: Buffer }[]>`select mime, data from photos where id = ${id}`;
  if (!photo) throw new ApiError(404, "Фото не найдено.", { code: "not_found" });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});
