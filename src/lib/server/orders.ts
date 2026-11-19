import "server-only";
import { createHash } from "node:crypto";
import { sql } from "./db";
import { ApiError } from "./http";
import { getSettings } from "./settings";
import { listServices } from "./services";
import { looksLikeToken, orderToken, sha256Hex } from "./tokens";
import { PricingError, buildPricingSnapshot, type PricingSnapshot } from "@/lib/pricing";
import { findExcluded, type ExcludedMatch } from "@/lib/excluded";
import type { OrderData } from "@/lib/order-schema";
import type { OrderStatus, PublicOrder } from "@/lib/order-types";

export interface CreatedOrder {
  number: number;
  token: string;
  url: string;
  /** true — это повтор запроса с тем же Idempotency-Key, новая заявка не создавалась. */
  replay: boolean;
}

/** Канонический JSON (ключи по алфавиту, undefined пропускается) — основа отпечатка запроса. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

const fingerprintOf = (data: OrderData) => createHash("sha256").update(stable(data)).digest("hex");

async function findByKey(key: string) {
  const [row] = await sql<{ number: string; requestFingerprint: string }[]>`
    select number, request_fingerprint from orders where idempotency_key = ${key}`;
  return row ?? null;
}

function replayOf(row: { number: string; requestFingerprint: string }, fingerprint: string, key: string): CreatedOrder {
  if (row.requestFingerprint !== fingerprint) {
    throw new ApiError(409, "Этот ключ запроса уже использован для другой заявки. Обновите страницу и отправьте заново.", {
      code: "idempotency_conflict",
    });
  }
  const token = orderToken(key);
  return { number: Number(row.number), token, url: `/o/${token}`, replay: true };
}

/**
 * Создаёт заявку. Цены берутся из БД и считаются заново (суммы клиента не принимаются), условия сохраняются
 * снимком. Повтор с тем же ключом и тем же содержимым возвращает ту же заявку; с другим содержимым — 409.
 * Возвращает результат только после COMMIT.
 */
export async function createOrder(data: OrderData, idempotencyKey: string): Promise<CreatedOrder> {
  const fingerprint = fingerprintOf(data);
  const existing = await findByKey(idempotencyKey);
  if (existing) return replayOf(existing, fingerprint, idempotencyKey);

  const [settings, services] = await Promise.all([getSettings(), listServices()]);

  let snapshot: PricingSnapshot;
  try {
    snapshot = buildPricingSnapshot(services, settings.pricing, { lines: data.lines, urgent: data.urgent, outOfTown: data.outOfTown });
  } catch (e) {
    if (e instanceof PricingError) {
      throw new ApiError(422, e.message, { code: e.code, fields: { [`lines.${e.lineIndex}`]: e.message } });
    }
    throw e;
  }

  // «Другое»: описание ≥ 10 символов и хотя бы одно фото (оценка делается по ним)
  const fields: Record<string, string> = {};
  const manualIds = new Set(services.filter((s) => s.pricing === "manual").map((s) => s.id));
  data.lines.forEach((l, i) => {
    if (manualIds.has(l.serviceId) && (l.description ?? "").length < 10) {
      fields[`lines.${i}.description`] = "Опишите задачу подробнее — не короче 10 символов.";
    }
  });
  if (snapshot.hasManual && data.photos.length < 1) {
    fields.photos = "Для задачи «Другое» приложите хотя бы одно фото — по нему мастер оценит работу.";
  }
  if (Object.keys(fields).length) throw new ApiError(422, "Проверьте заявку.", { code: "validation", fields });

  const excluded = findExcluded(settings.company.excluded, [
    { source: "comment", text: data.comment },
    ...data.lines.map((l, i) => ({ source: `line:${i}`, text: l.description ?? "" })),
  ]);

  const created = await sql.begin(async (tx) => {
    const [order] = await tx<{ id: string; number: string }[]>`
      insert into orders (
        customer_name, phone, address, access, out_of_town, urgent, materials, desired_date, desired_time, comment,
        consent_at, pricing_snapshot, known_total, has_manual, est_minutes,
        public_token_hash, idempotency_key, request_fingerprint, excluded_matches
      ) values (
        ${data.name}, ${data.phone}, ${data.address}, ${tx.json(data.access)}, ${data.outOfTown}, ${data.urgent}, ${data.materials},
        ${data.desiredDate ?? null}, ${data.desiredTime ?? null}, ${data.comment},
        now(), ${tx.json(snapshot as never)}, ${snapshot.knownTotal}, ${snapshot.hasManual}, ${snapshot.minutes},
        ${sha256Hex(orderToken(idempotencyKey))}, ${idempotencyKey}, ${fingerprint}, ${tx.json(excluded)}
      )
      on conflict (idempotency_key) do nothing
      returning id, number`;
    if (!order) return null; // параллельный повтор с тем же ключом — разберём ниже

    for (const photo of data.photos) {
      const attached = await tx`
        update photos set order_id = ${order.id}
        where id = ${photo.id} and order_id is null and upload_key_hash = ${sha256Hex(photo.key)}
        returning id`;
      if (!attached.length) {
        throw new ApiError(422, "Фото не найдено или уже использовано. Загрузите его снова.", {
          code: "photo_missing",
          fields: { photos: "Фото не найдено или уже использовано. Загрузите его снова." },
        });
      }
    }
    await tx`
      insert into order_events (order_id, kind, data)
      values (${order.id}, 'created', ${tx.json({ lines: snapshot.lines.length, knownTotal: snapshot.knownTotal, photos: data.photos.length })})`;
    return order;
  });

  if (!created) {
    const row = await findByKey(idempotencyKey);
    if (!row) throw new Error("order vanished after idempotency conflict");
    return replayOf(row, fingerprint, idempotencyKey);
  }
  const token = orderToken(idempotencyKey);
  return { number: Number(created.number), token, url: `/o/${token}`, replay: false };
}

