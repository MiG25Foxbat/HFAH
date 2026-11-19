"use client";

import { useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Spinner, button } from "./ui";

/**
 * Удаление с подтверждением: кнопка открывает окно, где прямо названы последствия. «Удалить» закрывает окно и вызывает onConfirm;
 * результат (успех или причина отказа) показывает вызывающий компонент.
 */
export function ConfirmDelete({
  label,
  ariaLabel,
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
}: {
  label: string;
  ariaLabel: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" aria-label={ariaLabel} onClick={() => dialog.current?.showModal()} className={button("danger", "sm")}>
        <Icon name="trash" className="size-4" />
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className="m-auto w-[min(92vw,30rem)] overscroll-contain rounded-panel border border-line bg-surface p-6 text-ink backdrop:bg-black/50"
      >
        <h2 id={`${id}-title`} className="text-balance text-[1.25rem] font-semibold">
          {title}
        </h2>
        <div id={`${id}-text`} className="mt-3 text-[0.9375rem]">
          {children}
        </div>
        <div className="mt-5 grid gap-3 min-[420px]:grid-cols-2">
          <button type="button" onClick={() => dialog.current?.close()} className={button("secondary")}>
            Отмена
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              dialog.current?.close();
              onConfirm();
            }}
            className={button("dangerSolid")}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
