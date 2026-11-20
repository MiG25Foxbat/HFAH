import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { PUBLIC_PATHS, OFFICES_PATH, absoluteUrl } from "@/lib/seo";
import { getSettings } from "@/lib/server/settings";

// Только публичные страницы. Заявки (/o/…), кабинет, оформление и API в карту не попадают.
// «Для офисов» — только пока владелец не выключил работу с организациями (иначе страница отвечает «не найдено»), поэтому карта читает настройки на каждый запрос.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const { company } = await getSettings();
  const paths: string[] = [...PUBLIC_PATHS];
  if (company.orgsEnabled) paths.splice(2, 0, OFFICES_PATH);
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
