import sys, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *

def dev_list():
    """Chrome の開発者ツールの端末表示と同じ指定（端末の名前 → 縦・横）"""
    return [
        ("iPhone13-縦", "iPhone 13", False), ("iPhone13-横", "iPhone 13", True),
        ("Pixel7-縦", "Pixel 7", False), ("Pixel7-横", "Pixel 7", True),
        ("iPadMini-縦", "iPad Mini", False), ("iPadMini-横", "iPad Mini", True),
        ("400x622-縦", None, False), ("400x622-横", None, True),
        ("PC-1366x768", "PC", False),
    ]

def new_dev_page(p, name, dev, landscape, extra_fx=""):
    browser = p.chromium.launch()
    if dev == "PC":
        kw = dict(viewport={"width": 1366, "height": 768}, locale="ja-JP")
    elif dev is None:
        w, h = (622, 400) if landscape else (400, 622)
        kw = dict(viewport={"width": w, "height": h}, has_touch=True, is_mobile=True, device_scale_factor=2, locale="ja-JP")
    else:
        d = dict(p.devices[dev])
        if landscape and "landscape" in str(d.get("viewport")) or False:
            pass
        vp = d["viewport"]; 
        if landscape:
            vp = {"width": vp["height"], "height": vp["width"]}
            d["screen"] = {"width": d["screen"]["height"], "height": d["screen"]["width"]} if d.get("screen") else None
            if d["screen"] is None: d.pop("screen")
        d["viewport"] = vp
        d["locale"] = "ja-JP"
        kw = d
    ctx = browser.new_context(**kw)
    ctx.add_init_script(fixtures_js(extra_fx))
    ctx.add_init_script(FAKE_JS)
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append((m.type, m.text)) if m.type in ("error",) else None)
    page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))
    def handler(route):
        url = route.request.url
        if url.startswith(BASE) or url.startswith("data:") or url.startswith("blob:"):
            return route.continue_()
        if url.endswith(".js") or "supabase.js" in url:
            return route.fulfill(status=200, content_type="application/javascript", body="")
        return route.fulfill(status=200, content_type="text/plain", body="")
    ctx.route("**/*", handler)
    return browser, ctx, page, logs
