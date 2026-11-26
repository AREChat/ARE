import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
MSGS = """
window.__fx.tables.messages = [
 {id:'m1', room_id:'r1', sender_id:'u1', content:'a', created_at:'2026-11-20T01:00:00Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m2', room_id:'r1', sender_id:'u1', content:'b', created_at:'2026-11-20T02:00:00Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m3', room_id:'r2', sender_id:'u2', content:'c', created_at:'2026-11-20T03:00:00Z', edited_at:null, expires_at:null, is_auto_reply:false}
];
window.__reads = [];
window.__fx.rpc.get_my_reads = function(){ return window.__reads; };
"""
SEEN_OLD = "try{ localStorage.setItem('are_seen_u-me', JSON.stringify({r1:'2026-10-01T00:00:00.000Z', r2:'2026-10-01T00:00:00.000Z'})); }catch(e){}"
def badge(page, rid):
    return page.evaluate("(id)=>{const b=document.querySelector('#roomList [data-room-id=\"'+id+'\"] .nf-badge');return b?b.textContent:''}", rid)
with sync_playwright() as p:
    # ① この端末で読んでいない2つの部屋 → 未読が出る。別の端末が r1 を読んだ → 20秒ごとの確認で r1 だけ消える
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + SEEN_OLD)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    check("はじめ：r1 に未読2・r2 に未読1", badge(page,"r1") == "2" and badge(page,"r2") == "1", (badge(page,"r1"), badge(page,"r2")))
    page.evaluate("()=>{window.__reads=[{room_id:'r1', last_read_at:'2026-11-21T00:00:00Z'}];}")
    page.evaluate("()=>nfSyncReads()"); page.wait_for_timeout(1500)
    check("別の端末が r1 を読んだ → r1 の未読が消える", badge(page,"r1") == "", badge(page,"r1"))
    check("別の端末が読んでいない r2 の未読は残る", badge(page,"r2") == "1", badge(page,"r2"))
    check("タブ名が (1) に変わる", page.title().startswith("(1)"), page.title())
    saved = page.evaluate("()=>JSON.parse(localStorage.getItem('are_seen_u-me')||'{}')")
    check("この端末の記録も r1 は進む（再読み込みしても戻らない）", saved.get("r1","") >= "2026-11-21", saved.get("r1"))
    # ② サーバーの変更通知（realtime）で r2 も すぐ消える
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r2',user_id:'u-me',last_read_at:'2026-11-21T01:00:00Z'}})"); page.wait_for_timeout(1500)
    check("変更通知（realtime）で r2 の未読も消える", badge(page,"r2") == "", badge(page,"r2"))
    check("タブ名の (n) も消える", not page.title().startswith("("), page.title())
    # ③ ほかの人の last_read_at の通知は無視する
    page.evaluate("()=>{window.__fx.tables.messages.push({id:'m4', room_id:'r1', sender_id:'u1', content:'d', created_at:'2026-11-22T01:00:00Z', edited_at:null, expires_at:null, is_auto_reply:false}); nfRecount(true);}"); page.wait_for_timeout(1000)
    check("新着（r1）は ふつうに未読として数えられる", badge(page,"r1") == "1", badge(page,"r1"))
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r1',user_id:'u2',last_read_at:'2026-11-23T00:00:00Z'}})"); page.wait_for_timeout(800)
    check("ほかの人の既読の通知では、自分の未読は消えない", badge(page,"r1") == "1", badge(page,"r1"))
    # ④ 別の端末が、読んだあとに来た新着までは読んでいない → 新着だけが残る
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r1',user_id:'u-me',last_read_at:'2026-11-22T00:30:00Z'}})"); page.wait_for_timeout(1200)
    check("読んだ時刻より あとの新着は未読のまま（1件）", badge(page,"r1") == "1", badge(page,"r1"))
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r1',user_id:'u-me',last_read_at:'2026-11-22T02:00:00Z'}})"); page.wait_for_timeout(1200)
    check("読んだ時刻が新着より あとなら消える", badge(page,"r1") == "", badge(page,"r1"))
    # ⑤ 古い時刻の通知では、既読の位置が戻らない
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r1',user_id:'u-me',last_read_at:'2026-11-01T00:00:00Z'}})"); page.wait_for_timeout(600)
    saved = page.evaluate("()=>JSON.parse(localStorage.getItem('are_seen_u-me')||'{}')")
    check("古い時刻の通知で既読の位置が戻らない", saved.get("r1","") >= "2026-11-22T02:00", saved.get("r1"))
    check("画面のエラーなし", not [l for l in logs if l[0]=="pageerror"], logs[:3])
    browser.close()

    # ⑥ 新しい端末（この端末に記録なし）：サーバーの記録があればその続きから数える。記録がない部屋は「いま」から
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + "window.__reads=[{room_id:'r1', last_read_at:'2026-11-20T01:30:00Z'}];")
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    check("新しい端末：サーバーの既読（r1 の 01:30）の続きから 1 件だけ未読", badge(page,"r1") == "1", badge(page,"r1"))
    check("新しい端末：サーバーに記録のない r2 は「いま」から数える（未読なし）", badge(page,"r2") == "", badge(page,"r2"))
    browser.close()

    # ⑦ 通信できなくても（get_my_reads が失敗）今まで通り動く
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + SEEN_OLD + "window.__fx.rpc.get_my_reads = function(){ throw new Error('offline'); };")
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    check("同期に失敗しても、この端末の記録で未読が出る", badge(page,"r1") == "2" and badge(page,"r2") == "1", (badge(page,"r1"), badge(page,"r2")))
    check("同期に失敗しても、画面のエラーなし", not [l for l in logs if l[0]=="pageerror"], logs[:3])
    # ⑧ 部屋を開くと mark_room_read が呼ばれる（ほかの端末へ伝わる）
    page.evaluate("()=>{window.__calls.length=0;}")
    page.locator("#roomList [data-room-id='r1']").first.click(); page.wait_for_timeout(1800)
    calls = page.evaluate("()=>window.__calls.filter(c=>c.rpc==='mark_room_read').map(c=>c.args.p_room_id)")
    check("r1 を開くと、サーバーに「読んだ」が記録される", "r1" in calls, calls)
    check("開いた部屋の未読が消える", badge(page,"r1") == "", badge(page,"r1"))
    browser.close()
print("PASS", sum(res), "/", len(res))
