import type { Metadata } from "next";
import { Suspense } from "react";
import { Checkout } from "@/components/checkout/Checkout";
import { getShopData } from "@/lib/shop-data";

export const metadata: Metadata = {
  title: "Оформление заявки",
  robots: { index: false, follow: false },
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <main id="main">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** `?client=organization` — ссылка со страницы «Для офисов»: в форме сразу выбрана организация. В адресе нет ничего личного. */
async function CheckoutData({ searchParams }: Pick<PageProps<"/checkout">, "searchParams">) {
  const [sp, { services, settings }] = await Promise.all([searchParams, getShopData()]);
  const { excluded, orgsEnabled, invoiceEnabled, orgNote } = settings.company;
  return (
    <Checkout
      services={services}
      pricing={settings.pricing}
      excluded={excluded}
      orgs={{ enabled: orgsEnabled, invoice: invoiceEnabled, note: orgNote.trim(), preselect: first(sp.client) === "organization" }}
    />
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8" aria-busy="true">
      <h1 className="text-[1.75rem] font-semibold">Оформление заявки</h1>
      <p className="mt-3 text-muted">Загружаем форму…</p>
    </div>
  );
}
