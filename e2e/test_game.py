"""E2E игры «Отмойте персонажа» (стенд /dev/game и страница заявки /o/<токен>).
Запуск (dev-сервер уже работает):  NEXT_DIST_DIR=.next-game DATABASE_URL=postgres://hfah:hfah_dev_pw@127.0.0.1:54329/hfah_stage npx next dev -p 3104
  BASE_URL=http://localhost:3104 python e2e/test_game.py
Нужна база, на которую смотрит сервер (DATABASE_URL, по умолчанию hfah_stage): режим игры в настройках на время прогона
переключается и в конце возвращается. Скриншоты: e2e/screenshots/game-*.png.
BASE_URL по умолчанию localhost, а не 127.0.0.1: dev-сервер Next считает своим origin localhost, и POST с другого origin получит 403.
Внутренности партии читаются из window.__game (src/components/game/devtools.ts, только вне production).
"""

import json
import os
import re
import subprocess
import sys
import uuid

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("BASE_URL", "http://localhost:3104").rstrip("/")
DB_URL = os.environ.get("DATABASE_URL", "postgres://hfah:hfah_dev_pw@127.0.0.1:54329/hfah_stage")
SHOTS = os.path.join(HERE, "screenshots")
os.makedirs(SHOTS, exist_ok=True)
GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
IGNORED = ("THREE.Clock", "KHR_parallel_shader_compile", "React DevTools", "[HMR]", "Download the React")
CATEGORY_SERVICE = {
    "furniture": ("furn-wardrobe", {}),
    "plumbing": ("plumb-accessories", {}),
    "electrics": ("el-appliance", {}),
    "repair": ("rep-baseboard", {}),
    "other": ("other-hourly", {}),
}
CODE_RE = re.compile(r"^LAD-[A-Z0-9]{4}-[A-Z0-9]{4}$")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def db(sql):
    r = subprocess.run(["node", os.path.join(HERE, "dbq.mjs"), sql], env={**os.environ, "DATABASE_URL": DB_URL}, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def set_game_mode(mode):
    db(f"update settings set game = jsonb_set(game, '{{mode}}', '\"{mode}\"') where id = 1")


_orders_made = 0


def new_order(api, category="furniture"):
    global _orders_made
    if _orders_made % 8 == 0:
        db("delete from rate_limits")  # лимит заявок 10 в час на IP: в стенде hfah_stage сбрасываем счётчик
    _orders_made += 1
    service, extra = CATEGORY_SERVICE[category]
    res = api.post(
        "/api/orders",
        headers={"Idempotency-Key": str(uuid.uuid4()), "Content-Type": "application/json"},
        data=json.dumps(
            {
                "name": "Тест Игра",
                "phone": "+79001234567",
                "address": "Тестовая улица, дом 1, кв. 1",
                "materials": "have",
                "consent": True,
                "lines": [{"serviceId": service, "qty": 1, **extra}],
            }
        ),
    )
    assert res.status in (200, 201), res.text()
    return res.json()["token"]


def new_page(browser, **kw):
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
    return ctx, page, logs


def errors_of(logs):
    return [l for l in logs if not any(s in l for s in IGNORED)]


MOBILE = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)


def goto_offer(page, token, mode="bonus"):
    page.goto(f"{BASE}/dev/game?token={token}&mode={mode}")
    page.wait_for_selector("[data-testid=game-offer]", timeout=60000)


def start_game(page):
    page.click("[data-testid=game-play]")
    page.wait_for_function("document.querySelector('[data-testid=game-stage]')?.dataset.phase === 'ready' && !!window.__game", timeout=60000)
    page.wait_for_timeout(400)


def open_game(page, token, mode="bonus"):
    goto_offer(page, token, mode)
    start_game(page)


def g(page, expr):
    return page.evaluate(f"window.__game.{expr}")


def percent(page):
    return int(page.inner_text("[data-testid=game-percent]").strip("%"))


def stroke(page, pts, steps=6):
    page.mouse.move(*pts[0])
    page.mouse.down()
    for x, y in pts[1:]:
        page.mouse.move(x, y, steps=steps)
    page.mouse.up()


