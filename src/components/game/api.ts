import type { BonusCodePublic, PublicOrder } from "@/lib/order-types";

export type ClaimResult = { ok: true; bonus: BonusCodePublic } | { ok: false; status: number; message: string };

/** POST /api/game/claim: один код на заявку, повтор возвращает тот же. Origin браузер ставит сам. */
export async function claimBonus(token: string): Promise<ClaimResult> {
  try {
    const res = await fetch("/api/game/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, bonus: (await res.json()) as BonusCodePublic };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const message =
      res.status === 409
        ? "Бонус за игру сейчас не выдаётся: владелец его отключил. Игра сыграна, но кода нет."
        : res.status === 429
          ? "Слишком много запросов. Подождите немного и повторите."
          : res.status === 404
            ? "Заявка не найдена. Откройте страницу заявки по ссылке ещё раз."
            : (body?.error ?? "Не удалось получить код. Повторите попытку.");
    return { ok: false, status: res.status, message };
  } catch {
    return { ok: false, status: 0, message: "Нет связи с сервером. Проверьте интернет и повторите." };
  }
}

/** GET /api/orders/[token] — нужен состав (категория предмета), условия игры и уже выданный код. null — не получилось. */
export async function fetchOrder(token: string, signal?: AbortSignal): Promise<PublicOrder | null> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(token)}`, { cache: "no-store", signal });
    return res.ok ? ((await res.json()) as PublicOrder) : null;
  } catch {
    return null;
  }
}
