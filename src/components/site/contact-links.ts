import type { Company } from "@/lib/settings";

export interface ContactLink {
  kind: "phone" | "telegram" | "whatsapp" | "email";
  label: string;
  /** Как показать человеку. */
  text: string;
  href: string;
}

/**
 * Рабочие каналы связи из настроек компании. Пустые поля пропускаются: пустой контакт не выдаём за настоящий,
 * если ни одного канала нет — список пуст.
 */
export function contactLinks(contacts: Company["contacts"]): ContactLink[] {
  const out: ContactLink[] = [];
  const phone = contacts.phone.trim();
  if (phone) out.push({ kind: "phone", label: "Телефон", text: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  const tg = contacts.telegram.trim();
  if (tg) out.push({ kind: "telegram", label: "Telegram", text: tg, href: /^https?:\/\//.test(tg) ? tg : `https://t.me/${tg.replace(/^@/, "")}` });
  const wa = contacts.whatsapp.trim();
  if (wa) out.push({ kind: "whatsapp", label: "WhatsApp", text: wa, href: /^https?:\/\//.test(wa) ? wa : `https://wa.me/${wa.replace(/\D/g, "")}` });
  const mail = contacts.email.trim();
  if (mail) out.push({ kind: "email", label: "Почта", text: mail, href: `mailto:${mail}` });
  return out;
}
