/** Общие типы каталога. Без серверных импортов: используется и на сервере, и в браузере. */

export const CATEGORIES = [
  { id: "furniture", title: "Мебель", color: "#C08A55" },
  { id: "plumbing", title: "Сантехника", color: "#4E8FCB" },
  { id: "electrics", title: "Электрика", color: "#E3B23C" },
  { id: "repair", title: "Ремонт", color: "#6CC3A0" },
  { id: "other", title: "Другое", color: "#2E57D1" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** pcs — шт, m — пог. м, m2 — м² (небольшие площади), hour — час. */
export type Unit = "pcs" | "m" | "m2" | "hour";

/** fixed — цена за единицу; hourly — цена часа берётся из settings.pricing.hourRate; manual — «По фото», цены нет. */
export type PricingKind = "fixed" | "hourly" | "manual";

export const UNIT_LABEL: Record<Unit, string> = {
  pcs: "шт",
  m: "пог. м",
  m2: "м²",
  hour: "ч",
};

export function categoryTitle(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.title ?? id;
}

/** Работа из прайса (строка таблицы `services`). */
export interface Service {
  id: string;
  category: CategoryId;
  title: string;
  description: string;
  unit: Unit;
  pricing: PricingKind;
  /** Рубли за единицу; null у hourly и manual. */
  price: number | null;
  /** Норма времени на единицу, минуты (у hourly — 60, у manual — 0). */
  minutes: number;
  dismantleAllowed: boolean;
  /** Памятка для выезда: инструмент и материалы. Показывается только владельцу. */
  memo: string;
  active: boolean;
  sort: number;
}
