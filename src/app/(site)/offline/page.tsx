import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/controls";

// Эту страницу service worker подставляет вместо любой страницы, когда нет сети. В индекс она не нужна.
export const metadata: Metadata = {
  title: "Нет соединения",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto grid w-full max-w-[1200px] justify-items-start gap-4 px-4 py-16">
      <h1 className="text-[1.75rem] font-semibold">Нет соединения</h1>
      <p className="max-w-[44ch] leading-relaxed text-muted">
        Корзина и черновик заявки сохранены на этом устройстве — отправить заявку можно, когда связь вернётся.
      </p>
      {/* Пустой href открывает тот же адрес ещё раз: работает без JavaScript, а офлайн-страница показывается по адресу той страницы, которую открывали. */}
      <a href="" className={buttonClass("primary")}>
        Повторить
      </a>
    </main>
  );
}
