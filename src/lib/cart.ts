/**
 * Корзина: чистые функции (без React и браузера), поэтому их легко проверять тестами.
 * Состояние в браузере держит `cart-store.ts`. Позиции объединяются по `cartLineKey` (serviceId + complex + dismantle);
 * «Другое» (manual) не объединяется никогда — у такой позиции свой `uid`.
 */
import type { Service, Unit } from "./catalog";
import {
  QTY_RULES,
  buildPricingSnapshot,
  cartLineKey,
  clampQty,
  isValidQty,
  type CartLine,
  type PricingSettings,
  type PricingSnapshot,
} from "./pricing";
import { uuid4 } from "./uuid";

/** Версия в ключе: при несовместимом изменении формата берём новый ключ, старые данные просто не читаются. */
export const CART_KEY = "ladno-cart-v1";
/** Как в схеме заявки: не больше 30 позиций. */
export const MAX_LINES = 30;
const UNITS: readonly Unit[] = ["pcs", "m", "m2", "hour"];

export interface CartItem {
  /** Стабильный идентификатор строки в интерфейсе (React key): не меняется при смене параметров, в отличие от `key`. */
  id: string;
  /** cartLineKey: по нему позиции объединяются и находятся. Меняется вместе с флагами. */
  key: string;
  serviceId: string;
  /** Название на момент добавления — только для сообщений («убрали из корзины…»), цены и тексты берём из каталога. */
  title: string;
  unit: Unit;
  manual: boolean;
  qty: number;
  complex: boolean;
  dismantle: boolean;
  /** Только у «Другое». */
  uid?: string;
  description?: string;
}

export interface CartState {
  lines: readonly CartItem[];
}

export const EMPTY_CART: CartState = { lines: [] };

const keyOf = (i: Pick<CartItem, "serviceId" | "complex" | "dismantle" | "uid" | "manual">) => cartLineKey(i, i.manual);

/** Новая позиция из работы каталога; флаги приводятся к допустимым (у «Другое» нет сложных условий и демонтажа). */
export function makeItem(
  service: Pick<Service, "id" | "title" | "unit" | "pricing" | "dismantleAllowed">,
  o: { qty: number; complex?: boolean; dismantle?: boolean; description?: string },
  uid: string = uuid4(),
): CartItem {
  const manual = service.pricing === "manual";
  const base = {
    serviceId: service.id,
    title: service.title,
    unit: service.unit,
    manual,
    qty: manual ? 1 : clampQty(service.unit, o.qty),
    complex: !manual && !!o.complex,
    dismantle: !manual && service.dismantleAllowed && !!o.dismantle,
    ...(manual ? { uid, description: (o.description ?? "").trim() } : {}),
  };
  return { ...base, id: uuid4(), key: keyOf(base) };
}

export interface AddResult {
  state: CartState;
  /** true — такая позиция уже была, количество суммировано. */
  merged: boolean;
  /** true — сумма упёрлась в максимум для единицы. */
  capped: boolean;
  /** true — достигнут лимит позиций, ничего не добавлено. */
  full: boolean;
}

function mergeQty(cur: CartItem, add: number): { qty: number; capped: boolean } {
  const sum = cur.qty + add;
  const max = QTY_RULES[cur.unit].max;
  return { qty: Math.min(sum, max), capped: sum > max };
}

export function addItem(state: CartState, item: CartItem): AddResult {
  const i = item.manual ? -1 : state.lines.findIndex((l) => l.key === item.key);
  if (i < 0) {
    if (state.lines.length >= MAX_LINES) return { state, merged: false, capped: false, full: true };
    return { state: { lines: [...state.lines, item] }, merged: false, capped: false, full: false };
  }
  const { qty, capped } = mergeQty(state.lines[i], item.qty);
  const lines = state.lines.map((l, k) => (k === i ? { ...l, qty } : l));
  return { state: { lines }, merged: true, capped, full: false };
}

export type ItemPatch = Partial<Pick<CartItem, "qty" | "complex" | "dismantle" | "description">>;

/**
 * Меняет количество и параметры позиции. Если после смены флагов позиция стала «такой же», как соседняя,
 * они объединяются (количество суммируется), а возвращается ключ, в который влились.
 */
export function updateItem(state: CartState, key: string, patch: ItemPatch): { state: CartState; mergedInto?: string } {
  const idx = state.lines.findIndex((l) => l.key === key);
  if (idx < 0) return { state };
  const cur = state.lines[idx];
  const next: CartItem = { ...cur };
  if (!cur.manual) {
    if (patch.qty !== undefined) next.qty = clampQty(cur.unit, patch.qty);
    if (patch.complex !== undefined) next.complex = patch.complex;
    if (patch.dismantle !== undefined) next.dismantle = patch.dismantle;
  } else if (patch.description !== undefined) {
    next.description = patch.description;
  }
  next.key = keyOf(next);
  if (next.key !== cur.key) {
    const j = state.lines.findIndex((l, k) => k !== idx && l.key === next.key);
    if (j >= 0) {
      const { qty } = mergeQty(state.lines[j], next.qty);
      const lines = state.lines.flatMap((l, k) => (k === idx ? [] : k === j ? [{ ...l, qty }] : [l]));
      return { state: { lines }, mergedInto: next.key };
    }
  }
  return { state: { lines: state.lines.map((l, k) => (k === idx ? next : l)) } };
}