def scrub(page, cx, cy, r=26, n=3):
    """Зигзаг вокруг точки, как водят пальцем по пятну."""
    pts = []
    for i in range(n):
        pts += [(cx - r, cy - r + i * (2 * r / n)), (cx + r, cy - r + i * (2 * r / n) + r / n)]
    stroke(page, pts)


def visible_spots(page):
    spots = page.evaluate("window.__game.spots.map((_, i) => ({ i, ...window.__game.spotScreen(i) }))")
    return [s for s in spots if s["visible"]]


def wait_yaw_settled(page, timeout=6000):
    last = [None]

    def settled():
        y = g(page, "yaw()")
        ok = last[0] is not None and abs(y - last[0]) < 1e-4
        last[0] = y
        return ok

    for _ in range(timeout // 150):
        page.wait_for_timeout(150)
        if settled():
            return


def scene_box(page):
    return page.locator("[data-testid=game-stage]").bounding_box()


def run():
    original_game = db("select game from settings where id = 1")[0]["game"]
    try:
        with sync_playwright() as p:
            api = p.request.new_context(base_url=BASE, extra_http_headers={"Origin": BASE})
            browser = p.chromium.launch(headless=True, args=GL_ARGS)
            set_game_mode("bonus")
            test_modes_and_offer(browser, api)
            test_mechanics(browser, api)
            test_completion_bonus(browser, api)
            test_completion_play(browser, api)
            test_claim_errors(browser, api)
            test_categories(browser, api)
            test_edge_environments(browser, api)
            test_screenshots(browser, api)
            browser.close()
    finally:
        db(f"update settings set game = '{json.dumps(original_game)}'::jsonb where id = 1")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} проверок прошли")
    if failed:
        print("ПРОВАЛЕНО:", ", ".join(r[0] for r in failed))
        sys.exit(1)


# ---------------------------------------------------------------------------------------------------


def test_modes_and_offer(browser, api):
    ctx, page, logs = new_page(browser, viewport={"width": 900, "height": 900})
    token = new_order(api)

    # off: предложения нет
    page.goto(f"{BASE}/dev/game?token={token}&mode=off")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)
    check("режим off: предложения игры нет", page.locator("[data-testid=game-offer]").count() == 0)

    # play: «Просто так, без скидки»
    goto_offer(page, token, "play")
    terms = page.inner_text("[data-testid=game-offer-terms]")
    check("режим play: «Просто так, без скидки»", terms.strip() == "Просто так, без скидки.", terms)
    check("карточка: заголовок про персонажа", "Пока ждёте звонка — отмойте персонажа" in page.inner_text("[data-testid=game-offer]"))

    # bonus: сумма, минимум, срок, ручное применение
    goto_offer(page, token, "bonus")
    terms = page.inner_text("[data-testid=game-offer-terms]")
    ok = all(s in terms for s in ("бонус 300", "от 3", "60 дней", "Применяется вручную после проверки"))
    check("режим bonus: условия и ручное применение", ok, terms.replace("\xa0", " "))
    check("нет обещаний автоматического погашения", not re.search(r"автоматическ|античит|защищ", page.inner_text("[data-testid=game-offer]"), re.I))

    # «Не сейчас» запоминается по токену
    page.click("[data-testid=game-hide]")
    check("«Не сейчас» прячет карточку", page.locator("[data-testid=game-offer]").count() == 0)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)
    check("«Не сейчас» переживает перезагрузку (localStorage по токену)", page.locator("[data-testid=game-offer]").count() == 0)
    other = new_order(api)
    goto_offer(page, other, "bonus")
    check("у другой заявки карточка на месте", page.locator("[data-testid=game-offer]").count() == 1)

    # заявка с настоящей страницы /o/<токен>
    page.goto(f"{BASE}/o/{other}")
    page.wait_for_selector("[data-testid=game-offer]", timeout=60000)
    check("страница заявки показывает предложение (режим из настроек)", page.locator("[data-testid=game-offer]").count() == 1)
    ctx.close()
    check("консоль: нет ошибок (offer)", not errors_of(logs), "; ".join(errors_of(logs))[:300])


