"use client";

import { useEffect } from "react";

/**
 * Регистрирует /sw.js только в production. В разработке, наоборот, снимает старую регистрацию (если на этом адресе раньше
 * запускали production-сборку): иначе кеш в духе cache-first отдавал бы устаревшие файлы горячей перезагрузки. Ничего не рисует.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => void r.unregister()));
      return;
    }
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    // после загрузки страницы, чтобы установка кеша не мешала первой отрисовке
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
