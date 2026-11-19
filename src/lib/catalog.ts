/** Общие типы каталога. Без серверных импортов: используется и на сервере, и в браузере. */

/** Шесть 3D-персонажей. Категория (строка БД) выбирает один из них: по нему подбираются модель, постер, реплики и пятна игры. */
export const CHARACTER_KEYS = ["furniture", "plumbing", "electrics", "repair", "other", "appliances"] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];

export const isCharacterKey = (v: unknown): v is CharacterKey => (CHARACTER_KEYS as readonly unknown[]).includes(v);

/** Названия персонажей для выбора в кабинете. */
export const CHARACTER_LABEL: Record<CharacterKey, string> = {
  furniture: "Шкаф",
  plumbing: "Смеситель",
  electrics: "Лампа",
  repair: "Валик",
  other: "Ящик с инструментами",
  appliances: "Стиральная машина",
};

/**
 * Идентификатор категории: slug из БД (`categories.id`). У шести исходных категорий он совпадает с ключом персонажа,
 * у созданных владельцем — своя строка.
 */
export type CategoryId = string;

/** Категория из БД. Порядок — `sort`; `active = false` скрывает её и все её работы от клиентов. */
export interface Category {
  id: CategoryId;
  title: string;
  /** Цвет точки в чипе и ободка подиума, `#RRGGBB`. */
  color: string;
  character: CharacterKey;
  active: boolean;
  sort: number;
}

/**
 * Названия и цвета шести исходных категорий. Нужны только как запасной вариант для старых заявок, где снимок строки
 * не хранил название и персонажа (до 002_catalog), и для стенда сцены; источник истины для сайта — таблица `categories`.
 */
export const LEGACY_CATEGORY: Record<CharacterKey, { title: string; color: string }> = {
  furniture: { title: "Мебель", color: "#C08A55" },
  plumbing: { title: "Сантехника", color: "#4E8FCB" },
  electrics: { title: "Электрика", color: "#E3B23C" },
  repair: { title: "Ремонт", color: "#6CC3A0" },
  other: { title: "Другое", color: "#2E57D1" },
  appliances: { title: "Бытовая техника", color: "#8E7CE0" },
};

/** Образцы цвета для новой категории: шесть исходных цветов и ещё шесть, подобранных к ним. */
export const CATEGORY_SWATCHES: readonly { hex: string; name: string }[] = [
  { hex: "#C08A55", name: "Дуб" },
  { hex: "#4E8FCB", name: "Вода" },
  { hex: "#E3B23C", name: "Тёплый свет" },
  { hex: "#6CC3A0", name: "Мята" },
  { hex: "#2E57D1", name: "Малярный синий" },
  { hex: "#8E7CE0", name: "Лаванда" },
  { hex: "#D9776B", name: "Кирпич" },
  { hex: "#5BB5C8", name: "Бирюза" },
  { hex: "#9DB84A", name: "Олива" },
  { hex: "#C9689A", name: "Ягода" },
  { hex: "#E08F4F", name: "Тыква" },
  { hex: "#7E8D99", name: "Сланец" },
];

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
  /** Подходит для офиса: попадает в раздел «Для офисов». */
  office: boolean;
  /** Памятка для выезда: инструмент и материалы. Показывается только владельцу. */
  memo: string;
  active: boolean;
  sort: number;
}

/** Название, цвет и персонаж категории строки заявки; у старых заявок (до 002_catalog) снимок их не хранил. */
export function lineCategory(line: { category: string; categoryTitle?: string; categoryColor?: string; character?: string }): {
  title: string;
  color: string;
  character: CharacterKey;
} {
  const legacy = isCharacterKey(line.category) ? line.category : null;
  const character = isCharacterKey(line.character) ? line.character : (legacy ?? "other");
  return {
    title: line.categoryTitle ?? (legacy ? LEGACY_CATEGORY[legacy].title : line.category),
    color: line.categoryColor ?? LEGACY_CATEGORY[character].color,
    character,
  };
}