def test_mechanics(browser, api):
    ctx, page, logs = new_page(browser, viewport={"width": 1000, "height": 800})
    token = new_order(api, "furniture")
    goto_offer(page, token)
    play = page.locator("[data-testid=game-play]")
    play.focus()
    play.click()
    page.wait_for_function("document.querySelector('[data-testid=game-stage]')?.dataset.phase === 'ready' && !!window.__game", timeout=60000)
    page.wait_for_timeout(600)

    # диалог: модальный, фокус внутри, кнопка закрытия ≥ 44 px
    is_open = page.evaluate("document.querySelector('dialog').open")
    in_dialog = page.evaluate("document.querySelector('dialog').contains(document.activeElement)")
    close_box = page.locator("[data-testid=game-close]").bounding_box()
    check("диалог открыт модально", is_open)
    check("фокус внутри диалога", in_dialog)
    check("кнопка закрытия ≥ 44 px", close_box["width"] >= 44 and close_box["height"] >= 44, f"{close_box['width']}x{close_box['height']}")
    check("прогресс: role=progressbar с aria-значениями", page.evaluate(
        "(() => { const e = document.querySelector('[role=progressbar]'); return !!e && e.getAttribute('aria-valuemin') === '0' && e.getAttribute('aria-valuemax') === '100' && e.getAttribute('aria-valuenow') === '0'; })()"))
    for _ in range(3):  # Tab не уводит фокус за пределы диалога
        page.keyboard.press("Tab")
    check("Tab держит фокус в диалоге", page.evaluate("document.querySelector('dialog').contains(document.activeElement)"))

    # пятна есть, прогресс < 100
    n_spots = g(page, "spots.length")
    check("пятна созданы: 8–14", 8 <= n_spots <= 14, str(n_spots))
    check("прогресс в начале < 100", g(page, "progress()") < 1 and percent(page) == 0)
    check("пятна и ржавчины, и налёта/грязи", len({s["kind"] for s in g(page, "spots")}) >= 2)
    vis = visible_spots(page)
    check("не меньше 3 пятен видно с первого ракурса", len(vis) >= 3, str(len(vis)))
    page.screenshot(path=os.path.join(SHOTS, "game-spot-visible.png"))
    tex0 = g(page, "gpu()")["textures"]

    # Чистка: штрихи по пятнам увеличивают прогресс, предмет не вращается
    yaw0 = g(page, "yaw()")
    meas0 = g(page, "measure()")
    up0 = g(page, "uploads()")
    f0 = g(page, "gpu()")["frames"]
    for s in vis[:3]:
        scrub(page, s["x"], s["y"])
    page.wait_for_timeout(300)
    p_clean = g(page, "progress()")
    f1 = g(page, "gpu()")["frames"]
    up1 = g(page, "uploads()")
    check("Чистка: прогресс вырос", p_clean > 0.02 and percent(page) >= 1, f"{p_clean:.3f}, UI {percent(page)}%")
    check("Чистка: маска действительно стёрлась (читаем canvas)", g(page, "measure()") < meas0 - 0.02, f"{meas0:.3f} → {g(page, 'measure()'):.3f}")
    check("Чистка: предмет не вращается", abs(g(page, "yaw()") - yaw0) < 1e-6)
    check("загрузка текстуры не чаще раза за кадр", up1 - up0 <= max(f1 - f0, 1), f"загрузок {up1 - up0}, кадров {f1 - f0}")

    # Поворот: перетаскивание вращает, прогресс и маска не меняются
    page.click("[data-testid=mode-rotate]")
    check("подсказка режима меняется", "найти пятна с другой стороны" in page.inner_text("[data-testid=game-hint]"))
    check("режим переключается (aria-pressed)", page.get_attribute("[data-testid=mode-rotate]", "aria-pressed") == "true" and page.get_attribute("[data-testid=mode-clean]", "aria-pressed") == "false")
    box = scene_box(page)
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pr0, meas1 = g(page, "progress()"), g(page, "measure()")
    stroke(page, [(cx - 80, cy), (cx + 80, cy)], steps=12)
    wait_yaw_settled(page)
    yaw1 = g(page, "yaw()")
    check("Поворот: перетаскивание вращает предмет", abs(yaw1 - yaw0) > 0.3, f"Δyaw {yaw1 - yaw0:.2f}")
    # проведём по пятнам и в режиме поворота: чистки быть не должно
    for s in visible_spots(page)[:2]:
        stroke(page, [(s["x"] - 20, s["y"]), (s["x"] + 20, s["y"])])
    wait_yaw_settled(page)
    check("Поворот: прогресс не меняется", g(page, "progress()") == pr0, f"{pr0:.4f} → {g(page, 'progress()'):.4f}")
    check("Поворот: маска не меняется", abs(g(page, "measure()") - meas1) < 1e-9)

    # Пятно уходит за предмет: вернёмся к началу, найдём видимое пятно, повернём на пол-оборота
    page.click("[data-testid=game-close]")
    page.wait_for_function("!document.querySelector('dialog')")
    check("после закрытия диалога фокус вернулся на «Играть»", page.evaluate("document.activeElement?.dataset.testid") == "game-play")
    start_game(page)
    tex1 = g(page, "gpu()")["textures"]
    check("текстуры освобождаются при закрытии (повторное открытие не копит)", tex1 <= tex0 + 1, f"{tex0} → {tex1}")
    vis = visible_spots(page)
    front = [s for s in vis if s["i"] < 3] or vis
    idx = front[0]["i"]
    sx, sy = front[0]["x"], front[0]["y"]
    page.click("[data-testid=mode-rotate]")
    box = scene_box(page)
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] * 0.8
    stroke(page, [(cx - box["width"] * 0.25, cy), (cx + box["width"] * 0.25, cy)], steps=20)  # половина ширины = пол-оборота
    wait_yaw_settled(page)
    after = g(page, f"spotScreen({idx})")
    check("после поворота на ~180° пятно закрыто предметом", after["visible"] is False and abs(g(page, "yaw()")) > 2.4, f"yaw {g(page, 'yaw()'):.2f}")
    page.screenshot(path=os.path.join(SHOTS, "game-spot-hidden.png"))
    page.focus("[data-testid=game-stage]")
    page.keyboard.press("Home")  # сброс ракурса с клавиатуры
    page.wait_for_timeout(1500)
    y = g(page, "yaw()")
    check("Home возвращает ракурс", abs((y + 3.14159) % 6.28318 - 3.14159) < 0.05, f"yaw {y:.3f}")

    # Esc закрывает
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('dialog')", timeout=5000)
    check("Esc закрывает диалог", True)
    ctx.close()
    check("консоль: нет ошибок (механика)", not errors_of(logs), "; ".join(errors_of(logs))[:300])


