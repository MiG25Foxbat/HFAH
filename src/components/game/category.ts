import { LEGACY_CATEGORY, isCharacterKey, type CharacterKey } from "@/lib/catalog";
import type { PublicOrderLine } from "@/lib/order-types";

/**
 * Персонаж и цвет подиума для игры: берутся у позиции с наибольшей известной суммой, иначе у первой. Персонаж и цвет — из снимка
 * заявки (на момент заказа), поэтому правки каталога после заказа игру не меняют.
 */
export function orderCharacter(lines: readonly PublicOrderLine[]): { character: CharacterKey; color: string } {
  let best: PublicOrderLine | undefined = lines[0];
  for (const l of lines) if (l.total !== null && l.total > (best?.total ?? -1)) best = l;
  return best && isCharacterKey(best.character)
    ? { character: best.character, color: best.categoryColor }
    : { character: "other", color: LEGACY_CATEGORY.other.color };
}
