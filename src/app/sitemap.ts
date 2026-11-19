import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, absoluteUrl } from "@/lib/seo";

// Только публичные страницы. Заявки (/o/…), кабинет, оформление и API в карту не попадают.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: absoluteUrl(path) }));
}
