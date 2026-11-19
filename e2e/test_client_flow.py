"""
E2E клиентского пути «Ладно»: выбор работ, корзина, оформление, повтор без дубля, страница заявки.
Запуск (сервер уже работает):  BASE_URL=http://127.0.0.1:3101 python e2e/test_client_flow.py
Нужна база, на которую смотрит сервер: DATABASE_URL (по умолчанию hfah_client). Скриншоты — e2e/screenshots/.
"""

import json
import math
import os
import re
import struct
import subprocess
import sys
import traceback
import uuid
import zlib
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect, sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3101").rstrip("/")
DB_URL = os.environ.get("DATABASE_URL", "postgres://hfah:hfah_dev_pw@127.0.0.1:54329/hfah_client")
SHOTS = os.path.join(HERE, "screenshots")
os.makedirs(SHOTS, exist_ok=True)
RUN = uuid.uuid4().hex[:8]  # метка прогона: по ней считаем свои заявки в базе


# ---------- база и эталонный расчёт (повторяет docs/ARCHITECTURE.md, не код приложения) ----------
def db(sql):
    r = subprocess.run(["node", os.path.join(HERE, "dbq.mjs"), sql], env={**os.environ, "DATABASE_URL": DB_URL}, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


PRICING = db("select pricing from settings")[0]["pricing"]
PRICE = {s["id"]: s for s in db("select id, price, pricing, dismantle_allowed from services")}


def rnd(x):
    return int(math.floor(x + 0.5))


def line_total(service_id, qty, complex_=False, dismantle=False):
    s = PRICE[service_id]
    unit = PRICING["hourRate"] if s["pricing"] == "hourly" else s["price"]
    pct = (PRICING["complexPct"] if complex_ else 0) + (PRICING["dismantlePct"] if dismantle and s["dismantle_allowed"] else 0)
    return rnd(unit * qty * (100 + pct) / 100)


def order_total(lines, urgent=False, out_of_town=False):
    """lines: [(service_id, qty, complex, dismantle)] → итог работ + выезд за город."""
    sub = sum(line_total(*l) for l in lines)
    top = PRICING["minOrder"] - sub if 0 < sub < PRICING["minOrder"] else 0
    urg = rnd((sub + top) * PRICING["urgentPct"] / 100) if urgent else 0
    works = math.ceil((sub + top + urg) / 10) * 10
    return works + (PRICING["outOfTownFee"] if out_of_town else 0)


def money(text):
    return int(re.sub(r"[^\d]", "", text))


def png(w=2200, h=1500):
    """PNG-градиент без внешних библиотек: больше 2000 px, чтобы проверить уменьшение на клиенте."""
    red = bytes(x * 255 // w for x in range(w))
    raw = bytearray()
    for y in range(h):
        row = bytearray(3 * w)
        row[0::3] = red
        row[1::3] = bytes([y * 255 // h]) * w
        row[2::3] = bytes([160]) * w
        raw.append(0)
        raw.extend(row)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    sig = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    return sig + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")


MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
_msk = datetime.now(timezone(timedelta(hours=3))) + timedelta(days=10)
WISH_DATE = _msk.strftime("%Y-%m-%d")  # пожелание «через 10 дней»: сервер не принимает дату дальше года
WISH_TEXT = f"{_msk.day} {MONTHS[_msk.month - 1]}"

PNG = png()
PHOTO = {"name": "photo.png", "mimeType": "image/png", "buffer": PNG}


# ---------- помощники страницы ----------
def new_page(browser, w=390, h=844, scheme="light"):
    ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, locale="ru-RU", timezone_id="Europe/Moscow", permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.errors = []
    page.not_found = []
    page.on("pageerror", lambda e: page.errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: page.errors.append(f"console.error: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("response", lambda r: page.not_found.append((r.status, r.url)) if r.status >= 400 and "favicon" not in r.url else None)
    return page


def fresh_home(page, path="/"):
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("() => localStorage.clear()")
    page.goto(BASE + path, wait_until="networkidle")


def header_cart(page):
    return page.locator("header").get_by_role("button", name=re.compile("^Корзина"))


def open_cart(page):
    header_cart(page).click()
    page.wait_for_selector("dialog[open]")


def close_sheet(page):
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")


def pick_category(page, title):
    page.get_by_role("button", name=title, exact=True).click()


def add_work(page, title, plus=0, complex_=False, dismantle=False, description=None):
    page.get_by_role("button", name=f"Добавить: {title}", exact=True).click()
    dlg = page.locator("dialog[open]")
    dlg.wait_for()
    for _ in range(plus):
        dlg.get_by_role("button", name="Увеличить количество").click()
    if complex_:
        dlg.get_by_role("checkbox", name=re.compile("Сложные условия")).check()
    if dismantle:
        dlg.get_by_role("checkbox", name=re.compile("Демонтаж старого")).check()
    if description is not None:
        dlg.get_by_label("Что нужно сделать").fill(description)
    dlg.get_by_role("button", name="Добавить в корзину").click()
    page.wait_for_selector("dialog[open]", state="detached")


def cart_total(page):
    t = page.locator("dialog[open]").get_by_role("region", name="Предварительный расчёт").inner_text()
    m = re.search(r"Предварительная стоимость\s*([\d\s ]+)₽", t)
    assert m, f"нет итога в корзине: {t!r}"
    return money(m.group(1))


def cart_rows(page):
    return page.locator("dialog[open] ul > li")


def fill_checkout(page, name, phone="8 (912) 345-67-89", address="ул. Вымышленная, д. 1, кв. 2", materials="Куплю сам"):
    page.get_by_label("Имя", exact=True).fill(name)
    page.get_by_label("Телефон", exact=True).fill(phone)
    page.get_by_label("Адрес", exact=True).fill(address)
    page.get_by_label(materials).check()


def shot(page, name, full=False):
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=full)


def no_hscroll(page, label):
    w = page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    assert w[0] <= w[1], f"{label}: горизонтальная прокрутка {w}"


# страницы, которые делает другой инженер: ссылки на них в шапке и подвале префетчатся в production и дают 404 до их появления
PENDING_PAGES = ("/uslugi", "/contacts", "/privacy", "/credits")


def no_errors(page, label):
    errs = [e for e in page.errors if "Download the React DevTools" not in e]
    assert not errs, f"{label}: ошибки в консоли: {errs[:3]}"
    bad = [(c, u) for c, u in page.not_found if not (c == 404 and any(u.split("?")[0].endswith(x) for x in PENDING_PAGES))]
    assert not bad, f"{label}: неудачные запросы: {bad[:3]}"


def submit_and_wait(page, timeout=30000):
    page.get_by_role("button", name=re.compile("Отправить заявку|Повторить отправку")).click()
    page.wait_for_url(re.compile(r"/o/[\w-]{43}$"), timeout=timeout)
    page.wait_for_selector("article h1:has-text('Заявка №')")


def order_number(page):
    return int(re.search(r"Заявка № (\d+)", page.locator("article h1").inner_text()).group(1))


def orders_named(name):
    return int(db(f"select count(*)::int as n from orders where customer_name = '{name}'")[0]["n"])


# ---------- сценарии ----------
RESULTS = []


def scenario(fn):
    def run(browser):
        try:
            fn(browser)
            RESULTS.append((fn.__name__, True, ""))
            print(f"  ok   {fn.__name__}")
        except Exception:
            RESULTS.append((fn.__name__, False, traceback.format_exc()))
            print(f"  FAIL {fn.__name__}\n{traceback.format_exc()}")

    run.__name__ = fn.__name__
    return run


@scenario
def a_totals_equal_engine_and_b_merge(browser):
    """(a) две работы, количество, сложные условия и демонтаж: суммы как в движке; (b) одинаковые объединяются, разные отдельно."""
    page = new_page(browser)
    fresh_home(page)
    add_work(page, "Сборка шкафа", plus=1)  # 2 шт
    pick_category(page, "Сантехника")
    add_work(page, "Замена смесителя", complex_=True, dismantle=True)
    open_cart(page)
    assert cart_rows(page).count() == 2
    expect_total = order_total([("furn-wardrobe", 2, False, False), ("plumb-faucet", 1, True, True)])
    assert cart_total(page) == expect_total, (cart_total(page), expect_total)
    # изменить количество прямо в корзине: шкаф 2 → 3
    cart_rows(page).first.get_by_role("button", name="Увеличить количество").click()
    assert cart_total(page) == order_total([("furn-wardrobe", 3, False, False), ("plumb-faucet", 1, True, True)])
    # сложные условия у шкафа в корзине
    cart_rows(page).first.get_by_role("checkbox", name="Сложные условия").check()
    assert cart_total(page) == order_total([("furn-wardrobe", 3, True, False), ("plumb-faucet", 1, True, True)])
    close_sheet(page)

    # (b) тот же смеситель с теми же настройками → одна позиция, количество 2
    add_work(page, "Замена смесителя", complex_=True, dismantle=True)
    # тот же смеситель без настроек → отдельная позиция
    add_work(page, "Замена смесителя")
    open_cart(page)
    assert cart_rows(page).count() == 3, cart_rows(page).count()
    faucet_rows = cart_rows(page).filter(has_text="Замена смесителя")
    assert faucet_rows.count() == 2
    assert faucet_rows.first.locator("input[inputmode=decimal]").input_value() == "2"
    expect_total = order_total([("furn-wardrobe", 3, True, False), ("plumb-faucet", 2, True, True), ("plumb-faucet", 1, False, False)])
    assert cart_total(page) == expect_total, (cart_total(page), expect_total)
    # включили у отдельной позиции те же настройки → объединились
    faucet_rows.nth(1).get_by_role("checkbox", name="Сложные условия").check()
    faucet_rows.nth(1).get_by_role("checkbox", name="Демонтаж старого").click()  # строка сливается с соседней и исчезает
    expect(cart_rows(page)).to_have_count(2)
    expect(page.locator("dialog[open] [data-toast-host=sheet]")).to_contain_text("Объединено с такой же позицией")
    assert cart_rows(page).filter(has_text="Замена смесителя").locator("input[inputmode=decimal]").input_value() == "3"
    no_errors(page, "корзина")
    page.context.close()


@scenario
def c_remove_undo_and_d_reload(browser):
    """(c) удалить и вернуть на то же место; (d) корзина переживает перезагрузку."""
    page = new_page(browser)
    fresh_home(page)
    add_work(page, "Сборка шкафа")
    add_work(page, "Сборка кровати")
    add_work(page, "Сборка комода")
    open_cart(page)
    titles = [r.inner_text().split("\n")[0] for r in cart_rows(page).all()]
    assert titles == ["Сборка шкафа", "Сборка кровати", "Сборка комода"], titles
    cart_rows(page).nth(1).get_by_role("button", name="Убрать: Сборка кровати").click()
    expect(cart_rows(page)).to_have_count(2)
    toast = page.locator("dialog[open] [data-toast-host=sheet]")
    expect(toast).to_contain_text("Удалено: Сборка кровати")
    toast.get_by_role("button", name="Вернуть").click()
    expect(cart_rows(page)).to_have_count(3)
    titles = [r.inner_text().split("\n")[0] for r in cart_rows(page).all()]
    assert titles == ["Сборка шкафа", "Сборка кровати", "Сборка комода"], titles
    # тост исчезает сам через ~6 секунд
    cart_rows(page).first.get_by_role("button", name=re.compile("^Убрать")).click()
    expect(toast).to_contain_text("Удалено: Сборка шкафа")
    page.wait_for_timeout(7000)
    expect(toast).not_to_contain_text("Удалено")
    close_sheet(page)
    # (d) перезагрузка
    page.reload(wait_until="networkidle")
    expect(header_cart(page)).to_have_attribute("aria-label", "Корзина: 2 работы")
    open_cart(page)
    expect(cart_rows(page)).to_have_count(2)
    no_errors(page, "удаление")
    page.context.close()


@scenario
def d2_stale_cart_dropped_with_notice(browser):
    """Сохранённая корзина сверяется с каталогом: неизвестная работа убирается с сообщением."""
    page = new_page(browser)
    fresh_home(page)
    page.evaluate(
        """() => localStorage.setItem('ladno-cart-v1', JSON.stringify({v:1, lines:[
          {serviceId:'furn-shelf', title:'Навеска полки', unit:'pcs', qty:2, complex:false, dismantle:false, manual:false},
          {serviceId:'gone-service', title:'Старая работа', unit:'pcs', qty:1, complex:false, dismantle:false, manual:false}]}))"""
    )
    page.reload(wait_until="networkidle")
    expect(page.locator("[data-toast-host=page]")).to_contain_text("Старая работа")
    expect(header_cart(page)).to_have_attribute("aria-label", "Корзина: 1 работа")
    page.context.close()


@scenario
def e_f_checkout_draft_photo_submit(browser):
    """(e) оформление с фото, перезагрузка посреди формы; (f) отправка → страница заявки с составом и суммой."""
    page = new_page(browser)
    fresh_home(page)
    add_work(page, "Сборка шкафа", plus=1)
    pick_category(page, "Электрика")
    add_work(page, "Замена розетки", plus=2, dismantle=True)  # 3 шт с демонтажем
    open_cart(page)
    page.get_by_role("link", name="Оформить заявку").click()
    page.wait_for_url("**/checkout")
    name = f"Тест Клиент {RUN}"
    page.get_by_role("heading", name="Оформление заявки").wait_for()
    page.get_by_label("Имя", exact=True).wait_for()
    page.wait_for_timeout(300)  # сразу после перехода (первые ~100 мс) ввод ещё может не дойти до формы: человеку это недоступно
    fill_checkout(page, name)
    page.get_by_label("Желаемая дата").fill(WISH_DATE)
    page.get_by_text("12:00–15:00", exact=True).click()  # радио скрыто визуально (sr-only), нажимается подпись
    assert page.get_by_label("12:00–15:00").is_checked()
    page.get_by_label("Что ещё важно знать мастеру").fill("Позвонить за час до приезда")
    page.locator("input[type=file]").set_input_files(PHOTO)
    page.wait_for_selector("[data-photo-status=done]", timeout=30000)
    # время недоступно без даты — проверим отдельно ниже; сейчас перезагрузка посреди формы
    page.wait_for_timeout(500)
    saved = page.evaluate("() => localStorage.getItem('ladno-draft-v1')")
    assert saved and name in saved, f"черновик не записан до перезагрузки: {str(saved)[:200]}"
    page.reload(wait_until="networkidle")
    restored = page.get_by_label("Имя", exact=True).input_value()
    after = page.evaluate("() => localStorage.getItem('ladno-draft-v1')")
    assert restored == name, f"форма не восстановилась: {restored!r}; в хранилище: {str(after)[:200]}"
    assert page.get_by_label("Адрес", exact=True).input_value().startswith("ул. Вымышленная")
    assert page.get_by_label("Куплю сам").is_checked()
    assert page.get_by_label("Желаемая дата").input_value() == WISH_DATE
    assert page.get_by_label("12:00–15:00").is_checked()
    assert page.locator("[data-photo-status=done]").count() == 1, "фото не восстановилось"
    assert page.locator("[data-photo-status=done] img").get_attribute("src").startswith("data:image/jpeg")
    assert not page.locator("#f-consent").is_checked(), "согласие не должно сохраняться в черновике"

    # срочный и за город — итог пересчитывается сразу
    base = [("furn-wardrobe", 2, False, False), ("el-socket", 3, False, True)]
    summary = page.get_by_role("region", name="Предварительный расчёт")
    assert money(re.search(r"Предварительная стоимость\s*([\d\s ]+)₽", summary.inner_text()).group(1)) == order_total(base)
    page.get_by_role("checkbox", name=re.compile("Срочный выезд")).check()
    page.get_by_role("checkbox", name=re.compile("Выезд за город")).check()
    expected = order_total(base, urgent=True, out_of_town=True)
    expect(summary).to_contain_text(re.sub(r"(?<=\d)(?=(\d{3})+$)", " ", str(expected)).replace(" ", " ") + " ₽")
    assert order_total(base, urgent=True, out_of_town=True) > order_total(base)

    # без согласия — ошибка у поля, фокус на нём, запрос не уходит
    posted = []
    page.on("request", lambda r: posted.append(r.url) if r.method == "POST" and r.url.endswith("/api/orders") else None)
    page.get_by_role("button", name="Отправить заявку").click()
    expect(page.locator("#f-consent-err")).to_contain_text("согласие")
    expect(page.locator("#f-consent")).to_be_focused()
    assert not posted

    page.locator("#f-consent").check()
    shot(page, "checkout-filled-390-light", full=True)
    submit_and_wait(page)
    assert len(posted) == 1
    num = order_number(page)
    body = page.locator("article").inner_text()
    assert "Сборка шкафа" in body and "Замена розетки" in body
    assert "демонтаж старого" in body
    assert "Срочный выезд" in body and "выезд за город" in body.lower()
    assert "Фото места работы" in body and "Приложено: 1" in body
    m = re.search(r"Предварительная стоимость\s*([\d\s ]+)₽", body)
    assert m and money(m.group(1)) == expected, (m and m.group(1), expected)
    assert WISH_TEXT in body and "12:00–15:00" in body and "пожелание" in body
    # корзина и черновик очищены
    assert page.evaluate("() => [localStorage.getItem('ladno-cart-v1'), localStorage.getItem('ladno-draft-v1')]") == [None, None]
    # в базе ровно одна, цена посчитана сервером так же
    rows = db(f"select known_total, status from orders where customer_name = '{name}'")
    assert len(rows) == 1 and rows[0]["known_total"] == expected and rows[0]["status"] == "new"
    assert order_number(page) == num
    shot(page, "order-390-light", full=True)
    no_hscroll(page, "страница заявки")
    no_errors(page, "оформление")
    # приватность: телефона и адреса нет в тексте и в публичном JSON
    token = page.url.rsplit("/", 1)[1]
    pub = page.request.get(f"{BASE}/api/orders/{token}").text()
    assert "912" not in pub and "Вымышленная" not in pub and "phone" not in pub
    assert "912" not in body and "Вымышленная" not in body
    ORDER_STATE["token"], ORDER_STATE["number"], ORDER_STATE["total"] = token, num, expected
    page.context.close()


ORDER_STATE = {}


@scenario
def f2_copy_link_and_live_update(browser):
    """Скопировать ссылку; изменения владельца появляются на странице сами (опрос + возврат на вкладку)."""
    token, num = ORDER_STATE.get("token"), ORDER_STATE.get("number")
    assert token, "нет заявки из предыдущего сценария"
    page = new_page(browser)
    page.goto(f"{BASE}/o/{token}", wait_until="networkidle")
    page.get_by_role("button", name="Скопировать ссылку").click()
    expect(page.get_by_text("Ссылка скопирована")).to_be_visible()
    assert page.evaluate("() => navigator.clipboard.readText()").endswith(f"/o/{token}")
    expect(page.locator("footer", has_text="Обновлено")).to_be_visible(timeout=5000)
    assert page.locator("[data-status=new]").inner_text().strip() == "Новая"
    assert page.get_by_text("Согласовано с мастером").count() == 0
    # владелец согласовал цену и время (прямо в базе — как это делает кабинет)
    db(f"update orders set status = 'agreed', final_price = 9990, agreed_at = now() + interval '1 day' where number = {num} returning 1 as ok")
    page.wait_for_timeout(5500)  # между опросами не меньше 5 секунд
    page.evaluate("() => window.dispatchEvent(new Event('focus'))")
    expect(page.get_by_role("region", name="Согласовано с мастером")).to_be_visible(timeout=10000)
    assert "9 990 ₽" in page.get_by_role("region", name="Согласовано с мастером").inner_text()
    assert page.locator("[data-status=agreed]").inner_text().strip() == "Согласована"
    shot(page, "order-agreed-390-light", full=True)
    # прямая проверка: JSON публичного API содержит и итог владельца, но не его заметку
    pub = page.request.get(f"{BASE}/api/orders/{token}").json()
    assert pub["finalPrice"] == 9990 and "ownerNote" not in json.dumps(pub)
    page.context.close()


@scenario
def g_network_failure_then_retry_one_order(browser):
    """(g) Ответ потерян после записи заявки в базу → «Повторить отправку» с тем же ключом → ровно одна заявка."""
    page = new_page(browser)
    fresh_home(page)
    add_work(page, "Навеска полки", plus=2)
    page.goto(BASE + "/checkout", wait_until="networkidle")
    name = f"Сетевой Сбой {RUN}"
    fill_checkout(page, name)
    page.locator("#f-consent").check()
    keys = []

    def handler(route):
        keys.append(route.request.headers.get("idempotency-key"))
        if len(keys) == 1:
            route.fetch()  # запрос дошёл до сервера, заявка записана…
            route.abort("failed")  # …а браузер ответа не получил
        else:
            route.continue_()

    page.route("**/api/orders", handler)
    page.get_by_role("button", name="Отправить заявку").click()
    retry = page.get_by_role("button", name="Повторить отправку")
    retry.wait_for(timeout=15000)
    expect(page.get_by_text("Заявка не потеряна")).to_be_visible()
    assert page.get_by_label("Имя", exact=True).input_value() == name, "введённое потерялось"
    assert orders_named(name) == 1, "первая попытка должна была записать заявку"
    shot(page, "checkout-network-error-390-light", full=True)
    # перезагрузка между попытками: ключ должен пережить её
    page.reload(wait_until="networkidle")
    page.locator("#f-consent").check()
    page.get_by_role("button", name="Отправить заявку").click()
    page.wait_for_url(re.compile(r"/o/[\w-]{43}$"), timeout=30000)
    assert len(keys) == 2 and keys[0] == keys[1] and re.fullmatch(r"[0-9a-f-]{36}", keys[0]), keys
    assert orders_named(name) == 1, "повтор создал дубль"
    page.context.close()


@scenario
def g2_changed_payload_gets_new_key(browser):
    """Изменили заявку после сбоя — идёт новый ключ (это уже другая заявка)."""
    page = new_page(browser)
    fresh_home(page)
    add_work(page, "Навеска зеркала")
    page.goto(BASE + "/checkout", wait_until="networkidle")
    name = f"Другой Ключ {RUN}"
    fill_checkout(page, name)
    page.locator("#f-consent").check()
    keys = []

    def handler(route):
        keys.append(route.request.headers.get("idempotency-key"))
        route.abort("failed") if len(keys) == 1 else route.continue_()

    page.route("**/api/orders", handler)
    page.get_by_role("button", name="Отправить заявку").click()
    page.get_by_role("button", name="Повторить отправку").wait_for(timeout=15000)
    page.get_by_label("Что ещё важно знать мастеру").fill("Добавил комментарий после сбоя")
    page.get_by_role("button", name=re.compile("Повторить отправку|Отправить заявку")).click()
    page.wait_for_url(re.compile(r"/o/[\w-]{43}$"), timeout=30000)
    assert len(keys) == 2 and keys[0] != keys[1], keys
    assert orders_named(name) == 1
    page.context.close()


@scenario
def h_other_requires_photo_and_manual_never_free(browser):
    """(h) «Другое» без фото не уходит, ошибка у поля; со смешанным заказом «по фото» никогда не 0 ₽."""
    page = new_page(browser)
    fresh_home(page)
    pick_category(page, "Другое")
    # короткое описание — ошибка у поля в листе
    page.get_by_role("button", name="Добавить: Другая задача — оценка по фото", exact=True).click()
    dlg = page.locator("dialog[open]")
    expect(dlg.get_by_text("Стоимость — по фото").first).to_be_visible()
    assert "По фото" in dlg.inner_text()
    dlg.get_by_role("button", name="Добавить в корзину").click()
    expect(dlg.get_by_text("не короче 10 символов")).to_be_visible()
    dlg.get_by_label("Что нужно сделать").fill("Повесить тяжёлое зеркало на плитку в ванной")
    dlg.get_by_role("button", name="Добавить в корзину").click()
    page.wait_for_selector("dialog[open]", state="detached")
    # корзина: «По фото», итога «0 ₽» нет, известной суммы нет
    open_cart(page)
    text = page.locator("dialog[open]").inner_text()
    assert "По фото" in text and "Стоимость — по фото" in text
    assert not re.search(r"(?<!\d)0\s*₽", text), "неизвестная цена показана как 0 ₽"
    close_sheet(page)

    page.goto(BASE + "/checkout", wait_until="networkidle")
    name = f"Другое Без Фото {RUN}"
    fill_checkout(page, name)
    page.locator("#f-consent").check()
    posted = []
    page.on("request", lambda r: posted.append(1) if r.method == "POST" and r.url.endswith("/api/orders") else None)
    page.get_by_role("button", name="Отправить заявку").click()
    expect(page.locator("#photos-err")).to_contain_text("приложите хотя бы одно фото")
    expect(page.locator("[data-field=photos]")).to_be_focused()
    assert not posted and orders_named(name) == 0
    shot(page, "checkout-photo-required-390-light", full=True)

    # смешанный заказ: выезд за город + только «по фото» → «Сейчас известно: выезд за город…»
    page.get_by_role("checkbox", name=re.compile("Выезд за город")).check()
    summary = page.get_by_role("region", name="Предварительный расчёт")
    expect(summary).to_contain_text("Сейчас известно: выезд за город 1 000 ₽. Работы — оценка по фото.")
    assert not re.search(r"Итого(?!в)", summary.inner_text()), "известная часть названа итогом заказа"
    page.locator("input[type=file]").set_input_files(PHOTO)
    page.wait_for_selector("[data-photo-status=done]", timeout=30000)
    submit_and_wait(page)
    body = page.locator("article").inner_text()
    assert "По фото" in body and "Сейчас известно: выезд за город" in body
    assert not re.search(r"(?<!\d)0\s*₽", body)
    row = db(f"select known_total, has_manual from orders where customer_name = '{name}'")[0]
    assert row["has_manual"] is True and row["known_total"] == PRICING["outOfTownFee"]
    page.context.close()


@scenario
def h2_mixed_order_shows_known_and_photo_separately(browser):
    page = new_page(browser)
    fresh_home(page)
    add_work(page, "Навеска полки", plus=3)  # 4 × 900 = 3600
    pick_category(page, "Другое")
    add_work(page, "Другая задача — оценка по фото", description="Заменить розетку в старой стене")
    open_cart(page)
    summary = page.locator("dialog[open]").get_by_role("region", name="Предварительный расчёт").inner_text()
    assert "Сейчас известно" in summary and "Оценка по фото: 1 работа" in summary and "Предварительная стоимость" not in summary
    m = re.search(r"Сейчас известно\s*([\d\s ]+)₽", summary)
    assert money(m.group(1)) == order_total([("furn-shelf", 4, False, False)])
    assert "+ время по фото" in summary
    page.context.close()


@scenario
def j_excluded_search_and_deeplinks(browser):
    """(j) «газ» в поиске → честный блок; ссылки с /uslugi (?c=…&add=…) открывают нужную категорию и лист."""
    page = new_page(browser)
    fresh_home(page)
    page.get_by_label("Найти работу").fill("газ")
    block = page.get_by_role("status").filter(has_text="Этого мы не делаем")
    expect(block).to_be_visible()
    expect(block).to_contain_text("газовое оборудование")
    expect(block).to_contain_text("газовую службу")
    page.get_by_label("Найти работу").fill("смеситель")
    expect(page.get_by_role("heading", name=re.compile("Найдено"))).to_be_visible()
    expect(page.get_by_role("button", name="Добавить: Замена смесителя", exact=True)).to_be_visible()
    assert page.get_by_text("Этого мы не делаем").count() == 0
    page.get_by_label("Найти работу").fill("")
    # глубокая ссылка
    page.goto(BASE + "/?c=plumbing&add=plumb-faucet", wait_until="networkidle")
    dlg = page.locator("dialog[open]")
    dlg.wait_for()
    expect(dlg.get_by_role("heading", name="Замена смесителя")).to_be_visible()
    expect(page.get_by_role("button", name="Сантехника", exact=True)).to_have_attribute("aria-pressed", "true")
    assert "add=" not in page.url and "c=plumbing" in page.url
    close_sheet(page)
    page.get_by_role("button", name="Электрика", exact=True).click()
    assert "c=electrics" in page.url
    page.goto(BASE + "/?c=repair", wait_until="networkidle")
    expect(page.get_by_role("button", name="Ремонт", exact=True)).to_have_attribute("aria-pressed", "true")
    page.context.close()


@scenario
def k_unknown_token_and_robots(browser):
    page = new_page(browser)
    r = page.goto(BASE + "/o/" + "x" * 43, wait_until="networkidle")
    body = page.locator("body").inner_text()
    assert "Страница не найдена" in body
    assert page.locator("main").count() == 1, "несколько <main>"
    assert "robots" in page.content() and "noindex" in page.content()
    assert not re.search(r"Заявка №|\+7|912", body)
    page.goto(BASE + "/o/ab", wait_until="networkidle")
    assert "Страница не найдена" in page.locator("body").inner_text()
    page.context.close()


@scenario
def l_keyboard_a11y(browser):
    """Лист закрывается по Esc, фокус возвращается на кнопку; фокус удерживается внутри."""
    page = new_page(browser, 1280, 800)
    fresh_home(page)
    btn = page.get_by_role("button", name="Добавить: Сборка шкафа", exact=True)
    btn.focus()
    page.keyboard.press("Enter")
    dlg = page.locator("dialog[open]")
    dlg.wait_for()
    n = page.evaluate("() => document.querySelectorAll('dialog[open] button, dialog[open] input, dialog[open] textarea, dialog[open] a[href]').length")
    assert n >= 4
    for _ in range(n - 1):  # по кругу листа; дальше системный <dialog> отдаёт фокус браузеру — это штатно
        page.keyboard.press("Tab")
        assert page.evaluate("() => !!document.activeElement.closest('dialog')"), "фокус ушёл из листа"
    # содержимое под листом недоступно: фокус на кнопку шапки не переносится
    page.locator("header button").first.evaluate("el => el.focus()")
    assert not page.evaluate("() => document.activeElement && !!document.activeElement.closest('header')"), "фон под листом получил фокус"
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert page.evaluate("() => document.activeElement && document.activeElement.getAttribute('aria-label')") == "Добавить: Сборка шкафа"
    page.context.close()


@scenario
def m_screenshots_mobile_and_dark(browser):
    """(i) 390×844 и 1280×800, светлая и тёмная темы: снимки в e2e/screenshots/ (их нужно посмотреть глазами)."""
    for scheme in ("light", "dark"):
        page = new_page(browser, 390, 844, scheme)
        fresh_home(page)
        no_hscroll(page, f"главная {scheme}")
        shot(page, f"home-390-{scheme}")
        page.get_by_role("button", name="Сантехника", exact=True).click()
        page.mouse.wheel(0, 700)
        shot(page, f"home-list-390-{scheme}")
        page.get_by_role("button", name="Добавить: Замена смесителя", exact=True).click()
        page.locator("dialog[open]").get_by_role("checkbox", name=re.compile("Сложные условия")).check()
        shot(page, f"add-sheet-390-{scheme}")
        page.locator("dialog[open]").get_by_role("button", name="Добавить в корзину").click()
        page.wait_for_selector("dialog[open]", state="detached")
        pick_category(page, "Другое")
        add_work(page, "Другая задача — оценка по фото", description="Закрепить полку на гипсокартонной перегородке")
        pick_category(page, "Мебель")
        add_work(page, "Сборка шкафа", plus=1)
        shot(page, f"home-with-bar-390-{scheme}")
        open_cart(page)
        shot(page, f"cart-390-{scheme}")
        no_hscroll(page, f"корзина {scheme}")
        close_sheet(page)
        page.goto(BASE + "/checkout", wait_until="networkidle")
        no_hscroll(page, f"оформление {scheme}")
        shot(page, f"checkout-390-{scheme}", full=True)
        no_errors(page, f"снимки {scheme}")
        page.context.close()
    # узкий экран 360 без горизонтальной прокрутки
    page = new_page(browser, 360, 740)
    fresh_home(page)
    no_hscroll(page, "главная 360")
    add_work(page, "Сборка шкафа")
    open_cart(page)
    no_hscroll(page, "корзина 360")
    close_sheet(page)
    page.goto(BASE + "/checkout", wait_until="networkidle")
    no_hscroll(page, "оформление 360")
    page.context.close()
    # десктоп
    page = new_page(browser, 1280, 800)
    fresh_home(page)
    shot(page, "home-1280-light")
    add_work(page, "Сборка шкафа", plus=1)
    pick_category(page, "Электрика")
    add_work(page, "Замена розетки", dismantle=True)
    open_cart(page)
    shot(page, "cart-1280-light")
    close_sheet(page)
    page.goto(BASE + "/checkout", wait_until="networkidle")
    shot(page, "checkout-1280-light", full=True)
    page.context.close()


if __name__ == "__main__":
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        print(f"E2E {BASE}, метка прогона {RUN}")
        # прогон создаёт больше 10 заявок за час, а сервер ограничивает заявки с одного адреса: сбрасываем счётчик в тестовой базе
        db("delete from rate_limits")
        for run in [
            a_totals_equal_engine_and_b_merge,
            c_remove_undo_and_d_reload,
            d2_stale_cart_dropped_with_notice,
            e_f_checkout_draft_photo_submit,
            f2_copy_link_and_live_update,
            g_network_failure_then_retry_one_order,
            g2_changed_payload_gets_new_key,
            h_other_requires_photo_and_manual_never_free,
            h2_mixed_order_shows_known_and_photo_separately,
            j_excluded_search_and_deeplinks,
            k_unknown_token_and_robots,
            l_keyboard_a11y,
            m_screenshots_mobile_and_dark,
        ]:
            if not only or any(run.__name__.startswith(o) for o in only):
                run(browser)
        browser.close()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\nИтог: {len(RESULTS) - len(failed)} из {len(RESULTS)} сценариев прошли")
    sys.exit(1 if failed else 0)