def test_completion_bonus(browser, api):
    ctx, page, logs = new_page(browser, viewport={"width": 1000, "height": 800}, reduced_motion="no-preference")
    claims = []
    page.on("request", lambda r: claims.append(r.url) if "/api/game/claim" in r.url and r.method == "POST" else None)
    token = new_order(api, "furniture")
    open_game(page, token, "bonus")
    p_end = page.evaluate("window.__game.cleanAll()")
    if not g(page, "done()"):  # редкая неудачная раскладка пятен: добиваем кистью крупнее (как палец), но фиксируем это в отчёте
        print(f"     первый проход дал {p_end:.3f} < 0.92, добиваем крупной кистью")
        p_end = page.evaluate("window.__game.cleanAll({ radius: 0.18, grid: 36 })")
    page.wait_for_selector("[data-testid=game-result]", timeout=20000)
    check("синтетическая чистка со всех сторон доводит прогресс до победы", g(page, "done()") and p_end >= 0.92, f"{p_end:.3f}")
    check("победа: показан блок результата", page.locator("[data-testid=game-result]").count() == 1)
    page.wait_for_selector("[data-testid=bonus-code]", timeout=10000)
    code = page.inner_text("[data-testid=bonus-code]").strip()
    check("выдан код вида LAD-XXXX-XXXX", bool(CODE_RE.match(code)), code)
    body = page.inner_text("[data-testid=game-result]").replace("\xa0", " ")
    check("условия бонуса и ручное применение показаны", "300 ₽" in body and "Покажите код при следующем заказе — владелец применит бонус вручную." in body, body[:200])
    try:
        page.wait_for_function("window.__game.fade() === 0 && window.__game.measure() === 0", timeout=8000)
        faded = True
    except Exception:
        faded = False
    check("налёт после победы затухает и полностью убран", faded, f"fade={g(page, 'fade()')}, measure={g(page, 'measure()')}")
    page.screenshot(path=os.path.join(SHOTS, "game-done-desktop.png"))
    check("claim вызван один раз", len(claims) == 1, str(len(claims)))
    # повторный claim возвращает тот же код
    again = page.evaluate(
        "fetch('/api/game/claim', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: new URLSearchParams(location.search).get('token')})}).then(r => r.json())"
    )
    check("второй claim возвращает тот же код", again.get("code") == code, str(again))
    n_codes = db(f"select count(*)::int as n from bonus_codes where code = '{code}'")[0]["n"]
    check("в базе один код на заявку", n_codes == 1)

    # копирование
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    page.click("dialog [data-testid=bonus-card] button")
    page.wait_for_timeout(300)
    copied = page.evaluate("navigator.clipboard.readText()")
    check("кнопка копирует код", copied == code, copied)

    # повторная игра: тот же код, новый claim не нужен
    old_id = g(page, "id")
    claims_before = len(claims)
    page.click("[data-testid=game-again]")
    page.wait_for_function(f"window.__game && window.__game.id !== {old_id}", timeout=30000)
    page.wait_for_timeout(300)
    check("«Сыграть ещё»: новые пятна, прогресс с нуля", g(page, "progress()") == 0 and percent(page) == 0 and 8 <= g(page, "spots.length") <= 14)
    tex = g(page, "gpu()")["textures"]
    page.evaluate("window.__game.cleanAll()")
    page.wait_for_selector("[data-testid=game-result]", timeout=20000)
    code2 = page.inner_text("[data-testid=bonus-code]").strip()
    check("повторная игра показывает тот же код и новый не запрашивает", code2 == code and len(claims) == claims_before, f"{code2}, claims={len(claims)}")
    check("повтор: подсказка, что код уже выдан", "уже выдан" in page.inner_text("[data-testid=game-result]"))
    page.click("[data-testid=game-done-close]")
    page.wait_for_function("!document.querySelector('dialog')")
    check("после игры карточка показывает код и «Сыграть ещё раз»", "Ваш бонус за игру" in page.inner_text("[data-testid=game-offer]") and page.inner_text("[data-testid=game-play]") == "Сыграть ещё раз")
    page.reload()
    page.wait_for_selector("[data-testid=bonus-code]", timeout=30000)
    check("код виден после перезагрузки (из заявки)", page.inner_text("[data-testid=bonus-code]").strip() == code)
    page.screenshot(path=os.path.join(SHOTS, "game-offer-with-code-desktop.png"))
    ctx.close()
    check("консоль: нет ошибок (победа, бонус)", not errors_of(logs), "; ".join(errors_of(logs))[:300])

    # reduced motion: налёт убирается сразу, без затухания и без «Wave»
    ctx, page, logs = new_page(browser, viewport={"width": 1000, "height": 800}, reduced_motion="reduce")
    token = new_order(api, "other")
    open_game(page, token, "bonus")
    page.evaluate("window.__game.cleanAll()")
    page.wait_for_selector("[data-testid=game-result]", timeout=20000)
    check("reduced motion: налёт убран сразу (без затухания)", g(page, "measure()") == 0 and g(page, "fade()") == 0)
    ctx.close()
    check("консоль: нет ошибок (reduced motion)", not errors_of(logs))


