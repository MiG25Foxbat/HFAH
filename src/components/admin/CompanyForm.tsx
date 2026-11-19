"use client";

import { useRef, useState } from "react";
import { saveCompanyAction } from "@/app/admin/actions";
import { formatPhone } from "@/lib/admin/format";
import { parseCompanyForm, type CompanyForm as Values } from "@/lib/admin/schemas";
import type { Company } from "@/lib/settings";
import { TextArea, TextField } from "./fields";
import { Icon } from "./Icon";
import { FormStatus, Panel, Spinner, button } from "./ui";
import { useForm } from "./use-save";

const MAX_EXCLUDED = 30;

interface Row {
  key: number;
  title: string;
  hint: string;
  keywords: string;
}

/** Название, контакты, территория и список работ, которые компания не берёт. Пустой контакт сайт показывает как «контакты не указаны». */
export function CompanyForm({ initial }: { initial: Company }) {
  const nextKey = useRef(initial.excluded.length);
  const [base, setBase] = useState({
    name: initial.name,
    city: initial.city,
    territory: initial.territory,
    accent: initial.accent,
    phone: formatPhone(initial.contacts.phone),
    telegram: initial.contacts.telegram,
    whatsapp: formatPhone(initial.contacts.whatsapp),
    email: initial.contacts.email,
  });
  const [rows, setRows] = useState<Row[]>(() =>
    initial.excluded.map((e, i) => ({ key: i, title: e.title, hint: e.hint, keywords: e.keywords.join(", ") })),
  );
  const { pending, result, submit, error, formRef } = useForm(saveCompanyAction, parseCompanyForm, { base, rows });

  const field = (name: keyof typeof base) => ({
    value: base[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBase((p) => ({ ...p, [name]: e.target.value })),
    error: error(name),
  });
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const values: Values = { ...base, excluded: rows.map(({ title, hint, keywords }) => ({ title, hint, keywords })) };
        submit(values);
      }}
      className="grid gap-6"
    >
      <Panel title="Название и территория">
        <div className="grid gap-5 min-[700px]:grid-cols-2">
          <TextField label="Название компании" name="name" autoComplete="off" {...field("name")} />
          <TextField label="Город" name="city" autoComplete="off" {...field("city")} />
          <TextArea
            wrapperClass="min-[700px]:col-span-2"
            label="Территория работы"
            rows={2}
            hint="Где вы работаете и что считается выездом за город."
            {...field("territory")}
          />
          <TextField
            wrapperClass="min-[700px]:col-span-2"
            label="Короткая фраза под названием"
            autoComplete="off"
            hint="Одно предложение на главной странице."
            {...field("accent")}
          />
        </div>
      </Panel>

      <Panel title="Контакты" description="Пустое поле — канал не указан: сайт покажет «контакты не указаны», а не выдуманный номер.">
        <div className="grid gap-5 min-[700px]:grid-cols-2">
          <TextField label="Телефон" name="phone" type="tel" inputMode="tel" spellCheck={false} autoComplete="off" placeholder="+7 916 123-45-67" {...field("phone")} />
          <TextField label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" spellCheck={false} autoComplete="off" placeholder="+7 916 123-45-67" hint="Номер, на который можно написать." {...field("whatsapp")} />
          <TextField label="Telegram" name="telegram" spellCheck={false} autoComplete="off" placeholder="@zaprosto_master" hint="Имя пользователя или ссылка t.me." {...field("telegram")} />
          <TextField label="Почта" name="email" type="email" inputMode="email" spellCheck={false} autoComplete="off" placeholder="master@example.ru" {...field("email")} />
        </div>
      </Panel>

      <Panel
        title="Работы, которые вы не берёте"
        description="Если клиент напишет такое в описании или комментарии, заявку это не заблокирует, но вы увидите предупреждение. Слова ищутся по основе: «газов» найдёт «газовую плиту»."
      >
        {rows.length === 0 && <p className="mb-4 text-muted">Список пуст: предупреждений в заявках не будет.</p>}
        <ul className="grid gap-4">
          {rows.map((r, i) => (
            <li key={r.key} className="grid gap-4 rounded-field border border-line bg-bg p-4">
              <TextField
                label="Название"
                autoComplete="off"
                value={r.title}
                onChange={(e) => setRow(r.key, { title: e.target.value })}
                error={error(`excluded.${i}.title`)}
                placeholder="Например: газовое оборудование…"
              />
              <TextArea
                label="Что сказать клиенту"
                rows={2}
                value={r.hint}
                onChange={(e) => setRow(r.key, { hint: e.target.value })}
                error={error(`excluded.${i}.hint`)}
                placeholder="Куда обратиться вместо вас…"
              />
              <TextField
                label="Слова для поиска"
                autoComplete="off"
                value={r.keywords}
                onChange={(e) => setRow(r.key, { keywords: e.target.value })}
                error={error(`excluded.${i}.keywords`)}
                hint="Через запятую, основы слов, например: газов, котл."
              />
              <div>
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className={button("danger", "sm")}>
                  <Icon name="trash" className="size-4" />
                  Убрать из списка
                </button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length < MAX_EXCLUDED && (
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: nextKey.current++, title: "", hint: "", keywords: "" }])}
            className={button("secondary", "md", "mt-4")}
          >
            <Icon name="plus" className="size-5" />
            Добавить в список
          </button>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="submit" disabled={pending} className={button("primary")}>
          {pending && <Spinner />}
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <FormStatus result={result} pending={pending} />
      </div>
    </form>
  );
}
