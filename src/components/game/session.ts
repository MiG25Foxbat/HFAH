/**
 * Одна партия игры: экземпляр персонажа, маска налёта и ввод. Без React: компонент сцены только создаёт сессию,
 * зовёт update() из кадра и dispose() при закрытии.
 *
 * Ввод: на обёртке canvas слушатели в фазе перехвата. В режиме «Чистка» палец/мышь стирают налёт, и событие дальше
 * не идёт (поворот Rig его не видит); в режиме «Поворот» события проходят к Rig как есть, чистки нет.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { CharacterAsset } from "@/components/stage/assets";
import type { RigApi } from "@/components/stage/rig";
import { DONE_AT, Grime, MASK_SIZE, MODEL_H, uvPerWorld } from "./grime";
import { buildPickParts, disposePickParts } from "./pick";
import { computeReach } from "./reach";

export type Mode = "clean" | "rotate";

const BRUSH_PX: Record<string, number> = { mouse: 22, pen: 22, touch: 30 };
const STEP_K = 0.3; // шаг штампов вдоль штриха — доля радиуса кисти
const MAX_DABS = 24; // лимит лучей на одно событие: быстрые взмахи не должны подвешивать кадр
const FADE_S = 0.45;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _ndc = new THREE.Vector2();

export type SessionOptions = {
  /** Ключ персонажа (CharacterKey): от него зависят виды пятен и ракурс первых пятен. */
  category: string;
  asset: CharacterAsset;
  faces: boolean;
  reduced: boolean;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  gl: THREE.WebGLRenderer;
  invalidate: () => void;
  rigApi: () => RigApi | null;
  /** Целые проценты 0…100. */
  onProgress: (percent: number) => void;
  onDone: () => void;
};

export class Session {
  readonly pivot = new THREE.Group();
  grime!: Grime; // создаётся в create(): маске нужен асинхронный расчёт достижимости
  mode: Mode = "clean";
  done = false;

  private root: THREE.Group;
  private body: THREE.Mesh;
  private parts: THREE.Mesh[] = [];
  private partSet = new Set<THREE.Object3D>();
  private bodyMat: THREE.MeshStandardMaterial;
  private blockers: THREE.Mesh[] = [];
  private mats: THREE.Material[] = [];
  private face: THREE.Object3D | null;
  private lids: THREE.Object3D[];
  private mixer: THREE.AnimationMixer;
  private idle?: THREE.AnimationAction;
  private wave?: THREE.AnimationAction;
  private blink?: THREE.AnimationAction;
  private nextBlink = 3;
  private clock = 0;
  private raycaster = new THREE.Raycaster();
  private fading = false;
  private reported = 0;

  private host: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private unbind: (() => void) | null = null;
  private pid = -1;
  private pointerType = "mouse";
  private last: { x: number; y: number } | null = null;
  private k = 0; // сглаженный масштаб UV на единицу длины

  static async create(o: SessionOptions): Promise<Session> {
    const s = new Session(o);
    s.grime = new Grime(o.category, s.body, s.parts, s.blockers, s.bodyMat, await computeReach(o.gl, s.pivot, s.body, MASK_SIZE));
    return s;
  }