def test_completion_play(browser, api):
    set_game_mode("play")
    ctx, page, logs = new_page(browser, viewport={"width": 1000, "height": 800})
    claims = []
    page.on("request", lambda r: claims.append(r.url) if "/api/game/claim" in r.url else None)
    token = new_order(api, "other")
    open_game(page, token, "play")
    page.evaluate("window.__game.cleanAll()")
    page.wait_for_selector("[data-testid=game-result]", timeout=20000)
    txt = page.inner_text("[data-testid=game-result]")
    check("режим play: благодарность без скидки", "скидки нет" in txt, txt[:120])
    check("режим play: кода нет и claim не вызывался", page.locator("[data-testid=bonus-code]").count() == 0 and not claims)
    ctx.close()
    check("консоль: нет ошибок (play)", not errors_of(logs))
    set_game_mode("bonus")


def test_claim_errors(browser, api):
    ctx, page, logs = new_page(browser, viewport={"width": 1000, "height": 800})
    token = new_order(api, "other")
    open_game(page, token, "bonus")

    # сеть падает
    page.route("**/api/game/claim", lambda r: r.abort())
    page.evaluate("window.__game.cleanAll()")
    page.wait_for_selector("[data-testid=claim-retry]", timeout=20000)
    msg = page.inner_text("[data-testid=game-result] [role=alert]")
    check("сетевой сбой: честное сообщение и «Повторить»", "Нет связи" in msg and page.locator("[data-testid=bonus-code]").count() == 0, msg[:100])

    # 429
    page.unroute("**/api/game/claim")
    page.route("**/api/game/claim", lambda r: r.fulfill(status=429, content_type="application/json", body=json.dumps({"error": "Слишком много запросов.", "code": "rate_limited"})))
    page.click("[data-testid=claim-retry]")
    page.wait_for_function("document.querySelector('[data-testid=game-result] [role=alert]')?.textContent.includes('Слишком много')", timeout=10000)
    check("429: сообщение про лимит и «Повторить»", page.locator("[data-testid=claim-retry]").count() == 1)

    # 409: владелец выключил бонус между открытием и победой
    page.unroute("**/api/game/claim")
    set_game_mode("play")
    page.click("[data-testid=claim-retry]")
    page.wait_for_function("document.querySelector('[data-testid=game-result] [role=alert]')?.textContent.includes('не выдаётся')", timeout=10000)
    check("409: честное сообщение, что бонус отключён", page.locator("[data-testid=bonus-code]").count() == 0)

    # снова включили: «Повторить» выдаёт код
    set_game_mode("bonus")
    page.click("[data-testid=claim-retry]")
    page.wait_for_selector("[data-testid=bonus-code]", timeout=10000)
    check("после «Повторить» код выдан", bool(CODE_RE.match(page.inner_text("[data-testid=bonus-code]").strip())))
    ctx.close()
    check("консоль: нет ошибок (ошибки claim)", not [l for l in errors_of(logs) if "Failed to load resource" not in l and "ERR_FAILED" not in l and "429" not in l and "409" not in l], "; ".join(errors_of(logs))[:300])


