import { CATEGORIES, type CategoryId } from "@/lib/catalog";
import type { PublicOrderLine } from "@/lib/order-types";

const IDS = new Set<string>(CATEGORIES.map((c) => c.id));

/**
 * Запасной способ, пока публичная заявка не отдаёт категорию позиции: узнаём её по названию работы из прайса.
 * ponytail: ключевые слова из стандартного прайса; свои названия работ дадут «Другое» — когда в PublicOrderLine
 * появится `category`, этот список не понадобится (ниже поле читается первым).
 */
const GUESS: [CategoryId, RegExp][] = [
  ["plumbing", /смесител|сифон|подводк|раковин|унитаз|стиральн|посудомо|засор|теч[ьи]|труб|душ|ванн|бойлер|водонагрев|канализ|кран|полотенцесуш/i],
  ["electrics", /розетк|выключател|светильник|люстр|автомат|узо|дифавтомат|кабел|провод|led|звонок|электр|освещен|техник/i],
  ["furniture", /шкаф|кроват|комод|стол|стул|тумб|полк|зеркал|карниз|телевизор|мебел|петл|направляющ|кухонн|кронштейн/i],
  ["repair", /замок|замк|ручк|двер|шпакл|покраск|плинтус|герметиз|ламинат|обои|стен|потолок|откос/i],
];

/** Категория заявки: позиция с наибольшей известной суммой, иначе первая. */
export function orderCategory(lines: readonly PublicOrderLine[]): CategoryId {
  let best: PublicOrderLine | undefined = lines[0];
  for (const l of lines) if (l.total !== null && l.total > (best?.total ?? -1)) best = l;
  if (!best) return "other";
  const declared = (best as { category?: string }).category;
  if (declared && IDS.has(declared)) return declared as CategoryId;
  return GUESS.find(([, re]) => re.test(best.title))?.[0] ?? "other";
}
