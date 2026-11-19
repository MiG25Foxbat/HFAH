// PNG posters -> WebP (alpha) + review contact sheets on light/dark backgrounds.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cats = ["furniture", "plumbing", "electric", "repair", "other"];
for (const c of cats) {
  const png = path.join(root, "posters", `${c}.png`);
  const webp = path.join(root, "posters", `${c}.webp`);
  await sharp(png).webp({ quality: 88, alphaQuality: 92, effort: 6 }).toFile(webp);
  console.log(c, "png", fs.statSync(png).size, "webp", fs.statSync(webp).size);
}
async function sheet(bg, name, size) {
  const tiles = await Promise.all(cats.map((c) => sharp(path.join(root, "posters", `${c}.png`)).resize(size, size).toBuffer()));
  const W = size * cats.length;
  await sharp({ create: { width: W, height: size, channels: 4, background: bg } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * size, top: 0 })))
    .png().toFile(path.join(root, "previews", name));
}
await sheet("#EEF0EB", "contact_sheet_light_200px.png", 200);
await sheet("#131714", "contact_sheet_dark_200px.png", 200);
await sheet("#EEF0EB", "contact_sheet_light_360px.png", 360);
// single flattened poster for close review
await sharp(path.join(root, "posters", "plumbing.png")).flatten({ background: "#EEF0EB" }).png().toFile(path.join(root, "previews", "_flat_plumbing.png"));
