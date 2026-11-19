import { contactLinks } from "@/components/site/contact-links";
import { absoluteUrl } from "@/lib/seo";
import { getShopData } from "@/lib/shop-data";

/**
 * Разметка schema.org для главной: компания, город, территория, контакты из настроек.
 * Пустые поля (телефон, почта, город) в разметку не попадают: незаполненное не выдаётся за настоящее.
 * Читает БД, поэтому рисуется внутри <Suspense>.
 */
export async function LocalBusinessJsonLd() {
  const { settings } = await getShopData();
  const { name, city, territory, accent, contacts } = settings.company;
  const links = contactLinks(contacts);
  const phone = links.find((l) => l.kind === "phone");
  const email = links.find((l) => l.kind === "email");
  const telegram = links.find((l) => l.kind === "telegram");

  const data = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": absoluteUrl("/#business"),
    name,
    url: absoluteUrl("/"),
    image: absoluteUrl("/og.png"),
    description: accent ? `Мастер на час. ${accent}` : "Мастер на час: сборка мебели, сантехника, электрика, мелкий ремонт.",
    ...(phone && { telephone: phone.text }),
    ...(email && { email: email.text }),
    ...(telegram && /^https?:/.test(telegram.href) && { sameAs: [telegram.href] }),
    ...(city && { address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "RU" } }),
    ...((territory || city) && { areaServed: territory || city }),
    knowsAbout: ["Сборка мебели", "Сантехника", "Электрика", "Мелкий ремонт"],
  };

  // «<» экранируем, чтобы данные из настроек не могли закрыть тег <script>
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}
