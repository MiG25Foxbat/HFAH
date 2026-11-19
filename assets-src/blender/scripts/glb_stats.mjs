// usage: node glb_stats.mjs [dir]  -> per-GLB size, triangles, vertices, meshes, materials, clips
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, process.argv[2] || "optimized");
const rows = [];
for (const c of ["furniture", "plumbing", "electric", "repair", "other"]) {
  const f = path.join(dir, c + ".glb"); const d = await io.read(f); const r = d.getRoot();
  let tris = 0, verts = 0;
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { tris += (p.getIndices()?.getCount() ?? 0) / 3; verts += p.getAttribute("POSITION").getCount(); }
  const body = r.listNodes().find((n) => n.getName() === "Body");
  rows.push({ cat: c, KB: +(fs.statSync(f).size / 1024).toFixed(1), tris, verts, meshes: r.listMeshes().length, materials: r.listMaterials().length, textures: r.listTextures().length,
    clips: r.listAnimations().map((a) => a.getName()).join("/"), bodyMats: new Set(body.getMesh().listPrimitives().map((p) => p.getMaterial().getName())).size, bodyUV: !!body.getMesh().listPrimitives()[0].getAttribute("TEXCOORD_0") });
}
console.table(rows);
