import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""), flush=True)
BOT = "7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01"
ROOM = "7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02"
WITH_ROOM = """
window.__fx.tables.profiles.push({id:'%s', display_name:'修正依頼', status_message:'x', bio:'x', presence_status:'offline', last_seen_at:null, avatar_url:null, created_at:'2026-11-13T00:00:00Z', updated_at:'2026-11-13T00:00:00Z', read_receipts_enabled:true});
window.__fx.tables.chat_rooms.push({id:'%s', created_at:'2026-11-13T00:00:00Z', suspended_at:null, is_group:true, name:'修正依頼', notice:'みんなの部屋', created_by:'%s'});
window.__fx.tables.chat_room_members.push({room_id:'%s', user_id:'u-me'}, {room_id:'%s', user_id:'%s'});
""" % (BOT, ROOM, BOT, ROOM, ROOM, BOT)
def hasroom(page):
    return page.evaluate("(()=>{const b=document.querySelector('#roomList [data-room-id=\"%s\"]');return b?{first:document.querySelector('#roomList [data-room-id]')===b,name:b.querySelector('strong').textContent,sub:b.querySelector('small').textContent,vis:b.offsetParent!==null,marks:(b.querySelector('.cf-marks')||{}).textContent||''}:null})()" % ROOM)
with sync_playwright() as p:
    # --- 部屋がまだ無いとき：やさしい案内が出る
    browser, ctx, page, logs = new_page(p, width=1100, height=800, touch=False)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2000)
    page.click("[data-tab='more']"); page.wait_for_timeout(500)
    btn = page.locator('[data-tool="fixreq"]')
    check("「その他」に「🛠 修正依頼を送る」ボタンがある", btn.count() == 1 and "修正依頼を送る" in btn.inner_text(), btn.inner_text() if btn.count() else "")
    btn.click(); page.wait_for_timeout(1500)
    body = page.inner_text("body")
    check("部屋が無いときは「準備中」のやさしい案内（エラーにならない）", "準備中" in body)
    errs = [l for l in logs if l[0] == "pageerror"]
    check("画面のエラーなし（準備中のとき）", not errs, errs[:2])
    browser.close()
    # --- 部屋があるとき：いちばん上に固定・開くと見本が入る
    browser, ctx, page, logs = new_page(p, width=1100, height=800, touch=False, extra_fx=WITH_ROOM + """
window.__fx.tables.chat_rooms.push({id:'r-other', created_at:'2026-11-14T00:00:00Z', suspended_at:null, is_group:false, name:null, notice:null, created_by:'u-me'});
window.__fx.tables.chat_room_members.push({room_id:'r-other', user_id:'u-me'}, {room_id:'r-other', user_id:'u-friend'});
""")
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    hr = hasroom(page)
    check("左の一覧に「修正依頼」の部屋がある", hr is not None, hr)
    check("一覧の いちばん上に固定されている（ほかの部屋のほうが新しくても）", hr and hr["first"], hr)
    check("📌 の目印と「直してほしいところを送れます」の説明が出る", hr and "📌" in hr["marks"] and "直してほしいところを送れます" in hr["sub"], hr)
    # 並べ替えを「名前順」「登録順」にしても、絞り込みを「📌固定」にしても、いちばん上・見えたまま
    for sort in ["name", "created", "fav", "recent"]:
        page.evaluate("(s)=>{cf.folders.sort=s; cfPaintRooms(); renderRooms();}", sort)
        hr = hasroom(page)
        check("並び順「%s」でも いちばん上のまま" % sort, hr and hr["first"] and hr["vis"], hr)
    page.evaluate("()=>{cf.folders.pins=['r-other']; cf.folders.filter='pin'; cfPaintRooms(); renderRooms();}")
    hr = hasroom(page)
    check("絞り込みが「固定」だけでも 見える・いちばん上", hr and hr["first"] and hr["vis"], hr)
    page.evaluate("()=>{cf.folders.filter='all'; cf.folders.pins=[]; cfPaintRooms();}")
    page.click("[data-tab='more']"); page.wait_for_timeout(500)
    page.locator('[data-tool="fixreq"]').click(); page.wait_for_timeout(2500)
    title = page.inner_text("#chatTitle")
    check("チャットの上に「修正依頼」と出る", "修正依頼" in title, title)
    cur = page.evaluate("state.currentRoom && state.currentRoom.id")
    check("共通の部屋（固定の番号）が開く", cur == ROOM, cur)
    val = page.input_value("#messageInput")
    check("入力欄に書きかたの見本が入る", "【修正依頼】" in val and "どうしてほしい" in val, val[:40].replace("\n", "/"))
    page.fill("#messageInput", "自分の文"); page.click("[data-tab='more']"); page.wait_for_timeout(300)
    page.locator('[data-tool="fixreq"]').click(); page.wait_for_timeout(1800)
    check("すでに書いてある文は 消さない", "自分の文" in page.input_value("#messageInput"), page.input_value("#messageInput")[:30])
    # グループ情報：退出ボタンが出ない
    page.evaluate("()=>{ if(typeof openGroupInfo==='function') openGroupInfo(); }"); page.wait_for_timeout(1500)
    sheet = page.inner_text("body")
    check("この部屋は「退出」できない（退出ボタンが無い・案内が出る）", ("グループを退出" not in sheet) and "退出できません" in sheet, "")
    errs = [l for l in logs if l[0] == "pageerror"]; fe = page.evaluate("window.__fakeErrors || []")
    check("画面のエラーなし（開いたとき）", not errs and not fe, (errs[:2], fe[:2]))
    page.screenshot(path="/tmp/r3/zt/fixreq.png")
    browser.close()
print("合計", len(res), "失敗", res.count(False))
