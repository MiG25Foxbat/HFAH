import type { ReactNode } from "react";
import type { ShopGroup } from "@/lib/shop-data";

/** Общие куски информационных страниц (/uslugi, /contacts, /privacy, /credits): один ритм отступов и заголовков. */

export const h1Class = "text-[clamp(1.75rem,4.5vw,2.5rem)] font-semibold leading-[1.15]";
export const leadClass = "mt-3 max-w-[62ch] text-[1.0625rem] leading-relaxed text-muted";
export const linkClass = "underline decoration-muted/60 decoration-1 underline-offset-4 hover:decoration-current";

/** Страница-документ: левый край как у шапки и /uslugi, колонка ≤ 760 px (строки ≤ 70 знаков). Для широких страниц (/uslugi) свой <main>. */
export function DocPage({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-6 min-[900px]:pt-10">
      <div className="max-w-[760px]">
        <h1 className={h1Class}>{title}</h1>
        {lead && <div className={leadClass}>{lead}</div>}
        {children}
      </div>
    </main>
  );
}

/** Раздел с заголовком второго уровня; `id` нужен для якорей и aria-labelledby. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-10">
      <h2 id={`${id}-h`} className="text-[1.375rem] font-semibold">
        {title}
      </h2>
      <div className="mt-3 grid max-w-[68ch] gap-3 leading-relaxed">{children}</div>
    </section>
  );
}

/** Список «название — значение»: на телефоне подпись стоит прямо над значением, на широком экране — слева. */
export function DefList({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3.5">{children}</dl>;
}

export function Def({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 min-[640px]:grid-cols-[10rem_1fr] min-[640px]:gap-x-6">
      <dt className="text-[0.9375rem] text-muted min-[640px]:text-base">{label}</dt>
      <dd className="max-w-[56ch] font-medium">{children}</dd>
    </div>
  );
}

/** Строка «название — пояснение» для блоков вроде «От чего зависит цена»; `value` — короткое значение под названием (процент, сумма). */
export function Factor({ name, value, children }: { name: string; value?: string; children: ReactNode }) {
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

/** Навигация по категориям якорями `#c-<id>`: на телефоне ряд пилюль с прокруткой, на широком экране липкий список справа. */
export function CategoryNav({ groups }: { groups: Pick<ShopGroup, "id" | "title" | "color" | "services">[] }) {
  return (
    <nav aria-label="Категории работ">
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 min-[900px]:mx-0 min-[900px]:flex-col min-[900px]:gap-1 min-[900px]:overflow-visible min-[900px]:px-0">
        {groups.map((g) => (
          <li key={g.id} className="shrink-0">
            <a
              href={`#c-${g.id}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 font-medium transition-colors hover:bg-surface-2 min-[900px]:w-full min-[900px]:rounded-field"
            >
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: g.color }} />
              {g.title}
              <span className="ml-auto pl-2 text-[0.875rem] font-normal text-muted tabular-nums max-[899px]:hidden">{g.services.length}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
