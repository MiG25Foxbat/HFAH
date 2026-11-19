/** Идентификатор из названия: кириллица транслитерируется, остальное — в латиницу, цифры и дефисы. Чистый модуль. */

const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** «Бытовая техника» → «bytovaya-tehnika»; пустая строка, если в названии нет ни букв, ни цифр. Подходит под `^[a-z0-9]+(-[a-z0-9]+)*$`. */
export function slugify(title: string, maxLength = 40): string {
  const latin = [...title.toLowerCase()].map((ch) => MAP[ch] ?? ch).join("");
  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Первый свободный вариант: base, base-2, base-3… `taken` — проверка занятости. */
export async function uniqueSlug(base: string, taken: (candidate: string) => Promise<boolean>): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
}
