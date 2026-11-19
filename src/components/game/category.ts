import { CATEGORIES, type CategoryId } from "@/lib/catalog";
import type { PublicOrderLine } from "@/lib/order-types";

const IDS = new Set<string>(CATEGORIES.map((c) => c.id));

/** Категория заявки: позиция с наибольшей известной суммой, иначе первая. Категория берётся из снимка заявки. */
export function orderCategory(lines: readonly PublicOrderLine[]): CategoryId {
  let best: PublicOrderLine | undefined = lines[0];
  for (const l of lines) if (l.total !== null && l.total > (best?.total ?? -1)) best = l;
  return best && IDS.has(best.category) ? best.category : "other";
}
