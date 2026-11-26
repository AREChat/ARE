import sys, json, os, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
os.environ["ARE_SW"] = "block"
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
EXTRA = """
window.__pk = {has:false, key:null, n:0, uses:0, last:null, missing:false, guest:false, pingResult:{ok:true,matched:2}};
window.__pb = {settings:{ok:true,enabled:true,scope:'everyone',greeting_id:0,mood_id:0}};
const R = window.__fx.rpc;
R.passby_settings_get_v1 = () => Object.assign({}, __pb.settings, {unseen:0});
R.passby_settings_set_v1 = () => ({ok:true});
R.passby_ping_v1 = () => ({ok:true,new:[],today:{meets:0,new_people:0}});
R.passby_inbox_v1 = () => [];
R.passby_stats_v1 = () => ({ok:true,unique:0,meets:0,streak:0,today_meets:0,today_new:0,pieces:[],claims:[]});
R.passby_key_status_v1 = () => { if(__pk.missing) throw {code:'PGRST202', message:'Could not find the function public.passby_key_status_v1'};
    return __pk.has ? {ok:true,has_key:true,created_at:'2026-11-21T01:00:00Z',last_used_at:__pk.last,uses:__pk.uses} : {ok:true,has_key:false}; };
R.passby_key_create_v1 = () => { if(__pk.guest) return {ok:false,error:'guest'}; __pk.n++; __pk.has = true; __pk.key = 'pbk_' + String(__pk.n).repeat(40).slice(0,40).replace(/[^0-9a-f]/g,'a'); return {ok:true,key:__pk.key}; };
R.passby_key_revoke_v1 = () => { __pk.has = false; __pk.key = null; return {ok:true}; };
R.passby_key_ping_v1 = (a) => { __pk.uses++; return __pk.pingResult; };
"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=900, extra_fx=EXTRA)
    ctx.grant_permissions(["geolocation", "clipboard-read", "clipboard-write"]); ctx.set_geolocation({"latitude": 35.0001, "longitude": 135.0001, "accuracy": 20})
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    dialogs = []; page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(5500)
    calls = lambda n: [c for c in page.evaluate("window.__calls") if c.get("rpc") == n]
    page.evaluate("runTool(openPbSettings)"); page.wait_for_timeout(700)
    s = page.inner_text("#profileSheet")
    check("1 設定に『自動でおくる（上級者向け）』のカードが出る", "自動でおくる" in s and "合いかぎ" in s and page.locator("[data-t='pb:keyopen']").count() == 1)
    page.click("[data-t='pb:keyopen']"); page.wait_for_timeout(900)
    s = page.inner_text("#profileSheet")
    check("2 安全の説明・iPhone/Android の手順が出る。合いかぎは まだ無い", "安全のために" in s and "20秒に1回" in s and "iPhone（ショートカット）" in s and "Android（自動化アプリ）" in s and "まだありません" in s and page.locator("#pbKeyBox").count() == 0, s[:160])
    check("3 『合いかぎを作る』ボタンがあり、『無効にする』は まだ出ない", "合いかぎを作る" in s and page.locator("[data-t='pb:keyrevoke']").count() == 0)
    page.screenshot(path="/tmp/pbk_open.png")
    page.click("[data-t='pb:keymake']"); page.wait_for_timeout(1200)
    key = page.input_value("#pbkKey")
    check("4 作ると、サーバーへ依頼が1回行き、合いかぎが画面に出る（pbk_ + 40文字）", len(calls("passby_key_create_v1")) == 1 and re.fullmatch(r"pbk_[0-9a-f]{40}", key), key)
    url = page.input_value("#pbkUrl"); api = page.input_value("#pbkApi")
    cfg = page.evaluate("({u: ARE_CONFIG.supabaseUrl, k: ARE_CONFIG.supabasePublishableKey})")
    check("5 送り先URL と 公開キーが、アプリの設定どおりに出る", url == cfg["u"] + "/rest/v1/rpc/passby_key_ping_v1" and api == cfg["k"] and api.startswith("sb_publishable_"), url)
    check("6 合いかぎ入力欄は読み取り専用（うっかり書きかえない）", page.evaluate("document.getElementById('pbkKey').readOnly") is True)
    check("7 作ったあとは『無効にする』『作りなおす』が出る", page.locator("[data-t='pb:keyrevoke']").count() == 1 and "作りなおす" in page.inner_text("#profileSheet"))
    page.screenshot(path="/tmp/pbk_made.png", full_page=False)
    # コピー
    page.click("[data-t='pb:keycopy'][data-k='key']"); page.wait_for_timeout(400)
    c1 = page.evaluate("navigator.clipboard.readText()")
    page.click("[data-t='pb:keycopy'][data-k='body']"); page.wait_for_timeout(400)
    c2 = page.evaluate("navigator.clipboard.readText()")
    check("8 『コピー』で合いかぎ・本文（JSON ひな形）が取れる", c1 == key and c2 == '{"p_key":"%s","p_lat":緯度,"p_lng":経度}' % key, c2)
    # コピーした知らせは、画面の中で見える（下の吹き出しは、この画面のうしろにかくれていた）
    page.click("[data-t='pb:keycopy'][data-k='body']"); page.wait_for_timeout(300)
    info = page.evaluate("""(() => { const t = document.getElementById('toast') || document.querySelector('.toast'); const r = t.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const b = document.querySelector("[data-t='pb:keycopy'][data-k='body']");
        return {toastOnTop: top === t, btn: b.textContent, st: document.getElementById('pbkSt').textContent}; })()""")
    check("8b コピーすると、押したボタンが『✅ コピーしました』に変わり、画面の中にも知らせが出る", "コピーしました" in info["btn"] and "コピーしました" in info["st"], info)
    check("8c 吹き出しの通知が、この画面（シート）より前に出て、見える", info["toastOnTop"], info)
    page.wait_for_timeout(2500)
    check("8d ボタンの文字は、すこしたつと もとにもどる", page.inner_text("[data-t='pb:keycopy'][data-k='body']") == "本文（JSON）をコピー", page.inner_text("[data-t='pb:keycopy'][data-k='body']"))
    # ふつうのコピーが断られても（権限・古いブラウザ）、別の方法でコピーできる
    page.evaluate("window.__wt = navigator.clipboard.writeText; navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); 0")
    page.click("[data-t='pb:keycopy'][data-k='url']"); page.wait_for_timeout(500)
    c3 = page.evaluate("window.__wt && navigator.clipboard.readText()")
    check("8e writeText が断られても、別の方法でコピーできる", c3 == url and "コピーしました" in page.inner_text("#pbkSt"), (c3, page.inner_text("#pbkSt")))
    page.evaluate("navigator.clipboard.writeText = window.__wt; 0")
    # ためしに送る（ショートカットと同じ入口）
    page.click("[data-t='pb:keytest']"); page.wait_for_timeout(1500)
    pk = calls("passby_key_ping_v1")
    st = page.inner_text("#pbkSt")
    a = pk[-1]["args"] if pk else {}
    check("9 『ためしに送る』：合いかぎ・緯度・経度・ずれ が送られ、人数が出る", a.get("p_key") == key and abs(a.get("p_lat", 0) - 35.0001) < 1e-6 and abs(a.get("p_lng", 0) - 135.0001) < 1e-6 and a.get("p_acc") == 20 and "2人" in st, (a, st))
    page.evaluate("__pk.pingResult = {ok:true,throttled:true,matched:0}"); page.click("[data-t='pb:keytest']"); page.wait_for_timeout(900)
    check("10 すぐ後の2回目は『すこし前に送っていた』と出る（使えてはいる）", "すこし前" in page.inner_text("#pbkSt"), page.inner_text("#pbkSt"))
    page.evaluate("__pk.pingResult = {ok:false,error:'bad_key'}"); page.click("[data-t='pb:keytest']"); page.wait_for_timeout(900)
    check("11 合いかぎが合わないときは、わかりやすい文が出る", "合いません" in page.inner_text("#pbkSt"), page.inner_text("#pbkSt"))
    page.evaluate("__pk.pingResult = {ok:true,matched:0}"); page.click("[data-t='pb:keytest']"); page.wait_for_timeout(900)
    check("12 近くに人がいないときは『いまは すれ違う人は いません』", "いません" in page.inner_text("#pbkSt"), page.inner_text("#pbkSt"))
    # 位置が取れないとき
    ctx.clear_permissions(); ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    # 設定に戻ると、合いかぎは画面から消える（もう見られない）
    page.click("[data-t='pb:settings']"); page.wait_for_timeout(700)
    check("13 設定にもどると、メモリの合いかぎは消える", page.evaluate("pbk.key") == "" and key not in page.evaluate("document.body.innerHTML"))
    page.click("[data-t='pb:keyopen']"); page.wait_for_timeout(900)
    s = page.inner_text("#profileSheet")
    check("14 開きなおすと 合いかぎは見られず、作った日・使った回数だけ出る", page.locator("#pbKeyBox").count() == 0 and "作った日" in s and "使った回数" in s and "まだ使っていません" in s and key not in page.evaluate("document.body.innerHTML"), s[:200])
    dialogs.clear()
    page.click("[data-t='pb:keymake']"); page.wait_for_timeout(1200)
    key2 = page.input_value("#pbkKey")
    check("15 作りなおすときは、確認が出て、新しい合いかぎになる", any("作りなおします" in d for d in dialogs) and key2 != key and len(calls("passby_key_create_v1")) == 2, (dialogs, key2))
    # 有効期限（10分）が過ぎたら、コピーもためしも できない
    page.evaluate("pbk.exp = Date.now() - 1")
    page.click("[data-t='pb:keycopy'][data-k='key']"); page.wait_for_timeout(500)
    tt = page.evaluate("el.toast.textContent")
    check("16 10分たつと、コピーできず『もう見られません。作りなおしてください』と通知される", tt.startswith("もう見られません。作りなおして"), tt)
    # 無効にする
    dialogs.clear()
    page.click("[data-t='pb:keyrevoke']"); page.wait_for_timeout(1200)
    s = page.inner_text("#profileSheet")
    check("17 『無効にする』：確認が出て、サーバーに伝わり、『まだありません』に戻る", any("無効にします" in d for d in dialogs) and len(calls("passby_key_revoke_v1")) == 1 and "まだありません" in s and page.locator("[data-t='pb:keyrevoke']").count() == 0, s[:160])
    # 保存されていない
    ls = page.evaluate("JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage))")
    check("18 合いかぎは localStorage / sessionStorage に保存されない", key not in ls and key2 not in ls and "pbk_" not in ls)
    # ゲスト
    page.evaluate("__pk.guest = true"); page.click("[data-t='pb:keymake']"); page.wait_for_timeout(900)
    tt = page.evaluate("el.toast.textContent")
    check("19 お試し（ゲスト）では作れず、通知でわけが出る", page.locator("#pbKeyBox").count() == 0 and "お試し（ゲスト）では使えません" in tt, tt)
    # サーバー未準備
    page.evaluate("__pk.guest = false; __pk.missing = true"); page.evaluate("runTool(openPbKey)"); page.wait_for_timeout(900)
    s = page.inner_text("#profileSheet")
    check("20 サーバーの準備前は『まだ使えません』で、作るボタンは出ない", "まだ使えません" in s and page.locator("[data-t='pb:keymake']").count() == 0, s[:120])
    page.evaluate("closeSheet()")
    check("21 画面のエラーが出ていない", not errs, errs)
    print("%d/%d 通過" % (sum(res), len(res)))
    browser.close()
sys.exit(0 if all(res) else 1)
