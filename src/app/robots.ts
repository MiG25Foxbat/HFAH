import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

// «/o/» с косой чертой в конце: иначе под запрет попала бы и страница /offline.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/o/", "/api/", "/checkout", "/dev/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
