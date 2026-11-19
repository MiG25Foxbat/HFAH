"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ExcludedNote } from "@/components/shop/ExcludedNote";
import { Button, ButtonLink, Callout, CheckRow, TextArea, TextField } from "@/components/ui/controls";
import { ChevronIcon } from "@/components/ui/icons";
import { cartSnapshot } from "@/lib/cart";
import { cartClear, useCart, useCartReady } from "@/lib/cart-store";
import type { Service } from "@/lib/catalog";
import { buildPayload, nextAttempt, validateOrder, type AccessField, type FormValues } from "@/lib/checkout";
import { draftClear, draftUpdate, flushDraft, getDraft, useDraft } from "@/lib/draft-store";
import { MATERIALS, MATERIALS_LABEL, TIME_SLOTS, todayMoscow } from "@/lib/order-schema";
import { formatRub, type PricingSettings } from "@/lib/pricing";
import { excludedInText } from "@/lib/shop";
import type { ExcludedItem } from "@/lib/settings";
import { uuid4 } from "@/lib/uuid";
import { CheckoutSummary } from "./CheckoutSummary";
import { PhotoField } from "./PhotoField";

const ORDER = ["name", "phone", "address", "access", "materials", "desiredDate", "desiredTime", "photos", "comment", "consent"];
const groupOf = (key: string) => (key.startsWith("access.") ? "access" : key);
const SEND_TIMEOUT_MS = 25_000;

type Phase = "idle" | "sending" | "network" | "done";

const ACCESS_LABELS: Record<AccessField, { label: string; placeholder: string }> = {
  entrance: { label: "Подъезд", placeholder: "например, 2" },
  intercom: { label: "Домофон", placeholder: "код или как позвонить" },
  floor: { label: "Этаж", placeholder: "например, 5" },
  elevator: { label: "Лифт", placeholder: "есть, нет, грузовой" },
  parking: { label: "Парковка", placeholder: "во дворе, платная, шлагбаум" },
};

