import "server-only";
import { sql } from "./db";
import { settingsSchema, settingsSectionSchemas, type Settings, type SettingsSectionName } from "@/lib/settings";

/** Настройки компании (одна строка). Разделы проверяются zod: битый jsonb не пройдёт молча. */
export async function getSettings(): Promise<Settings> {
  const [row] = await sql`select company, pricing, game, characters from settings where id = 1`;
  if (!row) throw new Error("Настройки не найдены: выполните npm run db:migrate && npm run db:seed");
  return settingsSchema.parse(row);
}

/** Сохраняет один раздел (company | pricing | game | characters) после проверки. Бросает ZodError при неверных данных. */
export async function updateSettingsSection<K extends SettingsSectionName>(section: K, value: unknown): Promise<Settings[K]> {
  const parsed = settingsSectionSchemas[section].parse(value) as Settings[K];
  await sql`update settings set ${sql(section)} = ${sql.json(parsed as never)} where id = 1`;
  return parsed;
}
