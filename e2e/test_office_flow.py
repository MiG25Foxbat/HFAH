"""
E2E публичной части этапа 2 «Запросто»: категория «Бытовая техника» и динамические категории, раздел «Для офисов»,
оформление от организации, страница заявки организации, выключенные организации, 360 px без горизонтальной прокрутки.

Запуск (сервер уже работает):
    BASE_URL=http://127.0.0.1:3014 DATABASE_URL=postgres://… python e2e/test_office_flow.py [префикс сценария …]
Опирается на помощники клиентского E2E (e2e/test_client_flow.py). Сценарии временно меняют настройки компании и добавляют
категории в базу сервера и возвращают всё как было. Скриншоты — e2e/screenshots/office-*.png.
"""

import json
import os
import re
import sys
import uuid

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

from test_client_flow import (  # noqa: E402
    BASE,
    RESULTS,
    RUN,
    add_work,
    close_sheet,
    db,
    fresh_home,
    header_cart,
    money,
    new_page,
    no_errors,
    no_hscroll,
    scenario,
    shot,
    submit_and_wait,
)

GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
NO_GL_ARGS = ["--disable-webgl", "--disable-3d-apis", "--disable-gpu"]
OFFICE_PATH = "/dlya-ofisov"


# ---------- база ----------
def set_company(patch: dict):
    """Меняет поля раздела company настроек; возвращает прежние значения этих полей."""
    before = db("select company from settings where id = 1")[0]["company"]
    db(f"update settings set company = company || '{json.dumps(patch, ensure_ascii=False)}'::jsonb where id = 1")
    return {k: before.get(k) for k in patch}


def restore_company(old: dict):
    db(f"update settings set company = company || '{json.dumps(old, ensure_ascii=False)}'::jsonb where id = 1")


def visible_categories():
    """Что должен видеть клиент: видимые категории с хотя бы одной доступной работой, по порядку."""
    return db(
        """select c.id, c.title, c.character, c.color from categories c
           where c.active and exists (select 1 from services s where s.category = c.id and s.active)
           order by c.sort, c.id"""
    )


def chips(page):
    return page.get_by_role("group", name="Категории работ").get_by_role("button")


def chip_titles(page):
    return [t.strip() for t in chips(page).all_inner_texts()]


def active_chip_inside_row(page):
    """Выбранный чип целиком в видимой части ряда."""
    return page.evaluate(
        """() => {
          const row = document.querySelector('[aria-label="Категории работ"]');
          const chip = row.querySelector('[aria-pressed=true]');
          if (!chip) return null;
          const r = row.getBoundingClientRect(), c = chip.getBoundingClientRect();
          return c.left >= r.left - 1 && c.right <= r.right + 1;
        }"""
    )


def api_order(page, name, lines, **extra):
    body = {
        "name": name,
        "phone": "+7 903 111-22-33",
        "address": "Москва, ул. Вымышленная, д. 7, офис 12",
        "materials": "master",
        "consent": True,
        "lines": lines,
        "photos": [],
        **extra,
    }
    r = page.request.post(f"{BASE}/api/orders", data=json.dumps(body), headers={"Content-Type": "application/json", "Origin": BASE, "Idempotency-Key": str(uuid.uuid4())})
    assert r.status == 201, f"POST /api/orders → {r.status}: {r.text()}"
    return r.json()


def go_checkout_from_office(page, work="Сборка офисного кресла"):
    page.goto(BASE + OFFICE_PATH, wait_until="networkidle")
    add_work(page, work)
    page.get_by_role("link", name="Оформить", exact=True).first.click()
    page.wait_for_url(re.compile(r"/checkout"))
    page.get_by_role("heading", name="Оформление заявки").wait_for()
    page.wait_for_timeout(400)  # сразу после перехода ввод ещё может не дойти до формы


