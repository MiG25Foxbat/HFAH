import { lowerFirst } from "@/lib/shop";
import type { ExcludedItem } from "@/lib/settings";
import { AlertIcon, ChevronIcon } from "@/components/ui/icons";

/** Честное сообщение «Этого мы не делаем: …» с подсказкой, куда обратиться. Не блокирует заявку (`soft`). */
export function ExcludedNote({ items, soft = false, className = "" }: { items: readonly ExcludedItem[]; soft?: boolean; className?: string }) {
  if (!items.length) return null;
  return (
    <div role="status" className={`flex gap-3 rounded-field border border-ply bg-surface-2 px-4 py-3 text-[0.9375rem] leading-snug ${className}`}>
      <AlertIcon className="mt-0.5 size-5 shrink-0 text-ply" />
      <div className="grid gap-1.5">
        {items.map((e) => (
          <p key={e.title}>
            <span className="font-semibold">Этого мы не делаем: {lowerFirst(e.title)}.</span> {e.hint}
          </p>
        ))}
        {soft && <p className="text-muted">Заявку всё равно можно отправить: мастер уточнит, чем сможет помочь.</p>}
      </div>
    </div>
  );
}

/** Короткий список «Чего мы не делаем» в конце каталога. */
export function ExcludedList({ items }: { items: readonly ExcludedItem[] }) {
  if (!items.length) return null;
  return (
    <details className="group rounded-panel border border-line bg-surface px-5 py-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-medium">
        Чего мы не делаем
        <ChevronIcon className="size-5 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="grid gap-3 pb-4 pt-1 text-[0.9375rem] leading-snug">
        {items.map((e) => (
          <li key={e.title}>
            <span className="font-medium">{e.title}.</span> <span className="text-muted">{e.hint}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
