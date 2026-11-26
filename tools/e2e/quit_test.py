import sys, subprocess, time
from playwright.sync_api import sync_playwright
ROOT="/home/claude/are"
res=[]
def chk(n, ok, note=""): res.append(ok); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
with sync_playwright() as p:
    for mode in ["http", "file"]:
        b = p.chromium.launch(args=["--allow-file-access-from-files"] if mode=="file" else [])
        ctx = b.new_context(viewport={"width":1100,"height":700}); page = ctx.new_page()
        errs=[]; fails=[]
        page.on("pageerror", lambda e: errs.append(str(e)[:120]))
        page.on("requestfailed", lambda r: fails.append(r.url[-70:]))
        page.on("response", lambda r: fails.append(f"{r.status} {r.url[-70:]}") if r.status>=400 else None)
        url = "http://127.0.0.1:8793/game/index.html" if mode=="http" else f"file://{ROOT}/game/index.html"
        if mode=="http":
            srv = subprocess.Popen(["python3","-m","http.server","8793","--bind","127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
        page.goto(url, wait_until="load"); page.wait_for_timeout(2500)
        title = page.title()
        chk(f"[{mode}] game1 が開く", "ARE" in title or len(title)>0, title[:40])
        chk(f"[{mode}] ページエラーなし（読み込み時）", not errs, errs[:2])
        chk(f"[{mode}] 404/失敗した読み込みなし", not [f for f in fails if "mp3" not in f and "favicon" not in f], fails[:3])
        # 保存→読み込み（localStorage）
        try:
            page.evaluate("() => { localStorage.setItem('__t','ok') }"); v = page.evaluate("() => localStorage.getItem('__t')")
            chk(f"[{mode}] localStorage が使える（保存の土台）", v=="ok")
        except Exception as e:
            chk(f"[{mode}] localStorage が使える", False, str(e)[:80])
        # おわる
        page.evaluate("() => { window.close = () => {}; }")
        page.once("dialog", lambda d: d.accept())
        has = page.evaluate("() => !!document.getElementById('btnQuit')")
        chk(f"[{mode}] 「おわる」ボタンがある", has)
        if has:
            page.evaluate("() => document.getElementById('btnQuit').click()"); page.wait_for_timeout(500)
            # 確認ダイアログ（askYes）の「はい」を押す
            clicked = page.evaluate("""() => { const bs=[...document.querySelectorAll('button')].filter(b=>/はい|OK|おわる/.test(b.textContent) && b.offsetParent!==null && b.id!=='btnQuit'); if(bs.length){ bs[0].click(); return bs[0].textContent.trim().slice(0,10);} return null; }""")
            page.wait_for_timeout(1200)
            u = page.url
            chk(f"[{mode}] 「おわる」→「はい」で移動する先", "login.html" in u, f"押したボタン={clicked} / 移動先={u[-45:]}")
        b.close()
        if mode=="http": srv.terminate()
print(f"合計 OK {sum(res)} / NG {len(res)-sum(res)}")
