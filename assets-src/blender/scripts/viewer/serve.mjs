// Tiny static server for the GLB check page. POST /save?name=x.png (body = dataURL) writes previews/x.png.
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json", ".png": "image/png" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "POST" && u.pathname === "/save") {
    let b = ""; req.on("data", (c) => (b += c)).on("end", () => {
      const name = path.basename(u.searchParams.get("name") || "shot.png");
      fs.writeFileSync(path.join(root, "previews", name), Buffer.from(b.split(",")[1], "base64")); res.end("ok");
    }); return;
  }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end("nf"); }
  res.setHeader("Content-Type", types[path.extname(f)] || "application/octet-stream"); fs.createReadStream(f).pipe(res);
}).listen(8766, "127.0.0.1", () => console.log("serving", root));
