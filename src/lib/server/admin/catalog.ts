/**
 * Редактор каталога: категории и работы. Ядро работает с БД и не зависит от Next (проверяется тестами); проверку
 * владельца и перерисовку делают Server Actions. Изменения действуют только на новые заявки: заявка хранит снимок строк.
 */
import "server-only";
import { sql } from "../db";
import { CatalogError, lockCategories, nextServiceSort, type Tx } from "../services";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  MAX_CATEGORIES,
  parseCategoryForm,
  parseNewServiceForm,
  type CategoryInput,
} from "@/lib/admin/catalog-forms";
import type { ActionResult } from "@/lib/admin/schemas";

export type MoveDirection = "up" | "down";
const isDirection = (v: unknown): v is MoveDirection => v === "up" || v === "down";

const NO_CATEGORY = "Категория не найдена. Обновите страницу.";
const NO_SERVICE = "Работа не найдена. Обновите страницу.";

/** Ожидаемые ошибки каталога → ответ владельцу; всё прочее летит выше (Server Action покажет общую ошибку). */
async function catalogResult(run: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof CatalogError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Ставит `order` (id по порядку) в sort 10, 20, 30…; один запрос. */
async function writeOrder(tx: Tx, table: "categories" | "services", ids: string[]) {
  if (!ids.length) return;
  const rows = ids.map((id, i) => ({ id, sort: (i + 1) * 10 }));
  await tx`
    update ${tx(table)} t set sort = v.sort
    from (select * from jsonb_to_recordset(${tx.json(rows)}) as x(id text, sort int)) v
    where t.id = v.id`;
}

/** Меняет соседей местами и переписывает sort подряд: работает и при равных значениях sort. */
function swapped(ids: string[], id: string, direction: MoveDirection): string[] | null {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ---- категории ----

/** Создаёт категорию в конце списка. id — из названия (транслитерация), уникальный. */
export async function createCategory(values: unknown): Promise<ActionResult> {
  const parsed = parseCategoryForm(values);
  if (!parsed.ok) return parsed;
  return catalogResult(() =>
    sql.begin(async (tx): Promise<ActionResult> => {
      await tx`select pg_advisory_xact_lock(hashtext('categories-order'))`;
      const [{ n, max }] = await tx<{ n: number; max: number | null }[]>`select count(*)::int as n, max(sort) as max from categories`;
      if (n >= MAX_CATEGORIES) throw new CatalogError("too_many", `Категорий не больше ${MAX_CATEGORIES}: больше не помещаются в чипы и на кольцо подиума.`);
      const id = await uniqueSlug(slugify(parsed.data.title) || "category", async (c) => (await tx`select 1 from categories where id = ${c}`).length > 0);
      const d = parsed.data;
      await tx`insert into categories (id, title, color, character, active, sort) values (${id}, ${d.title}, ${d.color}, ${d.character}, ${d.active}, ${(max ?? 0) + 10})`;
      return { ok: true, message: `Категория «${d.title}» создана. Добавьте в неё работы.` };
    }),
  );
}

/** Название, цвет, персонаж, видимость. Id и порядок не меняются. */
export async function updateCategory(id: string, values: unknown): Promise<ActionResult> {
  const parsed = parseCategoryForm(values);
  if (!parsed.ok) return parsed;
  const d: CategoryInput = parsed.data;
  const [row] = await sql`update categories set title = ${d.title}, color = ${d.color}, character = ${d.character}, active = ${d.active} where id = ${String(id).slice(0, 80)} returning id`;
  return row ? { ok: true, message: "Сохранено. Новые заявки запомнят это название." } : { ok: false, error: NO_CATEGORY };
}

/** Показать или скрыть категорию вместе со всеми её работами (кнопка в списке). */
export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  const [row] = await sql`update categories set active = ${active === true} where id = ${String(id).slice(0, 80)} returning id`;
  return row ? { ok: true, message: active ? "Категория снова видна клиентам." : "Категория скрыта от клиентов вместе с работами." } : { ok: false, error: NO_CATEGORY };
}

/** Выше или ниже на одну позицию. Атомарно: порядок читается и пишется под блокировкой. */
export async function moveCategory(id: string, direction: MoveDirection): Promise<ActionResult> {
  if (!isDirection(direction)) return { ok: false, error: "Неизвестное направление." };
  return sql.begin(async (tx): Promise<ActionResult> => {
    await tx`select pg_advisory_xact_lock(hashtext('categories-order'))`;
    const ids = (await tx<{ id: string }[]>`select id from categories order by sort, id`).map((r) => r.id);
    if (!ids.includes(id)) return { ok: false, error: NO_CATEGORY };
    const next = swapped(ids, id, direction);
    if (!next) return { ok: true, message: direction === "up" ? "Она уже первая." : "Она уже последняя." };
    await writeOrder(tx, "categories", next);
    return { ok: true, message: "Порядок сохранён." };
  });
}

/** Удаляет пустую категорию. Если в ней есть работы (даже скрытые), отказывает: сначала перенесите или удалите их. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  return catalogResult(() =>
    sql.begin(async (tx): Promise<ActionResult> => {
      const found = await lockCategories(tx, [id]);
      if (!found.length) return { ok: false, error: NO_CATEGORY };
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from services where category = ${id}`;
      if (n > 0) throw new CatalogError("category_not_empty", `В категории ещё есть работы: ${n}. Перенесите или удалите их, затем удалите категорию.`);
      await tx`delete from categories where id = ${id}`;
      return { ok: true, message: "Категория удалена." };
    }),
  );
}

// ---- работы ----

/** Создаёт работу в конце категории. id — из названия, уникальный среди работ. */
export async function createService(categoryId: string, values: unknown): Promise<ActionResult> {
  const parsed = parseNewServiceForm(values);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  return catalogResult(() =>
    sql.begin(async (tx): Promise<ActionResult> => {
      if (!(await lockCategories(tx, [categoryId])).length) throw new CatalogError("no_category", NO_CATEGORY);
      const id = await uniqueSlug(slugify(d.title, 50) || "work", async (c) => (await tx`select 1 from services where id = ${c}`).length > 0);
      const sort = await nextServiceSort(tx, categoryId);
      await tx`
        insert into services (id, category, title, description, unit, pricing, price, minutes, dismantle_allowed, memo, office, active, sort)
        values (${id}, ${categoryId}, ${d.title}, ${d.description}, ${d.unit}, ${d.pricing}, ${d.price}, ${d.minutes}, ${d.dismantleAllowed}, ${d.memo}, ${d.office}, ${d.active}, ${sort})`;
      return { ok: true, message: `Работа «${d.title}» добавлена в конец категории.` };
    }),
  );
}

/** Показать или скрыть одну работу (кнопка в списке). Скрытая работа остаётся в прайсе владельца, клиенту недоступна. */
export async function setServiceActive(id: string, active: boolean): Promise<ActionResult> {
  const [row] = await sql<{ title: string }[]>`update services set active = ${active === true} where id = ${String(id).slice(0, 80)} returning title`;
  return row ? { ok: true, message: active ? `«${row.title}» снова видна клиентам.` : `«${row.title}» скрыта от клиентов.` } : { ok: false, error: NO_SERVICE };
}

/** Выше или ниже внутри категории (среди всех её работ, в том числе скрытых: владелец видит их в том же списке). */
export async function moveService(id: string, direction: MoveDirection): Promise<ActionResult> {
  if (!isDirection(direction)) return { ok: false, error: "Неизвестное направление." };
  return sql.begin(async (tx): Promise<ActionResult> => {
    const [svc] = await tx<{ category: string }[]>`select category from services where id = ${String(id).slice(0, 80)}`;
    if (!svc) return { ok: false, error: NO_SERVICE };
    await lockCategories(tx, [svc.category]);
    const ids = (await tx<{ id: string }[]>`select id from services where category = ${svc.category} order by sort, id`).map((r) => r.id);
    const next = swapped(ids, id, direction);
    if (!next) return { ok: true, message: direction === "up" ? "Она уже первая в категории." : "Она уже последняя в категории." };
    await writeOrder(tx, "services", next);
    return { ok: true, message: "Порядок сохранён." };
  });
}

/**
 * Удаляет работу. Заявки хранят снимок строк (pricing_snapshot, jsonb) и на таблицу работ не ссылаются, поэтому прошлые
 * заявки не меняются. Корзины клиентов с этой работой при открытии сайта очищаются с сообщением.
 */
export async function deleteService(id: string): Promise<ActionResult> {
  const [row] = await sql<{ title: string }[]>`delete from services where id = ${String(id).slice(0, 80)} returning title`;
  return row ? { ok: true, message: `Работа «${row.title}» удалена. Прошлые заявки не изменились.` } : { ok: false, error: NO_SERVICE };
}