def test_categories(browser, api):
    """Все пять моделей: игра запускается, пятна лежат на поверхности, скриншоты для осмотра."""
    for cat in CATEGORY_SERVICE:
        for scheme in ("light", "dark"):
            ctx, page, logs = new_page(browser, color_scheme=scheme, **MOBILE)
            token = new_order(api, cat)
            open_game(page, token, "bonus")
            n = g(page, "spots.length")
            vis = len(visible_spots(page))
            if scheme == "light":
                check(f"{cat}: игра запущена, пятен {n}, видно с первого ракурса {vis}", 8 <= n <= 14 and vis >= 2)
                # скорость луча по Body (самая тяжёлая модель — plumbing, ~12,5 тыс. треугольников)
                ms = page.evaluate("(() => { const t = performance.now(); for (let i = 0; i < 40; i++) window.__game.spotScreen(0); return (performance.now() - t) / 40; })()")
                print(f"     {cat}: один луч + проекция ≈ {ms:.2f} мс (swiftshader, настольный процессор)")
            page.screenshot(path=os.path.join(SHOTS, f"game-cat-{cat}-{scheme}.png"))
            ctx.close()
            check(f"{cat}/{scheme}: консоль чистая", not errors_of(logs), "; ".join(errors_of(logs))[:300])


