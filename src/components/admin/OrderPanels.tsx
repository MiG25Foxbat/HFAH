import Link from "next/link";
import type { ReactNode } from "react";
import { describeEvent } from "@/lib/admin/events";
import { formatDateTime, formatDateTimeLong, formatDay, formatPhone } from "@/lib/admin/format";
import { buildTripMemo } from "@/lib/admin/memo";
import { UNIT_LABEL } from "@/lib/catalog";
import { MATERIALS_LABEL } from "@/lib/order-schema";
import { formatMinutes, formatQty, formatRub, type SnapshotLine } from "@/lib/pricing";
import type { ExcludedItem } from "@/lib/settings";
import type { OrderDetail } from "@/lib/server/admin/orders";
import { CopyButton } from "./CopyButton";
import { Icon } from "./Icon";
import { Panel, StatusBadge, Tag, button, cx } from "./ui";

/** Список «термин — значение»: на телефоне в одну колонку, на широком экране в две. */
function Facts({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 min-[640px]:grid-cols-[10.5rem_minmax(0,1fr)]">
      {items.map((i) => (
        <div key={i.term} className="contents">
          <dt className="text-[0.875rem] text-muted min-[640px]:pt-0.5">{i.term}</dt>
          <dd className="min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OrderHeader({ order }: { order: OrderDetail }) {
  const changed = order.updatedAt.getTime() - order.createdAt.getTime() > 60_000;
  return (
    <div className="mb-6">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 rounded-field pr-3 text-[0.9375rem] text-muted hover:text-ink">
        <Icon name="back" className="size-4" />
        Все заявки
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[1.625rem] font-semibold leading-tight tabular-nums">Заявка №&nbsp;{order.number}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-[0.875rem] text-muted">
        Поступила {formatDateTime(order.createdAt)}.{changed ? ` Изменена ${formatDateTime(order.updatedAt)}.` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="text-[1.125rem] font-medium">{order.customerName}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`tel:${order.phone}`} className={button("primary", "md", "tabular-nums")}>
            <Icon name="phone" className="size-5" />
            {formatPhone(order.phone)}
          </a>
          <CopyButton text={order.phone} label="Копировать номер" doneLabel="Номер скопирован" />
        </div>
      </div>
    </div>
  );
}

const ACCESS_LABEL = { entrance: "Подъезд", intercom: "Домофон", floor: "Этаж", elevator: "Лифт", parking: "Парковка" } as const;

export function ClientPanel({ order }: { order: OrderDetail }) {
  const access = (Object.keys(ACCESS_LABEL) as (keyof typeof ACCESS_LABEL)[]).filter((k) => order.access[k]);
  const wish = order.desiredDate ? `${formatDay(order.desiredDate)}${order.desiredTime ? `, ${order.desiredTime}` : ""}` : null;
  return (
    <Panel title="Адрес и пожелания">
      <Facts
        items={[
          { term: "Адрес", value: order.address },
          {
            term: "Подъезд, этаж, доступ",
            value: access.length ? (
              <ul className="grid gap-0.5">
                {access.map((k) => (
                  <li key={k}>
                    <span className="text-muted">{ACCESS_LABEL[k]}:</span> {order.access[k]}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted">Не указано</span>
            ),
          },
          {
            term: "Желаемое время",
            value: wish ? (
              <>
                {wish} <span className="text-[0.875rem] text-muted">— пожелание, время согласуете вы</span>
              </>
            ) : (
              <span className="text-muted">Не указано</span>
            ),
          },
          { term: "Материалы", value: MATERIALS_LABEL[order.materials] },
          {
            term: "Условия выезда",
            value:
              order.urgent || order.outOfTown ? (
                <span className="flex flex-wrap gap-1.5">
                  {order.urgent && <Tag tone="warn">Срочный выезд</Tag>}
                  {order.outOfTown && <Tag tone="warn">За городом</Tag>}
                </span>
              ) : (
                <span className="text-muted">Обычные</span>
              ),
          },
          { term: "Комментарий клиента", value: order.comment ? <span className="whitespace-pre-wrap">{order.comment}</span> : <span className="text-muted">Нет</span> },
        ]}
      />
    </Panel>
  );
}

const SOURCE_LABEL = (source: string) => (source === "comment" ? "в комментарии клиента" : "в описании работы");

export function ExcludedWarning({ order, items }: { order: OrderDetail; items: ExcludedItem[] }) {
  if (!order.excludedMatches.length) return null;
  return (
    <Panel tone="warn" title="Клиент упомянул то, что вы не берёте" description="Проверьте заявку и предупредите клиента при звонке.">
      <ul className="grid gap-3">
        {order.excludedMatches.map((m, i) => {
          const hint = items.find((x) => x.title === m.title)?.hint;
          return (
            <li key={`${m.title}-${m.source}-${i}`}>
              <p className="flex items-start gap-2 font-medium">
                <Icon name="alert" className="mt-0.5 size-5 text-danger" />
                <span>{m.title}</span>
              </p>
              <p className="pl-7 text-[0.9375rem] text-muted">
                Слово «{m.keyword}» {SOURCE_LABEL(m.source)}. {hint}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function PhotosPanel({ order }: { order: OrderDetail }) {
  const n = order.photos.length;
  return (
    <Panel title={`Фото${n ? `: ${n}` : ""}`} description={n ? "Нажмите, чтобы открыть в полном размере в новой вкладке." : undefined}>
      {n === 0 ? (
        <p className="text-muted">Клиент не приложил фото.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3">
          {order.photos.map((p, i) => (
            <li key={p.id}>
              <a
                href={`/api/admin/photos/${p.id}`}
                target="_blank"
                rel="noopener"
                aria-label={`Открыть фото ${i + 1} из ${n} в полном размере`}
                className="block overflow-hidden rounded-field border border-line bg-bg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- закрытый адрес с cookie владельца: оптимизатор картинок тут не нужен */}
                <img src={`/api/admin/photos/${p.id}`} alt={`Фото ${i + 1} из ${n}`} width={p.width} height={p.height} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function lineMeta(l: SnapshotLine): string {
  if (l.unitPrice === null) return "Стоимость — по фото";
  const base = `${formatQty(l.qty)} ${UNIT_LABEL[l.unit]} × ${formatRub(l.unitPrice)}`;
  return l.minutes > 0 ? `${base}, ${formatMinutes(l.minutes)}` : base;
}

function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5", strong && "border-t border-line pt-3 text-[1.0625rem] font-semibold")}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

/** Состав и предварительный расчёт — ровно как сохранены при отправке; текущий прайс здесь не используется. */
export function CompositionPanel({ order }: { order: OrderDetail }) {
  const s = order.snapshot;
  const priced = s.lines.some((l) => l.total !== null);
  const st = s.settings;
  return (
    <Panel
      title="Состав и расчёт"
      description={`Зафиксирован при отправке заявки (${formatDateTime(s.computedAt)}) по тогдашнему прайсу. Новые цены на него не влияют.`}
    >
      <ul className="divide-y divide-line border-y border-line">
        {s.lines.map((l) => (
          <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{l.title}</p>
              <p className="text-[0.875rem] text-muted tabular-nums">{lineMeta(l)}</p>
              {(l.complex || l.dismantle) && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {l.complex && <Tag tone="ply">Сложные условия +{st.complexPct}%</Tag>}
                  {l.dismantle && <Tag tone="ply">Демонтаж старого +{st.dismantlePct}%</Tag>}
                </p>
              )}
              {l.description && <p className="mt-2 whitespace-pre-wrap rounded-field bg-bg px-3 py-2 text-[0.9375rem]">{l.description}</p>}
            </div>
            <p className="text-right font-medium tabular-nums">{l.total === null ? "по фото" : formatRub(l.total)}</p>
          </li>
        ))}
      </ul>

      <dl className="mt-4">
        {priced && <Row label="Работы по прайсу" value={formatRub(s.subtotal)} />}
        {s.topUp > 0 && (
          <Row
            label={`Доплата до минимального заказа (${formatRub(st.minOrder)})${s.minimumIsPreliminary ? ", предварительно" : ""}`}
            value={formatRub(s.topUp)}
          />
        )}
        {s.flags.urgent && <Row label={`Срочный выезд, +${st.urgentPct}%`} value={formatRub(s.urgent)} />}
        {priced && <Row label="Работы, округлено до 10 ₽" value={formatRub(s.worksTotal)} />}
        {s.flags.outOfTown && <Row label="Выезд за город" value={formatRub(s.outOfTown)} />}
        <Row
          strong
          label={s.hasManual ? "Известно сейчас" : "Итого по расчёту"}
          value={s.knownTotal === null ? "по фото" : s.hasManual ? `${formatRub(s.knownTotal)} + по фото` : formatRub(s.knownTotal)}
        />
        <Row label="Ориентировочное время" value={`${formatMinutes(s.minutes)}${s.hasManual ? " + время по фото" : ""}`} />
      </dl>
      <p className="mt-3 text-[0.8125rem] text-muted">
        Материалы и запчасти в расчёт не входят. Прайс на тот момент: час {formatRub(st.hourRate)}, минимум {formatRub(st.minOrder)}, сложные условия +{st.complexPct}%,
        демонтаж +{st.dismantlePct}%, срочный выезд +{st.urgentPct}%, выезд за город {formatRub(st.outOfTownFee)}.
      </p>
    </Panel>
  );
}

export function TripMemoPanel({ order }: { order: OrderDetail }) {
  const memo = buildTripMemo(order.snapshot, order.materials);
  return (
    <Panel title="Памятка для выезда" description="Что взять и о чём помнить. Собрана из памяток работ, как они были при отправке заявки.">
      <p className="rounded-field bg-bg px-3.5 py-3 text-[0.9375rem]">
        <span className="font-medium">Материалы.</span> {memo.materials}
      </p>
      {memo.groups.length > 0 && (
        <ul className="mt-4 grid gap-4">
          {memo.groups.map((g) => (
            <li key={g.memo}>
              <p className="font-medium">{g.titles.join("; ")}</p>
              <p className="mt-0.5 text-[0.9375rem] text-muted">{g.memo}</p>
            </li>
          ))}
        </ul>
      )}
      {memo.missing.length > 0 && (
        <p className="mt-4 text-[0.9375rem] text-muted">
          Памятка не заполнена: {memo.missing.join("; ")}. Добавьте её в{" "}
          <Link href="/admin/tariffs" className="text-ink underline underline-offset-2">
            тарифах
          </Link>{" "}
          — она появится в новых заявках.
        </p>
      )}
      {memo.reminders.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-[0.9375rem]">
          {memo.reminders.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function BonusPanel({ order }: { order: OrderDetail }) {
  const b = order.bonus;
  if (!b) return null;
  const status = { issued: "выдан", redeemed: "погашен", void: "аннулирован" }[b.status];
  return (
    <Panel title="Бонусный код клиента" description="Клиент получил его за игру. Применяется к следующему заказу вручную.">
      <p className="text-[1.25rem] font-semibold tracking-wide tabular-nums">{b.code}</p>
      <p className="mt-1 text-[0.9375rem] text-muted">
        Скидка {formatRub(b.amount)} при заказе от {formatRub(b.minOrder)}, действует до {formatDateTime(b.expiresAt)}. Статус: {status}.
      </p>
      <Link href="/admin/game" className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] text-ink underline underline-offset-2">
        Отметить погашенным в разделе «Игра»
      </Link>
    </Panel>
  );
}

export function HistoryPanel({ order }: { order: OrderDetail }) {
  return (
    <Panel title="История">
      <ol className="divide-y divide-line">
        {order.events.map((e) => (
          <li key={e.id} className="grid gap-x-4 py-2.5 min-[640px]:grid-cols-[11rem_minmax(0,1fr)]">
            <time dateTime={e.at.toISOString()} className="text-[0.875rem] text-muted tabular-nums">
              {formatDateTimeLong(e.at)}
            </time>
            <p>{describeEvent(e.kind, e.data)}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
