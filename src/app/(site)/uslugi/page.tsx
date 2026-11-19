import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { h1Class, leadClass, linkClass } from "@/components/info/parts";
import { ButtonLink, buttonClass } from "@/components/ui/controls";
import { UNIT_LABEL, type Service } from "@/lib/catalog";
import { formatMinutes, formatRub, type PricingSettings } from "@/lib/pricing";
import { getShopData, type ShopGroup } from "@/lib/shop-data";

export const metadata: Metadata = {
  title: "Услуги и цены",
  description:
    "Все работы мастера на час с ценой за единицу: сборка мебели, сантехника, электрика, мелкий ремонт. Цена только за работу, материалы и запчасти оплачиваются отдельно.",
  alternates: { canonical: "/uslugi" },
};

const NBSP = String.fromCharCode(160); // неразрывный пробел
const pct = (n: number) => (n > 0 ? `+${n}${NBSP}%` : "без доплаты");

export default function ServicesPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-6 min-[900px]:pt-10">
      <h1 className={h1Class}>Услуги и цены</h1>
      <p className={leadClass}>
        Цена указана за работу. <strong className="font-medium text-ink">Материалы и запчасти в неё не входят.</strong> Выберите работу, и она попадёт в корзину: сумма пересчитается
        с учётом количества и условий. Окончательную цену и время мастер согласует с вами после разговора. <a href="#price-factors" className={linkClass}>Что влияет на цену</a>.
      </p>
      <Suspense fallback={<p aria-busy="true" className="mt-8 text-muted">Загружаем прайс…</p>}>
        <Catalog />
      </Suspense>
    </main>
  );
}

