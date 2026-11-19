import { describe, expect, it } from "vitest";
import type { Service } from "@/lib/catalog";
import {
  PricingError,
  buildPricingSnapshot,
  cartLineKey,
  clampQty,
  formatMinutes,
  formatQty,
  formatRub,
  isValidQty,
  type CartLine,
  type PricingSettings,
} from "@/lib/pricing";

const NB = " ";

const settings: PricingSettings = {
  hourRate: 1500,
  minOrder: 2500,
  complexPct: 25,
  dismantlePct: 30,
  urgentPct: 40,
  outOfTownFee: 1000,
};

function svc(p: Partial<Service> & Pick<Service, "id">): Service {
  return {
    category: "furniture",
    title: p.id,
    description: "",
    unit: "pcs",
    pricing: "fixed",
    price: 1000,
    minutes: 30,
    dismantleAllowed: false,
    memo: "",
    active: true,
    sort: 0,
    ...p,
  };
}

const services: Service[] = [
  svc({ id: "wardrobe", price: 3500, minutes: 150 }),
  svc({ id: "faucet", category: "plumbing", price: 2200, minutes: 60, dismantleAllowed: true }),
  svc({ id: "rail", unit: "m", price: 300, minutes: 12 }),
  svc({ id: "widget", price: 1850, minutes: 20 }),
  svc({ id: "odd", price: 333, minutes: 5 }),
  svc({ id: "hourly", unit: "hour", pricing: "hourly", price: null, minutes: 60 }),
  svc({ id: "other", category: "other", pricing: "manual", price: null, minutes: 0 }),
  svc({ id: "gone", active: false }),
];

const line = (serviceId: string, extra: Partial<CartLine> = {}): CartLine => ({
  serviceId,
  qty: 1,
  complex: false,
  dismantle: false,
  ...extra,
});

function calc(lines: CartLine[], flags: { urgent?: boolean; outOfTown?: boolean } = {}, s: PricingSettings = settings) {
  return buildPricingSnapshot(
    services,
    s,
    { lines, urgent: !!flags.urgent, outOfTown: !!flags.outOfTown },
    new Date("2026-11-19T10:00:00Z"),
  );
}

describe("строки", () => {
  it("одна позиция без наценок", () => {
    const r = calc([line("wardrobe")]);
    expect(r.lines[0]).toMatchObject({ unitPrice: 3500, qty: 1, pct: 0, total: 3500, minutes: 150 });
    expect(r.subtotal).toBe(3500);
    expect(r.topUp).toBe(0);
    expect(r.worksTotal).toBe(3500);
    expect(r.knownTotal).toBe(3500);
  });

  it("количество умножает цену", () => {
    expect(calc([line("wardrobe", { qty: 2 })]).subtotal).toBe(7000);
  });

  it("сложные условия и демонтаж складываются процентами к базе", () => {
    const r = calc([line("faucet", { complex: true, dismantle: true })]);
    expect(r.lines[0].pct).toBe(55);
    expect(r.lines[0].total).toBe(3410); // 2200 × 1,55
  });

  it("демонтаж игнорируется, если работа его не допускает", () => {
    const r = calc([line("wardrobe", { dismantle: true })]);
    expect(r.lines[0]).toMatchObject({ dismantle: false, pct: 0, total: 3500 });
  });

  it("округление до рубля — половина вверх", () => {
    expect(calc([line("widget", { complex: true })]).lines[0].total).toBe(2313); // 2312,5
    expect(calc([line("rail", { qty: 1.5, complex: true })]).lines[0].total).toBe(563); // 562,5
    expect(calc([line("rail", { qty: 0.5 })]).lines[0].total).toBe(150);
  });

  it("почасовая работа берёт цену часа из настроек", () => {
    const r = calc([line("hourly", { qty: 2.5 })]);
    expect(r.lines[0]).toMatchObject({ unitPrice: 1500, total: 3750, minutes: 150 });
    const r2 = calc([line("hourly", { qty: 2.5 })], {}, { ...settings, hourRate: 1700 });
    expect(r2.lines[0].total).toBe(4250);
    expect(r2.settings.hourRate).toBe(1700);
  });
});

