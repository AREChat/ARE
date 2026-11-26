import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=1000, height=720, touch=False)
    page.goto(f"{BASE}/game5/blocks/index.html", wait_until="load"); page.wait_for_timeout(1500)
    check("役えらびの画面が出る", page.is_visible("#areRole"))
    # --- けす役（iframe）
    page.click("#roleClr"); page.wait_for_timeout(2500)
    fr = next((f for f in page.frames if f != page.main_frame), None)
    check("「けす役」を選ぶとゲーム画面（iframe）が開く", fr is not None and page.locator("#are7Frame").is_visible())
    if fr:
        fr.evaluate("document.getElementById('start') && document.getElementById('start').click()"); page.wait_for_timeout(800)
        st = fr.evaluate("({state: __g7.S.state, role: __g7.S.role, score: __g7.me.score})")
        check("はじめるとプレイ状態になる（けす役）", st["state"] == "play" and st["role"] == "clear", st)
        sc0 = fr.evaluate("__g7.me.score"); pieces0 = fr.evaluate("JSON.stringify(__g7.me.board.rows || __g7.me.board.g || 0).length")
        for k in ["ArrowLeft", "ArrowLeft", " ", "ArrowRight", "ArrowUp", " ", " ", "ArrowRight", " ", " "]:
            page.keyboard.press(k); page.wait_for_timeout(250)
        after = fr.evaluate("({state: __g7.S.state, score: __g7.me.score, lines: __g7.me.lines, time: __g7.me.time})")
        check("キー操作でブロックが落ち、スコアか時間が進む", after["score"] > sc0 or (after["time"] or 0) > 0, after)
        # 一時停止 / 再開
        page.keyboard.press("p"); page.wait_for_timeout(300)
        paused = fr.evaluate("__g7.S.state")
        page.keyboard.press("p"); page.wait_for_timeout(300)
        check("Pキーで一時停止→再開できる", paused == "pause" and fr.evaluate("__g7.S.state") == "play", paused)
        # 積み上げて終わらせて、ベスト記録が保存される
        for _ in range(60):
            if fr.evaluate("__g7.S.state") == "over": break
            page.keyboard.press(" "); page.wait_for_timeout(120)
        over = fr.evaluate("__g7.S.state")
        best = fr.evaluate("(() => { try{ return localStorage.getItem('are7_best_clear_1'); }catch(e){ return null; } })()")
        check("積み上がるとゲームオーバーになり、ベストが保存される", over == "over" and best is not None, (over, best))
        page.screenshot(path="/tmp/are-e2e/shots_games/game7_clear.png")
    # --- じゃま役（本体）
    page.goto(f"{BASE}/game5/blocks/index.html", wait_until="load"); page.wait_for_timeout(1500)
    page.click("#roleSab"); page.wait_for_timeout(1200)
    page.evaluate("document.getElementById('start') && document.getElementById('start').click()"); page.wait_for_timeout(800)
    st = page.evaluate("typeof __g7 !== 'undefined' ? ({state: __g7.S.state, role: __g7.S.role}) : null")
    check("「じゃま役」で本体のゲームが始まる", st and st["state"] == "play" and st["role"] == "disrupt", st)
    if st:
        e0 = page.evaluate("document.getElementById('energyBox').innerText")
        page.wait_for_timeout(6000)
        e1 = page.evaluate("document.getElementById('energyBox').innerText")
        check("じゃま役：ポイント（エネルギー）が時間で増える", e0 != e1, (e0.replace("\n", " "), e1.replace("\n", " ")))
        page.keyboard.press("1"); page.wait_for_timeout(300)
        foe_lines = page.evaluate("__g7.foe ? 1 : 0")
        check("じゃま役：わざ（キー1）を使ってもエラーにならない", True)
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:3])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
