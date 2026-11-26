import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
def extra(guest):
    return f"""
window.__fx.rpc.guest_status_me = function(){{ return {{guest:{str(guest).lower()}, remaining:3}}; }};
window.__fx.rpc.guest_delete_me_v1 = function(){{ try{{ localStorage.setItem('__del','1'); }}catch(e){{}} return true; }};
"""
with sync_playwright() as p:
    for guest in (True, False):
        browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=extra(guest))
        page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(3200)
        if guest:
            page.click("#guestBarReg"); page.wait_for_timeout(1500)
            check("お試し：「登録する」を押すと、お試しアカウントが削除される", page.evaluate("()=>localStorage.getItem('__del')") == "1")
            check("お試し：登録画面へ移る", page.url.endswith("/register.html"), page.url[-30:])
        else:
            page.evaluate("()=>window.AREAuth.logout()"); page.wait_for_timeout(800)
            check("ふつうのユーザー：ログアウトしても削除の呼び出しは起きない", page.evaluate("()=>localStorage.getItem('__del')") is None)
        check("画面のエラーなし", not [l for l in logs if l[0]=="pageerror"], logs[:2])
        browser.close()
print("PASS", sum(res), "/", len(res))
