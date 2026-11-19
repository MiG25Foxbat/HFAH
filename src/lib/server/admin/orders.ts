/**
 * Заявки в кабинете: список с поиском и фильтрами, карточка, решения владельца. Ядро работает с БД и не зависит от Next
 * (проверяется тестами); проверку владельца и перерисовку делают Server Actions в src/app/admin/actions.ts.
 * Телефон, адрес, заметка и фото отсюда уходят только на страницы кабинета.
 */
import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { sql } from "../db";
import type { PricingSnapshot } from "@/lib/pricing";
import type { ExcludedMatch } from "@/lib/excluded";
import type { Materials } from "@/lib/order-schema";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";
import type { ActionResult, DealInput } from "@/lib/admin/schemas";
import { type OrderQuery, type Period } from "@/lib/admin/filters";

type Frag = postgres.PendingQuery<postgres.Row[]>;

const isUuid = (v: string) => z.uuid().safeParse(v).success;
const NOT_FOUND = "Заявка не найдена. Возможно, её уже удалили.";

// ---- список ----

// Поиск не зависит от локали БД: при ctype = C lower() не знает кириллицу, поэтому строчные буквы и «ё» сводятся translate().
const FROM_CHARS = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё";
const TO_CHARS = FROM_CHARS.toLowerCase().replaceAll("ё", "е");
const fold = (expr: Frag): Frag => sql`translate(lower(${expr}), ${FROM_CHARS}, ${TO_CHARS})`;
const foldJs = (s: string) => s.toLowerCase().replaceAll("ё", "е");

const anyOf = (parts: Frag[]): Frag => sql`(${parts.reduce((a, b) => sql`${a} or ${b}`)})`;
const allOf = (parts: Frag[]): Frag => (parts.length ? sql`where ${parts.reduce((a, b) => sql`${a} and ${b}`)}` : sql``);

/**
 * Номер, имя, телефон, адрес, названия работ.
 * ponytail: полный просмотр таблицы без trigram-индекса — заявок у одной компании тысячи, а не миллионы; индекс — когда поиск станет заметен.
 */
function searchCond(q: string): Frag {
  const s = foldJs(q);
  const parts: Frag[] = [
    sql`strpos(${fold(sql`o.customer_name`)}, ${s}) > 0`,
    sql`strpos(${fold(sql`o.address`)}, ${s}) > 0`,
    sql`exists (select 1 from jsonb_array_elements(o.pricing_snapshot->'lines') l where strpos(${fold(sql`l->>'title'`)}, ${s}) > 0)`,
  ];
  const num = q.match(/^[#№]?\s*(\d{1,9})$/);
  if (num) parts.push(sql`o.number = ${Number(num[1])}`);
  if (/^[\d\s()+\-]+$/.test(q)) {
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) {
      parts.push(sql`strpos(o.phone, ${digits}) > 0`);
      if (/^[78]/.test(digits) && digits.length > 4) parts.push(sql`strpos(o.phone, ${digits.slice(1)}) > 0`);
    }
  }
  return anyOf(parts);
}

const MSK_MS = 3 * 3600_000;

function periodStart(period: Period, now = Date.now()): Date | null {
  if (period === "all") return null;
  if (period === "today") {
    const t = new Date(now + MSK_MS);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - MSK_MS);
  }
  return new Date(now - (period === "7d" ? 7 : 30) * 86_400_000);
}

export interface OrderListRow {
  id: string;
  number: number;
  status: OrderStatus;
  createdAt: Date;
  customerName: string;
  address: string;
  /** Известная часть цены на момент заявки (при hasManual — не итог). */
  knownTotal: number | null;
  hasManual: boolean;
  finalPrice: number | null;
  agreedAt: Date | null;
  urgent: boolean;
  outOfTown: boolean;
  excludedCount: number;
  photoCount: number;
}

