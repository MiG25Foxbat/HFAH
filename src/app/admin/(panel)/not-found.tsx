import Link from "next/link";
import { button } from "@/components/admin/ui";

export default function AdminNotFound() {
  return (
    <div className="rounded-panel border border-dashed border-line px-6 py-10">
      <h1 className="text-[1.625rem] font-semibold">Не найдено</h1>
      <p className="mt-2 max-w-prose text-muted">Такой заявки нет. Возможно, её удалили или ссылка набрана с ошибкой.</p>
      <Link href="/admin" className={button("secondary", "md", "mt-5")}>
        К списку заявок
      </Link>
    </div>
  );
}
