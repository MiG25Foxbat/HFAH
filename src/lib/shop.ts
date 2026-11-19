/** Поиск по каталогу и «чего мы не делаем» для интерфейса. Чистый модуль. */
import type { Service } from "./catalog";
import { findExcluded } from "./excluded";
import type { ExcludedItem } from "./settings";

export const norm = (s: string) => s.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();

const ENDINGS = ["ами", "ями", "ого", "ему", "ому", "ыми", "ими", "ов", "ев", "ом", "ем", "ой", "ей", "ам", "ям", "ах", "ях", "ию", "ую", "юю", "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий", "а", "я", "у", "ю", "о", "е", "и", "ы", "ь", "й", "э"];

/** Грубая основа слова: отбрасывает падежное окончание («смеситель» → «смесител», так находится «смесителя»). Основа не короче 4 букв. */
export function stem(word: string): string {
  const ending = ENDINGS.find((e) => word.length - e.length >= 4 && word.endsWith(e));
  return ending ? word.slice(0, -ending.length) : word;
}

/** Работы, у которых в названии, описании или категории встречаются основы всех слов запроса. `titleOf` — название категории по id. */
export function searchServices<T extends Pick<Service, "title" | "description" | "category">>(
  services: readonly T[],
  query: string,
  titleOf: (categoryId: string) => string,
): T[] {
  const words = norm(query).split(" ").filter(Boolean).map(stem);
  if (!words.length) return [];
  return services.filter((s) => {
    const hay = norm(`${s.title} ${s.description} ${titleOf(s.category)}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Пункты «не берём», совпавшие с текстом (комментарий, описание задачи): ключевая основа встречается в тексте. */
export function excludedInText(excluded: readonly ExcludedItem[], text: string): ExcludedItem[] {
  const titles = new Set(findExcluded(excluded, [{ source: "text", text }]).map((m) => m.title));
  return excluded.filter((e) => titles.has(e.title));
}

/**
 * То же для строки поиска, но с учётом набора «на лету»: «газ» ещё не содержит основу «газов»,
 * поэтому слово от 3 букв, с которого начинается ключевая основа, тоже считается совпадением.
 */
export function excludedInQuery(excluded: readonly ExcludedItem[], query: string): ExcludedItem[] {
  const words = norm(query).split(" ").filter((w) => w.length >= 3);
  const byText = new Set(excludedInText(excluded, query).map((e) => e.title));
  return excluded.filter((e) => byText.has(e.title) || e.keywords.some((k) => words.some((w) => norm(k).startsWith(w))));
}

export const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
