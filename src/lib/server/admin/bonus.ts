/** Бонусные коды в кабинете: список и ручная отметка «погашен» / «аннулирован». Автоматического погашения нет. */
import "server-only";
import { sql } from "../db";
import { BONUS_STATUSES, type ActionResult, type BonusStatus } from "@/lib/admin/schemas";

export interface BonusCodeRow {
  id: number;
  code: string;
  amount: number;
  minOrder: number;
  expiresAt: Date;
  status: BonusStatus;
  createdAt: Date;
  redeemedAt: Date | null;
  /** Срок вышел, а код всё ещё «выдан». */
  expired: boolean;
  orderId: string;
  orderNumber: number;
}

export async function listBonusCodes(): Promise<BonusCodeRow[]> {
  return sql<BonusCodeRow[]>`
    select b.id::int as id, b.code, b.amount, b.min_order, b.expires_at, b.status, b.created_at, b.redeemed_at,
           (b.status = 'issued' and b.expires_at < now()) as expired, o.id as order_id, o.number::int as order_number
    from bonus_codes b join orders o on o.id = b.order_id
    order by b.created_at desc, b.id desc
    limit 200`;
}

/** Меняет статус кода и пишет событие в историю заявки. Вернуть код в «выдан» можно — на случай случайного нажатия. */
export async function setBonusStatus(id: number, status: BonusStatus): Promise<ActionResult> {
  if (!Number.isSafeInteger(id) || id < 1 || !(BONUS_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Код не найден." };
  }
  return sql.begin(async (tx): Promise<ActionResult> => {
    const [cur] = await tx<{ code: string; status: BonusStatus; orderId: string }[]>`
      select code, status, order_id from bonus_codes where id = ${id} for update`;
    if (!cur) return { ok: false, error: "Код не найден." };
    if (cur.status === status) return { ok: true, message: "Изменений нет." };
    await tx`update bonus_codes set status = ${status}, redeemed_at = ${status === "redeemed" ? new Date() : null} where id = ${id}`;
    await tx`insert into order_events (order_id, kind, data)
             values (${cur.orderId}, 'bonus', ${tx.json({ code: cur.code, status, from: cur.status })})`;
    return { ok: true };
  });
}
