import type { NextConfig } from "next";

// Приватные страницы и API не кешируются и не индексируются.
const noStore = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
// Токен заявки лежит в адресе /o/<токен>: не отдаём его в Referer внешним сайтам.
const noReferrer = { key: "Referrer-Policy", value: "no-referrer" };

const nextConfig: NextConfig = {
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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      { source: "/api/:path*", headers: noStore },
      { source: "/o/:path*", headers: [...noStore, noReferrer] },
      { source: "/admin/:path*", headers: [...noStore, noReferrer] },
    ];
  },
};

export default nextConfig;