def fill_org(page, org_name, inn="", invoice=False, contact="Иван Петров", address="Москва, ул. Вымышленная, д. 3, офис 12"):
    page.locator("#f-orgName").fill(org_name)
    if inn:
        page.locator("#f-orgInn").fill(inn)
    if invoice:
        page.get_by_role("checkbox", name=re.compile("Нужен счёт")).check()
    page.get_by_label("Контактное лицо", exact=True).fill(contact)
    page.get_by_label("Телефон", exact=True).fill("8 (912) 345-67-89")
    page.get_by_label("Адрес офиса", exact=True).fill(address)
    page.get_by_label("Куплю сам").check()


# ---------- сценарии ----------
@scenario
def a_appliances_chip_character_and_works(browser):
    """«Бытовая техника»: чип, стиральная машина на сцене, её работы; чипы листаются без переполнения страницы; без WebGL — постер."""
    expected = visible_categories()
    assert any(c["id"] == "appliances" for c in expected)
    for w in (360, 390, 1280):
        page = new_page(browser, w, 844 if w < 600 else 800)
        fresh_home(page)
        titles = chip_titles(page)
        assert titles == [c["title"] for c in expected], (w, titles)
        assert "Бытовая техника" in titles
        no_hscroll(page, f"главная {w}")
        chips(page).filter(has_text="Бытовая техника").click()
        expect(page.locator("[data-stage]")).to_have_attribute("data-stage", "appliances")
        assert "c=appliances" in page.url
        # рядом с выбранным чипом заголовок и работы категории — те же, что в базе
        rows = db("select title from services where category = 'appliances' and active order by sort")
        section = page.locator("#c-appliances")
        expect(section).to_be_visible()
        for r in rows:
            expect(section.get_by_role("heading", name=r["title"], exact=True)).to_be_visible()
        assert section.locator("li").count() == len(rows), (section.locator("li").count(), len(rows))
        assert active_chip_inside_row(page), f"выбранный чип не виден в ряду на {w} px"
        # ряд категорий прокручивается сам, а не растягивает страницу
        scrolls = page.evaluate("() => { const r = document.querySelector('[aria-label=\"Категории работ\"]'); return [r.scrollWidth, r.clientWidth]; }")
        if w < 600:
            assert scrolls[0] > scrolls[1], f"на {w} px ряд должен прокручиваться: {scrolls}"
        no_hscroll(page, f"бытовая техника {w}")
        no_errors(page, f"чип бытовой техники {w}")
        page.context.close()

    # переход по ссылке ?c=appliances: выбранный чип сразу в видимой части ряда (раньше он оставался за краем)
    page = new_page(browser, 360, 780)
    page.goto(BASE + "/", wait_until="networkidle")
    page.goto(BASE + "/?c=appliances", wait_until="networkidle")
    page.wait_for_timeout(700)
    assert active_chip_inside_row(page), "при заходе с ?c=appliances выбранный чип за краем ряда"
    page.context.close()

    # светлая и тёмная, телефон и десктоп: снимки смотрим глазами
    for scheme in ("light", "dark"):
        for w, h in ((360, 780), (1280, 800)):
            page = new_page(browser, w, h, scheme)
            page.goto(BASE + "/", wait_until="networkidle")
            page.goto(BASE + "/?c=appliances", wait_until="networkidle")
            page.wait_for_timeout(900)
            no_hscroll(page, f"бытовая техника {scheme} {w}")
            shot(page, f"office-appliances-{w}-{scheme}")
            page.context.close()

    # без WebGL: постер стиральной машины и подпись
    b2 = browser.browser_type.launch(args=NO_GL_ARGS)
    try:
        page = new_page(b2, 1100, 800)
        page.goto(BASE + "/?c=appliances", wait_until="networkidle")
        page.wait_for_timeout(600)
        expect(page.locator("[data-stage]")).to_have_attribute("data-stage-state", "no-webgl")
        assert "/posters/appliances.webp" in (page.locator("[data-stage] img").first.get_attribute("src") or "")
        chips(page).filter(has_text="Сантехника").click()
        assert "/posters/plumbing.webp" in (page.locator("[data-stage] img").first.get_attribute("src") or "")
        shot(page, "office-appliances-no-webgl")
        page.context.close()
    finally:
        b2.close()

    # с WebGL сцена доходит до готовности с новым персонажем
    b3 = browser.browser_type.launch(args=GL_ARGS)
    try:
        page = new_page(b3, 390, 844)
        page.goto(BASE + "/?c=appliances", wait_until="networkidle")
        page.wait_for_function("document.querySelector('[data-stage]')?.dataset.stageState === 'ready'", timeout=40000)
        assert page.locator("[data-stage]").get_attribute("data-stage") == "appliances"
        page.context.close()
    finally:
        b3.close()


