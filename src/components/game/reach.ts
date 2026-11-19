/**
 * Какие участки Body реально можно оттереть: те треугольники, которые видны с какого-нибудь допустимого ракурса
 * (камера витрины ходит по высоте 0.12…1.05 рад и по любому углу вокруг). Остальное — днище, зазоры под ножками,
 * места под руками и мордочкой — закрыто всегда, и налёт на нём сделал бы победу недостижимой.
 *
 * Считаем на видеокарте: рисуем персонажа в маленькую цель с цветом = номер треугольника Body (остальные детали
 * просто закрывают), читаем пиксели и запоминаем увиденные номера. Затем эти треугольники закрашиваются в UV-пространстве.
 * Для каждого треугольника считаем, какая доля его площади была видна в лучшем из ракурсов: «хорошо видимыми»
 * считаются треугольники, у которых она не меньше 0.6. Пятна ставятся только на хорошо видимых участках
 * (generateSpots), а маска достижимого (всё, что видно хоть чуть-чуть) обрезает остатки по краям.
 * Если рендер недоступен — вызывающий берёт запасной вариант (грань, смотрящая вниз, не считается).
 */
import * as THREE from "three";

const VIEW = 256;
const YAWS = 12;
const ELEVS = [0.14, 0.55, 1.03];

export type Reach = {
  /** Белое там, где на UV-карте есть хоть сколько-то видимая поверхность. */
  canvas: HTMLCanvasElement;
  /** По треугольникам (порядок индексов Body): 1 — хорошо виден хотя бы с одного ракурса. */
  good: Uint8Array;
  /** Для проверок: сколько треугольников всего, видно хоть как-то, видно хорошо. */
  stats: { tris: number; seen: number; good: number };
};

const GOOD = 0.6;

export async function computeReach(gl: THREE.WebGLRenderer, pivot: THREE.Object3D, body: THREE.Mesh, size: number): Promise<Reach | null> {
  const geo = body.geometry;
  const index = geo.index;
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const tris = (index ? index.count : pos.count) / 3;

  const ids = new THREE.BufferGeometry();
  const flat = index ? geo.clone().toNonIndexed() : geo.clone();
  ids.setAttribute("position", flat.getAttribute("position"));
  const tri = new Float32Array(tris * 3);
  for (let f = 0; f < tris; f++) tri.fill(f + 1, f * 3, f * 3 + 3);
  ids.setAttribute("aTri", new THREE.BufferAttribute(tri, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: "attribute float aTri; varying float vTri; void main() { vTri = aTri; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "varying float vTri; void main() { float id = floor(vTri + 0.5); float b = floor(id / 65536.0); float g = floor((id - b * 65536.0) / 256.0); float r = id - b * 65536.0 - g * 256.0; gl_FragColor = vec4(r, g, b, 255.0) / 255.0; }",
  });
  (mat as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = { aTri: [0], uv: [0, 0], uv1: [0, 0], color: [1, 1, 1] }; // у остальных деталей номера нет: они только закрывают
  const target = new THREE.WebGLRenderTarget(VIEW, VIEW);
  const scene = new THREE.Scene();
  scene.overrideMaterial = mat;

  const prevTarget = gl.getRenderTarget();
  const prevColor = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  const prevAuto = gl.autoClear;
  const prevGeometry = body.geometry;
  const seen = new Uint8Array(tris);
  const best = new Float32Array(tris); // лучшая доля видимой площади
  const area = new Float32Array(tris);
  const normal = new Float32Array(tris * 3);
  const count = new Uint16Array(tris);
  const views: { dir: THREE.Vector3; buf: Uint8Array; done: Promise<unknown> }[] = [];
  let radius = 1;
  try {
    pivot.updateMatrixWorld(true);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let f = 0; f < tris; f++) {
      const i0 = index ? index.getX(f * 3) : f * 3;
      const i1 = index ? index.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = index ? index.getX(f * 3 + 2) : f * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(body.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(body.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(body.matrixWorld);
      n.subVectors(b, a).cross(c.sub(a));
      area[f] = n.length() / 2;
      n.normalize();
      normal.set([n.x, n.y, n.z], f * 3);
    }
    scene.add(pivot);
    body.geometry = ids;
    const sphere = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius * 1.03;
    radius = r;
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, r * 2 + 4);
    const dir = new THREE.Vector3();
    gl.autoClear = true;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(target);
    for (const elev of ELEVS) {
      for (let y = 0; y < YAWS; y++) {
        const yaw = (y / YAWS) * Math.PI * 2;
        dir.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
        cam.position.copy(sphere.center).addScaledVector(dir, r + 2);
        cam.lookAt(sphere.center);
        cam.updateMatrixWorld(true);
        gl.clear();
        gl.render(scene, cam);
        // Асинхронное чтение (буфер PBO): без остановки конвейера видеокарты на каждом ракурсе.
        const buf = new Uint8Array(VIEW * VIEW * 4);
        views.push({ dir: dir.clone(), buf, done: gl.readRenderTargetPixelsAsync(target, 0, 0, VIEW, VIEW, buf) });
      }
    }
  } catch {
    return null;
  } finally {
    body.geometry = prevGeometry;
    scene.remove(pivot);
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevColor, prevAlpha);
    gl.autoClear = prevAuto;
    mat.dispose();
    ids.dispose();
  }

  try {
    await Promise.all(views.map((v) => v.done));
  } catch {
    return null;
  } finally {
    target.dispose();
  }
  const pixel = ((2 * radius) / VIEW) ** 2;
  for (const { dir, buf } of views) {
    count.fill(0);
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] !== 255) continue;
      const id = buf[i] + buf[i + 1] * 256 + buf[i + 2] * 65536;
      if (id > 0 && id <= tris) count[id - 1]++;
    }
    for (let f = 0; f < tris; f++) {
      if (!count[f]) continue;
      seen[f] = 1;
      // сколько пикселей занял бы этот треугольник, будь он виден целиком
      const expected = (area[f] * Math.max(0, normal[f * 3] * dir.x + normal[f * 3 + 1] * dir.y + normal[f * 3 + 2] * dir.z)) / pixel;
      best[f] = Math.max(best[f], expected < 2 ? 1 : Math.min(1, count[f] / expected));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.beginPath();
  let any = false;
  for (let f = 0; f < tris; f++) {
    if (!seen[f]) continue;
    any = true;
    const i0 = index ? index.getX(f * 3) : f * 3;
    const i1 = index ? index.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = index ? index.getX(f * 3 + 2) : f * 3 + 2;
    ctx.moveTo(uv.getX(i0) * size, uv.getY(i0) * size);
    ctx.lineTo(uv.getX(i1) * size, uv.getY(i1) * size);
    ctx.lineTo(uv.getX(i2) * size, uv.getY(i2) * size);
    ctx.closePath();
  }
  if (!any) return null;
  const good = new Uint8Array(tris);
  for (let f = 0; f < tris; f++) good[f] = best[f] >= GOOD ? 1 : 0;
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  return { canvas, good, stats: { tris, seen: seen.reduce((a, b) => a + b, 0), good: good.reduce((a, b) => a + b, 0) } };
}
