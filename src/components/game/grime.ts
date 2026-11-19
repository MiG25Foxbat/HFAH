/**
 * Налёт и ржавчина на поверхности модели: маска в UV-пространстве меша Body.
 *
 * Маска — canvas 512² (CanvasTexture, цвет с предумноженной альфой). Пятна ставятся в точки, выбранные ПО ПОВЕРХНОСТИ
 * модели (MeshSurfaceSampler), поэтому они лежат на настоящей геометрии, вращаются вместе с ней и закрываются ею:
 * маска подмешивается в материал Body (onBeforeCompile), а не рисуется поверх. Чистка стирает мягкий круг в маске
 * (destination-out). Прогресс считает грубая сетка 128² (копия альфы, обновляется теми же штампами).
 * Чистая логика без React: здесь нет ничего, что зависит от компонентов.
 */
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { DEFAULT_ELEV } from "@/components/stage/rig";
import type { Reach } from "./reach";

export const MASK_SIZE = 512;
/** Высота персонажа в игре: крупнее, чем на витрине (1.6), чтобы пятна и кисть были удобны пальцем. */
export const MODEL_H = 2;
const U = MODEL_H / 1.6; // во сколько раз всё «человеческое» (радиусы пятен, зазоры) больше, чем у витринного размера
const GRID = 128;
const CELL = MASK_SIZE / GRID;
/** Клетка сетки считается грязной, пока в ней осталось больше этой доли альфы. */
const DIRTY_ALPHA = 0.1;
/** Доля очищенного, с которой игра считается пройденной. */
export const DONE_AT = 0.92;

export type Kind = "rust" | "scale" | "grime";
export type Spot = { u: number; v: number; r: number; kind: Kind; point: THREE.Vector3 };

const PALETTE: Record<Kind, { base: string[]; rim?: string; flecks: string[] }> = {
  rust: { base: ["#8A4B2A", "#9C5629", "#B5652F"], flecks: ["#6B3A22", "#C4722F", "#5A3220"] },
  scale: { base: ["#E9E4D2", "#E2DCC6"], rim: "#BDAF86", flecks: ["#FFFFFF", "#CFC6A8", "#F4F0E2"] },
  grime: { base: ["#4A453D", "#55503F"], flecks: ["#2E2A25", "#6B6452"] },
};

