import type { Metadata, Viewport } from "next";
import { Golos_Text, Unbounded } from "next/font/google";
import { SwRegister } from "@/components/pwa/SwRegister";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./client.css";

// UI — Golos Text; Unbounded 500 только для словесного знака и H1 главной (docs/DESIGN.md)
const golos = Golos_Text({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-golos",
  display: "swap",
});
const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: "500",
  variable: "--font-unbounded",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: { default: "Запросто — мастер на час", template: "%s — Запросто" },
  description: "Мастер на час: сборка мебели, сантехника, электрика, мелкий ремонт. Цены за работу видны сразу.",
  openGraph: {
    locale: "ru_RU",
    type: "website",
    siteName: "Запросто",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Запросто — мастер на час. Ящик с инструментами с улыбкой на подиуме-рулетке" }],
  },
  twitter: { card: "summary_large_image" },
  // значки собирает scripts/make-icons.mjs; /favicon.ico подхватывается из src/app/favicon.ico
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: "Запросто" },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0eb" },
    { media: "(prefers-color-scheme: dark)", color: "#131714" },
  ],
};

// Корневой макет — только <html>, шрифты, тема и стили. Каркас сайта (шапка, подвал, корзина) — в src/app/(site)/layout.tsx,
// у кабинета (/admin) свой каркас. Публичные страницы лежат в группе (site).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: инлайн-скрипт ставит data-theme до гидратации
    <html lang="ru" className={`${golos.variable} ${unbounded.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
