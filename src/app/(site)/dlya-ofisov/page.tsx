import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryNav, Factor, h1Class, leadClass } from "@/components/info/parts";
import { OfficeWorks } from "@/components/shop/OfficeWorks";
import { ButtonLink } from "@/components/ui/controls";
import { getShopData } from "@/lib/shop-data";

export const metadata: Metadata = {
  title: "Для офисов",
  description:
    "Мастер на час для офисов и организаций: сборка мебели и кресел, полки и доски, лампы и розетки, замки, жалюзи, подключение техники. Цена за работу видна сразу.",
  alternates: { canonical: "/dlya-ofisov" },
};

export default function OfficesPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-6 min-[900px]:pt-10">
      {/* Раздел можно выключить в кабинете: тогда страница отвечает «не найдено». Заголовок рисуется внутри Suspense, чтобы он не мелькнул до этого. */}
      <Suspense fallback={<p aria-busy="true" className="text-muted">Загружаем страницу…</p>}>
        <Offices />
      </Suspense>
    </main>
  );
}

async function Offices() {
  const { groups, services, settings } = await getShopData();
  const { pricing, company } = settings;
  if (!company.orgsEnabled) notFound();

  const officeGroups = groups.map((g) => ({ ...g, services: g.services.filter((s) => s.office) })).filter((g) => g.services.length > 0);
  const orgNote = company.orgNote.trim();

  return (
    <>
      <h1 className={h1Class}>Для офисов</h1>
      <p className={leadClass}>
        Мастер на час приезжает в офис и делает мелкие работы: собирает мебель и кресла, вешает доски и полки, меняет лампы, ставит розетки, подключает кофемашину и кулер. Цены те же, что в
        общем прайсе. Выберите работы ниже: они попадут в общую корзину.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_15rem] min-[900px]:items-start min-[900px]:gap-12">
        {officeGroups.length > 0 && (
          <aside className="min-[900px]:sticky min-[900px]:top-[calc(var(--header-h)+1.5rem)] min-[900px]:col-start-2 min-[900px]:row-start-1">
            <CategoryNav groups={officeGroups} />
          </aside>
        )}

        <div className="grid min-w-0 max-w-[860px] gap-12 min-[900px]:col-start-1 min-[900px]:row-start-1">
          <section id="how" aria-labelledby="how-h">
            <h2 id="how-h" className="text-[1.625rem] font-semibold">
              Как мы работаем с организациями
            </h2>
            <dl className="mt-3 divide-y divide-line border-y border-line">
              <Factor name="Заявка">
                Выберите работы и оформите заявку: в форме уже выбрано «Организация». Нужны название организации, контактное лицо и телефон, ИНН можно не указывать.
              </Factor>
              <Factor name="Адрес и время">Укажите адрес офиса и желаемую дату. Мастер позвонит контактному лицу, уточнит доступ в здание и согласует время выезда.</Factor>
              <Factor name="Цена">Цена указана за работу, материалы и запчасти оплачиваются отдельно. Итог мастер согласует по телефону.</Factor>
              {company.invoiceEnabled && (
                <Factor name="Счёт и документы">
                  Если нужна оплата по счёту, отметьте в заявке «Нужен счёт и закрывающие документы»: детали оплаты мастер уточнит по телефону.
                </Factor>
              )}
            </dl>
            {orgNote && (
              <div className="mt-4 rounded-field border border-line bg-surface-2 px-4 py-3">
                <p className="text-[0.8125rem] text-muted">Условия компании для организаций</p>
                <p className="mt-1 max-w-[62ch] whitespace-pre-line leading-snug">{orgNote}</p>
              </div>
            )}
          </section>

          {officeGroups.length > 0 ? (
            <OfficeWorks groups={officeGroups} services={services} pricing={pricing} excluded={company.excluded} />
          ) : (
            <p className="max-w-prose text-muted">Список работ для офисов пока не заполнен. Выберите нужные работы в общем прайсе: при оформлении можно указать организацию.</p>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-panel border border-line bg-surface p-5">
            <p className="max-w-[40ch] leading-snug">Нужной работы нет в списке? Опишите её в категории «Другое» и приложите фото.</p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/checkout?client=organization">Оформить заявку</ButtonLink>
              <ButtonLink href="/?c=other" variant="secondary">
                Описать задачу
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
