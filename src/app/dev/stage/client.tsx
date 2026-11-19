"use client";
import { useState } from "react";
import { CATEGORIES, type CategoryId } from "@/lib/catalog";
import type { Settings } from "@/lib/settings";
import { Stage } from "@/components/stage";

type Personality = Settings["characters"]["personality"];

export function StageDev() {
  const [category, setCategory] = useState<CategoryId>("furniture");
  const [personality, setPersonality] = useState<Personality>("calm");
  const [facesEnabled, setFaces] = useState(true);
  const [phrasesEnabled, setPhrases] = useState(true);

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-3 text-xl font-semibold">Стенд сцены (dev)</h1>
      <Stage category={category} characters={{ personality, facesEnabled, phrasesEnabled }} className="h-[44vh] min-h-[320px]" />
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`cat-${c.id}`}
            aria-pressed={c.id === category}
            onClick={() => setCategory(c.id)}
            className="h-12 rounded-full border border-line px-4 aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-ink"
          >
            {c.title}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" data-testid="faces" checked={facesEnabled} onChange={(e) => setFaces(e.target.checked)} /> Лица
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" data-testid="phrases" checked={phrasesEnabled} onChange={(e) => setPhrases(e.target.checked)} /> Реплики
        </label>
        <select data-testid="personality" value={personality} onChange={(e) => setPersonality(e.target.value as Personality)} className="h-12 rounded-[14px] border border-line bg-surface px-3">
          <option value="calm">Спокойный</option>
          <option value="cheerful">Весёлый</option>
          <option value="business">Деловой</option>
        </select>
      </div>
      {/* Длинный текст: проверка прокрутки страницы свайпом над сценой на телефоне. */}
      {Array.from({ length: 24 }, (_, i) => (
        <p key={i} className="mt-4 text-muted">
          Заполнитель страницы {i + 1}: нужен, чтобы страница прокручивалась и можно было проверить вертикальный свайп над сценой.
        </p>
      ))}
    </main>
  );
}
