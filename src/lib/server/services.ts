import "server-only";
import { z } from "zod";
import { sql } from "./db";
import { CATEGORIES, type CategoryId, type Service } from "@/lib/catalog";

const columns = () => sql`id, category, title, description, unit, pricing, price, minutes, dismantle_allowed, memo, active, sort`;

/** Прайс по порядку «категория → sort». По умолчанию все работы; activeOnly — только доступные клиенту. */
export async function listServices(opts: { activeOnly?: boolean } = {}): Promise<Service[]> {
  return sql<Service[]>`
    select ${columns()} from services
    ${opts.activeOnly ? sql`where active` : sql``}
    order by array_position(array['furniture','plumbing','electrics','repair','other'], category), sort, id`;
}

export interface CatalogGroup {
  id: CategoryId;
  title: string;
  color: string;
  services: Service[];
}

/** Активные работы, сгруппированные по категориям (все пять категорий, порядок как в интерфейсе). */
export async function getCatalog(): Promise<CatalogGroup[]> {
  const services = await listServices({ activeOnly: true });
  return CATEGORIES.map((c) => ({ ...c, services: services.filter((s) => s.category === c.id) }));
}

/** Что владелец может менять у работы в «Тарифах». price — только у работ с pricing = 'fixed'. */
export const servicePatchSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500),
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

/** Обновляет работу; null, если такой нет. Бросает ZodError при неверных данных. */
export async function updateService(id: string, patch: ServicePatch): Promise<Service | null> {
  const data = servicePatchSchema.parse(patch);
  const keys = Object.keys(data) as (keyof typeof data)[];
  if (keys.length === 0) return (await sql<Service[]>`select ${columns()} from services where id = ${id}`)[0] ?? null;
  const [row] = await sql<Service[]>`update services set ${sql(data, ...keys)} where id = ${id} returning ${columns()}`;
  return row ?? null;
}
