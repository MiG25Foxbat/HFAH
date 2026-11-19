/** История заявки: что и как записывает кабинет в `order_events`, и как это показать. ЧИСТЫЙ модуль. */
import { formatRub } from "@/lib/pricing";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-types";
import { formatDateTimeLong } from "./format";

const statusLabel = (s: unknown) => ORDER_STATUS_LABEL[s as OrderStatus] ?? String(s);
const rub = (v: unknown) => (typeof v === "number" ? formatRub(v) : "не задана");
const when = (v: unknown) => (typeof v === "string" ? formatDateTimeLong(v) : "не задано");

const BONUS_LABEL: Record<string, string> = { issued: "выдан", redeemed: "погашен", void: "аннулирован" };

/** Короткая фраза для строки истории. Неизвестные виды событий показываются по имени, а не прячутся. */
export function describeEvent(kind: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "created":
      return "Заявка создана клиентом";
    case "status":
      return `Статус: ${statusLabel(data.from)} → ${statusLabel(data.to)}`;
    case "price":
      return `Итоговая цена: ${rub(data.from)} → ${rub(data.to)}`;
    case "agreed":
      return `Время выезда: ${when(data.from)} → ${when(data.to)}`;
    case "note":
      return "Приватная заметка изменена";
    case "bonus":
      return `Бонусный код ${String(data.code ?? "")}: ${BONUS_LABEL[String(data.status)] ?? String(data.status)}`;
    default:
      return kind;
  }
}
