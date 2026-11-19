import { describe, expect, it } from "vitest";
import { excludedInQuery, excludedInText, searchServices, stem } from "@/lib/shop";
import type { ExcludedItem } from "@/lib/settings";

const excluded: ExcludedItem[] = [
  { title: "Газовое оборудование", hint: "Обратитесь в газовую службу.", keywords: ["газов", "газопровод", "котел"] },
  { title: "Несущие стены", hint: "Нужен проект.", keywords: ["несущ", "снос стен"] },
];
const services = [
  { title: "Замена смесителя", description: "Кухня или ванная", category: "plumbing" as const },
  { title: "Сборка шкафа", description: "Распашной шкаф", category: "furniture" as const },
  { title: "Установка розетки", description: "", category: "electrics" as const },
  { title: "Замена кровати", description: "", category: "furniture" as const },
];

const TITLES: Record<string, string> = { plumbing: "Сантехника", furniture: "Мебель", electrics: "Электрика" };
const search = (query: string) => searchServices(services, query, (id) => TITLES[id] ?? id);

describe("поиск по каталогу", () => {
  it("находит работу по любой падежной форме слова", () => {
    for (const q of ["смеситель", "смесителя", "смесителем", "СМЕСИТЕЛЬ"]) expect(search(q).map((s) => s.title)).toEqual(["Замена смесителя"]);
    expect(search("шкафы")).toHaveLength(1);
    expect(search("розетку")).toHaveLength(1);
  });

  it("все слова запроса должны встретиться; категория тоже ищется", () => {
    expect(search("замена смесителя")).toHaveLength(1);
    expect(search("замена шкафа")).toHaveLength(0);
    expect(search("мебель").map((s) => s.title)).toEqual(["Сборка шкафа", "Замена кровати"]);
    expect(search("   ")).toEqual([]);
  });

  it("основа не короче четырёх букв", () => {
    expect(stem("смеситель")).toBe("смесител");
    expect(stem("кран")).toBe("кран");
    expect(stem("мойка")).toBe("мойк");
    expect(stem("дом")).toBe("дом");
  });
});

describe("«чего мы не делаем»", () => {
  it("«газ» ещё не содержит основу «газов», но набор на лету уже показывает честный блок", () => {
    expect(excludedInQuery(excluded, "газ").map((e) => e.title)).toEqual(["Газовое оборудование"]);
    expect(excludedInQuery(excluded, "газовая плита").map((e) => e.title)).toEqual(["Газовое оборудование"]);
    expect(excludedInQuery(excluded, "ГАЗОВЫЙ котёл")).toHaveLength(1);
  });

  it("короткие и посторонние слова ничего не вызывают", () => {
    expect(excludedInQuery(excluded, "га")).toEqual([]);
    expect(excludedInQuery(excluded, "смеситель")).toEqual([]);
    expect(excludedInQuery(excluded, "")).toEqual([]);
  });

  it("в готовом тексте (комментарий, описание) нужна целая основа", () => {
    expect(excludedInText(excluded, "Нужно подключить газовую плиту").map((e) => e.title)).toEqual(["Газовое оборудование"]);
    expect(excludedInText(excluded, "Хочу снести стену, она несущая").map((e) => e.title)).toEqual(["Несущие стены"]);
    expect(excludedInText(excluded, "Повесить полку")).toEqual([]);
  });
});
