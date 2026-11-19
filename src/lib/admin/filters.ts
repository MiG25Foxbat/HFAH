/** Фильтры списка заявок: параметры адреса ↔ значения. ЧИСТЫЙ модуль (сервер читает, браузер строит ссылки). */
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";

export const PERIODS = ["all", "today", "7d", "30d"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = {
  all: "За всё время",
  today: "Сегодня",
  "7d": "7 дней",
  "30d": "30 дней",
};

export const PAGE_SIZE = 100;
const MAX_PAGE = 1000;

export interface OrderQuery {
  q: string;
  status: OrderStatus | "all";
  period: Period;
  /** Сколько строк показывать (кратно PAGE_SIZE). */
  limit: number;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseOrderQuery(raw: Raw): OrderQuery {
  const status = first(raw.status);
  const period = first(raw.period);
  const n = Number(first(raw.n));
  return {
    q: first(raw.q).trim().slice(0, 100),
    status: (ORDER_STATUSES as readonly string[]).includes(status) ? (status as OrderStatus) : "all",
    period: (PERIODS as readonly string[]).includes(period) ? (period as Period) : "all",
    limit: Number.isInteger(n) && n > PAGE_SIZE ? Math.min(MAX_PAGE, Math.ceil(n / PAGE_SIZE) * PAGE_SIZE) : PAGE_SIZE,
  };
}

/** Ссылка на список с заданными фильтрами; значения по умолчанию в адрес не попадают. */
export function ordersHref(query: Partial<OrderQuery>): string {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.status && query.status !== "all") p.set("status", query.status);
  if (query.period && query.period !== "all") p.set("period", query.period);
  if (query.limit && query.limit > PAGE_SIZE) p.set("n", String(query.limit));
  const s = p.toString();
  return s ? `/admin?${s}` : "/admin";
}
