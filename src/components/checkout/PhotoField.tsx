"use client";
import { useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/controls";
import { CameraIcon, TrashIcon } from "@/components/ui/icons";
import { MAX_PHOTOS, type PhotoItem } from "@/lib/checkout";
import { draftUpdate, getDraft } from "@/lib/draft-store";
import { PHOTO_ACCEPT, PhotoError, checkPhotoFile, deleteUpload, preparePhoto, uploadPhoto, UploadError } from "@/lib/photo-client";
import { uuid4 } from "@/lib/uuid";

/** Сжатые файлы текущей сессии: нужны для «Повторить». После перезагрузки их нет — тогда фото добавляют заново. */
const blobs = new Map<string, Blob>();

const patch = (lid: string, p: Partial<PhotoItem>) => draftUpdate((d) => ({ ...d, photos: d.photos.map((x) => (x.lid === lid ? { ...x, ...p } : x)) }));

async function upload(lid: string) {
  const blob = blobs.get(lid);
  if (!blob) return;
  patch(lid, { status: "uploading", progress: 0, error: undefined });
  try {
    const r = await uploadPhoto(blob, "photo.jpg", (progress) => patch(lid, { progress }));
    patch(lid, { status: "done", progress: 100, ref: { id: r.id, key: r.key }, uploadedAt: Date.now(), error: undefined });
  } catch (e) {
    patch(lid, { status: "error", error: e instanceof UploadError ? e.message : "Не удалось загрузить фото. Повторите попытку." });
  }
}

async function addOne(file: File) {
  const lid = uuid4();
  draftUpdate((d) => ({ ...d, photos: [...d.photos, { lid, name: file.name, thumb: "", status: "uploading", progress: 0 }] }));
  try {
    const { blob, thumb } = await preparePhoto(file);
    blobs.set(lid, blob);
    patch(lid, { thumb });
    await upload(lid);
  } catch (e) {
    patch(lid, { status: "error", error: e instanceof PhotoError ? e.message : "Не удалось обработать фото." });
  }
}

function remove(photo: PhotoItem) {
  if (photo.ref) deleteUpload(photo.ref);
  blobs.delete(photo.lid);
  draftUpdate((d) => ({ ...d, photos: d.photos.filter((x) => x.lid !== photo.lid) }));
}

/** До трёх фото: проверка формата, уменьшение, загрузка с прогрессом, повтор после ошибки, удаление. Список переживает перезагрузку. */
export function PhotoField({ photos, required, error, onChanged }: { photos: PhotoItem[]; required: boolean; error?: string; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");

  const onFiles = (list: FileList | null) => {
    onChanged();
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    const room = MAX_PHOTOS - getDraft().photos.length;
    const messages: string[] = [];
    if (files.length > room) messages.push(`Можно приложить не больше ${MAX_PHOTOS} фото.`);
    for (const f of files.slice(0, Math.max(0, room))) {
      const bad = checkPhotoFile(f);
      if (bad) messages.push(bad);
      else void addOne(f);
    }
    setNotice(messages.join(" "));
  };

  return (
    // min-w-0 по всей цепочке: иначе длинное имя файла или кнопка «Повторить» растягивают дорожку сетки формы шире экрана (390 px → 426 px)
    <div className="grid min-w-0 gap-3">
      {photos.length > 0 && (
        <ul className="grid min-w-0 gap-2">
          {photos.map((p, i) => (
            <li key={p.lid} className="flex min-w-0 items-center gap-3 rounded-field border border-line bg-surface p-2" data-photo-status={p.status}>
              <div className="size-16 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
                {p.thumb && (
                  // dataURL-превью из черновика: next/image здесь не нужен
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt={`Фото ${i + 1}`} width={64} height={64} className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div aria-live="polite">
                  <p className="truncate text-[0.9375rem] font-medium">{p.name || `Фото ${i + 1}`}</p>
                  {p.status === "uploading" && (
                    <>
                      <div role="progressbar" aria-label={`Загрузка фото ${i + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.progress} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(4, p.progress)}%` }} />
                      </div>
                      <p className="mt-1 text-[0.8125rem] text-muted tabular-nums">{p.thumb ? `Загружаем: ${p.progress}%` : "Готовим фото…"}</p>
                    </>
                  )}
                  {p.status === "done" && <p className="text-[0.8125rem] text-ok">Загружено</p>}
                  {p.status === "error" && <p className="break-words text-[0.8125rem] leading-snug text-danger">{p.error}</p>}
                </div>
                {/* «Повторить» под текстом ошибки, а не в строке: в строке на 390 px от текста оставалось ~45 px */}
                {p.status === "error" && blobs.has(p.lid) && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onChanged();
                      void upload(p.lid);
                    }}
                    className="mt-2 min-h-11 px-3 text-[0.9375rem]"
                  >
                    Повторить
                  </Button>
                )}
              </div>
              <IconButton
                label={`Удалить фото ${i + 1}`}
                onClick={() => {
                  remove(p);
                  onChanged();
                }}
              >
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {photos.length < MAX_PHOTOS && (
        <Button variant="secondary" data-field="photos" onClick={() => input.current?.click()} aria-describedby="photos-hint" className="w-full justify-start gap-3 border-dashed">
          <CameraIcon />
          {photos.length ? "Добавить ещё фото" : "Добавить фото"}
        </Button>
      )}
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} tabIndex={-1} aria-hidden="true" />

      <p id="photos-hint" className="text-[0.8125rem] leading-snug text-muted">
        До {MAX_PHOTOS} фото, JPEG, PNG или WebP. {required ? "Для задачи «Другое» нужно хотя бы одно фото: по нему мастер оценит работу." : "Фото места работы помогают мастеру заранее понять, что нужно взять с собой."}
      </p>
      <div aria-live="polite">
        {notice && <p className="text-[0.875rem] leading-snug text-danger">{notice}</p>}
        {error && <p id="photos-err" className="text-[0.875rem] leading-snug text-danger">{error}</p>}
      </div>
    </div>
  );
}
