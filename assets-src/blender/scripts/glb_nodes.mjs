// usage: node glb_nodes.mjs file.glb  -> prints node tree + animation channel targets
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const len = buf.readUInt32LE(12);
const j = JSON.parse(buf.slice(20, 20 + len).toString("utf8"));
const kids = new Set(j.nodes.flatMap((n) => n.children || []));
const pr = (i, d) => {
  const n = j.nodes[i];
  const t = ["translation", "rotation", "scale"].filter((k) => n[k]).join(",");
  console.log("  ".repeat(d) + n.name + (n.mesh !== undefined ? "  [mesh]" : "") + (t ? "  {" + t + "}" : ""));
  (n.children || []).forEach((c) => pr(c, d + 1));
};
j.nodes.forEach((_, i) => { if (!kids.has(i)) pr(i, 0); });
console.log("extensionsUsed:", j.extensionsUsed, "required:", j.extensionsRequired);
for (const a of j.animations || []) {
  const targets = {};
  for (const c of a.channels) {
    const nm = j.nodes[c.target.node].name;
    (targets[nm] ||= []).push(c.target.path);
  }
  const acc = j.accessors[a.samplers[0].input];
  console.log("ANIM", a.name, "dur=" + acc.max[0].toFixed(3), "keys=" + acc.count, JSON.stringify(targets));
}