@scenario
def b_dynamic_categories_up_to_twelve(browser):
    """Категории из базы: до 12; скрытая и пустая не показываются; чипы листаются; выбранный чип виден; сцена следует за персонажем."""
    p = f"e2e-{RUN}"
    extra = [
        # id, название, цвет, персонаж, активна, число доступных работ
        (f"{p}-a", f"Тест окна {RUN}", "#C9689A", "plumbing", True, 1),
        (f"{p}-b", f"Тест двери {RUN}", "#5BB5C8", "electrics", True, 1),
        (f"{p}-c", f"Тест техника {RUN}", "#9DB84A", "appliances", True, 1),
        (f"{p}-d", f"Тест уборка {RUN}", "#E08F4F", "furniture", True, 1),
        (f"{p}-e", f"Тест скрытая {RUN}", "#7E8D99", "repair", False, 1),
        (f"{p}-f", f"Тест пустая {RUN}", "#C08A55", "other", True, 0),
    ]
    try:
        for i, (cid, title, color, char, active, n) in enumerate(extra):
            db(f"insert into categories (id, title, color, character, active, sort) values ('{cid}', '{title}', '{color}', '{char}', {str(active).lower()}, {70 + i * 10})")
            for j in range(n):
                db(
                    f"""insert into services (id, category, title, description, unit, pricing, price, minutes, dismantle_allowed, office, memo, active, sort)
                        values ('{cid}-w{j}', '{cid}', 'Тестовая работа {cid[-1]} {RUN}', '', 'pcs', 'fixed', 500, 30, false, {str(cid.endswith('a')).lower()}, '', true, {10 + j})"""
                )
        # неактивная работа в видимой категории не должна появиться
        db(
            f"""insert into services (id, category, title, description, unit, pricing, price, minutes, dismantle_allowed, office, memo, active, sort)
                values ('{p}-a-off', '{p}-a', 'Выключенная работа {RUN}', '', 'pcs', 'fixed', 500, 30, false, true, '', false, 99)"""
        )
        expected = visible_categories()
        assert len(expected) == 10 and f"Тест уборка {RUN}" in [c["title"] for c in expected]
        assert not any("скрытая" in c["title"] or "пустая" in c["title"] for c in expected)

        for w, h in ((360, 780), (390, 844), (1280, 800)):
            page = new_page(browser, w, h)
            fresh_home(page)
            titles = chip_titles(page)
            assert titles == [c["title"] for c in expected], (w, titles)
            no_hscroll(page, f"10 категорий {w}")
            row = page.evaluate("() => { const r = document.querySelector('[aria-label=\"Категории работ\"]'); return [r.scrollWidth, r.clientWidth]; }")
            assert row[0] > row[1], f"ряд чипов должен прокручиваться: {row}"
            # последний чип: выбирается, остаётся видимым, сцена показывает его персонажа, работы категории — в списке
            last = expected[-1]
            chips(page).filter(has_text=last["title"]).click()
            page.wait_for_timeout(700)
            expect(page.locator("[data-stage]")).to_have_attribute("data-stage", last["character"])
            assert active_chip_inside_row(page), f"выбранный последний чип не виден на {w} px"
            expect(page.locator(f"#c-{last['id']}")).to_be_visible()
            assert "Выключенная работа" not in page.content() and "Тест скрытая" not in page.content() and "Тест пустая" not in page.content()
            no_hscroll(page, f"последняя категория {w}")
            if w == 360:
                shot(page, "office-dynamic-360-light")
            no_errors(page, f"динамические категории {w}")
            page.context.close()

        # заход по ссылке на дальнюю категорию: чип виден сразу
        page = new_page(browser, 360, 780)
        page.goto(BASE + "/", wait_until="networkidle")
        page.goto(BASE + f"/?c={p}-d", wait_until="networkidle")
        page.wait_for_timeout(700)
        assert active_chip_inside_row(page), "при заходе с ?c=… дальний чип остался за краем"
        page.context.close()

        # скрытая и пустая категория не попадают и на /uslugi
        page = new_page(browser, 1280, 800)
        page.goto(BASE + "/uslugi", wait_until="networkidle")
        body = page.locator("main").inner_text()
        assert f"Тест окна {RUN}" in body and "Тест скрытая" not in body and "Тест пустая" not in body and "Выключенная работа" not in body
        no_hscroll(page, "/uslugi, 10 категорий")
        page.context.close()
        page = new_page(browser, 360, 780)
        page.goto(BASE + "/uslugi", wait_until="networkidle")
        no_hscroll(page, "/uslugi 360, 10 категорий")
        page.context.close()
    finally:
        db(f"delete from services where category like '{p}-%'")
        db(f"delete from categories where id like '{p}-%'")


