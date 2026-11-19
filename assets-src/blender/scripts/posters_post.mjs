// PNG posters -> WebP (alpha) + review contact sheets on light/dark backgrounds.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cats = ["furniture", "plumbing", "electric", "repair", "other", "appliances"];
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
// flattened posters on the light page colour for close review (1024 px)
for (const c of cats) await sharp(path.join(root, "posters", `${c}.png`)).flatten({ background: "#EEF0EB" }).png().toFile(path.join(root, "previews", `_flat_${c}.png`));
// blink close-ups and hand close-ups (rest / mid-wave) of all six, light background
async function row(files, size, bg, name) {
  const tiles = await Promise.all(files.map((f) => sharp(path.join(root, "previews", f)).resize(size, size).flatten({ background: bg }).toBuffer()));
  return { input: await sharp({ create: { width: size * files.length, height: size, channels: 3, background: bg } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * size, top: 0 }))).png().toBuffer(), name };
}
{
  const bg = "#EEF0EB";
  const blink = await row(cats.map((c) => `${c}_blink_f3_closeup.png`), 320, bg);
  await sharp(blink.input).toFile(path.join(root, "previews", "blink_closeups_sheet.png"));
  const rest = await row(cats.map((c) => `${c}_hand_rest_closeup.png`), 320, bg);
  const wave = await row(cats.map((c) => `${c}_hand_wave_closeup.png`), 320, bg);
  await sharp({ create: { width: 320 * cats.length, height: 640, channels: 3, background: bg } })
    .composite([{ input: rest.input, left: 0, top: 0 }, { input: wave.input, left: 0, top: 320 }])
    .png().toFile(path.join(root, "previews", "hands_closeups_sheet.png"));
}
