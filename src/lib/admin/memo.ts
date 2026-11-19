/**
 * «Памятка для выезда»: собирается из памяток работ (они сохранены в снимке заявки) и выбора материалов.
 * ЧИСТЫЙ модуль. Памятки — свободный текст владельца, поэтому не разбираем их на слова: одинаковые тексты
 * у разных работ объединяются, остальные идут отдельными строками.
 */
import type { PricingSnapshot } from "@/lib/pricing";
import { formatMinutes, formatQty } from "@/lib/pricing";
import { UNIT_LABEL } from "@/lib/catalog";
import type { Materials } from "@/lib/order-schema";

export interface TripMemo {
  materials: string;
  /** Работы с памяткой: одинаковый текст объединён. */
  groups: { titles: string[]; memo: string }[];
  /** Работы, у которых памятка в тарифах пуста. */
  missing: string[];
  /** Напоминания по условиям заявки. */
  reminders: string[];
}

export const MATERIALS_ADVICE: Record<Materials, string> = {
  have: "Материалы есть у клиента: до выезда уточните по телефону, всё ли на месте.",
  self: "Клиент покупает материалы сам: уточните, что именно он купит.",
  master: "Материалы покупает мастер, клиент платит по чеку: согласуйте список и сумму, сохраните чеки.",
  unknown: "Материалы пока не решены: уточните по телефону, что понадобится.",
};

const label = (l: PricingSnapshot["lines"][number]) => `${l.title}, ${formatQty(l.qty)} ${UNIT_LABEL[l.unit]}`;

export function buildTripMemo(snapshot: PricingSnapshot, materials: Materials): TripMemo {
  const byMemo = new Map<string, string[]>();
  const missing: string[] = [];
  for (const line of snapshot.lines) {
    const memo = line.memo.trim();
    if (!memo) {
      missing.push(line.title);
      continue;
    }
    byMemo.set(memo, [...(byMemo.get(memo) ?? []), label(line)]);
  }

  const reminders: string[] = [];
  if (snapshot.flags.urgent) reminders.push("Срочный выезд: сегодня или в ближайшие часы.");
  if (snapshot.flags.outOfTown) reminders.push("Выезд за город: заложите время на дорогу.");
  const complex = snapshot.lines.filter((l) => l.complex).map((l) => l.title);
  if (complex.length) reminders.push(`Сложные условия (высота, тесное место, старая проводка или трубы): ${complex.join("; ")}.`);
  const dismantle = snapshot.lines.filter((l) => l.dismantle).map((l) => l.title);
  if (dismantle.length) reminders.push(`Демонтаж старого: ${dismantle.join("; ")}.`);
  if (snapshot.hasManual) reminders.push("Есть работы «по фото»: время и инструмент уточните по снимкам и описанию.");
  if (snapshot.minutes > 0) reminders.push(`Ориентировочное время по нормам: ${formatMinutes(snapshot.minutes)}${snapshot.hasManual ? " + время по фото" : ""}.`);

  return {
    materials: MATERIALS_ADVICE[materials],
    groups: [...byMemo].map(([memo, titles]) => ({ titles, memo })),
    missing,
    reminders,
  };
}
