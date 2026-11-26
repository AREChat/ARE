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
 {id:'m3', room_id:'r2', sender_id:'u2', content:'c', created_at:'2026-11-20T03:00:00Z', edited_at:null, expires_at:null, is_auto_reply:false}
];
window.__reads = [];
window.__fx.rpc.get_my_reads = function(){ return window.__reads; };
"""
def seen(ids): 
    return "try{ localStorage.setItem('are_seen_u-me', JSON.stringify({r1:'2026-11-21T00:00:00.000Z', r2:'2026-11-21T00:00:00.000Z'})); localStorage.setItem('are_hidden_rooms_u-me', JSON.stringify(%s)); }catch(e){}" % json.dumps(ids)
def badge(page, rid):
    return page.evaluate("(id)=>{const b=document.querySelector('#roomList [data-room-id=\"'+id+'\"] .nf-badge');return b?b.textContent:''}", rid)
def hidden(page, rid):
    return page.evaluate("(id)=>{const b=document.querySelector('#roomList [data-room-id=\"'+id+'\"]');return b?getComputedStyle(b).display==='none':null}", rid)
def popup(page): return page.evaluate("()=>{const p=document.querySelector('.nf-pop');return p?p.textContent:''}")
def newmsg(page, rid, sender, mid, t="2026-11-23T01:00:00Z"):
    page.evaluate("([rid,s,mid,t])=>{ const m={id:mid, room_id:rid, sender_id:s, content:'hello', created_at:t, edited_at:null, expires_at:null, is_auto_reply:false}; window.__fx.tables.messages.push(m); window.__emit('are-inbox','postgres_changes',{new:m}); }", [rid, sender, mid, t])
    page.wait_for_timeout(800)
with sync_playwright() as p:
    # A: r1 を非表示。別の端末が r2 を読む／r1 を読む → 非表示の r1 も既読として同期される
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + seen(["r1"]))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    check("A0 r1 は非表示になっている", hidden(page,"r1") is True, hidden(page,"r1"))
    newmsg(page,"r1","u1","n1")
    check("A1 非表示の r1 に新着 → 一覧に戻る（見逃さない）", hidden(page,"r1") is False, hidden(page,"r1"))
    check("A2 未読バッジが 1", badge(page,"r1") == "1", badge(page,"r1"))
    # 別の端末で r1 を読んだ → 消える
    page.evaluate("()=>{window.__reads=[{room_id:'r1', last_read_at:'2026-11-23T02:00:00Z'}];}")
    page.evaluate("()=>nfSyncReads()"); page.wait_for_timeout(1200)
    check("A3 別の端末で読んだら r1 の未読が消える", badge(page,"r1") == "", badge(page,"r1"))
    # 非表示にした直後：サーバーへ「読んだ」と伝え、別端末の既読が 非表示の部屋にも届く
    page.evaluate("()=>{window.__calls.length=0; hrHide('r2');}"); page.wait_for_timeout(500)
    calls = page.evaluate("()=>window.__calls.filter(c=>c.rpc==='mark_room_read').map(c=>c.args.p_room_id)")
    check("A4 非表示にしたとき、サーバーにも読んだと記録", "r2" in calls, calls)
    # 非表示の r2 に、別の端末が読んだ時刻を通知（realtime）しても、問題なく反映
    newmsg(page,"r2","u2","n2","2026-11-23T03:00:00Z")
    check("A5 非表示の r2 に新着 → 戻る", hidden(page,"r2") is False, hidden(page,"r2"))
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r2',user_id:'u-me',last_read_at:'2026-11-23T04:00:00Z'}})"); page.wait_for_timeout(1200)
    check("A6 別の端末が読んだ通知で r2 の未読が消える", badge(page,"r2") == "", badge(page,"r2"))
    browser.close()

    # B: ブロック・ミュートした相手の新着では、ポップアップを出さない
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + seen([]))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    page.evaluate("()=>{feat.blocks.set('u1','block'); feat.blocks.set('u2','mute');}")
    newmsg(page,"r1","u1","b1")
    check("B1 ブロックした相手の新着でポップアップが出ない", popup(page) == "", popup(page))
    newmsg(page,"r2","u2","b2")
    check("B2 ミュートした相手の新着でポップアップが出ない", popup(page) == "", popup(page))
    page.evaluate("()=>{feat.blocks.delete('u1');}")
    newmsg(page,"r1","u1","b3")
    check("B3 ブロックを外した相手の新着では、ポップアップが出る", "みどり" in popup(page), popup(page))
    browser.close()

    # C: ブラウザ通知とサーバー通知の二重
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + seen([]))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    tags = page.evaluate("""()=>{ window.__nt=[]; window.Notification = function(t,o){ window.__nt.push(o&&o.tag); this.close=function(){}; }; window.Notification.permission='granted'; Object.defineProperty(document,'hidden',{get:()=>true,configurable:true}); return 1; }""")
    newmsg(page,"r1","u1","c1")
    nt = page.evaluate("()=>window.__nt")
    check("C1 ブラウザ通知のタグが、サーバー通知と同じ（room-部屋ID）で、二重にならない", nt == ["room-r1"], nt)
    browser.close()

    # D: 別の端末で読んだら、この端末のポップアップも消える（ほかの部屋のポップアップは残る）
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=MSGS + seen([]))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    newmsg(page,"r1","u1","d1")
    check("D1 新着でポップアップが出る", "みどり" in popup(page), popup(page))
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r2',user_id:'u-me',last_read_at:'2026-11-23T05:00:00Z'}})"); page.wait_for_timeout(600)
    check("D2 別の部屋（r2）を読んだ通知では、r1 のポップアップは残る", "みどり" in popup(page), popup(page))
    page.evaluate("()=>window.__emit('are-reads','postgres_changes',{new:{room_id:'r1',user_id:'u-me',last_read_at:'2026-11-23T05:00:00Z'}})"); page.wait_for_timeout(600)
    check("D3 別の端末で r1 を読んだら、r1 のポップアップも消える", popup(page) == "", popup(page))
    check("D4 画面のエラーなし", not [l for l in logs if l[0]=="pageerror"], logs[:3])
    browser.close()
print("PASS", sum(res), "/", len(res))