export interface OrderList {
  rows: OrderListRow[];
  /** По статусам — с учётом поиска и периода, но без фильтра по статусу. */
  counts: Record<OrderStatus, number>;
  hasMore: boolean;
  /** Когда прочитано из БД (показывается как «Обновлено в …»). */
  generatedAt: Date;
}

export async function listOrders(query: OrderQuery): Promise<OrderList> {
  const base: Frag[] = [];
  if (query.q) base.push(searchCond(query.q));
  const since = periodStart(query.period);
  if (since) base.push(sql`o.created_at >= ${since}`);
  const withStatus = query.status === "all" ? base : [...base, sql`o.status = ${query.status}`];

  const [rows, countRows] = await Promise.all([
    sql<(Omit<OrderListRow, "excludedCount" | "photoCount"> & { excludedCount: number; photoCount: number })[]>`
      select o.id, o.number::int as number, o.status, o.created_at, o.customer_name, o.address, o.known_total, o.has_manual,
             o.final_price, o.agreed_at, o.urgent, o.out_of_town,
             jsonb_array_length(o.excluded_matches)::int as excluded_count,
             (select count(*)::int from photos p where p.order_id = o.id) as photo_count
      from orders o ${allOf(withStatus)}
      order by o.created_at desc, o.number desc
      limit ${query.limit + 1}`,
    sql<{ status: OrderStatus; n: number }[]>`select o.status, count(*)::int as n from orders o ${allOf(base)} group by o.status`,
  ]);

  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const r of countRows) counts[r.status] = r.n;
  return { rows: rows.slice(0, query.limit), counts, hasMore: rows.length > query.limit, generatedAt: new Date() };
}

