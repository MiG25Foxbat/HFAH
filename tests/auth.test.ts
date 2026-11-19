import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/server/db";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import {
  SESSION_COOKIE,
  changeOwnerPassword,
  createSession,
  destroySession,
  findSession,
  findSessionForRequest,
  verifyOwnerPassword,
} from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { OWNER_PASSWORD, hasDb, resetData } from "./helpers";

describe("пароль", () => {
  it("scrypt: у каждого пароля своя соль, проверка верна и не принимает чужое", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
    expect(await verifyPassword("x", "мусор")).toBe(false);
  });
});

describe.skipIf(!hasDb)("сеансы владельца", () => {
  beforeEach(resetData);

  it("в БД лежит только хеш id сеанса", async () => {
    const { id } = await createSession();
    const rows = await sql`select id_hash from sessions`;
    expect(rows).toHaveLength(1);
    expect(rows[0].idHash).not.toBe(id);
    expect(rows[0].idHash).toHaveLength(64);
    expect(await findSession(id)).not.toBeNull();
    expect(await findSession("a".repeat(43))).toBeNull();
    expect(await findSession(undefined)).toBeNull();
  });

  it("cookie разбирается из заголовка запроса", async () => {
    const { id } = await createSession();
    const req = (cookie: string) => new Request("http://localhost:3000/x", { headers: { cookie } });
    expect(await findSessionForRequest(req(`a=1; ${SESSION_COOKIE}=${id}; b=2`))).not.toBeNull();
    expect(await findSessionForRequest(req("a=1"))).toBeNull();
    expect(await findSessionForRequest(new Request("http://localhost:3000/x"))).toBeNull();
  });

  it("выход удаляет сеанс", async () => {
    const { id } = await createSession();
    await destroySession(id);
    expect(await findSession(id)).toBeNull();
  });

  it("verifyOwnerPassword", async () => {
    expect(await verifyOwnerPassword(OWNER_PASSWORD)).toBe(true);
    expect(await verifyOwnerPassword("неверный пароль")).toBe(false);
    expect(await verifyOwnerPassword("")).toBe(false);
  });

  it("смена пароля закрывает ВСЕ прежние сеансы и создаёт новый", async () => {
    const one = await createSession();
    const two = await createSession();
    const result = await changeOwnerPassword(OWNER_PASSWORD, "brand-new-password-2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await findSession(one.id)).toBeNull();
    expect(await findSession(two.id)).toBeNull();
    expect(await findSession(result.id)).not.toBeNull();
    expect((await sql`select 1 from sessions`).length).toBe(1);
    expect(await verifyOwnerPassword(OWNER_PASSWORD)).toBe(false);
    expect(await verifyOwnerPassword("brand-new-password-2")).toBe(true);
  });

  it("смена пароля с неверным текущим или коротким новым ничего не меняет", async () => {
    const one = await createSession();
    const wrong = await changeOwnerPassword("неверный", "brand-new-password-2");
    expect(wrong).toMatchObject({ ok: false, error: expect.stringContaining("Текущий") });
    const short = await changeOwnerPassword(OWNER_PASSWORD, "short");
    expect(short.ok).toBe(false);
    expect(await findSession(one.id)).not.toBeNull();
    expect(await verifyOwnerPassword(OWNER_PASSWORD)).toBe(true);
  });
});

describe.skipIf(!hasDb)("rateLimit", () => {
  beforeEach(resetData);

  it("считает атомарно и независимо по ключам", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => rateLimit("t:a", 3, 60)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.map((r) => r.count).sort()).toEqual([1, 2, 3, 4, 5]);
    expect((await rateLimit("t:b", 3, 60)).ok).toBe(true);
    const blocked = await rateLimit("t:a", 3, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });
});