describe("итоги заказа", () => {
  it("минимум доплачивается только когда сумма работ > 0 и меньше минимума", () => {
    const r = calc([line("rail", { qty: 2 })]); // 600
    expect(r).toMatchObject({ subtotal: 600, topUp: 1900, worksTotal: 2500, knownTotal: 2500 });
    expect(calc([line("wardrobe")]).topUp).toBe(0);
  });

  it("срочность считается после минимума", () => {
    const r = calc([line("rail", { qty: 2 })], { urgent: true }); // (600 + 1900) × 40% = 1000
    expect(r).toMatchObject({ topUp: 1900, urgent: 1000, worksTotal: 3500 });
  });

  it("итог работ округляется вверх до 10 ₽", () => {
    const r = calc([line("odd", { qty: 10, complex: true })], { urgent: true });
    // 3330 × 1,25 = 4162,5 → 4163; срочность 4163 × 0,4 = 1665,2 → 1665; сумма 5828 → 5830
    expect(r.subtotal).toBe(4163);
    expect(r.urgent).toBe(1665);
    expect(r.worksTotal).toBe(5830);
  });

  it("выезд за город фиксирован: без процентов и минимума", () => {
    const big = calc([line("wardrobe")], { urgent: true, outOfTown: true });
    expect(big).toMatchObject({ urgent: 1400, worksTotal: 4900, outOfTown: 1000, knownTotal: 5900 });
    const small = calc([line("rail")], { outOfTown: true }); // 300 → минимум 2500, плюс 1000
    expect(small).toMatchObject({ topUp: 2200, worksTotal: 2500, knownTotal: 3500 });
  });

  it("заказ только «По фото»: суммы нет, минимума нет", () => {
    const r = calc([line("other", { description: "Починить что-то странное" })]);
    expect(r.lines[0]).toMatchObject({ unitPrice: null, total: null, pricing: "manual" });
    expect(r).toMatchObject({
      knownTotal: null,
      subtotal: 0,
      topUp: 0,
      urgent: 0,
      worksTotal: 0,
      hasManual: true,
      minutes: 0,
    });
  });

  it("только «По фото» + срочность: срочность ничего не добавляет", () => {
    expect(calc([line("other")], { urgent: true }).knownTotal).toBeNull();
  });

  it("только «По фото» + выезд за город: известна лишь доплата за выезд", () => {
    const r = calc([line("other")], { outOfTown: true });
    expect(r).toMatchObject({ worksTotal: 0, outOfTown: 1000, knownTotal: 1000 });
    expect(calc([line("other")], { outOfTown: true }, { ...settings, outOfTownFee: 0 }).knownTotal).toBeNull();
  });

  it("смешанный заказ: известная сумма отдельно, минимум предварительный", () => {
    const r = calc([line("rail"), line("other", { uid: "a" })]);
    expect(r).toMatchObject({ subtotal: 300, topUp: 2200, knownTotal: 2500, hasManual: true, minimumIsPreliminary: true });
    expect(r.lines.find((l) => l.pricing === "manual")?.total).toBeNull();
    expect(calc([line("wardrobe")]).minimumIsPreliminary).toBe(false);
  });

  it("время: сумма норм вверх до 10 минут", () => {
    expect(calc([line("rail", { qty: 1.5 })]).minutes).toBe(20); // 18
    expect(calc([line("wardrobe"), line("faucet")]).minutes).toBe(210);
    expect(calc([line("wardrobe"), line("other")]).minutes).toBe(150); // «по фото» время не прибавляет
  });

  it("снимок хранит условия на момент расчёта", () => {
    const r = calc([line("wardrobe")]);
    expect(r).toMatchObject({
      version: 1,
      computedAt: "2026-11-19T10:00:00.000Z",
      settings,
      flags: { urgent: false, outOfTown: false },
    });
    expect(r.lines[0]).toMatchObject({ serviceId: "wardrobe", title: "wardrobe", unit: "pcs", memo: "" });
  });
});