@scenario
def c_office_page_lists_office_works_and_shares_cart(browser):
    """/dlya-ofisov: офисные работы по категориям с теми же ценами, «Добавить» кладёт в ту же корзину, ссылки в шапке, подвале, на главной и в sitemap."""
    settings = db("select company from settings where id = 1")[0]["company"]
    works = db(
        """select s.id, s.title, s.price, s.pricing, c.id as cid, c.title as ctitle from services s join categories c on c.id = s.category
           where s.active and c.active and s.office order by c.sort, c.id, s.sort, s.id"""
    )
    non_office = db("select s.title from services s join categories c on c.id = s.category where s.active and c.active and not s.office order by c.sort, s.sort limit 1")[0]["title"]
    groups = []
    for w in works:
        if not groups or groups[-1][0] != w["cid"]:
            groups.append((w["cid"], w["ctitle"], []))
        groups[-1][2].append(w)

    page = new_page(browser, 1280, 800)
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("() => localStorage.clear()")
    resp = page.goto(BASE + OFFICE_PATH, wait_until="networkidle")
    assert resp.status == 200
    expect(page.get_by_role("heading", level=1, name="Для офисов")).to_be_visible()
    expect(page.get_by_role("heading", level=2, name="Как мы работаем с организациями")).to_be_visible()
    assert page.title().startswith("Для офисов"), page.title()
    # условия владельца и строка про счёт (включена в настройках)
    assert settings["orgNote"].strip() in page.locator("main").inner_text()
    assert settings["invoiceEnabled"] and "закрывающие документы" in page.locator("main").inner_text()
    # работы: по категориям, только с флагом «для офиса», без пустых категорий
    got = page.evaluate(
        """() => [...document.querySelectorAll('main section[id^="c-"]')].map(s => [s.querySelector('h2').innerText.trim(), [...s.querySelectorAll('h3')].map(h => h.innerText.trim())])"""
    )
    assert got == [[g[1], [w["title"] for w in g[2]]] for g in groups], got
    assert non_office not in page.locator("main").inner_text(), f"работа без флага «для офиса» попала в раздел: {non_office}"
    # цена в строке — та же, что в базе
    chair = next(w for w in works if w["title"] == "Сборка офисного кресла")
    row = page.get_by_role("listitem").filter(has=page.get_by_role("heading", name="Сборка офисного кресла"))
    assert money(re.search(r"([\d\s ]+)₽ за шт", row.inner_text()).group(1)) == chair["price"], row.inner_text()

    # «Добавить» кладёт в ту же корзину, что и на главной
    add_work(page, "Сборка офисного кресла")
    expect(header_cart(page)).to_have_attribute("aria-label", "Корзина: 1 работа")
    expect(row).to_contain_text("В корзине: 1 шт")
    bar = page.get_by_role("link", name="Оформить", exact=True).first
    assert bar.get_attribute("href") == "/checkout?client=organization"
    page.get_by_role("link", name="На главную").click()  # переход внутри приложения: корзина общая
    page.wait_for_url(BASE + "/")
    expect(header_cart(page)).to_have_attribute("aria-label", "Корзина: 1 работа")
    expect(page.get_by_role("button", name=re.compile("^Открыть корзину"))).to_be_visible()
    # ссылки: тихая на главной, в шапке и подвале
    expect(page.get_by_role("link", name="Работы для офисов")).to_be_visible()
    assert page.locator('header a[href="/dlya-ofisov"]').count() == 1
    assert page.locator('footer a[href="/dlya-ofisov"]').count() == 1
    assert page.locator('main a[href="/dlya-ofisov"]').count() == 1
    no_errors(page, "раздел для офисов")
    page.context.close()

    # на 360 px в шапку ссылка не помещается (она в подвале и на главной), контакты остаются, переполнения нет
    page = new_page(browser, 360, 780)
    page.goto(BASE + "/", wait_until="networkidle")
    assert page.locator('header a[href="/dlya-ofisov"]').is_visible() is False
    assert page.locator('footer a[href="/dlya-ofisov"]').count() == 1
    no_hscroll(page, "главная 360")
    page.goto(BASE + OFFICE_PATH, wait_until="networkidle")
    no_hscroll(page, "для офисов 360")
    page.context.close()

    # sitemap
    page = new_page(browser, 1280, 800)
    xml = page.request.get(BASE + "/sitemap.xml").text()
    assert OFFICE_PATH in xml, xml
    page.context.close()


