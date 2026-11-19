import { Suspense } from "react";
import { CharactersForm } from "@/components/admin/GameForms";
import { PageHeader } from "@/components/admin/ui";
import { ensureOwner } from "@/lib/server/admin/guard";
import { getSettings } from "@/lib/server/settings";
import { PHRASES, type Personality } from "@/lib/phrases";

export const metadata = { title: "Персонажи" };
// Страница зависит от сеанса владельца: без него она не рендерится, мгновенный переход для неё не проверяется.
export const instant = false;

// Примеры — из тех же заготовок, что показывает сайт: по одной реплике про мебель и сантехнику.
const samples = Object.fromEntries(
  (["calm", "cheerful", "business"] as const).map((p) => [p, [PHRASES.furniture[p][0], PHRASES.plumbing[p][0]]]),
) as Record<Personality, string[]>;

export default function CharactersPage() {
  return (
    <>
      <PageHeader title="Персонажи" lead="Характер и то, что показывать у персонажей. Модели и их внешний вид меняются в исходниках." />
      <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse rounded-panel bg-surface-2" />}>
        <Characters />
      </Suspense>
    </>
  );
}

async function Characters() {
  await ensureOwner();
  const { characters } = await getSettings();
  return <CharactersForm initial={characters} samples={samples} />;
}
