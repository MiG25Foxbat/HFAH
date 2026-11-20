"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GameOffer } from "@/components/game/GameOffer";
import { OrderExcludedNotice } from "@/components/shop/ExcludedNote";
import { PriceSummary } from "@/components/shop/PriceSummary";
import { Button, ButtonLink } from "@/components/ui/controls";
import { CheckIcon, CopyIcon, RefreshIcon } from "@/components/ui/icons";
import { UNIT_LABEL } from "@/lib/catalog";
import { formatClock, formatDay, formatMoscow } from "@/lib/format";
import { MATERIALS_LABEL } from "@/lib/order-schema";
import { ORDER_STATUS_LABEL, type OrderStatus, type PublicOrder } from "@/lib/order-types";
import { formatQty, formatRub } from "@/lib/pricing";

const POLL_MS = 30_000;

const STATUS_TEXT: Record<OrderStatus, string> = {
  new: "Заявка принята. Мастер позвонит, уточнит детали и согласует цену и время.",
  agreed: "Цена и время согласованы с мастером.",
  done: "Работа выполнена.",
  cancelled: "Заявка отменена. Если это ошибка, свяжитесь с мастером.",
};
const STATUS_TONE: Record<OrderStatus, string> = {
  new: "border-accent text-accent",
  agreed: "border-ok text-ok",
  done: "border-ok text-ok",
  cancelled: "border-danger text-danger",
};

/** Что изменилось между двумя состояниями заявки — для озвучивания скринридером. null — ничего важного. */
function describeChange(a: PublicOrder, b: PublicOrder): string | null {
  const parts: string[] = [];
  if (a.status !== b.status) parts.push(`статус «${ORDER_STATUS_LABEL[b.status]}»`);
  if (a.finalPrice !== b.finalPrice && b.finalPrice !== null) parts.push(`итоговая цена ${formatRub(b.finalPrice)}`);
  if (a.agreedAt !== b.agreedAt && b.agreedAt) parts.push(`время выезда ${formatMoscow(b.agreedAt)}`);
  return parts.length ? `Заявка обновилась: ${parts.join(", ")}.` : null;
}

const noop = () => () => {};

function CopyLink() {
  const href = useSyncExternalStore(noop, () => window.location.href, () => "");
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(window.location.href);
      ok = true;
    } catch {
      // нет Clipboard API (http, старый браузер) или запрещено: пробуем через скрытое поле
      const ta = document.createElement("textarea");
      ta.value = window.location.href;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.append(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    setState(ok ? "ok" : "fail");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3000);
  }

  return (
    <div className="grid gap-3">
      <input
        readOnly
        value={href}
        aria-label="Ссылка на заявку"
        onFocus={(e) => e.target.select()}
        className="min-h-12 w-full rounded-field border border-line bg-surface-2 px-4 text-[0.9375rem] tabular-nums text-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={copy}>
          {state === "ok" ? <CheckIcon /> : <CopyIcon />}
          Скопировать ссылку
        </Button>
        <p role="status" className="text-[0.9375rem]">
          {state === "ok" && <span className="text-ok">Ссылка скопирована</span>}
          {state === "fail" && <span className="text-danger">Не удалось скопировать: выделите ссылку выше и скопируйте вручную.</span>}
        </p>
      </div>
    </div>
  );
}

