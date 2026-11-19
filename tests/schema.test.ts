import { describe, expect, it } from "vitest";
import { findExcluded } from "@/lib/excluded";
import { normalizePhone, orderSchema, todayMoscow, zodFields } from "@/lib/order-schema";
import { demoSettings } from "../scripts/_seed";

const base = {
  name: "Иван",
  phone: "+7 916 123 45 67",
  address: "Москва, Тверская 1",
  materials: "self",
  consent: true,
  lines: [{ serviceId: "furn-wardrobe", qty: 1 }],
};

describe("телефон", () => {
  it("нормализуется в +7XXXXXXXXXX", () => {
    for (const v of ["8 (916) 123-45-67", "+7 916 123 45 67", "79161234567", "9161234567", "8-495-123-45-67"]) {
      expect(normalizePhone(v)).toMatch(/^\+7\d{10}$/);
    }
    expect(normalizePhone("8 (916) 123-45-67")).toBe("+79161234567");
  });
  it("мусор отвергается", () => {
    for (const v of ["", "123", "+1 202 555 0101", "8 (216) 123-45-67", "abc", "89161234567890"]) expect(normalizePhone(v)).toBeNull();
  });
});

describe("схема заявки", () => {
  it("принимает минимальную заявку и подставляет значения по умолчанию", () => {
    const r = orderSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({ phone: "+79161234567", access: {}, comment: "", photos: [], urgent: false, outOfTown: false });
      expect(r.data.lines[0]).toMatchObject({ complex: false, dismantle: false });
    }
  });

  it("поля доступа: пустые отбрасываются, лишние ключи вычищаются", () => {
    const r = orderSchema.parse({ ...base, access: { entrance: " 3 ", floor: "", intercom: "  ", junk: "x" }, total: 5 });
    expect(r.access).toEqual({ entrance: "3" });
    expect(r).not.toHaveProperty("total");
  });

  it("точное время HH:MM и окна допустимы, произвольный текст — нет", () => {
    const date = todayMoscow(new Date(Date.now() + 86_400_000 * 2));
    expect(orderSchema.safeParse({ ...base, desiredDate: date, desiredTime: "09:00–12:00" }).success).toBe(true);
    expect(orderSchema.safeParse({ ...base, desiredDate: date, desiredTime: "14:30" }).success).toBe(true);
    expect(orderSchema.safeParse({ ...base, desiredDate: date, desiredTime: "после обеда" }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, desiredDate: date, desiredTime: "25:00" }).success).toBe(false);
    // пустые строки из формы = «не указано»
    expect(orderSchema.safeParse({ ...base, desiredDate: "", desiredTime: "" }).success).toBe(true);
  });

  it("дата: прошлое и несуществующее отклоняются; «сегодня» по Москве допустимо", () => {
    expect(orderSchema.safeParse({ ...base, desiredDate: "2020-01-01" }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, desiredDate: "2026-02-30" }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, desiredDate: todayMoscow() }).success).toBe(true);
  });

  it("todayMoscow: UTC+3", () => {
    expect(todayMoscow(new Date("2026-11-19T21:30:00Z"))).toBe("2026-11-20");
    expect(todayMoscow(new Date("2026-11-19T20:59:00Z"))).toBe("2026-11-19");
  });

  it("не больше 3 фото, без дублей; не больше 30 позиций", () => {
    const photo = (n: number) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, key: "k".repeat(43) });
    expect(orderSchema.safeParse({ ...base, photos: [photo(1), photo(2), photo(3)] }).success).toBe(true);
    expect(orderSchema.safeParse({ ...base, photos: [photo(1), photo(2), photo(3), photo(4)] }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, photos: [photo(1), photo(1)] }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, lines: Array(31).fill(base.lines[0]) }).success).toBe(false);
  });

  it("ошибки — по-русски, ключ — путь поля", () => {
    const r = orderSchema.safeParse({ ...base, name: "", lines: [{ serviceId: "x", qty: "много" }], consent: false });
    expect(r.success).toBe(false);
    if (!r.success) {
      const f = zodFields(r.error);
      expect(f.name).toMatch(/имя/i);
      expect(f["lines.0.qty"]).toBe("Укажите количество");
      expect(f.consent).toMatch(/согласие/);
      for (const m of Object.values(f)) expect(m).toMatch(/[а-яё]/i);
    }
  });
});

describe("«не берём»", () => {
  const ex = demoSettings.company.excluded;
  const hit = (text: string) => findExcluded(ex, [{ source: "comment", text }]).map((m) => m.title);

  it("находит по основам слов без учёта регистра и «ё»", () => {
    expect(hit("Надо заменить ГАЗОВУЮ плиту")).toEqual(["Газовое оборудование"]);
    expect(hit("снести несущую стену")).toEqual(["Несущие стены и перепланировка"]);
    expect(hit("Установить кондиционер в спальне")).toEqual(["Заправка и монтаж кондиционеров"]);
    expect(hit("Почистить фасад")).toEqual(["Работы снаружи дома на высоте"]);
    expect(hit("Течёт стояк в ванной")).toEqual(["Общедомовой электрощит и стояки"]);
  });
  it("обычный текст не срабатывает", () => {
    expect(hit("Собрать шкаф и повесить полку")).toEqual([]);
    expect(hit("")).toEqual([]);
  });
  it("указывает источник совпадения", () => {
    expect(findExcluded(ex, [{ source: "line:2", text: "газовая колонка" }])[0]).toMatchObject({ source: "line:2", keyword: "газов" });
  });
});
