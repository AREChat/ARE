import sys, json, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
EXTRA = """
(function(){
 const now = Date.now(); const M = [];
 const mk = (i, sender, content) => ({id:'m'+i, room_id:'r1', sender_id:sender, content, created_at:new Date(now - (20-i)*60000).toISOString(), edited_at:null, expires_at:null, is_auto_reply:false});
 M.push(mk(1,'u1','こんにちは'));
 M.push(mk(2,'u-me','🎬 動画のリンク\\n並んでました.mp4（83.6MB）\\nhttps://drive.google.com/file/d/1T3hDG2aleyh0ak4VidnLeFMyucCx4e1h/view\\n※このリンクは 14日たつと 見られなくなります。'));
 for(let i=3;i<=14;i++) M.push(mk(i, i%2 ? 'u1' : 'u-me', 'メッセージ ' + i));
 window.__fx.tables.messages = M;
})();
"""
OBS = """() => { window.__n = 0; window.__rm = 0; const el = document.querySelector('#messages');
  new MutationObserver(ms => { for(const m of ms){ if(m.type==='childList' && m.target.id === 'messages'){ window.__n++; window.__rm += m.removedNodes.length; } } }).observe(el, {childList:true}); }"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1500)
    n0 = page.evaluate("document.querySelectorAll('#messages .message-row').length")
    check("最初に 14件が表示される", n0 == 14, n0)
    first = page.evaluate("(() => { const a = document.querySelector('#messages .message-row'); a.dataset.keep = '1'; return a.dataset.mid; })()")
    page.evaluate(OBS)
    page.wait_for_timeout(18000)   # 自動更新（8秒ごと）が2回以上走る
    r = page.evaluate("({n: window.__n, rm: window.__rm})")
    check("【点滅の原因】変化がないとき、18秒（自動更新2回）のあいだ メッセージ一覧を作り直さない", r["n"] == 0 and r["rm"] == 0, r)
    check("最初のメッセージの部品が そのまま残っている（作り直されていない）", page.evaluate("!!document.querySelector('#messages .message-row[data-keep=\"1\"]')"))
    lt = page.evaluate("(() => { const a = document.querySelector('#messages .lt-text'); return a ? a.textContent.length : -1; })()")
    print("   動画リンクのプレビュー文字数:", lt)
    # 新しいメッセージが来たら、次の自動更新で ちゃんと出る
    page.evaluate("window.__fx.tables.messages.push({id:'m99', room_id:'r1', sender_id:'u1', content:'新しいメッセージ', created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false})")
    page.wait_for_timeout(9500)
    check("新しいメッセージが来たら、次の自動更新で表示される", page.evaluate("document.querySelectorAll('#messages .message-row').length") == 15 and "新しいメッセージ" in page.inner_text("#messages"))
    # 内容が変わった（編集された）ときも、反映される
    page.evaluate("(() => { const m = window.__fx.tables.messages.find(x => x.id === 'm3'); m.content = '書きかえました'; m.edited_at = new Date().toISOString(); })()")
    page.wait_for_timeout(9500)
    t = page.inner_text("#messages")
    check("メッセージの内容が変わったら（編集）、次の自動更新で反映される", "書きかえました" in t and "編集済み" in t)
    # 相手が読んだ（既読）が変わったときも、反映される（自分のメッセージの「送信済み→既読」）
    check("自分のメッセージに「送信済み」または「既読」が出ている", ("送信済み" in t) or ("既読" in t))
    # 部屋を切り替えても、前の部屋の中身が残らない
    page.click("#backButton"); page.wait_for_timeout(600)
    page.locator("#roomList > *").filter(has_text="あおい").first.click(); page.wait_for_timeout(1500)
    t2 = page.inner_text("#messages")
    check("別の部屋に切り替えると、その部屋の中身になる（前の部屋が残らない）", "書きかえました" not in t2 and "メッセージ 5" not in t2, t2[:60])
    page.click("#backButton"); page.wait_for_timeout(600)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1500)
    check("戻ると、また表示される", page.evaluate("document.querySelectorAll('#messages .message-row').length") == 15)
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:2])
    # 「入力中」の表示は、点滅（アニメーション）しない
    anim = page.evaluate("""() => { const d = document.createElement('small'); d.className = 'rt-typing'; document.body.appendChild(d); const a = getComputedStyle(d).animationName; d.remove(); return a; }""")
    check("「入力中」の表示は 点滅しない（アニメーションなし）", anim in ("none", ""), anim)
    browser.close()
if srv: srv.terminate()
print("合計", len(res), "失敗", res.count(False))
