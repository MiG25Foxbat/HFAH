import type { Metadata } from "next";
import { Suspense } from "react";
import { Checkout } from "@/components/checkout/Checkout";
import { getShopData } from "@/lib/shop-data";

export const metadata: Metadata = {
  title: "Оформление заявки",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <main id="main">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutData />
      </Suspense>
    </main>
  );
}

async function CheckoutData() {
  const { services, settings } = await getShopData();
  return <Checkout services={services} pricing={settings.pricing} excluded={settings.company.excluded} />;
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8" aria-busy="true">
      <h1 className="text-[1.75rem] font-semibold">Оформление заявки</h1>
      <p className="mt-3 text-muted">Загружаем форму…</p>
    </div>
  );
}
