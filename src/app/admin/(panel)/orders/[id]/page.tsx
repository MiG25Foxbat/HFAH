import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DealForm, DeleteOrder, NoteForm } from "@/components/admin/OrderActions";
import {
  BonusPanel,
  ClientPanel,
  CompositionPanel,
  ExcludedWarning,
  HistoryPanel,
  OrderHeader,
  PhotosPanel,
  TripMemoPanel,
} from "@/components/admin/OrderPanels";
import { formatDay, toInputs } from "@/lib/admin/format";
import { ensureOwner } from "@/lib/server/admin/guard";
import { getOrderDetail } from "@/lib/server/admin/orders";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Заявка" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Order params={params} />
    </Suspense>
  );
}

async function Order({ params }: { params: Promise<{ id: string }> }) {
  await ensureOwner();
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();
  const excluded = order.excludedMatches.length ? (await getSettings()).company.excluded : [];
  const agreed = toInputs(order.agreedAt);
  const wish = order.desiredDate ? `${formatDay(order.desiredDate)}${order.desiredTime ? `, ${order.desiredTime}` : ""}` : null;

  return (
    <>
      <OrderHeader order={order} />
      {order.excludedMatches.length > 0 && (
        <div className="mb-6">
          <ExcludedWarning order={order} items={excluded} />
        </div>
      )}
      <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_21rem]">
        {/* на телефоне решение идёт сразу после шапки, на широком экране — колонкой справа */}
        <div className="grid gap-6 min-[1000px]:order-2">
          <DealForm
            orderId={order.id}
            initial={{
              status: order.status,
              finalPrice: order.finalPrice === null ? "" : String(order.finalPrice),
              agreedDate: agreed.date,
              agreedTime: agreed.time,
            }}
            knownTotal={order.snapshot.knownTotal}
            hasManual={order.snapshot.hasManual}
            wish={wish}
          />
          <NoteForm orderId={order.id} initial={order.ownerNote} />
          <BonusPanel order={order} />
        </div>
        <div className="grid gap-6 min-[1000px]:order-1">
          <ClientPanel order={order} />
          <CompositionPanel order={order} />
          <PhotosPanel order={order} />
          <TripMemoPanel order={order} />
          <HistoryPanel order={order} />
        </div>
      </div>
      <div className="mt-8 max-w-xs">
        <DeleteOrder orderId={order.id} number={order.number} photoCount={order.photos.length} hasBonus={order.bonus !== null} />
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загружаем заявку">
      <div className="mb-6 h-24 animate-pulse rounded-panel bg-surface-2" />
      <div className="grid gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="h-72 animate-pulse rounded-panel bg-surface-2 min-[1000px]:order-2" />
        <div className="h-96 animate-pulse rounded-panel bg-surface-2" />
      </div>
    </div>
  );
}
