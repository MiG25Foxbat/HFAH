import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const c of ["furniture", "plumbing", "electric", "repair", "other", "appliances"]) {
  const d = await io.read(`../optimized/${c}.glb`); const b = getBounds(d.getRoot().listScenes()[0]);
  const f = (a) => a.map((v) => v.toFixed(2)).join(", ");
  console.log(c.padEnd(10), "min", f(b.min), "| max", f(b.max), "| size", f(b.max.map((v, i) => v - b.min[i])));
}
