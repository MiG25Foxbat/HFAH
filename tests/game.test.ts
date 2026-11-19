import { beforeEach, describe, expect, it } from "vitest";
import { POST as claimRoute } from "@/app/api/game/claim/route";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { GET as getOrderRoute } from "@/app/api/orders/[token]/route";
import { sql } from "@/lib/server/db";
import { ORIGIN, ctx, hasDb, jsonRequest, newKey, resetData, validOrder } from "./helpers";

const claim = (token: string, headers: Record<string, string> = {}) =>
  claimRoute(jsonRequest("/api/game/claim", { token }, headers));

async function newOrderToken() {
  const res = await createOrderRoute(jsonRequest("/api/orders", validOrder(), { "idempotency-key": newKey() }));
  return (await res.json()).token as string;
}

describe.skipIf(!hasDb)("POST /api/game/claim", () => {
  beforeEach(resetData);

  it("выдаёт один код на заявку; повтор возвращает тот же; в публичной заявке он виден", async () => {
    const token = await newOrderToken();
    const first = await claim(token);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.code).toMatch(/^LAD-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(body).toMatchObject({ amount: 300, minOrder: 3000, status: "issued" });
    const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59.9);
    expect(days).toBeLessThan(60.1);

    const again = await (await claim(token)).json();
    expect(again).toEqual(body);
    expect((await sql`select 1 from bonus_codes`).length).toBe(1);

    const pub = await (await getOrderRoute(new Request(`${ORIGIN}/api/orders/${token}`), ctx({ token }))).json();
    expect(pub.bonus.code).toBe(body.code);
    expect(pub.totals.knownTotal).toBe(3500); // текущий заказ не дешевеет
  });

  it("параллельные запросы дают один код", async () => {
    const token = await newOrderToken();
    const codes = await Promise.all([claim(token), claim(token), claim(token)].map(async (p) => (await (await p).json()).code));
    expect(new Set(codes).size).toBe(1);
    expect((await sql`select 1 from bonus_codes`).length).toBe(1);
  });

  it("режим не «bonus» — 409; уже выданный код всё равно возвращается", async () => {
    const token = await newOrderToken();
    await sql`update settings set game = jsonb_set(game, '{mode}', '"play"')`;
    const off = await claim(token);
    expect(off.status).toBe(409);
    expect((await off.json()).code).toBe("bonus_disabled");

    await sql`update settings set game = jsonb_set(game, '{mode}', '"bonus"')`;
    const issued = await (await claim(token)).json();
    await sql`update settings set game = jsonb_set(game, '{mode}', '"off"')`;
    expect(await (await claim(token)).json()).toEqual(issued);
  });

  it("неизвестная заявка — 404; чужой Origin — 403; кривое тело — 400", async () => {
    expect((await claim("x".repeat(43))).status).toBe(404);
    expect((await claim("x".repeat(43), { origin: "https://evil.example" })).status).toBe(403);
    expect((await claimRoute(jsonRequest("/api/game/claim", { nope: 1 }))).status).toBe(400);
  });
});
