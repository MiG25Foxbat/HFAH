import type { Metadata } from "next";
import { Suspense } from "react";
import { Storefront } from "@/components/shop/Storefront";
import { CATEGORIES, type CategoryId } from "@/lib/catalog";
import { getShopData } from "@/lib/shop-data";

export const metadata: Metadata = {
  title: { absolute: "Ладно — мастер на час: цены на работы" },
  description: "Сборка мебели, сантехника, электрика, мелкий ремонт. Цена за работу видна сразу, материалы и запчасти оплачиваются отдельно.",
  alternates: { canonical: "/" },
};

const isCategory = (v: unknown): v is CategoryId => CATEGORIES.some((c) => c.id === v);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <main id="main">
      <Suspense fallback={<StorefrontSkeleton />}>
        <Home searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Каталог читается из БД на сервере и приходит в HTML (названия, описания, цены); интерактивность — в Storefront. */
async function Home({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const [sp, { groups, settings }] = await Promise.all([searchParams, getShopData()]);
  const c = first(sp.c);
  return (
    <Storefront
      groups={groups}
      pricing={settings.pricing}
      excluded={settings.company.excluded}
      characters={settings.characters}
      slogan={settings.company.accent}
      initialCategory={isCategory(c) ? c : "furniture"}
      initialAdd={first(sp.add) ?? null}
      initialCart={first(sp.cart) === "1"}
    />
  );
}

/** Каркас до прихода данных: те же размеры, что у настоящей страницы, поэтому ничего не прыгает. */
function StorefrontSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-[1200px] px-4 pb-6 min-[900px]:grid min-[900px]:grid-cols-[5fr_7fr] min-[900px]:gap-10">
      <div className="min-[900px]:h-[calc(100dvh-var(--header-h)-2rem)]">
        <div className="h-[44vh] min-h-[260px] rounded-panel bg-surface-2 min-[900px]:h-full" />
      </div>
      <div className="pt-5 min-[900px]:pt-2">
        <h1 className="font-display text-[clamp(1.625rem,5vw,3rem)] leading-[1.15]">Мастер на час</h1>
        <p className="mt-4 text-muted">Загружаем прайс…</p>
      </div>
    </div>
  );
}
