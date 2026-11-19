import { describe, expect, it } from "vitest";
import {
  EMPTY_CART,
  MAX_LINES,
  addItem,
  cartSnapshot,
  makeItem,
  parseCart,
  reconcile,
  removeItem,
  restoreItem,
  serializeCart,
  updateItem,
  type CartState,
} from "@/lib/cart";
import type { Service } from "@/lib/catalog";
import { buildPricingSnapshot, type PricingSettings } from "@/lib/pricing";

const svc = (o: Partial<Service> & { id: string }): Service => ({
  category: "furniture",
  title: o.id,
  description: "",
  unit: "pcs",
  pricing: "fixed",
  price: 1000,
  minutes: 30,
  dismantleAllowed: false,
  office: false,
  memo: "",
  active: true,
  sort: 0,
  ...o,
});

const services: Service[] = [
  svc({ id: "furn-shelf", price: 900 }),
  svc({ id: "plumb-faucet", category: "plumbing", price: 2200, dismantleAllowed: true, minutes: 60 }),
  svc({ id: "rep-paint", category: "repair", unit: "m2", price: 350, minutes: 25 }),
  svc({ id: "furn-hourly", unit: "hour", pricing: "hourly", price: null, minutes: 60 }),
  svc({ id: "other-photo", category: "other", pricing: "manual", price: null, minutes: 0 }),
];
const S = Object.fromEntries(services.map((s) => [s.id, s]));
const pricing: PricingSettings = { hourRate: 1500, minOrder: 2500, complexPct: 25, dismantlePct: 30, urgentPct: 40, outOfTownFee: 1000 };

const add = (state: CartState, id: string, o: { qty?: number; complex?: boolean; dismantle?: boolean; description?: string } = {}) =>
  addItem(state, makeItem(S[id], { qty: o.qty ?? 1, ...o }));

describe("добавление и объединение", () => {
  it("одинаковые позиции объединяются, количество суммируется", () => {
    const a = add(EMPTY_CART, "furn-shelf", { qty: 2 });
    const b = add(a.state, "furn-shelf", { qty: 3 });
    expect(b.merged).toBe(true);
    expect(b.state.lines).toHaveLength(1);
    expect(b.state.lines[0].qty).toBe(5);
  });

  it("разные настройки остаются отдельными позициями", () => {
    let s = add(EMPTY_CART, "plumb-faucet").state;
    s = add(s, "plumb-faucet", { complex: true }).state;
    s = add(s, "plumb-faucet", { dismantle: true }).state;
    s = add(s, "plumb-faucet", { complex: true, dismantle: true }).state;
    expect(s.lines).toHaveLength(4);
    expect(new Set(s.lines.map((l) => l.key)).size).toBe(4);
  });

  it("демонтаж у работы, которая его не допускает, не сохраняется", () => {
    const it = makeItem(S["furn-shelf"], { qty: 1, dismantle: true });
    expect(it.dismantle).toBe(false);
    expect(add(add(EMPTY_CART, "furn-shelf").state, "furn-shelf", { dismantle: true }).state.lines).toHaveLength(1);
  });

  it("«Другое» не объединяется никогда", () => {
    const a = add(EMPTY_CART, "other-photo", { description: "Повесить люстру на потолок" });
    const b = add(a.state, "other-photo", { description: "Повесить люстру на потолок" });
    expect(b.merged).toBe(false);
    expect(b.state.lines).toHaveLength(2);
    expect(b.state.lines[0].qty).toBe(1);
  });

  it("сумма не выходит за максимум единицы", () => {
    const a = add(EMPTY_CART, "furn-shelf", { qty: 48 });
    const b = add(a.state, "furn-shelf", { qty: 5 });
    expect(b.capped).toBe(true);
    expect(b.state.lines[0].qty).toBe(50);
  });

  it("не больше 30 позиций", () => {
    let s: CartState = EMPTY_CART;
    for (let i = 0; i < MAX_LINES; i++) s = add(s, "other-photo", { description: `Задача номер ${i}, подробно` }).state;
    const r = add(s, "other-photo", { description: "Ещё одна задача, подробно" });
    expect(r.full).toBe(true);
    expect(r.state.lines).toHaveLength(MAX_LINES);
  });
});

