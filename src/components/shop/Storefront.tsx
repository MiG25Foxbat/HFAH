"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "@/components/stage";
import { TextField } from "@/components/ui/controls";
import { SearchIcon } from "@/components/ui/icons";
import type { CategoryId, Service } from "@/lib/catalog";
import type { PricingSettings } from "@/lib/pricing";
import { excludedInQuery, searchServices } from "@/lib/shop";
import type { ShopGroup } from "@/lib/shop-data";
import type { Characters, ExcludedItem } from "@/lib/settings";
import { openCart } from "@/lib/ui-store";
import { AddSheet } from "./AddSheet";
import { ExcludedList, ExcludedNote } from "./ExcludedNote";
import { MATERIALS_NOTE } from "./PriceSummary";
import { CartBar, ServiceRow } from "./ServiceRow";

interface Props {
  groups: ShopGroup[];
  pricing: PricingSettings;
  excluded: ExcludedItem[];
  characters: Characters;
  slogan: string;
  /** Раздел «Для офисов» включён владельцем: на него ведёт тихая ссылка под строкой поиска. */
  orgsEnabled: boolean;
  initialCategory: CategoryId;
  /** Работа, чьё окно настройки открыть сразу (ссылка с /uslugi: ?add=<id>). */
  initialAdd: string | null;
  /** ?cart=1 — открыть корзину (ссылка «в корзину» с других страниц). */
  initialCart: boolean;
}

