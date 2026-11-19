import "server-only";
import { cache } from "react";
import type { Category, Service } from "./catalog";
import type { Settings } from "./settings";
import { getCatalog } from "./server/services";
import { getSettings } from "./server/settings";

/** Видимая категория с её доступными работами (категории без работ клиенту не показываются). */
export interface ShopGroup extends Pick<Category, "id" | "title" | "color" | "character"> {
  services: Service[];
}

export interface ShopData {
  groups: ShopGroup[];
  /** Все активные работы одним списком (для расчёта корзины). */
  services: Service[];
  settings: Settings;
}

/**
 * Каталог и настройки для клиентских компонентов. Дедупликация в пределах запроса: страница и layout вызывают её оба раза.
 * `memo` (памятка для выезда) — только для владельца: перед отправкой в браузер она обнуляется.
 */
export const getShopData = cache(async (): Promise<ShopData> => {
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const groups = catalog.map(({ id, title, color, character, services }) => ({
    id,
    title,
    color,
    character,
    services: services.map((s) => ({ ...s, memo: "" })),
  }));
  return { groups, services: groups.flatMap((g) => g.services), settings };
});
