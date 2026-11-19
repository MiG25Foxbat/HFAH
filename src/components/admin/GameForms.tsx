"use client";

import { useCallback, useState } from "react";
import { saveCharactersAction, saveGameAction, setBonusStatusAction } from "@/app/admin/actions";
import { parseCharactersForm, parseGameForm, type BonusStatus } from "@/lib/admin/schemas";
import type { Characters, GameSettings } from "@/lib/settings";
import { Check, OptionGroup, TextField } from "./fields";
import { FormStatus, Panel, Spinner, button } from "./ui";
import { useForm, useSave } from "./use-save";

const MODE_OPTIONS = [
  { value: "off", label: "Выключена", hint: "После заявки игру не предлагаем." },
  { value: "play", label: "Играть без скидки", hint: "Игра как развлечение, бонус не выдаётся." },
  { value: "bonus", label: "Бонус на следующий заказ", hint: "За игру клиент получает код, один на заявку. Текущий заказ не дешевеет." },
] as const;

type GameValues = { mode: GameSettings["mode"]; bonusAmount: string; validDays: string; minNextOrder: string };

export function GameForm({ initial }: { initial: GameSettings }) {
  const [v, setV] = useState<GameValues>({
    mode: initial.mode,
    bonusAmount: String(initial.bonusAmount),
    validDays: String(initial.validDays),
    minNextOrder: String(initial.minNextOrder),
  });
  const { pending, result, submit, error, formRef } = useForm(saveGameAction, parseGameForm, v);
  const set = <K extends keyof GameValues>(k: K, value: GameValues[K]) => setV((p) => ({ ...p, [k]: value }));

  return (
    <Panel title="Режим и бонус">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(v);
        }}
        className="grid gap-6"
      >
        <OptionGroup legend="Режим игры" name="mode" value={v.mode} onChange={(m) => set("mode", m)} options={MODE_OPTIONS} error={error("mode")} />
        <div className="grid gap-5 min-[700px]:grid-cols-3">
          <TextField label="Сумма бонуса" suffix="₽" inputMode="numeric" autoComplete="off" value={v.bonusAmount} onChange={(e) => set("bonusAmount", e.target.value)} error={error("bonusAmount")} hint="Скидка на следующий заказ." />
          <TextField label="Срок действия" suffix="дн." inputMode="numeric" autoComplete="off" value={v.validDays} onChange={(e) => set("validDays", e.target.value)} error={error("validDays")} hint="От выдачи кода." />
          <TextField label="Минимум следующего заказа" suffix="₽" inputMode="numeric" autoComplete="off" value={v.minNextOrder} onChange={(e) => set("minNextOrder", e.target.value)} error={error("minNextOrder")} hint="Бонус действует от этой суммы." />
        </div>
        <p className="rounded-field border border-line bg-bg px-4 py-3 text-[0.9375rem]">
          Бонус применяется вручную после проверки. Автоматического погашения и защиты от обмана нет.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

/** «Отметить погашенным» и «Аннулировать» для кода; для уже закрытых — «Вернуть в выданные» (на случай случайного нажатия). */
export function BonusActions({ id, status }: { id: number; status: BonusStatus }) {
  const action = useCallback((to: BonusStatus) => setBonusStatusAction(id, to), [id]);
  const { pending, result, run } = useSave(action);
  const go = run;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "issued" ? (
        <>
          <button type="button" disabled={pending} onClick={() => go("redeemed")} className={button("secondary", "sm")}>
            Отметить погашенным
          </button>
          <button type="button" disabled={pending} onClick={() => go("void")} className={button("danger", "sm")}>
            Аннулировать
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => go("issued")} className={button("quiet", "sm")}>
          Вернуть в выданные
        </button>
      )}
      {result && !result.ok && <FormStatus result={result} />}
    </div>
  );
}

// ---- персонажи ----

const PERSONALITY_OPTIONS = [
  { value: "calm", label: "Спокойный" },
  { value: "cheerful", label: "Весёлый" },
  { value: "business", label: "Деловой" },
] as const;

export function CharactersForm({
  initial,
  samples,
}: {
  initial: Characters;
  /** Примеры реплик по характерам. */
  samples: Record<Characters["personality"], string[]>;
}) {
  const [v, setV] = useState<Characters>(initial);
  const { pending, result, submit, error, formRef } = useForm(saveCharactersAction, parseCharactersForm, v);

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(v);
      }}
      className="grid gap-6"
    >
      <Panel title="Характер" description="Как персонаж обращается к клиенту. Один характер для всех пяти предметов.">
        <OptionGroup
          legend="Характер персонажей"
          name="personality"
          value={v.personality}
          onChange={(p) => setV((s) => ({ ...s, personality: p }))}
          options={PERSONALITY_OPTIONS.map((o) => ({
            ...o,
            hint: (
              <span className="mt-1 grid gap-1">
                {samples[o.value].map((p) => (
                  <span key={p}>«{p}»</span>
                ))}
              </span>
            ),
          }))}
          error={error("personality")}
        />
      </Panel>
      <Panel title="Что показывать">
        <div className="grid gap-1">
          <Check label="Показывать лица" hint="Если выключить, у персонажей остаётся только предмет: без глаз и улыбки." checked={v.facesEnabled} onChange={(e) => setV((s) => ({ ...s, facesEnabled: e.target.checked }))} />
          <Check label="Показывать реплики" hint="Короткие фразы у персонажа. Они заготовлены заранее, нейросеть не нужна." checked={v.phrasesEnabled} onChange={(e) => setV((s) => ({ ...s, phrasesEnabled: e.target.checked }))} />
        </div>
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
