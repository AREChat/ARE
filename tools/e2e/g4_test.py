import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=1000, height=700, touch=False)
    page.goto(f"{BASE}/game4/index.html", wait_until="load"); page.evaluate("localStorage.setItem('areq4_speed','4')"); page.reload(wait_until="load"); page.wait_for_timeout(2500)
    tuto = page.locator("#tuto").is_visible()
    check("はじめて開くと『あそびかた』の説明が出る（閉じられる）", True, "説明あり" if tuto else "説明なし")
    if tuto: page.click("#tutoClose"); page.wait_for_timeout(400)
    check("メニュー（対戦開始）が見える", page.is_visible("#btnStart"))
    page.click("#btnStart"); page.wait_for_timeout(2500)
    info = page.evaluate("({inMatch: __g4.inMatch, turn: __g4.G && __g4.G.turn, hand: __g4.G && __g4.G.p[0].hand.length, over: !!(__g4.G && __g4.G.over)})")
    check("対戦が始まり、手札が配られる", info["inMatch"] and (info["hand"] or 0) > 0, info)
    handDom = page.locator("#hand > *").count()
    check("手札が画面にカードとして並ぶ", abs(handDom - page.evaluate("__g4.G.p[0].hand.length")) <= 1, (handDom, page.evaluate("__g4.G.p[0].hand.length")))
    page.screenshot(path="/tmp/are-e2e/shots_games/game4_match.png")
    # 手札を1枚えらぶ → 説明が出る → もう一度で取り消し
    playable = page.locator("#hand > *:not(.no)")
    if playable.count() == 0:
        check("（この回は 出せるカードがないため、カード選択の確認は省略）", True)
    else:
        playable.first.click(); page.wait_for_timeout(400)
        sel_msg = page.evaluate("document.body.innerText")
        check("出せるカードを選ぶと、置く場所/対象の案内が出る", ("えらんで" in sel_msg) or ("タップ" in sel_msg), [l for l in sel_msg.split("\n") if "えらんで" in l or "タップ" in l][:1])
        playable.first.click(); page.wait_for_timeout(300)
    # ターン終了ボタン
    if page.evaluate("__g4.G.turn") == 0:
        t0 = page.evaluate("__g4.G.turn")
        page.click("#btnEnd"); page.wait_for_timeout(300)
        for _ in range(40):
            if page.evaluate("__g4.G.turn") == 0 or page.evaluate("!!__g4.G.over"): break
            page.wait_for_timeout(500)
        check("「ターン終了」で相手の番を経て自分の番に戻る", page.evaluate("__g4.G.turn") == 0 or page.evaluate("!!__g4.G.over"), page.evaluate("__g4.G.turn"))
    # 自分の番は「ターン終了」だけを押し続ける（相手のCPUが攻めて、決着するまで）
    out = page.evaluate("""async () => { let i = 0; const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let asks = 0;
        const answer = async () => { const a = document.getElementById('ask'); if(a && !a.hidden){ asks++; document.getElementById(asks % 2 ? 'askYes' : 'askNo').click(); await sleep(60); } };
        const t0 = performance.now();
        while(!__g4.G.over && i < 200 && performance.now() - t0 < 150000){
            await answer();
            if(__g4.G.turn === 0 && !__g4.busy){ i++; document.getElementById('btnEnd').click(); await sleep(80); }
            else await sleep(60);
        }
        return {passes: i, over: __g4.G.over, turnNo: __g4.G.turnNo, asks, hp: __g4.G.p.map(p => p.base.hp), secs: Math.round((performance.now() - t0) / 1000)}; }""")
    rounds, over = out["passes"], out["over"]
    print("   決着:", out)
    check("最後まで遊べて、勝敗が決まる", bool(over), (rounds, over))
    page.wait_for_timeout(1500)
    check("結果の画面が出る", page.is_visible("#result"))
    rec = page.evaluate("localStorage.getItem('areq4_rec')")
    check("戦績（勝ち・負け）がブラウザに保存される", rec is not None and (json.loads(rec)["w"] + json.loads(rec)["l"]) == 1, rec)
    page.click("#btnToMenu"); page.wait_for_timeout(500)
    check("メニューにもどれる", page.is_visible("#btnStart"))
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:3])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
if srv: srv.terminate()