@scenario
def d_org_checkout_validation_draft_and_success(browser):
    """Оформление организации: переключатель, обязательное название, ИНН, черновик, отправка, страница заявки с заказчиком и счётом."""
    page = new_page(browser, 390, 844)
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("() => localStorage.clear()")
    go_checkout_from_office(page)
    org_radio = page.get_by_label("Организация", exact=True)
    expect(org_radio).to_be_checked()  # пришли со страницы «Для офисов»
    assert "client=" not in page.url, f"параметр остался в адресе: {page.url}"
    expect(page.get_by_label("Адрес офиса", exact=True)).to_be_visible()
    expect(page.get_by_label("Контактное лицо", exact=True)).to_be_visible()
    assert page.locator("#f-orgInn").get_attribute("inputmode") == "numeric"
    expect(page.get_by_role("checkbox", name=re.compile("Нужен счёт и закрывающие документы"))).to_be_visible()
    shot(page, "office-checkout-org-390-light", full=True)

    # частное лицо: поля организации уходят, подписи прежние
    page.get_by_text("Частное лицо", exact=True).click()
    expect(page.locator("#f-orgName")).to_have_count(0)
    expect(page.get_by_label("Имя", exact=True)).to_be_visible()
    expect(page.get_by_label("Адрес", exact=True)).to_be_visible()
    page.get_by_text("Организация", exact=True).click()
    expect(page.locator("#f-orgName")).to_be_visible()

    # без названия: ошибка у поля, фокус на нём, запрос не уходит
    posted = []
    page.on("request", lambda r: posted.append(r.post_data) if r.method == "POST" and r.url.endswith("/api/orders") else None)
    contact = f"Контакт {RUN}"
    page.get_by_label("Контактное лицо", exact=True).fill(contact)
    page.get_by_label("Телефон", exact=True).fill("8 (912) 345-67-89")
    page.get_by_label("Адрес офиса", exact=True).fill("Москва, ул. Вымышленная, д. 3, офис 12")
    page.get_by_label("Куплю сам").check()
    page.locator("#f-consent").check()
    page.get_by_role("button", name="Отправить заявку").click()
    expect(page.locator("#f-orgName-err")).to_contain_text("Укажите название организации")
    expect(page.locator("#f-orgName")).to_be_focused()
    assert not posted

    # неверный ИНН: ошибка рядом с полем
    page.locator("#f-orgName").fill(f"ООО «Ромашка {RUN}»")
    page.locator("#f-orgInn").fill("12345")
    page.get_by_role("button", name="Отправить заявку").click()
    expect(page.locator("#f-orgInn-err")).to_contain_text("ИНН")
    expect(page.locator("#f-orgInn")).to_be_focused()
    assert not posted
    shot(page, "office-checkout-org-errors-390-light", full=True)
    no_hscroll(page, "оформление организации, ошибки")

    # черновик: перезагрузка сохраняет организацию и реквизиты (согласие — нет)
    page.locator("#f-orgInn").fill("7707 083893")
    page.get_by_role("checkbox", name=re.compile("Нужен счёт")).check()
    page.wait_for_timeout(500)
    saved = page.evaluate("() => localStorage.getItem('zaprosto-draft-v1')")
    assert saved and "organization" in saved and "Ромашка" in saved and "7707 083893" in saved, saved
    page.reload(wait_until="networkidle")
    expect(page.get_by_label("Организация", exact=True)).to_be_checked()
    assert page.locator("#f-orgName").input_value() == f"ООО «Ромашка {RUN}»"
    assert page.locator("#f-orgInn").input_value() == "7707 083893"
    expect(page.get_by_role("checkbox", name=re.compile("Нужен счёт"))).to_be_checked()
    assert page.get_by_label("Контактное лицо", exact=True).input_value() == contact
    assert not page.locator("#f-consent").is_checked()

    # отправка
    page.locator("#f-consent").check()
    shot(page, "office-checkout-org-filled-390-light", full=True)
    submit_and_wait(page)
    assert len(posted) == 1
    body = json.loads(posted[0])
    assert body["clientType"] == "organization" and body["orgName"] == f"ООО «Ромашка {RUN}»" and body["wantsInvoice"] is True
    token = page.url.rstrip("/").split("/")[-1]
    article = page.locator("article")
    expect(article).to_contain_text("Заказчик")
    expect(article).to_contain_text(f"ООО «Ромашка {RUN}»")
    expect(article).to_contain_text("Счёт и закрывающие документы")
    details = page.get_by_role("region", name="Детали").inner_text()
    assert re.search(r"Счёт и закрывающие документы\s*Да", details), details
    # на странице заявки есть категория строки (из снимка), в базе — реквизиты, в публичном JSON — без ИНН и контактов
    expect(article).to_contain_text("Мебель")
    row = db(f"select client_type, org_name, org_inn, wants_invoice from orders where customer_name = '{contact}'")
    assert row == [{"client_type": "organization", "org_name": f"ООО «Ромашка {RUN}»", "org_inn": "7707083893", "wants_invoice": True}], row
    pub = page.request.get(f"{BASE}/api/orders/{token}").json()
    assert pub["clientType"] == "organization" and pub["orgName"] == f"ООО «Ромашка {RUN}»" and pub["wantsInvoice"] is True
    assert "7707083893" not in json.dumps(pub) and "orgInn" not in pub and "phone" not in pub and "address" not in pub
    no_hscroll(page, "страница заявки организации")
    shot(page, "office-order-org-390-light", full=True)
    no_errors(page, "оформление организации")

    # старая заявка без названия и персонажа категории в снимке: страница и игра берут запасные значения
    num = int(re.search(r"Заявка № (\d+)", article.locator("h1").inner_text()).group(1))
    db(
        f"""update orders set pricing_snapshot = jsonb_set(pricing_snapshot, '{{lines}}',
            (select jsonb_agg(l - 'categoryTitle' - 'categoryColor' - 'character') from jsonb_array_elements(pricing_snapshot->'lines') l))
            where number = {num}"""
    )
    page.reload(wait_until="networkidle")
    expect(page.locator("article")).to_contain_text("Мебель")
    pub = page.request.get(f"{BASE}/api/orders/{token}").json()
    assert pub["lines"][0]["categoryTitle"] == "Мебель" and pub["lines"][0]["character"] == "furniture", pub["lines"][0]
    page.context.close()

    # частное лицо: строки «Заказчик» нет, организация не ушла в тело
    page = new_page(browser, 390, 844)
    page.goto(BASE + "/", wait_until="networkidle")
    person = api_order(page, f"Частный {RUN}", [{"serviceId": "furn-wardrobe", "qty": 1}], clientType="person", orgName="Лишнее", orgInn="7707083893", wantsInvoice=True)
    page.goto(BASE + person["url"], wait_until="networkidle")
    assert "Заказчик" not in page.locator("article").inner_text() and "Лишнее" not in page.locator("article").inner_text()
    assert db(f"select client_type, org_name, org_inn, wants_invoice from orders where customer_name = 'Частный {RUN}'") == [{"client_type": "person", "org_name": None, "org_inn": None, "wants_invoice": False}]
    page.context.close()