export function removeItem(state: CartState, key: string): { state: CartState; removed?: { item: CartItem; index: number } } {
  const index = state.lines.findIndex((l) => l.key === key);
  if (index < 0) return { state };
  return { state: { lines: state.lines.filter((_, k) => k !== index) }, removed: { item: state.lines[index], index } };
}

/** Возвращает удалённую позицию на прежнее место; если за это время добавили такую же — количество суммируется. */
export function restoreItem(state: CartState, item: CartItem, index: number): CartState {
  const same = item.manual ? -1 : state.lines.findIndex((l) => l.key === item.key);
  if (same >= 0) return addItem(state, item).state;
  const lines = [...state.lines];
  lines.splice(Math.min(index, lines.length), 0, item);
  return { lines };
}

export interface ReconcileResult {
  state: CartState;
  /** Названия позиций, которых больше нет в прайсе (убраны или отключены). */
  dropped: string[];
  /** true — что-то исправили (количество, единицу, флаги). */
  adjusted: boolean;
}

/** Сверяет корзину с текущим каталогом: неизвестные и отключённые работы убирает, остальное приводит к текущим правилам. */
export function reconcile(state: CartState, services: readonly Pick<Service, "id" | "title" | "unit" | "pricing" | "dismantleAllowed" | "active">[]): ReconcileResult {
  const byId = new Map(services.map((s) => [s.id, s]));
  const dropped: string[] = [];
  let adjusted = false;
  let next: CartState = EMPTY_CART;
  for (const line of state.lines) {
    const s = byId.get(line.serviceId);
    if (!s || !s.active) {
      dropped.push(line.title);
      continue;
    }
    const manual = s.pricing === "manual";
    const qty = manual ? 1 : isValidQty(s.unit, line.qty) ? line.qty : clampQty(s.unit, line.qty);
    const fixed: CartItem = {
      ...line,
      title: s.title,
      unit: s.unit,
      manual,
      qty,
      complex: !manual && line.complex,
      dismantle: !manual && s.dismantleAllowed && line.dismantle,
    };
    if (manual && !fixed.uid) fixed.uid = uuid4();
    fixed.key = keyOf(fixed);
    if (fixed.key !== line.key || fixed.qty !== line.qty || fixed.unit !== line.unit || fixed.title !== line.title) adjusted = true;
    next = addItem(next, fixed).state;
  }
  return { state: next, dropped, adjusted };
}

export const toCartLine = (i: CartItem): CartLine => ({
  ...(i.uid ? { uid: i.uid } : {}),
  serviceId: i.serviceId,
  qty: i.qty,
  complex: i.complex,
  dismantle: i.dismantle,
  ...(i.manual ? { description: i.description ?? "" } : {}),
});

/** Расчёт тем же движком, что и на сервере. null — если корзина пуста или не сходится с каталогом. */
export function cartSnapshot(
  services: readonly Service[],
  pricing: PricingSettings,
  items: readonly CartItem[],
  flags: { urgent?: boolean; outOfTown?: boolean } = {},
): PricingSnapshot | null {
  if (items.length === 0) return null;
  try {
    return buildPricingSnapshot(services, pricing, { lines: items.map(toCartLine), urgent: !!flags.urgent, outOfTown: !!flags.outOfTown });
  } catch {
    return null;
  }
}

export function serializeCart(state: CartState): string {
  return JSON.stringify({ v: 1, lines: state.lines });
}

/** Читает корзину из localStorage. Битые данные и чужие версии дают пустую корзину, битые позиции отбрасываются. */
export function parseCart(raw: string | null | undefined): CartState {
  if (!raw) return EMPTY_CART;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_CART;
  }
  const o = data as { v?: unknown; lines?: unknown } | null;
  if (!o || o.v !== 1 || !Array.isArray(o.lines)) return EMPTY_CART;
  let state: CartState = EMPTY_CART;
  for (const l of o.lines as Record<string, unknown>[]) {
    if (!l || typeof l !== "object") continue;
    const { serviceId, title, unit, qty, uid, description } = l;
    if (typeof serviceId !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(serviceId) || serviceId.length > 80) continue;
    if (typeof unit !== "string" || !UNITS.includes(unit as Unit)) continue;
    if (typeof qty !== "number" || !isValidQty(unit as Unit, qty)) continue;
    const manual = l.manual === true;
    if (manual && typeof uid !== "string") continue;
    const item = {
      id: typeof l.id === "string" && l.id.length > 0 && l.id.length <= 64 ? l.id : uuid4(),
      serviceId,
      title: typeof title === "string" ? title.slice(0, 120) : serviceId,
      unit: unit as Unit,
      manual,
      qty,
      complex: !manual && l.complex === true,
      dismantle: !manual && l.dismantle === true,
      ...(manual ? { uid: uid as string, description: typeof description === "string" ? description.slice(0, 1000) : "" } : {}),
    };
    state = addItem(state, { ...item, key: keyOf(item) }).state;
  }
  return state;
}
