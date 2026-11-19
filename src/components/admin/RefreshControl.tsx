"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "./Icon";
import { Spinner, button } from "./ui";

const INTERVAL_MS = 60_000;

/**
 * «Обновить» и мягкое автообновление: раз в минуту, пока вкладка видна, и сразу при возврате на вкладку, если прошла минута.
 * Если новых заявок стало больше, показывает короткое сообщение (его читает и скринридер).
 */
export function RefreshControl({ newCount, updatedAt }: { newCount: number; updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const lastRun = useRef(0);
  const prevNew = useRef(newCount);

  const refresh = useCallback(() => {
    lastRun.current = Date.now();
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (newCount > prevNew.current) {
      setNotice(newCount - prevNew.current === 1 ? "Пришла новая заявка." : `Пришли новые заявки: ${newCount - prevNew.current}.`);
      const t = setTimeout(() => setNotice(""), 12_000);
      prevNew.current = newCount;
      return () => clearTimeout(t);
    }
    prevNew.current = newCount;
  }, [newCount]);

  useEffect(() => {
    lastRun.current = Date.now();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun.current > INTERVAL_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <div className="flex items-center gap-3">
      {notice && <span className="hidden rounded-full bg-accent px-3 py-1 text-[0.8125rem] font-medium text-accent-ink min-[420px]:inline">{notice}</span>}
      <span className="hidden text-[0.8125rem] text-muted min-[420px]:inline">Обновлено в {updatedAt}</span>
      <button type="button" onClick={refresh} disabled={pending} aria-busy={pending} className={button("secondary", "sm")}>
        {pending ? <Spinner /> : <Icon name="refresh" className="size-4" />}
        Обновить
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {notice}
      </span>
    </div>
  );
}
