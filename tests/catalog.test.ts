import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { parseCategoryForm, parseNewServiceForm, parseServiceForm } from "@/lib/admin/catalog-forms";
import { lineCategory } from "@/lib/catalog";
import { orderSchema } from "@/lib/order-schema";
import { slugify } from "@/lib/slug";
import { companySchema } from "@/lib/settings";
import {
  createCategory,
  createService,
  deleteCategory,
  deleteService,
  moveCategory,
  moveService,
  setCategoryActive,
  setServiceActive,
  updateCategory,
} from "@/lib/server/admin/catalog";
import { saveService } from "@/lib/server/admin/tariffs";
import { createOrder, getPublicOrder } from "@/lib/server/orders";
import { listCategories } from "@/lib/server/categories";
import { getCatalog, listServices } from "@/lib/server/services";
import { sql } from "@/lib/server/db";
import { runMigrations } from "../scripts/_lib";
import { hasDb, newKey, resetData, validOrder } from "./helpers";

const category = (over: Record<string, unknown> = {}) => ({ title: "Окна и двери", color: "#5BB5C8", character: "repair", active: true, ...over });
const work = (over: Record<string, unknown> = {}) => ({
  title: "Замена ручки окна",
  description: "",
  unit: "pcs",
  pricing: "fixed",
  price: "900",
  minutes: "25",
  dismantleAllowed: false,
  memo: "",
  office: false,
  ...over,
});