interface PublicRow {
  number: string;
  status: OrderStatus;
  createdAt: Date;
  desiredDate: string | null;
  desiredTime: string | null;
  materials: PublicOrder["materials"];
  pricingSnapshot: PricingSnapshot;
  finalPrice: number | null;
  agreedAt: Date | null;
  photoCount: number;
  excludedMatches: ExcludedMatch[];
  bonusCode: string | null;
  bonusAmount: number | null;
  bonusMinOrder: number | null;
  bonusExpiresAt: Date | null;
  bonusStatus: "issued" | "redeemed" | "void" | null;
}

/** Публичное представление заявки по токену или null. Без телефона, адреса, доступа, заметки владельца и фото. */
export async function getPublicOrder(token: string): Promise<PublicOrder | null> {
  if (!looksLikeToken(token)) return null;
  const [[row], settings] = await Promise.all([
    sql<PublicRow[]>`
      select o.number, o.status, o.created_at, o.desired_date::text as desired_date, o.desired_time, o.materials,
             o.pricing_snapshot, o.final_price, o.agreed_at, o.excluded_matches,
             (select count(*)::int from photos p where p.order_id = o.id) as photo_count,
             b.code as bonus_code, b.amount as bonus_amount, b.min_order as bonus_min_order,
             b.expires_at as bonus_expires_at, b.status as bonus_status
      from orders o left join bonus_codes b on b.order_id = o.id
      where o.public_token_hash = ${sha256Hex(token)}`,
    getSettings(),
  ]);
  if (!row) return null;
  const s = row.pricingSnapshot;
  return {
    number: Number(row.number),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lines: s.lines.map((l) => ({
      title: l.title,
      category: l.category,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      total: l.total,
      complex: l.complex,
      dismantle: l.dismantle,
      ...(l.description ? { description: l.description } : {}),
    })),
    totals: {
      subtotal: s.subtotal,
      topUp: s.topUp,
      urgent: s.urgent,
      worksTotal: s.worksTotal,
      outOfTown: s.outOfTown,
      knownTotal: s.knownTotal,
      hasManual: s.hasManual,
      minimumIsPreliminary: s.minimumIsPreliminary,
    },
    flags: s.flags,
    minutes: s.minutes,
    materials: row.materials,
    desiredDate: row.desiredDate,
    desiredTime: row.desiredTime,
    finalPrice: row.finalPrice,
    agreedAt: row.agreedAt?.toISOString() ?? null,
    photoCount: row.photoCount,
    // Только названия и подсказки: ключевые слова и место совпадения остаются у владельца.
    excluded: [...new Set(row.excludedMatches.map((m) => m.title))].map((title) => ({
      title,
      hint: settings.company.excluded.find((x) => x.title === title)?.hint ?? "",
    })),
    bonus: row.bonusCode
      ? {
          code: row.bonusCode,
          amount: row.bonusAmount as number,
          minOrder: row.bonusMinOrder as number,
          expiresAt: (row.bonusExpiresAt as Date).toISOString(),
          status: row.bonusStatus as "issued" | "redeemed" | "void",
        }
      : null,
    facesEnabled: settings.characters.facesEnabled,
    game: settings.game,
  };
}
