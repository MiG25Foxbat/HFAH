/**
 * Адрес сайта для sitemap, robots и JSON-LD. Берётся из APP_ORIGIN (как metadataBase в корневом layout).
 * Страницы без запросов к БД собираются заранее, поэтому APP_ORIGIN должен быть задан уже при `next build`.
 */
export const APP_ORIGIN = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").origin;

export const absoluteUrl = (path: string) => new URL(path, APP_ORIGIN).toString();

/** Публичные страницы для sitemap. */
export const PUBLIC_PATHS = ["/", "/uslugi", "/contacts", "/privacy", "/credits"] as const;
