/** Тарифы, настройки компании и сеансы: запись из кабинета. Изменения прайса действуют только на НОВЫЕ заявки (старые хранят снимок). */
import "server-only";
import { sql } from "../db";
import { CatalogError, updateService } from "../services";
import { updateSettingsSection } from "../settings";
import type { PricingKind } from "@/lib/catalog";
import { parseServiceForm } from "@/lib/admin/catalog-forms";
import { parseCharactersForm, parseCompanyForm, parseGameForm, parsePricingForm, type ActionResult } from "@/lib/admin/schemas";

/**
 * Цена, норма, демонтаж, активность, памятка, а также название, описание, категория и «для офиса» одной работы.
 * Цена и норма — только у работ с фиксированной ценой.
 */
export async function saveService(id: string, values: unknown): Promise<ActionResult> {
  const [row] = await sql<{ pricing: PricingKind }[]>`select pricing from services where id = ${String(id).slice(0, 80)}`;
  if (!row) return { ok: false, error: "Работа не найдена. Обновите страницу." };
  const parsed = parseServiceForm(values, row.pricing);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  try {
    if (!(await updateService(id, parsed.data))) return { ok: false, error: "Работа не найдена. Обновите страницу." };
  } catch (e) {
    if (e instanceof CatalogError) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true, message: "Сохранено. Новые заявки считаются по этим данным." };
}

const SECTION_MESSAGE = {
  pricing: "Сохранено. Новые заявки считаются по этим ценам, старые не меняются.",
  company: "Сохранено.",
  game: "Сохранено.",
  characters: "Сохранено.",
} as const;

/** Раздел настроек: pricing | company | game | characters. Проверка — та же, что в форме; сохранение — через zod раздела. */
export async function saveSection(section: keyof typeof SECTION_MESSAGE, values: unknown): Promise<ActionResult> {
  const parsed =
    section === "pricing"
      ? parsePricingForm(values)
      : section === "company"
        ? parseCompanyForm(values)
        : section === "game"
          ? parseGameForm(values)
          : section === "characters"
            ? parseCharactersForm(values)
            : null;
  if (!parsed) return { ok: false, error: "Неизвестный раздел." };
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  await updateSettingsSection(section, parsed.data);
  return { ok: true, message: SECTION_MESSAGE[section] };
}

/** Закрывает все сеансы владельца (кроме того, что создаст вызывающий после этого). */
export async function destroyAllSessions(): Promise<void> {
  await sql`delete from sessions`;
}
