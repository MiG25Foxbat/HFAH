import Link from "next/link";
import { Suspense } from "react";
import { getShopData } from "@/lib/shop-data";
import { CartButton } from "./CartButton";
import { contactLinks } from "./contact-links";
import { ThemeMenu } from "./ThemeMenu";

const navLink = "inline-flex min-h-12 items-center rounded-full px-3 text-[0.9375rem] font-medium transition-colors hover:bg-surface-2";

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-(--header-h) max-w-[1200px] items-center gap-0.5 px-4 min-[900px]:gap-1">
        <Link href="/" aria-label="Запросто — на главную" translate="no" className="mr-auto inline-flex min-h-12 items-center rounded-full pr-2 font-display text-xl leading-none min-[400px]:text-2xl">
          запросто
        </Link>
        <nav aria-label="Основное меню" className="flex items-center">
          <Link href="/uslugi" className={`${navLink} max-[899px]:hidden`}>
            Услуги и цены
          </Link>
          <Suspense fallback={null}>
            <HeaderOffices />
          </Suspense>
          {/* до 360 px шапке не хватает места: контакты остаются в подвале, а кнопка темы не сжимается */}
          <Link href="/contacts" className={`${navLink} max-[359px]:hidden`}>
            Контакты
          </Link>
        </nav>
        <Suspense fallback={null}>
          <HeaderPhone />
        </Suspense>
        <ThemeMenu />
        <CartButton />
      </div>
    </header>
  );
}

/** «Для офисов» в шапке — только на широком экране и только если владелец включил работу с организациями. */
async function HeaderOffices() {
  const { settings } = await getShopData();
  if (!settings.company.orgsEnabled) return null;
  return (
    <Link href="/dlya-ofisov" className={`${navLink} max-[899px]:hidden`}>
      Для офисов
    </Link>
  );
}

/** Телефон в шапке — только если он указан в настройках компании (пустой контакт не показываем). */
async function HeaderPhone() {
  const { settings } = await getShopData();
  const phone = contactLinks(settings.company.contacts).find((c) => c.kind === "phone");
  if (!phone) return null;
  return (
    <a href={phone.href} className={`${navLink} tabular-nums max-[899px]:hidden`}>
      {phone.text}
    </a>
  );
}
