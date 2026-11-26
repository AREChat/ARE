import sys, json, os, datetime
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA"); os.environ["ARE_SW"] = "block"
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
now = datetime.datetime.now(datetime.timezone.utc)
def row(i, sender, content, mins=5): return {"id": f"c{i:03d}", "room_id": "r1", "sender_id": sender, "content": json.dumps(content, ensure_ascii=False), "created_at": (now - datetime.timedelta(minutes=mins - i * 0.1)).isoformat().replace("+00:00", "Z"), "edited_at": None, "expires_at": None, "is_auto_reply": False}
G1 = "aaaaaaaa-0000-0000-0000-000000000001"; G2 = "aaaaaaaa-0000-0000-0000-000000000002"
EXTRA = """window.__cgs = {}; window.__cgw = {};
window.__fx.rpc.cg_view = (a) => { const g = a.p_game; return {game:'baba', status: window.__cgs[g] || 'playing', winner: window.__cgw[g] || null, players:['u-me','u1'], turn:'u-me', hand:[], pub:{counts:{}}}; };
"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=900, extra_fx=EXTRA)
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    msgs = [row(1, "u1", {"type": "game", "game": "cg", "cg": "baba", "gid": G1, "kind": "start"})]
    page.evaluate("(m) => { window.__fx.tables.messages = m.slice().reverse(); }", msgs)
    page.locator("#roomList > *:not(.pb-pin-entry)").filter(has_text="みどり").first.click(); page.wait_for_timeout(1800)
    page.evaluate("cgWatchTick()"); page.wait_for_timeout(500)
    check("1a まだ勝負中：通知なし・結果の行なし", "勝利" not in page.inner_text("#messages") and not page.evaluate("document.getElementById('toast').classList.contains('show')"))
    page.evaluate("(g) => { window.__cgs[g] = 'done'; window.__cgw[g] = 'u1'; }", G1)
    page.evaluate("cgWatchTick()"); page.wait_for_timeout(600)
    toast = page.evaluate("document.getElementById('toast').textContent + '|' + document.getElementById('toast').classList.contains('show')")
    check("1b 勝負がついたら、画面をとじていても 通知が出る（みどりさんの勝利です！）", "みどりさんの勝利です！" in toast and toast.endswith("true"), toast)
    check("1c 会話の『参加・続きを見る』のふきだしに 結果が出る", "みどりさんの勝利です！" in page.inner_text("#messages"), page.inner_text("#messages")[:200])
    page.evaluate("document.getElementById('toast').classList.remove('show')")
    n0 = len([c for c in page.evaluate("window.__calls") if c.get("rpc") == "cg_view"])
    page.evaluate("cgWatchTick()"); page.wait_for_timeout(300)
    n1 = len([c for c in page.evaluate("window.__calls") if c.get("rpc") == "cg_view"])
    check("1d 終わったゲームは、もう見にいかない・通知も くり返さない", n1 == n0 and not page.evaluate("document.getElementById('toast').classList.contains('show')"), (n0, n1))
    # 2) 最初から終わっていたもの：通知は出さず、結果の行だけ
    page.evaluate("(g) => { window.__cgs[g] = 'done'; window.__cgw[g] = 'u-me'; }", G2)
    m2 = row(2, "u1", {"type": "game", "game": "cg", "cg": "baba", "gid": G2, "kind": "start"}, mins=2)
    page.evaluate("(m) => { window.__fx.tables.messages.unshift(m); loadMessages(false); }", m2); page.wait_for_timeout(1500)
    page.evaluate("cgWatchTick()"); page.wait_for_timeout(600)
    check("2a はじめから終わっていたゲームは、通知を出さず 結果だけ出す（あなたの勝利です！）", "あなたの勝利です！" in page.inner_text("#messages") and not page.evaluate("document.getElementById('toast').classList.contains('show')"), page.inner_text("#messages")[-160:])
    # 3) 画面（シート）をひらくと、新しい文で結果が出る
    page.evaluate("openCg('%s')" % G1); page.wait_for_timeout(900)
    sh = page.inner_text("#profileSheet")
    check("3 カードの画面にも『ゲーム終了！ みどりさんの勝利です！』", "ゲーム終了！" in sh and "みどりさんの勝利です！" in sh, sh[:120])
    check("4 ページのエラーなし", not errs, errs)
    browser.close()
print("%d/%d 通過" % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
