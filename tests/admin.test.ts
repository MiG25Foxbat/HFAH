import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderSchema } from "@/lib/order-schema";
import { createOrder } from "@/lib/server/orders";
import { sql } from "@/lib/server/db";
import { createSession, findSession } from "@/lib/server/session";
import { deleteOrder, getOrderDetail, listOrders, saveDeal, saveNote } from "@/lib/server/admin/orders";
import { listBonusCodes, setBonusStatus } from "@/lib/server/admin/bonus";
import { saveSection, saveService } from "@/lib/server/admin/tariffs";
import { parseOrderQuery } from "@/lib/admin/filters";
import { parseCompanyForm, parseDealForm, parsePasswordForm, parsePricingForm } from "@/lib/admin/schemas";
import { buildTripMemo } from "@/lib/admin/memo";
import { describeEvent } from "@/lib/admin/events";
import { formatDateTime, fromInputs, toInputs } from "@/lib/admin/format";
import { OWNER_PASSWORD, hasDb, newKey, resetData, validOrder } from "./helpers";

// Server Actions вызываются как обычные функции: Next-часть (cookies, redirect, refresh) подменена.
const cookieJar = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieJar, headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
}));
const requireOwner = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/auth")>()), requireOwner }));

const actions = await import("@/app/admin/actions");

async function makeOrder(over: Record<string, unknown> = {}) {
  const created = await createOrder(orderSchema.parse(validOrder(over)), newKey());
  const [row] = await sql<{ id: string }[]>`select id from orders where number = ${created.number}`;
  return { ...created, id: row.id };
}

const FUTURE = new Date("2030-01-15T07:00:00Z"); // 10:00 по Москве

