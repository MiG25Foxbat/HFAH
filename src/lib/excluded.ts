/** Поиск «чего мы не берём» в свободном тексте. Чистый модуль: годится и для подсказки в форме, и для сервера. */
import type { ExcludedItem } from "./settings";

export interface ExcludedMatch {
  title: string;
  keyword: string;
  /** Где нашли: "comment" или "line:<индекс позиции>". */
  source: string;
}

const norm = (s: string) => s.toLowerCase().replaceAll("ё", "е");

/** Ищет ключевые основы из списка «не берём» в текстах. Заявку не блокирует — результат сохраняется для владельца. */
export function findExcluded(excluded: readonly ExcludedItem[], texts: readonly { source: string; text: string }[]): ExcludedMatch[] {
  const found: ExcludedMatch[] = [];
  for (const { source, text } of texts) {
    const haystack = norm(text);
    if (!haystack) continue;
    for (const item of excluded) {
      const keyword = item.keywords.map(norm).find((k) => k && haystack.includes(k));
      if (keyword) found.push({ title: item.title, keyword, source });
    }
  }
  return found;
}
