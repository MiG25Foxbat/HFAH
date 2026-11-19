/**
 * Расчёт заказа. ЧИСТЫЙ модуль: без серверных импортов, работает и в браузере (корзина), и на сервере
 * (источник истины). Формула — docs/ARCHITECTURE.md, «Правила расчёта». Деньги — целые рубли.
 */
import type { Category, CategoryId, CharacterKey, PricingKind, Service, Unit } from "./catalog";

export interface PricingSettings {
  hourRate: number;
  minOrder: number;
  complexPct: number;
  dismantlePct: number;
  urgentPct: number;
  outOfTownFee: number;
}

/** Позиция корзины / заявки. `uid` нужен только для «Другое» (такие позиции не объединяются). */
export interface CartLine {
  uid?: string;
  serviceId: string;
  qty: number;
  complex: boolean;
  dismantle: boolean;
  description?: string;
}

export interface OrderInput {
  lines: CartLine[];
  urgent: boolean;
  outOfTown: boolean;
}

export interface SnapshotLine {
  key: string;
  serviceId: string;
  category: CategoryId;
  /**
   * Название, цвет и персонаж категории на момент заказа (страница заявки и игра не зависят от правок каталога).
   * Нет у старых заявок (до 002_catalog): читать через `lineCategory()`.
   */
  categoryTitle?: string;
  categoryColor?: string;
  character?: CharacterKey;
  title: string;
  unit: Unit;
  pricing: PricingKind;
  /** null — «По фото». Никогда 0 вместо неизвестного. */
  unitPrice: number | null;
  qty: number;
  complex: boolean;
  /** Эффективный флаг: true только если работа допускает демонтаж. */
  dismantle: boolean;
  pct: number;
  /** null — «По фото». */
  total: number | null;
  /** Норма × количество, без округления. */
  minutes: number;
  memo: string;
  description?: string;
}

/** Всё, что сохраняется в `orders.pricing_snapshot`. */
export interface PricingSnapshot {
  version: 1;
  computedAt: string;
  /** Значения настроек, по которым считали. */
  settings: PricingSettings;
  flags: { urgent: boolean; outOfTown: boolean };
  lines: SnapshotLine[];
  /** Сумма известных позиций. */
  subtotal: number;
  /** Доплата до минимального заказа (только работы). */
  topUp: number;
  /** Сумма наценки за срочность. */
  urgent: number;
  /** (subtotal + topUp + urgent), вверх до 10 ₽. */
  worksTotal: number;
  /** Фиксированная доплата за выезд за город (0, если не отмечен). */
  outOfTown: number;
  /** worksTotal + outOfTown; null, если известных сумм нет вообще (только «По фото»). */
  knownTotal: number | null;
  hasManual: boolean;
  /** Доплата до минимума предварительная, пока есть позиции «По фото». */
  minimumIsPreliminary: boolean;
  /** Σ норма × количество, вверх до 10 минут. Без дороги и без времени «по фото». */
  minutes: number;
}

export type PricingErrorCode = "unknown_service" | "bad_qty";

