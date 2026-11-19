import { Suspense } from "react";
import { CategoriesPanel } from "@/components/admin/Categories";
import { PageHeader, Panel, Tag } from "@/components/admin/ui";
import { AddService, PricingForm, ServiceRow } from "@/components/admin/Tariffs";
import { MAX_CATEGORIES } from "@/lib/admin/catalog-forms";
import { ensureOwner } from "@/lib/server/admin/guard";
import { listCategories } from "@/lib/server/categories";
import { listServices } from "@/lib/server/services";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Тарифы" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

export default function TariffsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-panel bg-surface-2" />}>
      <Tariffs />
    </Suspense>
  );
}

const FORMULA = [
  "Работа: цена за единицу × количество, плюс проценты за сложные условия и за демонтаж старого (они складываются). Округление до рубля.",
  "Суммы всех работ с ценой складываются. Работы «по фото» сюда не входят и никогда не считаются бесплатными.",
  "Если сумма меньше минимального заказа, добавляется доплата до минимума. Это касается только работ.",
  "Срочный выезд — процент от суммы работ вместе с доплатой до минимума. Итог за работы округляется вверх до 10 ₽.",
  "Выезд за город добавляется отдельно: фиксированная сумма без процентов и минимума.",
];

async function Tariffs() {
  await ensureOwner();
  const [categories, services, settings] = await Promise.all([listCategories(), listServices(), getSettings()]);
  const worksOf = (id: string) => services.filter((s) => s.category === id);
  const categoryOptions = categories.map(({ id, title, active }) => ({ id, title, active }));

  return (
    <>
      <PageHeader
        title="Тарифы"
        lead="Категории и работы: добавляйте, переименовывайте, скрывайте, меняйте порядок и цены. Изменения действуют только для новых заявок: старые хранят состав и цены на момент отправки."
      />
      <div className="grid gap-6">
        <Panel title="Как считается цена" description="Один порядок для всех заявок. Материалы и запчасти в расчёт не входят — клиенту это сказано прямо.">
          <ol className="list-decimal space-y-1.5 pl-5 text-[0.9375rem]">
            {FORMULA.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Panel>

        <PricingForm initial={settings.pricing} />

        <CategoriesPanel categories={categories.map((c) => ({ ...c, works: worksOf(c.id).length }))} max={MAX_CATEGORIES} />

        <nav aria-label="Категории работ">
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c.id}>
                <a href={`#cat-${c.id}`} className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[0.9375rem] hover:bg-surface-2">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: c.color }} />
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {categories.map((c) => {
          const items = worksOf(c.id);
          return (
            <Panel
              key={c.id}
              id={`cat-${c.id}`}
              className="scroll-mt-24"
              title={
                <span className="flex items-center gap-3">
                  <span aria-hidden className="size-3 rounded-full" style={{ background: c.color }} />
                  {c.title}
                  <span className="text-[0.9375rem] font-normal text-muted">работ: {items.length}</span>
                  {!c.active && <Tag tone="warn">Скрыта от клиентов</Tag>}
                </span>
              }
            >
              {items.length === 0 && <p className="mb-1 text-muted">В категории пока нет работ.</p>}
              <ul className="-my-4 divide-y divide-line">
                {items.map((s, i) => (
                  <ServiceRow key={s.id} service={s} hourRate={settings.pricing.hourRate} categories={categoryOptions} index={i} count={items.length} />
                ))}
              </ul>
              <AddService categoryId={c.id} categoryTitle={c.title} />
            </Panel>
          );
        })}
      </div>
    </>
  );
}
