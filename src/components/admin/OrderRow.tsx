import Link from "next/link";
import { formatDateTime } from "@/lib/admin/format";
import { formatRub } from "@/lib/pricing";
import type { OrderListRow } from "@/lib/server/admin/orders";
import { StatusBadge, Tag, cx } from "./ui";

/** Цена в списке: итог владельца, если задан; иначе известная часть расчёта. «Известно» — не итог, если есть работы по фото. */
function priceText(o: OrderListRow): { main: string; note?: string } {
  if (o.finalPrice !== null) return { main: formatRub(o.finalPrice), note: "итоговая цена" };
  if (o.hasManual) return o.knownTotal !== null ? { main: `известно: ${formatRub(o.knownTotal)} + по фото` } : { main: "по фото" };
  return o.knownTotal !== null ? { main: formatRub(o.knownTotal), note: "по расчёту" } : { main: "—" };
}

/** Строка списка заявок. Новые — с акцентной полосой слева. Вся строка — ссылка на карточку. */
export function OrderRow({ order: o }: { order: OrderListRow }) {
  const price = priceText(o);
  return (
    <li className="[contain-intrinsic-size:auto_112px] [content-visibility:auto]">
      <Link
        href={`/admin/orders/${o.id}`}
        className={cx(
          "grid gap-x-4 gap-y-1 rounded-panel border border-line bg-surface p-4 transition-colors hover:bg-surface-2",
          "[grid-template-areas:'num_status'_'body_body'_'price_price'] min-[900px]:grid-cols-[6.5rem_minmax(0,1fr)_16rem] min-[900px]:[grid-template-areas:'num_body_status'_'num_body_price']",
          o.status === "new" && "border-l-[6px] border-l-accent",
        )}
      >
        <div className="[grid-area:num]">
          <p className="text-[1.25rem] font-semibold leading-tight tabular-nums">№&nbsp;{o.number}</p>
          <p className="text-[0.8125rem] text-muted">{formatDateTime(o.createdAt)}</p>
        </div>
        <div className="min-w-0 [grid-area:body]">
          <p className={cx("truncate", o.status === "new" ? "font-semibold" : "font-medium")}>{o.customerName}</p>
          <p className="truncate text-[0.9375rem] text-muted">{o.address}</p>
          {(o.urgent || o.outOfTown || o.excludedCount > 0 || o.photoCount > 0) && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {o.urgent && <Tag tone="warn">Срочно</Tag>}
              {o.outOfTown && <Tag tone="warn">За городом</Tag>}
              {o.excludedCount > 0 && <Tag tone="warn">Есть то, что не берём</Tag>}
              {o.photoCount > 0 && <Tag>Фото: {o.photoCount}</Tag>}
            </p>
          )}
        </div>
        <div className="justify-self-end [grid-area:status]">
          <StatusBadge status={o.status} />
        </div>
        <div className="[grid-area:price] min-[900px]:text-right">
          <p className="font-medium tabular-nums">{price.main}</p>
          {price.note && <p className="text-[0.8125rem] text-muted">{price.note}</p>}
          {o.agreedAt && <p className="text-[0.8125rem] text-muted">Выезд: {formatDateTime(o.agreedAt)}</p>}
        </div>
      </Link>
    </li>
  );
}
