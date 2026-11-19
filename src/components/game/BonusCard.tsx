"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/controls";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import type { BonusCodePublic } from "@/lib/order-types";
import { formatRub } from "@/lib/pricing";

const STATUS_NOTE: Partial<Record<BonusCodePublic["status"], string>> = {
  redeemed: "Этот бонус уже применён.",
  void: "Этот бонус аннулирован.",
};

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const yearOf = new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: "Europe/Moscow" });
const until = (iso: string) => `${dayMonth.format(new Date(iso))} ${yearOf.format(new Date(iso))}`;

/** Бонусный код с условиями и кнопкой «Скопировать». Бонус применяет владелец вручную: страница этого не обещает. */
export function BonusCard({ bonus }: { bonus: BonusCodePublic }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(bonus.code);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = bonus.code;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.append(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    setState(ok ? "ok" : "fail");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className="grid gap-3 rounded-field border border-line bg-surface-2 p-4" data-testid="bonus-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-testid="bonus-code" className="select-all text-[1.5rem] font-semibold leading-none tracking-wide tabular-nums">
          {bonus.code}
        </p>
        <Button variant="secondary" onClick={() => void copy()} aria-label={`Скопировать код ${bonus.code}`}>
          {state === "ok" ? <CheckIcon className="size-5 text-ok" /> : <CopyIcon className="size-5" />}
          {state === "ok" ? "Скопировано" : "Скопировать"}
        </Button>
      </div>
      <p className="text-[0.9375rem] leading-snug">
        Бонус {formatRub(bonus.amount)} на следующий заказ от {formatRub(bonus.minOrder)}. Действует до {until(bonus.expiresAt)}.
      </p>
      {STATUS_NOTE[bonus.status] && <p className="text-[0.9375rem] leading-snug text-muted">{STATUS_NOTE[bonus.status]}</p>}
      <p className="text-[0.9375rem] leading-snug text-muted">Покажите код при следующем заказе — владелец применит бонус вручную.</p>
      <p role="status" className="sr-only">
        {state === "ok" ? "Код скопирован" : state === "fail" ? "Не удалось скопировать код" : ""}
      </p>
      {state === "fail" && <p className="text-[0.875rem] text-danger">Не удалось скопировать — выделите код и скопируйте вручную.</p>}
    </div>
  );
}