describe("изменение позиции", () => {
  it("шаг количества: штуки целые, метры и часы по 0,5, часы от 1", () => {
    let s = add(EMPTY_CART, "rep-paint", { qty: 1 }).state;
    s = updateItem(s, s.lines[0].key, { qty: 1.4 }).state;
    expect(s.lines[0].qty).toBe(1.5);
    s = add(EMPTY_CART, "furn-hourly", { qty: 1 }).state;
    expect(updateItem(s, s.lines[0].key, { qty: 0.5 }).state.lines[0].qty).toBe(1);
    s = add(EMPTY_CART, "furn-shelf").state;
    expect(updateItem(s, s.lines[0].key, { qty: 2.6 }).state.lines[0].qty).toBe(3);
  });

  it("смена флага, после которой позиция совпала с соседней, объединяет их", () => {
    let s = add(EMPTY_CART, "plumb-faucet", { qty: 1 }).state;
    s = add(s, "plumb-faucet", { qty: 2, complex: true }).state;
    expect(s.lines).toHaveLength(2);
    const r = updateItem(s, s.lines[0].key, { complex: true });
    expect(r.mergedInto).toBeDefined();
    expect(r.state.lines).toHaveLength(1);
    expect(r.state.lines[0].qty).toBe(3);
    expect(r.state.lines[0].complex).toBe(true);
  });

  it("смена параметров меняет key, но не id: строка в интерфейсе остаётся той же (фокус не теряется)", () => {
    const s = add(EMPTY_CART, "plumb-faucet").state;
    const before = s.lines[0];
    const after = updateItem(s, before.key, { complex: true }).state.lines[0];
    expect(after.key).not.toBe(before.key);
    expect(after.id).toBe(before.id);
  });

  it("описание «Другое» меняется без смены ключа", () => {
    const s = add(EMPTY_CART, "other-photo", { description: "старое описание задачи" }).state;
    const key = s.lines[0].key;
    const r = updateItem(s, key, { description: "новое описание задачи" });
    expect(r.state.lines[0].key).toBe(key);
    expect(r.state.lines[0].description).toBe("новое описание задачи");
  });
});

describe("удаление и отмена", () => {
  it("возвращает позицию на прежнее место", () => {
    let s = add(EMPTY_CART, "furn-shelf").state;
    s = add(s, "plumb-faucet").state;
    s = add(s, "rep-paint").state;
    const { state, removed } = removeItem(s, s.lines[1].key);
    expect(state.lines.map((l) => l.serviceId)).toEqual(["furn-shelf", "rep-paint"]);
    const back = restoreItem(state, removed!.item, removed!.index);
    expect(back.lines.map((l) => l.serviceId)).toEqual(["furn-shelf", "plumb-faucet", "rep-paint"]);
  });

  it("если за время отмены добавили такую же работу — количества суммируются", () => {
    const s = add(EMPTY_CART, "furn-shelf", { qty: 2 }).state;
    const { state, removed } = removeItem(s, s.lines[0].key);
    const again = add(state, "furn-shelf", { qty: 1 }).state;
    const back = restoreItem(again, removed!.item, removed!.index);
    expect(back.lines).toHaveLength(1);
    expect(back.lines[0].qty).toBe(3);
  });

  it("удаление несуществующего ключа ничего не меняет", () => {
    const s = add(EMPTY_CART, "furn-shelf").state;
    const r = removeItem(s, "nope");
    expect(r.removed).toBeUndefined();
    expect(r.state).toBe(s);
  });
});

