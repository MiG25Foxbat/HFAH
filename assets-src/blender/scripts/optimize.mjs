// Raw GLBs (export/) -> optimised GLBs (optimized/) with gltf-transform, keeping node names and clips.
// No flatten/join/palette (they would merge or rename nodes). meshopt last (it quantises + compresses).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cli = path.join(here, "node_modules", "@gltf-transform", "cli", "bin", "cli.js");
const tmp = path.join(here, "_tmp");
fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(path.join(root, "optimized"), { recursive: true });
const run = (...a) => execFileSync(process.execPath, [cli, ...a], { stdio: ["ignore", "pipe", "pipe"] });
const cats = ["furniture", "plumbing", "electric", "repair", "other"];
const rows = [];
for (const c of cats) {
  const src = path.join(root, "export", `${c}.glb`);
  const dst = path.join(root, "optimized", `${c}.glb`);
  const t = (n) => path.join(tmp, `${c}.${n}.glb`);
  run("weld", src, t(1));
  run("resample", t(1), t(2), "--tolerance", "1e-5");
  run("prune", t(2), t(3), "--keep-leaves", "true", "--keep-attributes", "true");   // keep Body TEXCOORD_0 for the grime mask
  run("dedup", t(3), t(4));
  run("meshopt", t(4), dst, "--level", "high");
  const v = run("validate", dst).toString().replace(/\x1b\[[0-9;]*m/g, "");
  const issues = (v.match(/(\d+) errors?, (\d+) warnings?/) || []).slice(1).join("/") || "see log";
  rows.push({ cat: c, raw_KB: (fs.statSync(src).size / 1024).toFixed(1), optimized_KB: (fs.statSync(dst).size / 1024).toFixed(1), validator_errors_warnings: issues });
}
console.table(rows);
fs.rmSync(tmp, { recursive: true, force: true });