describe("слаг из названия", () => {
  it("кириллица транслитерируется, лишнее отбрасывается", () => {
    expect(slugify("Бытовая техника")).toBe("bytovaya-tehnika");
    expect(slugify("Окна и двери!")).toBe("okna-i-dveri");
    expect(slugify("  ТВ 4K  ")).toBe("tv-4k");
    expect(slugify("!!!")).toBe("");
    expect(slugify("Очень длинное название работы, которое не должно стать бесконечным идентификатором", 20).length).toBeLessThanOrEqual(20);
    expect(slugify("Подъёмник")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("формы каталога (без БД)", () => {
  it("категория: название, цвет из шести цифр, персонаж из шести", () => {
    expect(parseCategoryForm(category())).toMatchObject({ ok: true, data: { title: "Окна и двери", color: "#5BB5C8", character: "repair" } });
    expect(parseCategoryForm(category({ color: "#5bb5c8" }))).toMatchObject({ ok: true, data: { color: "#5BB5C8" } });
    expect(parseCategoryForm(category({ title: "а" }))).toMatchObject({ ok: false, fields: { title: expect.any(String) } });
    expect(parseCategoryForm(category({ color: "red" }))).toMatchObject({ ok: false, fields: { color: expect.any(String) } });
    expect(parseCategoryForm(category({ character: "robot" }))).toMatchObject({ ok: false, fields: { character: expect.any(String) } });
    expect(parseCategoryForm(category({ title: "я".repeat(41) }))).toMatchObject({ ok: false });
  });

  it("новая работа: вид расчёта определяет единицу, цену и норму", () => {
    expect(parseNewServiceForm(work())).toMatchObject({ ok: true, data: { pricing: "fixed", unit: "pcs", price: 900, minutes: 25 } });
    expect(parseNewServiceForm(work({ pricing: "hourly", price: "", minutes: "" }))).toMatchObject({
      ok: true,
      data: { pricing: "hourly", unit: "hour", price: null, minutes: 60 },
    });
    expect(parseNewServiceForm(work({ pricing: "manual", unit: "m", price: "100" }))).toMatchObject({
      ok: true,
      data: { pricing: "manual", unit: "pcs", price: null, minutes: 0 },
    });
    expect(parseNewServiceForm(work({ price: "" }))).toMatchObject({ ok: false, fields: { price: expect.any(String) } });
    expect(parseNewServiceForm(work({ price: "12,5", minutes: "-1" }))).toMatchObject({ ok: false, fields: { price: expect.any(String), minutes: expect.any(String) } });
    expect(parseNewServiceForm(work({ pricing: "free" }))).toMatchObject({ ok: false, fields: { pricing: expect.any(String) } });
    expect(parseNewServiceForm(work({ title: "" }))).toMatchObject({ ok: false, fields: { title: expect.any(String) } });
  });

  it("правка работы: необязательные поля применяются, только если пришли", () => {
    const base = { price: "900", minutes: "30", dismantleAllowed: false, active: true, memo: "" };
    const plain = parseServiceForm(base, "fixed");
    expect(plain.ok && Object.keys(plain.data).sort()).toEqual(["active", "dismantleAllowed", "memo", "minutes", "price"]);
    const full = parseServiceForm({ ...base, title: "Новое", description: "Описание", category: "repair", office: true }, "fixed");
    expect(full).toMatchObject({ ok: true, data: { title: "Новое", description: "Описание", category: "repair", office: true } });
    expect(parseServiceForm({ ...base, title: "" }, "fixed")).toMatchObject({ ok: false, fields: { title: expect.any(String) } });
    // у почасовой и «по фото» цена и норма не принимаются
    const hourly = parseServiceForm({ ...base, price: "5" }, "hourly");
    expect(hourly.ok && hourly.data.price).toBeUndefined();
  });
});

describe("заказчик в заявке (без БД)", () => {
  const person = validOrder();
  it("частное лицо по умолчанию; реквизиты у него отбрасываются", () => {
    expect(orderSchema.parse(person)).toMatchObject({ clientType: "person", wantsInvoice: false });
    const dropped = orderSchema.parse({ ...person, orgName: "ООО Ромашка", orgInn: "7707083893", wantsInvoice: true });
    expect(dropped).toMatchObject({ clientType: "person", orgName: undefined, orgInn: undefined, wantsInvoice: false });
  });

  it("организация: название обязательно, ИНН необязателен — 10 или 12 цифр, пробелы убираются", () => {
    const org = { ...person, clientType: "organization" };
    expect(orderSchema.safeParse(org).error?.issues.map((i) => i.path.join("."))).toContain("orgName");
    expect(orderSchema.safeParse({ ...org, orgName: "О" }).success).toBe(false);
    const plainOrg = orderSchema.parse({ ...org, orgName: "ООО «Ромашка»" });
    expect(plainOrg).toMatchObject({ clientType: "organization", orgName: "ООО «Ромашка»" });
    expect(plainOrg.orgInn).toBeUndefined();
    expect(orderSchema.parse({ ...org, orgName: "ООО «Ромашка»", orgInn: "7707 083893" }).orgInn).toBe("7707083893");
    expect(orderSchema.parse({ ...org, orgName: "ИП Иванов", orgInn: "500100732259" }).orgInn).toBe("500100732259");
    for (const bad of ["12345", "77070838931", "77070838ab", "12345678901234"]) {
      expect(orderSchema.safeParse({ ...org, orgName: "ООО «Ромашка»", orgInn: bad }).error?.issues.map((i) => i.path.join("."))).toContain("orgInn");
    }
    expect(orderSchema.parse({ ...org, orgName: "ООО «Ромашка»", orgInn: "  " }).orgInn).toBeUndefined();
    expect(orderSchema.safeParse({ ...person, clientType: "state" }).success).toBe(false);
  });

  it("настройки компании: старый JSON без полей организаций читается с умолчаниями", () => {
    const old = { name: "Тест", city: "", territory: "", accent: "", contacts: { phone: "", telegram: "", whatsapp: "", email: "" }, excluded: [] };
    expect(companySchema.parse(old)).toMatchObject({ orgsEnabled: true, invoiceEnabled: true, orgNote: "" });
    expect(companySchema.parse({ ...old, orgsEnabled: false, orgNote: "  Договор  " })).toMatchObject({ orgsEnabled: false, orgNote: "Договор" });
  });

  it("название и персонаж строки старой заявки берутся запасным путём", () => {
    expect(lineCategory({ category: "plumbing" })).toEqual({ title: "Сантехника", color: "#4E8FCB", character: "plumbing" });
    expect(lineCategory({ category: "custom", categoryTitle: "Окна", categoryColor: "#112233", character: "repair" })).toEqual({ title: "Окна", color: "#112233", character: "repair" });
    expect(lineCategory({ category: "gone" })).toEqual({ title: "gone", color: "#2E57D1", character: "other" });
    expect(lineCategory({ category: "x", character: "robot" }).character).toBe("other");
  });
});

describe.skipIf(!hasDb)("миграция 002 на уже работающей базе", () => {
  it("шесть категорий вставляются, работы получают внешний ключ, старые заявки остаются корректными", async () => {
    // отдельная схема: 001 применяется первой, в неё кладутся данные «как было», затем накатывается 002
    const schema = `mig_${Date.now()}`;
    const url = process.env.TEST_DATABASE_URL!;
    const admin = postgres(url, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create schema ${schema}`);
    const db = postgres(url, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    try {
      const only001 = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
      fs.copyFileSync(path.resolve("db/migrations/001_init.sql"), path.join(only001, "001_init.sql"));
      expect(await runMigrations(db, only001)).toEqual(["001_init.sql"]);

      await db`insert into settings (id, company, pricing, game, characters) values (1, '{"name":"Старая","city":"","territory":"","accent":"","contacts":{"phone":"","telegram":"","whatsapp":"","email":""},"excluded":[]}', '{}', '{}', '{}')`;
      await db`insert into services (id, category, title, unit, pricing, price) values ('old-faucet', 'plumbing', 'Замена смесителя', 'pcs', 'fixed', 2200)`;
      await db`insert into orders (customer_name, phone, address, materials, consent_at, pricing_snapshot, has_manual, est_minutes, public_token_hash, idempotency_key, request_fingerprint)
               values ('Старый клиент', '+79161234567', 'Москва, ул. Старая, 1', 'have', now(), '{"lines":[{"category":"plumbing","title":"Замена смесителя"}]}', false, 60, 'hash', gen_random_uuid(), 'fp')`;

      expect(await runMigrations(db)).toEqual(["002_catalog.sql"]);
      expect(await runMigrations(db)).toEqual([]); // повторный запуск ничего не делает

      const cats = await db<{ id: string; character: string; sort: number }[]>`select id, character, sort from categories order by sort`;
      expect(cats.map((c) => c.id)).toEqual(["furniture", "plumbing", "electrics", "repair", "appliances", "other"]);
      expect(cats.find((c) => c.id === "appliances")).toMatchObject({ character: "appliances" });
      expect(await db`select office from services where id = 'old-faucet'`).toMatchObject([{ office: false }]);
      await expect(db`insert into services (id, category, title, unit, pricing, price) values ('bad', 'nope', 'Неизвестная', 'pcs', 'fixed', 1)`).rejects.toMatchObject({ code: "23503" });
      await expect(db`delete from categories where id = 'plumbing'`).rejects.toMatchObject({ code: "23503" });
      expect(await db`select client_type, org_name, org_inn, wants_invoice from orders`).toMatchObject([{ client_type: "person", org_name: null, org_inn: null, wants_invoice: false }]);
      const [{ company }] = await db<{ company: Record<string, unknown> }[]>`select company from settings`;
      expect(company).toMatchObject({ name: "Старая", orgsEnabled: true, invoiceEnabled: true, orgNote: "" });
    } finally {
      await db.end();
      await admin.unsafe(`drop schema ${schema} cascade`);
      await admin.end();
    }
  });

  it("ограничения организации: название обязательно, ИНН 10 или 12 цифр, у частного лица реквизитов нет", async () => {
    await resetData();
    const base = (extra: string) => sql.unsafe(`
      insert into orders (customer_name, phone, address, materials, consent_at, pricing_snapshot, has_manual, est_minutes, public_token_hash, idempotency_key, request_fingerprint, ${extra.split("|")[0]})
      values ('А', '+79161234567', 'Москва, ул. Тестовая, 1', 'have', now(), '{"lines":[]}', false, 0, '${newKey()}', gen_random_uuid(), 'fp', ${extra.split("|")[1]})`);
    await expect(base("client_type|'organization'")).rejects.toMatchObject({ code: "23514" });
    await expect(base("client_type, org_name, org_inn|'organization', 'ООО Тест', '123'")).rejects.toMatchObject({ code: "23514" });
    await expect(base("client_type, org_name|'person', 'ООО Тест'")).rejects.toMatchObject({ code: "23514" });
    await expect(base("client_type, org_name, org_inn, wants_invoice|'organization', 'ООО Тест', '7707083893', true")).resolves.toBeDefined();
  });
});

describe.skipIf(!hasDb)("категории", () => {
  beforeEach(resetData);
  const ids = async () => (await listCategories()).map((c) => c.id);

  it("посев: шесть категорий по порядку, у новой — свой персонаж", async () => {
    const all = await listCategories();
    expect(all.map((c) => c.id)).toEqual(["furniture", "plumbing", "electrics", "repair", "appliances", "other"]);
    expect(all.find((c) => c.id === "appliances")).toMatchObject({ title: "Бытовая техника", color: "#8E7CE0", character: "appliances" });
  });

  it("создание: id из названия, в конец списка, одинаковые названия не конфликтуют", async () => {
    expect(await createCategory(category())).toMatchObject({ ok: true });
    expect(await createCategory(category())).toMatchObject({ ok: true });
    const all = await listCategories();
    expect(all.slice(-2).map((c) => c.id)).toEqual(["okna-i-dveri", "okna-i-dveri-2"]);
    expect(all.at(-1)).toMatchObject({ title: "Окна и двери", color: "#5BB5C8", character: "repair", active: true });
    expect(all.at(-1)!.sort).toBeGreaterThan(all.at(-2)!.sort);
    expect(await createCategory(category({ title: "!!!" }))).toMatchObject({ ok: true }); // нет букв — запасной id
    expect((await ids()).at(-1)).toBe("category");
  });

  it("создание: неверные данные не пишутся; больше 12 категорий не создать", async () => {
    expect(await createCategory(category({ title: "" }))).toMatchObject({ ok: false, fields: { title: expect.any(String) } });
    expect(await createCategory(category({ color: "#12" }))).toMatchObject({ ok: false });
    expect(await createCategory(category({ character: "nope" }))).toMatchObject({ ok: false });
    expect((await listCategories()).length).toBe(6);
    for (let i = 0; i < 6; i++) expect(await createCategory(category({ title: `Раздел ${i}` }))).toMatchObject({ ok: true });
    expect(await createCategory(category({ title: "Лишний" }))).toMatchObject({ ok: false, error: expect.stringContaining("12") });
    expect((await listCategories()).length).toBe(12);
  });

  it("переименование, цвет, персонаж, видимость; id и порядок не меняются", async () => {
    expect(await updateCategory("repair", category({ title: "Мелкий ремонт", color: "#9DB84A", character: "furniture", active: false }))).toMatchObject({ ok: true });
    const c = (await listCategories()).find((x) => x.id === "repair")!;
    expect(c).toMatchObject({ title: "Мелкий ремонт", color: "#9DB84A", character: "furniture", active: false, sort: 40 });
    expect(await updateCategory("нет", category())).toMatchObject({ ok: false });
    expect(await updateCategory("repair", category({ title: "x" }))).toMatchObject({ ok: false });
    expect(await setCategoryActive("repair", true)).toMatchObject({ ok: true });
    expect((await listCategories({ activeOnly: true })).map((x) => x.id)).toContain("repair");
    expect(await setCategoryActive("нет", true)).toMatchObject({ ok: false });
  });

  it("порядок: выше и ниже меняют соседей, на краю ничего не происходит", async () => {
    expect(await moveCategory("plumbing", "up")).toMatchObject({ ok: true });
    expect(await ids()).toEqual(["plumbing", "furniture", "electrics", "repair", "appliances", "other"]);
    expect(await moveCategory("plumbing", "up")).toMatchObject({ ok: true, message: expect.stringContaining("первая") });
    expect(await moveCategory("other", "down")).toMatchObject({ ok: true, message: expect.stringContaining("последняя") });
    expect(await moveCategory("furniture", "down")).toMatchObject({ ok: true });
    expect(await ids()).toEqual(["plumbing", "electrics", "furniture", "repair", "appliances", "other"]);
    expect(await moveCategory("нет", "up")).toMatchObject({ ok: false });
    expect(await moveCategory("plumbing", "sideways" as never)).toMatchObject({ ok: false });
  });

  it("порядок при одинаковых значениях sort всё равно меняется", async () => {
    await sql`update categories set sort = 10`;
    expect(await moveCategory("electrics", "up")).toMatchObject({ ok: true });
    const all = await listCategories();
    expect(new Set(all.map((c) => c.sort)).size).toBe(6); // значения снова разные
    expect(all.map((c) => c.id).indexOf("electrics")).toBeLessThan(all.map((c) => c.id).indexOf("plumbing"));
  });

  it("параллельные перестановки не портят порядок: остаётся перестановка шести без повторов", async () => {
    await Promise.all(["furniture", "plumbing", "electrics", "repair", "appliances", "other"].flatMap((id) => [moveCategory(id, "down"), moveCategory(id, "up")]));
    const all = await listCategories();
    expect(new Set(all.map((c) => c.id)).size).toBe(6);
    expect(new Set(all.map((c) => c.sort)).size).toBe(6);
  });

  it("удаление: только пустая, и только после подтверждения владельца в интерфейсе", async () => {
    expect(await deleteCategory("furniture")).toMatchObject({ ok: false, error: expect.stringContaining("работы") }); // в фикстуре есть «Сборка шкафа»
    expect(await ids()).toContain("furniture");
    expect(await deleteCategory("appliances")).toMatchObject({ ok: true });
    expect(await ids()).not.toContain("appliances");
    expect(await deleteCategory("appliances")).toMatchObject({ ok: false });
    // скрытая работа тоже держит категорию
    await createCategory(category());
    expect(await createService("okna-i-dveri", work())).toMatchObject({ ok: true });
    await setServiceActive("zamena-ruchki-okna", false);
    expect(await deleteCategory("okna-i-dveri")).toMatchObject({ ok: false });
  });
});

describe.skipIf(!hasDb)("работы", () => {
  beforeEach(resetData);
  const inCategory = async (id: string) => (await listServices()).filter((s) => s.category === id);

  it("создание: в конец категории, id из названия; почасовая и «по фото» подчиняются ограничениям БД", async () => {
    expect(await createService("repair", work())).toMatchObject({ ok: true });
    const created = (await inCategory("repair")).at(-1)!;
    expect(created).toMatchObject({ id: "zamena-ruchki-okna", title: "Замена ручки окна", price: 900, minutes: 25, unit: "pcs", pricing: "fixed", office: false, active: true });
    expect(created.sort).toBeGreaterThan((await inCategory("repair"))[0].sort);
    expect(await createService("repair", work())).toMatchObject({ ok: true }); // то же название: другой id
    expect((await inCategory("repair")).map((s) => s.id)).toEqual(expect.arrayContaining(["zamena-ruchki-okna", "zamena-ruchki-okna-2"]));

    expect(await createService("repair", work({ title: "Мастер на час", pricing: "hourly", office: true }))).toMatchObject({ ok: true });
    expect(await createService("repair", work({ title: "Ремонт чего угодно", pricing: "manual" }))).toMatchObject({ ok: true });
    const all = await listServices();
    expect(all.find((s) => s.title === "Мастер на час")).toMatchObject({ pricing: "hourly", unit: "hour", price: null, minutes: 60, office: true });
    expect(all.find((s) => s.title === "Ремонт чего угодно")).toMatchObject({ pricing: "manual", price: null, minutes: 0 });
  });

  it("создание: неверные данные и неизвестная категория", async () => {
    expect(await createService("repair", work({ price: "" }))).toMatchObject({ ok: false, fields: { price: expect.any(String) } });
    expect(await createService("repair", work({ title: "" }))).toMatchObject({ ok: false, fields: { title: expect.any(String) } });
    expect(await createService("нет-такой", work())).toMatchObject({ ok: false, error: expect.any(String) });
    expect((await listServices()).length).toBe(6);
  });

  it("правка: название, описание, флаг «для офиса»; перенос в другую категорию ставит работу в конец", async () => {
    const form = { price: "3500", minutes: "150", dismantleAllowed: false, active: true, memo: "", title: "Сборка большого шкафа", description: "Три створки", office: true };
    expect(await saveService("t-wardrobe", form)).toMatchObject({ ok: true });
    expect((await listServices()).find((s) => s.id === "t-wardrobe")).toMatchObject({ title: "Сборка большого шкафа", description: "Три створки", office: true });

    const before = await inCategory("repair");
    expect(await saveService("t-wardrobe", { ...form, category: "repair" })).toMatchObject({ ok: true });
    const after = await inCategory("repair");
    expect(after.at(-1)!.id).toBe("t-wardrobe");
    expect(after.at(-1)!.sort).toBeGreaterThan(Math.max(...before.map((s) => s.sort)));
    expect((await inCategory("furniture")).map((s) => s.id)).not.toContain("t-wardrobe");

    expect(await saveService("t-wardrobe", { ...form, category: "нет-такой" })).toMatchObject({ ok: false, error: expect.any(String) });
    expect((await listServices()).find((s) => s.id === "t-wardrobe")!.category).toBe("repair");
  });

  it("порядок внутри категории: выше, ниже, край, равные sort", async () => {
    await sql`update services set sort = 10 where category = 'repair'`; // t-rail, t-hourly, t-gone — все равны
    const start = (await inCategory("repair")).map((s) => s.id);
    expect(start).toHaveLength(3);
    expect(await moveService(start[1], "up")).toMatchObject({ ok: true });
    expect((await inCategory("repair")).map((s) => s.id)).toEqual([start[1], start[0], start[2]]);
    expect(await moveService(start[1], "up")).toMatchObject({ ok: true, message: expect.stringContaining("первая") });
    expect(await moveService(start[2], "down")).toMatchObject({ ok: true, message: expect.stringContaining("последняя") });
    expect(await moveService(start[1], "down")).toMatchObject({ ok: true });
    expect((await inCategory("repair")).map((s) => s.id)).toEqual([start[0], start[1], start[2]]);
    expect(await moveService("нет", "up")).toMatchObject({ ok: false });
    // другая категория не затронута
    expect((await inCategory("plumbing")).map((s) => s.id)).toEqual(["t-faucet"]);
  });

  it("скрыть и показать работу: скрытая клиенту недоступна", async () => {
    expect(await setServiceActive("t-faucet", false)).toMatchObject({ ok: true });
    expect((await listServices({ activeOnly: true })).map((s) => s.id)).not.toContain("t-faucet");
    expect((await listServices()).map((s) => s.id)).toContain("t-faucet");
    expect(await setServiceActive("t-faucet", true)).toMatchObject({ ok: true });
    expect(await setServiceActive("нет", true)).toMatchObject({ ok: false });
  });

  it("удаление работы не мешает заявкам: снимок остаётся, страница заявки открывается", async () => {
    const order = await createOrder(orderSchema.parse(validOrder({ lines: [{ serviceId: "t-faucet", qty: 1, complex: false, dismantle: false }] })), newKey());
    expect(await deleteService("t-faucet")).toMatchObject({ ok: true });
    expect((await listServices()).map((s) => s.id)).not.toContain("t-faucet");
    expect(await deleteService("t-faucet")).toMatchObject({ ok: false });
    const pub = await getPublicOrder(order.token);
    expect(pub!.lines[0]).toMatchObject({ title: "Замена смесителя", total: 2200 });
    expect(pub!.lines[0].categoryTitle).toBe("Сантехника");
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders`;
    expect(n).toBe(1);
  });
});

describe.skipIf(!hasDb)("каталог для клиента", () => {
  beforeEach(resetData);

  it("скрытая категория, скрытая работа и пустая категория клиенту не показываются", async () => {
    const full = await getCatalog();
    expect(full.map((g) => g.id)).toEqual(["furniture", "plumbing", "repair", "other"]); // у electrics и appliances в фикстуре нет работ
    expect(full.find((g) => g.id === "repair")!.services.map((s) => s.id)).toEqual(expect.not.arrayContaining(["t-gone"]));

    await setCategoryActive("plumbing", false);
    expect((await getCatalog()).map((g) => g.id)).not.toContain("plumbing");
    expect((await listServices({ activeOnly: true })).map((s) => s.id)).not.toContain("t-faucet");
    await setCategoryActive("plumbing", true);
    for (let i = 0; i < 3; i++) await moveCategory("other", "up"); // мимо «Бытовой техники», «Ремонта», «Электрики»
    expect((await getCatalog()).map((g) => g.id)).toEqual(["furniture", "plumbing", "other", "repair"]);
  });

  it("заказать работу из скрытой категории нельзя", async () => {
    await setCategoryActive("plumbing", false);
    await expect(createOrder(orderSchema.parse(validOrder({ lines: [{ serviceId: "t-faucet", qty: 1, complex: false, dismantle: false }] })), newKey())).rejects.toMatchObject({ status: 422 });
  });
});

describe.skipIf(!hasDb)("заявка: организация и снимок категории", () => {
  beforeEach(resetData);
  const create = (over: Record<string, unknown> = {}) => createOrder(orderSchema.parse(validOrder(over)), newKey());
  const row = async (number: number) =>
    (await sql`select client_type, org_name, org_inn, wants_invoice, pricing_snapshot from orders where number = ${number}`)[0];

  it("организация: название, ИНН и счёт сохраняются", async () => {
    const { number } = await create({ clientType: "organization", orgName: "ООО «Ромашка»", orgInn: "7707 083893", wantsInvoice: true });
    expect(await row(number)).toMatchObject({ clientType: "organization", orgName: "ООО «Ромашка»", orgInn: "7707083893", wantsInvoice: true });
  });

  it("счёт учитывается только когда владелец включил оплату по счёту", async () => {
    await sql`update settings set company = jsonb_set(company, '{invoiceEnabled}', 'false')`;
    const { number } = await create({ clientType: "organization", orgName: "ООО «Ромашка»", wantsInvoice: true });
    expect(await row(number)).toMatchObject({ clientType: "organization", orgInn: null, wantsInvoice: false });
  });

  it("если владелец отключил организации, заявка организации отклоняется, частная — принимается", async () => {
    await sql`update settings set company = jsonb_set(company, '{orgsEnabled}', 'false')`;
    await expect(create({ clientType: "organization", orgName: "ООО «Ромашка»" })).rejects.toMatchObject({ status: 422, opts: { fields: { clientType: expect.any(String) } } });
    await expect(create()).resolves.toMatchObject({ number: 1 });
  });

  it("частное лицо: реквизиты не пишутся даже если пришли", async () => {
    const { number } = await create({ orgName: "ООО «Ромашка»", orgInn: "7707083893", wantsInvoice: true });
    expect(await row(number)).toMatchObject({ clientType: "person", orgName: null, orgInn: null, wantsInvoice: false });
  });

  it("публичная заявка показывает название организации, но не ИНН, телефон и адрес", async () => {
    const { token } = await create({ clientType: "organization", orgName: "ООО «Ромашка»", orgInn: "7707083893", wantsInvoice: true });
    const pub = (await getPublicOrder(token))!;
    expect(pub).toMatchObject({ clientType: "organization", orgName: "ООО «Ромашка»", wantsInvoice: true });
    const json = JSON.stringify(pub);
    expect(json).not.toContain("7707083893");
    expect(json).not.toContain("+7916");
    expect(json).not.toContain("Вымышленная");
    expect((await getPublicOrder((await create()).token))).toMatchObject({ clientType: "person", orgName: null });
  });

  it("строки снимка хранят название, цвет и персонажа категории на момент заказа", async () => {
    await updateCategory("plumbing", category({ title: "Сантехника и вода", color: "#5BB5C8", character: "appliances" }));
    const { number, token } = await create({ lines: [{ serviceId: "t-faucet", qty: 1, complex: false, dismantle: false }] });
    const snap = (await row(number)).pricingSnapshot;
    expect(snap.lines[0]).toMatchObject({ category: "plumbing", categoryTitle: "Сантехника и вода", categoryColor: "#5BB5C8", character: "appliances" });

    // каталог меняется после заказа — страница заявки и игра остаются прежними
    await updateCategory("plumbing", category({ title: "Другое имя", color: "#C9689A", character: "furniture" }));
    await sql`delete from services where id = 't-faucet'`;
    const pub = (await getPublicOrder(token))!;
    expect(pub.lines[0]).toMatchObject({ categoryTitle: "Сантехника и вода", categoryColor: "#5BB5C8", character: "appliances" });
  });

  it("старая заявка без полей снимка: запасные название, цвет и персонаж", async () => {
    const { number, token } = await create({ lines: [{ serviceId: "t-faucet", qty: 1, complex: false, dismantle: false }] });
    await sql`update orders set pricing_snapshot = jsonb_set(pricing_snapshot, '{lines}', (select jsonb_agg(l - 'categoryTitle' - 'categoryColor' - 'character') from jsonb_array_elements(pricing_snapshot->'lines') l)) where number = ${number}`;
    expect((await row(number)).pricingSnapshot.lines[0].character).toBeUndefined();
    expect((await getPublicOrder(token))!.lines[0]).toMatchObject({ category: "plumbing", categoryTitle: "Сантехника", categoryColor: "#4E8FCB", character: "plumbing" });
    // категория, которой нет среди шести исходных: персонаж «Другое», название — прежний id
    await sql`update orders set pricing_snapshot = jsonb_set(pricing_snapshot, '{lines,0,category}', '"gone-category"') where number = ${number}`;
    expect((await getPublicOrder(token))!.lines[0]).toMatchObject({ categoryTitle: "gone-category", character: "other" });
  });
});
