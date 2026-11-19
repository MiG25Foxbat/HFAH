import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { POST as uploadRoute } from "@/app/api/uploads/route";
import { DELETE as deleteUploadRoute } from "@/app/api/uploads/[id]/route";
import { GET as adminPhotoRoute } from "@/app/api/admin/photos/[id]/route";
import { sql } from "@/lib/server/db";
import { SESSION_COOKIE, createSession } from "@/lib/server/session";
import { ORIGIN, ctx, hasDb, resetData } from "./helpers";

function uploadRequest(bytes: Uint8Array, name: string, type: string, headers: Record<string, string> = { origin: ORIGIN }) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return new Request(`${ORIGIN}/api/uploads`, { method: "POST", body: form, headers: { "x-forwarded-for": "203.0.113.20", ...headers } });
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#4e8fcb" } }).png().toBuffer();

describe.skipIf(!hasDb)("загрузка фото", () => {
  beforeEach(resetData);

  it("отвергает файл с именем .jpg, внутри которого текст", async () => {
    const fake = new TextEncoder().encode("это вовсе не картинка, просто текст");
    const res = await uploadRoute(uploadRequest(fake, "photo.jpg", "image/jpeg"), undefined);
    expect(res.status).toBe(415);
    expect((await res.json()).code).toMatch(/^bad_image/);
    expect((await sql`select 1 from photos`).length).toBe(0);
  });

  it("отвергает SVG и пустой запрос", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    expect((await uploadRoute(uploadRequest(svg, "a.png", "image/png"), undefined)).status).toBe(415);
    const empty = await uploadRoute(
      new Request(`${ORIGIN}/api/uploads`, { method: "POST", body: new FormData(), headers: { origin: ORIGIN } }),
      undefined,
    );
    expect(empty.status).toBe(400);
  });

  it("принимает PNG, отдаёт WebP, уменьшает до 1600 px", async () => {
    const res = await uploadRoute(uploadRequest(await png(3000, 2000), "wall.png", "image/png"), undefined);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ width: 1600, height: 1067 });
    expect(body.key).toHaveLength(43);
    const [p] = await sql<{ mime: string; data: Buffer; bytes: number; orderId: string | null }[]>`
      select mime, data, bytes, order_id from photos where id = ${body.id}`;
    expect(p.mime).toBe("image/webp");
    expect(p.orderId).toBeNull();
    expect(p.bytes).toBe(p.data.length);
    expect((await sharp(p.data).metadata()).format).toBe("webp");
  });

  it("определяет формат по содержимому, а не по MIME от клиента", async () => {
    const res = await uploadRoute(uploadRequest(await png(40, 40), "x.txt", "text/plain"), undefined);
    expect(res.status).toBe(201);
  });

  it("чужой Origin — 403", async () => {
    const res = await uploadRoute(uploadRequest(await png(10, 10), "a.png", "image/png", { origin: "https://evil.example" }), undefined);
    expect(res.status).toBe(403);
  });

  it("ограничение: 31-я загрузка за час — 429", async () => {
    const bytes = await png(8, 8);
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await uploadRoute(uploadRequest(bytes, "a.png", "image/png"), undefined)).status;
    expect(last).toBe(429);
  });

  it("удаляет старые непривязанные фото при загрузке", async () => {
    await sql`insert into photos (upload_key_hash, mime, width, height, bytes, data, created_at)
      values ('h', 'image/webp', 1, 1, 1, ${Buffer.from([1])}, now() - interval '25 hours')`;
    await uploadRoute(uploadRequest(await png(8, 8), "a.png", "image/png"), undefined);
    expect((await sql`select 1 from photos`).length).toBe(1);
  });

  it("DELETE: только с верным ключом и только непривязанное фото", async () => {
    const up = await (await uploadRoute(uploadRequest(await png(8, 8), "a.png", "image/png"), undefined)).json();
    const del = (id: string, key?: string, origin = ORIGIN) =>
      deleteUploadRoute(
        new Request(`${ORIGIN}/api/uploads/${id}`, { method: "DELETE", headers: { origin, ...(key ? { "x-upload-key": key } : {}) } }),
        ctx({ id }),
      );
    expect((await del(up.id)).status).toBe(404);
    expect((await del(up.id, "k".repeat(43))).status).toBe(404);
    expect((await del(up.id, up.key, "https://evil.example")).status).toBe(403);
    expect((await del("не-uuid", up.key)).status).toBe(404);
    expect((await del(up.id, up.key)).status).toBe(204);
    expect((await sql`select 1 from photos`).length).toBe(0);
  });
});

describe.skipIf(!hasDb)("GET /api/admin/photos/[id]", () => {
  beforeEach(resetData);

  async function storePhoto() {
    const data = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
    const [p] = await sql<{ id: string }[]>`
      insert into photos (upload_key_hash, mime, width, height, bytes, data) values ('h', 'image/webp', 8, 8, ${data.length}, ${data}) returning id`;
    return p.id;
  }

  it("без сеанса — 401, фото не отдаётся", async () => {
    const id = await storePhoto();
    const res = await adminPhotoRoute(new Request(`${ORIGIN}/api/admin/photos/${id}`), ctx({ id }));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("с чужим или просроченным cookie — 401", async () => {
    const id = await storePhoto();
    const forged = new Request(`${ORIGIN}/api/admin/photos/${id}`, { headers: { cookie: `${SESSION_COOKIE}=${"a".repeat(43)}` } });
    expect((await adminPhotoRoute(forged, ctx({ id }))).status).toBe(401);
    const { id: sid } = await createSession();
    await sql`update sessions set expires_at = now() - interval '1 minute'`;
    const expired = new Request(`${ORIGIN}/api/admin/photos/${id}`, { headers: { cookie: `${SESSION_COOKIE}=${sid}` } });
    expect((await adminPhotoRoute(expired, ctx({ id }))).status).toBe(401);
  });

  it("владельцу — 200, WebP, private no-store", async () => {
    const id = await storePhoto();
    const { id: sid } = await createSession();
    const res = await adminPhotoRoute(
      new Request(`${ORIGIN}/api/admin/photos/${id}`, { headers: { cookie: `other=1; ${SESSION_COOKIE}=${sid}` } }),
      ctx({ id }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe("webp");
  });

  it("несуществующее фото — 404", async () => {
    const { id: sid } = await createSession();
    const id = "00000000-0000-4000-8000-000000000000";
    const res = await adminPhotoRoute(new Request(`${ORIGIN}/api/admin/photos/${id}`, { headers: { cookie: `${SESSION_COOKIE}=${sid}` } }), ctx({ id }));
    expect(res.status).toBe(404);
  });
});
