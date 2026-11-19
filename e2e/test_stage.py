"""E2E-проверка 3D-сцены на стенде /dev/stage. Запуск: BASE_URL=http://127.0.0.1:3103/dev/stage python e2e/test_stage.py
Скриншоты: e2e/screenshots/stage-*.png. Нужен запущенный dev-сервер (см. docs) и python playwright.
Внутренности сцены читаются из window.__stage (R3F state), который выставляется только вне production.
"""
import json
import math
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3103/dev/stage")
SHOTS = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SHOTS, exist_ok=True)
GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
CATS = ["furniture", "plumbing", "electrics", "repair", "other"]
IGNORED = ("THREE.Clock", "KHR_parallel_shader_compile", "React DevTools", "[HMR]", "Download the React")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def new_page(browser, **kw):
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
    return ctx, page, logs


def errors_of(logs):
    return [l for l in logs if not any(s in l for s in IGNORED)]


def open_stage(page, wait=3000):
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.wait_for_function("document.querySelector('[data-stage]')?.dataset.stageState === 'ready'", timeout=30000)
    page.wait_for_timeout(wait)


def rig_yaw(page):
    return page.evaluate("window.__stage.scene.getObjectByName('podium').parent.rotation.y")


def cam_pos(page):
    return page.evaluate("(() => { const p = window.__stage.camera.position; return [p.x, p.y, p.z]; })()")


def showcase_count(page):
    return page.evaluate("window.__stage.scene.getObjectByName('showcase').children.length")


def frames(page):
    return page.evaluate("window.__stage.gl.info.render.frame")


def stage_box(page):
    return page.locator("[data-stage]").bounding_box()