export class PricingError extends Error {
  constructor(
    public code: PricingErrorCode,
    public lineIndex: number,
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

/** Шаги и границы количества по единицам. */
export const QTY_RULES: Record<Unit, { min: number; max: number; step: number }> = {
  pcs: { min: 1, max: 50, step: 1 },
  m: { min: 0.5, max: 100, step: 0.5 },
  m2: { min: 0.5, max: 20, step: 0.5 },
  hour: { min: 1, max: 12, step: 0.5 },
};

/** Допустимо ли количество для единицы (в границах и кратно шагу). */
export function isValidQty(unit: Unit, qty: number): boolean {
  const r = QTY_RULES[unit];
  return Number.isFinite(qty) && qty >= r.min && qty <= r.max && Number.isInteger((qty - r.min) / r.step);
}

/** Приводит количество к ближайшему допустимому (для кнопок «+» и «−» и ручного ввода). */
export function clampQty(unit: Unit, qty: number): number {
  const r = QTY_RULES[unit];
  if (!Number.isFinite(qty)) return r.min;
  const stepped = r.min + Math.round((qty - r.min) / r.step) * r.step;
  return Math.min(r.max, Math.max(r.min, stepped));
}

/**
 * Ключ объединения одинаковых позиций: serviceId + complex + dismantle.
 * Позиции «Другое» (manual) не объединяются никогда — для них нужен `uid`.
 */
export function cartLineKey(line: Pick<CartLine, "serviceId" | "complex" | "dismantle" | "uid">, manual = false): string {
  if (manual) {
    if (!line.uid) throw new Error("cartLineKey: у позиции «Другое» должен быть uid");
    return `manual:${line.serviceId}:${line.uid}`;
  }
  return `${line.serviceId}|${line.complex ? 1 : 0}|${line.dismantle ? 1 : 0}`;
}

/** Сумма позиции: round(цена × кол-во × (100 + pct) / 100), половина вверх. */
export function lineTotal(unitPrice: number, qty: number, pct: number): number {
  // unitPrice и (100 + pct) целые, qty кратно 0,5 — произведение точно представимо в double.
  return Math.round((unitPrice * qty * (100 + pct)) / 100);
}

/**
 * Собирает расчёт и снимок условий. Бросает PricingError для неизвестной/неактивной работы и неверного количества.
 * Одинаковые позиции (по cartLineKey) объединяются, количество суммируется. `categories` — для снимка названия,
 * цвета и персонажа категории в строках заявки (корзине в браузере они не нужны).
 */
export function buildPricingSnapshot(
  services: readonly Service[],
  settings: PricingSettings,
  input: OrderInput,
  now: Date = new Date(),
  categories: readonly Pick<Category, "id" | "title" | "color" | "character">[] = [],
): PricingSnapshot {
  const byId = new Map(services.map((s) => [s.id, s]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const merged = new Map<string, SnapshotLine>();

  input.lines.forEach((line, index) => {
    const service = byId.get(line.serviceId);
    if (!service || !service.active) {
      throw new PricingError("unknown_service", index, `Работа «${line.serviceId}» недоступна.`);
    }
    const manual = service.pricing === "manual";
    const complex = !manual && line.complex;
    const dismantle = !manual && service.dismantleAllowed && line.dismantle;
    const key = cartLineKey({ serviceId: service.id, complex, dismantle, uid: line.uid ?? String(index) }, manual);

    const existing = merged.get(key);
    const qty = (existing?.qty ?? 0) + line.qty;
    if (!isValidQty(service.unit, qty) || (manual && qty !== 1)) {
      throw new PricingError("bad_qty", index, `Неверное количество для «${service.title}».`);
    }

    const description = existing?.description ?? (line.description?.trim() || undefined);
    const cat = categoryById.get(service.category);
    const unitPrice = manual ? null : service.pricing === "hourly" ? settings.hourRate : service.price;
    const pct = (complex ? settings.complexPct : 0) + (dismantle ? settings.dismantlePct : 0);
    merged.set(key, {
      key,
      serviceId: service.id,
      category: service.category,
      ...(cat ? { categoryTitle: cat.title, categoryColor: cat.color, character: cat.character } : {}),
      title: service.title,
      unit: service.unit,
      pricing: service.pricing,
      unitPrice,
      qty,
      complex,
      dismantle,
      pct,
      total: unitPrice === null ? null : lineTotal(unitPrice, qty, pct),
      minutes: service.minutes * qty,
      memo: service.memo,
      ...(description ? { description } : {}),
    });
  });

  const lines = [...merged.values()];
  const priced = lines.filter((l) => l.total !== null);
  const hasManual = lines.some((l) => l.pricing === "manual");

  const subtotal = priced.reduce((sum, l) => sum + (l.total as number), 0);
  const topUp = subtotal > 0 && subtotal < settings.minOrder ? settings.minOrder - subtotal : 0;
  const urgent = input.urgent ? Math.round(((subtotal + topUp) * settings.urgentPct) / 100) : 0;
  const worksTotal = Math.ceil((subtotal + topUp + urgent) / 10) * 10;
  const outOfTown = input.outOfTown ? settings.outOfTownFee : 0;
  const knownTotal = priced.length > 0 || outOfTown > 0 ? worksTotal + outOfTown : null;
  const minutes = Math.ceil(lines.reduce((sum, l) => sum + l.minutes, 0) / 10) * 10;

  return {
    version: 1,
    computedAt: now.toISOString(),
    settings: { ...settings },
    flags: { urgent: input.urgent, outOfTown: input.outOfTown },
    lines,
    subtotal,
    topUp,
    urgent,
    worksTotal,
    outOfTown,
    knownTotal,
    hasManual,
    minimumIsPreliminary: hasManual,
    minutes,
  };
}

const NBSP = " ";

/** «1 800 ₽» (неразрывные пробелы). Не зависит от ICU, одинаков на сервере и в браузере. */
export function formatRub(amount: number): string {
  const digits = String(Math.round(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${amount < 0 ? "−" : ""}${digits}${NBSP}₽`;
}

/** «≈ 2 ч 30 мин», «≈ 45 мин», «≈ 3 ч»; для 0 — «—». Минуты округляются вверх до 10. */
export function formatMinutes(minutes: number): string {
  const total = Math.ceil(minutes / 10) * 10;
  if (total <= 0) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [h ? `${h}${NBSP}ч` : "", m ? `${m}${NBSP}мин` : ""].filter(Boolean);
  return `≈${NBSP}${parts.join(" ")}`;
}

/** Количество с десятичной запятой: 1.5 → «1,5». */
export function formatQty(qty: number): string {
  return String(qty).replace(".", ",");
}
