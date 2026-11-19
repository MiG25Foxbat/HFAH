import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { GET as getOrderRoute } from "@/app/api/orders/[token]/route";
import { POST as uploadRoute } from "@/app/api/uploads/route";
import { sql } from "@/lib/server/db";
import { ORIGIN, ctx, hasDb, jsonRequest, newKey, resetData, validOrder } from "./helpers";

const post = (body: unknown, key = newKey(), headers: Record<string, string> = {}) =>
  createOrderRoute(jsonRequest("/api/orders", body, { "idempotency-key": key, ...headers }));

async function uploadPng() {
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c08a55" } }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([new Uint8Array(png)], "wall.png", { type: "image/png" }));
  const res = await uploadRoute(new Request(`${ORIGIN}/api/uploads`, { method: "POST", body: form, headers: { origin: ORIGIN } }), undefined);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; key: string };
}

describe.skipIf(!hasDb)("POST /api/orders", () => {
  beforeEach(resetData);

  it("пересчитывает цену на сервере и игнорирует суммы клиента", async () => {
    const body = validOrder({
      total: 1,
      knownTotal: 1,
      price: 1,
      lines: [{ serviceId: "t-faucet", qty: 1, complex: true, dismantle: true, unitPrice: 1, total: 1 }],
    });
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { number, token, url } = await res.json();
    expect(number).toBe(1);
    expect(url).toBe(`/o/${token}`);

    const [o] = await sql`select known_total, pricing_snapshot, phone, status, consent_at, est_minutes from orders`;
    expect(o.knownTotal).toBe(3410); // 2200 × 1,55 → 3410 ≥ минимума
    expect(o.pricingSnapshot.lines[0]).toMatchObject({ unitPrice: 2200, pct: 55, total: 3410, title: "Замена смесителя", memo: "памятка" });
    expect(o.pricingSnapshot.settings.hourRate).toBe(1500);
    expect(o.phone).toBe("+79161234567");
    expect(o.status).toBe("new");
    expect(o.consentAt).toBeInstanceOf(Date);
    expect(o.estMinutes).toBe(60);
    const events = await sql`select kind from order_events`;
    expect(events.map((e) => e.kind)).toEqual(["created"]);
  });

  it("повтор с тем же ключом возвращает ту же заявку и не создаёт дубль", async () => {
    const key = newKey();
    const first = await (await post(validOrder(), key)).json();
    const again = await post(validOrder(), key);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders`;
    expect(n).toBe(1);
  });

  it("параллельные повторы с одним ключом дают одну заявку", async () => {
    const key = newKey();
    const results = await Promise.all([post(validOrder(), key), post(validOrder(), key), post(validOrder(), key)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201].sort());
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders`;
    expect(n).toBe(1);
  });

  it("тот же ключ с другим содержимым — 409", async () => {
    const key = newKey();
    await post(validOrder(), key);
    const res = await post(validOrder({ address: "Совсем другой адрес, 5" }), key);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("idempotency_conflict");
  });

  it("публичный JSON не содержит телефон, адрес, доступ, заметку и фото", async () => {
    const { token } = await (await post(validOrder({ comment: "Позвоните заранее" }))).json();
    await sql`update orders set owner_note = 'СЕКРЕТНАЯ-ЗАМЕТКА'`;
    const res = await getOrderRoute(new Request(`${ORIGIN}/api/orders/${token}`), ctx({ token }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    for (const secret of ["+79161234567", "9161234567", "Вымышленная", "12К", "СЕКРЕТНАЯ", "ownerNote", "owner_note", "phone", "address", "access"]) {
      expect(text).not.toContain(secret);
    }
    const pub = JSON.parse(text);
    expect(pub).toMatchObject({
      number: 1,
      status: "new",
      materials: "have",
      photoCount: 0,
      finalPrice: null,
      agreedAt: null,
      bonus: null,
      totals: { subtotal: 3500, worksTotal: 3500, knownTotal: 3500, hasManual: false },
      game: { mode: "bonus", bonusAmount: 300 },
    });
    expect(pub.lines[0]).toMatchObject({ title: "Сборка шкафа", qty: 1, unit: "pcs", unitPrice: 3500, total: 3500 });
  });

  it("публичная заявка показывает изменения владельца", async () => {
    const { token } = await (await post(validOrder())).json();
    await sql`update orders set status = 'agreed', final_price = 4000, agreed_at = '2026-12-01T10:00:00Z'`;
    const pub = await (await getOrderRoute(new Request(`${ORIGIN}/api/orders/${token}`), ctx({ token }))).json();
    expect(pub).toMatchObject({ status: "agreed", finalPrice: 4000, agreedAt: "2026-12-01T10:00:00.000Z" });
  });

  it("неизвестный и битый токен — 404", async () => {
    for (const token of ["x".repeat(43), "short", "!".repeat(43)]) {
      const res = await getOrderRoute(new Request(`${ORIGIN}/api/orders/${token}`), ctx({ token }));
      expect(res.status).toBe(404);
    }
  });

  it("«Другое» без фото отклоняется, с описанием и фото — принимается и фото привязывается", async () => {
    const manual = (description: string) => [{ serviceId: "t-other", qty: 1, complex: false, dismantle: false, description }];
    const noPhoto = await post(validOrder({ lines: manual("Починить странную дверцу у шкафа") }));
    expect(noPhoto.status).toBe(422);
    expect((await noPhoto.json()).fields.photos).toMatch(/фото/);

    const shortDesc = await post(validOrder({ lines: manual("дверца") }));
    expect(shortDesc.status).toBe(422);
    expect((await shortDesc.json()).fields["lines.0.description"]).toBeTruthy();

    const photo = await uploadPng();
    const ok = await post(validOrder({ lines: manual("Починить странную дверцу у шкафа"), photos: [photo] }));
    expect(ok.status).toBe(201);
    const [o] = await sql`select known_total, has_manual from orders`;
    expect(o).toMatchObject({ knownTotal: null, hasManual: true });
    const [p] = await sql`select order_id from photos where id = ${photo.id}`;
    expect(p.orderId).not.toBeNull();
  });

  it("смешанный заказ: известная сумма отдельно, «По фото» без цены", async () => {
    const photo = await uploadPng();
    const lines = [
      { serviceId: "t-wardrobe", qty: 1, complex: false, dismantle: false },
      { serviceId: "t-other", qty: 1, complex: false, dismantle: false, description: "Заменить что-то необычное на кухне" },
    ];
    const { token } = await (await post(validOrder({ lines, photos: [photo] }))).json();
    const pub = await (await getOrderRoute(new Request(`${ORIGIN}/api/orders/${token}`), ctx({ token }))).json();
    expect(pub.totals).toMatchObject({ knownTotal: 3500, hasManual: true });
    expect(pub.lines[1]).toMatchObject({ unitPrice: null, total: null });
    expect(pub.photoCount).toBe(1);
  });

  it("чужой или повторно использованный ключ фото отклоняется", async () => {
    const photo = await uploadPng();
    const lines = [{ serviceId: "t-other", qty: 1, complex: false, dismantle: false, description: "Описание задачи подробное" }];
    const bad = await post(validOrder({ lines, photos: [{ id: photo.id, key: "k".repeat(43) }] }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).fields.photos).toBeTruthy();
    expect((await sql`select 1 from orders`).length).toBe(0); // транзакция откатилась

    expect((await post(validOrder({ lines, photos: [photo] }))).status).toBe(201);
    const reuse = await post(validOrder({ lines, photos: [photo], address: "Другой адрес, дом 9" }));
    expect(reuse.status).toBe(422); // фото уже привязано
  });

  it("неизвестная и неактивная работа — 422", async () => {
    for (const serviceId of ["t-gone", "nope-nope"]) {
      const res = await post(validOrder({ lines: [{ serviceId, qty: 1 }] }));
      expect(res.status).toBe(422);
      expect((await res.json()).fields["lines.0"]).toMatch(/недоступна/);
    }
    const badQty = await post(validOrder({ lines: [{ serviceId: "t-wardrobe", qty: 0.5 }] }));
    expect(badQty.status).toBe(422);
  });

  it("ошибки валидации — по-русски и по полям", async () => {
    const res = await post({ name: "А", phone: "123", address: "", materials: "x", consent: false, lines: [] });
    expect(res.status).toBe(422);
    const { fields } = await res.json();
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(["name", "phone", "address", "materials", "consent", "lines"]));
    expect(fields.phone).toBe("Укажите телефон — по нему мастер согласует выезд.");
    expect(fields.consent).toMatch(/согласие/);
  });

  it("время без даты и дата в прошлом отклоняются", async () => {
    const noDate = await (await post(validOrder({ desiredTime: "12:00–15:00" }))).json();
    expect(noDate.fields.desiredTime).toMatch(/дату/);
    const past = await (await post(validOrder({ desiredDate: "2020-01-01" }))).json();
    expect(past.fields.desiredDate).toMatch(/прошла/);
    const far = await post(validOrder({ desiredDate: "2099-01-01", desiredTime: "14:30" }));
    expect(far.status).toBe(422); // слишком далеко
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const fine = await post(validOrder({ desiredDate: tomorrow, desiredTime: "12:00–15:00" }));
    expect(fine.status).toBe(201);
    const [o] = await sql`select desired_date::text as d, desired_time from orders`;
    expect(o).toEqual({ d: tomorrow, desiredTime: "12:00–15:00" });
  });

  it("не берём: совпадения сохраняются для владельца, заявка не блокируется", async () => {
    const res = await post(validOrder({ comment: "Ещё надо поменять газовую плиту" }));
    expect(res.status).toBe(201);
    const [o] = await sql`select excluded_matches from orders`;
    expect(o.excludedMatches).toEqual([{ title: "Газовое оборудование", keyword: "газов", source: "comment" }]);
  });

  it("чужой Origin и отсутствие Origin — 403; нет Idempotency-Key — 400", async () => {
    const evil = await post(validOrder(), newKey(), { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const noOrigin = await createOrderRoute(
      new Request(`${ORIGIN}/api/orders`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": newKey() },
        body: JSON.stringify(validOrder()),
      }),
      undefined,
    );
    expect(noOrigin.status).toBe(403);
    const noKey = await createOrderRoute(jsonRequest("/api/orders", validOrder()), undefined);
    expect(noKey.status).toBe(400);
    expect((await sql`select 1 from orders`).length).toBe(0);
  });

  it("ограничение частоты: 11-я заявка за час с одного IP — 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post({ name: "x" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 422)).toBe(true);
    expect(statuses[10]).toBe(429);
    const last = await post({ name: "x" });
    expect(last.headers.get("retry-after")).toMatch(/^\d+$/);
    // другой IP не затронут
    expect((await post({ name: "x" }, newKey(), { "x-forwarded-for": "198.51.100.9" })).status).toBe(422);
  });
});
