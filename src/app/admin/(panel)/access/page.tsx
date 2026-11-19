import { Suspense } from "react";
import { logoutAction, logoutAllAction } from "@/app/admin/actions";
import { PasswordForm } from "@/components/admin/PasswordForm";
import { Icon } from "@/components/admin/Icon";
import { PageHeader, Panel, button } from "@/components/admin/ui";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { MIN_PASSWORD_LENGTH } from "@/lib/server/auth";
import { ensureOwner } from "@/lib/server/admin/guard";

export const metadata = { title: "Доступ" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

export default function AccessPage() {
  return (
    <>
      <PageHeader title="Доступ" lead="Пароль владельца и вход с устройств. Пароль хранится только в виде хеша." />
      <div className="grid gap-6">
        <Suspense fallback={<div aria-busy="true" className="h-72 animate-pulse rounded-panel bg-surface-2" />}>
          <Password />
        </Suspense>
        <Panel title="Выход">
          <div className="flex flex-wrap gap-3">
            <form action={logoutAction}>
              <button type="submit" className={button("secondary")}>
                <Icon name="logout" className="size-5" />
                Выйти
              </button>
            </form>
            <form action={logoutAllAction}>
              <button type="submit" className={button("danger")}>
                Выйти на всех устройствах
              </button>
            </form>
          </div>
          <p className="mt-3 max-w-prose text-[0.9375rem] text-muted">«Выйти на всех устройствах» закрывает все сеансы, включая этот: для входа понадобится пароль.</p>
        </Panel>
        <Panel title="Оформление" className="min-[900px]:hidden">
          <ThemeSwitch />
        </Panel>
      </div>
    </>
  );
}

async function Password() {
  await ensureOwner();
  return <PasswordForm minLength={MIN_PASSWORD_LENGTH} />;
}
