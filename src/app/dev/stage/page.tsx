import { notFound } from "next/navigation";
import { StageDev } from "./client";

/** Только для разработки: стенд сцены с переключателями. В production — 404. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StageDev />;
}
