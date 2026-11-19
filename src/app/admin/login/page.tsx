import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getOwnerSession } from "@/lib/server/auth";

export const metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <p className="font-display text-3xl">ладно</p>
      <h1 className="mt-8 text-[1.625rem] font-semibold">Вход в кабинет</h1>
      <p className="mt-2 text-muted">Только для владельца компании. Пароль задаётся при установке.</p>
      <LoginForm />
    </main>
  );
}

/** Уже вошли — сразу в кабинет. */
async function RedirectIfSignedIn() {
  if (await getOwnerSession()) redirect("/admin");
  return null;
}
