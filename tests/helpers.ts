import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { demoCategories, demoSettings } from "../scripts/_seed";
import { hashPassword } from "@/lib/server/password";
import { sql } from "@/lib/server/db";

export const hasDb = !!process.env.TEST_DATABASE_URL;
export const ORIGIN = "http://localhost:3000";
export const OWNER_PASSWORD = "test-owner-password-1";

/** Очищает данные (схема создана в global-setup) и заполняет фикстуры: настройки, 6 категорий, несколько работ, владелец. */
export async function resetData() {
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/_test$/);
  await sql.unsafe(
    "truncate orders, order_events, photos, sessions, rate_limits, bonus_codes, services, categories, settings, owner restart identity cascade",
  );
  const s = demoSettings;
  await sql`insert into settings (id, company, pricing, game, characters)
    values (1, ${sql.json(s.company)}, ${sql.json(s.pricing)}, ${sql.json(s.game)}, ${sql.json(s.characters)})`;
  await sql`insert into categories ${sql(demoCategories as never)}`;
  await sql`insert into services ${sql([
    row("t-wardrobe", "furniture", "Сборка шкафа", "pcs", "fixed", 3500, 150, false),
    row("t-faucet", "plumbing", "Замена смесителя", "pcs", "fixed", 2200, 60, true),
    row("t-rail", "repair", "Герметизация швов", "m", "fixed", 300, 12, false),
    row("t-hourly", "repair", "Работа мастера — почасово", "hour", "hourly", null, 60, false),
    row("t-other", "other", "Другая задача — оценка по фото", "pcs", "manual", null, 0, false),
    { ...row("t-gone", "repair", "Снятая с продажи", "pcs", "fixed", 100, 10, false), active: false },
  ])}`;
  await sql`insert into owner (id, password_hash) values (1, ${await hashPassword(OWNER_PASSWORD)})`;
}

function row(id: string, category: string, title: string, unit: string, pricing: string, price: number | null, minutes: number, dismantle: boolean) {
  return { id, category, title, description: "", unit, pricing, price, minutes, dismantle_allowed: dismantle, office: false, memo: "памятка", active: true, sort: 10 };
}

export const validOrder = (over: Record<string, unknown> = {}) => ({
  name: "Анна Тестова",
  phone: "8 (916) 123-45-67",
  address: "Москва, ул. Вымышленная, д. 1, кв. 2",
  access: { entrance: "2", intercom: "12К" },
  materials: "have",
  consent: true,
  lines: [{ serviceId: "t-wardrobe", qty: 1, complex: false, dismantle: false }],
  photos: [],
  ...over,
});

export function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "203.0.113.7", ...headers },
    body: JSON.stringify(body),
  });
}

export const newKey = () => randomUUID();

/** Контекст динамического маршрута Next 16: params — Promise. */
export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) }) as never;