export function Storefront({ groups, pricing, excluded, characters, slogan, orgsEnabled, initialCategory, initialAdd, initialCart }: Props) {
  const all = useMemo(() => groups.flatMap((g) => g.services), [groups]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const stageCategories = useMemo(() => groups.map(({ id, color, character }) => ({ id, color, character })), [groups]);
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);

  // состояние берётся из адреса при приходе на страницу (в том числе по ссылке с другой страницы) и дальше живёт в браузере
  const propsKey = `${initialCategory}|${initialAdd ?? ""}|${initialCart}`;
  const addService = initialAdd ? byId.get(initialAdd) : undefined;
  const [seen, setSeen] = useState(propsKey);
  const [category, setCategory] = useState<CategoryId>(addService?.category ?? initialCategory);
  // выбранная категория могла скрыться или быть удалена: тогда показываем первую
  const current = groupById.get(category) ?? groups[0];
  const [adding, setAdding] = useState<Service | null>(addService ?? null);
  const [query, setQuery] = useState("");
  if (seen !== propsKey) {
    setSeen(propsKey);
    setCategory(addService?.category ?? initialCategory);
    setAdding(addService ?? null);
  }

  // одноразовые параметры (?add, ?cart) убираем из адреса, ?c оставляем
  useEffect(() => {
    if (!initialAdd && !initialCart) return;
    if (initialCart) openCart();
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    url.searchParams.delete("cart");
    window.history.replaceState(null, "", url);
  }, [propsKey, initialAdd, initialCart]);

  const selectCategory = (id: CategoryId) => {
    setCategory(id);
    setQuery("");
    const url = new URL(window.location.href);
    url.searchParams.set("c", id);
    window.history.replaceState(null, "", url);
  };

  const results = useMemo(() => searchServices(all, query, (id) => groupById.get(id)?.title ?? id), [all, query, groupById]);
  const excludedHit = useMemo(() => excludedInQuery(excluded, query), [excluded, query]);
  const searching = query.trim().length > 0;

  // выбранный чип всегда виден: при заходе по ссылке с ?c= и при смене категории ряд прокручивается к нему (без прокрутки страницы)
  const chipsRef = useRef<HTMLDivElement>(null);
  const currentId = current?.id;
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!row || !chip) return;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [currentId, searching]);

  if (!current) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-6 pt-5">
        <h1 className="font-display text-[clamp(1.625rem,5vw,3rem)] leading-[1.15]">Мастер на час</h1>
        <p className="mt-4 text-muted">Прайс скоро появится: компания ещё не добавила работы.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-6 min-[900px]:grid min-[900px]:grid-cols-[5fr_7fr] min-[900px]:gap-10">
      <div className="min-[900px]:sticky min-[900px]:top-[calc(var(--header-h)+1rem)] min-[900px]:h-[calc(100dvh-var(--header-h)-2rem)] min-[900px]:self-start">
        <div className="relative h-[44vh] min-h-[260px] overflow-hidden rounded-panel bg-surface-2 min-[900px]:h-full">
          <Stage category={current} categories={stageCategories} characters={characters} className="size-full" />
        </div>
      </div>

      <div className="min-w-0">
        <div className="pt-5 min-[900px]:pt-2">
          <h1 className="font-display text-[clamp(1.625rem,5vw,3rem)] leading-[1.15]">Мастер на час</h1>
          {slogan && <p className="mt-2 hidden max-w-prose text-muted min-[900px]:block">{slogan}</p>}
        </div>

        <div className="sticky top-(--header-h) z-20 -mx-4 mt-3 bg-bg/90 px-4 py-2 backdrop-blur">
          <div ref={chipsRef} role="group" aria-label="Категории работ" className="chips-row relative -mx-4 flex snap-x gap-2 overflow-x-auto px-4 min-[900px]:pb-1.5">
            {groups.map((c) => {
              const active = c.id === current.id && !searching;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectCategory(c.id)}
                  className={`inline-flex min-h-12 shrink-0 snap-start items-center gap-2 rounded-full border px-4 font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${
                    active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2"
                  }`}
                >
                  <span aria-hidden="true" className="size-3 rounded-full ring-2 ring-surface" style={{ background: c.color }} />
                  {c.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          <div className="relative">
            <TextField
              id="f-search"
              type="search"
              label={<span className="sr-only">Найти работу</span>}
              placeholder="Например, смеситель…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              className="pl-11"
            />
            <SearchIcon className="pointer-events-none absolute left-3.5 top-3.5 size-5 text-muted" />
          </div>
          <p className="text-[0.9375rem] leading-snug text-muted">
            {MATERIALS_NOTE}
            {orgsEnabled && (
              <>
                {" "}
                Заказываете для офиса? <Link href="/dlya-ofisov" className="underline decoration-muted/60 underline-offset-4 hover:decoration-current">Работы для офисов</Link>.
              </>
            )}
          </p>
          {searching && <ExcludedNote items={excludedHit} />}
        </div>

        <div className="mt-2">
          {searching ? (
            <section aria-label="Результаты поиска">
              <h2 aria-live="polite" className="pt-3 text-[1.125rem] font-semibold">
                {results.length ? `Найдено: ${results.length}` : "Ничего не найдено"}
              </h2>
              {results.length === 0 && !excludedHit.length && (
                <p className="mt-1 text-muted">Попробуйте другое слово или выберите категорию. Нестандартную работу можно описать в разделе «Другое».</p>
              )}
              <ul className="divide-y divide-line">
                {results.map((s) => (
                  <ServiceRow key={s.id} s={s} pricing={pricing} category={groupById.get(s.category)} onAdd={() => setAdding(s)} />
                ))}
              </ul>
            </section>
          ) : null}

          {groups.map((g) => (
            <section key={g.id} id={`c-${g.id}`} hidden={searching || g.id !== current.id} aria-labelledby={`h-${g.id}`}>
              <h2 id={`h-${g.id}`} className="flex items-center gap-3 pt-3 text-[1.625rem] font-semibold max-[899px]:sr-only">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ background: g.color }} />
                {g.title}
              </h2>
              <ul className="divide-y divide-line">
                {g.services.map((s) => (
                  <ServiceRow key={s.id} s={s} pricing={pricing} onAdd={() => setAdding(s)} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-6">
          <ExcludedList items={excluded} />
        </div>
        <CartBar services={all} pricing={pricing} />
      </div>

      <AddSheet service={adding} pricing={pricing} excluded={excluded} onClose={() => setAdding(null)} />
    </div>
  );
}