def click_cat(page, cat):
    page.click(f"[data-testid=cat-{cat}]")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=GL_ARGS)

        # 1. Скриншоты: десктоп и телефон, светлая и тёмная тема, все категории.
        for vp_name, ctx_kw in (
            ("desktop", dict(viewport={"width": 1100, "height": 900})),
            ("mobile", dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
        ):
            for theme in ("light", "dark"):
                ctx, page, logs = new_page(browser, color_scheme=theme, **ctx_kw)
                open_stage(page)
                for cat in CATS:
                    click_cat(page, cat)
                    page.wait_for_timeout(2300)  # переход + приветствие + показ реплики
                    page.screenshot(path=os.path.join(SHOTS, f"stage-{vp_name}-{theme}-{cat}.png"))
                check(f"console clean ({vp_name}/{theme})", not errors_of(logs), "; ".join(errors_of(logs))[:300])
                ctx.close()

        # 2. Основной прогон на десктопе.
        ctx, page, logs = new_page(browser, viewport={"width": 1100, "height": 900})
        open_stage(page)

        # 2a. Быстрое переключение 10 раз за ~1 с: последняя категория, один персонаж, не больше двух по ходу дела.
        page.evaluate(
            """() => { window.__maxChildren = 0;
              const sc = window.__stage.scene.getObjectByName('showcase');
              const tick = () => { window.__maxChildren = Math.max(window.__maxChildren, sc.children.length); requestAnimationFrame(tick); };
              tick(); }"""
        )
        order = ["plumbing", "electrics", "repair", "other", "furniture", "plumbing", "electrics", "repair", "furniture", "other"]
        for c in order:
            click_cat(page, c)
            page.wait_for_timeout(90)
        # Последний выбор может ещё догружаться: ждём, пока останется ровно один персонаж.
        try:
            page.wait_for_function("window.__stage.scene.getObjectByName('showcase').children.length === 1", timeout=6000)
        except Exception:
            pass
        page.wait_for_timeout(500)
        names = page.evaluate("window.__stage.scene.getObjectByName('showcase').children.map(c => c.name)")
        check("rapid switch: ends on the last category", page.locator("[data-stage]").get_attribute("data-stage") == "other" and names == ["character-other"], str(names))
        check("rapid switch: exactly one character", len(names) == 1, f"children={names}")
        mx = page.evaluate("window.__maxChildren")
        check("rapid switch: never more than 2 characters", mx <= 2, f"max={mx}")
        page.screenshot(path=os.path.join(SHOTS, "stage-desktop-rapid-final.png"))

        # 2b. Вращение мышью.
        box = stage_box(page)
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        y0 = rig_yaw(page)
        page.mouse.move(cx, cy)
        page.mouse.down()
        for i in range(1, 13):
            page.mouse.move(cx + i * 10, cy)
            page.wait_for_timeout(16)
        page.wait_for_timeout(200)  # пауза перед отпусканием: без броска
        page.mouse.up()
        page.wait_for_timeout(300)
        y1 = rig_yaw(page)
        check("mouse drag rotates", abs(y1 - y0) > 0.5, f"dyaw={y1 - y0:.2f}")
        # вертикальная часть жеста меняет высоту камеры, но в пределах
        cam_a = cam_pos(page)
        page.mouse.move(cx, cy)
        page.mouse.down()
        for i in range(1, 40):
            page.mouse.move(cx, cy + i * 8)
            page.wait_for_timeout(8)
        page.mouse.up()
        page.wait_for_timeout(1200)
        cam_b = cam_pos(page)
        check("vertical drag stays within polar limits", cam_b[1] >= -0.2 and cam_b[1] < 20, f"cam.y {cam_a[1]:.2f}->{cam_b[1]:.2f}")

        # 2c. Сброс ракурса.
        page.click("button[aria-label='Сбросить ракурс']")
        page.wait_for_timeout(1500)
        yr = rig_yaw(page)
        turns = yr / (2 * math.pi)
        cam_r = cam_pos(page)
        check("reset returns to default view", abs(turns - round(turns)) < 0.01 and abs(cam_r[1] - cam_a[1]) < 0.05 and abs(cam_r[0]) < 1e-6, f"yaw/2pi={turns:.3f} cam.y={cam_r[1]:.3f} default={cam_a[1]:.3f}")

        # 2d. Клавиатура: Tab до сцены, стрелки вращают, фокус виден.
        page.focus("[data-stage]")
        page.keyboard.press("Tab")
        page.keyboard.press("Shift+Tab")
        ka = rig_yaw(page)
        for _ in range(4):
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1000)
        kb = rig_yaw(page)
        outline = page.evaluate("getComputedStyle(document.querySelector('[data-stage]')).outlineStyle + ' ' + getComputedStyle(document.querySelector('[data-stage]')).outlineWidth")
        check("keyboard arrows rotate", abs(kb - ka) > 0.3, f"dyaw={kb - ka:.2f}")
        check("keyboard focus is visible", "solid" in outline and "0px" not in outline, outline)
        page.keyboard.press("Home")
        page.wait_for_timeout(1200)

        # 2e. Лица и реплики.
        click_cat(page, "furniture")
        page.wait_for_timeout(1500)
        page.uncheck("[data-testid=faces]")
        page.wait_for_timeout(300)
        face_vis = page.evaluate("(() => { const f = window.__stage.scene.getObjectByName('Face'); return f ? f.visible : null; })()")
        check("faces toggle hides Face node", face_vis is False, str(face_vis))
        page.screenshot(path=os.path.join(SHOTS, "stage-desktop-light-nofaces.png"))
        page.check("[data-testid=faces]")
        page.wait_for_timeout(300)
        face_vis = page.evaluate("window.__stage.scene.getObjectByName('Face').visible")
        check("faces toggle restores Face node", face_vis is True)
        page.uncheck("[data-testid=phrases]")
        page.wait_for_timeout(500)
        shown = page.evaluate("document.querySelector('[data-show]').dataset.show")
        check("phrasesEnabled=false hides bubble", shown == "0", shown)
        page.check("[data-testid=phrases]")
        click_cat(page, "plumbing")
        page.wait_for_timeout(1500)
        shown = page.evaluate("document.querySelector('[data-show]').dataset.show")
        check("bubble shows on category change", shown == "1", shown)
        page.wait_for_timeout(6500)
        shown = page.evaluate("document.querySelector('[data-show]').dataset.show")
        check("bubble auto-hides after ~6s", shown == "0", shown)
        texts = []
        click_cat(page, "electrics")
        page.wait_for_timeout(1500)
        for pers in ("calm", "cheerful", "business"):
            page.select_option("[data-testid=personality]", pers)
            page.wait_for_timeout(300)
            texts.append(page.evaluate("document.querySelector('[data-show]').textContent"))
        check("personality changes the phrase set", len(set(texts)) == 3 and all(texts), " | ".join(texts))

        # 2f. Рендер по требованию и пауза вне экрана.
        page.evaluate("window.scrollTo(0, 0)")
        click_cat(page, "repair")
        page.wait_for_timeout(2500)
        f0 = frames(page)
        page.wait_for_timeout(2000)
        f1 = frames(page)
        idle_fps = (f1 - f0) / 2
        check("idle rendering is throttled (<= ~40 fps)", 5 <= idle_fps <= 40, f"{idle_fps:.1f} fps")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1500)
        f2 = frames(page)
        page.wait_for_timeout(2000)
        f3 = frames(page)
        check("rendering pauses when stage is off-screen", f3 - f2 <= 2, f"{f3 - f2} frames in 2s")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(1500)
        f4 = frames(page)
        page.wait_for_timeout(1000)
        check("rendering resumes when stage is visible again", frames(page) - f4 > 3)

        # 2g. Метрики: вызовы отрисовки и треугольники на каждого персонажа, время кадра.
        metrics = {}
        for cat in CATS:
            click_cat(page, cat)
            page.wait_for_timeout(2200)
            info = page.evaluate(
                "(() => { const r = window.__stage.gl.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs.length }; })()"
            )
            metrics[cat] = info
        timing = page.evaluate(
            """async () => {
              const gl = window.__stage.gl; const orig = gl.render.bind(gl);
              const samples = []; gl.render = (s, c) => { const t = performance.now(); orig(s, c); samples.push(performance.now() - t); };
              const rig = window.__stage.scene.getObjectByName('podium').parent;
              const start = performance.now();
              await new Promise((res) => { const spin = () => { rig.rotation.y += 0.05; window.__stage.invalidate(); if (performance.now() - start < 2500) requestAnimationFrame(spin); else res(); }; spin(); });
              gl.render = orig; samples.sort((a, b) => a - b);
              return { n: samples.length, medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor(samples.length * 0.95)], wallFps: samples.length / 2.5 };
            }"""
        )
        print("METRICS", json.dumps({"perCharacter": metrics, "rotateTiming(software GL)": timing}, ensure_ascii=False))
        check("draw calls per frame reasonable (<= 60)", all(m["calls"] <= 60 for m in metrics.values()), str({k: v["calls"] for k, v in metrics.items()}))

        # 2h. Живая смена темы без перезагрузки.
        page.evaluate("document.documentElement.setAttribute('data-theme', 'dark')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SHOTS, "stage-desktop-theme-switched-dark.png"))
        page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
        page.wait_for_timeout(500)
        check("console clean (main run)", not errors_of(logs), "; ".join(errors_of(logs))[:400])
        ctx.close()

        # 3. Телефон: пузырь в границах и не закрывает глаза/кнопку; вертикальный свайп прокручивает страницу; горизонтальный вращает.
        ctx, page, logs = new_page(browser, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        open_stage(page)
        for cat in CATS:
            click_cat(page, cat)
            page.wait_for_timeout(1800)
            geo = page.evaluate(
                """() => {
                  const st = document.querySelector('[data-stage]').getBoundingClientRect();
                  const bub = document.querySelector('[data-show]').getBoundingClientRect();
                  const btn = document.querySelector("button[aria-label='Сбросить ракурс']").getBoundingClientRect();
                  const S = window.__stage; const v = new S.camera.position.constructor();
                  const eyeTop = (() => { const e = S.scene.getObjectByName('Eye_L'); const b = new (S.camera.position.constructor)(); e.getWorldPosition(b); b.project(S.camera);
                    return st.top + (-b.y * 0.5 + 0.5) * st.height; })();
                  return { inside: bub.left >= st.left && bub.right <= st.right && bub.top >= st.top && bub.bottom <= st.bottom,
                           overlapsBtn: !(bub.right < btn.left || bub.left > btn.right || bub.bottom < btn.top || bub.top > btn.bottom),
                           aboveEyes: bub.bottom < eyeTop, fit: document.querySelector('[data-fit]').dataset.fit, bottom: bub.bottom, eyeTop };
                }"""
            )
            check(f"mobile bubble ok ({cat})", geo["inside"] and not geo["overlapsBtn"] and geo["aboveEyes"] and geo["fit"] == "1", json.dumps(geo))
        cdp = ctx.new_cdp_session(page)

        def touch_swipe(x, y0, y1, dx=0.0, steps=14):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
            for i in range(1, steps + 1):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx * i / steps, "y": y0 + (y1 - y0) * i / steps}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        box = stage_box(page)
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] * 0.8
        # Вертикальный свайп начинается над сценой: страница должна прокрутиться (браузер забирает жест, canvas получает pointercancel).
        page.evaluate("window.__ev = []; const c = document.querySelector('[data-stage] canvas'); for (const t of ['pointercancel']) c.addEventListener(t, () => window.__ev.push(t))")
        sy0 = page.evaluate("window.scrollY")
        touch_swipe(cx, cy, cy - 300)
        page.wait_for_timeout(1200)
        sy1 = page.evaluate("window.scrollY")
        cancelled = page.evaluate("window.__ev.length > 0")
        check("vertical touch swipe over stage scrolls the page", sy1 - sy0 > 100 and cancelled, f"scrollY {sy0}->{sy1}, pointercancel={cancelled}")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        box = stage_box(page)
        yaw0 = rig_yaw(page)
        sy0 = page.evaluate("window.scrollY")
        touch_swipe(box["x"] + box["width"] * 0.75, box["y"] + box["height"] / 2, box["y"] + box["height"] / 2, dx=-150)
        page.wait_for_timeout(900)
        yaw1 = rig_yaw(page)
        sy1 = page.evaluate("window.scrollY")
        check("horizontal touch swipe rotates, page does not scroll", abs(yaw1 - yaw0) > 0.3 and abs(sy1 - sy0) < 5, f"dyaw={yaw1 - yaw0:.2f} dscroll={sy1 - sy0}")
        check("console clean (mobile)", not errors_of(logs), "; ".join(errors_of(logs))[:300])
        ctx.close()

        # 4. Reduced motion: кольцо не крутится, переключение — затухание без сжатия, кадры почти не идут.
        ctx, page, logs = new_page(browser, viewport={"width": 1100, "height": 900}, reduced_motion="reduce")
        open_stage(page, wait=1500)
        click_cat(page, "electrics")
        page.wait_for_timeout(120)
        sample = page.evaluate(
            """(() => { const sc = window.__stage.scene.getObjectByName('showcase'); const pv = sc.children.map(c => [c.scale.x, c.scale.y, c.position.y]);
                        const ring = window.__stage.scene.getObjectByName('podium').children[1].rotation.y; return { pv, ring }; })()"""
        )
        check("reduced motion: no squash/ring spin during switch", all(abs(s[0] - 1) < 1e-6 and abs(s[1] - 1) < 1e-6 for s in sample["pv"]), json.dumps(sample))
        page.wait_for_timeout(1500)
        check("reduced motion: ends with one character", showcase_count(page) == 1)
        f0 = frames(page)
        page.wait_for_timeout(2500)
        check("reduced motion: idle does not render continuously", frames(page) - f0 <= 3, f"{frames(page) - f0} frames in 2.5s")
        page.screenshot(path=os.path.join(SHOTS, "stage-desktop-reduced-motion.png"))
        check("console clean (reduced motion)", not errors_of(logs), "; ".join(errors_of(logs))[:300])
        ctx.close()

        # 5. Модель недоступна (404): постер + сообщение + «Повторить».
        ctx, page, logs = new_page(browser, viewport={"width": 1100, "height": 900})
        state = {"fail": True}

        def handler(route):
            if state["fail"]:
                route.fulfill(status=404, body="not found")
            else:
                route.continue_()

        page.route("**/models/*.glb*", handler)
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.wait_for_function("document.querySelector('[data-stage]')?.dataset.stageState === 'error'", timeout=30000)
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SHOTS, "stage-desktop-model-404.png"))
        check("model 404 shows message and retry", page.get_by_text("Не удалось загрузить 3D").is_visible() and page.get_by_role("button", name="Повторить").is_visible())
        check("model 404 keeps poster visible", page.locator("[data-stage] img").first.is_visible())
        state["fail"] = False
        page.get_by_role("button", name="Повторить").click()
        page.wait_for_function("document.querySelector('[data-stage]')?.dataset.stageState === 'ready'", timeout=30000)
        check("retry loads the model", True)
        ctx.close()

        # 6. Без WebGL: постер и пояснение, заказ не блокируется.
        browser2 = p.chromium.launch(headless=True, args=["--disable-webgl", "--disable-3d-apis", "--disable-gpu"])
        ctx, page, logs = new_page(browser2, viewport={"width": 1100, "height": 900})
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)
        st = page.locator("[data-stage]").get_attribute("data-stage-state")
        check("no WebGL: state is no-webgl", st == "no-webgl", st)
        check("no WebGL: note is shown", page.get_by_text("3D недоступно на этом устройстве — заказ работает как обычно").is_visible())
        check("no WebGL: poster visible, no canvas", page.locator("[data-stage] img").first.is_visible() and page.locator("[data-stage] canvas").count() == 0)
        page.screenshot(path=os.path.join(SHOTS, "stage-desktop-no-webgl.png"))
        click_cat(page, "plumbing")
        page.wait_for_timeout(500)
        src = page.locator("[data-stage] img").first.get_attribute("src")
        check("no WebGL: poster follows category", "plumbing" in (src or ""), src)
        check("console clean (no WebGL)", not errors_of(logs), "; ".join(errors_of(logs))[:300])
        ctx.close()
        browser2.close()
        browser.close()

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    run()
