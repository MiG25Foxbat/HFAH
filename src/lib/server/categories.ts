import "server-only";
import { sql } from "./db";
import type { Category } from "@/lib/catalog";

const columns = () => sql`id, title, color, character, active, sort`;

/** Категории по порядку `sort`. По умолчанию все (кабинет); activeOnly — только видимые клиентам. */
export async function listCategories(opts: { activeOnly?: boolean } = {}): Promise<Category[]> {
  return sql<Category[]>`
    select ${columns()} from categories
    ${opts.activeOnly ? sql`where active` : sql``}
    order by sort, id`;
}

export async function getCategory(id: string): Promise<Category | null> {
  const [row] = await sql<Category[]>`select ${columns()} from categories where id = ${String(id).slice(0, 80)}`;
  return row ?? null;
}
