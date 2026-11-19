// Картинка для соцсетей: public/og.png, 1200 × 630. Знак «запросто», подпись и персонаж на подиуме-рулетке.
// Запуск: node scripts/make-og.mjs  (нужен только sharp). Шрифты Unbounded и Golos Text (SIL OFL 1.1) лежат в scripts/fonts/:
// sharp рисует текст через Pango и берёт шрифт из файла, поэтому результат одинаков на любой машине.
// Цвета — docs/DESIGN.md (светлая тема). Персонаж — public/posters/other.webp (ящик с инструментами, фирменный синий).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = join(ROOT, "scripts", "fonts");
const W = 1200;
const H = 630;
const INK = "#1C231F";
const MUTED = "#5B655E";
const PLY = "#D4B07C";

/** Текст как PNG с прозрачным фоном. size — высота шрифта в пикселях (72 dpi: 1 пт = 1 px). */
async function text(markup, { font, file, size, width, tall = false }) {
  // У Unbounded строка в Pango получается ниже самих букв: хвостик «р» обрезается. Вторая (пустая) строка даёт запас, лишнее срезаем.
  const { data, info } = await sharp({
    text: { text: tall ? markup.replace("</span>", "\n </span>") : markup, font: `${font} ${size}`, fontfile: join(FONTS, file), dpi: 72, rgba: true, ...(width ? { width, wrap: "word" } : {}) },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  if (!tall) return { data, info };
  const height = Math.min(info.height, Math.round(size * 1.4));
  return { data: await sharp(data).extract({ left: 0, top: 0, width: info.width, height }).png().toBuffer(), info: { ...info, height } };
}
const unbounded = (markup, size) => text(markup, { font: "Unbounded", file: "Unbounded[wght].ttf", size, tall: true });
const golos = (markup, size, width) => text(markup, { font: "Golos Text", file: "GolosText[wght].ttf", size, width });

// Подиум: круг и деления по краю (как кольцо рулетки на главной).
const CX = 912;
const CY = 322;
const R = 216;
const ticks = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const long = i % 6 === 0;
  const r1 = R + 14;
  const r2 = r1 + (long ? 22 : 12);
  return `<line x1="${(CX + Math.sin(a) * r1).toFixed(1)}" y1="${(CY - Math.cos(a) * r1).toFixed(1)}" x2="${(CX + Math.sin(a) * r2).toFixed(1)}" y2="${(CY - Math.cos(a) * r2).toFixed(1)}"/>`;
}).join("");
const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#EEF0EB"/>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="#E3E6DF"/>
  <g stroke="${PLY}" stroke-width="4" stroke-linecap="round">${ticks}</g>
</svg>`;

const poster = await sharp(join(ROOT, "public", "posters", "other.webp")).resize(460, 460).toBuffer();
const mark = await unbounded(`<span foreground="${INK}" weight="500">запросто</span>`, 96);
const lead = await unbounded(`<span foreground="${INK}" weight="500">Мастер на час</span>`, 40);
const sub = await golos(`<span foreground="${MUTED}" weight="400">Мебель, сантехника, электрика,
бытовая техника, ремонт.
Цена за работу видна сразу.</span>`, 28);

// Высота текстовой картинки не равна высоте букв (запас снизу), поэтому отступы заданы числами: знак 62 px (без хвостика «р»), подпись 30 px.
const left = 76;
const top = 186;
await sharp(Buffer.from(base))
  .composite([
    { input: poster, left: CX - 230, top: CY - 235 },
    { input: mark.data, left, top },
    { input: lead.data, left, top: top + 112 },
    { input: sub.data, left, top: top + 112 + 30 + 34 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(join(ROOT, "public", "og.png"));
console.log("Готово: public/og.png", `${W}x${H}`);
