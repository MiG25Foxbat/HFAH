/**
 * Модели персонажей: один GLB на категорию (public/models/<id>.glb, meshopt-сжатие, декодер из three, без CDN).
 * Кэш — на модуль: загруженное остаётся в кэше, ошибка не кэшируется (повтор = новый запрос с отметкой в URL).
 * Без Suspense: сцена сама решает, что показывать, пока модель грузится («побеждает последний выбор»).
 */
import { Cache, type AnimationClip, type Group } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { CategoryId } from "@/lib/catalog";

export const modelUrl = (id: CategoryId) => `/models/${id}.glb`;

export type CharacterAsset = { scene: Group; animations: AnimationClip[] };

type Entry = { status: "loading"; promise: Promise<CharacterAsset> } | { status: "ready"; asset: CharacterAsset };

const entries = new Map<CategoryId, Entry>();
const attempts = new Map<CategoryId, number>();
let loader: GLTFLoader | null = null;

function getLoader() {
  return (loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder));
}

function urlFor(id: CategoryId) {
  const n = attempts.get(id) ?? 0;
  // Повтор обходит HTTP-кэш браузера (в нём мог остаться ответ 404/5xx).
  return n === 0 ? modelUrl(id) : `${modelUrl(id)}?retry=${n}`;
}

/** Синхронно: загруженный ассет или null. */
export function peekCharacter(id: CategoryId): CharacterAsset | null {
  const e = entries.get(id);
  return e?.status === "ready" ? e.asset : null;
}

export function loadCharacter(id: CategoryId): Promise<CharacterAsset> {
  const hit = entries.get(id);
  if (hit?.status === "ready") return Promise.resolve(hit.asset);
  if (hit?.status === "loading") return hit.promise;

  const promise = getLoader()
    .loadAsync(urlFor(id))
    .then((gltf) => {
      const asset = { scene: gltf.scene, animations: gltf.animations };
      entries.set(id, { status: "ready", asset });
      return asset;
    })
    .catch((error: unknown) => {
      entries.delete(id);
      throw error;
    });
  entries.set(id, { status: "loading", promise });
  return promise;
}

/** «Повторить»: сбрасывает запись кэша для этой модели, следующая загрузка идёт заново. */
export function clearCharacter(id: CategoryId) {
  entries.delete(id);
  Cache.remove(modelUrl(id));
  attempts.set(id, (attempts.get(id) ?? 0) + 1);
}
