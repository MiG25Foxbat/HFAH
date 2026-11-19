import type { Metadata } from "next";
import type { ReactNode } from "react";

// Кабинет не индексируется и не кешируется (заголовки — в next.config.ts), здесь — метаданные страницы.
export const metadata: Metadata = {
  title: { default: "Кабинет", template: "%s — кабинет «Ладно»" },
  robots: { index: false, follow: false, nocache: true },
};

// Кабинет целиком зависит от сеанса владельца и ничего не отдаёт без него: мгновенных переходов (статической оболочки)
// у него нет по смыслу. Без этого dev-проверка «instant» каждый раз упирается в редирект на вход.
export const instant = false;

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
