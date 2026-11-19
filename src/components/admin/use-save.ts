"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult, Parsed } from "@/lib/admin/schemas";

const NETWORK_ERROR = "Нет связи с сервером. Ничего не потеряно — повторите попытку.";

/**
 * Вызов Server Action из формы: состояние ожидания и результат. Server Action вызывается в переходе (transition),
 * поэтому страница остаётся отзывчивой, а перерисовку после `refresh()` Next делает сам.
 */
export function useSave<A extends unknown[]>(action: (...args: A) => Promise<ActionResult>) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = useCallback(
    (...args: A) => {
      setResult(null);
      startTransition(async () => {
        try {
          setResult(await action(...args));
        } catch (e) {
          // редирект Next (выход, удаление) обрабатывает сам роутер — ошибки тут нет
          if (typeof (e as { digest?: string }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) return;
          setResult({ ok: false, error: NETWORK_ERROR });
        }
      });
    },
    [action],
  );

  return { pending, result, run, setResult };
}

/** Сообщение об ошибке поля из результата действия. */
export function fieldError(result: ActionResult | null, name: string): string | undefined {
  return result && !result.ok ? result.fields?.[name] : undefined;
}

/** Предупреждение браузера при закрытии или перезагрузке вкладки, пока в форме есть несохранённые правки. */
function useUnsavedGuard(values: unknown, result: ActionResult | null) {
  const current = JSON.stringify(values);
  const baseline = useRef(current);
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  });
  useEffect(() => {
    if (result?.ok) baseline.current = latest.current;
  }, [result]);
  useEffect(() => {
    if (current === baseline.current) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [current, result]);
}

/**
 * Форма: сначала та же проверка, что на сервере (ошибки у полей без обращения к сети), потом Server Action.
 * `error(name)` — сообщение поля; при ошибках фокус уходит на первое неверное поле формы (`formRef`).
 * `draft` — текущие значения формы: пока они не сохранены, закрытие вкладки сопровождается предупреждением.
 */
export function useForm<V>(action: (values: V) => Promise<ActionResult>, parse: (values: V) => Parsed<unknown>, draft?: unknown) {
  const { pending, result, run, setResult } = useSave(action);
  useUnsavedGuard(draft, result);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = useCallback(
    (values: V) => {
      const parsed = parse(values);
      if (parsed.ok) run(values);
      else setResult({ ok: false, fields: parsed.fields });
    },
    [parse, run, setResult],
  );

  useEffect(() => {
    if (result && !result.ok && result.fields) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [result]);

  const error = useCallback((name: string) => fieldError(result, name), [result]);
  const reset = useCallback(() => setResult(null), [setResult]);
  return { pending, result, submit, error, formRef, reset };
}
