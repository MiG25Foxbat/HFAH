import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/admin/actions";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { AdminNav } from "./AdminNav";
import { Icon } from "./Icon";
import { button } from "./ui";

function Wordmark() {
  return (
    <Link href="/admin" className="inline-flex min-h-11 items-baseline gap-2.5 rounded-field">
      <span translate="no" className="font-display text-2xl leading-none">запросто</span>
      <span className="text-[0.8125rem] text-muted">кабинет</span>
    </Link>
  );
}

function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <button type="submit" className={button("quiet", "sm", "w-full justify-start gap-2.5 min-[900px]:min-h-12")}>
        <Icon name="logout" className="size-5" />
        Выйти
      </button>
    </form>
  );
}

/**
 * Каркас кабинета: слева колонка (на широком экране) или шапка с прокручиваемой строкой разделов (на телефоне).
 * Тема — тот же переключатель, что на сайте; на телефоне он на странице «Доступ».
 */
export function AdminShell({ newCount, children }: { newCount: number; children: ReactNode }) {
  return (
    <div className="min-h-screen min-[900px]:grid min-[900px]:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-ink">
        К содержимому
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-4 pt-2 min-[900px]:flex min-[900px]:h-screen min-[900px]:flex-col min-[900px]:gap-6 min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:px-4 min-[900px]:py-6">
        <div className="flex items-center justify-between min-[900px]:px-2">
          <Wordmark />
          <LogoutButton className="min-[900px]:hidden" />
        </div>
        <AdminNav newCount={newCount} />
        <div className="mt-auto hidden flex-col gap-3 min-[900px]:flex">
          <ThemeSwitch className="flex-col rounded-2xl!" />
          <LogoutButton />
        </div>
      </header>
      <main id="main" className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 min-[900px]:px-8 min-[900px]:py-8">
        {children}
      </main>
    </div>
  );
}

/** Показывается, пока проверяется сеанс и считаются новые заявки. */
export function ShellSkeleton() {
  return (
    <div className="min-h-screen px-4 py-3" aria-busy="true">
      <span translate="no" className="font-display text-2xl">запросто</span>
      <p className="mt-8 text-muted">Открываем кабинет…</p>
    </div>
  );
}
