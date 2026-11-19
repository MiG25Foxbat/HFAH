"use client";

import { useState } from "react";
import { changePasswordAction } from "@/app/admin/actions";
import { parsePasswordForm } from "@/lib/admin/schemas";
import { TextField } from "./fields";
import { FormStatus, Panel, Spinner, button } from "./ui";
import { useForm } from "./use-save";

/** Смена пароля: после неё все прежние сеансы закрываются, этот браузер остаётся в кабинете. */
export function PasswordForm({ minLength }: { minLength: number }) {
  const [v, setV] = useState({ current: "", next: "", repeat: "" });
  const parse = (values: typeof v) => parsePasswordForm(values, minLength);
  const { pending, result, submit, error, formRef } = useForm(changePasswordAction, parse);

  return (
    <Panel title="Сменить пароль" description="После смены все остальные сеансы — на других устройствах и в других браузерах — закроются. Этот останется.">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(v);
        }}
        className="grid max-w-md gap-5"
      >
        <TextField label="Текущий пароль" name="current-password" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV((p) => ({ ...p, current: e.target.value }))} error={error("current")} />
        <TextField
          label="Новый пароль"
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={v.next}
          onChange={(e) => setV((p) => ({ ...p, next: e.target.value }))}
          error={error("next")}
          hint={`Не короче ${minLength} символов.`}
        />
        <TextField label="Новый пароль ещё раз" name="confirm-password" type="password" autoComplete="new-password" value={v.repeat} onChange={(e) => setV((p) => ({ ...p, repeat: e.target.value }))} error={error("repeat")} />
        <div className="grid gap-2">
          <button type="submit" disabled={pending} className={button("primary")}>
            {pending && <Spinner />}
            {pending ? "Меняем…" : "Сменить пароль"}
          </button>
          <FormStatus result={result} pending={pending} />
        </div>
      </form>
    </Panel>
  );
}
