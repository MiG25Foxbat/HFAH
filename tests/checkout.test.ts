import { describe, expect, it } from "vitest";
import { EMPTY_CART, addItem, makeItem, type CartState } from "@/lib/cart";
import type { Service } from "@/lib/catalog";
import {
  PHOTO_TTL_MS,
  buildPayload,
  emptyDraft,
  emptyForm,
  fingerprint,
  nextAttempt,
  parseDraft,
  serializeDraft,
  validateOrder,
  type Draft,
  type FormValues,
  type PhotoItem,
} from "@/lib/checkout";

const shelf = { id: "furn-shelf", title: "Навеска полки", unit: "pcs", pricing: "fixed", dismantleAllowed: false } as Pick<Service, "id" | "title" | "unit" | "pricing" | "dismantleAllowed">;
const other = { id: "other-photo", title: "Другая задача", unit: "pcs", pricing: "manual", dismantleAllowed: false } as typeof shelf;

const form = (o: Partial<FormValues> = {}): FormValues => ({
  ...emptyForm(),
  name: "Анна",
  phone: "8 (912) 345-67-89",
  address: "ул. Вымышленная, 1, кв. 2",
  materials: "unknown",
  ...o,
});
const done = (n: number): PhotoItem => ({
  lid: `l${n}`,
  name: `p${n}.jpg`,
  thumb: "data:image/jpeg;base64,AAAA",
  status: "done",
  progress: 100,
  ref: { id: `00000000-0000-4000-8000-00000000000${n}`, key: "k".repeat(32) },
  uploadedAt: 1_000_000,
});
const cart = (...items: ReturnType<typeof makeItem>[]): CartState => items.reduce((s, i) => addItem(s, i).state, EMPTY_CART);

describe("черновик", () => {
  it("сериализация и чтение возвращают то же, согласия в черновике нет", () => {
    const d: Draft = {
      form: form({ comment: "Позвоните после 18:00", urgent: true, access: { ...emptyForm().access, floor: "5", elevator: "есть" } }),
      photos: [done(1), done(2)],
      submit: { key: "11111111-1111-4111-8111-111111111111", fp: "abc" },
    };
    const raw = serializeDraft(d);
    expect(raw).not.toMatch(/consent/i);
    expect(parseDraft(raw, 1_000_000 + 1000)).toEqual(d);
  });

  it("в черновик попадают только загруженные фото", () => {
    const d: Draft = {
      ...emptyDraft(),
      photos: [done(1), { ...done(2), status: "uploading", progress: 40, ref: undefined }, { ...done(3), status: "error", error: "x" }],
    };
    const back = parseDraft(serializeDraft(d), 1_000_000 + 1000);
    expect(back.photos.map((p) => p.lid)).toEqual(["l1"]);
  });

  it("устаревшее фото помечается ошибкой и теряет ссылку", () => {
    const raw = serializeDraft({ ...emptyDraft(), photos: [done(1)] });
    const back = parseDraft(raw, 1_000_000 + PHOTO_TTL_MS + 1);
    expect(back.photos[0].status).toBe("error");
    expect(back.photos[0].ref).toBeUndefined();
    expect(back.photos[0].error).toMatch(/добавьте снова/);
  });

  it("мусор, чужая версия и неверные значения не ломают чтение", () => {
    expect(parseDraft(null)).toEqual(emptyDraft());
    expect(parseDraft("{{")).toEqual(emptyDraft());
    expect(parseDraft(JSON.stringify({ v: 9, form: {} }))).toEqual(emptyDraft());
    const back = parseDraft(
      JSON.stringify({ v: 1, form: { name: 5, materials: "sell", desiredDate: "завтра", urgent: "yes", access: null }, photos: [{ lid: 1 }, null], submit: { key: 1 } }),
    );
    expect(back.form).toEqual(emptyForm());
    expect(back.photos).toEqual([]);
    expect(back.submit).toBeNull();
  });

  it("не принимает больше трёх фото", () => {
    const raw = JSON.stringify({ v: 1, form: {}, photos: [1, 2, 3, 4].map((n) => ({ lid: `l${n}`, ref: { id: `i${n}`, key: "k" }, uploadedAt: 1 })) });
    expect(parseDraft(raw, 2).photos).toHaveLength(3);
  });
});

