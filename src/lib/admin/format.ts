/**
 * Даты и телефоны для кабинета. ЧИСТЫЙ модуль (сервер и браузер). Время — по Москве (UTC+3 круглый год, как в заявке):
 * без Intl, чтобы сервер и браузер выводили одинаково и гидратация не расходилась.
 */
const MSK_OFFSET_MS = 3 * 3600_000;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_SHORT = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const pad = (n: number) => String(n).padStart(2, "0");

function msk(date: Date) {
  const t = new Date(date.getTime() + MSK_OFFSET_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() };
}

const asDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));

/** «19 нояб., 14:05»; год добавляется, только если он не текущий. */
export function formatDateTime(value: Date | string, now: Date = new Date()): string {
  const p = msk(asDate(value));
  const year = p.y === msk(now).y ? "" : ` ${p.y}`;
  return `${p.d} ${MONTHS_SHORT[p.mo]}${year}, ${pad(p.h)}:${pad(p.mi)}`;
}

/** «19 ноября, чт, 14:05» — для согласованного времени выезда. */
export function formatDateTimeLong(value: Date | string): string {
  const p = msk(asDate(value));
  return `${p.d} ${MONTHS[p.mo]}, ${WEEKDAYS_SHORT[p.dow]}, ${pad(p.h)}:${pad(p.mi)}`;
}

/** «14:05» по Москве. */
export function formatClock(value: Date | string): string {
  const p = msk(asDate(value));
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** Календарная дата «YYYY-MM-DD» → «19 ноября, чт». */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${MONTHS[m - 1]}, ${WEEKDAYS_SHORT[dow]}`;
}

/** Значения для `<input type="date">` и `<input type="time">` (по Москве); пусто, если времени нет. */
export function toInputs(value: Date | string | null): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const p = msk(asDate(value));
  return { date: `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const isClock = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Московские дата и время → момент (Date) или null. */
export function fromInputs(date: string, time: string): Date | null {
  if (!isDay(date) || !isClock(time)) return null;
  return new Date(`${date}T${time}:00+03:00`);
}

/** «+79161234567» → «+7 916 123-45-67». Нераспознанное возвращается как есть. */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone;
}

/** Telegram: «@name», «name», «t.me/name», «https://t.me/name» → «@name» или null. */
export function normalizeTelegram(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([A-Za-z][A-Za-z0-9_]{4,31})\/?$/);
  return m ? `@${m[1]}` : null;
}
