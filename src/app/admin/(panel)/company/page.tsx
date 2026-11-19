import { Suspense } from "react";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { PageHeader } from "@/components/admin/ui";
import { ensureOwner } from "@/lib/server/admin/guard";
import { getSettings } from "@/lib/server/settings";

export const metadata = { title: "Компания" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

export default function CompanyPage() {
  return (
    <>
      <PageHeader title="Компания" lead="Название, контакты и территория показываются на сайте. Логотип и палитра меняются в исходниках." />
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-panel bg-surface-2" />}>
        <Company />
      </Suspense>
    </>
  );
}

async function Company() {
  await ensureOwner();
  const { company } = await getSettings();
  return <CompanyForm initial={company} />;
}