def test_edge_environments(browser, api):
    # без WebGL: заметка вместо игры, страница цела
    ctx, page, logs = new_page(browser, viewport={"width": 390, "height": 844})
    ctx.add_init_script(
        "const orig = HTMLCanvasElement.prototype.getContext;"
        "HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : orig.call(this, t, ...a); };"
    )
    token = new_order(api, "furniture")
    goto_offer(page, token, "bonus")
    text = page.inner_text("[data-testid=game-offer]")
    check("без WebGL: короткая заметка вместо игры", "3D недоступно" in text and page.locator("[data-testid=game-play]").count() == 0, text[:140])
    page.screenshot(path=os.path.join(SHOTS, "game-no-webgl.png"))
    ctx.close()
    check("без WebGL: ошибок нет", not errors_of(logs), "; ".join(errors_of(logs))[:300])

    # ширина 360 px и DPR: без горизонтальной прокрутки, канвас не тяжелее 1.75
    ctx, page, logs = new_page(browser, viewport={"width": 360, "height": 640}, is_mobile=True, has_touch=True, device_scale_factor=3)
    token = new_order(api, "furniture")
    goto_offer(page, token, "bonus")
    check("360 px: карточка без горизонтальной прокрутки", page.evaluate("Math.max(document.documentElement.scrollWidth, document.querySelector('[data-testid=game-offer]').getBoundingClientRect().right) <= window.innerWidth + 1"))
    start_game(page)
    check("360 px: диалог без горизонтальной прокрутки", page.evaluate("document.querySelector('dialog').scrollWidth <= window.innerWidth"))
    ratio = page.evaluate("(() => { const c = document.querySelector('dialog canvas'); return c.width / c.clientWidth; })()")
    check("DPR канваса ограничен 1.75 при экране 3x", ratio <= 1.76, f"{ratio:.2f}")
    panel_ok = page.evaluate(
        "(() => { const b = document.querySelector('[data-testid=mode-clean]').getBoundingClientRect(); const p = document.querySelector('[role=progressbar]').getBoundingClientRect(); return b.height >= 44 && p.bottom <= window.innerHeight && p.right <= window.innerWidth; })()"
    )
    check("360 px: переключатель режимов ≥ 44 px, прогресс виден", panel_ok)
    # касание: штрихи пальцем чистят, страница не прокручивается
    cdp = ctx.new_cdp_session(page)
    vis = visible_spots(page)
    s = vis[0]
    before = g(page, "progress()")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": s["x"] - 20, "y": s["y"] - 20}]})
    for k in range(1, 13):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": s["x"] - 20 + k * 3.4, "y": s["y"] - 20 + k * 3.4}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(300)
    check("касание: палец чистит (360 px)", g(page, "progress()") > before, f"{before:.3f} → {g(page, 'progress()'):.3f}")
    page.screenshot(path=os.path.join(SHOTS, "game-360.png"))
    ctx.close()
    check("360 px: консоль чистая", not errors_of(logs), "; ".join(errors_of(logs))[:300])


def test_screenshots(browser, api):
    """Телефон 390×844, светлая и тёмная темы: карточка, игра, середина, победа с кодом, страница заявки."""
    for scheme in ("light", "dark"):
        ctx, page, logs = new_page(browser, color_scheme=scheme, **MOBILE)
        token = new_order(api, "plumbing")
        page.goto(f"{BASE}/o/{token}")
        page.wait_for_selector("[data-testid=game-offer]", timeout=60000)
        page.locator("[data-testid=game-offer]").scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(SHOTS, f"game-offer-{scheme}.png"))
        start_game(page)
        page.screenshot(path=os.path.join(SHOTS, f"game-play-{scheme}.png"))
        page.evaluate("window.__game.cleanAll({ maxViews: 4, grid: 24 })")
        page.wait_for_timeout(600)
        check(f"{scheme}: середина игры, прогресс {percent(page)}%", 0 < percent(page) < 100)
        page.screenshot(path=os.path.join(SHOTS, f"game-mid-{scheme}.png"))
        page.evaluate("window.__game.cleanAll()")
        page.wait_for_selector("[data-testid=bonus-code]", timeout=40000)
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, f"game-done-{scheme}.png"))
        ctx.close()
        check(f"{scheme}: консоль чистая", not errors_of(logs), "; ".join(errors_of(logs))[:300])


if __name__ == "__main__":
    run()
