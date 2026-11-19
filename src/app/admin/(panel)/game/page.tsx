import Link from "next/link";
import { Suspense } from "react";
import { BonusActions, GameForm } from "@/components/admin/GameForms";
import { PageHeader, Panel, Tag } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/admin/format";
import { formatRub } from "@/lib/pricing";
import { ensureOwner } from "@/lib/server/admin/guard";
import { listBonusCodes, type BonusCodeRow } from "@/lib/server/admin/bonus";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Игра" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

export default function GamePage() {
  return (
    <>
      <PageHeader title="Игра" lead="Короткая игра после заявки: клиент приводит в порядок предмет. Это необязательное развлечение." />
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-panel bg-surface-2" />}>
        <Game />
      </Suspense>
    </>
  );
}

const STATUS_LABEL = { issued: "Выдан", redeemed: "Погашен", void: "Аннулирован" } as const;

async function Game() {
  await ensureOwner();
  const [{ game }, codes] = await Promise.all([getSettings(), listBonusCodes()]);

  return (
    <div className="grid gap-6">
      <GameForm initial={game} />
      <Panel title="Выданные коды" description="Один код на заявку. Проверьте код и заказ, примените скидку к следующему заказу сами и отметьте код погашенным.">
        {codes.length === 0 ? (
          <p className="text-muted">Кодов пока нет. Они появятся, когда клиент пройдёт игру в режиме «Бонус на следующий заказ».</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {codes.map((c) => (
              <CodeRow key={c.id} code={c} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function CodeRow({ code: c }: { code: BonusCodeRow }) {
  const expired = c.expired;
  return (
    <li className="grid gap-x-6 gap-y-3 py-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[1.125rem] font-semibold tracking-wide tabular-nums">{c.code}</span>
          <Tag tone={c.status === "issued" && !expired ? "ply" : undefined}>{STATUS_LABEL[c.status]}</Tag>
          {expired && <Tag tone="warn">Срок истёк</Tag>}
        </p>
        <p className="mt-1 text-[0.9375rem] text-muted">
          Заявка{" "}
          <Link href={`/admin/orders/${c.orderId}`} className="text-ink underline underline-offset-2">
            №&nbsp;{c.orderNumber}
          </Link>
          . Скидка {formatRub(c.amount)} при заказе от {formatRub(c.minOrder)}. Действует до {formatDateTime(c.expiresAt)}.
          {c.redeemedAt ? ` Погашен ${formatDateTime(c.redeemedAt)}.` : ""}
        </p>
      </div>
      <BonusActions id={c.id} status={c.status} />
    </li>
  );
}
