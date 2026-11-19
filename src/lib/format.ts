/** Форматирование для клиентского интерфейса. Без ICU: одинаковый вывод на сервере и в браузере (нет ошибок гидратации). */

const NBSP = " ";

/** 1 работа, 2 работы, 5 работ. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const i = Math.abs(Math.trunc(n)) % 100;
  const j = i % 10;
  if (i > 10 && i < 20) return forms[2];
  if (j === 1) return forms[0];
  if (j >= 2 && j <= 4) return forms[1];
  return forms[2];
}

export const worksCount = (n: number) => `${n}${NBSP}${plural(n, ["работа", "работы", "работ"])}`;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const two = (n: number) => String(n).padStart(2, "0");

/** ISO-момент → «19 ноября, 14:32» по Москве (UTC+3 круглый год). */
export function formatMoscow(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** ISO-момент → «14:32:05» по времени браузера (для «Обновлено …»). */
export function formatClock(date: Date): string {
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** «2026-11-20» → «20 ноября, чт». */
export function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${MONTHS[m - 1]}, ${WEEKDAYS[wd]}`;
}
