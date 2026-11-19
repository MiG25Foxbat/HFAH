// Значок «Запросто»: синий квадрат, белая «з» и кольцо делений, как у подиума-рулетки на главной.
// Запуск: node scripts/make-icons.mjs  (нужен только sharp). Пишет public/icons/* и src/app/favicon.ico.
// Фирменные цвета — docs/DESIGN.md (светлая тема): --accent #2E57D1, --ply #D4B07C.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "icons");
const ACCENT = "#2E57D1";
const PLY = "#D4B07C";

/** Деления по кругу: каждое четвёртое длиннее. Координаты в системе 512 × 512 с центром (256, 256). */
function ticks() {
  const lines = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    const r1 = 212;
    const r2 = r1 - (long ? 26 : 14);
    const p = (r) => `${(256 + Math.sin(a) * r).toFixed(1)}`;
    const q = (r) => `${(256 - Math.cos(a) * r).toFixed(1)}`;
    lines.push(`<line x1="${p(r1)}" y1="${q(r1)}" x2="${p(r2)}" y2="${q(r2)}"/>`);
  }
  return `<g stroke="${PLY}" stroke-width="6" stroke-linecap="round">${lines.join("")}</g>`;
}

// Строчная «з» шрифта Unbounded 500 (знак на сайте набран им же), контур вынут из scripts/fonts/Unbounded[wght].ttf,
// поэтому значок не зависит от шрифтов в системе. Система координат глифа: 1000 на em, ось Y вверх; границы x 23…656, y −15…584.
const GLYPH =
  "M344 -15Q249 -15 178 10Q107 34 67 81Q27 127 23 190H185Q192 148 233 126Q274 104 344 104Q411 104 449 121Q486 139 486 176Q486 206 455 221Q423 235 354 235H248V335H351Q413 335 442 353Q472 371 472 398Q472 431 438 448Q403 465 345 465Q281 465 242 445Q203 425 196 385H35Q39 440 77 485Q115 530 184 557Q254 584 352 584Q439 584 504 563Q569 542 605 505Q641 468 641 420Q641 382 617 350Q594 318 543 299Q491 280 408 280V297Q527 302 592 268Q656 234 656 164Q656 113 620 72Q583 31 513 8Q443 -15 344 -15Z";
// Центр глифа в его координатах: x (23 + 656) / 2, y (−15 + 584) / 2.
const letter = (k) => `<path transform="translate(256 256) scale(${k} ${-k}) translate(-340 -284)" d="${GLYPH}" fill="#fff"/>`;

/**
 * kind: "any" — скруглённый квадрат с прозрачными углами; "full" — квадрат на весь холст (maskable и apple-touch:
 * система сама скругляет, прозрачность iOS заливает чёрным); "small" — как any, но без делений (читается в 16–48 px).
 * Для maskable содержимое уменьшено до безопасной зоны (круг радиусом 40 % стороны).
 */
function svg(kind) {
  const full = kind === "full" || kind === "maskable";
  const bg = full ? `<rect width="512" height="512" fill="${ACCENT}"/>` : `<rect width="512" height="512" rx="112" fill="${ACCENT}"/>`;
  const scale = kind === "maskable" ? 0.78 : 1;
  const inner = kind === "small" ? letter(0.52) : `${ticks()}${letter(0.42)}`;
  const g = scale === 1 ? inner : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${inner}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${bg}${g}</svg>`;
}

const png = (kind, size) => sharp(Buffer.from(svg(kind)), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO с PNG внутри (поддерживается всеми современными браузерами). */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...images.map((i) => i.data)]);
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "icon.svg"), svg("any") + "\n");
await writeFile(join(OUT, "icon-192.png"), await png("any", 192));
await writeFile(join(OUT, "icon-512.png"), await png("any", 512));
await writeFile(join(OUT, "icon-maskable-512.png"), await png("maskable", 512));
await writeFile(join(OUT, "apple-touch-icon.png"), await png("full", 180));
const favicon = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png("small", size) })));
await writeFile(join(ROOT, "src", "app", "favicon.ico"), ico(favicon));
console.log("Готово: public/icons/{icon.svg,icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png}, src/app/favicon.ico");