@scenario
def e_orgs_switched_off_and_invoice_off(browser):
    """Организации выключены: нет раздела, ссылок и выбора «Организация»; выключили при открытой форме — спокойное сообщение и возврат к частному лицу; без счёта нет флажка."""
    old = set_company({"orgsEnabled": False})
    try:
        page = new_page(browser, 1280, 800)
        resp = page.goto(BASE + OFFICE_PATH, wait_until="networkidle")
        # ответ идёт потоком (как у /o/<токен>): статус остаётся 200, но страница — «не найдено» с noindex
        assert resp.status in (200, 404), resp.status
        expect(page.get_by_role("heading", name="Страница не найдена")).to_be_visible()
        assert page.get_by_role("heading", level=1, name="Для офисов").count() == 0
        assert "noindex" in page.content(), "у недоступной страницы нет noindex"
        for path in ("/", "/uslugi", "/contacts", "/privacy"):
            page.goto(BASE + path, wait_until="networkidle")
            assert page.locator('a[href="/dlya-ofisov"]').count() == 0, f"ссылка на раздел при выключенных организациях: {path}"
        assert OFFICE_PATH not in page.request.get(BASE + "/sitemap.xml").text()
        # оформление: нет переключателя и полей организации, даже со ссылкой ?client=organization
        page.goto(BASE + "/", wait_until="networkidle")
        page.evaluate("() => localStorage.clear()")
        page.goto(BASE + "/", wait_until="networkidle")
        add_work(page, "Сборка шкафа")
        page.goto(BASE + "/checkout?client=organization", wait_until="networkidle")
        page.get_by_label("Имя", exact=True).wait_for()
        assert page.get_by_text("Кто заказывает").count() == 0 and page.locator("#f-orgName").count() == 0
        assert page.get_by_label("Организация", exact=True).count() == 0
        page.context.close()
    finally:
        restore_company(old)

    # организации выключили, пока форма была открыта
    page = new_page(browser, 390, 844)
    page.goto(BASE + "/", wait_until="networkidle")
    page.evaluate("() => localStorage.clear()")
    go_checkout_from_office(page)
    expect(page.get_by_label("Организация", exact=True)).to_be_checked()
    name = f"Контакт выкл {RUN}"
    fill_org(page, f"ООО «Закрытая {RUN}»", contact=name)
    page.locator("#f-consent").check()
    old = set_company({"orgsEnabled": False})
    try:
        page.get_by_role("button", name="Отправить заявку").click()
        callout = page.get_by_text("заявки от организаций не принимаются")
        expect(callout).to_be_visible()
        assert "Частное лицо" in callout.inner_text()
        assert db(f"select count(*)::int as n from orders where customer_name = '{name}'")[0]["n"] == 0
        # форма вернулась к частному лицу, выбор организации исчез, введённое сохранено
        expect(page.get_by_label("Организация", exact=True)).to_have_count(0)
        expect(page.locator("#f-orgName")).to_have_count(0)
        assert page.get_by_label("Имя", exact=True).input_value() == name
        shot(page, "office-checkout-orgs-off-390-light", full=True)
        no_hscroll(page, "организации выключены при открытой форме")
        # повторная отправка уже как частное лицо проходит
        page.locator("#f-consent").check()
        submit_and_wait(page)
        assert "Заказчик" not in page.locator("article").inner_text()
        assert db(f"select client_type from orders where customer_name = '{name}'") == [{"client_type": "person"}]
    finally:
        restore_company(old)
    page.context.close()

    # без оплаты по счёту: нет строки про счёт на странице и флажка в форме
    old = set_company({"invoiceEnabled": False, "orgNote": ""})
    try:
        page = new_page(browser, 390, 844)
        page.goto(BASE + OFFICE_PATH, wait_until="networkidle")
        text = page.locator("main").inner_text()
        assert "закрывающие документы" not in text and "Условия компании" not in text, text[:400]
        page.goto(BASE + "/", wait_until="networkidle")
        page.evaluate("() => localStorage.clear()")
        go_checkout_from_office(page)
        expect(page.locator("#f-orgName")).to_be_visible()
        assert page.get_by_role("checkbox", name=re.compile("Нужен счёт")).count() == 0
        page.context.close()
    finally:
        restore_company(old)


