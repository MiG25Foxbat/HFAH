"use client";

import { useCallback, useRef, useState } from "react";
import { deleteOrderAction, saveDealAction, saveNoteAction } from "@/app/admin/actions";
import { NOTE_MAX, parseDealForm, parseNoteForm } from "@/lib/admin/schemas";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-types";
import { formatRub } from "@/lib/pricing";
import { OptionGroup, TextArea, TextField } from "./fields";
import { Icon } from "./Icon";
import { FormStatus, Panel, Spinner, button } from "./ui";
import { useForm, useSave } from "./use-save";

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }));

interface DealValues {
  status: OrderStatus;
  finalPrice: string;
  agreedDate: string;
  agreedTime: string;
}

/**
 * Решение владельца: итоговая цена, согласованное время выезда (по Москве) и статус — одной кнопкой «Сохранить».
 * «Согласована» без цены или времени не сохраняется ни здесь, ни на сервере, ни в БД.
 */
export function DealForm({
  orderId,
  initial,
  knownTotal,
  hasManual,
  wish,
}: {
  orderId: string;
  initial: DealValues;
  knownTotal: number | null;
  hasManual: boolean;
  wish: string | null;
}) {
  const [v, setV] = useState<DealValues>(initial);
  const action = useCallback((values: DealValues) => saveDealAction(orderId, values), [orderId]);
  const { pending, result, submit, error, formRef } = useForm(action, parseDealForm, v);
  const set = <K extends keyof DealValues>(k: K, value: DealValues[K]) => setV((p) => ({ ...p, [k]: value }));

  return (
    <Panel title="Решение">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(v);
        }}
        className="grid gap-5"
      >
        <OptionGroup
          legend="Статус"
          name="status"
          layout="chips"
          value={v.status}
          onChange={(s) => set("status", s)}
          options={STATUS_OPTIONS}
          hint="Для статуса «Согласована» нужны итоговая цена и время выезда."
        />
        <div>
          <TextField
            label="Итоговая цена"
            name="finalPrice"
            suffix="₽"
            inputMode="numeric"
            autoComplete="off"
            value={v.finalPrice}
            onChange={(e) => set("finalPrice", e.target.value.replace(/[^\d]/g, ""))}
            error={error("finalPrice")}
            hint="Целое число рублей. Клиент увидит её по своей ссылке."
          />
          {knownTotal !== null && v.finalPrice === "" && (
            <button type="button" onClick={() => set("finalPrice", String(knownTotal))} className="mt-1.5 min-h-11 text-[0.9375rem] text-ink underline underline-offset-2">
              {hasManual ? `Подставить известную часть: ${formatRub(knownTotal)}` : `Подставить расчёт: ${formatRub(knownTotal)}`}
            </button>
          )}
        </div>
        <div className="grid gap-4 min-[420px]:grid-cols-2">
          <TextField
            label="Дата выезда"
            name="agreedDate"
            type="date"
            value={v.agreedDate}
            onChange={(e) => set("agreedDate", e.target.value)}
            error={error("agreedDate")}
          />
          <TextField label="Время выезда" name="agreedTime" type="time" value={v.agreedTime} onChange={(e) => set("agreedTime", e.target.value)} error={error("agreedTime")} />
        </div>
        <p className="-mt-3 text-[0.8125rem] text-muted">
          Время московское.{wish ? ` Клиент просил: ${wish}.` : " Клиент время не просил."}
        </p>
        <div className="grid gap-2">
          <button type="submit" disabled={pending} className={button("primary")}>
            {pending && <Spinner />}
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
          <FormStatus result={result} pending={pending} />
        </div>
      </form>
    </Panel>
  );
}

export function NoteForm({ orderId, initial }: { orderId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const action = useCallback((values: { note: string }) => saveNoteAction(orderId, values), [orderId]);
  const { pending, result, submit, error, formRef } = useForm(action, parseNoteForm, note);

  return (
    <Panel title="Заметка для себя" description="Видна только вам: клиент и публичные ссылки её не получают.">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit({ note });
        }}
        className="grid gap-4"
      >
        <TextArea
          label="Заметка"
          name="ownerNote"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          error={error("note")}
          hint={`${note.length} из ${NOTE_MAX}`}
        />
        <div className="grid gap-2">
          <button type="submit" disabled={pending} className={button("secondary")}>
            {pending && <Spinner />}
            {pending ? "Сохраняем…" : "Сохранить заметку"}
          </button>
          <FormStatus result={result} pending={pending} />
        </div>
      </form>
    </Panel>
  );
}

/** Удаление заявки: окно подтверждения прямо называет последствия — фото удаляются безвозвратно. */
export function DeleteOrder({ orderId, number, photoCount, hasBonus }: { orderId: string; number: number; photoCount: number; hasBonus: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { pending, result, run } = useSave(deleteOrderAction);

  return (
    <div>
      <button type="button" onClick={() => dialog.current?.showModal()} className={button("danger", "sm", "w-full")}>
        <Icon name="trash" className="size-4" />
        Удалить заявку…
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-title"
        aria-describedby="delete-text"
        className="m-auto w-[min(92vw,30rem)] overscroll-contain rounded-panel border border-line bg-surface p-6 text-ink backdrop:bg-black/50"
      >
        <h2 id="delete-title" className="text-[1.25rem] font-semibold">
          Удалить заявку №&nbsp;{number}?
        </h2>
        <p id="delete-text" className="mt-3 text-[0.9375rem]">
          Заявка и {photoCount > 0 ? `все её фото (${photoCount})` : "её данные"} будут удалены{" "}
          <strong className="font-semibold">безвозвратно</strong>: восстановить их нельзя. Вместе с ней исчезнут история, приватная заметка
          {hasBonus ? ", бонусный код" : ""} и ссылка клиента.
        </p>
        <div className="mt-5 grid gap-3 min-[420px]:grid-cols-2">
          <button type="button" onClick={() => dialog.current?.close()} className={button("secondary")}>
            Отмена
          </button>
          <button type="button" disabled={pending} onClick={() => run(orderId)} className={button("dangerSolid")}>
            {pending && <Spinner />}
            {pending ? "Удаляем…" : "Удалить навсегда"}
          </button>
        </div>
        <FormStatus result={result} pending={pending} className="mt-3" />
      </dialog>
    </div>
  );
}
