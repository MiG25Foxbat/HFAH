"""
E2E публичных страниц, SEO и PWA «Запросто»: /uslugi, /contacts, /privacy, /credits, /offline, metadata, sitemap, robots, manifest, service worker.
Запуск против production-сборки (service worker регистрируется только в ней):
  NEXT_DIST_DIR=.next-pwa npm run build && NEXT_DIST_DIR=.next-pwa npx next start -p 3106
  BASE_URL=http://127.0.0.1:3106 python e2e/test_pwa_seo.py
Переменные: BASE_URL (по умолчанию http://127.0.0.1:3106); DATABASE_URL — та же база, на которую смотрит сервер (по умолчанию hfah_pwa);
EXPECT_ORIGIN — APP_ORIGIN, с которым собран сервер (по умолчанию http://localhost:3000). Скриншоты — e2e/screenshots/info-*.png.
Сценарий «с контактами» временно пишет вымышленные контакты в settings и возвращает пустые.
"""

import json
import os
import re
import struct
import subprocess
import sys
import traceback
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3106").rstrip("/")
DB_URL = os.environ.get("DATABASE_URL", "postgres://hfah:hfah_dev_pw@127.0.0.1:54329/hfah_pwa")
ORIGIN = os.environ.get("EXPECT_ORIGIN", "http://localhost:3000").rstrip("/")
SHOTS = os.path.join(HERE, "screenshots")
os.makedirs(SHOTS, exist_ok=True)
NB = chr(160)  # неразрывный пробел, как в formatRub
RESULTS = []


