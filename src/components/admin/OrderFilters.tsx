"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PERIODS, PERIOD_LABEL, ordersHref, type OrderQuery, type Period } from "@/lib/admin/filters";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-types";
import { SelectField, TextField } from "./fields";
import { cx } from "./ui";

/** Поиск (с задержкой, пока человек печатает), период и статусы со счётчиками. Всё хранится в адресе — ссылкой можно поделиться. */
export function OrderFilters({
  query,
  counts,
}: {
  query: Pick<OrderQuery, "q" | "status" | "period" | "org">;
  counts: Record<OrderStatus, number>;
}) {
  const router = useRouter();
  const [text, setText] = useState(query.q);
  // что мы сами записали в адрес; адрес, изменённый не нами («Сбросить», «назад»), обновляет поле
  const [pushed, setPushed] = useState(query.q);
  const [seenQ, setSeenQ] = useState(query.q);
  if (query.q !== seenQ) {
    setSeenQ(query.q);
    if (query.q !== pushed) {
      setText(query.q);
      setPushed(query.q);
    }
  }

  const { status, period, org } = query;
  useEffect(() => {
    const value = text.trim();
    if (value === pushed) return;
    const t = setTimeout(() => {
      setPushed(value);
      router.replace(ordersHref({ status, period, org, q: value }), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [text, pushed, status, period, org, router]);

  const total = ORDER_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const chips: { value: OrderQuery["status"]; label: string; n: number }[] = [
    { value: "all", label: "Все", n: total },
    ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], n: counts[s] })),
  ];

  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid gap-3 min-[560px]:grid-cols-[minmax(0,1fr)_13rem] min-[560px]:gap-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPushed(text.trim());
            router.replace(ordersHref({ ...query, q: text.trim() }), { scroll: false });
          }}
        >
          <TextField
            label="Поиск"
            type="search"
            name="q"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Номер, имя, адрес, телефон…"
            autoComplete="off"
            enterKeyHint="search"
          />
        </form>
        <SelectField
          label="Период"
          labelClass="sr-only min-[560px]:not-sr-only"
          value={query.period}
          onChange={(e) => router.replace(ordersHref({ ...query, q: text.trim(), period: e.target.value as Period }), { scroll: false })}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </SelectField>
      </div>

      <nav aria-label="Статус заявки" className="min-w-0">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 min-[640px]:mx-0 min-[640px]:flex-wrap min-[640px]:px-0">
          {chips.map((c) => {
            const active = query.status === c.value;
            return (
              <li key={c.value} className="shrink-0">
                <Link
                  href={ordersHref({ ...query, status: c.value })}
                  aria-current={active ? "true" : undefined}
                  scroll={false}
                  className={cx(
                    "flex min-h-11 items-center gap-2 rounded-full border px-4 text-[0.9375rem] transition-colors",
                    active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  {c.label}
                  <span className={cx("tabular-nums", active ? "text-accent-ink" : "text-muted")}>{c.n}</span>
                </Link>
              </li>
            );
          })}
          <li className="shrink-0">
            <Link
              href={ordersHref({ ...query, org: !query.org })}
              aria-current={query.org ? "true" : undefined}
              scroll={false}
              className={cx(
                "flex min-h-11 items-center rounded-full border px-4 text-[0.9375rem] transition-colors",
                query.org ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              Только организации
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
