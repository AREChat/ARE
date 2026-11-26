import sys, os, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
PAGES = ["game/index.html","game2/index.html","game3/index.html","game4/index.html","game5/play/index.html","game6/index.html","game7/index.html","dream-frontier/index.html","daifugo/index.html"]
JS_BTN = "() => { const b = document.getElementById('areGameBackBtn'); if(!b) return 'no-button'; return getComputedStyle(b).display === 'none' ? 'hidden' : 'visible'; }"
res = {}
with sync_playwright() as p:
    for pg in PAGES:
        browser, ctx, page, logs = new_page(p, width=800, height=380, extra_fx="")
        try:
            page.goto(BASE + "/" + pg, wait_until="domcontentloaded", timeout=20000); page.wait_for_timeout(3200)
            btn = page.evaluate(JS_BTN)
            # 1回目の「戻る」：ページから出てはいけない
            page.evaluate("() => history.back()"); page.wait_for_timeout(700)
            still = page.url.endswith(pg) or pg.split('/')[0] in page.url
            # 2回目（すぐ）：チャットへもどる
            page.evaluate("() => history.back()"); page.wait_for_timeout(1500)
            left = "chat.html" in page.url or "login.html" in page.url
            errs = [l for l in logs if l[0] in ("pageerror",)]
            res[pg] = {"button": btn, "1回目は出ない": still, "2回目でチャットへ": left, "url": page.url.replace(BASE, ""), "pageerror": len(errs)}
        except Exception as e:
            res[pg] = {"ERR": str(e)[:120]}
        browser.close()
for k, v in res.items(): print(k, v)
if srv: srv.terminate()
