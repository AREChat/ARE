import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox","--autoplay-policy=no-user-gesture-required"])
        errs=[]; pg = await b.new_page(viewport={"width":1100,"height":700}); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "404" not in m.text else None)
        await pg.goto("http://127.0.0.1:8123/game15/index.html"); await pg.wait_for_timeout(400)
        await pg.click("#bPlay"); await pg.wait_for_timeout(200)
        await pg.click("#bSetS"); await pg.wait_for_timeout(300); await pg.screenshot(path="/tmp/pk_set0.png")
        for tab in range(1,4):
            await pg.click(f"#setTabs button:nth-child({tab+1})"); await pg.wait_for_timeout(200); await pg.screenshot(path=f"/tmp/pk_set{tab}.png")
        await pg.click("#bSetClose")
        # 手動：実際に 叩く
        await pg.click("#bGo"); await pg.wait_for_timeout(3600)
        for i in range(40):
            t = await pg.evaluate("PK.now()"); 
            await pg.keyboard.press("f" if i%2==0 else "d"); await pg.wait_for_timeout(180)
        await pg.screenshot(path="/tmp/pk_manual.png")
        print(await pg.evaluate("({s:PK.G.score,c:PK.G.combo,g:PK.G.g,o:PK.G.o,m:PK.G.m})"))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300); await pg.screenshot(path="/tmp/pk_pause.png")
        await pg.click("#bResume"); 
        # 結果画面：すぐ終わらせる
        await pg.evaluate("PK.finish()"); await pg.wait_for_timeout(500); await pg.screenshot(path="/tmp/pk_result.png")
        print("errors", errs)
        await b.close()
asyncio.run(main())
