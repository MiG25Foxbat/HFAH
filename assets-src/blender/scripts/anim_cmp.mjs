// compare animation curves of two GLBs (max abs error per channel, linear interpolation)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
await MeshoptDecoder.ready;
const [a, b] = await Promise.all([io.read(process.argv[2]), io.read(process.argv[3])]);
function slerp(a, b, k) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const bb = d < 0 ? b.map((v) => -v) : b; d = Math.abs(d);
  if (d > 0.9995) { const r = a.map((x, j) => x * (1 - k) + bb[j] * k); const n = Math.hypot(...r); return r.map((v) => v / n); }
  const th = Math.acos(d), s0 = Math.sin((1 - k) * th) / Math.sin(th), s1 = Math.sin(k * th) / Math.sin(th);
  return a.map((x, j) => x * s0 + bb[j] * s1);
}
function sample(ch, t) {
  const s = ch.getSampler(); const inp = s.getInput(); const ti = Array.from({ length: inp.getCount() }, (_, i) => inp.getScalar(i));
  const v = s.getOutput(); const sz = v.getElementSize();
  const el = (i) => { const o = new Array(sz).fill(0); v.getElement(i, o); return o; };
  if (t <= ti[0]) return el(0);
  for (let i = 1; i < ti.length; i++) if (t <= ti[i]) {
    const k = (t - ti[i - 1]) / (ti[i] - ti[i - 1]); const a0 = el(i - 1), a1 = el(i);
    if (ch.getTargetPath() === "rotation") return slerp(a0, a1, k);          // glTF rotations interpolate with slerp
    return a0.map((x, j) => x * (1 - k) + a1[j] * k);
  }
  return el(ti.length - 1);
}
for (const an of a.getRoot().listAnimations()) {
  const bn = b.getRoot().listAnimations().find((x) => x.getName() === an.getName());
  for (const ch of an.listChannels()) {
    const nodeName = ch.getTargetNode().getName(), path = ch.getTargetPath();
    const ch2 = bn.listChannels().find((c) => c.getTargetNode().getName() === nodeName && c.getTargetPath() === path);
    const dur = Math.max(...Array.from(ch.getSampler().getInput().getArray()));
    let maxe = 0;
    for (let i = 0; i <= 400; i++) { const t = (dur * i) / 400; const x = sample(ch, t), y = sample(ch2, t); if (path === "rotation") { const dp = x.reduce((a, v, j) => a + v * y[j], 0); if (dp < 0) for (let j = 0; j < 4; j++) y[j] = -y[j]; }   // q and -q are the same rotation
      for (let j = 0; j < x.length; j++) maxe = Math.max(maxe, Math.abs(x[j] - y[j])); }
    console.log(an.getName().padEnd(6), nodeName.padEnd(8), path.padEnd(11), "keys", ch.getSampler().getInput().getCount(), "->", ch2.getSampler().getInput().getCount(), "maxErr", maxe.toExponential(2));
  }
}
