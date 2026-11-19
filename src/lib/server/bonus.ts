import "server-only";
import { randomInt } from "node:crypto";
import { sql } from "./db";
import { ApiError } from "./http";
import { getSettings } from "./settings";
import { looksLikeToken, sha256Hex } from "./tokens";
import type { BonusCodePublic } from "@/lib/order-types";

// без 0/O, 1/I/L — код читают и диктуют по телефону
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Код вида LAD-7K2M-QX4P. */
export function generateBonusCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `LAD-${part()}-${part()}`;
}

interface BonusRow {
  code: string;
  amount: number;
  minOrder: number;
  expiresAt: Date;
  status: BonusCodePublic["status"];
}

const toPublic = (r: BonusRow): BonusCodePublic => ({ ...r, expiresAt: r.expiresAt.toISOString() });

/**
 * Выдаёт ОДИН бонусный код на заявку (повторный вызов возвращает тот же). Только в режиме игры «bonus»;
 * текущий заказ дешевле не становится — код владелец применяет вручную к следующему.
 */
export async function claimBonus(token: string): Promise<BonusCodePublic> {
  if (!looksLikeToken(token)) throw new ApiError(404, "Заявка не найдена.", { code: "not_found" });
  const [order] = await sql<{ id: string }[]>`select id from orders where public_token_hash = ${sha256Hex(token)}`;
  if (!order) throw new ApiError(404, "Заявка не найдена.", { code: "not_found" });

  const existing = await selectCode(order.id);
  if (existing) return toPublic(existing);

  const { game } = await getSettings();
  if (game.mode !== "bonus") throw new ApiError(409, "Бонус за игру сейчас не выдаётся.", { code: "bonus_disabled" });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await sql<BonusRow[]>`
        insert into bonus_codes (order_id, code, amount, min_order, expires_at)
        values (${order.id}, ${generateBonusCode()}, ${game.bonusAmount}, ${game.minNextOrder},
                now() + make_interval(days => ${game.validDays}::int))
        on conflict (order_id) do nothing
        returning code, amount, min_order, expires_at, status`;
      if (row) return toPublic(row);
      const raced = await selectCode(order.id); // параллельный запрос успел раньше
      if (raced) return toPublic(raced);
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // повтор только при совпадении самого кода
    }
  }
  throw new Error("could not generate a unique bonus code");
}

async function selectCode(orderId: string): Promise<BonusRow | undefined> {
  const [row] = await sql<BonusRow[]>`
    select code, amount, min_order, expires_at, status from bonus_codes where order_id = ${orderId}`;
  return row;
}