  private constructor(private o: SessionOptions) {
    const root = SkeletonUtils.clone(o.asset.scene) as THREE.Group;
    this.root = root;
    const owned = new Map<THREE.Material, THREE.Material>();
    const own = (m: THREE.Material) => {
      let c = owned.get(m);
      if (!c) {
        c = m.clone();
        owned.set(m, c);
        this.mats.push(c);
      }
      return c;
    };
    const meshes: THREE.Mesh[] = [];
    root.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
      meshes.push(m);
    });
    const body = root.getObjectByName("Body") as THREE.Mesh | undefined;
    if (!body?.isMesh || !body.geometry.getAttribute("uv")) throw new Error("В модели нет меша Body с UV");
    this.body = body;
    this.blockers = meshes.filter((m) => m !== body);
    // Материал Body в модели может делить с другими деталями (веки, ножки): налёт нужен только на нём.
    const bodyMat = (body.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
    body.material = bodyMat;
    this.mats.push(bodyMat);
    this.bodyMat = bodyMat;
    this.parts = buildPickParts(body);
    this.partSet = new Set(this.parts);

    // Узлы не трогаем (в оптимизированных мешах там деквантование): только общая группа.
    const fit = new THREE.Group();
    fit.add(root);
    fit.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fit);
    const h = box.max.y - box.min.y;
    if (h > 0.01) {
      const k = MODEL_H / h;
      fit.scale.setScalar(k);
      fit.position.y = -box.min.y * k;
    }
    this.pivot.add(fit);
    this.pivot.updateMatrixWorld(true);

    this.face = root.getObjectByName("Face") ?? null;
    this.lids = ["Lid_L", "Lid_R"].map((n) => root.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
    this.setFaces(o.faces);

    this.mixer = new THREE.AnimationMixer(root);
    const action = (name: string, once: boolean) => {
      const clip = THREE.AnimationClip.findByName(o.asset.animations, name);
      if (!clip) return undefined;
      const a = this.mixer.clipAction(clip);
      if (once) a.setLoop(THREE.LoopOnce, 1);
      return a;
    };
    this.idle = action("Idle", false);
    this.wave = action("Wave", true);
    this.blink = action("Blink", true);
    this.idle?.reset().play();
    if (this.idle) this.idle.paused = o.reduced;
    this.mixer.update(0);
    this.pivot.updateMatrixWorld(true);
  }

  // --- ввод ---------------------------------------------------------------------------------------

  /** `host` — элемент над canvas (обёртка R3F), `ring` — DOM-кольцо кисти поверх сцены. */
  bind(host: HTMLElement, ring: HTMLElement | null) {
    this.host = host;
    this.ring = ring;
    host.style.touchAction = "none"; // пересечение с pan-y у canvas даёт none: страница под игрой не прокручивается
    const opts = { capture: true } as const;
    const onDown = (e: PointerEvent) => {
      if (this.mode !== "clean" || this.done) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      if (this.pid !== -1) return; // второй палец не чистит и не вращает
      e.preventDefault();
      this.pid = e.pointerId;
      this.pointerType = e.pointerType;
      this.last = null;
      this.k = 0;
      host.setPointerCapture(e.pointerId);
      this.moveRing(e.clientX, e.clientY, true);
      this.stroke(e.clientX, e.clientY);
      this.afterErase();
    };
    const onMove = (e: PointerEvent) => {
      if (this.mode !== "clean") return;
      if (e.pointerId === this.pid) {
        e.stopPropagation();
        const list = e.getCoalescedEvents?.() ?? [];
        for (const ev of list.length ? list : [e]) this.stroke(ev.clientX, ev.clientY);
        this.moveRing(e.clientX, e.clientY, true);
        this.afterErase();
      } else if (this.pid === -1 && e.pointerType === "mouse" && !this.done) {
        this.pointerType = "mouse";
        this.moveRing(e.clientX, e.clientY, true); // кольцо следует за мышью и без нажатия
      }
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== this.pid) return;
      e.stopPropagation();
      this.pid = -1;
      this.last = null;
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      if (e.pointerType !== "mouse") this.moveRing(0, 0, false);
    };
    const onLeave = () => this.moveRing(0, 0, false);
    host.addEventListener("pointerdown", onDown, opts);
    host.addEventListener("pointermove", onMove, opts);
    host.addEventListener("pointerup", onEnd, opts);
    host.addEventListener("pointercancel", onEnd, opts);
    host.addEventListener("pointerleave", onLeave);
    this.unbind = () => {
      host.removeEventListener("pointerdown", onDown, opts);
      host.removeEventListener("pointermove", onMove, opts);
      host.removeEventListener("pointerup", onEnd, opts);
      host.removeEventListener("pointercancel", onEnd, opts);
      host.removeEventListener("pointerleave", onLeave);
    };
    this.setMode(this.mode);
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.pid = -1;
    this.last = null;
    if (mode !== "clean") this.moveRing(0, 0, false);
    if (this.host) this.host.style.cursor = mode === "clean" && !this.done ? "crosshair" : "grab";
  }

  private brushPx() {
    return BRUSH_PX[this.pointerType] ?? 22;
  }

  private moveRing(x: number, y: number, visible: boolean) {
    const ring = this.ring;
    if (!ring) return;
    if (!visible || this.done) {
      ring.style.opacity = "0";
      return;
    }
    const rect = this.o.canvas.getBoundingClientRect();
    const r = this.brushPx();
    ring.style.width = ring.style.height = `${r * 2}px`;
    ring.style.transform = `translate3d(${Math.round(x - rect.left - r)}px, ${Math.round(y - rect.top - r)}px, 0)`;
    ring.style.opacity = "1";
  }

  /** Штрих от прошлой точки до этой: по экрану режем на шаги, каждый шаг — свой луч в Body и свой штамп. */
  private stroke(x: number, y: number) {
    const from = this.last;
    this.last = { x, y };
    if (!from) return this.dab(x, y);
    const len = Math.hypot(x - from.x, y - from.y);
    const step = Math.max(this.brushPx() * STEP_K, len / MAX_DABS);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.dab(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
    }
  }

  private dab(clientX: number, clientY: number) {
    const rect = this.o.canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.pivot.updateMatrixWorld(true);
    this.raycaster.setFromCamera(_ndc, this.o.camera);
    const hit = this.probe();
    if (!hit) return;
    const worldPerPx = (2 * hit.distance * Math.tan(THREE.MathUtils.degToRad(this.o.camera.fov / 2))) / rect.height;
    this.eraseHit(hit, this.brushPx() * worldPerPx);
  }

  /** Луч (уже заданный в raycaster) → попадание в Body, если его не закрывают другие части персонажа. */
  probe(): THREE.Intersection | null {
    const rc = this.raycaster;
    rc.far = Infinity;
    const hit = rc.intersectObjects(this.parts, false)[0];
    if (!hit?.face || !hit.uv) return null;
    rc.far = hit.distance - 0.003;
    const blocked = rc.intersectObjects(this.blockers, false).length > 0;
    rc.far = Infinity;
    return blocked ? null : hit;
  }

  /** Стирает налёт вокруг попадания; радиус кисти в мире (единицы сцены) переводится в UV по плотности грани. */
  eraseHit(hit: THREE.Intersection, worldRadius: number) {
    const k = hit.face ? uvPerWorld(hit.object as THREE.Mesh, hit.face) : 0;
    if (k > 0) this.k = this.k === 0 ? k : this.k + (k - this.k) * 0.5;
    if (!this.k || !hit.uv) return;
    this.grime.erase(hit.uv.x, hit.uv.y, THREE.MathUtils.clamp(worldRadius * this.k * MASK_SIZE, 3, 80));
  }

  /** Проверяет проценты и победу; зовётся после серии штампов. */
  afterErase() {
    if (this.done) return;
    const p = this.grime.progress();
    const pct = p >= DONE_AT ? 100 : Math.min(99, Math.floor(p * 100));
    if (pct !== this.reported) {
      this.reported = pct;
      this.o.onProgress(pct);
    }
    if (p >= DONE_AT) this.complete();
    this.o.invalidate();
  }

  private complete() {
    this.done = true;
    this.pid = -1;
    this.moveRing(0, 0, false);
    if (this.host) this.host.style.cursor = "grab";
    if (this.o.reduced) {
      this.grime.fade.value = 0;
      this.grime.clearAll();
    } else {
      this.fading = true;
      this.wave?.reset().play();
    }
    this.o.rigApi()?.reset();
    this.o.onDone();
  }

  // --- кадр и состояние -----------------------------------------------------------------------------

  /** Из useFrame. Возвращает true, пока что-то движется и нужны следующие кадры. */
  update(dt: number): boolean {
    this.clock += dt;
    this.mixer.update(dt);
    if (this.fading) {
      this.grime.fade.value = Math.max(0, this.grime.fade.value - dt / FADE_S);
      if (this.grime.fade.value === 0) {
        this.fading = false;
        this.grime.clearAll();
      }
    }
    if (!this.done && this.clock >= this.nextBlink) {
      if (this.face?.visible) this.blink?.reset().play();
      this.nextBlink = this.clock + (this.o.reduced ? rand(8, 14) : rand(3, 7));
    }
    this.grime.flush(); // не чаще раза за кадр
    return this.fading || !!this.wave?.isRunning() || !!this.blink?.isRunning();
  }

  setFaces(on: boolean) {
    if (this.face) this.face.visible = on;
    for (const l of this.lids) l.visible = on;
  }

  setReduced(reduced: boolean) {
    this.o = { ...this.o, reduced };
    if (this.idle) this.idle.paused = reduced;
  }

  /** Есть ли непрерывная анимация покоя (для рендера по требованию). */
  get idling() {
    return !this.o.reduced && !!this.idle;
  }

  /** Для проверок: попадание луча камеры в экранную точку. */
  screenHit(clientX: number, clientY: number): THREE.Intersection | null {
    const rect = this.o.canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.pivot.updateMatrixWorld(true);
    this.raycaster.setFromCamera(_ndc, this.o.camera);
    return this.probe();
  }

  canvasRect() {
    return this.o.canvas.getBoundingClientRect();
  }

  get raycasterRef() {
    return this.raycaster;
  }

  dispose() {
    this.unbind?.();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.grime?.dispose();
    disposePickParts(this.body, this.parts);
    for (const m of this.mats) m.dispose(); // клоны материалов; геометрия — общая, из кэша
    this.moveRing(0, 0, false);
    if (this.host) this.host.style.cursor = "";
  }
}