describe("хранение", () => {
  it("сериализация и чтение возвращают ту же корзину", () => {
    let s = add(EMPTY_CART, "plumb-faucet", { qty: 2, complex: true, dismantle: true }).state;
    s = add(s, "other-photo", { description: "Закрепить полку на гипсокартоне" }).state;
    s = add(s, "rep-paint", { qty: 1.5 }).state;
    expect(parseCart(serializeCart(s))).toEqual(s);
  });

  it("битые данные, чужая версия и мусор в позициях не ломают чтение", () => {
    expect(parseCart(null)).toBe(EMPTY_CART);
    expect(parseCart("{not json")).toBe(EMPTY_CART);
    expect(parseCart(JSON.stringify({ v: 2, lines: [] }))).toBe(EMPTY_CART);
    const raw = JSON.stringify({
      v: 1,
      lines: [
        { serviceId: "furn-shelf", title: "Полка", unit: "pcs", qty: 2, complex: true },
        { serviceId: "furn-shelf", unit: "pcs", qty: 2.5 }, // дробное число штук
        { serviceId: "Bad Id", unit: "pcs", qty: 1 },
        { serviceId: "rep-paint", unit: "kg", qty: 1 },
        { serviceId: "other-photo", unit: "pcs", qty: 1, manual: true }, // без uid
        null,
        "строка",
      ],
    });
    const s = parseCart(raw);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ serviceId: "furn-shelf", qty: 2, complex: true, manual: false });
  });

  it("ключ пересчитывается при чтении: подмена key в хранилище ничего не даёт", () => {
    const raw = JSON.stringify({ v: 1, lines: [{ key: "evil", serviceId: "furn-shelf", unit: "pcs", qty: 1 }] });
    expect(parseCart(raw).lines[0].key).toBe("furn-shelf|0|0");
  });
});

describe("сверка с каталогом", () => {
  it("убирает неизвестные и отключённые работы и называет их", () => {
    let s = add(EMPTY_CART, "furn-shelf").state;
    s = add(s, "plumb-faucet").state;
    const r = reconcile(s, [S["furn-shelf"], { ...S["plumb-faucet"], active: false }]);
    expect(r.state.lines.map((l) => l.serviceId)).toEqual(["furn-shelf"]);
    expect(r.dropped).toEqual(["plumb-faucet"]);
    expect(reconcile(s, [S["furn-shelf"]]).dropped).toEqual(["plumb-faucet"]);
  });

  it("приводит количество и флаги к текущим правилам каталога", () => {
    const s = add(EMPTY_CART, "plumb-faucet", { qty: 2, dismantle: true }).state;
    const changed = { ...S["plumb-faucet"], dismantleAllowed: false, unit: "m" as const };
    const r = reconcile(s, [changed]);
    expect(r.adjusted).toBe(true);
    expect(r.state.lines[0]).toMatchObject({ dismantle: false, unit: "m", qty: 2 });
  });

  it("без изменений в каталоге корзина остаётся прежней", () => {
    const s = add(add(EMPTY_CART, "furn-shelf", { qty: 3 }).state, "other-photo", { description: "Подробное описание работы" }).state;
    const r = reconcile(s, services);
    expect(r.dropped).toEqual([]);
    expect(r.adjusted).toBe(false);
    expect(r.state).toEqual(s);
  });
});

describe("расчёт корзины тем же движком", () => {
  it("совпадает с buildPricingSnapshot и ключи позиций совпадают", () => {
    let s = add(EMPTY_CART, "plumb-faucet", { qty: 2, complex: true, dismantle: true }).state;
    s = add(s, "rep-paint", { qty: 1.5 }).state;
    s = add(s, "other-photo", { description: "Повесить зеркало на плитку" }).state;
    const snap = cartSnapshot(services, pricing, s.lines, { urgent: true, outOfTown: true })!;
    const direct = buildPricingSnapshot(
      services,
      pricing,
      {
        lines: [
          { serviceId: "plumb-faucet", qty: 2, complex: true, dismantle: true },
          { serviceId: "rep-paint", qty: 1.5, complex: false, dismantle: false },
          { uid: s.lines[2].uid, serviceId: "other-photo", qty: 1, complex: false, dismantle: false, description: "Повесить зеркало на плитку" },
        ],
        urgent: true,
        outOfTown: true,
      },
      new Date(snap.computedAt),
    );
    expect(snap).toEqual(direct);
    for (const item of s.lines) expect(snap.lines.some((l) => l.key === item.key)).toBe(true);
    // 2200 × 2 × 1,55 = 6820; 350 × 1,5 = 525; subtotal 7345
    expect(snap.subtotal).toBe(7345);
    expect(snap.hasManual).toBe(true);
  });

  it("для пустой корзины и для работы, которой нет в каталоге, возвращает null", () => {
    expect(cartSnapshot(services, pricing, [])).toBeNull();
    const ghost = makeItem(svc({ id: "ghost" }), { qty: 1 });
    expect(cartSnapshot(services, pricing, [ghost])).toBeNull();
  });
});
