"""
E2E кабинета владельца (Python Playwright). Запуск при работающем сайте:

    BASE_URL=http://127.0.0.1:3102 python e2e/test_admin_flow.py

Пароль владельца по умолчанию — демо `ladno-demo-2026` (OWNER_PASSWORD), БД — та, на которой запущен сервер.
Скрипт создаёт вымышленные заявки через публичный API, сам их удаляет и возвращает прайс и пароль как были.
Скриншоты — e2e/screenshots/admin-*.png. Код возврата 1, если хоть одна проверка не прошла.
"""
import io
import json
import os
import random
import re
import sys
import uuid
from datetime import date, timedelta

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3102").rstrip("/")
PASSWORD = os.environ.get("OWNER_PASSWORD", "ladno-demo-2026")
NEW_PASSWORD = "e2e-new-password-2026"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(SHOTS, exist_ok=True)

RUN = uuid.uuid4().hex[:6]
NAME_A = f"Тест E2E-{RUN}"
NAME_B = f"Второй E2E-{RUN}"
# у каждого прогона свой «IP»: лимиты входа и заявок считаются по нему
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
WISH = date.today() + timedelta(days=5)
XFF = f"198.51.100.{random.randint(1, 250)}"
HEADERS = {"X-Forwarded-For": XFF}

results: list[tuple[bool, str]] = []


def check(ok: bool, name: str, detail: str = "") -> bool:
    results.append((bool(ok), name))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))
    return bool(ok)


def norm(s: str) -> str:
    return s.replace("\u00a0", " ")


def png_bytes() -> bytes:
    img = Image.new("RGB", (640, 480), (190, 150, 90))
    for x in range(0, 640, 40):
        for y in range(480):
            img.putpixel((x, y), (60, 70, 60))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def shot(page, name: str, full: bool = True):
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, f"admin-{name}.png"), full_page=full)


def login(page, password: str = PASSWORD):
    page.goto(f"{BASE}/admin/login")
    page.get_by_label("Пароль").fill(password)
    page.get_by_role("button", name="Войти").click()
    page.wait_for_url(re.compile(r"/admin$"), timeout=15000)


def create_order(api, name: str, lines: list, photos: list, **extra) -> dict:
    body = {
        "name": name,
        "phone": "+7 903 111-22-33",
        "address": "Москва, ул. Вымышленная, д. 7, кв. 12",
        "access": {"entrance": "2", "intercom": "12К", "floor": "5", "elevator": "есть", "parking": "во дворе"},
        "materials": "master",
        "consent": True,
        "lines": lines,
        "photos": photos,
        "comment": "",
        **extra,
    }
    r = api.post(f"{BASE}/api/orders", data=json.dumps(body), headers={"Content-Type": "application/json", "Origin": BASE, "Idempotency-Key": str(uuid.uuid4())})
    assert r.status == 201, f"POST /api/orders → {r.status}: {r.text()}"
    return r.json()


def upload_photo(api) -> dict:
    r = api.post(f"{BASE}/api/uploads", multipart={"file": {"name": "e2e.png", "mimeType": "image/png", "buffer": png_bytes()}}, headers={"Origin": BASE})
    assert r.status == 201, f"POST /api/uploads → {r.status}: {r.text()}"
    j = r.json()
    return {"id": j["id"], "key": j["key"]}


def order_link(page, name: str):
    """Находит заявку в списке поиском и возвращает её адрес в кабинете."""
    page.goto(f"{BASE}/admin")
    page.get_by_label("Поиск").fill(name)
    link = page.get_by_role("link", name=re.compile(re.escape(name)))
    link.first.wait_for(timeout=10000)
    return link.first.get_attribute("href")


