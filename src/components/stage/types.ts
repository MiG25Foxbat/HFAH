import type { Category } from "@/lib/catalog";

/** Что сцене нужно знать о категории: какого персонажа показать и каким цветом подсветить подиум. */
export type StageCategory = Pick<Category, "id" | "color" | "character">;