@scenario
def f_screens_light_dark_360_no_hscroll(browser):
    """360 и 1280 px, светлая и тёмная: раздел для офисов, оформление организации, заявка организации — без горизонтальной прокрутки; шапка на 320 px."""
    page = new_page(browser, 360, 780)
    page.goto(BASE + "/", wait_until="networkidle")
    org_order = api_order(page, f"Экран {RUN}", [{"serviceId": "furn-wardrobe", "qty": 1}, {"serviceId": "app-hood", "qty": 1}], clientType="organization", orgName=f"ООО «Экран {RUN}» с длинным названием для проверки переноса строк", wantsInvoice=True)
    page.context.close()
    for scheme in ("light", "dark"):
        for w, h in ((360, 780), (1280, 800)):
            page = new_page(browser, w, h, scheme)
            page.goto(BASE + "/", wait_until="networkidle")
            page.evaluate("() => localStorage.clear()")
            page.goto(BASE + OFFICE_PATH, wait_until="networkidle")
            no_hscroll(page, f"для офисов {scheme} {w}")
            shot(page, f"office-page-{w}-{scheme}")
            add_work(page, "Сборка офисного кресла")
            shot(page, f"office-page-cart-{w}-{scheme}")
            page.get_by_role("link", name="Оформить", exact=True).first.click()
            page.wait_for_url(re.compile(r"/checkout"))
            page.get_by_label("Организация", exact=True).wait_for()
            page.wait_for_timeout(500)
            no_hscroll(page, f"оформление организации {scheme} {w}")
            shot(page, f"office-checkout-org-{w}-{scheme}", full=True)
            page.get_by_role("button", name="Отправить заявку").click()
            page.locator("#f-orgInn").fill("12")
            page.locator("#f-orgInn").blur()
            page.wait_for_timeout(300)
            no_hscroll(page, f"оформление организации, ошибки {scheme} {w}")
            shot(page, f"office-checkout-org-errors-{w}-{scheme}", full=True)
            page.goto(BASE + org_order["url"], wait_until="networkidle")
            no_hscroll(page, f"заявка организации {scheme} {w}")
            shot(page, f"office-order-org-{w}-{scheme}", full=True)
            no_errors(page, f"экраны {scheme} {w}")
            page.context.close()

    # шапка на 320 px: кнопка темы не сжимается, страница не шире экрана
    page = new_page(browser, 320, 700)
    page.goto(BASE + "/", wait_until="networkidle")
    box = page.get_by_role("button", name="Тема оформления").bounding_box()
    assert box["width"] >= 44 and box["height"] >= 44, box
    no_hscroll(page, "шапка 320")
    shot(page, "office-header-320-light")
    page.context.close()


if __name__ == "__main__":
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        print(f"E2E офисы и организации: {BASE}, метка прогона {RUN}")
        db("delete from rate_limits")
        for run in [
            a_appliances_chip_character_and_works,
            b_dynamic_categories_up_to_twelve,
            c_office_page_lists_office_works_and_shares_cart,
            d_org_checkout_validation_draft_and_success,
            e_orgs_switched_off_and_invoice_off,
            f_screens_light_dark_360_no_hscroll,
        ]:
            if not only or any(run.__name__.startswith(o) for o in only):
                run(browser)
        browser.close()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\nИтог: {len(RESULTS) - len(failed)} из {len(RESULTS)} сценариев прошли")
    sys.exit(1 if failed else 0)
