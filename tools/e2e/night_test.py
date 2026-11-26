import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
ensure_game_server()
UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(viewport={"width": 820, "height": 380}, user_agent=UA, has_touch=True, is_mobile=True)
    c.add_init_script("try{localStorage.setItem('are_gtips_off','1')}catch(e){}")
    pg = c.new_page(); logs = []
    pg.on("pageerror", lambda e: logs.append(str(e)))
    pg.goto(GBASE + "/game/index.html", wait_until="load"); pg.wait_for_timeout(2500)
    for sel in ("はじめから", "この枠ではじめる", "⚡"):
        pg.evaluate("(t)=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(t));b&&b.click()}", sel); pg.wait_for_timeout(900)
    pg.evaluate("()=>{G.scripts=[];G.mode='map';G.S.map='lab';render();G.S.f.intro_done=1}")
    def rest():
        pg.evaluate("()=>{runScript(RPG_EV.seat)}")
        texts = []
        for i in range(120):
            m = pg.evaluate("()=>G.mode")
            if m == "map": break
            if m == "choice":
                pg.evaluate("()=>{ACT.choose(0)}"); continue
            t = pg.evaluate("()=>G.say&&G.say.text||''")
            if t and (not texts or texts[-1] != t): texts.append(t)
            pg.evaluate("()=>{try{ACT.next()}catch(e){}}"); pg.wait_for_timeout(40)
        return texts, pg.evaluate("()=>({mode:G.mode, f:Object.keys(G.S.f).filter(k=>/^nt/.test(k))})")
    print(pg.evaluate('''()=>{const out=[];const walk=(a)=>a.forEach(o=>{if(o[0]==='say')out.push(rpgFmt(o[2]));else if(o[0]==='if'){walk(o[2]||[]);walk(o[3]||[])}else if(o[0]==='choice')o[1].forEach(c=>{out.push(rpgFmt(c[0]));walk(c[1])})});walk(RPG_EV.night_talk);return {n:out.length,bad:out.filter(t=>/[{}\[\]]|undefined/.test(t)),maxlen:Math.max(...out.map(t=>t.length))}}'''))
    pg.evaluate("()=>{G.S.items.coffee=0;G.S.items.onigiri=0}")
    # mem0: nothing
    t, st = rest(); print("mem0", len(t), st)
    seq = [([1,0,0,0,0,0], {}), ([1,1,0,0,0,0], {}), ([1,1,1,0,0,0], {}), ([1,1,1,1,0,0], {}), ([1,1,1,1,1,0], {}), ([1,1,1,1,1,1], {"e_future":1})]
    for i, (mem, fl) in enumerate(seq):
        pg.evaluate("([m,f])=>{G.S.mem=m;Object.assign(G.S.f,f)}", [mem, fl])
        t, st = rest(); print("ep", i+1, "lines", len(t), st, "|", (t[0] if t else "")[:30])
    t, st = rest(); print("again(no more)", len(t), st)
    print(pg.evaluate('()=>[G.S.items.coffee,G.S.items.onigiri]'), logs[:3]); b.close()