describe("тело заявки и ключ повтора", () => {
  const items = cart(makeItem(shelf, { qty: 2 }));

  it("в теле нет сумм и лишних полей: только работа, количество, флаги", () => {
    const p = buildPayload(form({ access: { ...emptyForm().access, floor: " 5 " } }), items.lines, [done(1)], true);
    expect(p.lines).toEqual([{ serviceId: "furn-shelf", qty: 2, complex: false, dismantle: false }]);
    expect(p.access).toEqual({ floor: "5" });
    expect(p.photos).toEqual([done(1).ref]);
    expect(JSON.stringify(p)).not.toMatch(/total|price|uid/);
  });

  it("время без даты в тело не попадает", () => {
    expect(buildPayload(form({ desiredTime: "12:00–15:00" }), items.lines, [], true).desiredTime).toBe("");
  });

  it("тот же текст — тот же отпечаток и тот же ключ; изменился — новый ключ", () => {
    const p1 = buildPayload(form(), items.lines, [], true);
    const p2 = buildPayload(form(), items.lines, [], true);
    expect(fingerprint(p1)).toBe(fingerprint(p2));
    let n = 0;
    const gen = () => `key-${++n}`;
    const a1 = nextAttempt(null, p1, gen);
    const a2 = nextAttempt(a1, p2, gen);
    expect(a2.key).toBe(a1.key);
    const p3 = buildPayload(form({ comment: "добавил комментарий" }), items.lines, [], true);
    const a3 = nextAttempt(a2, p3, gen);
    expect(a3.key).not.toBe(a1.key);
    expect(n).toBe(2);
  });

  it("порядок ключей не влияет на отпечаток", () => {
    expect(fingerprint({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(fingerprint({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

describe("проверка перед отправкой", () => {
  it("обычная заявка проходит, телефон в разных форматах", () => {
    const items = cart(makeItem(shelf, { qty: 1 }));
    expect(validateOrder(buildPayload(form(), items.lines, [], true), items.lines, 0)).toEqual({});
  });

  it("без согласия, имени, телефона, адреса и материалов — ошибки у полей", () => {
    const items = cart(makeItem(shelf, { qty: 1 }));
    const e = validateOrder(buildPayload(form({ name: "", phone: "123", address: "", materials: "" }), items.lines, [], false), items.lines, 0);
    expect(Object.keys(e).sort()).toEqual(["address", "consent", "materials", "name", "phone"]);
    expect(e.phone).toMatch(/телефон/);
  });

  it("«Другое» без фото и с коротким описанием не проходит, с фото и описанием проходит", () => {
    const items = cart(makeItem(other, { qty: 1, description: "короткое" }, "u1"));
    const bad = validateOrder(buildPayload(form(), items.lines, [], true), items.lines, 0);
    expect(bad["lines.0.description"]).toBeDefined();
    expect(bad.photos).toMatch(/фото/);
    const ok = cart(makeItem(other, { qty: 1, description: "Повесить зеркало на плитку" }, "u1"));
    expect(validateOrder(buildPayload(form(), ok.lines, [done(1)], true), ok.lines, 1)).toEqual({});
  });

  it("время без даты и дата в прошлом отклоняются", () => {
    const items = cart(makeItem(shelf, { qty: 1 }));
    const past = validateOrder(buildPayload(form({ desiredDate: "2020-01-01" }), items.lines, [], true), items.lines, 0);
    expect(past.desiredDate).toBeDefined();
  });
});

describe("организация в оформлении", () => {
  const items = cart(makeItem(shelf, { qty: 1 }));
  const org = (o: Partial<FormValues> = {}) => form({ clientType: "organization", orgName: "ООО «Ромашка»", ...o });

  it("черновик хранит тип заказчика, название, ИНН и отметку счёта", () => {
    const d: Draft = { ...emptyDraft(), form: org({ orgInn: "7707 083893", wantsInvoice: true }) };
    const back = parseDraft(serializeDraft(d));
    expect(back.form).toMatchObject({ clientType: "organization", orgName: "ООО «Ромашка»", orgInn: "7707 083893", wantsInvoice: true });
  });

  it("старый черновик без этих полей читается как частное лицо", () => {
    const old = JSON.stringify({ v: 1, form: { name: "Анна", phone: "+79123456789" }, photos: [], submit: null });
    expect(parseDraft(old).form).toMatchObject({ clientType: "person", orgName: "", orgInn: "", wantsInvoice: false });
    const junk = JSON.stringify({ v: 1, form: { clientType: "state", orgName: 5, wantsInvoice: "yes" }, photos: [] });
    expect(parseDraft(junk).form).toMatchObject({ clientType: "person", orgName: "", wantsInvoice: false });
  });

  it("реквизиты уходят в тело только у организации", () => {
    const p = buildPayload(org({ orgInn: "7707083893", wantsInvoice: true }), items.lines, [], true);
    expect(p).toMatchObject({ clientType: "organization", orgName: "ООО «Ромашка»", orgInn: "7707083893", wantsInvoice: true });
    // у частного лица забытые в черновике реквизиты не попадают ни в тело, ни в отпечаток
    const person = buildPayload(form({ orgName: "ООО «Ромашка»", orgInn: "7707083893", wantsInvoice: true }), items.lines, [], true);
    expect(person.clientType).toBe("person");
    expect(person).not.toHaveProperty("orgName");
    expect(person).not.toHaveProperty("orgInn");
    expect(person).not.toHaveProperty("wantsInvoice");
  });

  it("у организации обязательно название, ИНН — только 10 или 12 цифр, пробелы допустимы", () => {
    const check = (f: FormValues) => validateOrder(buildPayload(f, items.lines, [], true), items.lines, 0);
    expect(check(org({ orgName: "" })).orgName).toMatch(/название/);
    expect(check(org({ orgInn: "12345" })).orgInn).toMatch(/ИНН/);
    expect(check(org({ orgInn: "77070838931" })).orgInn).toBeDefined();
    expect(check(org({ orgInn: "7707 083893" }))).toEqual({});
    expect(check(org({ orgInn: "500100732259" }))).toEqual({});
    expect(check(org({ orgInn: "" }))).toEqual({});
    // частному лицу название и ИНН не нужны
    expect(check(form({ clientType: "person", orgName: "", orgInn: "12" }))).toEqual({});
  });

  it("смена тела (организация вместо частного лица) даёт новый ключ повтора", () => {
    const person = buildPayload(form(), items.lines, [], true);
    const company = buildPayload(org(), items.lines, [], true);
    const a = nextAttempt(null, person, () => "k1");
    expect(nextAttempt(a, company, () => "k2").key).toBe("k2");
  });
});
