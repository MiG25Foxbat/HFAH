import type { MetadataRoute } from "next";

// Цвета — светлая тема из docs/DESIGN.md (--bg). Значки собирает scripts/make-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Запросто — мастер на час",
    short_name: "Запросто",
    description: "Мастер на час: сборка мебели, сантехника, электрика, мелкий ремонт, бытовая техника. Для дома и офиса. Цена за работу видна сразу.",
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EEF0EB",
    theme_color: "#EEF0EB",
    categories: ["business", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
