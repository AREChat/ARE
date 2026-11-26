import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox","--autoplay-policy=no-user-gesture-required"])
        errs=[]
        for name,vp in [("desk",{"width":1280,"height":720}),("port",{"width":390,"height":800}),("land",{"width":800,"height":380})]:
            pg = await b.new_page(viewport=vp); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None); pg.on("pageerror", lambda e: errs.append("PE "+str(e)))
            await pg.goto("http://127.0.0.1:8123/game15/index.html"); await pg.wait_for_timeout(600)
            await pg.screenshot(path=f"/tmp/pk_{name}_title.png")
            await pg.click("#bPlay"); await pg.wait_for_timeout(300); await pg.screenshot(path=f"/tmp/pk_{name}_sel.png")
            await pg.evaluate("document.getElementById('autoBox').checked=true"); await pg.click("#bGo"); await pg.wait_for_timeout(5500)
            await pg.screenshot(path=f"/tmp/pk_{name}_play.png")
            await pg.wait_for_timeout(8000); await pg.screenshot(path=f"/tmp/pk_{name}_play2.png")
            r = await pg.evaluate("({s:PK.G.score,c:PK.G.combo,g:PK.G.g,m:PK.G.m,run:PK.G.running})"); print(name, r)
            await pg.close()
        print("errors:", errs[:8])
        await b.close()
asyncio.run(main())
