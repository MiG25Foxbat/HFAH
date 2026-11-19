import type { NextConfig } from "next";

// Приватные страницы и API не кешируются и не индексируются.
const noStore = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
// Токен заявки лежит в адресе /o/<токен>: не отдаём его в Referer внешним сайтам.
const noReferrer = { key: "Referrer-Policy", value: "no-referrer" };

// Частичная CSP без nonce: закрывает встраивание сайта во фрейм, плагины, подмену <base> и отправку форм на чужие адреса.
// script-src/default-src намеренно не заданы: инлайн-скрипт темы и скрипты Next потребовали бы nonce (см. docs/DECISIONS.md).
const csp = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");

const nextConfig: NextConfig = {
  // Параллельные dev-серверы в одной папке: NEXT_DIST_DIR=.next-a npx next dev -p 3001
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      { source: "/api/:path*", headers: noStore },
      { source: "/o/:path*", headers: [...noStore, noReferrer] },
      { source: "/admin/:path*", headers: [...noStore, noReferrer] },
      // service worker браузер перепроверяет при каждой загрузке: иначе обновление файла дойдёт до клиентов с задержкой
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