/** Какие пятна уместны на этом предмете: на светлом хроме налёт почти не виден, на дереве ржавчина сливается с цветом. */
const KIND_WEIGHTS: Record<string, [Kind, number][]> = {
  furniture: [["scale", 4], ["grime", 3], ["rust", 2]],
  plumbing: [["rust", 5], ["grime", 3], ["scale", 2]],
  electrics: [["rust", 4], ["scale", 3], ["grime", 3]],
  repair: [["rust", 4], ["scale", 3], ["grime", 3]],
  other: [["rust", 5], ["scale", 3], ["grime", 2]],
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const pick = <T>(list: readonly T[], rnd: () => number) => list[Math.floor(rnd() * list.length)];
const clamp = THREE.MathUtils.clamp;

// --- геометрия: масштаб UV ------------------------------------------------------------------------

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();

/**
 * Сколько единиц UV приходится на единицу длины в мире для треугольника (корень отношения площадей UV и мира).
 * По нему радиус кисти в мире переводится в радиус в маске, и кисть остаётся одинаковой на экране.
 * 0 — треугольник вырожденный.
 */
export function uvPerWorld(mesh: THREE.Mesh, face: { a: number; b: number; c: number }): number {
  const pos = mesh.geometry.getAttribute("position");
  const uv = mesh.geometry.getAttribute("uv");
  _a.fromBufferAttribute(pos, face.a).applyMatrix4(mesh.matrixWorld);
  _b.fromBufferAttribute(pos, face.b).applyMatrix4(mesh.matrixWorld);
  _c.fromBufferAttribute(pos, face.c).applyMatrix4(mesh.matrixWorld);
  const worldArea = _ab.subVectors(_b, _a).cross(_ac.subVectors(_c, _a)).length() / 2;
  const du1 = uv.getX(face.b) - uv.getX(face.a);
  const dv1 = uv.getY(face.b) - uv.getY(face.a);
  const du2 = uv.getX(face.c) - uv.getX(face.a);
  const dv2 = uv.getY(face.c) - uv.getY(face.a);
  const uvArea = Math.abs(du1 * dv2 - du2 * dv1) / 2;
  return worldArea > 1e-9 && uvArea > 1e-12 ? Math.sqrt(uvArea / worldArea) : 0;
}

/** Запасная маска достижимого: всё, что покрыто треугольниками, кроме граней, смотрящих почти строго вниз. */
function buildValidMask(body: THREE.Mesh): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MASK_SIZE;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const g = body.geometry;
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const index = g.index;
  const count = (index ? index.count : pos.count) / 3;
  const n = new THREE.Vector3();
  ctx.beginPath();
  for (let f = 0; f < count; f++) {
    const i0 = index ? index.getX(f * 3) : f * 3;
    const i1 = index ? index.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = index ? index.getX(f * 3 + 2) : f * 3 + 2;
    _a.fromBufferAttribute(pos, i0).applyMatrix4(body.matrixWorld);
    _b.fromBufferAttribute(pos, i1).applyMatrix4(body.matrixWorld);
    _c.fromBufferAttribute(pos, i2).applyMatrix4(body.matrixWorld);
    n.subVectors(_b, _a).cross(_ac.subVectors(_c, _a)).normalize();
    if (n.y < -0.8) continue; // смотрит почти строго вниз: камера туда не заглянет, очистить нельзя
    ctx.moveTo(uv.getX(i0) * MASK_SIZE, uv.getY(i0) * MASK_SIZE);
    ctx.lineTo(uv.getX(i1) * MASK_SIZE, uv.getY(i1) * MASK_SIZE);
    ctx.lineTo(uv.getX(i2) * MASK_SIZE, uv.getY(i2) * MASK_SIZE);
    ctx.closePath();
  }
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke(); // чуть расширяем острова, чтобы по швам не оставалось щелей
  return canvas;
}

// --- выбор точек ПО ПОВЕРХНОСТИ -------------------------------------------------------------------

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _uv = new THREE.Vector2();
const _d = new THREE.Vector3();
const _o = new THREE.Vector3();

/** Направление «от модели к камере» для угла поворота и высоты камеры. */
const viewDir = (yaw: number, elev: number, out: THREE.Vector3) =>
  out.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));

/**
 * 8–14 точек на поверхности Body: берём случайные точки MeshSurfaceSampler вместе с их UV и оставляем те,
 * до которых можно дотянуться кистью: их видно с допустимого ракурса камеры, вокруг нет рук, ножек и стыков
 * (по доле хорошо видимых треугольников вокруг) и они не закрыты другими деталями.
 * Первые три — со стороны камеры по умолчанию, следующие две — сзади: чтобы поворот был нужен.
 * Если на строгих условиях набралось меньше 8, условия по очереди ослабляются: игра не должна остаться без пятен.
 */
