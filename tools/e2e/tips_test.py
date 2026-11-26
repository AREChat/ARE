import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
ensure_game_server()
UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
pages = ["game11/index.html","game11/words.html","game11/twins.html","game11/rules.html","game11/echo.html","game12/index.html","game13/index.html","game14/index.html","game/index.html"]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    for pgn in pages:
        c = b.new_context(viewport={"width": 820, "height": 380}, user_agent=UA, has_touch=True, is_mobile=True)
        pg = c.new_page(); logs = []
        pg.on("pageerror", lambda e: logs.append(str(e)[:100]))
        pg.goto(GBASE + "/" + pgn, wait_until="load"); pg.wait_for_timeout(2600)
        shown = pg.evaluate("()=>{const m=document.getElementById('areTips');return m?m.querySelector('h3').innerText+' / '+m.querySelectorAll('li').length+'行':null}")
        ok = pg.evaluate("()=>{const b=document.querySelector('#areTips .ok');if(!b)return null;const r=b.getBoundingClientRect();return [r.bottom<=innerHeight, r.height]}")
        if pgn in ("game11/echo.html","game12/index.html"): pg.screenshot(path="/tmp/out/tip_" + pgn.replace("/","_")+".png")
        pg.evaluate("()=>{const b=document.querySelector('#areTips .ok');b&&b.click()}"); pg.wait_for_timeout(300)
        gone = pg.evaluate("()=>!document.getElementById('areTips')")
        pg.reload(wait_until="load"); pg.wait_for_timeout(2600)
        again = pg.evaluate("()=>!!document.getElementById('areTips')")
        print(pgn, "|", shown, "| okbtn in view", ok, "| closed", gone, "| reappear", again, logs[:2])
        c.close()
    b.close()