describe("проверка форм кабинета (без БД)", () => {
  it("«Согласована» требует цену и время; время требует дату", () => {
    expect(parseDealForm({ status: "agreed", finalPrice: "", agreedDate: "", agreedTime: "" })).toMatchObject({
      ok: false,
      fields: { finalPrice: expect.any(String), agreedDate: expect.any(String), agreedTime: expect.any(String) },
    });
    expect(parseDealForm({ status: "agreed", finalPrice: "3500", agreedDate: "2030-01-15", agreedTime: "" })).toMatchObject({ ok: false });
    expect(parseDealForm({ status: "new", finalPrice: "", agreedDate: "", agreedTime: "10:00" })).toMatchObject({ ok: false, fields: { agreedDate: expect.any(String) } });
    expect(parseDealForm({ status: "new", finalPrice: "12.5", agreedDate: "", agreedTime: "" })).toMatchObject({ ok: false, fields: { finalPrice: expect.any(String) } });
    expect(parseDealForm({ status: "bogus", finalPrice: "", agreedDate: "", agreedTime: "" })).toMatchObject({ ok: false, fields: { status: expect.any(String) } });
    const ok = parseDealForm({ status: "agreed", finalPrice: "3500", agreedDate: "2030-01-15", agreedTime: "10:00" });
    expect(ok.ok && ok.data).toMatchObject({ status: "agreed", finalPrice: 3500 });
    expect(ok.ok && ok.data.agreedAt?.toISOString()).toBe(FUTURE.toISOString());
  });

  it("московское время туда и обратно", () => {
    expect(fromInputs("2030-01-15", "10:00")?.toISOString()).toBe("2030-01-15T07:00:00.000Z");
    expect(toInputs(FUTURE)).toEqual({ date: "2030-01-15", time: "10:00" });
    expect(fromInputs("2030-02-30", "10:00")).toBeNull();
    expect(formatDateTime(new Date("2026-11-19T11:05:00Z"), new Date("2026-11-20T00:00:00Z"))).toBe("19 нояб., 14:05");
  });

  it("цены, компания, пароль", () => {
    expect(parsePricingForm({ hourRate: "1 500", minOrder: "2500", complexPct: "25", dismantlePct: "30", urgentPct: "40", outOfTownFee: "1000" })).toMatchObject({ ok: true });
    expect(parsePricingForm({ hourRate: "", minOrder: "-1", complexPct: "x", dismantlePct: "30", urgentPct: "40", outOfTownFee: "1000" })).toMatchObject({
      ok: false,
      fields: { hourRate: expect.any(String), minOrder: expect.any(String), complexPct: expect.any(String) },
    });
    const company = {
      name: "Ладно", city: "Москва", territory: "", accent: "", phone: "8 (916) 123-45-67", telegram: "t.me/ladno_master", whatsapp: "", email: "",
      excluded: [{ title: "Газ", hint: "", keywords: "Газов, котёл, газов" }],
    };
    const ok = parseCompanyForm(company);
    expect(ok.ok && ok.data.contacts).toEqual({ phone: "+79161234567", telegram: "@ladno_master", whatsapp: "", email: "" });
    expect(ok.ok && ok.data.excluded[0].keywords).toEqual(["газов", "котел"]);
    expect(parseCompanyForm({ ...company, phone: "12345", email: "не-почта" })).toMatchObject({ ok: false, fields: { phone: expect.any(String), email: expect.any(String) } });
    expect(parseCompanyForm({ ...company, excluded: [{ title: "", hint: "", keywords: "а" }] })).toMatchObject({ ok: false, fields: { "excluded.0.title": expect.any(String), "excluded.0.keywords": expect.any(String) } });
    expect(parsePasswordForm({ current: "a", next: "short", repeat: "short" }, 10)).toMatchObject({ ok: false, fields: { next: expect.any(String) } });
    expect(parsePasswordForm({ current: "a", next: "long-enough-1", repeat: "other-long-1" }, 10)).toMatchObject({ ok: false, fields: { repeat: expect.any(String) } });
    expect(parsePasswordForm({ current: "a", next: "long-enough-1", repeat: "long-enough-1" }, 10)).toMatchObject({ ok: true });
  });

  it("фильтры списка читаются из адреса", () => {
    expect(parseOrderQuery({ q: "  Иван ", status: "agreed", period: "7d", n: "250" })).toEqual({ q: "Иван", status: "agreed", period: "7d", limit: 300 });
    expect(parseOrderQuery({ status: "хак", period: "all", n: "-5" })).toEqual({ q: "", status: "all", period: "all", limit: 100 });
  });

  it("памятка для выезда: объединяет одинаковые тексты и напоминает об условиях", () => {
    const line = (title: string, memo: string, extra = {}) => ({ title, memo, qty: 1, unit: "pcs", complex: false, dismantle: false, ...extra });
    const snapshot = {
      lines: [line("A", "Шуруповёрт"), line("B", "Шуруповёрт"), line("C", ""), line("D", "Перфоратор", { complex: true })],
      flags: { urgent: true, outOfTown: false },
      hasManual: false,
      minutes: 90,
    } as never;
    const memo = buildTripMemo(snapshot, "master");
    expect(memo.groups).toHaveLength(2);
    expect(memo.groups[0].titles).toHaveLength(2);
    expect(memo.missing).toEqual(["C"]);
    expect(memo.materials).toMatch(/чеку/);
    expect(memo.reminders.join(" ")).toMatch(/Срочный/);
    expect(memo.reminders.join(" ")).toMatch(/Сложные условия/);
  });

  it("история описывает события, неизвестные не прячет", () => {
    expect(describeEvent("status", { from: "new", to: "agreed" })).toBe("Статус: Новая → Согласована");
    expect(describeEvent("price", { from: null, to: 3500 })).toContain("3 500");
    expect(describeEvent("mystery", {})).toBe("mystery");
  });
});

