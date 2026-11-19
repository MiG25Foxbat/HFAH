import { notFound } from "next/navigation";
import { GameDev } from "./client";

/** Только для разработки: стенд игры. ?token=<токен заявки>&mode=off|play|bonus. В production — 404. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GameDev />;
}
