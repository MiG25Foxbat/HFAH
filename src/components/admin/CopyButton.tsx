"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { button } from "./ui";

/** Копирует текст в буфер. Если браузер не даёт доступ к буферу, говорит об этом, а не делает вид, что скопировал. */
export function CopyButton({ text, label, doneLabel }: { text: string; label: string; doneLabel: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button type="button" onClick={copy} className={button("secondary")}>
        <Icon name={state === "done" ? "check" : "copy"} className="size-5" />
        {label}
      </button>
      <span role="status" aria-live="polite" className={state === "failed" ? "text-[0.875rem] text-danger" : "sr-only"}>
        {state === "done" ? doneLabel : state === "failed" ? "Не удалось скопировать — выделите номер и скопируйте вручную." : ""}
      </span>
    </>
  );
}
