// usage: node crop.mjs in.png out.png left top width height [scale]  -> crop + upscale for close review
import sharp from "sharp";
const [inp, out, l, t, w, h, sc = "3"] = process.argv.slice(2);
await sharp(inp).flatten({ background: "#EEF0EB" }).extract({ left: +l, top: +t, width: +w, height: +h }).resize(+w * +sc, +h * +sc, { kernel: "lanczos3" }).png().toFile(out);
