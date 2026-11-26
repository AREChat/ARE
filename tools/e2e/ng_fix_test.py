import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""), flush=True)
BOT = "7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01"; ROOM = "7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02"
ng = json.load(open("/home/claude/r3/AREDA/NG.json", encoding="utf-8"))["words"]
BAD = next(w for w in ng if len(w) >= 3 and w.isascii() is False)
FX = """
window.__fx.tables.profiles.push({id:'%s', display_name:'修正依頼', status_message:'x', bio:'x', presence_status:'offline', last_seen_at:null, avatar_url:null, created_at:'2026-11-13T00:00:00Z', updated_at:'2026-11-13T00:00:00Z', read_receipts_enabled:true});
window.__fx.tables.chat_rooms.push({id:'%s', created_at:'2026-11-13T00:00:00Z', suspended_at:null, is_group:true, name:'修正依頼', notice:'x', created_by:'%s'});
window.__fx.tables.chat_room_members.push({room_id:'%s', user_id:'u-me'}, {room_id:'%s', user_id:'%s'});
window.__fx.tables.chat_rooms.push({id:'r-other', created_at:'2026-11-14T00:00:00Z', suspended_at:null, is_group:false, name:null, notice:null, created_by:'u-me'});
window.__fx.tables.chat_room_members.push({room_id:'r-other', user_id:'u-me'}, {room_id:'r-other', user_id:'u-friend'});
window.__fx.tables.profiles.push({id:'u-friend', display_name:'ともだち', status_message:'', bio:'', presence_status:'offline', last_seen_at:null, avatar_url:null, created_at:'2026-11-13T00:00:00Z', updated_at:'2026-11-13T00:00:00Z', read_receipts_enabled:true});
""" % (BOT, ROOM, BOT, ROOM, ROOM, BOT)
RPC_OK = "window.__fx.rpc.ng_report_fixreq_v1 = function(a){ return {ok:true, pending_erase:true, strikes:11, deleted:0}; }; window.__fx.rpc.ng_report = function(a){ return {strikes:1, points:0}; };"
RPC_OLD = "window.__fx.rpc.ng_report = function(a){ return {strikes:1, points:0}; };"
def calls(page): return page.evaluate("(window.__calls||[]).map(c=>c.rpc)")
def sends(page): return page.evaluate("(window.__calls||[]).filter(c=>/send|insert/i.test(c.rpc||'')||(c.table==='messages'&&c.op==='insert')).length")
def openroom(page, rid):
    page.evaluate("(id)=>{const r=state.rooms.find(x=>x.id===id); selectRoom(r, r.partner||null);}", rid); page.wait_for_timeout(1500)
with sync_playwright() as p:
    # 1) 修正依頼の部屋：禁止用語 → すぐウイルス画面
    browser, ctx, page, logs = new_page(p, width=1100, height=800, touch=False, extra_fx=FX + RPC_OK)
    navs = []; page.on("framenavigated", lambda f: navs.append(f.url) if f == page.main_frame else None)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    openroom(page, ROOM)
    page.evaluate("window.__rpcLog = []; const o = window.__fx.rpc.ng_report_fixreq_v1; window.__fx.rpc.ng_report_fixreq_v1 = function(a){ try{ sessionStorage.setItem('fxcall', JSON.stringify(a)); }catch(e){} return o(a); };")
    # 見本の文だけでは 反応しない
    page.evaluate("document.getElementById('messageInput').value='【修正依頼】\\nどこで（画面・ゲーム名）：\\nどうなった：\\nどうしてほしい：\\n'")
    check("見本の文は 禁止用語にならない", page.evaluate("ngCheck(document.getElementById('messageInput').value)") is None)
    page.fill("#messageInput", "ここが変です " + BAD + " 直して")
    page.press("#messageInput", "Enter"); page.wait_for_timeout(2500)
    arg = None
    try: arg = json.loads(page.evaluate("sessionStorage.getItem('fxcall')") or "null")
    except Exception as e: arg = None
    check("修正依頼の部屋：専用の申告 ng_report_fixreq_v1 が呼ばれる", arg is not None, arg)
    check("すぐウイルス画面（virus.html）へ移る", any("virus.html" in u for u in navs), navs)
    check("申告に 検知した言葉と本文が入る", arg and arg.get("p_matched") and "ここが変です" in (arg.get("p_text") or ""), arg)
    check("ふつうの10回制の申告（ng_report）は呼ばれていない", not page.evaluate("(window.__calls||[]).some(c=>c.rpc==='ng_report')"))
    browser.close()
    # 2) ほかの部屋：今までどおり（ウイルス画面には行かない）
    browser, ctx, page, logs = new_page(p, width=1100, height=800, touch=False, extra_fx=FX + RPC_OK)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    openroom(page, "r-other")
    page.fill("#messageInput", "ここが変です " + BAD + " 直して"); page.press("#messageInput", "Enter"); page.wait_for_timeout(2000)
    c = calls(page)
    check("ふつうの部屋：今までの申告（ng_report）になる", "ng_report" in c and "ng_report_fixreq_v1" not in c, c)
    check("ふつうの部屋：ウイルス画面には行かない（警告だけ）", "virus.html" not in page.url and page.locator("#ngWarn").count() == 1, page.url)
    browser.close()
    # 3) 修正依頼の部屋でも、サーバーの準備がまだ（関数なし）なら 今までの申告にもどる・画面は壊れない
    browser, ctx, page, logs = new_page(p, width=1100, height=800, touch=False, extra_fx=FX + RPC_OLD)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    openroom(page, ROOM)
    page.fill("#messageInput", "ここが変です " + BAD + " 直して"); page.press("#messageInput", "Enter"); page.wait_for_timeout(2500)
    c = calls(page)
    check("関数が まだ無いときは 今までの申告にもどる", "ng_report" in c, c)
    check("そのとき画面が壊れない（警告が出る・エラーなし）", page.locator("#ngWarn").count() == 1 and not [l for l in logs if l[0] == "pageerror"], [l for l in logs if l[0] == "pageerror"][:2])
    # ふつうの依頼文は 送れる（禁止用語なし）
    page.evaluate("document.getElementById('ngWarn') && (document.getElementById('ngWarn').hidden = true)")
    page.fill("#messageInput", "ゲームの家の屋根がゆがんで見えます。直してください。")
    before = len(page.evaluate("window.__calls||[]")); page.press("#messageInput", "Enter"); page.wait_for_timeout(1500)
    c2 = calls(page)[before:]
    check("ふつうの依頼文は 禁止用語として扱われない（申告が呼ばれない）", "ng_report_fixreq_v1" not in c2 and "ng_report" not in c2, c2)
    browser.close()
print("合計", len(res), "失敗", res.count(False))