/** Новые заявки — число на вкладке «Заявки». */
export async function countNewOrders(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from orders where status = 'new'`;
  return row.n;
}

// ---- карточка ----

export interface OrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  customerName: string;
  phone: string;
  address: string;
  access: Partial<Record<"entrance" | "intercom" | "floor" | "elevator" | "parking", string>>;
  outOfTown: boolean;
  urgent: boolean;
  materials: Materials;
  desiredDate: string | null;
  desiredTime: string | null;
  comment: string;
  snapshot: PricingSnapshot;
  knownTotal: number | null;
  hasManual: boolean;
  estMinutes: number;
  finalPrice: number | null;
  agreedAt: Date | null;
  ownerNote: string;
  excludedMatches: ExcludedMatch[];
  photos: { id: string; width: number; height: number; bytes: number }[];
  events: { id: string; at: Date; kind: string; data: Record<string, unknown> }[];
  bonus: { code: string; amount: number; minOrder: number; expiresAt: Date; status: "issued" | "redeemed" | "void" } | null;
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  if (!isUuid(id)) return null;
  const [[order], photos, events, [bonus]] = await Promise.all([
    sql<Omit<OrderDetail, "photos" | "events" | "bonus" | "snapshot"> & { pricingSnapshot: PricingSnapshot }[]>`
      select id, number::int as number, status, created_at, updated_at, customer_name, phone, address, access, out_of_town, urgent,
             materials, desired_date::text as desired_date, desired_time, comment, pricing_snapshot, known_total, has_manual,
             est_minutes, final_price, agreed_at, owner_note, excluded_matches
      from orders where id = ${id}`,
    sql<OrderDetail["photos"]>`select id, width, height, bytes from photos where order_id = ${id} order by created_at, id`,
    sql<OrderDetail["events"]>`select id::text as id, at, kind, data from order_events where order_id = ${id} order by at desc, id desc`,
    sql<NonNullable<OrderDetail["bonus"]>[]>`select code, amount, min_order, expires_at, status from bonus_codes where order_id = ${id}`,
  ]);
  if (!order) return null;
  const { pricingSnapshot, ...rest } = order as unknown as Omit<OrderDetail, "snapshot"> & { pricingSnapshot: PricingSnapshot };
  return { ...rest, snapshot: pricingSnapshot, photos, events, bonus: bonus ?? null };
}

// ---- решения владельца ----

/**
 * Итоговая цена, согласованное время и статус — одной записью. «Согласована» требует цену и время (то же правило, что и
 * ограничение в БД, но с понятным текстом). Каждое изменение пишет событие в историю; `updated_at` обновляет триггер.
 */
export async function saveDeal(orderId: string, input: DealInput): Promise<ActionResult> {
  if (!isUuid(orderId)) return { ok: false, error: NOT_FOUND };
  if (!(ORDER_STATUSES as readonly string[]).includes(input.status)) return { ok: false, fields: { status: "Выберите статус" } };
  if (input.status === "agreed" && (input.finalPrice === null || !input.agreedAt)) {
    return {
      ok: false,
      fields: {
        ...(input.finalPrice === null && { finalPrice: "Для статуса «Согласована» укажите итоговую цену" }),
        ...(!input.agreedAt && { agreedDate: "Для статуса «Согласована» укажите дату и время выезда" }),
      },
    };
  }
  return sql.begin(async (tx): Promise<ActionResult> => {
    const [cur] = await tx<{ status: OrderStatus; finalPrice: number | null; agreedAt: Date | null }[]>`
      select status, final_price, agreed_at from orders where id = ${orderId} for update`;
    if (!cur) return { ok: false, error: NOT_FOUND };

    const events: [kind: string, data: Record<string, unknown>][] = [];
    if (cur.status !== input.status) events.push(["status", { from: cur.status, to: input.status }]);
    if (cur.finalPrice !== input.finalPrice) events.push(["price", { from: cur.finalPrice, to: input.finalPrice }]);
    if ((cur.agreedAt?.getTime() ?? null) !== (input.agreedAt?.getTime() ?? null)) {
      events.push(["agreed", { from: cur.agreedAt?.toISOString() ?? null, to: input.agreedAt?.toISOString() ?? null }]);
    }
    if (!events.length) return { ok: true, message: "Изменений нет." };

    await tx`update orders set status = ${input.status}, final_price = ${input.finalPrice}, agreed_at = ${input.agreedAt}
             where id = ${orderId}`;
    for (const [kind, data] of events) {
      await tx`insert into order_events (order_id, kind, data) values (${orderId}, ${kind}, ${tx.json(data as never)})`;
    }
    return { ok: true, message: "Сохранено. Клиент увидит изменения по своей ссылке." };
  });
}

/** Приватная заметка владельца. В историю попадает только факт изменения, текст — нет. */
export async function saveNote(orderId: string, note: string): Promise<ActionResult> {
  if (!isUuid(orderId)) return { ok: false, error: NOT_FOUND };
  return sql.begin(async (tx): Promise<ActionResult> => {
    const [cur] = await tx<{ ownerNote: string }[]>`select owner_note from orders where id = ${orderId} for update`;
    if (!cur) return { ok: false, error: NOT_FOUND };
    if (cur.ownerNote === note) return { ok: true, message: "Изменений нет." };
    await tx`update orders set owner_note = ${note} where id = ${orderId}`;
    await tx`insert into order_events (order_id, kind, data) values (${orderId}, 'note', ${tx.json({ length: note.length })})`;
    return { ok: true, message: "Заметка сохранена. Её видите только вы." };
  });
}

/** Удаляет заявку; фото, история и бонусный код удаляются каскадом (ограничения БД). Необратимо. */
export async function deleteOrder(orderId: string): Promise<ActionResult> {
  if (!isUuid(orderId)) return { ok: false, error: NOT_FOUND };
  return sql.begin(async (tx): Promise<ActionResult> => {
    const [cur] = await tx<{ number: number; photos: number }[]>`
      select o.number::int as number, (select count(*)::int from photos p where p.order_id = o.id) as photos
      from orders o where o.id = ${orderId} for update`;
    if (!cur) return { ok: false, error: NOT_FOUND };
    await tx`delete from orders where id = ${orderId}`;
    return { ok: true, message: `Заявка № ${cur.number} удалена вместе с фото (${cur.photos}).` };
  });
}