def db(sql):
    r = subprocess.run(["node", os.path.join(HERE, "dbq.mjs"), sql], env={**os.environ, "DATABASE_URL": DB_URL}, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def rub(n):
    return f"{n:,}".replace(",", NB) + NB + "₽"


def fetch(path, headers=None):
    """GET без JavaScript и cookie: (статус, заголовки в нижнем регистре, тело)."""
    req = urllib.request.Request(BASE + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def html(path):
    status, _, body = fetch(path)
    assert status == 200, f"{path}: статус {status}"
    return body.decode("utf-8")


def png_size(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "не PNG"
    return struct.unpack(">II", data[16:24])


def scenario(fn):
    def run(browser):
        try:
            fn(browser)
            RESULTS.append((fn.__name__, True, ""))
            print(f"  ok   {fn.__name__}")
        except Exception as e:  # noqa: BLE001
            RESULTS.append((fn.__name__, False, str(e)))
            print(f"  FAIL {fn.__name__}: {e}")
            traceback.print_exc()

    run.__name__ = fn.__name__
    return run


def set_contacts(phone="", telegram="", whatsapp="", email=""):
    value = json.dumps({"phone": phone, "telegram": telegram, "whatsapp": whatsapp, "email": email}, ensure_ascii=False).replace("'", "''")
    db(f"update settings set company = jsonb_set(company, '{{contacts}}', '{value}'::jsonb) where id = 1 returning 1")


def new_page(browser, w=390, h=844, scheme="light"):
    ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, locale="ru-RU", timezone_id="Europe/Moscow")
    page = ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: page.errors.append(f"console.error: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
    return page


def sw_ready(page):
    """Ждёт активный service worker и перезагружает страницу, чтобы она оказалась под его управлением."""
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.reload(wait_until="networkidle")
    page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)


def cache_urls(page):
    """Пути всех запросов во всех кешах (Cache Storage) с именами кешей."""
    return page.evaluate(
        """async () => {
          const out = [];
          for (const name of await caches.keys()) {
            const c = await caches.open(name);
            for (const r of await c.keys()) out.push([name, new URL(r.url).pathname + new URL(r.url).search]);
          }
          return out;
        }"""
    )


def add_via_deeplink(page, title):
    page.goto(BASE + "/uslugi", wait_until="networkidle")
    page.get_by_role("link", name=f"Выбрать: {title}").click()
    dialog = page.locator("dialog[open]")
    dialog.wait_for(state="visible")
    dialog.get_by_role("button", name="Добавить в корзину").click()
    page.wait_for_function("localStorage.getItem('zaprosto-cart-v1') !== null")


# ---------------------------------------------------------------------------------------------------------------------------------------------
@scenario
def a_server_rendered_content(browser):
    set_contacts()  # демо-состояние: контакты не указаны
    services = db("select id, category, title, price, unit, pricing from services where active")
    settings = db("select company, pricing from settings")[0]
    pr = settings["pricing"]
    units = {"pcs": "шт", "m": "пог. м", "m2": "м²", "hour": "ч"}

    uslugi = html("/uslugi")  # без JavaScript: сырой HTML ответа
    assert len(re.findall(r"<h1[ >]", uslugi)) == 1 and "Услуги и цены" in uslugi, "h1 /uslugi"
    assert '<main id="main"' in uslugi
    for s in services:
        assert s["title"] in uslugi, f"нет работы «{s['title']}» в HTML"
        if s["pricing"] == "fixed":
            assert f"{rub(s['price'])} за {units[s['unit']]}" in uslugi, f"нет цены {s['id']}"
    assert f"{rub(pr['hourRate'])} за ч" in uslugi, "цена часа"
    assert "По фото" in uslugi, "работа «По фото»"
    links = re.findall(r'href="/\?c=([a-z]+)&amp;add=([a-z0-9-]+)"', uslugi)
    assert len(links) == len(services), f"ссылок «Выбрать»: {len(links)} из {len(services)}"
    assert {i for _, i in links} == {s["id"] for s in services}
    assert "Материалы и запчасти не входят в цену" in uslugi
    for needle in [f"+{pr['complexPct']}{NB}%", f"+{pr['dismantlePct']}{NB}%", f"+{pr['urgentPct']}{NB}%", rub(pr["minOrder"]), f"+{rub(pr['outOfTownFee'])}"]:
        assert needle in uslugi, f"нет значения из настроек: {needle!r}"
    assert "Чего мы не делаем" in uslugi
    for e in settings["company"]["excluded"]:
        assert e["title"] in uslugi, f"нет «не делаем»: {e['title']}"
    assert "≈" in uslugi and "на шт" in uslugi, "норма времени"

    contacts = html("/contacts")
    assert len(re.findall(r"<h1[ >]", contacts)) == 1 and ">Контакты<" in contacts
    assert "Контакты компании ещё не указаны владельцем" in contacts, "честное пустое состояние"
    assert "Оставить заявку" in contacts
    assert 'href="tel:' not in contacts and 'href="mailto:' not in contacts and "t.me" not in contacts, "заглушка выдана за контакт"
    assert settings["company"]["city"] in contacts and settings["company"]["territory"] in contacts

    privacy = html("/privacy")
    assert "Политика обработки персональных данных" in privacy
    assert "Заполните реквизиты оператора перед запуском" in privacy and "[не заполнено]" in privacy
    for needle in ["152-ФЗ", "localStorage", "Cookie", "фото", "Кому мы передаём данные", "Ваши права", "Сколько данные хранятся"]:
        assert needle in privacy, f"в политике нет «{needle}»"
    assert "ООО" not in privacy.split("Заполните реквизиты")[1][:3000].replace("ООО «Название»", ""), "выдуманное юрлицо"

    credits = html("/credits")
    for needle in ["Golos Text", "Unbounded", "SIL Open Font License", "three.js", "React Three Fiber", "drei", "Next.js", "Motion", "sharp", "postgres", "Unlicense", "Apache-2.0", "zod", "CC0", "с нуля"]:
        assert needle in credits, f"в источниках нет «{needle}»"
    for page_html in (uslugi, contacts, privacy, credits):
        assert page_html.count('<main id="main"') == 1


@scenario
def b_choose_deeplink_opens_add_sheet(browser):
    page = new_page(browser)
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.goto(BASE + "/uslugi", wait_until="networkidle")
    page.get_by_role("link", name="Выбрать: Замена смесителя").click()
    dialog = page.locator("dialog[open]")
    dialog.wait_for(state="visible", timeout=10000)
    assert page.url.startswith(BASE + "/") and "/uslugi" not in page.url, page.url
    assert "add=" not in page.url, "одноразовый параметр не убран из адреса"
    assert dialog.get_by_role("heading", name="Замена смесителя").is_visible()
    assert page.get_by_role("button", name="Сантехника").get_attribute("aria-pressed") == "true", "категория не переключилась"
    dialog.get_by_role("button", name="Добавить в корзину").click()
    page.wait_for_function("localStorage.getItem('zaprosto-cart-v1') !== null")
    assert "plumb-faucet" in page.evaluate("localStorage.getItem('zaprosto-cart-v1')")
    assert not page.errors, page.errors
    page.context.close()


@scenario
def c_contacts_with_channels_and_json_ld(browser):
    try:
        set_contacts(phone="+7 900 000-00-00", telegram="@zaprosto_demo", whatsapp="+7 900 000-00-01", email="demo@example.com")
        contacts = html("/contacts")
        assert "ещё не указаны" not in contacts
        assert 'href="tel:+79000000000"' in contacts and "+7 900 000-00-00" in contacts
        assert 'href="https://t.me/zaprosto_demo"' in contacts and 'href="https://wa.me/79000000001"' in contacts and 'href="mailto:demo@example.com"' in contacts
        home = html("/")
        ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', home, re.S).group(1))
        assert ld["telephone"] == "+7 900 000-00-00" and ld["email"] == "demo@example.com", ld
        assert "zaprosto_demo" in json.dumps(ld["sameAs"])
        privacy = html("/privacy")
        assert 'href="tel:+79000000000"' in privacy and "ещё не указаны владельцем" not in privacy, "контакты в политике"
        assert 'href="tel:+79000000000"' in html("/uslugi"), "телефон в шапке"
    finally:
        set_contacts()
    home = html("/")
    ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', home, re.S).group(1))
    assert "telephone" not in ld and "email" not in ld, f"пустые контакты попали в JSON-LD: {ld}"


@scenario
def d_metadata_and_json_ld(browser):
    titles = {
        "/": "Запросто — мастер на час: цены на работы",
        "/uslugi": "Услуги и цены — Запросто",
        "/contacts": "Контакты — Запросто",
        "/privacy": "Политика обработки персональных данных — Запросто",
        "/credits": "Источники и лицензии — Запросто",
        "/offline": "Нет соединения — Запросто",
    }
    for path, title in titles.items():
        h = html(path)
        assert '<html lang="ru"' in h, f"{path}: lang"
        assert f"<title>{title}</title>" in h, f"{path}: title {re.search(r'<title>(.*?)</title>', h).group(1)!r}"
        desc = re.search(r'<meta name="description" content="([^"]+)"', h)
        if path != "/offline":
            assert desc and len(desc.group(1)) > 40, f"{path}: description"
        assert f'<meta property="og:title" content="{title}"' in h, f"{path}: og:title"
        assert '<meta property="og:description"' in h and f'<meta property="og:image" content="{ORIGIN}/og.png"' in h, f"{path}: og"
        assert '<meta property="og:image:width" content="1200"' in h and '<meta property="og:image:height" content="630"' in h
        assert '<meta name="twitter:card" content="summary_large_image"' in h
        assert '<link rel="manifest" href="/manifest.webmanifest"' in h
        assert 'rel="apple-touch-icon" href="/icons/apple-touch-icon.png"' in h and 'rel="icon" href="/icons/icon.svg"' in h and "favicon.ico" in h
        if path != "/offline":
            canonical = ORIGIN if path == "/" else ORIGIN + path  # Next убирает «/» у корня
            assert f'<link rel="canonical" href="{canonical}"' in h, f"{path}: canonical"
    assert 'name="robots" content="noindex' in html("/offline"), "офлайн-страница должна быть noindex"
    ld_raw = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html("/"), re.S)
    assert len(ld_raw) == 1, "JSON-LD на главной"
    ld = json.loads(ld_raw[0])
    settings = db("select company from settings")[0]["company"]
    assert ld["@type"] == "HomeAndConstructionBusiness" and ld["name"] == settings["name"] and ld["url"] == ORIGIN + "/" and ld["image"] == ORIGIN + "/og.png"
    assert ld["address"]["addressLocality"] == settings["city"] and ld["areaServed"] == settings["territory"]
    assert "telephone" not in ld, "пустой телефон в JSON-LD"
    for path in ("/uslugi", "/contacts", "/privacy", "/credits"):
        assert "application/ld+json" not in html(path)


@scenario
def e_sitemap_and_robots(browser):
    status, headers, body = fetch("/sitemap.xml")
    assert status == 200 and "xml" in headers["content-type"], headers
    locs = re.findall(r"<loc>(.*?)</loc>", body.decode())
    assert locs == [ORIGIN + p for p in ("/", "/uslugi", "/contacts", "/privacy", "/credits")], locs
    for loc in locs:
        assert fetch(loc.replace(ORIGIN, ""))[0] == 200, loc
    status, headers, body = fetch("/robots.txt")
    text = body.decode()
    assert status == 200 and "text/plain" in headers["content-type"]
    assert f"Sitemap: {ORIGIN}/sitemap.xml" in text, text

    def allowed(path):
        """Как у Google и Яндекса: побеждает самое длинное совпадение, при равенстве — Allow (robotparser из stdlib берёт первое, поэтому свой)."""
        best = (-1, True)
        for line in text.splitlines():
            m = re.match(r"(Allow|Disallow):\s*(\S*)", line)
            if m and path.startswith(m.group(2)) and len(m.group(2)) >= best[0]:
                best = (len(m.group(2)), m.group(1) == "Allow" or (best[0] == len(m.group(2)) and best[1]))
        return best[1]

    class rp:  # noqa: N801
        can_fetch = staticmethod(lambda _ua, url: allowed(url.replace(ORIGIN, "")))

    for ok in ("/", "/uslugi", "/contacts", "/privacy", "/credits", "/offline", "/og.png", "/sw.js"):
        assert rp.can_fetch("*", ORIGIN + ok), f"robots закрыл {ok}"
    for bad in ("/admin", "/admin/orders/1", "/o/abc", "/api/orders", "/checkout", "/dev/game"):
        assert not rp.can_fetch("*", ORIGIN + bad), f"robots не закрыл {bad}"


@scenario
def f_manifest_and_icons(browser):
    status, headers, body = fetch("/manifest.webmanifest")
    assert status == 200 and "json" in headers["content-type"], headers
    m = json.loads(body)
    assert m["name"] == "Запросто — мастер на час" and m["short_name"] == "Запросто" and m["display"] == "standalone"
    assert m["start_url"] == "/" and m["scope"] == "/" and m["lang"] == "ru"
    assert re.fullmatch(r"#[0-9A-Fa-f]{6}", m["theme_color"]) and re.fullmatch(r"#[0-9A-Fa-f]{6}", m["background_color"])
    purposes = {(i["sizes"], i.get("purpose")) for i in m["icons"]}
    assert ("192x192", "any") in purposes and ("512x512", "any") in purposes and ("512x512", "maskable") in purposes, purposes
    for icon in m["icons"]:
        status, headers, data = fetch(icon["src"])
        assert status == 200, icon["src"]
        if icon["type"] == "image/png":
            assert headers["content-type"].startswith("image/png")
            w, h = png_size(data)
            assert f"{w}x{h}" == icon["sizes"], f"{icon['src']}: {w}x{h} вместо {icon['sizes']}"
        else:
            assert "svg" in headers["content-type"] and b"<svg" in data
    status, _, data = fetch("/icons/apple-touch-icon.png")
    assert status == 200 and png_size(data) == (180, 180), "apple-touch-icon"
    status, headers, data = fetch("/og.png")
    assert status == 200 and png_size(data) == (1200, 630), "og.png"
    status, headers, data = fetch("/favicon.ico")
    assert status == 200 and "icon" in headers["content-type"], headers
    assert struct.unpack("<HHH", data[:6]) == (0, 1, 3), "favicon.ico: ожидали 3 размера"
    assert len(data) < 6000, "favicon.ico похож на стандартный от create-next-app"


@scenario
def g_service_worker_registers_and_controls(browser):
    status, headers, body = fetch("/sw.js")
    assert status == 200 and "javascript" in headers["content-type"] and "no-cache" in headers["cache-control"], headers
    assert "service-worker-allowed" not in headers
    page = new_page(browser)
    page.goto(BASE + "/uslugi", wait_until="networkidle")
    scope = page.evaluate("navigator.serviceWorker.ready.then(r => r.scope)")
    assert scope == BASE + "/", scope
    sw_ready(page)
    assert page.evaluate("navigator.serviceWorker.controller.scriptURL") == BASE + "/sw.js"
    keys = cache_urls(page)
    shell = {u for n, u in keys if n == "zaprosto-shell-v2"}
    for need in ("/offline", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"):
        assert need in shell, f"в кеше оболочки нет {need}: {sorted(shell)}"
    assert any(u.startswith("/_next/static/") and u.endswith(".css") for u in shell), "стили офлайн-страницы не в кеше"
    assert any(u.startswith("/_next/static/") and u.endswith(".js") for u in shell), "скрипты офлайн-страницы не в кеше"
    # Chrome считает приложение устанавливаемым: нет ошибок манифеста, значков и service worker
    cdp = page.context.new_cdp_session(page)
    errors = cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
    assert not errors, f"ошибки устанавливаемости: {errors}"
    assert not page.errors, page.errors
    page.context.close()


@scenario
def h_private_routes_never_cached(browser):
    page = new_page(browser)
    page.goto(BASE + "/uslugi", wait_until="networkidle")
    sw_ready(page)
    for path in ("/", "/checkout", "/admin", "/admin/login", "/o/doesnotexistdoesnotexistdoesnotexist12345", "/contacts", "/privacy", "/credits", "/uslugi"):
        page.goto(BASE + path, wait_until="networkidle")
    page.evaluate(
        """async () => {
          for (const p of ['/api/orders/doesnotexistdoesnotexistdoesnotexist12345', '/admin/login', '/o/doesnotexistdoesnotexistdoesnotexist12345', '/checkout', '/api/admin/photos/00000000-0000-0000-0000-000000000000'])
            await fetch(p).catch(() => null);
          await fetch('/api/uploads', { method: 'POST', body: new FormData() }).catch(() => null);
          await fetch('/api/orders', { method: 'POST', body: '{}' }).catch(() => null);
        }"""
    )
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(1500)
    keys = cache_urls(page)
    paths = [u for _, u in keys]
    assert paths, "кеш пуст"
    private = [u for u in paths if re.match(r"^/(api|admin|o|checkout)(/|\?|$)", u)]
    assert not private, f"в кеше приватные адреса: {private}"
    pages = [u for u in paths if re.match(r"^/(uslugi|contacts|privacy|credits)?(\?.*)?$", u)]
    assert not pages, f"в кеше страницы вместо оболочки: {pages}"
    allowed = re.compile(r"^/(offline|_next/static/|models/|posters/|icons/)")
    stray = [u for u in paths if not allowed.match(u)]
    assert not stray, f"в кеше лишнее: {stray}"
    assert any(re.match(r"^/(models|posters)/", u) for u in paths), f"3D-модели и постеры должны кешироваться: {paths}"
    assert not page.errors, page.errors
    page.context.close()


@scenario
def i_offline_shows_offline_page_and_keeps_cart(browser):
    page = new_page(browser)
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    add_via_deeplink(page, "Замена розетки")
    sw_ready(page)
    cart_before = page.evaluate("localStorage.getItem('zaprosto-cart-v1')")
    assert "el-socket" in cart_before
    ctx = page.context
    ctx.set_offline(True)
    try:
        page.goto(BASE + "/contacts", wait_until="load")
        assert page.get_by_role("heading", name="Нет соединения").is_visible(), "нет офлайн-страницы"
        assert "Корзина и черновик заявки сохранены на этом устройстве — отправить заявку можно, когда связь вернётся." in page.locator("main").inner_text()
        assert page.get_by_role("link", name="Повторить").is_visible()
        # стили из кеша: фон — токен --bg светлой темы, заголовок 28 px
        assert page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(238, 240, 235)", "стили не применились офлайн"
        assert page.evaluate("parseFloat(getComputedStyle(document.querySelector('main h1')).fontSize)") == 28
        # скрипты из кеша: гидратация прошла, шапка показывает корзину из localStorage
        page.wait_for_function("document.querySelector('header [aria-label*=\"орзин\"]')?.getAttribute('aria-label')?.match(/1/)", timeout=8000)
        assert page.evaluate("localStorage.getItem('zaprosto-cart-v1')") == cart_before, "корзина изменилась"
        # любой другой адрес без сети — тоже офлайн-страница, но API и заявки по ссылке без подмены
        page.goto(BASE + "/o/doesnotexistdoesnotexistdoesnotexist12345", wait_until="load")
        assert page.get_by_role("heading", name="Нет соединения").is_visible()
        failed = page.evaluate("fetch('/api/orders/doesnotexistdoesnotexistdoesnotexist12345').then(() => 'ok', () => 'rejected')")
        assert failed == "rejected", "API без сети не должен отвечать из кеша"
        page.screenshot(path=os.path.join(SHOTS, "info-offline-390-light.png"), full_page=True)
    finally:
        ctx.set_offline(False)
    page.goto(BASE + "/contacts", wait_until="networkidle")
    assert page.get_by_role("heading", name="Контакты", exact=True).is_visible(), "после возврата связи открылась не страница"
    assert page.evaluate("localStorage.getItem('zaprosto-cart-v1')") == cart_before
    # «Повторить» после возвращения связи открывает ту же страницу
    ctx.set_offline(True)
    page.goto(BASE + "/contacts", wait_until="load")
    ctx.set_offline(False)
    page.get_by_role("link", name="Повторить").click()
    page.wait_for_url(BASE + "/contacts")
    assert page.get_by_role("heading", name="Контакты", exact=True).is_visible(), "«Повторить» не вернул страницу"
    page.evaluate("localStorage.clear()")
    assert not page.errors, page.errors
    ctx.close()


@scenario
def j_unknown_order_link_is_noindex_nostore(browser):
    status, headers, body = fetch("/o/doesnotexistdoesnotexistdoesnotexist12345")
    text = body.decode()
    assert "noindex" in headers.get("x-robots-tag", ""), headers
    assert "no-store" in headers.get("cache-control", ""), headers
    assert headers.get("referrer-policy") == "no-referrer"
    assert 'name="robots" content="noindex' in text, "нет meta robots noindex"
    print(f"       /o/<неизвестный токен>: HTTP {status} (поток, как описано в DECISIONS), noindex и no-store на месте")


@scenario
def k_screenshots_mobile_dark_desktop(browser):
    pages = {"uslugi": "/uslugi", "contacts": "/contacts", "privacy": "/privacy", "credits": "/credits", "offline": "/offline"}
    for name, path in pages.items():
        for tag, (w, h, scheme) in {"390-light": (390, 844, "light"), "390-dark": (390, 844, "dark"), "1280-light": (1280, 800, "light")}.items():
            page = new_page(browser, w, h, scheme)
            page.goto(BASE + path, wait_until="networkidle")
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"{name} {tag}: горизонтальная прокрутка"
            assert page.locator("h1").count() == 1, f"{name}: h1"
            if name == "uslugi":  # длинный прайс: снимаем верх страницы и блок «От чего зависит цена»
                page.screenshot(path=os.path.join(SHOTS, f"info-{name}-{tag}.png"))
                page.locator("#price-factors").scroll_into_view_if_needed()
                page.evaluate("document.getElementById('price-factors').scrollIntoView()")
                page.screenshot(path=os.path.join(SHOTS, f"info-{name}-factors-{tag}.png"))
            else:
                page.screenshot(path=os.path.join(SHOTS, f"info-{name}-{tag}.png"), full_page=True)
            assert not page.errors, f"{name} {tag}: {page.errors}"
            page.context.close()


if __name__ == "__main__":
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        print(f"E2E публичных страниц и PWA: {BASE}, ожидаемый origin {ORIGIN}")
        for run in [
            a_server_rendered_content,
            b_choose_deeplink_opens_add_sheet,
            c_contacts_with_channels_and_json_ld,
            d_metadata_and_json_ld,
            e_sitemap_and_robots,
            f_manifest_and_icons,
            g_service_worker_registers_and_controls,
            h_private_routes_never_cached,
            i_offline_shows_offline_page_and_keeps_cart,
            j_unknown_order_link_is_noindex_nostore,
            k_screenshots_mobile_dark_desktop,
        ]:
            if not only or any(run.__name__.startswith(o) for o in only):
                run(browser)
        browser.close()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\nИтог: {len(RESULTS) - len(failed)} из {len(RESULTS)} сценариев прошли")
    sys.exit(1 if failed else 0)
