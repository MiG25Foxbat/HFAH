import type { Metadata } from "next";
import { Suspense } from "react";
import { contactLinks } from "@/components/site/contact-links";
import { Def, DefList, DocPage } from "@/components/info/parts";
import { ButtonLink } from "@/components/ui/controls";
import { getShopData } from "@/lib/shop-data";

export const metadata: Metadata = {
  title: "Контакты",
  description: "Как связаться с мастером на час: телефон, мессенджеры и почта компании, город и территория выезда.",
  alternates: { canonical: "/contacts" },
};

export default function ContactsPage() {
  return (
    <DocPage title="Контакты">
      <Suspense fallback={<p aria-busy="true" className="mt-6 text-muted">Загружаем контакты…</p>}>
        <Contacts />
      </Suspense>
    </DocPage>
  );
}

async function Contacts() {
  const { settings } = await getShopData();
  const { name, city, territory, contacts } = settings.company;
  const links = contactLinks(contacts);

  return (
    <>
      <div className="mt-6">
        <DefList>
          <Def label="Компания">{name}</Def>
          {city && <Def label="Город">{city}</Def>}
          {territory && <Def label="Где работаем">{territory}</Def>}
        </DefList>
      </div>

      {links.length > 0 ? (
        <>
          <h2 className="mt-10 text-[1.375rem] font-semibold">Как связаться</h2>
          <ul className="mt-3 grid gap-3 min-[640px]:grid-cols-2">
            {links.map((c) => (
              <li key={c.kind}>
                <a
                  href={c.href}
                  className="flex min-h-16 flex-col justify-center rounded-panel border border-line bg-surface px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="text-[0.8125rem] text-muted">{c.label}</span>
                  <span className="break-all text-[1.125rem] font-medium tabular-nums">{c.text}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-[62ch] leading-relaxed text-muted">
            Можно не звонить: выберите работы на сайте, цена посчитается сразу, а мастер перезвонит по номеру из заявки.
          </p>
          <ButtonLink href="/" variant="secondary" className="mt-4 w-fit">
            Оставить заявку
          </ButtonLink>
        </>
      ) : (
        <section aria-labelledby="no-contacts" className="mt-10 rounded-panel border border-ply bg-surface-2 p-5">
          <h2 id="no-contacts" className="text-[1.125rem] font-semibold">
            Контакты компании ещё не указаны владельцем
          </h2>
          <p className="mt-2 max-w-[56ch] leading-relaxed text-muted">
            Позвонить или написать отсюда пока нельзя. Оставьте заявку: выберите работу и укажите свой телефон, мастер свяжется с вами сам.
          </p>
          <ButtonLink href="/" className="mt-4 w-fit">
            Оставить заявку
          </ButtonLink>
        </section>
      )}
    </>
  );
}
