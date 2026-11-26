import sys, json, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
ensure_game_server()
res=[]
def check(n, ok, d=""): res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(d)[:200]) if d != "" else ""), flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(viewport={"width": 420, "height": 820}, service_workers="allow")
    c.add_init_script("try{localStorage.setItem('are_gtips_off','1')}catch(e){}")
    pg = c.new_page(); logs = []
    pg.on("pageerror", lambda e: logs.append(str(e)))
    pg.goto(GBASE + "/game11/echo.html", wait_until="load")
    ok = False
    for i in range(60):
        pg.wait_for_timeout(1000)
        st = pg.evaluate("async()=>{const r=await navigator.serviceWorker.getRegistration();const ks=await caches.keys();let n=0,has=false;for(const k of ks){const cc=await caches.open(k);const rs=await cc.keys();n+=rs.length;has=has||rs.some(x=>x.url.includes('echo.html'))}return {ctl:!!navigator.serviceWorker.controller,act:!!(r&&r.active),n,has,ks}}")
        if st["has"]: ok = True; break
    check("O1 サービスワーカーが こだまの部屋を キャッシュした", ok, st)
    c.set_offline(True)
    pg.goto(GBASE + "/game11/echo.html", wait_until="load"); pg.wait_for_timeout(800)
    check("O2 オフラインでも ひらく（タイトル）", pg.evaluate("()=>document.getElementById('s-title').classList.contains('on') && !!window.EC_LEVELS"), pg.url)
    pg.evaluate("()=>{__ec.openLevel(0)}"); pg.wait_for_timeout(300)
    for k in ["ArrowDown","ArrowDown"]: pg.keyboard.press(k); pg.wait_for_timeout(60)
    check("O3 オフラインで あそべる", pg.evaluate("()=>__ec.S.G.cur")=="DD")
    check("O4 エラーなし", not logs, logs[:2])
    b.close()
print("オフラインテスト %d / %d" % (sum(res), len(res)))