export function generateSpots(category: string, body: THREE.Mesh, parts: THREE.Mesh[], blockers: THREE.Mesh[], good: Uint8Array | null, random: () => number = Math.random): Spot[] {
  const sampler = new MeshSurfaceSampler(body).build();
  const raycaster = new THREE.Raycaster();
  const targets = [...parts, ...blockers];
  const partSet = new Set<THREE.Object3D>(parts);
  const wantCount = 8 + Math.floor(random() * 7);
  const kinds = KIND_WEIGHTS[category] ?? KIND_WEIGHTS.other;
  const kindTotal = kinds.reduce((s, [, w]) => s + w, 0);
  const front = viewDir(0, DEFAULT_ELEV, new THREE.Vector3());
  const back = viewDir(Math.PI, DEFAULT_ELEV, new THREE.Vector3());
  const spots: Spot[] = [];
  const faces = good ? faceData(body) : null;
  const locate = buildUvLocator(body);
  const probe3 = new THREE.Vector3();

  /** Пятно не должно резаться по шву: точки кольца вокруг центра в UV обязаны лежать рядом с ним и на самой модели. */
  const seamFree = (u: number, v: number, rTex: number, k: number, p: THREE.Vector3) => {
    const ring = (0.75 * rTex) / MASK_SIZE;
    const expect = ring / k;
    for (let t = 0; t < 8; t++) {
      const a = (t * Math.PI) / 4;
      if (!locate(u + Math.cos(a) * ring, v + Math.sin(a) * ring, probe3)) continue; // за краем острова — край модели, это нормально
      const d = probe3.distanceTo(p);
      if (d > expect * 1.7 || d < expect * 0.25) return false; // по соседству другой кусок модели
    }
    return true;
  };

  /** Доля плохо видимых треугольников той же стороны поверхности вокруг точки (у тонких оболочек вторая сторона не в счёт). */
  const hiddenAround = (p: THREE.Vector3, n: THREE.Vector3, radius: number) => {
    if (!good || !faces) return 0;
    let total = 0;
    let bad = 0;
    const r2 = radius * radius;
    for (let f = 0; f < good.length; f++) {
      const dx = faces.centroid[f * 3] - p.x;
      const dy = faces.centroid[f * 3 + 1] - p.y;
      const dz = faces.centroid[f * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      if (faces.normal[f * 3] * n.x + faces.normal[f * 3 + 1] * n.y + faces.normal[f * 3 + 2] * n.z < 0.5) continue;
      total++;
      if (!good[f]) bad++;
    }
    return total ? bad / total : 1;
  };

  const reachableFrom = (p: THREE.Vector3, n: THREE.Vector3, d: THREE.Vector3, minDot: number): THREE.Intersection | null => {
    if (n.dot(d) < minDot) return null;
    raycaster.set(_o.copy(p).addScaledVector(d, 4), _d.copy(d).negate());
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit && partSet.has(hit.object) && hit.point.distanceTo(p) < 0.02 * U ? hit : null;
  };

  const TIERS = [
    { attempts: 600, maxHidden: 0.04, roles: true, seams: true },
    { attempts: 400, maxHidden: 0.15, roles: false, seams: true },
    { attempts: 400, maxHidden: 1, roles: false, seams: false },
  ];
  TIERS.forEach((tier, t) => {
    const target = t === 0 ? wantCount : 8;
    for (let attempt = 0; attempt < tier.attempts && spots.length < target; attempt++) {
      sampler.sample(_p, _n, undefined, _uv);
      body.localToWorld(_p);
      _n.transformDirection(body.matrixWorld);
      const i = spots.length;
      if (spots.some((s) => s.point.distanceTo(_p) < 0.24 * U)) continue;
      const radiusWorld = (0.11 + random() * 0.1) * U;
      if (hiddenAround(_p, _n, radiusWorld) > tier.maxHidden) continue;

      let hit: THREE.Intersection | null = null;
      if (tier.roles && i < 3) hit = reachableFrom(_p, _n, front, 0.45);
      else if (tier.roles && i < 5) hit = _n.dot(front) < 0.1 ? reachableFrom(_p, _n, back, 0.45) : null;
      else {
        for (let v = 0; v < 5 && !hit; v++) hit = reachableFrom(_p, _n, viewDir(random() * Math.PI * 2, 0.2 + random() * 0.8, new THREE.Vector3()), 0.4);
      }
      if (!hit?.face) continue;
      const k = uvPerWorld(hit.object as THREE.Mesh, hit.face);
      if (k === 0) continue;

      const rTex = clamp(radiusWorld * k * MASK_SIZE, 13, 58);
      if (tier.seams && !seamFree(_uv.x, _uv.y, rTex, k, _p)) continue;
      let roll = random() * kindTotal;
      const kind = kinds.find(([, w]) => (roll -= w) < 0)?.[0] ?? "rust";
      spots.push({ u: _uv.x, v: _uv.y, r: rTex, kind, point: _p.clone() });
    }
  });
  return spots;
}

/** Поиск по UV: какая точка модели (в мире) лежит в данной точке UV-карты; false — там пусто. */
function buildUvLocator(body: THREE.Mesh) {
  const G = 64;
  const g = body.geometry;
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const index = g.index;
  const tris = (index ? index.count : pos.count) / 3;
  const lists: number[][] = Array.from({ length: G * G }, () => []);
  const idx = (f: number, k: number) => (index ? index.getX(f * 3 + k) : f * 3 + k);
  for (let f = 0; f < tris; f++) {
    const us = [0, 1, 2].map((k) => uv.getX(idx(f, k)));
    const vs = [0, 1, 2].map((k) => uv.getY(idx(f, k)));
    const x0 = clamp(Math.floor(Math.min(...us) * G), 0, G - 1);
    const x1 = clamp(Math.floor(Math.max(...us) * G), 0, G - 1);
    const y0 = clamp(Math.floor(Math.min(...vs) * G), 0, G - 1);
    const y1 = clamp(Math.floor(Math.max(...vs) * G), 0, G - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lists[y * G + x].push(f);
  }
  return (u: number, v: number, out: THREE.Vector3): boolean => {
    if (u < 0 || v < 0 || u > 1 || v > 1) return false;
    for (const f of lists[clamp(Math.floor(v * G), 0, G - 1) * G + clamp(Math.floor(u * G), 0, G - 1)]) {
      const i0 = idx(f, 0);
      const i1 = idx(f, 1);
      const i2 = idx(f, 2);
      const ax = uv.getX(i0);
      const ay = uv.getY(i0);
      const e1x = uv.getX(i1) - ax;
      const e1y = uv.getY(i1) - ay;
      const e2x = uv.getX(i2) - ax;
      const e2y = uv.getY(i2) - ay;
      const det = e1x * e2y - e2x * e1y;
      if (Math.abs(det) < 1e-12) continue;
      const w1 = ((u - ax) * e2y - e2x * (v - ay)) / det;
      const w2 = (e1x * (v - ay) - (u - ax) * e1y) / det;
      if (w1 < -1e-4 || w2 < -1e-4 || w1 + w2 > 1 + 1e-4) continue;
      _a.fromBufferAttribute(pos, i0);
      _b.fromBufferAttribute(pos, i1);
      _c.fromBufferAttribute(pos, i2);
      out.copy(_a).multiplyScalar(1 - w1 - w2).addScaledVector(_b, w1).addScaledVector(_c, w2).applyMatrix4(body.matrixWorld);
      return true;
    }
    return false;
  };
}

/** Центры и нормали треугольников Body в мировых координатах (порядок индексов). */
function faceData(body: THREE.Mesh): { centroid: Float32Array; normal: Float32Array } {
  const g = body.geometry;
  const pos = g.getAttribute("position");
  const index = g.index;
  const n = (index ? index.count : pos.count) / 3;
  const centroid = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const nv = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    _a.fromBufferAttribute(pos, index ? index.getX(f * 3) : f * 3).applyMatrix4(body.matrixWorld);
    _b.fromBufferAttribute(pos, index ? index.getX(f * 3 + 1) : f * 3 + 1).applyMatrix4(body.matrixWorld);
    _c.fromBufferAttribute(pos, index ? index.getX(f * 3 + 2) : f * 3 + 2).applyMatrix4(body.matrixWorld);
    centroid.set([(_a.x + _b.x + _c.x) / 3, (_a.y + _b.y + _c.y) / 3, (_a.z + _b.z + _c.z) / 3], f * 3);
    nv.subVectors(_b, _a).cross(_ac.subVectors(_c, _a)).normalize();
    normal.set([nv.x, nv.y, nv.z], f * 3);
  }
  return { centroid, normal };
}

// --- рисование пятен ------------------------------------------------------------------------------

function paintSpot(ctx: CanvasRenderingContext2D, s: Spot, random: () => number) {
  const cx = s.u * MASK_SIZE;
  const cy = s.v * MASK_SIZE;
  const R = s.r;
  const pal = PALETTE[s.kind];
  const ph = [random() * 6.28, random() * 6.28, random() * 6.28];
  const contour = (a: number) => R * (0.82 + 0.14 * Math.sin(2 * a + ph[0]) + 0.1 * Math.sin(3 * a + ph[1]) + 0.06 * Math.sin(5 * a + ph[2]));

  // «Аэрограф»: много мягких кругов внутри неровного контура дают плотную середину и рваный мягкий край.
  const layer = (colors: string[], grow: number, alpha: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * contour(a) * 0.85;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const pr = R * (0.2 + random() * 0.22) * grow;
      const col = pick(colors, random);
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
      g.addColorStop(0, rgba(col, alpha));
      g.addColorStop(0.55, rgba(col, alpha * 0.55));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  if (pal.rim) layer([pal.rim], 1.2, 0.5, 30); // тёмный ободок у налёта
  layer(pal.base, 1, s.kind === "grime" ? 0.62 : 0.55, 52);

  // Крапинки: светлее и темнее основного цвета.
  for (let i = 0; i < 90; i++) {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * contour(a) * 0.9;
    ctx.fillStyle = rgba(pick(pal.flecks, random), 0.45 + random() * 0.35);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.6 + random() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Значения шума на решётке с билинейной интерполяцией: зерно на поверхности пятна. */
function makeNoise(random: () => number) {
  const N = 96;
  const lattice = Float32Array.from({ length: N * N }, () => random());
  return (x: number, y: number) => {
    const fx = (x / 5) % N;
    const fy = (y / 5) % N;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (i: number, j: number) => lattice[(j % N) * N + (i % N)];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0, y0), at(x0 + 1, y0), tx), THREE.MathUtils.lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
}

// --- слой налёта ----------------------------------------------------------------------------------

/**
 * Подмешивает маску в клон материала Body: цвет, шероховатость и металличность меняются там, где есть налёт.
 * Текстура «предумноженная»: цвет хранится как цвет × альфа, поэтому по краям пятна нет тёмной каймы.
 * Читается как данные (NoColorSpace) и переводится из sRGB в линейное вручную.
 */
function attach(mat: THREE.MeshStandardMaterial, texture: THREE.Texture, fade: { value: number }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = { value: texture };
    shader.uniforms.uFade = fade;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGrimeUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrimeUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uGrime;\nuniform float uFade;\nvarying vec2 vGrimeUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec4 grimeP = texture2D(uGrime, vGrimeUv);
        float grimeA = grimeP.a * uFade;
        float grimeM = smoothstep(0.3, 0.85, grimeA); // блеск гасим только под плотным налётом, без серого ореола по краю
        vec3 grimeC = grimeP.a > 0.003 ? pow(min(grimeP.rgb / grimeP.a, vec3(1.0)), vec3(2.2)) : vec3(0.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, grimeC, grimeA);`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, grimeM);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - grimeM;");
  };
  mat.customProgramCacheKey = () => "ladno-grime";
  mat.needsUpdate = true;
}

export class Grime {
  readonly canvas = document.createElement("canvas");
  readonly texture: THREE.CanvasTexture;
  readonly fade = { value: 1 };
  readonly spots: Spot[];
  readonly reachStats: Reach["stats"] | null;
  /** Маска изменилась, текстуру нужно загрузить в GPU (один раз за кадр). */
  needsFlush = false;
  /** Сколько раз маска уходила в GPU (для проверок: не чаще раза за кадр). */
  uploads = 0;

  private ctx: CanvasRenderingContext2D;
  private grid = new Float32Array(GRID * GRID);
  private dirty = 0;
  private dirtyInit = 0;

  /** `reach` — UV-маска достижимых участков (reach.ts); без неё берём запасную: всё, кроме граней, смотрящих вниз. */
  constructor(category: string, body: THREE.Mesh, parts: THREE.Mesh[], blockers: THREE.Mesh[], material: THREE.MeshStandardMaterial, reach: Reach | null, random: () => number = Math.random) {
    this.canvas.width = this.canvas.height = MASK_SIZE;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.reachStats = reach?.stats ?? null;
    this.spots = generateSpots(category, body, parts, blockers, reach?.good ?? null, random);
    for (const s of this.spots) paintSpot(this.ctx, s, random);

    // Только то, что лежит на настоящих треугольниках; зерно по поверхности.
    this.ctx.globalCompositeOperation = "destination-in";
    this.ctx.drawImage(reach?.canvas ?? buildValidMask(body), 0, 0);
    this.ctx.globalCompositeOperation = "source-over";
    const img = this.ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE);
    const d = img.data;
    const noise = makeNoise(random);
    for (let y = 0; y < MASK_SIZE; y++) {
      for (let x = 0; x < MASK_SIZE; x++) {
        const o = (y * MASK_SIZE + x) * 4;
        if (d[o + 3] === 0) continue;
        const grain = 0.86 + 0.28 * noise(x, y);
        const fine = 0.94 + 0.12 * random();
        d[o] = Math.min(255, d[o] * grain * fine);
        d[o + 1] = Math.min(255, d[o + 1] * grain * fine);
        d[o + 2] = Math.min(255, d[o + 2] * grain * fine);
        d[o + 3] = Math.min(255, d[o + 3] * (0.9 + 0.2 * noise(x + 40, y + 17)) * 1.15);
      }
    }
    this.ctx.putImageData(img, 0, 0);

    // Сетка прогресса: средняя альфа клетки.
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        let sum = 0;
        for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) sum += d[((gy * CELL + j) * MASK_SIZE + gx * CELL + i) * 4 + 3];
        const a = sum / (CELL * CELL * 255);
        this.grid[gy * GRID + gx] = a;
        if (a >= DIRTY_ALPHA) this.dirtyInit++;
      }
    }
    this.dirty = this.dirtyInit;

    this.ctx.globalCompositeOperation = "destination-out";
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace; // данные: цвет × альфа в sRGB, перевод — в шейдере
    this.texture.premultiplyAlpha = true;
    this.texture.flipY = false; // UV glTF: v вниз, как строки canvas
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    attach(material, this.texture, this.fade);
  }

  /** Стирает мягкий круг радиусом r (в текселях маски) вокруг точки UV. */
  erase(u: number, v: number, r: number) {
    const x = u * MASK_SIZE;
    const y = v * MASK_SIZE;
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.needsFlush = true;

    // То же самое на сетке: альфа × (1 − сила), сила — как у градиента.
    const gx0 = Math.max(0, Math.floor((x - r) / CELL));
    const gx1 = Math.min(GRID - 1, Math.floor((x + r) / CELL));
    const gy0 = Math.max(0, Math.floor((y - r) / CELL));
    const gy1 = Math.min(GRID - 1, Math.floor((y + r) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const i = gy * GRID + gx;
        const a = this.grid[i];
        if (a <= 0) continue;
        const t = Math.hypot((gx + 0.5) * CELL - x, (gy + 0.5) * CELL - y) / r;
        if (t >= 1) continue;
        const next = a * (1 - (t <= 0.55 ? 1 : (1 - t) / 0.45));
        if (a >= DIRTY_ALPHA && next < DIRTY_ALPHA) this.dirty--;
        this.grid[i] = next;
      }
    }
  }

  /** Доля очищенного, 0…1 (по клеткам сетки, где было больше DIRTY_ALPHA альфы). */
  progress(): number {
    return this.dirtyInit === 0 ? 1 : 1 - this.dirty / this.dirtyInit;
  }

  /** Загружает маску в GPU, если она менялась; вызывается из кадра, не чаще раза за кадр. */
  flush() {
    if (!this.needsFlush) return false;
    this.texture.needsUpdate = true;
    this.needsFlush = false;
    this.uploads++;
    return true;
  }

  /** Убирает остатки: после победы мягкие хвосты не должны висеть на чистом предмете. */
  clearAll() {
    this.ctx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
    this.grid.fill(0);
    this.dirty = 0;
    this.needsFlush = true;
  }

  /** Для проверок: настоящая доля непрозрачных пикселей маски (медленно — читает canvas). */
  measureAlpha(): number {
    const d = this.ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) sum += d[i];
    return sum / (MASK_SIZE * MASK_SIZE * 255);
  }

  dispose() {
    this.texture.dispose();
  }
}
