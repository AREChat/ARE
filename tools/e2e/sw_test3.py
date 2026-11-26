import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import devs
from devs import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
with sync_playwright() as p:
    browser, ctx, page, logs = new_dev_page(p, "PC-1366x768", "PC", False, EXTRA)
    page.goto(devs.BASE + "/help.html", wait_until="load")   # このページは sw.js を登録しない
    page.evaluate("async () => { for (const n of ['are-v57-20261104','are-v63-20261105']) { const c = await caches.open(n); await c.put('/old.txt', new Response('old')); } }")
    print("先に作った古い控え:", page.evaluate("async () => await caches.keys()"))
    page.goto(devs.BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(3500)
    page.reload(wait_until="load"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    r = page.evaluate("""async () => { const keys = await caches.keys(); const out = {keys, ctrl: !!navigator.serviceWorker.controller};
        for (const k of keys) { const c = await caches.open(k); out[k] = (await c.keys()).map(r => new URL(r.url).pathname).filter(x => /bundle|are-pad|chat\\.html/.test(x)); }
        return out; }""")
    print("新しい sw.js のあと:", json.dumps(r, ensure_ascii=False))
    errs = [l for l in logs if l[0] == "pageerror"]
    print("エラー:", errs[:3])
    browser.close()
