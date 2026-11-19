"use client";
/** Фото в браузере: проверка формата, уменьшение до ≤ 2000 px (JPEG) и превью, загрузка с прогрессом, удаление. */

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIDE = 2000;
const THUMB_SIDE = 192;

/** null — файл подходит; иначе понятное сообщение. HEIC браузер не декодирует, поэтому говорим об этом прямо. */
export function checkPhotoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /^image\/hei[cf]/.test(file.type)) {
    return "Формат HEIC не поддерживается. Выберите JPEG, PNG или WebP; на iPhone включите «Наиболее совместимые» в настройках камеры.";
  }
  if (!OK_TYPES.has(file.type)) return "Подходят только фото в форматах JPEG, PNG и WebP.";
  return null;
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // старые браузеры не знают значение «from-image» (но и сами применяют поворот из EXIF)
    return await createImageBitmap(file);
  }
}

function render(bitmap: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#fff"; // прозрачные PNG не должны стать чёрными
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", quality));

export class PhotoError extends Error {}

/** Готовит файл к загрузке: JPEG ≤ 2000 px по большей стороне с учётом поворота из EXIF + превью-dataURL. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; thumb: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new PhotoError("Не удалось прочитать фото. Выберите другой файл: JPEG, PNG или WebP.");
  }
  try {
    const blob = await toBlob(render(bitmap, MAX_SIDE), 0.85);
    const thumb = render(bitmap, THUMB_SIDE).toDataURL("image/jpeg", 0.7);
    return { blob, thumb };
  } catch {
    throw new PhotoError("Не удалось обработать фото. Попробуйте другое.");
  } finally {
    bitmap.close();
  }
}

export interface Uploaded {
  id: string;
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export class UploadError extends Error {}

function uploadMessage(status: number, body: { error?: string } | null): string {
  if (status === 413) return "Файл слишком большой. Выберите фото поменьше.";
  if (status === 415) return "Не удалось распознать фото: нужен настоящий JPEG, PNG или WebP.";
  if (status === 429) return "Слишком много загрузок подряд. Подождите немного и повторите.";
  if (status === 403) return "Запрос отклонён. Обновите страницу и повторите.";
  return body?.error && status < 500 ? body.error : "Не удалось загрузить фото. Повторите попытку.";
}

/** POST /api/uploads через XHR: нужен прогресс отправки. */
export function uploadPhoto(blob: Blob, filename: string, onProgress: (percent: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "json";
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      const body = xhr.response as (Uploaded & { error?: string }) | null;
      if (xhr.status === 201 && body?.id && body.key) resolve(body);
      else reject(new UploadError(uploadMessage(xhr.status, body)));
    };
    xhr.onerror = () => reject(new UploadError("Нет соединения. Проверьте интернет и повторите."));
    xhr.ontimeout = () => reject(new UploadError("Загрузка идёт слишком долго. Повторите попытку."));
    const form = new FormData();
    form.append("file", blob, filename);
    xhr.send(form);
  });
}

/** Удаляет ещё не прикреплённое фото на сервере. Ошибки не показываем: на экране фото уже убрано. */
export function deleteUpload(ref: { id: string; key: string }): void {
  fetch(`/api/uploads/${ref.id}`, { method: "DELETE", headers: { "X-Upload-Key": ref.key }, keepalive: true }).catch(() => {});
}
