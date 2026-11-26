import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import devs
from devs import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
with sync_playwright() as p:
    browser, ctx, page, logs = new_dev_page(p, "PC-1366x768", "PC", False, EXTRA)
    page.goto(devs.BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(800)
    page.evaluate("async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); }")
    page.wait_for_timeout(500)
    # 古い名前の控えを先に作っておく → 新しい sw.js が入ると消えるか
    page.evaluate("async () => { const c = await caches.open('are-v63-20261105'); await c.put('/old.txt', new Response('old')); }")
    page.evaluate("async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; }")
    page.wait_for_timeout(3000)
    print("登録後の控え:", page.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); return [await caches.keys(), r && r.active && r.active.state, r && r.active && r.active.scriptURL.split('/').pop()]; }"))
    page.reload(wait_until="load"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    r = page.evaluate("""async () => { const keys = await caches.keys(); const out = {keys, ctrl: !!navigator.serviceWorker.controller};
        for (const k of keys) { const c = await caches.open(k); out[k] = (await c.keys()).map(r => new URL(r.url).pathname).filter(x => /bundle|are-pad|sw\\.js|chat\\.html/.test(x)); }
        return out; }""")
    print(json.dumps(r, ensure_ascii=False))
    errs = [l for l in logs if l[0] == "pageerror" or ("Cache" in l[1] and "put" in l[1])]
    print("エラー:", errs[:3])
    browser.close()
