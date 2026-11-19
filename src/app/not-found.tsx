import { ButtonLink } from "@/components/ui/controls";

/** Страница не найдена. Ничего не раскрывает: одинаково для несуществующих адресов и неверных ссылок на заявки. */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto grid w-full max-w-[1200px] justify-items-start gap-4 px-4 py-16">
      <h1 className="text-[1.75rem] font-semibold">Страница не найдена</h1>
      <p className="max-w-prose text-muted">Проверьте адрес. Если вы открывали ссылку на заявку, убедитесь, что она скопирована целиком.</p>
      <ButtonLink href="/">На главную</ButtonLink>
    </main>
  );
}