/** Прайс читается из БД на сервере и приходит в HTML: названия, описания, цены, нормы времени. */
async function Catalog() {
  const { groups, settings } = await getShopData();
  const { pricing, company } = settings;
  const filled = groups.filter((g) => g.services.length > 0);

  if (!filled.length) {
    return (
      <div className="mt-8 grid max-w-prose justify-items-start gap-4">
        <p className="text-muted">Прайс пока пуст. Опишите задачу в заявке, и мастер оценит её по фото.</p>
        <ButtonLink href="/?c=other">Оставить заявку</ButtonLink>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_15rem] min-[900px]:items-start min-[900px]:gap-12">
      <aside className="min-[900px]:sticky min-[900px]:top-[calc(var(--header-h)+1.5rem)] min-[900px]:col-start-2 min-[900px]:row-start-1">
        <nav aria-label="Категории работ">
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 min-[900px]:mx-0 min-[900px]:flex-col min-[900px]:gap-1 min-[900px]:overflow-visible min-[900px]:px-0">
            {filled.map((g) => (
              <li key={g.id} className="shrink-0">
                <a
                  href={`#${g.id}`}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 font-medium transition-colors hover:bg-surface-2 min-[900px]:w-full min-[900px]:rounded-field"
                >
                  <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: `var(--cat-${g.id})` }} />
                  {g.title}
                  <span className="ml-auto pl-2 text-[0.875rem] font-normal text-muted tabular-nums max-[899px]:hidden">{g.services.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="grid min-w-0 max-w-[860px] gap-12 min-[900px]:col-start-1 min-[900px]:row-start-1">
        {filled.map((g) => (
          <CategorySection key={g.id} group={g} pricing={pricing} />
        ))}

        <section id="price-factors" aria-labelledby="price-factors-h">
          <h2 id="price-factors-h" className="text-[1.625rem] font-semibold">
            От чего зависит цена
          </h2>
          <p className="mt-3 max-w-[62ch] leading-relaxed">
            <strong className="font-semibold">Материалы и запчасти не входят в цену.</strong> Смеситель, розетку, замок или крепёж покупает клиент, либо мастер по чеку: это выбирается в заявке.
          </p>
          <dl className="mt-4 divide-y divide-line border-y border-line">
            <Factor name="Количество">
              Цена указана за одну единицу: штуку, погонный метр, квадратный метр или час. В заявке она умножается на количество. Метры и часы считаются с шагом 0,5.
            </Factor>
            <Factor name="Сложные условия" value={pct(pricing.complexPct)}>
              Работа на высоте, в тесном или труднодоступном месте, со старой проводкой или трубами. Доплата — процент от цены работы.
            </Factor>
            <Factor name="Демонтаж старого" value={pct(pricing.dismantlePct)}>
              У работ на замену можно отметить снятие старого: смесителя, розетки, замка. Если отмечены и сложные условия, и демонтаж, проценты складываются.
            </Factor>
            <Factor name="Срочный выезд" value={pct(pricing.urgentPct)}>
              Мастер приезжает сегодня или в ближайшие часы. Процент считается от суммы всех работ в заявке.
            </Factor>
            <Factor name="Минимальный заказ" value={pricing.minOrder > 0 ? formatRub(pricing.minOrder) : "нет"}>
              {pricing.minOrder > 0
                ? "Если работ набралось на меньшую сумму, заявка считается по минимальной. Выезд за город в минимум не входит. Если в заявке есть работы «По фото», минимум уточняется после оценки."
                : "Заявка считается по сумме работ."}
            </Factor>
            <Factor name="Выезд за город" value={pricing.outOfTownFee > 0 ? `+${formatRub(pricing.outOfTownFee)}` : "без доплаты"}>
              Фиксированная доплата, добавляется отдельной строкой.
            </Factor>
            <Factor name="«По фото»">
              У нестандартных задач цены в списке нет. Опишите задачу и приложите фото в категории «Другое»: мастер оценит её и позвонит. Пока оценки нет, цена не считается нулевой.
            </Factor>
          </dl>
          <p className="mt-4 max-w-[62ch] leading-relaxed text-muted">
            Порядок расчёта: сначала считается каждая работа с её доплатами, затем сумма доводится до минимального заказа и прибавляется срочный выезд. Итог за работы округляется вверх до
            10{NBSP}₽, и только после этого добавляется выезд за город. Время выезда складывается из норм времени работ.
          </p>
        </section>

        {company.excluded.length > 0 && (
          <section id="excluded" aria-labelledby="excluded-h">
            <h2 id="excluded-h" className="text-[1.625rem] font-semibold">
              Чего мы не делаем
            </h2>
            <ul className="mt-3 grid max-w-[62ch] gap-3 leading-snug">
              {company.excluded.map((e) => (
                <li key={e.title}>
                  <span className="font-medium">{e.title}.</span> <span className="text-muted">{e.hint}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-panel border border-line bg-surface p-5">
          <p className="max-w-[40ch] leading-snug">
            Нужной работы нет в списке? Опишите её в категории «Другое» и приложите фото.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/">Выбрать работы</ButtonLink>
            <ButtonLink href="/?c=other" variant="secondary">
              Описать задачу
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function Factor({ name, value, children }: { name: string; value?: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 py-4 min-[640px]:grid-cols-[13.5rem_1fr]">
      <dt className="font-medium">
        {name}
        {value && <span className="block tabular-nums text-accent">{value}</span>}
      </dt>
      <dd className="leading-snug text-muted">{children}</dd>
    </div>
  );
}

function CategorySection({ group, pricing }: { group: ShopGroup; pricing: PricingSettings }) {
  return (
    <section id={group.id} aria-labelledby={`h-${group.id}`}>
      <h2 id={`h-${group.id}`} className="flex items-center gap-3 text-[1.625rem] font-semibold">
        <span aria-hidden="true" className="size-3 rounded-full" style={{ background: `var(--cat-${group.id})` }} />
        {group.title}
      </h2>
      <ul className="mt-1 divide-y divide-line">
        {group.services.map((s) => (
          <ServiceRow key={s.id} s={s} pricing={pricing} />
        ))}
      </ul>
    </section>
  );
}

function ServiceRow({ s, pricing }: { s: Service; pricing: PricingSettings }) {
  const price =
    s.pricing === "manual" ? "По фото" : `${formatRub(s.pricing === "hourly" ? pricing.hourRate : (s.price as number))} за ${UNIT_LABEL[s.unit]}`;
  const time = s.pricing === "fixed" && s.unit !== "hour" && s.minutes > 0 ? `${formatMinutes(s.minutes)} на ${UNIT_LABEL[s.unit]}` : null;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-4">
      <div className="min-w-0">
        <h3 className="font-medium leading-snug">{s.title}</h3>
        {s.description && <p className="mt-0.5 max-w-[60ch] text-[0.9375rem] leading-snug text-muted">{s.description}</p>}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <span className="font-medium tabular-nums">{price}</span>
          {time && <span className="text-[0.8125rem] text-muted tabular-nums">{time}</span>}
          {s.pricing === "manual" && <span className="text-[0.8125rem] text-muted">мастер оценит по фото</span>}
        </p>
      </div>
      <Link
        href={`/?c=${s.category}&add=${s.id}`}
        prefetch={false}
        aria-label={`Выбрать: ${s.title}`}
        className={buttonClass("secondary", "min-w-28")}
      >
        Выбрать
      </Link>
    </li>
  );
}
