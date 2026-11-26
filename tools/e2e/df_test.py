import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=960, height=640, touch=False)
    page.goto(f"{BASE}/dream-frontier/index.html", wait_until="load"); page.wait_for_timeout(10500)
    check("正常なら、10秒たっても診断パネルは出ない", page.locator("#bootDiag").count() == 0)
    check("タイトル（あそぶ！）が見える", page.is_visible("#startBtn"))
    page.click("#startBtn"); page.wait_for_timeout(3000)
    info = page.evaluate("(() => { const d = window.__df; return d ? {backend: d.info.backend, three: d.info.threeStatus, keys: Object.keys(d.game).slice(0, 14)} : null; })()")
    check("はじめると 3D のゲーム本体が起動する", info is not None, info)
    check("描画方式が決まっている（three / 自前WebGL2）", info and info["backend"], info and info["backend"])
    for _ in range(8):
        page.keyboard.press("Enter"); page.wait_for_timeout(300)
    print("   会話ウィンドウ:", page.evaluate("(() => { const d = document.querySelector('#say, .say, #dlg, .dialog, #talk'); return d ? (d.className + '|' + (d.offsetParent ? 'visible' : 'hidden')) : 'none'; })()"), "| mode:", page.evaluate("window.__df.game.mode"))
    pos = lambda: page.evaluate("(() => { const g = window.__df.game; const p = g.player || g.pl || g.me || g; return JSON.stringify({x: p.x, z: p.z, y: p.y, pos: p.pos}); })()")
    p0 = pos()
    for k in ["KeyW", "KeyD", "ArrowUp", "ArrowRight"]:
        page.keyboard.down(k); page.wait_for_timeout(1800); page.keyboard.up(k)
    p1 = pos()
    check("キーで歩ける（位置が変わる）", p0 != p1, (p0, p1))
    page.screenshot(path="/tmp/are-e2e/shots_games/df_walk.png")
    menu = page.evaluate("[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>(b.id?'#'+b.id+' ':'')+b.innerText.trim().replace(/\\s+/g,' ').slice(0,16))")
    print("   画面のボタン:", menu[:14])
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:3])
    print("   起動診断:", page.evaluate("window.__bootErrors ? window.__bootErrors.slice(0,3) : null"))
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
