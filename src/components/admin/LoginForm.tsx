"use client";

import { useActionState, useEffect, useRef } from "react";
import { loginAction } from "@/app/admin/actions";
import { TextField } from "./fields";
import { Spinner, button } from "./ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const input = useRef<HTMLInputElement>(null);
  const error = state && !state.ok ? state.error : undefined;

  useEffect(() => {
    // после неудачной попытки поле очищается (так работают формы React) — вернём в него фокус
    if (error) input.current?.focus();
  }, [error, state]);

  return (
    <form action={formAction} className="mt-6 grid gap-5" noValidate>
      <TextField
        ref={input}
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={error}
      />
      <button type="submit" disabled={pending} className={button("primary")}>
        {pending && <Spinner />}
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