export function OrderLive({ token, initial }: { token: string; initial: PublicOrder }) {
  const [order, setOrder] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);
  const [gone, setGone] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useRef(initial);
  const last = useRef(0);

  const refresh = useCallback(
    async (force: boolean) => {
      if (document.visibilityState !== "visible") return;
      if (!force && Date.now() - last.current < 5000) return;
      last.current = Date.now();
      try {
        const res = await fetch(`/api/orders/${token}`, { cache: "no-store" });
        if (res.status === 404) {
          setGone(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as PublicOrder;
        const msg = describeChange(current.current, next);
        if (JSON.stringify(next) !== JSON.stringify(current.current)) {
          current.current = next;
          setOrder(next);
        }
        if (msg) setNotice(msg);
        setUpdatedAt(new Date());
        setStale(false);
      } catch {
        setStale(true);
      }
    },
    [token],
  );

  // опрос раз в 30 с, пока вкладка видна, и сразу при возвращении на вкладку
  useEffect(() => {
    const first = setTimeout(() => void refresh(true), 0);
    const id = setInterval(() => void refresh(true), POLL_MS);
    const onWake = () => void refresh(false);
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [refresh]);

  const manualCount = order.lines.filter((l) => l.total === null).length;
  const org = order.clientType === "organization" && !!order.orgName;
  const when = order.desiredDate ? `${formatDay(order.desiredDate)}${order.desiredTime ? `, ${order.desiredTime}` : ""}` : null;

  if (gone) {
    return (
      <div className="mx-auto grid w-full max-w-[720px] justify-items-start gap-4 px-4 py-16">
        <h1 className="text-[1.75rem] font-semibold">Заявка больше недоступна</h1>
        <p className="max-w-prose text-muted">Возможно, она удалена. Если нужна помощь, оформите новую заявку.</p>
        <ButtonLink href="/">На главную</ButtonLink>
      </div>
    );
  }

  return (
    <article className="mx-auto grid w-full max-w-[720px] gap-6 px-4 pb-10 pt-6">
      <p role="status" className="sr-only">
        {notice}
      </p>

      <header className="grid gap-3">
        <p className="text-[0.9375rem] text-muted">Создана {formatMoscow(order.createdAt)} по Москве</p>
        <h1 className="text-[1.75rem] font-semibold min-[900px]:text-[2.25rem]">Заявка № {order.number}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span data-status={order.status} className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 font-medium ${STATUS_TONE[order.status]}`}>
            <span aria-hidden="true" className="size-2.5 rounded-full bg-current" />
            {ORDER_STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="max-w-prose leading-snug">{STATUS_TEXT[order.status]}</p>
      </header>

      <OrderExcludedNotice items={order.excluded} />

      {(order.finalPrice !== null || order.agreedAt) && (
        <section aria-label="Согласовано с мастером" className="grid gap-4 rounded-panel border-2 border-ok bg-surface p-5">
          <h2 className="text-[1.25rem] font-semibold">Согласовано с мастером</h2>
          <dl className="grid gap-4 min-[480px]:grid-cols-2">
            {order.finalPrice !== null && (
              <div>
                <dt className="text-[0.9375rem] text-muted">Итоговая цена</dt>
                <dd className="text-[2rem] font-semibold leading-tight tabular-nums">{formatRub(order.finalPrice)}</dd>
              </div>
            )}
            {order.agreedAt && (
              <div>
                <dt className="text-[0.9375rem] text-muted">Время выезда</dt>
                <dd className="text-[1.5rem] font-semibold leading-tight tabular-nums">{formatMoscow(order.agreedAt)}</dd>
                <dd className="text-[0.875rem] text-muted">по Москве</dd>
              </div>
            )}
          </dl>
          <p className="text-[0.875rem] leading-snug text-muted">Материалы и запчасти оплачиваются отдельно.</p>
        </section>
      )}

      <section aria-label="Состав заявки" className="grid gap-4 rounded-panel border border-line bg-surface p-5">
        <h2 className="text-[1.25rem] font-semibold">Состав заявки</h2>
        <ul className="grid divide-y divide-line">
          {order.lines.map((l, i) => (
            <li key={i} className="grid gap-1 py-3 first:pt-0 last:pb-0">
              {/* название и цвет категории — из снимка заявки (на момент заказа), правки каталога после заказа их не меняют */}
              <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: l.categoryColor }} />
                {l.categoryTitle}
              </span>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium leading-snug">{l.title}</span>
                <span className="shrink-0 tabular-nums">{l.total === null ? "По фото" : formatRub(l.total)}</span>
              </div>
              <p className="text-[0.875rem] leading-snug text-muted tabular-nums">
                {l.unitPrice === null ? "Стоимость — по фото" : `${formatQty(l.qty)} ${UNIT_LABEL[l.unit]} × ${formatRub(l.unitPrice)}`}
                {l.complex ? ", сложные условия" : ""}
                {l.dismantle ? ", демонтаж старого" : ""}
              </p>
              {l.description && <p className="break-words text-[0.9375rem] leading-snug">{l.description}</p>}
            </li>
          ))}
        </ul>
        {(order.flags.urgent || order.flags.outOfTown) && (
          <p className="text-[0.9375rem] leading-snug">
            Условия выезда: {[order.flags.urgent && "срочный выезд", order.flags.outOfTown && "выезд за город"].filter(Boolean).join(", ")}.
          </p>
        )}
        <PriceSummary totals={order.totals} minutes={order.minutes} manualCount={manualCount} />
      </section>

      <section aria-label="Детали" className="grid gap-3 rounded-panel border border-line bg-surface p-5">
        <h2 className="text-[1.25rem] font-semibold">Детали</h2>
        <dl className="grid gap-3 text-[0.9375rem]">
          {org && (
            <div>
              <dt className="text-muted">Заказчик</dt>
              <dd className="break-words font-medium">{order.orgName}</dd>
            </div>
          )}
          {org && order.wantsInvoice && (
            <div>
              <dt className="text-muted">Счёт и закрывающие документы</dt>
              <dd className="font-medium">Да</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Материалы и запчасти</dt>
            <dd className="font-medium">{MATERIALS_LABEL[order.materials]}</dd>
          </div>
          {when && (
            <div>
              <dt className="text-muted">Желаемое время</dt>
              <dd className="font-medium">{when}</dd>
              <dd className="mt-0.5 text-[0.875rem] text-muted">Это пожелание — мастер подтвердит запись после разговора.</dd>
            </div>
          )}
          {order.photoCount > 0 && (
            <div>
              <dt className="text-muted">Фото места работы</dt>
              <dd className="font-medium">Приложено: {order.photoCount}</dd>
            </div>
          )}
        </dl>
      </section>

      <GameOffer token={token} mode={order.game.mode} facesEnabled={order.facesEnabled} />

      <section aria-label="Ссылка на заявку" className="grid gap-3 rounded-panel border border-line bg-surface p-5">
        <h2 className="text-[1.25rem] font-semibold">Ссылка на заявку</h2>
        <p className="max-w-prose text-[0.9375rem] leading-snug text-muted">
          Ссылка приватная: любой, у кого она есть, увидит состав заявки, статус{org ? " и название организации" : ""}. Телефон и адрес по ней не показываются. Не публикуйте её. Изменения мастера появятся здесь же.
        </p>
        <CopyLink />
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-muted" aria-live="off">
        <span className="tabular-nums">{updatedAt ? `Обновлено ${formatClock(updatedAt)}` : "Страница обновляется сама"}</span>
        {stale && <span className="text-danger">Не удалось обновить: показаны последние данные.</span>}
        <Button variant="ghost" onClick={() => void refresh(true)} className="min-h-11 px-3 text-[0.875rem]">
          <RefreshIcon className="size-4" />
          Обновить
        </Button>
      </footer>
    </article>
  );
}
