"use client";
import { useState } from "react";
import type { Service } from "@/lib/catalog";
import type { PricingSettings } from "@/lib/pricing";
import type { ShopGroup } from "@/lib/shop-data";
import type { ExcludedItem } from "@/lib/settings";
import { AddSheet } from "./AddSheet";
import { CartBar, ServiceRow } from "./ServiceRow";

/**
 * Работы для офисов по категориям: те же строки, лист настройки и корзина, что на главной (цены считает тот же движок).
 * `services` — весь активный прайс: в корзине могут лежать и работы вне офисного списка, итог считается по всем.
 * Панель корзины ведёт к оформлению сразу с выбранной «Организацией».
 */
export function OfficeWorks({ groups, services, pricing, excluded }: { groups: ShopGroup[]; services: Service[]; pricing: PricingSettings; excluded: ExcludedItem[] }) {
  const [adding, setAdding] = useState<Service | null>(null);
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} id={`c-${g.id}`} aria-labelledby={`h-${g.id}`}>
          <h2 id={`h-${g.id}`} className="flex items-center gap-3 text-[1.625rem] font-semibold">
            <span aria-hidden="true" className="size-3 rounded-full" style={{ background: g.color }} />
            {g.title}
          </h2>
          <ul className="mt-1 divide-y divide-line">
            {g.services.map((s) => (
              <ServiceRow key={s.id} s={s} pricing={pricing} onAdd={() => setAdding(s)} />
            ))}
          </ul>
        </section>
      ))}
      <CartBar services={services} pricing={pricing} checkoutHref="/checkout?client=organization" />
      <AddSheet service={adding} pricing={pricing} excluded={excluded} onClose={() => setAdding(null)} />
    </>
  );
}
