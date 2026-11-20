"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExcludedNote } from "@/components/shop/ExcludedNote";
import { Button, ButtonLink, Callout, CheckRow, TextArea, TextField } from "@/components/ui/controls";
import { ChevronIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/Segmented";
import { cartSnapshot } from "@/lib/cart";
import { cartClear, useCart, useCartReady } from "@/lib/cart-store";
import type { Service } from "@/lib/catalog";
import { buildPayload, nextAttempt, validateOrder, type AccessField, type FormValues } from "@/lib/checkout";
import { draftClear, draftUpdate, flushDraft, getDraft, useDraft } from "@/lib/draft-store";
import { MATERIALS, MATERIALS_LABEL, TIME_SLOTS, todayMoscow, type ClientType } from "@/lib/order-schema";
import { formatRub, type PricingSettings } from "@/lib/pricing";
import { excludedInText } from "@/lib/shop";
import type { ExcludedItem } from "@/lib/settings";
import { uuid4 } from "@/lib/uuid";
import { CheckoutSummary } from "./CheckoutSummary";
import { PhotoField } from "./PhotoField";

const ORDER = ["clientType", "orgName", "orgInn", "name", "phone", "address", "access", "materials", "desiredDate", "desiredTime", "photos", "comment", "consent"];
const groupOf = (key: string) => (key.startsWith("access.") ? "access" : key);
const SEND_TIMEOUT_MS = 25_000;

type Phase = "idle" | "sending" | "network" | "done";

const CLIENT_OPTIONS: readonly { value: ClientType; label: string }[] = [
  { value: "person", label: "Частное лицо" },
  { value: "organization", label: "Организация" },
];

/** Настройки организаций из кабинета + `preselect` (пришли со страницы «Для офисов»: сразу выбрана организация). */
export interface CheckoutOrgs {
  enabled: boolean;
  invoice: boolean;
  note: string;
  preselect: boolean;
}

const ORGS_OFF_MESSAGE = "Сейчас заявки от организаций не принимаются. Мы выбрали «Частное лицо»: проверьте данные и отправьте заявку снова.";

const ACCESS_LABELS: Record<AccessField, { label: string; placeholder: string }> = {
  entrance: { label: "Подъезд", placeholder: "например, 2" },
  intercom: { label: "Домофон", placeholder: "код или как позвонить" },
  floor: { label: "Этаж", placeholder: "например, 5" },
  elevator: { label: "Лифт", placeholder: "есть, нет, грузовой" },
  parking: { label: "Парковка", placeholder: "во дворе, платная, шлагбаум" },
};

/** Фокус на первое поле с ошибкой. Если ошибка в свёрнутом блоке «Этаж и доступ», блок сначала раскрывается (нужен кадр на отрисовку). */
function focusErrors(keys: string[], openAccess: () => void) {
  if (keys.some((k) => k.startsWith("access."))) {
    openAccess();
    requestAnimationFrame(() => focusFirst(keys));
  } else {
    focusFirst(keys);
  }
}

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

export function Checkout({ services, pricing, excluded, orgs }: { services: Service[]; pricing: PricingSettings; excluded: ExcludedItem[]; orgs: CheckoutOrgs }) {
  const router = useRouter();
  const ready = useCartReady();
  const { lines } = useCart();
  const draft = useDraft();
  // Значения полей живут в состоянии компонента (поле реагирует сразу, даже если ввод пришёл раньше подписки на хранилище),
  // а в черновик (localStorage) копируются при каждой правке. Форма показывается только после `ready`, поэтому чтение черновика здесь
  // не расходится с серверной разметкой.
  const [form, setForm] = useState<FormValues>(() => {
    const f = getDraft().form;
    return orgs.preselect && orgs.enabled ? { ...f, clientType: "organization" } : f;
  });
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

  // Организации: раздел мог быть выключен владельцем (в том числе, пока форма была открыта) — тогда остаётся «Частное лицо».
  const reduce = useReducedMotion();
  const [orgsOff, setOrgsOff] = useState(false);
  const orgsOn = orgs.enabled && !orgsOff;
  const org = orgsOn && form.clientType === "organization";
  const sent = useMemo<FormValues>(() => (org ? { ...form, wantsInvoice: orgs.invoice && form.wantsInvoice } : { ...form, clientType: "person" }), [form, org, orgs.invoice]);

  // ссылка «Оформить заявку» со страницы «Для офисов»: выбор запоминаем в черновике и убираем параметр из адреса
  useEffect(() => {
    if (!orgs.preselect) return;
    if (orgs.enabled) draftUpdate((d) => (d.form.clientType === "organization" ? d : { ...d, form: { ...d.form, clientType: "organization" } }));
    const url = new URL(window.location.href);
    url.searchParams.delete("client");
    window.history.replaceState(null, "", url);
  }, [orgs.preselect, orgs.enabled]);

  const snap = useMemo(() => cartSnapshot(services, pricing, lines, { urgent: form.urgent, outOfTown: form.outOfTown }), [services, pricing, lines, form.urgent, form.outOfTown]);
  const doneCount = draft.photos.filter((p) => p.status === "done").length;
  const payload = useMemo(() => buildPayload(sent, lines, draft.photos, consent), [sent, lines, draft.photos, consent]);
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
  // у организации поля называются иначе («Контактное лицо», «Адрес офиса»), и сообщения об ошибке тоже
  const orgWording = (k: string, m: string | undefined) =>
    !org || !m
      ? m
      : k === "name" && m.startsWith("Укажите имя")
        ? "Укажите контактное лицо — как к вам обращаться"
        : k === "address" && m.startsWith("Укажите адрес")
          ? "Укажите адрес офиса: улица, дом, офис"
          : m;
  const err = (k: string): string | undefined => orgWording(k, serverErrors[k] ?? (attempted || touched.has(k) ? errors[k] : undefined));
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
  const bind = (k: "name" | "phone" | "address" | "comment" | "orgName" | "orgInn") => ({
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
      focusErrors(keys, () => setAccessOpen(true));
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
      // организации выключили, пока форма была открыта: возвращаем «Частное лицо» (у этой ошибки нет поля, она идёт общим сообщением)
      const { clientType: orgsOffError, ...fieldErrors } = data?.fields ?? {};
      if (orgsOffError) {
        setOrgsOff(true);
        patchForm((f) => ({ ...f, clientType: "person" }));
      }
      if (data?.fields) {
        setServerErrors(fieldErrors);
        // сообщения у полей появятся после отрисовки: фокус переносим на следующем кадре
        requestAnimationFrame(() => focusErrors(Object.keys(fieldErrors), () => setAccessOpen(true)));
      }
      setFormError(
        orgsOffError
          ? ORGS_OFF_MESSAGE
          : res.status === 429
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
          {orgsOn && (
            <Section title="Кто заказывает">
              <Segmented
                name="clientType"
                legend="Кто заказывает"
                value={sent.clientType}
                options={CLIENT_OPTIONS}
                onChange={(v) => {
                  set("clientType", v);
                  if (v === "person") clearServer("orgName");
                }}
              />
              {org && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  className="grid gap-4"
                >
                  <TextField id="f-orgName" label="Название организации" autoComplete="organization" maxLength={120} error={err("orgName")} {...bind("orgName")} />
                  <TextField
                    id="f-orgInn"
                    label="ИНН"
                    optional
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={14}
                    hint="10 цифр у организации, 12 у ИП."
                    error={err("orgInn")}
                    className="tabular-nums min-[480px]:max-w-xs"
                    {...bind("orgInn")}
                  />
                  {orgs.invoice && (
                    <CheckRow
                      checked={form.wantsInvoice}
                      onChange={(e) => set("wantsInvoice", e.target.checked)}
                      title="Нужен счёт и закрывающие документы"
                      description="Детали оплаты мастер уточнит по телефону."
                    />
                  )}
                  {orgs.note && <p className="max-w-prose whitespace-pre-line text-[0.9375rem] leading-snug text-muted">{orgs.note}</p>}
                </motion.div>
              )}
            </Section>
          )}

          <Section title="Как с вами связаться">
            <TextField id="f-name" label={org ? "Контактное лицо" : "Имя"} autoComplete="name" error={err("name")} {...bind("name")} />
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
            <TextField
              id="f-address"
              label={org ? "Адрес офиса" : "Адрес"}
              autoComplete="street-address"
              hint={org ? "Улица, дом, офис." : "Улица, дом, квартира."}
              error={err("address")}
              {...bind("address")}
            />
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
              description={
                org
                  ? "Контактное лицо, телефон, адрес офиса, название и ИНН организации нужны только для выезда и связи по заявке."
                  : "Имя, телефон и адрес нужны только для выезда и связи по заявке."
              }
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
