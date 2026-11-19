import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { sql } from "./db";
import { listCategories } from "./categories";
import type { Category, Service } from "@/lib/catalog";

export type Tx = postgres.TransactionSql;

/** Ожидаемая ошибка редактора каталога: текст можно показывать владельцу. */
export class CatalogError extends Error {
  constructor(
    public code: "no_category" | "no_service" | "category_not_empty" | "too_many",
    message: string,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

const columns = () => sql`s.id, s.category, s.title, s.description, s.unit, s.pricing, s.price, s.minutes, s.dismantle_allowed, s.office, s.memo, s.active, s.sort`;

/**
 * Прайс по порядку «категория → sort работы». По умолчанию все работы (кабинет); activeOnly — только доступные клиенту:
 * работа включена и её категория тоже (скрытая категория скрывает все свои работы).
 */
export async function listServices(opts: { activeOnly?: boolean } = {}): Promise<Service[]> {
  return sql<Service[]>`
    select ${columns()} from services s join categories c on c.id = s.category
    ${opts.activeOnly ? sql`where s.active and c.active` : sql``}
    order by c.sort, c.id, s.sort, s.id`;
}

export interface CatalogGroup extends Category {
  services: Service[];
}

/** Что видит клиент: видимые категории по порядку, в каждой её доступные работы. Категория без работ клиенту не показывается. */
export async function getCatalog(): Promise<CatalogGroup[]> {
  const [categories, services] = await Promise.all([listCategories({ activeOnly: true }), listServices({ activeOnly: true })]);
  return categories.map((c) => ({ ...c, services: services.filter((s) => s.category === c.id) })).filter((g) => g.services.length > 0);
}

/** Что владелец может менять у работы в «Тарифах». price — только у работ с pricing = 'fixed'. */
export const servicePatchSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500),
    category: z.string().min(1).max(80),
    office: z.boolean(),
    price: z.number().int().min(0).max(1_000_000),
    minutes: z.number().int().min(0).max(1440),
    dismantleAllowed: z.boolean(),
    memo: z.string().trim().max(1000),
    active: z.boolean(),
    sort: z.number().int(),
  })
  .partial()
  .strict();

export type ServicePatch = z.infer<typeof servicePatchSchema>;

/** Блокирует строки категорий (в порядке id, чтобы параллельные операции не ждали друг друга по кругу); возвращает найденные id. */
export async function lockCategories(tx: Tx, ids: string[]): Promise<string[]> {
  const rows = await tx<{ id: string }[]>`select id from categories where id = any(${[...new Set(ids)].sort()}) order by id for no key update`;
  return rows.map((r) => r.id);
}

/** Сортировка для новой работы: в конец категории, с шагом 10 (как в посеве). Вызывать при заблокированной категории. */
export async function nextServiceSort(tx: Tx, category: string): Promise<number> {
  const [row] = await tx<{ max: number | null }[]>`select max(sort) as max from services where category = ${category}`;
  return (row?.max ?? 0) + 10;
}

/**
 * Обновляет работу; null, если такой нет. Бросает ZodError при неверных данных и CatalogError(`no_category`), если новой
 * категории нет. Переезд в другую категорию ставит работу в её конец.
 */
export async function updateService(id: string, patch: ServicePatch): Promise<Service | null> {
  const data = servicePatchSchema.parse(patch);
  return sql.begin(async (tx) => {
    const [cur] = await tx<{ category: string }[]>`select category from services where id = ${id}`;
    if (!cur) return null;
    const next: Record<string, unknown> = { ...data };
    if (data.category !== undefined && data.category !== cur.category) {
      const found = await lockCategories(tx, [cur.category, data.category]);
      if (!found.includes(data.category)) throw new CatalogError("no_category", "Такой категории нет. Обновите страницу.");
      next.sort = await nextServiceSort(tx, data.category);
    } else {
      delete next.category;
    }
    const keys = Object.keys(next);
    if (keys.length === 0) return (await tx<Service[]>`select ${columns()} from services s where s.id = ${id}`)[0] ?? null;
    const [row] = await tx<Service[]>`update services s set ${tx(next, ...keys)} where s.id = ${id} returning ${columns()}`;
    return row ?? null;
  });
}