describe.skipIf(!hasDb)("заявки в кабинете", () => {
  beforeEach(async () => {
    await resetData();
    requireOwner.mockReset();
    requireOwner.mockResolvedValue({ idHash: "x", expiresAt: new Date() });
  });

  it("«согласована» без цены или времени не сохраняется; с ценой и временем — да, история пишется", async () => {
    const o = await makeOrder();
    const bad = await saveDeal(o.id, { status: "agreed", finalPrice: null, agreedAt: null });
    expect(bad).toMatchObject({ ok: false, fields: { finalPrice: expect.any(String), agreedDate: expect.any(String) } });
    expect((await getOrderDetail(o.id))?.status).toBe("new");

    // даже в обход проверок ограничение БД не пускает
    await expect(sql`update orders set status = 'agreed' where id = ${o.id}`).rejects.toMatchObject({ code: "23514" });

    const before = (await getOrderDetail(o.id))!;
    const ok = await saveDeal(o.id, { status: "agreed", finalPrice: 4000, agreedAt: FUTURE });
    expect(ok.ok).toBe(true);
    const after = (await getOrderDetail(o.id))!;
    expect(after).toMatchObject({ status: "agreed", finalPrice: 4000 });
    expect(after.agreedAt?.toISOString()).toBe(FUTURE.toISOString());
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(after.events.map((e) => e.kind).sort()).toEqual(["agreed", "created", "price", "status"]);

    expect(await saveDeal(o.id, { status: "agreed", finalPrice: 4000, agreedAt: FUTURE })).toEqual({ ok: true, message: "Изменений нет." });
    expect((await getOrderDetail(o.id))!.events).toHaveLength(4);
  });

  it("заметка приватна: в историю попадает факт, а не текст; публичный вид её не содержит", async () => {
    const o = await makeOrder();
    await saveNote(o.id, "секретная заметка владельца");
    const d = (await getOrderDetail(o.id))!;
    expect(d.ownerNote).toBe("секретная заметка владельца");
    expect(JSON.stringify(d.events)).not.toContain("секретная");
    const { getPublicOrder } = await import("@/lib/server/orders");
    expect(JSON.stringify(await getPublicOrder(o.token))).not.toContain("секретная");
  });

  it("удаление убирает заявку, фото, историю и бонусный код", async () => {
    const o = await makeOrder();
    await sql`insert into photos (order_id, upload_key_hash, mime, width, height, bytes, data)
              values (${o.id}, 'h', 'image/webp', 10, 10, 1, ${Buffer.from("x")}), (${o.id}, 'h2', 'image/webp', 10, 10, 1, ${Buffer.from("y")})`;
    await sql`insert into bonus_codes (order_id, code, amount, min_order, expires_at) values (${o.id}, 'LAD-TEST-0001', 300, 3000, now() + interval '1 day')`;
    const res = await deleteOrder(o.id);
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining("(2)") });
    for (const table of ["orders", "photos", "order_events", "bonus_codes"]) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`;
      expect(n, table).toBe(0);
    }
    expect(await getOrderDetail(o.id)).toBeNull();
    expect(await deleteOrder(o.id)).toMatchObject({ ok: false });
    expect(await deleteOrder("не-uuid")).toMatchObject({ ok: false });
  });

  it("поиск: номер, имя без учёта регистра, телефон в любом формате, адрес, название работы; фильтры и счётчики", async () => {
    const a = await makeOrder({ name: "Иван Петров", phone: "+7 903 555-12-34", address: "Москва, ул. Лесная, д. 5" });
    await makeOrder({ name: "Мария Ёлкина", phone: "8 (916) 777-00-11", address: "Мытищи, пр-т Мира, 3", lines: [{ serviceId: "t-faucet", qty: 1, complex: false, dismantle: false }] });
    await saveDeal(a.id, { status: "done", finalPrice: null, agreedAt: null });

    const find = async (q: string, extra: Record<string, string> = {}) => (await listOrders(parseOrderQuery({ q, ...extra }))).rows.map((r) => r.customerName);
    expect(await find("")).toHaveLength(2);
    expect(await find("ИВАН")).toEqual(["Иван Петров"]);
    expect(await find("елкина")).toEqual(["Мария Ёлкина"]);
    expect(await find("№" + a.number)).toEqual(["Иван Петров"]);
    expect(await find("9035551234")).toEqual(["Иван Петров"]);
    expect(await find("+7 (916) 777")).toEqual(["Мария Ёлкина"]);
    expect(await find("8 916 777")).toEqual(["Мария Ёлкина"]);
    expect(await find("мытищи")).toEqual(["Мария Ёлкина"]);
    expect(await find("смесителя")).toEqual(["Мария Ёлкина"]);
    expect(await find("сборка шкафа")).toEqual(["Иван Петров"]);
    expect(await find("%")).toEqual([]);
    expect(await find("", { status: "done" })).toEqual(["Иван Петров"]);
    const { counts } = await listOrders(parseOrderQuery({ status: "done" }));
    expect(counts).toEqual({ new: 1, agreed: 0, done: 1, cancelled: 0 });
    expect(await find("", { period: "today" })).toHaveLength(2);
    expect((await listOrders(parseOrderQuery({}))).rows[0].customerName).toBe("Мария Ёлкина"); // новые сверху
  });

  it("бонусные коды: погашен / аннулирован / вернуть, событие в истории заявки", async () => {
    const o = await makeOrder();
    await sql`insert into bonus_codes (order_id, code, amount, min_order, expires_at) values (${o.id}, 'LAD-TEST-0002', 300, 3000, now() - interval '1 day')`;
    const [code] = await listBonusCodes();
    expect(code).toMatchObject({ status: "issued", orderNumber: o.number, expired: true });
    expect(await setBonusStatus(code.id, "redeemed")).toEqual({ ok: true });
    expect((await listBonusCodes())[0]).toMatchObject({ status: "redeemed", expired: false });
    expect((await listBonusCodes())[0].redeemedAt).toBeInstanceOf(Date);
    await setBonusStatus(code.id, "issued");
    expect((await listBonusCodes())[0].redeemedAt).toBeNull();
    expect((await getOrderDetail(o.id))!.events.filter((e) => e.kind === "bonus")).toHaveLength(2);
    expect(await setBonusStatus(999999, "void")).toMatchObject({ ok: false });
  });
});

describe.skipIf(!hasDb)("тарифы", () => {
  beforeEach(resetData);

  it("правка цены: новая заявка считается по новой цене, снимок старой не меняется", async () => {
    const old = await makeOrder();
    const res = await saveService("t-wardrobe", { price: "5000", minutes: "150", dismantleAllowed: false, active: true, memo: "новая памятка" });
    expect(res.ok).toBe(true);
    const fresh = await makeOrder();
    const [o1, o2] = await Promise.all([getOrderDetail(old.id), getOrderDetail(fresh.id)]);
    expect(o1!.snapshot.lines[0].unitPrice).toBe(3500);
    expect(o1!.snapshot.lines[0].memo).toBe("памятка");
    expect(o2!.snapshot.lines[0].unitPrice).toBe(5000);
    expect(o2!.snapshot.lines[0].memo).toBe("новая памятка");
  });

  it("проверка: цена только целая у фиксированных; у почасовой и «по фото» цену не принимаем", async () => {
    expect(await saveService("t-wardrobe", { price: "12,5", minutes: "10", dismantleAllowed: false, active: true, memo: "" })).toMatchObject({ ok: false, fields: { price: expect.any(String) } });
    expect(await saveService("t-wardrobe", { price: "100", minutes: "-1", dismantleAllowed: false, active: true, memo: "" })).toMatchObject({ ok: false, fields: { minutes: expect.any(String) } });
    expect(await saveService("t-hourly", { price: "999", minutes: "5", dismantleAllowed: true, active: true, memo: "ключи" })).toMatchObject({ ok: true });
    const [h] = await sql`select price, minutes, dismantle_allowed, memo from services where id = 't-hourly'`;
    expect(h).toMatchObject({ price: null, minutes: 60, dismantleAllowed: false, memo: "ключи" });
    expect(await saveService("t-other", { price: "", minutes: "", dismantleAllowed: false, active: false, memo: "" })).toMatchObject({ ok: true });
    expect(await saveService("нет-такой", { price: "1", minutes: "1", dismantleAllowed: false, active: true, memo: "" })).toMatchObject({ ok: false });
  });

  it("настройки: цена часа и минимум меняются, неверное не пишется", async () => {
    expect(await saveSection("pricing", { hourRate: "1800", minOrder: "3000", complexPct: "20", dismantlePct: "30", urgentPct: "50", outOfTownFee: "1200" })).toMatchObject({ ok: true });
    const [row] = await sql`select pricing from settings where id = 1`;
    expect(row.pricing).toMatchObject({ hourRate: 1800, minOrder: 3000, urgentPct: 50 });
    expect(await saveSection("pricing", { hourRate: "abc" })).toMatchObject({ ok: false });
    expect(await saveSection("game", { mode: "bonus", bonusAmount: "300", validDays: "0", minNextOrder: "3000" })).toMatchObject({ ok: false, fields: { validDays: expect.any(String) } });
    expect(await saveSection("game", { mode: "off", bonusAmount: "300", validDays: "30", minNextOrder: "3000" })).toMatchObject({ ok: true });
    expect(await saveSection("characters", { personality: "cheerful", facesEnabled: false, phrasesEnabled: true })).toMatchObject({ ok: true });
    expect(await saveSection("characters", { personality: "angry", facesEnabled: true, phrasesEnabled: true })).toMatchObject({ ok: false });
  });
});

describe.skipIf(!hasDb)("Server Actions", () => {
  beforeEach(async () => {
    await resetData();
    requireOwner.mockReset();
    cookieJar.set.mockClear();
    cookieJar.delete.mockClear();
  });

  it("каждое действие, кроме входа, первым делом требует владельца и без него ничего не меняет", async () => {
    const o = await makeOrder();
    const names = Object.keys(actions).filter((n) => n !== "loginAction");
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const name of names) {
      requireOwner.mockReset();
      requireOwner.mockRejectedValueOnce(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/login;307;" }));
      const fn = (actions as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name];
      await expect(fn(o.id, { status: "cancelled", finalPrice: "1", note: "x", mode: "off" }), name).rejects.toThrow("NEXT_REDIRECT");
      expect(requireOwner, name).toHaveBeenCalledTimes(1);
    }
    expect(await getOrderDetail(o.id)).toMatchObject({ status: "new", ownerNote: "" });
  });

  it("сохранение решения через действие и ошибка у поля", async () => {
    requireOwner.mockResolvedValue({ idHash: "x", expiresAt: new Date() });
    const o = await makeOrder();
    expect(await actions.saveDealAction(o.id, { status: "agreed", finalPrice: "", agreedDate: "", agreedTime: "" })).toMatchObject({ ok: false, fields: { finalPrice: expect.any(String) } });
    expect(await actions.saveDealAction(o.id, { status: "agreed", finalPrice: "4000", agreedDate: "2030-01-15", agreedTime: "10:00" })).toMatchObject({ ok: true });
    expect(await getOrderDetail(o.id)).toMatchObject({ status: "agreed", finalPrice: 4000 });
  });

  it("удаление через действие ведёт в список", async () => {
    requireOwner.mockResolvedValue({ idHash: "x", expiresAt: new Date() });
    const o = await makeOrder();
    await expect(actions.deleteOrderAction(o.id)).rejects.toMatchObject({ digest: expect.stringContaining("/admin?deleted=1") });
    expect(await getOrderDetail(o.id)).toBeNull();
  });

  it("смена пароля закрывает все прежние сеансы и выдаёт новый; чужой пароль не принимается", async () => {
    requireOwner.mockResolvedValue({ idHash: "x", expiresAt: new Date() });
    const [a, b] = await Promise.all([createSession(), createSession()]);
    expect(await actions.changePasswordAction({ current: "не тот пароль", next: "new-password-123", repeat: "new-password-123" })).toMatchObject({ ok: false, fields: { current: expect.any(String) } });
    expect(await findSession(a.id)).not.toBeNull();

    expect(await actions.changePasswordAction({ current: OWNER_PASSWORD, next: "new-password-123", repeat: "new-password-123" })).toMatchObject({ ok: true });
    expect(await findSession(a.id)).toBeNull();
    expect(await findSession(b.id)).toBeNull();
    expect(cookieJar.set).toHaveBeenCalledTimes(1);
    const newId = cookieJar.set.mock.calls[0][1] as string;
    expect(await findSession(newId)).not.toBeNull();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sessions`;
    expect(n).toBe(1);
  });

  it("«выйти на всех устройствах» закрывает все сеансы", async () => {
    requireOwner.mockResolvedValue({ idHash: "x", expiresAt: new Date() });
    const s = await createSession();
    await expect(actions.logoutAllAction()).rejects.toMatchObject({ digest: expect.stringContaining("/admin/login") });
    expect(await findSession(s.id)).toBeNull();
    expect(cookieJar.delete).toHaveBeenCalled();
  });
});
