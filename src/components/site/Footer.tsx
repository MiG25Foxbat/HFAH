import Link from "next/link";
import { Suspense } from "react";
import { getShopData } from "@/lib/shop-data";
import { contactLinks } from "./contact-links";

const LINKS = [
  { href: "/uslugi", label: "Услуги и цены" },
  { href: "/contacts", label: "Контакты" },
  { href: "/privacy", label: "Политика" },
  { href: "/credits", label: "Источники 3D" },
] as const;

export function Footer() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-8 min-[900px]:grid-cols-[1fr_auto]">
        <div className="grid content-start gap-2">
          <p translate="no" className="font-display text-xl leading-none">запросто</p>
          <p className="max-w-prose text-[0.9375rem] leading-snug text-muted">Мастер на час. Цена — только за работу: материалы и запчасти оплачиваются отдельно.</p>
          <Suspense fallback={null}>
            <FooterContacts />
          </Suspense>
        </div>
        <nav aria-label="Разделы сайта">
          <ul className="flex flex-wrap gap-x-2 min-[900px]:flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center rounded-field px-1 text-[0.9375rem] hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

async function FooterContacts() {
  const { settings } = await getShopData();
  const links = contactLinks(settings.company.contacts);
  if (!links.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4">
      {links.map((c) => (
        <li key={c.kind}>
          <a href={c.href} className="inline-flex min-h-11 items-center text-[0.9375rem] underline-offset-4 hover:underline">
            {c.label}: <span className="ml-1 tabular-nums">{c.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
