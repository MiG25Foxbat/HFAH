import { Suspense, type ReactNode } from "react";
import { AdminShell, ShellSkeleton } from "@/components/admin/AdminShell";
import { ensureOwner } from "@/lib/server/admin/guard";
import { countNewOrders } from "@/lib/server/admin/orders";

/** Всё под /admin, кроме входа: без сеанса владельца — редирект на /admin/login. Страницы проверяют сеанс и сами. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <OwnerGate>{children}</OwnerGate>
    </Suspense>
  );
}

async function OwnerGate({ children }: { children: ReactNode }) {
  await ensureOwner();
  const newCount = await countNewOrders();
  return <AdminShell newCount={newCount}>{children}</AdminShell>;
}
