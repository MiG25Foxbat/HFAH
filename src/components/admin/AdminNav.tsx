"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Заявки", icon: "list" },
  { href: "/admin/tariffs", label: "Тарифы", icon: "tag" },
  { href: "/admin/company", label: "Компания", icon: "building" },
  { href: "/admin/game", label: "Игра", icon: "sparkles" },
  { href: "/admin/characters", label: "Персонажи", icon: "smile" },
  { href: "/admin/access", label: "Доступ", icon: "key" },
];

const isActive = (href: string, pathname: string) =>
  href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/orders") : pathname === href || pathname.startsWith(`${href}/`);

/**
 * Разделы кабинета. На телефоне — прокручиваемая строка «таблеток» под шапкой, на широком экране — колонка слева.
 * Число новых заявок рядом с «Заявки» читается и скринридером.
 */
export function AdminNav({ newCount }: { newCount: number }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // активный раздел — в видимой части прокручиваемой строки (только по горизонтали, страница не прыгает)
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="Разделы кабинета" className="-mx-4 min-w-0 overflow-x-auto px-4 pb-3 pt-1 min-[900px]:mx-0 min-[900px]:overflow-visible min-[900px]:px-0 min-[900px]:py-0">
      <ul className="flex gap-1.5 min-[900px]:flex-col">
        {ITEMS.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center gap-2.5 rounded-full px-4 text-[0.9375rem] font-medium transition-colors min-[900px]:min-h-12 min-[900px]:rounded-field min-[900px]:px-3.5",
                  active ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2",
                )}
              >
                <Icon name={item.icon} className="hidden size-5 min-[900px]:block" />
                {item.label}
                {item.href === "/admin" && newCount > 0 && (
                  <>
                    <span
                      aria-hidden
                      className={cx(
                        "min-w-6 rounded-full px-1.5 text-center text-[0.8125rem] font-semibold tabular-nums",
                        active ? "bg-accent-ink text-accent" : "bg-accent text-accent-ink",
                      )}
                    >
                      {newCount}
                    </span>
                    <span className="sr-only">, новых: {newCount}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
