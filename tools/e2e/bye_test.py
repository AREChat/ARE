import sys, json, base64
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
def b64(o): return base64.urlsafe_b64encode(json.dumps(o, ensure_ascii=False).encode()).decode().rstrip("=")
def jwt(meta): return b64({"alg":"HS256"}) + "." + b64({"sub":"u-me","user_metadata":meta}) + ".sig"
def extra(token, status_guest):
    return f"""
window.__fx.rpc.guest_status_me = function(){{ return {{guest:{str(status_guest).lower()}, remaining:3}}; }};
try{{ localStorage.setItem('sb-kzrrnuzzvwijujhlbtln-auth-token', JSON.stringify({{access_token:{json.dumps(token)}, refresh_token:'r', expires_at: 9999999999, user:{{id:'u-me'}}}})); }}catch(e){{}}
(function(){{ const OB = window.Blob; window.Blob = class extends OB {{ constructor(p,o){{ super(p,o); this.__t = (p||[]).join(''); }} }};
  navigator.sendBeacon = function(u,d){{ try{{ localStorage.setItem('__bye', JSON.stringify({{u:String(u), type:d.type, body:d.__t}})); }}catch(e){{}} return true; }}; }})();
"""
with sync_playwright() as p:
    cases = [
        ("お試し(札にguest=true)・状態確認はまだ", jwt({"guest": True}), False, True),
        ("お試し(札にguest=true)・状態確認も済み", jwt({"guest": True}), True, True),
        ("ふつうのユーザー(札にguestなし)", jwt({"display_name":"x"}), False, False),
    ]
    for name, tok, st, expect in cases:
        browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=extra(tok, st))
        page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2200)
        page.evaluate("()=>localStorage.removeItem('__bye')")
        page.goto(BASE + "/index.html"); page.wait_for_timeout(700)
        got = page.evaluate("()=>localStorage.getItem('__bye')")
        if expect:
            d = json.loads(got) if got else None
            check(name + "：ページを離れると削除の合図が1回送られる", d is not None and d["u"].endswith("/functions/v1/guest-bye"), got and got[:80])
            check(name + "：単純な送信（text/plain・認証ヘッダーなし）", d and d["type"].startswith("text/plain"), d and d["type"])
            check(name + "：札が入っている", d and json.loads(d["body"]).get("t") == tok)
        else:
            check(name + "：合図は送られない", got is None, got)
        check(name + "：画面のエラーなし", not [l for l in logs if l[0]=="pageerror"], logs[:2])
        browser.close()
print("PASS", sum(res), "/", len(res))
