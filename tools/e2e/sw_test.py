import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import devs
from devs import *
srv = ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(service_workers="allow"); page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
    page.goto(devs.BASE + "/help.html", wait_until="load"); page.wait_for_timeout(2500)
    r = page.evaluate("""async () => { const regs = await navigator.serviceWorker.getRegistrations(); const keys = await caches.keys();
        const out = {regs: regs.length, active: !!(regs[0] && regs[0].active), keys};
        for (const k of keys) { const c = await caches.open(k); out[k] = (await c.keys()).map(r => new URL(r.url).pathname).slice(0, 12); }
        return out; }""")
    print(json.dumps(r, ensure_ascii=False)[:600])
    page.reload(wait_until="load"); page.wait_for_timeout(1500)
    ctrl = page.evaluate("() => !!navigator.serviceWorker.controller")
    print("制御中:", ctrl)
    # オフラインでも help.html が開く
    ctx.set_offline(True)
    try:
        page.goto(devs.BASE + "/help.html", wait_until="load"); print("オフライン表示:", page.title()[:30])
    except Exception as e:
        print("オフライン表示 NG:", str(e)[:100])
    ctx.set_offline(False)
    print("エラー:", errs[:3])
    b.close()
