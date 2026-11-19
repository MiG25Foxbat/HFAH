"use client";
// Временная заглушка. Настоящую 3D-сцену делает отдельный инженер (src/components/stage/*).
// Контракт: <Stage category={id} characters={settings.characters} /> — клиентский компонент,
// сам грузит 3D лениво, показывает постер при загрузке и без WebGL. Высоту задаёт родитель.
import type { CategoryId } from "@/lib/catalog";
import type { Settings } from "@/lib/settings";

export type StageProps = {
  category: CategoryId;
  characters: Settings["characters"];
  className?: string;
};

export function Stage({ category, className }: StageProps) {
  return <div className={className} data-stage-placeholder={category} aria-hidden />;
}