describe("объединение и ключи", () => {
  it("одинаковые позиции объединяются, разные флаги — отдельно", () => {
    const r = calc([line("wardrobe"), line("wardrobe", { qty: 2 }), line("wardrobe", { complex: true })]);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].qty).toBe(3);
  });

  it("«Другое» не объединяется никогда", () => {
    const r = calc([line("other", { uid: "1" }), line("other", { uid: "2" })]);
    expect(r.lines).toHaveLength(2);
  });

  it("cartLineKey", () => {
    expect(cartLineKey({ serviceId: "a", complex: true, dismantle: false })).toBe("a|1|0");
    expect(cartLineKey({ serviceId: "a", complex: false, dismantle: false })).not.toBe("a|1|0");
    expect(cartLineKey({ serviceId: "o", complex: false, dismantle: false, uid: "x" }, true)).not.toBe(
      cartLineKey({ serviceId: "o", complex: false, dismantle: false, uid: "y" }, true),
    );
    expect(() => cartLineKey({ serviceId: "o", complex: false, dismantle: false }, true)).toThrow();
  });
});

describe("количество", () => {
  it("штуки — целые 1…50", () => {
    expect([0, 1.5, 51, NaN].map((q) => isValidQty("pcs", q))).toEqual([false, false, false, false]);
    expect([1, 2, 50].map((q) => isValidQty("pcs", q))).toEqual([true, true, true]);
  });
  it("метры и м² — шаг 0,5, минимум 0,5", () => {
    expect(isValidQty("m", 0.5)).toBe(true);
    expect(isValidQty("m2", 2.5)).toBe(true);
    expect(isValidQty("m", 0.25)).toBe(false);
    expect(isValidQty("m", 0)).toBe(false);
  });
  it("часы — шаг 0,5, от 1 до 12", () => {
    expect([1, 1.5, 12].map((q) => isValidQty("hour", q))).toEqual([true, true, true]);
    expect([0.5, 12.5, 1.25].map((q) => isValidQty("hour", q))).toEqual([false, false, false]);
  });
  it("clampQty", () => {
    expect(clampQty("pcs", 0)).toBe(1);
    expect(clampQty("pcs", 99)).toBe(50);
    expect(clampQty("hour", 0.5)).toBe(1);
    expect(clampQty("m", 1.3)).toBe(1.5);
  });
  it("PricingError для неизвестной и неактивной работы и неверного количества", () => {
    expect(() => calc([line("nope")])).toThrow(PricingError);
    expect(() => calc([line("gone")])).toThrow(/недоступна/);
    expect(() => calc([line("wardrobe", { qty: 0 })])).toThrow(PricingError);
    expect(() => calc([line("wardrobe", { qty: 30 }), line("wardrobe", { qty: 30 })])).toThrow(PricingError); // 60 после объединения
    expect(() => calc([line("other", { qty: 2 })])).toThrow(PricingError);
  });
});

describe("форматирование", () => {
  it("деньги с неразрывными пробелами", () => {
    expect(formatRub(1800)).toBe(`1${NB}800${NB}₽`);
    expect(formatRub(950)).toBe(`950${NB}₽`);
    expect(formatRub(1234567)).toBe(`1${NB}234${NB}567${NB}₽`);
  });
  it("время", () => {
    expect(formatMinutes(150)).toBe(`≈${NB}2${NB}ч 30${NB}мин`);
    expect(formatMinutes(45)).toBe(`≈${NB}50${NB}мин`);
    expect(formatMinutes(180)).toBe(`≈${NB}3${NB}ч`);
    expect(formatMinutes(61)).toBe(`≈${NB}1${NB}ч 10${NB}мин`);
    expect(formatMinutes(0)).toBe("—");
  });
  it("количество с запятой", () => {
    expect(formatQty(1.5)).toBe("1,5");
    expect(formatQty(3)).toBe("3");
  });
});
