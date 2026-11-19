import { api, assertSameOrigin, ApiError, json } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { MAX_UPLOAD_BYTES, normalizeImage } from "@/lib/server/photos";
import { randomToken, sha256Hex } from "@/lib/server/tokens";
import { sql } from "@/lib/server/db";

/** POST /api/uploads — multipart, поле `file`. Возвращает { id, key, width, height, bytes }; `key` нужен для удаления и привязки к заявке. */
export const POST = api(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(request, "upload", 30, 3600);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 512 * 1024) {
    throw new ApiError(413, "Файл больше 12 МБ.", { code: "file_too_large" });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "Не удалось получить файл.", { code: "bad_form" });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "Выберите файл с фото.", { code: "no_file" });
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Файл больше 12 МБ.", { code: "file_too_large" });

  const image = await normalizeImage(Buffer.from(await file.arrayBuffer()));
  const key = randomToken();
  const [row] = await sql<{ id: string }[]>`
    insert into photos (upload_key_hash, mime, width, height, bytes, data)
    values (${sha256Hex(key)}, 'image/webp', ${image.width}, ${image.height}, ${image.bytes}, ${image.data})
    returning id`;
  // заодно убираем фото, которые так и не привязали к заявке
  await sql`delete from photos where order_id is null and created_at < now() - interval '24 hours'`;
  return json({ id: row.id, key, width: image.width, height: image.height, bytes: image.bytes }, { status: 201 });
});
