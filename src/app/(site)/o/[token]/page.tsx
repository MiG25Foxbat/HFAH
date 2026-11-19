import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderLive } from "@/components/order/OrderLive";
import { getPublicOrder } from "@/lib/server/orders";

// Приватная страница: не индексируется (заголовки no-store и Referrer-Policy — в next.config.ts)
export const metadata: Metadata = {
  title: "Ваша заявка",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function OrderPage({ params }: PageProps<"/o/[token]">) {
  return (
    <main id="main">
      <Suspense fallback={<OrderSkeleton />}>
        <OrderData params={params} />
      </Suspense>
    </main>
  );
}

async function OrderData({ params }: Pick<PageProps<"/o/[token]">, "params">) {
  const { token } = await params;
  const order = await getPublicOrder(token);
  // Неизвестный токен и токен неверного вида неотличимы: страница ничего не раскрывает.
  // Ответ уже идёт потоком (оболочка страницы статическая), поэтому статус остаётся 200; `noindex` и `no-store` Next ставит сам.
  if (!order) notFound();
  return <OrderLive token={token} initial={order} />;
}

function OrderSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-6" aria-busy="true">
      <h1 className="text-[1.75rem] font-semibold">Заявка</h1>
      <p className="mt-3 text-muted">Загружаем заявку…</p>
    </div>
  );
}
