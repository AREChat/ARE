import sys, json, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
os.environ["ARE_SW"] = "block"
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
def row(i, sender, content): return {"id": f"m{i:03d}", "room_id": "r1", "sender_id": sender, "content": json.dumps(content, ensure_ascii=False), "created_at": f"2026-11-22T01:{i // 60:02d}:{i % 60:02d}Z", "edited_at": None, "expires_at": None, "is_auto_reply": False}
def g(game, gid, kind, **kw): d = {"type": "game", "game": game, "gid": gid, "kind": kind}; d.update(kw); return d
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=900)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    deck = page.evaluate("VS_ENGINES.mem.init({seed: 777}).deck")
    pairs = {}
    for i, v in enumerate(deck): pairs.setdefault(v, []).append(i)
    pl = [pairs[k] for k in sorted(pairs)]          # 8組：[[a,b], ...]
    def scenario_mem(winner, gid="g1"):
        """winner: 'u1'（相手が勝つ）/ 'me'（自分が勝つ）/ 'draw'"""
        msgs = [row(0, "u-me", g("mem", gid, "start", seed=777))]
        n = 1
        # 自分が わざとはずして、相手に番をわたす
        a, b = pl[0][0], pl[1][0]
        msgs += [row(n, "u-me", g("mem", gid, "move", i=a)), row(n + 1, "u-me", g("mem", gid, "move", i=b))]; n += 2
        order = {"u1": [("u1", k) for k in range(8)], "me": [("u1", 0)] + [("u1", 0)], "draw": []}[winner] if False else None
        # 取る人を決める：u1 が 4組(draw)／8組／ ほぼぜんぶ(自分が勝つには、相手が一度はずして、自分が とる)
        takers = {"u1": ["u1"] * 8, "draw": ["u1"] * 4 + ["me"] * 4}.get(winner)
        if winner == "me":   # 相手が はずす → 自分が 8組とる
            c, d = pl[0][0], pl[1][0]
            msgs += [row(n, "u1", g("mem", gid, "move", i=c)), row(n + 1, "u1", g("mem", gid, "move", i=d))]; n += 2
            takers = ["me"] * 8
        elif winner == "draw":
            takers = ["u1"] * 4 + [None]
        who = "u1"
        if winner == "draw":
            for k in range(4):
                for i in pl[k]: msgs.append(row(n, "u1", g("mem", gid, "move", i=i))); n += 1
            c, d = pl[4][0], pl[5][0]            # 相手がはずして 自分に番
            msgs += [row(n, "u1", g("mem", gid, "move", i=c)), row(n + 1, "u1", g("mem", gid, "move", i=d))]; n += 2
            for k in range(4, 8):
                for i in pl[k]: msgs.append(row(n, "u-me", g("mem", gid, "move", i=i))); n += 1
        else:
            for k in range(8):
                for i in pl[k]: msgs.append(row(n, "u1" if winner == "u1" else "u-me", g("mem", gid, "move", i=i))); n += 1
        return msgs
    def open_room(msgs, hold_last=True):
        before = msgs[:-1] if hold_last else msgs
        page.evaluate("(m) => { window.__fx.tables.messages = m.slice().reverse(); }", before)   # アプリは「新しい順」で取るので、偽サーバーにも 新しい順で入れる
        page.evaluate("document.getElementById('backButton') && document.getElementById('backButton').click()"); page.wait_for_timeout(500)
        page.evaluate("document.querySelector('[data-tab=chats]') && document.querySelector('[data-tab=chats]').click()")
        page.locator("#roomList > *:not(.pb-pin-entry)").filter(has_text="みどり").first.click(); page.wait_for_timeout(1800)
    # ---- 1) 相手が勝つ：最後の1手がとどくと、結果が出る ----
    msgs = scenario_mem("u1")
    open_room(msgs)
    check("1a 終わる前は『ゲームプレイ中』のパネルが出る", page.is_visible("#vsPin") and "ゲームプレイ中" in page.inner_text("#vsPin"), page.inner_text("#vsPin")[:60])
    page.evaluate("(m) => { window.__fx.tables.messages.unshift(m); loadMessages(false); }", msgs[-1]); page.wait_for_timeout(1500)
    pin = page.inner_text("#vsPin")
    check("1b 終わった瞬間、パネルが消えずに『ゲーム終了』と結果が出る", "ゲーム終了" in pin and "みどりさんの勝利です！" in pin, pin[:200])
    toast = page.evaluate("document.getElementById('toast').textContent + '|' + document.getElementById('toast').classList.contains('show')")
    check("1c 同じ瞬間に、通知（吹き出し）にも『みどりさんの勝利です！』が出る", "みどりさんの勝利です！" in toast and toast.endswith("true"), toast)
    last = page.evaluate("(() => { const b = [...document.querySelectorAll('#messages .vs-move')]; return b.length ? b[b.length - 1].innerText : ''; })()")
    check("1d 会話の いちばん下（最後の手）にも、結果が出る", "みどりさんの勝利です！" in last and "神経衰弱" in last, last)
    others = page.evaluate("[...document.querySelectorAll('#messages .vs-move')].slice(0, -1).filter(b => b.innerText.includes('勝利')).length")
    check("1e 途中の手のところには、結果は出ない", others == 0, others)
    start = page.evaluate("[...document.querySelectorAll('#messages .vs-bubble, #vsPin .vs-bubble')].map(b => b.querySelector('.vs-status') && b.querySelector('.vs-status').innerText).filter(Boolean)")
    check("1f 盤のところの状態表示も『勝利です！』になる（8組 ／ 0組）", any("みどりさんの勝利です" in t and "8組" in t for t in start), start)
    page.screenshot(path="/tmp/vs_result1.png")
    page.click("#vsPin .vspin-close"); page.wait_for_timeout(400)
    check("1g『とじる』を押すと、パネルが閉じる", not page.is_visible("#vsPin"))
    # ---- 2) 自分が勝つ ----
    msgs = scenario_mem("me", "g1b")
    open_room(msgs)
    page.evaluate("(m) => { window.__fx.tables.messages.unshift(m); loadMessages(false); }", msgs[-1]); page.wait_for_timeout(1500)
    pin = page.inner_text("#vsPin")
    check("2 自分が勝ったときは『あなたの勝利です！』", "あなたの勝利です！" in pin and "さんの勝利" not in pin, pin[:200])
    # ---- 3) 引き分け ----
    msgs = scenario_mem("draw", "g1c")
    open_room(msgs)
    page.evaluate("(m) => { window.__fx.tables.messages.unshift(m); loadMessages(false); }", msgs[-1]); page.wait_for_timeout(1500)
    pin = page.inner_text("#vsPin")
    check("3 同点のときは『引き分けです』（4組ずつ）", "引き分けです" in pin and "4組" in pin and "勝利" not in pin, pin[:200])
    # ---- 4) 途中で『終了』：相手の勝ち ----
    msgs = [row(0, "u-me", g("mem", "g2", "start", seed=777)), row(1, "u-me", g("mem", "g2", "move", i=pl[0][0])), row(2, "u-me", g("mem", "g2", "move", i=pl[1][0])), row(3, "u1", g("mem", "g2", "move", i=pl[0][0])), row(4, "u1", g("mem", "g2", "resign"))]
    # 相手(みどり)が「終了」→ 自分の勝ち
    open_room(msgs)
    page.evaluate("(m) => { window.__fx.tables.messages.unshift(m); loadMessages(false); }", msgs[-1]); page.wait_for_timeout(1500)
    pin = page.inner_text("#vsPin")
    check("4 相手が『終了』を押したら『ゲームを終了しました。あなたの勝利です！』", "終了しました" in pin and "あなたの勝利です！" in pin, pin[:200])
    # ---- 5) ほかのゲーム（三目並べ）：横3つそろって勝ち ----
    t = [row(0, "u-me", g("ttt", "g3", "start")), row(1, "u-me", g("ttt", "g3", "move", i=0)), row(2, "u1", g("ttt", "g3", "move", i=3)), row(3, "u-me", g("ttt", "g3", "move", i=1)), row(4, "u1", g("ttt", "g3", "move", i=4)), row(5, "u-me", g("ttt", "g3", "move", i=2))]
    open_room(t)
    page.evaluate("(m) => { window.__fx.tables.messages.unshift(m); loadMessages(false); }", t[-1]); page.wait_for_timeout(1500)
    pin = page.inner_text("#vsPin")
    check("5 三目並べでも、終わると結果（あなたの勝利です！）が出る", "あなたの勝利です！" in pin, pin[:200])
    check("6 ページのエラーなし", not errs, errs)
    browser.close()
print("%d/%d 通過" % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
