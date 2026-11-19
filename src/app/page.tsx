import { Suspense } from "react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { UNIT_LABEL } from "@/lib/catalog";
import { formatMinutes, formatRub } from "@/lib/pricing";
import { getCatalog } from "@/lib/server/services";
import { getSettings } from "@/lib/server/settings";

/** Временная главная: каталог из БД с ценами. Настоящий интерфейс (сцена, корзина) строится поверх. */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <span className="font-display text-2xl">ладно</span>
        <ThemeSwitch />
      </header>
      <main>
        <h1 className="font-display text-[clamp(2.25rem,6vw,3rem)] leading-[1.15]">Мастер на час</h1>
        <p className="mt-3 max-w-prose text-muted">Цена — только за работу. Материалы и запчасти оплачиваются отдельно.</p>
        <Suspense fallback={<p className="mt-8 text-muted">Загружаем прайс…</p>}>
          <Catalog />
        </Suspense>
      </main>
    </div>
  );
}

async function Catalog() {
  const [groups, settings] = await Promise.all([getCatalog(), getSettings()]);
  return (
    <div className="mt-8 grid gap-6">
      {groups.map((g) => (
        <section key={g.id} id={g.id} className="rounded-panel border border-line bg-surface p-5">
          <h2 className="flex items-center gap-3 text-[1.625rem] font-semibold">
            <span aria-hidden className="size-3 rounded-full" style={{ background: g.color }} />
            {g.title}
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {g.services.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-4 py-3">
                <span>
                  {s.title}
                  {s.pricing === "fixed" && s.minutes > 0 && (
                    <span className="block text-[0.8125rem] text-muted">{formatMinutes(s.minutes)}</span>
                  )}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {s.pricing === "manual"
                    ? "По фото"
                    : `${formatRub(s.pricing === "hourly" ? settings.pricing.hourRate : (s.price as number))} за ${UNIT_LABEL[s.unit]}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
