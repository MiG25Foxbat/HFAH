/**
 * Быстрый луч в Body без сторонних библиотек: треугольники раскладываются по пространственной сетке 4×4×4 на
 * невидимые куски-меши (дети Body: двигаются вместе с ним). Raycaster сначала проверяет габариты кусков и
 * перебирает треугольники только тех, через которые прошёл луч, а позиции в кусках — обычные float, без деквантования.
 * В кусках лежат те же треугольники в том же порядке обхода, UV берётся из них же, поэтому `hit.uv`/`hit.face` работают как у Body.
 * ponytail: сетка вместо BVH — на ~12 тыс. треугольников луч дешевле в 5–10 раз; для моделей в сотни тысяч нужен настоящий BVH.
 */
import * as THREE from "three";

const GRID = 4;

export function buildPickParts(body: THREE.Mesh): THREE.Mesh[] {
  const g = body.geometry;
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const index = g.index;
  const tris = (index ? index.count : pos.count) / 3;
  g.computeBoundingBox();
  const box = g.boundingBox as THREE.Box3;
  const size = box.getSize(new THREE.Vector3());

  const cells = new Map<number, number[]>();
  const corner = [0, 0, 0].map(() => new THREE.Vector3());
  for (let f = 0; f < tris; f++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      corner[k].fromBufferAttribute(pos, index ? index.getX(f * 3 + k) : f * 3 + k);
      cx += corner[k].x / 3;
      cy += corner[k].y / 3;
      cz += corner[k].z / 3;
    }
    const cell = (v: number, min: number, s: number) => Math.min(GRID - 1, Math.floor(((v - min) / Math.max(s, 1e-6)) * GRID));
    const key = cell(cx, box.min.x, size.x) + GRID * (cell(cy, box.min.y, size.y) + GRID * cell(cz, box.min.z, size.z));
    const list = cells.get(key);
    if (list) list.push(f);
    else cells.set(key, [f]);
  }

  const parts: THREE.Mesh[] = [];
  for (const list of cells.values()) {
    const P = new Float32Array(list.length * 9);
    const T = new Float32Array(list.length * 6);
    list.forEach((f, n) => {
      for (let k = 0; k < 3; k++) {
        const i = index ? index.getX(f * 3 + k) : f * 3 + k;
        P[n * 9 + k * 3] = pos.getX(i);
        P[n * 9 + k * 3 + 1] = pos.getY(i);
        P[n * 9 + k * 3 + 2] = pos.getZ(i);
        T[n * 6 + k * 2] = uv.getX(i);
        T[n * 6 + k * 2 + 1] = uv.getY(i);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(P, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(T, 2));
    const part = new THREE.Mesh(geometry, body.material);
    part.visible = false; // не рисуется, но луч его проверяет
    part.name = "BodyPick";
    body.add(part);
    parts.push(part);
  }
  return parts;
}

export function disposePickParts(body: THREE.Mesh, parts: THREE.Mesh[]) {
  for (const p of parts) {
    body.remove(p);
    p.geometry.dispose();
  }
}
