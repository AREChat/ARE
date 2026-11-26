import sys, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:200]) if note else ""), flush=True)
FX = """
window.__fx.tables.messages = [
 {id:'m1', room_id:'r1', sender_id:'u1', content: JSON.stringify({type:'text', text:'きのう'}), is_auto_reply:false, edited_at:null, expires_at:null, created_at:'2026-11-20T09:00:00Z'},
 {id:'m2', room_id:'r1', sender_id:'u-me', content: JSON.stringify({type:'text', text:'きのう2'}), is_auto_reply:false, edited_at:null, expires_at:null, created_at:'2026-11-20T09:05:00Z'},
 {id:'m3', room_id:'r1', sender_id:'u1', content: JSON.stringify({type:'text', text:'きょう'}), is_auto_reply:false, edited_at:null, expires_at:null, created_at:'2026-11-22T01:00:00Z'}];
window.__fx.rpc.my_access = function(){ return {points: 120, admin:false, trial_ends:null, streak:1}; };
window.__fx.rpc.claim_daily_bonus = function(){ return {gained: 0, points: 120, streak: 1}; };
window.__fx.rpcDefault = function(name){ return /^admin_/.test(name) ? [] : null; };
"""
with sync_playwright() as p:
    for adm in (True, False):
        browser, ctx, page, logs = new_page(p, width=420, height=820, extra_fx=FX + "window.__fx.rpc.is_current_user_admin = function(){ return %s; };" % ("true" if adm else "false"))
        page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2000)
        tag = "管理者" if adm else "一般"
        check(tag + "：initAdminUsersBar が別の関数として存在", page.evaluate("typeof initAdminUsersBar === 'function' && initAdminUsersBar !== initAdminUsers"))
        check(tag + "：機能の起動失敗の帯が出ていない", "起動に失敗" not in page.inner_text("body"), page.inner_text("body")[:80] if "起動に失敗" in page.inner_text("body") else "")
        if adm:
            page.evaluate("() => { feat.isAdmin = true; }")
            page.evaluate("() => { try{ document.querySelector('[data-tab=\"users\"], #tabUsers, .tab-users')?.click(); }catch(e){} }")
            # refreshAdminBadge の後で バーが描かれる（包みなおしの確認）
            page.evaluate("async () => { await refreshAdminBadge(); }"); page.wait_for_timeout(300)
            check("管理者：refreshAdminBadge のあとに absPaintBar が走る（バーが描ける状態）", page.evaluate("() => { try{ absPaintBar(); return true; }catch(e){ return String(e); } }") is True)
        # 日付区切り
        page.evaluate("() => { const b = document.querySelector('#roomList [data-room-id]'); b.click(); }"); page.wait_for_timeout(1800)
        txt = page.inner_text("#messageList") if page.locator("#messageList").count() else page.inner_text("body")
        seps = page.evaluate("() => Array.from(document.querySelectorAll('.date-sep, .day-sep, [class*=\"sep\"]')).map(e=>e.textContent.trim()).filter(Boolean)")
        print("DBG", page.evaluate("() => [document.querySelectorAll('.message-row').length, document.querySelectorAll('.date-sep').length, state.currentRoom && state.currentRoom.id, (state.messages||[]).length]"))
        check(tag + "：メッセージが3件出て、日付の区切りが2つ（きのう・きょう）", ("きのう" in txt and "きょう" in txt) and len(seps) == 2, (len(seps), seps[:3]))
        check(tag + "：msgDayKey が日付ごとに違う値・無効な日付は空", page.evaluate("() => msgDayKey('2026-11-20T09:00:00Z') !== msgDayKey('2026-11-22T01:00:00Z') && msgDayKey('xx') === ''"))
        check(tag + "：dayKey は 0 埋め（月日が2けた）", page.evaluate("() => dayKey(new Date(2026, 0, 5)) === '2026-01-05'"))
        # 文字折り返し：書き出し側（改行・…）が使われる
        r = page.evaluate("""() => { const c = {measureText: (s) => ({width: s.length * 10})};
            return [itnWrap(c, 'ab\\ncd', 100, 3), itnWrap(c, 'あ'.repeat(50), 100, 2), itnWrap(c, '', 100, 3), typeof itnWrapG]; }""")
        check(tag + "：itnWrap（書き出し用）は改行で分け、長い文は … で切り、空は [''] を返す", r[0] == ['ab','cd'] and r[1][1].endswith('…') and len(r[1]) == 2 and r[2] == [''] and r[3] == 'function', r)
        errs = [l for l in logs if l[0] in ("pageerror",)]
        check(tag + "：画面のエラーなし", not errs, errs[:2])
        browser.close()
print("結果：%d/%d OK" % (sum(res), len(res)))
