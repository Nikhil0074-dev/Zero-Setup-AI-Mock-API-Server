"""
Browser end-to-end test for the dashboard (Playwright for Python).
Starts the *built* server (node dist/index.js) on a free port, drives the real UI,
asserts on results and writes screenshots to ./screenshots.

Run:  npm run build && python3 e2e/dashboard.e2e.py
Needs: pip install playwright && playwright install chromium
"""
import json, os, socket, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

port = free_port()
base = f"http://127.0.0.1:{port}"
env = {**os.environ, "PORT": str(port), "LOG_LEVEL": "warn"}
env.pop("ANTHROPIC_API_KEY", None)
server = subprocess.Popen(["node", "apps/server/dist/index.js"], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
results = []

def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)

try:
    for _ in range(50):
        try:
            urllib.request.urlopen(base + "/health", timeout=1); break
        except Exception:
            time.sleep(0.2)
    else:
        raise SystemExit("server did not start")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())

        def shot(name, tall=True):
            """Size the viewport to the page so the sticky sidebar spans the whole capture."""
            if tall:
                page.set_viewport_size({"width": 1360, "height": 900})
                h = page.evaluate("document.documentElement.scrollHeight")
                page.set_viewport_size({"width": 1360, "height": min(max(h, 900), 2600)})
            page.screenshot(path=str(SHOTS / name))
            page.set_viewport_size({"width": 1360, "height": 900})

        t = lambda tid: page.locator(f'[data-testid="{tid}"]')

        page.goto(base)
        expect(page.get_by_role("heading", name="Describe an API")).to_be_visible()
        check("home page renders with provider note", "rule-based" in page.locator("#provider-name").inner_text())
        shot("01-home.png", tall=False)

        # --- generate from natural language ---
        t("prompt").fill("E-commerce API with products, users and orders; login simulation and order history")
        t("api-name").fill("Shop Demo API")
        t("generate").click()
        expect(t("draft")).to_be_visible()
        draft_text = t("draft").inner_text()
        check("review lists generated endpoints", "/api/products/:id" in draft_text and "/api/users/:userId/orders" in draft_text and "/api/auth/login" in draft_text)
        t("schema-products").locator("summary").click()
        shot("02-review-generated-api.png")

        # --- activate ---
        t("activate").click()
        expect(t("project-title")).to_have_text("Shop Demo API")
        check("environment is active", t("status-badge").inner_text() == "active")
        base_url_text = t("base-url").inner_text()
        check("base URL shown", "/mock/shop-demo-api-" in base_url_text and base_url_text.endswith("/api"))
        shot("03-project-endpoint-explorer.png")

        # --- GET list ---
        t("ep-list-products").click()
        t("t-send").click()
        expect(t("resp-status")).to_have_text("200")
        body = json.loads(t("resp-body").inner_text())
        check("list returns data + pagination", len(body["data"]) == 10 and body["pagination"]["total"] == 12)
        shot("04-list-response.png")

        # --- POST create ---
        t("ep-create-product").click()
        check("body prefilled from generated schema", "name" in t("t-body").input_value())
        t("t-send").click()
        expect(t("resp-status")).to_have_text("201")
        created = json.loads(t("resp-body").inner_text())
        check("create returns generated id", created["id"].startswith("prod_"))
        shot("05-create-201.png")

        # --- the created record is retrievable (state persists) ---
        t("t-method").select_option("GET")
        t("t-url").fill(f"{base}{base_url_text.replace(base, '')}/products/{created['id']}")
        t("t-send").click()
        expect(t("resp-status")).to_have_text("200")
        check("created record can be fetched", json.loads(t("resp-body").inner_text())["id"] == created["id"])

        # --- validation error ---
        t("ep-create-product").click()
        t("t-body").fill('{"name": "Only a name", "price": -5, "extra": 1}')
        t("t-send").click()
        expect(t("resp-status")).to_have_text("400")
        err = json.loads(t("resp-body").inner_text())
        fields = sorted(d["field"] for d in err["details"])
        check("validation error lists every problem", err["error"] == "VALIDATION_ERROR" and fields == ["category", "extra", "price"])
        shot("06-validation-error-400.png")

        # --- 404 + history ---
        t("t-method").select_option("GET")
        t("t-url").fill(f"{base}{base_url_text.replace(base, '')}/products/prod_nope")
        t("t-send").click()
        expect(t("resp-status")).to_have_text("404")
        check("request history recorded", page.locator("#t-hist button").count() >= 4)

        # --- simulated login ---
        t("ep-login").click()
        t("t-send").click()
        expect(t("resp-status")).to_have_text("200")
        check("simulated login returns mock token", json.loads(t("resp-body").inner_text())["token"] == "mock-token")

        # --- scoped nested endpoint ---
        t("ep-list-user-orders").click()
        t("t-send").click()
        expect(t("resp-status")).to_have_text("200")
        orders = json.loads(t("resp-body").inner_text())["data"]
        check("order history scoped to user", len(orders) > 0 and all(o["userId"] == "usr_101" for o in orders))

        # --- schemas + logs tabs ---
        t("tab-schemas").click()
        shot("07-schemas-tab.png")
        t("tab-logs").click()
        expect(t("log-table")).to_be_visible()
        log_text = t("log-table").inner_text()
        check("logs show method/path/status only", "/api/products" in log_text and "400" in log_text and "Only a name" not in log_text)
        shot("08-request-logs.png")

        # --- templates sidebar ---
        t("fixture-students").click()
        expect(t("project-title")).to_have_text("Student Management API")
        t("ep-list-students").click()
        t("t-send").click()
        expect(t("resp-status")).to_have_text("200")
        check("template project serves seeded students", json.loads(t("resp-body").inner_text())["pagination"]["total"] == 24)
        check("sidebar lists both environments", page.locator('[data-testid="project-list"] li').count() == 2)

        # --- deactivate -> 503 ---
        t("toggle-status").click()
        expect(t("status-badge")).to_have_text("inactive")
        t("ep-list-students").click()
        t("t-send").click()
        expect(t("resp-status")).to_have_text("503")
        check("deactivated environment returns 503", "ENVIRONMENT_INACTIVE" in t("resp-body").inner_text())
        shot("09-deactivated-503.png")

        # --- delete -> routes disappear ---
        students_url = t("t-url").input_value()
        t("delete").click()
        expect(page.get_by_role("heading", name="Describe an API")).to_be_visible()
        status = None
        try:
            urllib.request.urlopen(students_url)
        except urllib.error.HTTPError as e:
            status = e.code
        check("deleted environment's URL now returns 404", status == 404)

        # --- responsive layout ---
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(base)
        page.wait_for_selector("#prompt")
        overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        check("no horizontal overflow on a phone viewport", not overflow)
        page.screenshot(path=str(SHOTS / "10-mobile.png"), full_page=True)

        # --- dark mode ---
        page.set_viewport_size({"width": 1360, "height": 900})
        page.emulate_media(color_scheme="dark")
        page.goto(base)
        page.wait_for_selector("#prompt")
        shot("11-dark-mode.png", tall=False)

        # Chromium logs every 4xx/5xx fetch; this test triggers 400/404/503 on purpose, so only real JS errors count.
        console_errors = [e for e in console_errors if not e.startswith("Failed to load resource")]
        check("no JavaScript errors in the browser console", not console_errors)
        if console_errors: print(console_errors)
        browser.close()
finally:
    server.terminate()
    try: server.wait(5)
    except Exception: server.kill()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} e2e checks passed")
sys.exit(1 if failed else 0)
