import { Suspense, type ReactNode } from "react";
import { CartData } from "@/components/site/CartData";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ToastHost } from "@/components/ui/Toasts";

/**
 * Каркас публичного сайта: шапка, подвал, лист корзины и тосты. Страницы рисуют собственный <main id="main">.
 * Новые публичные страницы (/uslugi, /contacts, /privacy, /credits) кладите в эту группу: src/app/(site)/<имя>/page.tsx.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        К содержимому
      </a>
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
      <Suspense fallback={null}>
        <CartData />
      </Suspense>
      <ToastHost where="page" />
    </div>
  );
}
