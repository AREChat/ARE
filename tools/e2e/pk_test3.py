import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox","--autoplay-policy=no-user-gesture-required"])
        errs=[]; pg = await b.new_page(viewport={"width":1100,"height":700}); pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://127.0.0.1:8123/game15/index.html"); await pg.wait_for_timeout(300)
        await pg.click("#bPlay"); await pg.click(".song:nth-child(2)"); await pg.wait_for_timeout(100)
        await pg.click("#bGo"); await pg.wait_for_timeout(300)
        await pg.evaluate("""()=>{ const G=PK.G; window._i=0; (function tick(){ if(G.scr!=='play'&&!G.running){} const t=PK.now(); const ns=G.notes; for(let i=0;i<ns.length;i++){ const n=ns[i]; if(n.done||n._p) continue; if(n.t-t>0.03) break; if(n.type==='d'||n.type==='D'){ n._p=1; PK.hit('d'); } else if(n.type==='k'||n.type==='K'){ n._p=1; PK.hit('k'); } else if(n.type==='r'||n.type==='R'||n.type==='b'){ if(t>=n.t&&t<=n.end&&(!n._l||t-n._l>.07)){ n._l=t; PK.hit('d'); } } } requestAnimationFrame(tick); })(); }""")
        await pg.wait_for_timeout(22000)
        print(await pg.evaluate("({s:PK.G.score,c:PK.G.combo,g:PK.G.g,o:PK.G.o,m:PK.G.m,roll:PK.G.roll,bal:PK.G.balloons,gauge:Math.round(PK.G.gauge)})"))
        await pg.screenshot(path="/tmp/pk_man2.png")
        print("errs", errs); await b.close()
asyncio.run(main())
