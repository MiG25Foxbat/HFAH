// Запросто: service worker. Только офлайн-экран и быстрые статические файлы, ничего приватного не кешируется.
// Изменили логику или файлы офлайн-страницы — поднимите VERSION: старые кеши удалятся при активации.
const VERSION = "v2";
const SHELL = `zaprosto-shell-${VERSION}`; // /offline, её стили и скрипты, значки: не обрезается
const ASSETS = `zaprosto-assets-${VERSION}`; // всё остальное статическое, обрезается до MAX_ASSETS
const MAX_ASSETS = 150;
const BRAND = ["/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

// Никогда не кешируем и не трогаем (кроме показа /offline вместо страницы без сети): API, кабинет, заявки по ссылке, оформление.
const PRIVATE = /^\/(api|admin|o|checkout)(\/|$)/;
// Статика: имена в /_next/static/ содержат хеш содержимого, остальное — обычные файлы.
const STATIC = /^\/(_next\/static|models|posters|icons)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys() // ladno- — кеши прежнего названия
      .then((keys) => Promise.all(keys.filter((k) => /^(ladno|zaprosto)-/.test(k) && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || req.headers.has("range")) return;

  // Страницы: сеть, а без сети — /offline (сами страницы не кешируются).
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match("/offline")) || Response.error()));
    return;
  }
  if (PRIVATE.test(url.pathname)) return;
  if (STATIC.test(url.pathname) || req.destination === "font") event.respondWith(fromCache(event, req, url));
});

async function precache() {
  const cache = await caches.open(SHELL);
  const res = await fetch("/offline", { cache: "reload" });
  if (!res.ok) throw new Error(`/offline: ${res.status}`);
  // чтобы офлайн-страница выглядела как обычно, забираем и её стили, скрипты и шрифты
  const assets = [...new Set((await res.clone().text()).match(/\/_next\/static\/[^"'\\\s)]+/g) || [])];
  await cache.put("/offline", res);
  await Promise.allSettled([...BRAND, ...assets].map((u) => cache.add(u)));
}

// Файлы с хешем в имени неизменны: сначала кеш. Остальные (модели, постеры, значки) отдаём из кеша сразу и обновляем в фоне,
// чтобы подмена файла владельцем дошла до клиентов без смены VERSION.
async function fromCache(event, req, url) {
  const hit = await caches.match(req);
  if (hit && url.pathname.startsWith("/_next/static/")) return hit;
  const fresh = fetch(req).then(async (res) => {
    if (res.status === 200) {
      const cache = await caches.open(ASSETS);
      await cache.put(req, res.clone());
      await trim(cache);
    }
    return res;
  });
  if (hit) {
    event.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}
