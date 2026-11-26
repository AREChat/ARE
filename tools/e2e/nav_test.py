import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
ensure_game_server()
UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(viewport={"width":820,"height":380}, user_agent=UA, has_touch=True, is_mobile=True)
    c.add_init_script("try{localStorage.setItem('are_gtips_off','1')}catch(e){}")
    pg = c.new_page(); logs=[]; pg.on("pageerror", lambda e: logs.append(str(e)[:150]))
    pg.goto(GBASE + "/game/index.html", wait_until="load"); pg.wait_for_timeout(2500)
    for sel in ("はじめから", "この枠ではじめる", "⚡"):
        pg.evaluate("(t)=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(t));b&&b.click()}", sel); pg.wait_for_timeout(800)
    pg.evaluate("()=>{G.scripts=[];G.mode='map';G.S.map='sendai';G.S.lv=12;render();battleStart(['zunda','sasa'],null)}"); pg.wait_for_timeout(1000)
    cur = lambda: pg.evaluate("()=>{const l=[...document.querySelectorAll('#bc .opt')];return l.findIndex(e=>e.classList.contains('on'))}")
    seq=[cur()]
    for k in ["ArrowDown","ArrowDown","ArrowDown","ArrowDown","ArrowRight","ArrowUp","ArrowUp","ArrowLeft"]:
        pg.keyboard.press(k); pg.wait_for_timeout(80); seq.append(cur())
    print(seq, logs)
    # Enter on "にげる" index 7 executes run? just check Enter on 0 opens target menu
    pg.evaluate("()=>{document.querySelectorAll('#bc .opt').forEach(e=>e.classList.remove('on'));document.querySelector('#bc .opt').classList.add('on')}")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(300); print(pg.evaluate("()=>G.b.menu"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); print(pg.evaluate("()=>G.b.menu"))
    b.close()