def panel(page, title: str):
    return page.locator("section", has=page.get_by_role("heading", name=title, exact=False)).last


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_args = dict(base_url=BASE, extra_http_headers=HEADERS)

        # ---------- закрытые маршруты ----------
        anon = browser.new_context(**ctx_args)
        api = anon.request
        r = api.get(f"{BASE}/api/admin/photos/x")
        check(r.status == 401, "фото без входа: /api/admin/photos/x → 401", str(r.status))
        r = api.get(f"{BASE}/api/admin/photos/{uuid.uuid4()}")
        check(r.status == 401, "фото без входа: корректный uuid → 401", str(r.status))
        page = anon.new_page()
        for path in ["/admin", "/admin/orders/x", f"/admin/orders/{uuid.uuid4()}", "/admin/tariffs", "/admin/company", "/admin/game", "/admin/characters", "/admin/access"]:
            page.goto(f"{BASE}{path}")
            try:
                page.wait_for_url(re.compile(r"/admin/login$"), timeout=10000)
                check(True, f"без входа {path} → /admin/login")
            except Exception:
                check(False, f"без входа {path} → /admin/login", page.url)
        login_html = anon.request.get(f"{BASE}/admin/login")
        hdr = login_html.headers
        check("no-store" in hdr.get("cache-control", ""), "заголовок Cache-Control: no-store у /admin/login", hdr.get("cache-control", ""))
        check("noindex" in hdr.get("x-robots-tag", ""), "заголовок X-Robots-Tag: noindex у /admin/login", hdr.get("x-robots-tag", ""))
        check(re.search(r'<meta name="robots" content="[^"]*noindex', login_html.text()) is not None, "meta robots noindex в HTML входа")

        # ---------- вход ----------
        page.goto(f"{BASE}/admin/login")
        shot(page, "login-desktop")
        page.get_by_label("Пароль").fill("совсем-не-тот-пароль")
        page.get_by_role("button", name="Войти").click()
        check(page.get_by_text("Неверный пароль.").first.is_visible() or page.get_by_text("Неверный пароль.").first.wait_for(timeout=8000) is None, "неверный пароль: сообщение у поля")
        check(page.url.endswith("/admin/login"), "после неверного пароля остаёмся на входе")

        owner = browser.new_context(**ctx_args)
        op = owner.new_page()
        msgs: list[str] = []
        op.on("pageerror", lambda e: msgs.append(f"pageerror: {e}"))
        op.on("console", lambda m: msgs.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        login(op)
        op.get_by_role("heading", name="Заявки", level=1).wait_for(timeout=15000)
        check(True, "вход: открыт список «Заявки»")
        check("ladno_sid" in [c["name"] for c in owner.cookies()], "cookie сеанса выставлена")
        cookie = [c for c in owner.cookies() if c["name"] == "ladno_sid"][0]
        check(cookie["httpOnly"] and cookie["sameSite"] == "Lax", "cookie httpOnly, SameSite=Lax")
        owner_state = owner.storage_state()
        op.goto(f"{BASE}/admin/login")
        try:
            op.wait_for_url(re.compile(r"/admin$"), timeout=8000)
            check(True, "уже вошли: страница входа ведёт в кабинет")
        except Exception:
            check(False, "уже вошли: страница входа ведёт в кабинет", op.url)

        # ---------- заявки из публичного API ----------
        oapi = owner.request
        photo = upload_photo(oapi)
        a = create_order(
            oapi, NAME_A,
            [
                {"serviceId": "furn-wardrobe", "qty": 1, "complex": True, "dismantle": False},
                {"serviceId": "other-photo", "qty": 1, "complex": False, "dismantle": False, "description": "Повесить тяжёлую картину на гипсокартон"},
            ],
            [photo], urgent=True, outOfTown=True, comment="Заодно нужно подключить газовую плиту.",
            desiredDate=WISH.isoformat(), desiredTime="12:00–15:00",
        )
        token_a = a["token"]
        check(a["number"] > 0, "создана заявка A через API", str(a))

        # пока заявка не открыта анонимно — HTML закрытой страницы не содержит данных
        href = order_link(op, NAME_A)
        order_id = href.rsplit("/", 1)[-1]
        raw = anon.request.get(f"{BASE}/admin/orders/{order_id}")
        check(NAME_A not in raw.text() and "+7903" not in raw.text() and "Вымышленная" not in raw.text(), "закрытая страница заявки без входа не отдаёт данные в HTML")

        # ---------- список ----------
        row = op.get_by_role("link", name=re.compile(re.escape(NAME_A))).first
        row_text = norm(row.inner_text())
        check("известно:" in row_text and "+ по фото" in row_text, "список: смешанный заказ — «известно: X ₽ + по фото», не итог", row_text)
        check("Срочно" in row_text and "За городом" in row_text and "не берём" in row_text and "Фото: 1" in row_text, "список: пометки срочно, за городом, не берём, фото", row_text)
        check(row.locator('[data-status="new"]').count() == 1, "список: статус «Новая»")
        op.get_by_role("link", name=re.compile(r"^Новая")).first.click()
        op.wait_for_url(re.compile(r"status=new"))
        check(op.get_by_role("link", name=re.compile(re.escape(NAME_A))).count() >= 1, "фильтр по статусу «Новая» оставляет заявку")
        op.get_by_role("link", name=re.compile(r"^Завершена")).first.click()
        op.wait_for_url(re.compile(r"status=done"))
        op.wait_for_timeout(500)
        check(op.get_by_role("link", name=re.compile(re.escape(NAME_A))).count() == 0, "фильтр по статусу «Завершена» скрывает новую заявку")
        op.goto(f"{BASE}/admin?q={NAME_A}&period=today")
        op.get_by_role("link", name=re.compile(re.escape(NAME_A))).first.wait_for(timeout=10000)
        check(op.get_by_role("link", name=re.compile(re.escape(NAME_A))).count() == 1, "период «Сегодня» + поиск находят заявку")
        op.goto(f"{BASE}/admin?q=%D0%BD%D0%B5%D1%82%D1%82%D0%B0%D0%BA%D0%BE%D0%B3%D0%BE{RUN}")
        op.get_by_text("Ничего не найдено").first.wait_for(timeout=10000)
        check(True, "пустой поиск: «Ничего не найдено»")
        op.goto(f"{BASE}/admin")
        btn = op.get_by_role("button", name="Обновить")
        btn.wait_for(timeout=10000)
        check(btn.is_visible(), "кнопка «Обновить» есть")
        btn.click()
        op.wait_for_timeout(600)
        check(op.get_by_text(re.compile(r"Обновлено в \d\d:\d\d")).first.is_visible(), "после «Обновить» видно время обновления")

        # ---------- карточка ----------
        op.goto(f"{BASE}{href}")
        op.get_by_role("heading", name=re.compile(r"Заявка №")).wait_for()
        body = norm(op.locator("main").inner_text())
        check(op.locator('a[href^="tel:+7903"]').count() == 1, "карточка: телефон — ссылка tel:")
        check("Копировать номер" in body, "карточка: есть «Копировать номер»")
        for needle in ["Вымышленная", "Подъезд", "Домофон", "12К", "Этаж", "Лифт", "Парковка", "во дворе", "Пусть купит мастер", "газовую плиту"]:
            check(needle in body, f"карточка: «{needle}»")
        check("Клиент упомянул то, что вы не берёте" in body and "Газовое оборудование" in body, "карточка: предупреждение «не берём»")
        check("Сборка шкафа" in body and "Сложные условия +25%" in body and "по фото" in body, "карточка: состав, сложные условия, «по фото»")
        check("Зафиксирован при отправке заявки" in body and "Новые цены на него не влияют" in body, "карточка: расчёт зафиксирован на момент отправки")
        check("Срочный выезд" in body and "Выезд за город" in body and "Известно сейчас" in body and "+ по фото" in body and "Ориентировочное время" in body, "карточка: строки предварительного расчёта и времени")
        check("Памятка для выезда" in body and "Шуруповёрт" in body, "карточка: памятка для выезда из памяток работ")
        check("купит мастер" in body.lower(), "карточка: памятка учитывает выбор материалов")
        check("Заявка создана клиентом" in body, "карточка: история")
        check(f"{WISH.day} {MONTHS[WISH.month - 1]}" in body and "12:00–15:00" in body, "карточка: желаемые дата и время")
        img = op.locator('img[src^="/api/admin/photos/"]').first
        img.wait_for()
        op.wait_for_timeout(500)
        check(img.evaluate("e => e.complete && e.naturalWidth > 0"), "карточка: миниатюра фото загружается с cookie владельца")
        shot(op, "order-desktop")

        # статус «Согласована» без цены и времени
        op.locator("label", has_text="Согласована").click()
        op.get_by_role("button", name="Сохранить", exact=True).click()
        check(op.get_by_text("укажите итоговую цену").first.is_visible(), "согласована без цены: ошибка у поля цены")
        check(op.get_by_text("укажите дату выезда").first.is_visible(), "согласована без времени: ошибка у поля даты")
        check(op.locator('h1 ~ [data-status="new"], [data-status="new"]').first.is_visible() and op.locator('[data-status="agreed"]').count() == 0, "статус не изменился")
        shot(op, "order-error-desktop")

        # цена и время → согласована
        op.get_by_label("Итоговая цена").fill("4200")
        op.get_by_label("Дата выезда").fill("2030-01-15")
        op.get_by_label("Время выезда").fill("10:00")
        op.get_by_role("button", name="Сохранить", exact=True).click()
        op.get_by_text("Сохранено.").first.wait_for(timeout=10000)
        op.locator('[data-status="agreed"]').first.wait_for(timeout=10000)
        check(True, "цена + время → статус «Согласована», сохранено")
        op.locator("main").get_by_text("Время выезда:").first.wait_for()
        hist = norm(op.locator("main").inner_text())
        check("Статус: Новая → Согласована" in hist and "Итоговая цена: не задана → 4 200 ₽" in hist and "15 января" in hist, "история: статус, цена, время", hist[-400:])

        # заметка
        op.get_by_label("Заметка", exact=True).fill("Позвонить после 18:00, у клиента собака.")
        op.get_by_role("button", name="Сохранить заметку").click()
        op.get_by_text("Заметка сохранена").first.wait_for(timeout=10000)
        check(True, "приватная заметка сохранена")
        op.reload()
        check(op.get_by_label("Заметка", exact=True).input_value().startswith("Позвонить после 18:00"), "заметка видна владельцу после перезагрузки")

        # клиент видит обновление по своей ссылке
        client = browser.new_context(extra_http_headers=HEADERS)
        pub = client.request.get(f"{BASE}/api/orders/{token_a}")
        j = pub.json()
        check(pub.status == 200 and j.get("finalPrice") == 4200 and str(j.get("agreedAt", "")).startswith("2030-01-15T07:00"), "API клиента: итоговая цена и согласованное время", json.dumps(j, ensure_ascii=False)[:300])
        pj = json.dumps(j, ensure_ascii=False)
        check("Позвонить после" not in pj and "+7903" not in pj and "Вымышленная" not in pj and "e2e.png" not in pj, "публичный API не отдаёт заметку, телефон и адрес")
        cp = client.new_page()
        cp.goto(f"{BASE}/o/{token_a}")
        if os.environ.get("SKIP_CLIENT_PAGE"):
            print("SKIP страница клиента /o/<токен> (SKIP_CLIENT_PAGE=1)")
        else:
            try:
                cp.wait_for_function("document.body.innerText.replace(/\u00a0/g,' ').includes('4 200')", timeout=15000)
                ctext = norm(cp.locator("body").inner_text())
                check("4 200" in ctext and "10:00" in ctext, "страница клиента /o/<токен>: цена 4 200 ₽ и время 10:00", ctext[:300])
                check("Позвонить после" not in ctext, "страница клиента не содержит приватную заметку")
            except Exception as e:  # страница клиента — зона другого инженера
                check(False, "страница клиента /o/<токен> показывает итоговую цену и согласованное время", f"{e}; {norm(cp.locator('body').inner_text())[:200]}")
        client.close()

        # ---------- тариф ----------
        op.goto(f"{BASE}/admin/tariffs")
        row_t = op.locator("#cat-furniture li", has_text="Сборка шкафа").first
        row_t.wait_for()
        before = norm(row_t.inner_text())
        m = re.search(r"([\d ]+) ₽ за шт", before)
        old_price = re.sub(r"\D", "", m.group(1)) if m else "3500"
        check("Памятка:" in before and "Шуруповёрт" in before, "тарифы: у работы видна памятка", before)
        check("по цене часа" in norm(op.locator("#cat-furniture li", has_text="Работа мастера").first.text_content() or ""), "тарифы: почасовая работа — «по цене часа»")
        check("по фото" in norm(op.locator("#cat-other li", has_text="Другая задача").first.text_content() or ""), "тарифы: «Другая задача» — «по фото»")
        check("Как считается цена" in norm(op.locator("main").inner_text()) and "Выезд за город добавляется отдельно" in norm(op.locator("main").inner_text()), "тарифы: блок о порядке расчёта")
        check("только для новых заявок" in norm(op.locator("main").inner_text()), "тарифы: сказано, что правки действуют на новые заявки")
        shot(op, "tariffs-desktop")
        row_t.get_by_role("button", name=re.compile("Изменить")).click()
        price_input = row_t.get_by_label("Цена за единицу")
        price_input.fill("12,5")
        row_t.get_by_role("button", name="Сохранить").click()
        check(row_t.get_by_text("целое число рублей").first.is_visible(), "тарифы: неверная цена — ошибка у поля")
        price_input.fill("3999")
        row_t.get_by_role("button", name="Сохранить").click()
        row_t.get_by_text("Сохранено.").first.wait_for(timeout=10000)
        op.wait_for_timeout(500)
        check("3 999 ₽ за шт" in norm(op.locator("#cat-furniture li", has_text="Сборка шкафа").first.inner_text()), "тарифы: новая цена показана в строке")

        b = create_order(oapi, NAME_B, [{"serviceId": "furn-wardrobe", "qty": 1, "complex": False, "dismantle": False}], [])
        href_b = order_link(op, NAME_B)
        op.goto(f"{BASE}{href_b}")
        op.get_by_role("heading", name=re.compile(r"Заявка №")).wait_for()
        text_b = norm(panel(op, "Состав и расчёт").inner_text())
        check("3 999 ₽" in text_b, "новая заявка считается по новой цене (3 999 ₽)", text_b[:300])
        check("Итого по расчёту" in text_b, "обычная заявка: «Итого по расчёту», не «Известно сейчас»")
        op.goto(f"{BASE}{href}")
        op.get_by_role("heading", name=re.compile(r"Заявка №")).wait_for()
        text_a = norm(panel(op, "Состав и расчёт").inner_text())
        check(f"{int(old_price):,}".replace(",", " ") + " ₽" in text_a and "3 999" not in text_a, "старая заявка: снимок цены не изменился", text_a[:300])

        # цена часа и общие настройки
        op.goto(f"{BASE}/admin/tariffs")
        hour = op.get_by_label("Цена часа", exact=True)
        old_hour = hour.input_value()
        hour.fill("")
        op.get_by_role("button", name="Сохранить", exact=True).first.click()
        check(op.get_by_text("Цена часа: укажите число").first.is_visible(), "настройки цен: пустая цена часа — ошибка у поля")
        hour.fill(old_hour)
        op.get_by_role("button", name="Сохранить", exact=True).first.click()
        op.get_by_text("Новые заявки считаются по этим ценам").first.wait_for(timeout=10000)
        check(True, "настройки цен: сохранено с пояснением про новые заявки")

        # вернуть прайс
        row_t = op.locator("#cat-furniture li", has_text="Сборка шкафа").first
        row_t.get_by_role("button", name=re.compile("Изменить")).click()
        row_t.get_by_label("Цена за единицу").fill(old_price)
        row_t.get_by_role("button", name="Сохранить").click()
        row_t.get_by_text("Сохранено.").first.wait_for(timeout=10000)

        # ---------- компания ----------
        op.goto(f"{BASE}/admin/company")
        op.get_by_label("Телефон", exact=True).wait_for()
        orig_company = {k: op.get_by_label(k, exact=True).input_value() for k in ["Название компании", "Город", "Телефон", "WhatsApp", "Telegram", "Почта"]}
        op.get_by_label("Телефон", exact=True).fill("12345")
        op.get_by_label("Почта", exact=True).fill("не-почта")
        op.get_by_role("button", name="Сохранить", exact=True).click()
        check(op.get_by_text("российский номер").first.is_visible() and op.get_by_text("проверьте адрес", exact=False).first.is_visible(), "компания: неверные телефон и почта — ошибки у полей")
        op.get_by_label("Телефон", exact=True).fill("")
        op.get_by_label("Почта", exact=True).fill("")
        op.get_by_label("Telegram").fill("t.me/ladno_e2e_test")
        op.get_by_role("button", name="Добавить в список").click()
        op.get_by_label("Название").last.fill("Тестовая работа E2E")
        op.get_by_label("Слова для поиска").last.fill("е2етест")
        op.get_by_role("button", name="Сохранить", exact=True).click()
        op.get_by_text("Сохранено.").first.wait_for(timeout=10000)
        op.reload()
        check(op.get_by_label("Telegram").input_value() == "@ladno_e2e_test", "компания: Telegram приведён к @имени и сохранён")
        check(op.get_by_label("Название").last.input_value() == "Тестовая работа E2E", "компания: добавленная работа «не берём» сохранена")
        shot(op, "company-desktop")
        # вернуть как было: убрать работу, вернуть Telegram
        op.get_by_role("button", name="Убрать из списка").last.click()
        op.get_by_label("Telegram").fill(orig_company["Telegram"])
        op.get_by_role("button", name="Сохранить", exact=True).click()
        op.get_by_text("Сохранено.").first.wait_for(timeout=10000)

        # ---------- игра ----------
        claim = oapi.post(f"{BASE}/api/game/claim", data=json.dumps({"token": token_a}), headers={"Content-Type": "application/json", "Origin": BASE})
        code = claim.json().get("code") if claim.status == 200 else None
        op.goto(f"{BASE}/admin/game")
        op.get_by_role("heading", name="Выданные коды").wait_for(timeout=15000)
        gbody = norm(op.locator("main").inner_text())
        check("Бонус применяется вручную после проверки. Автоматического погашения и защиты от обмана нет." in gbody, "игра: честная пометка про ручное применение")
        if code:
            check(code in gbody, "игра: выданный код в списке", gbody[-300:])
            op.get_by_role("button", name="Отметить погашенным").first.click()
            op.get_by_text("Погашен", exact=True).first.wait_for(timeout=10000)
            check(True, "игра: код отмечен погашенным")
            op.get_by_role("button", name="Вернуть в выданные").first.click()
            op.get_by_role("button", name="Аннулировать").first.wait_for(timeout=10000)
            shot(op, "game-desktop")
            op.get_by_role("button", name="Аннулировать").first.click()
            op.get_by_text("Аннулирован", exact=True).first.wait_for(timeout=10000)
            check(True, "игра: код аннулирован")
        else:
            check(False, "игра: код получен для проверки", claim.text())
        op.get_by_role("radio", name=re.compile("Бонус на следующий заказ")).check()
        op.get_by_label("Сумма бонуса").fill("")
        op.get_by_role("button", name="Сохранить", exact=True).click()
        check(op.get_by_text("Сумма бонуса: укажите число").first.is_visible(), "игра: пустая сумма — ошибка у поля")
        op.reload()

        # карточка заявки показывает бонусный код
        op.goto(f"{BASE}{href}")
        op.get_by_role("heading", name=re.compile(r"Заявка №")).wait_for()
        check(code is not None and code in norm(op.locator("main").inner_text()), "карточка: бонусный код заявки показан")

        # ---------- персонажи ----------
        op.goto(f"{BASE}/admin/characters")
        op.get_by_label("Показывать лица").wait_for()
        cbody = norm(op.locator("main").inner_text())
        check("Спокойный" in cbody and "Весёлый" in cbody and "Деловой" in cbody and "«" in cbody, "персонажи: три характера с примерами реплик")
        face = op.get_by_label("Показывать лица")
        was = face.is_checked()
        face.set_checked(not was)
        op.get_by_role("button", name="Сохранить", exact=True).click()
        op.get_by_text("Сохранено.").first.wait_for(timeout=10000)
        op.reload()
        check(op.get_by_label("Показывать лица").is_checked() == (not was), "персонажи: «Показывать лица» сохраняется")
        op.get_by_label("Показывать лица").set_checked(was)
        op.get_by_role("button", name="Сохранить", exact=True).click()
        op.get_by_text("Сохранено.").first.wait_for(timeout=10000)

        # ---------- удаление (с подтверждением) ----------
        op.goto(f"{BASE}{href_b}")
        op.get_by_role("button", name="Удалить заявку…").click()
        dlg = op.get_by_role("dialog")
        dlg.wait_for()
        dtext = norm(dlg.inner_text())
        check("безвозвратно" in dtext and "Удалить заявку" in dtext, "удаление: окно подтверждения говорит о безвозвратности", dtext)
        dlg.get_by_role("button", name="Отмена").click()
        op.wait_for_timeout(300)
        check(not dlg.is_visible(), "удаление: «Отмена» закрывает окно, заявка на месте")
        op.get_by_role("button", name="Удалить заявку…").click()
        op.get_by_role("dialog").get_by_role("button", name="Удалить навсегда").click()
        op.wait_for_url(re.compile(r"/admin\?deleted=1"), timeout=10000)
        op.get_by_text("Заявка удалена вместе с фото.").first.wait_for(timeout=10000)
        check(True, "удаление: после подтверждения — список и сообщение")
        r = op.goto(f"{BASE}{href_b}")
        op.get_by_text("Такой заявки нет").first.wait_for(timeout=10000)
        check(True, "удалённая заявка больше не открывается")

        # ---------- скриншоты: телефон и тёмная тема (до смены пароля) ----------
        for scheme in ("light", "dark"):
            mob = browser.new_context(**ctx_args, viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme=scheme, storage_state=owner_state, is_mobile=True, has_touch=True)
            mp = mob.new_page()
            mp.goto(f"{BASE}/admin")
            mp.get_by_role("heading", name="Заявки", level=1).wait_for()
            mp.wait_for_timeout(500)
            sfx = f"mobile-{scheme}"
            shot(mp, f"orders-{sfx}", full=False)
            mp.goto(f"{BASE}{href}")
            mp.get_by_role("heading", name=re.compile(r"Заявка №")).wait_for()
            shot(mp, f"order-{sfx}")
            mp.goto(f"{BASE}/admin/tariffs")
            mp.get_by_role("heading", name="Тарифы", level=1).wait_for()
            shot(mp, f"tariffs-{sfx}", full=False)
            mp.locator("#cat-furniture li", has_text="Сборка шкафа").first.get_by_role("button", name=re.compile("Изменить")).click()
            mp.wait_for_timeout(300)
            shot(mp, f"tariffs-edit-{sfx}", full=False)
            for path, name in [("/admin/company", "company"), ("/admin/game", "game"), ("/admin/characters", "characters"), ("/admin/access", "access")]:
                mp.goto(f"{BASE}{path}")
                mp.get_by_role("heading", level=1).wait_for()
                shot(mp, f"{name}-{sfx}", full=(name in ("company", "access")))
            # телефон: нет горизонтальной прокрутки
            for path in ["/admin", href, "/admin/tariffs", "/admin/company", "/admin/game", "/admin/characters", "/admin/access"]:
                mp.goto(f"{BASE}{path}")
                mp.get_by_role("heading", level=1).wait_for()
                mp.wait_for_timeout(200)
                over = mp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(over <= 0, f"телефон 390 px, {scheme}: нет горизонтальной прокрутки на {path[:28]}", str(over))
            mp.goto(f"{BASE}/admin/login")  # уже вошли → кабинет; для скриншота входа нужен новый контекст
            mob.close()
        mob_login = browser.new_context(**ctx_args, viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="dark")
        lp = mob_login.new_page()
        lp.goto(f"{BASE}/admin/login")
        lp.get_by_label("Пароль").wait_for()
        shot(lp, "login-mobile-dark", full=False)
        mob_login.close()

        # ---------- смена пароля ----------
        sess_b = browser.new_context(**ctx_args)
        bp = sess_b.new_page()
        login(bp)
        op.goto(f"{BASE}/admin/access")
        op.get_by_label("Текущий пароль").wait_for()
        op.get_by_label("Текущий пароль").fill("неверный-старый-пароль")
        op.get_by_label("Новый пароль", exact=True).fill(NEW_PASSWORD)
        op.get_by_label("Новый пароль ещё раз").fill("другой-пароль-1234")
        op.get_by_role("button", name="Сменить пароль").click()
        check(op.get_by_text("Пароли не совпадают").first.is_visible(), "пароль: несовпадение — ошибка у поля (без запроса на сервер)")
        op.get_by_label("Новый пароль ещё раз").fill(NEW_PASSWORD)
        op.get_by_role("button", name="Сменить пароль").click()
        op.get_by_text("Текущий пароль неверен.").first.wait_for(timeout=10000)
        check(True, "пароль: неверный текущий — ошибка у поля")
        op.get_by_label("Текущий пароль").fill(PASSWORD)
        op.get_by_role("button", name="Сменить пароль").click()
        op.get_by_text("Пароль изменён.").first.wait_for(timeout=15000)
        check("все остальные сеансы закрыты" in op.locator("main").inner_text().lower(), "пароль: сказано, что остальные сеансы закрыты")
        op.reload()
        check(op.url.endswith("/admin/access"), "пароль: текущий браузер остался в кабинете")
        bp.goto(f"{BASE}/admin")
        try:
            bp.wait_for_url(re.compile(r"/admin/login$"), timeout=10000)
            check(True, "пароль: другой сеанс закрыт")
        except Exception:
            check(False, "пароль: другой сеанс закрыт", bp.url)
        old = browser.new_context(**ctx_args, storage_state=owner_state)
        ol = old.new_page()
        ol.goto(f"{BASE}/admin")
        try:
            ol.wait_for_url(re.compile(r"/admin/login$"), timeout=10000)
            check(True, "пароль: старая cookie больше не работает")
        except Exception:
            check(False, "пароль: старая cookie больше не работает", ol.url)
        old.close()
        fresh = browser.new_context(**ctx_args)
        fp = fresh.new_page()
        fp.goto(f"{BASE}/admin/login")
        fp.get_by_label("Пароль").fill(PASSWORD)
        fp.get_by_role("button", name="Войти").click()
        check(fp.get_by_text("Неверный пароль.").first.is_visible() or fp.get_by_text("Неверный пароль.").first.wait_for(timeout=8000) is None, "пароль: старый пароль не входит")
        fresh.close()
        # вернуть демо-пароль
        op.get_by_label("Текущий пароль").fill(NEW_PASSWORD)
        op.get_by_label("Новый пароль", exact=True).fill(PASSWORD)
        op.get_by_label("Новый пароль ещё раз").fill(PASSWORD)
        op.get_by_role("button", name="Сменить пароль").click()
        op.get_by_text("Пароль изменён.").first.wait_for(timeout=15000)
        check(True, "пароль возвращён к исходному")

        # ---------- выход ----------
        op.get_by_role("button", name="Выйти на всех устройствах").click()
        op.wait_for_url(re.compile(r"/admin/login$"), timeout=10000)
        check(True, "«Выйти на всех устройствах» → вход")
        op.goto(f"{BASE}/admin")
        try:
            op.wait_for_url(re.compile(r"/admin/login$"), timeout=10000)
            check(True, "после выхода кабинет закрыт")
        except Exception:
            check(False, "после выхода кабинет закрыт", op.url)
        login(op)
        op.goto(f"{BASE}/admin/access")
        op.locator("main").get_by_role("button", name="Выйти", exact=True).click()
        op.wait_for_url(re.compile(r"/admin/login$"), timeout=10000)
        check(True, "«Выйти» → вход")

        # ---------- уборка: удалить заявку A ----------
        login(op)
        op.goto(f"{BASE}{href}")
        op.get_by_role("button", name="Удалить заявку…").click()
        op.get_by_role("dialog").get_by_role("button", name="Удалить навсегда").click()
        op.wait_for_url(re.compile(r"/admin\?deleted=1"), timeout=10000)
        check(True, "уборка: тестовая заявка удалена")

        check(not [m for m in msgs if "pageerror" in m], "в консоли нет необработанных ошибок страницы", "; ".join(msgs)[:400])
        browser.close()


if __name__ == "__main__":
    try:
        run()
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        results.append((False, f"сценарий прерван: {e}"))
    failed = [n for ok, n in results if not ok]
    print(f"\nИтого: {len(results) - len(failed)} из {len(results)} проверок прошли.")
    if failed:
        print("Не прошли:\n  - " + "\n  - ".join(failed))
        sys.exit(1)
