import Link from "next/link";
import { Suspense } from "react";
import { OrderFilters } from "@/components/admin/OrderFilters";
import { OrderRow } from "@/components/admin/OrderRow";
import { RefreshControl } from "@/components/admin/RefreshControl";
import { PageHeader, button } from "@/components/admin/ui";
import { formatClock } from "@/lib/admin/format";
import { PAGE_SIZE, ordersHref, parseOrderQuery } from "@/lib/admin/filters";
import { ensureOwner } from "@/lib/server/admin/guard";
import { countNewOrders, listOrders } from "@/lib/server/admin/orders";

export const metadata = { title: "Заявки" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await ensureOwner();
  const raw = await searchParams;
  const query = parseOrderQuery(raw);
  const [{ rows, counts, hasMore, generatedAt }, newTotal] = await Promise.all([listOrders(query), countNewOrders()]);
  const filtered = query.q !== "" || query.status !== "all" || query.period !== "all";
  const deleted = raw.deleted === "1";

  return (
    <>
      <PageHeader
        title="Заявки"
        lead="Новые сверху. Список обновляется сам раз в минуту, пока вкладка открыта."
        leadClass="hidden min-[640px]:block"
        actions={<RefreshControl newCount={newTotal} updatedAt={formatClock(generatedAt)} />}
      />
      {deleted && (
        <p role="status" className="mb-5 rounded-field border border-line bg-surface px-4 py-3 text-[0.9375rem]">
          Заявка удалена вместе с фото.
        </p>
      )}
      <OrderFilters query={query} counts={counts} />

      {rows.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line px-6 py-10">
          <p className="text-[1.0625rem] font-medium">{filtered ? "Ничего не найдено" : "Заявок пока нет"}</p>
          <p className="mt-1 max-w-prose text-muted">
            {filtered
              ? "Измените поиск или фильтры — заявки есть, но под эти условия не подходят."
              : "Когда клиент отправит первую заявку, она появится здесь."}
          </p>
          {filtered && (
            <Link href="/admin" className={button("secondary", "md", "mt-4")}>
              Сбросить фильтры
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="grid gap-3">
            {rows.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
          <p className="mt-4 text-[0.875rem] text-muted">Показано заявок: {rows.length}{hasMore ? ", есть ещё" : ""}.</p>
          {hasMore && (
            <Link href={ordersHref({ ...query, limit: query.limit + PAGE_SIZE })} scroll={false} className={button("secondary", "md", "mt-3")}>
              Показать ещё
            </Link>
          )}
        </>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загружаем заявки">
      <div className="mb-6 h-9 w-40 animate-pulse rounded-field bg-surface-2" />
      <div className="mb-5 h-12 animate-pulse rounded-field bg-surface-2" />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-panel bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