function focusFirst(keys: string[]) {
  const rank = (k: string) => (k.startsWith("lines.") ? -1 : ORDER.indexOf(groupOf(k)) === -1 ? 99 : ORDER.indexOf(groupOf(k)));
  for (const k of [...keys].sort((a, b) => rank(a) - rank(b))) {
    const el = document.querySelector<HTMLElement>(`[data-field="${k.startsWith("lines.") ? k : groupOf(k)}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
      return;
    }
  }
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="grid gap-4 rounded-panel border border-line bg-surface p-5">
      <div>
        <h2 className="text-[1.25rem] font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Checkout({ services, pricing, excluded }: { services: Service[]; pricing: PricingSettings; excluded: ExcludedItem[] }) {
  const router = useRouter();
  const ready = useCartReady();
  const { lines } = useCart();
  const draft = useDraft();
  // Значения полей живут в состоянии компонента (поле реагирует сразу, даже если ввод пришёл раньше подписки на хранилище),
  // а в черновик (localStorage) копируются при каждой правке. Форма показывается только после `ready`, поэтому чтение черновика здесь
  // не расходится с серверной разметкой.
  const [form, setForm] = useState<FormValues>(() => getDraft().form);
  const patchForm = (fn: (f: FormValues) => FormValues) => {
    const next = fn(form);
    setForm(next);
    draftUpdate((d) => ({ ...d, form: next }));
  };

  // Согласие не хранится в черновике: его нужно отметить осознанно при каждой отправке.
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [orderUrl, setOrderUrl] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState<boolean | null>(null);
  const sending = useRef(false);

  const snap = useMemo(() => cartSnapshot(services, pricing, lines, { urgent: form.urgent, outOfTown: form.outOfTown }), [services, pricing, lines, form.urgent, form.outOfTown]);
  const doneCount = draft.photos.filter((p) => p.status === "done").length;
  const payload = useMemo(() => buildPayload(form, lines, draft.photos, consent), [form, lines, draft.photos, consent]);
  const errors = useMemo(() => validateOrder(payload, lines, doneCount), [payload, lines, doneCount]);
  const hasManual = lines.some((l) => l.manual);
  const accessShown = accessOpen ?? Object.values(form.access).some(Boolean);
  const excludedHit = useMemo(() => excludedInText(excluded, form.comment), [excluded, form.comment]);

  const touch = (k: string) => setTouched((s) => (s.has(k) ? s : new Set(s).add(k)));
  const clearServer = (k: string) =>
    setServerErrors((s) => {
      if (!(k in s)) return s;
      const { [k]: _gone, ...rest } = s;
      void _gone;
      return rest;
    });
  const err = (k: string): string | undefined => serverErrors[k] ?? (attempted || touched.has(k) ? errors[k] : undefined);
  const accessErr = ["entrance", "intercom", "floor", "elevator", "parking"].map((a) => err(`access.${a}`)).find(Boolean);
  const lineErrors = Object.fromEntries(
    lines.flatMap((_, i) => {
      const m = err(`lines.${i}.description`) ?? err(`lines.${i}`);
      return m ? [[i, m]] : [];
    }),
  );
  const visibleCount = Object.keys({ ...errors, ...serverErrors }).filter((k) => err(k)).length;

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    patchForm((f) => ({ ...f, [k]: v }));
    clearServer(k);
  };
  const setAccess = (k: AccessField, v: string) => {
    patchForm((f) => ({ ...f, access: { ...f.access, [k]: v } }));
    clearServer(`access.${k}`);
  };
  const bind = (k: "name" | "phone" | "address" | "comment") => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set(k, e.target.value),
    onBlur: () => touch(k),
  });

  async function submit() {
    if (sending.current) return;
    setAttempted(true);
    setFormError(null);
    const keys = Object.keys(errors);
    if (draft.photos.some((p) => p.status === "uploading")) {
      setFormError("Дождитесь окончания загрузки фото и отправьте заявку снова.");
      focusFirst(["photos"]);
      return;
    }
    if (draft.photos.some((p) => p.status === "error")) {
      setFormError("Одно из фото не загрузилось: повторите загрузку или удалите его.");
      focusFirst(["photos"]);
      return;
    }
    if (keys.length) {
      if (keys.some((k) => k.startsWith("access."))) setAccessOpen(true);
      requestAnimationFrame(() => focusFirst(keys));
      return;
    }

    // Один Idempotency-Key на одно и то же тело: повтор после сбоя сети не создаст дубль. Тело изменилось — новый ключ.
    const attempt = nextAttempt(draft.submit, payload, uuid4);
    if (attempt !== draft.submit) draftUpdate((d) => ({ ...d, submit: attempt }));
    flushDraft(); // ключ должен пережить перезагрузку страницы посреди отправки

    sending.current = true;
    setPhase("sending");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string; code?: string; fields?: Record<string, string> } | null;

      // Успех — только по ответу сервера 201/200 (заявка уже записана в базу)
      if ((res.status === 201 || res.status === 200) && data?.url) {
        setOrderUrl(data.url);
        setPhase("done");
        cartClear();
        draftClear();
        router.push(data.url);
        return;
      }
      if (res.status >= 500) {
        setPhase("network");
        return;
      }
      setPhase("idle");
      if (res.status === 409) draftUpdate((d) => ({ ...d, submit: null }));
      if (data?.code === "photo_missing") {
        draftUpdate((d) => ({
          ...d,
          photos: d.photos.map((p) => ({ ...p, status: "error", ref: undefined, error: "Фото не найдено на сервере: срок хранения мог истечь. Удалите его и добавьте снова." })),
        }));
      }
      if (data?.fields) {
        setServerErrors(data.fields);
        if (Object.keys(data.fields).some((k) => k.startsWith("access."))) setAccessOpen(true);
        requestAnimationFrame(() => focusFirst(Object.keys(data.fields!)));
      }
      setFormError(
        res.status === 429
          ? "Слишком много попыток. Подождите немного и отправьте заявку снова."
          : (data?.error ?? "Не удалось отправить заявку. Проверьте поля и повторите."),
      );
    } catch {
      clearTimeout(timer);
      setPhase("network");
    } finally {
      sending.current = false;
    }
  }

  if (phase === "done") {
    return (
      <div className="mx-auto grid w-full max-w-[640px] justify-items-start gap-4 px-4 py-16" role="status">
        <h1 className="text-[1.75rem] font-semibold">Заявка отправлена</h1>
        <p className="text-muted">Открываем страницу заявки. Если она не открылась, нажмите кнопку.</p>
        {orderUrl && <ButtonLink href={orderUrl}>Открыть заявку</ButtonLink>}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8" aria-busy="true">
        <h1 className="text-[1.75rem] font-semibold">Оформление заявки</h1>
        <p className="mt-3 text-muted">Загружаем корзину…</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto grid w-full max-w-[640px] justify-items-start gap-4 px-4 py-16">
        <h1 className="text-[1.75rem] font-semibold">Корзина пуста</h1>
        <p className="max-w-[34ch] text-muted">Корзина пуста. Выберите категорию и добавьте работу — цена появится сразу.</p>
        <ButtonLink href="/">Выбрать работы</ButtonLink>
      </div>
    );
  }

  const slots = ["", ...TIME_SLOTS];
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-8 pt-6">
      <h1 className="text-[1.75rem] font-semibold min-[900px]:text-[2.25rem]">Оформление заявки</h1>
      <p className="mt-2 max-w-prose text-muted">Платить сейчас не нужно: мастер позвонит, уточнит детали и согласует цену и время.</p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-6 grid items-start gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="grid gap-6">
          <Section title="Как с вами связаться">
            <TextField id="f-name" label="Имя" autoComplete="name" error={err("name")} {...bind("name")} />
            <TextField
              id="f-phone"
              label="Телефон"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              spellCheck={false}
              hint="По нему мастер согласует выезд."
              placeholder="+7 900 000-00-00"
              error={err("phone")}
              {...bind("phone")}
            />
          </Section>

          <Section title="Куда приехать">
            <TextField id="f-address" label="Адрес" autoComplete="street-address" hint="Улица, дом, квартира." error={err("address")} {...bind("address")} />
            <details open={accessShown} onToggle={(e) => setAccessOpen(e.currentTarget.open)} className="group rounded-field border border-line">
              <summary data-field="access" className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-medium">
                <span>
                  Этаж и доступ <span className="ml-1 font-normal text-muted">необязательно</span>
                </span>
                <ChevronIcon className="size-5 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 px-4 pb-4 min-[480px]:grid-cols-2">
                {(Object.keys(ACCESS_LABELS) as AccessField[]).map((k) => (
                  <TextField
                    key={k}
                    id={`f-access-${k}`}
                    label={ACCESS_LABELS[k].label}
                    placeholder={ACCESS_LABELS[k].placeholder}
                    maxLength={40}
                    value={form.access[k]}
                    onChange={(e) => setAccess(k, e.target.value)}
                    error={err(`access.${k}`)}
                  />
                ))}
              </div>
              {accessErr && <p className="px-4 pb-3 text-[0.875rem] text-danger">{accessErr}</p>}
            </details>
            <CheckRow
              checked={form.outOfTown}
              onChange={(e) => set("outOfTown", e.target.checked)}
              title="Выезд за город"
              badge={`+${formatRub(pricing.outOfTownFee)}`}
              description="Фиксированная доплата за дорогу, если объект за городом."
            />
          </Section>

          <Section title="Когда удобно" hint="Это пожелание — мастер подтвердит запись после разговора.">
            <CheckRow
              checked={form.urgent}
              onChange={(e) => set("urgent", e.target.checked)}
              title="Срочный выезд"
              badge={`+${pricing.urgentPct}%`}
              description="Сегодня или в ближайшие часы. Процент добавляется к стоимости работ."
            />
            <TextField
              id="f-desiredDate"
              type="date"
              label="Желаемая дата"
              optional
              min={todayMoscow()}
              value={form.desiredDate}
              onChange={(e) => {
                const v = e.target.value;
                patchForm((f) => ({ ...f, desiredDate: v, desiredTime: v ? f.desiredTime : "" }));
                clearServer("desiredDate");
              }}
              onBlur={() => touch("desiredDate")}
              error={err("desiredDate")}
              suppressHydrationWarning
              className="min-[480px]:max-w-xs"
            />
            <fieldset disabled={!form.desiredDate} data-field="desiredTime" tabIndex={-1} className="grid gap-2">
              <legend className="mb-2 text-[0.9375rem] font-medium">
                Удобное время <span className="ml-1 font-normal text-muted">необязательно</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {slots.map((t) => (
                  <label key={t || "any"} className="cursor-pointer">
                    <input type="radio" name="desiredTime" value={t} checked={form.desiredTime === t} onChange={() => set("desiredTime", t)} className="peer sr-only" />
                    <span className="inline-flex min-h-12 items-center rounded-full border border-line bg-surface px-4 tabular-nums transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                      {t || "Любое"}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[0.8125rem] leading-snug text-muted">{form.desiredDate ? "Выберите окно или оставьте «Любое»." : "Сначала выберите дату — время нужно только вместе с ней."}</p>
              {err("desiredTime") && <p className="text-[0.875rem] text-danger">{err("desiredTime")}</p>}
            </fieldset>
          </Section>

          <Section title="Материалы и запчасти">
            <fieldset data-field="materials" tabIndex={-1} aria-describedby="f-materials-err" className="grid gap-2">
              <legend className="mb-2 text-[0.9375rem] font-medium">Кто их покупает</legend>
              {MATERIALS.map((m) => (
                <label
                  key={m}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-field border border-line bg-surface px-4 py-3 has-[:checked]:border-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="materials"
                    value={m}
                    checked={form.materials === m}
                    onChange={() => {
                      set("materials", m);
                      touch("materials");
                    }}
                    className="size-5 accent-(--accent)"
                  />
                  {MATERIALS_LABEL[m]}
                </label>
              ))}
              <div aria-live="polite" id="f-materials-err">
                {err("materials") && <p className="text-[0.875rem] text-danger">{err("materials")}</p>}
              </div>
            </fieldset>
            <p className="text-[0.8125rem] leading-snug text-muted">Цена в расчёте — только за работу. Материалы и запчасти оплачиваются отдельно.</p>
          </Section>

          <Section title="Фото места работы" hint={hasManual ? "Для задачи «Другое» нужно хотя бы одно фото." : "Необязательно, но помогает мастеру подготовиться."}>
            <PhotoField
              photos={draft.photos}
              required={hasManual}
              error={err("photos")}
              onChanged={() => {
                touch("photos");
                clearServer("photos");
              }}
            />
          </Section>

          <Section title="Комментарий">
            <TextArea id="f-comment" label="Что ещё важно знать мастеру" optional maxLength={1000} error={err("comment")} {...bind("comment")} />
            <ExcludedNote items={excludedHit} soft />
          </Section>

          <Section title="Согласие">
            <CheckRow
              id="f-consent"
              data-field="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                touch("consent");
              }}
              aria-invalid={!!err("consent")}
              aria-describedby={err("consent") ? "f-consent-err" : undefined}
              title={
                <>
                  Согласен на обработку персональных данных (
                  <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                    политика
                  </Link>
                  )
                </>
              }
              description="Имя, телефон и адрес нужны только для выезда и связи по заявке."
            />
            <div aria-live="polite">
              {err("consent") && (
                <p id="f-consent-err" className="-mt-2 text-[0.875rem] text-danger">
                  {err("consent")}
                </p>
              )}
            </div>
          </Section>
        </div>

        <aside className="grid gap-4 min-[900px]:sticky min-[900px]:top-[calc(var(--header-h)+1rem)]">
          <CheckoutSummary items={lines} snap={snap} pricing={pricing} lineErrors={lineErrors} />
          <div className="grid gap-3" aria-live="polite">
            {phase === "network" && (
              <Callout tone="error">
                Не удалось отправить: нет ответа от сервера. Заявка не потеряна, всё введённое сохранено. Нажмите «Повторить отправку»: дубль не создастся.
              </Callout>
            )}
            {formError && phase !== "network" && <Callout tone="error">{formError}</Callout>}
            {attempted && visibleCount > 0 && phase === "idle" && !formError && <Callout tone="error">Проверьте поля, отмеченные красным: без них заявку не отправить.</Callout>}
          </div>
          <Button type="submit" aria-disabled={phase === "sending"} className="w-full">
            {phase === "sending" ? "Отправляем…" : phase === "network" ? "Повторить отправку" : "Отправить заявку"}
          </Button>
          <p className="text-[0.8125rem] leading-snug text-muted">Онлайн-оплаты нет. Заявка не обязывает: итоговую цену и время вы согласуете с мастером по телефону.</p>
        </aside>
      </form>
    </div>
  );
}
