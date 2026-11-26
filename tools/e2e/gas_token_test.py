import sys, json, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:400]) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx="window.__fx.tables.messages=[];")
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    # 偽のログイン（トークン）と、偽のGAS（ドライブの受け口）を用意する
    page.evaluate("""() => {
      window.__T = {sess: null, refreshed: 0, refreshFail: false, calls: [], gas: null};
      const c = requireClient();
      c.auth.getSession = async () => ({data: {session: window.__T.sess}, error: null});
      c.auth.refreshSession = async () => { window.__T.refreshed++; if(window.__T.refreshFail) throw new Error('x'); window.__T.sess = {access_token: 'new', expires_at: Math.floor(Date.now()/1000) + 3600}; return {data: {session: window.__T.sess}, error: null}; };
      window.driveUploadUrl = () => 'https://script.google.com/macros/s/TEST/exec';
      const of = window.fetch;
      window.fetch = async (u, o) => { if(String(u).indexOf("script.google.com") < 0) return of.apply(this, arguments);
        const b = JSON.parse(o.body); window.__T.calls.push(b.token); const r = window.__T.gas(b);
        return {json: async () => r}; };
    }""")
    def run(sess_token, expires_in, gas_js, refresh_fail=False):
        return page.evaluate("""async ([tok, exp, gas, rf]) => { const T = window.__T; T.refreshed = 0; T.calls = []; T.refreshFail = rf;
            T.sess = {access_token: tok, expires_at: Math.floor(Date.now()/1000) + exp}; T.gas = eval(gas);
            try{ const j = await gasCall({action: 'start'}); return {ok: true, j, calls: T.calls, refreshed: T.refreshed}; }
            catch(e){ return {ok: false, msg: String(e.message), calls: T.calls, refreshed: T.refreshed}; } }""", [sess_token, expires_in, gas_js, refresh_fail])
    OKG = "(b) => ({ok: true, sessionUrl: 'u', t: b.token})"
    r = run("old", 3600, OKG)
    check("ふつう：期限に余裕があれば 更新せず、そのまま1回で通る", r["ok"] and r["calls"] == ["old"] and r["refreshed"] == 0, r)
    r = run("old", 10, OKG)
    check("期限が5分以内：先に更新して、新しいトークンで送る（更新1回・送信1回）", r["ok"] and r["calls"] == ["new"] and r["refreshed"] == 1, r)
    r = run("old", -30, OKG)
    check("期限が すでに切れている：先に更新して送る", r["ok"] and r["calls"] == ["new"], r)
    # 画面の時計がずれていて、まだ余裕があると思っていたが、サーバーは期限切れと言ってきた（今回の不具合そのもの）
    r = run("old", 3600, "(b) => b.token === 'old' ? ({ok: false, message: 'ログインが確認できません。もう一度ログインしてください。'}) : ({ok: true, sessionUrl: 'u'})")
    check("「ログインが確認できません」と返ってきたら、更新して 1回だけやり直し、成功する", r["ok"] and r["calls"] == ["old", "new"] and r["refreshed"] == 1, r)
    r = run("old", 3600, "(b) => ({ok: false, message: 'ログインが確認できません。もう一度ログインしてください。'})")
    check("それでもだめなら、やり直しは1回だけ（無限にくり返さない）。理由は そのまま出る", (not r["ok"]) and len(r["calls"]) == 2 and "ログインが確認できません" in r["msg"], r)
    r = run("old", 3600, "(b) => ({ok: false, message: '動画の置き場所が いっぱいです。'})")
    check("ログイン以外のエラーでは やり直さない（1回だけ送る）", (not r["ok"]) and len(r["calls"]) == 1 and "いっぱい" in r["msg"], r)
    r = run("old", 10, OKG, refresh_fail=True)
    check("更新に失敗しても、いまのトークンで送ってみる（止まらない）", r["ok"] and r["calls"] == ["old"], r)
    r = page.evaluate("""async () => { const T = window.__T; T.calls = []; T.sess = null; T.gas = () => ({ok: true}); T.refreshFail = true;
        try{ await gasCall({action: 'start'}); return {ok: true}; }catch(e){ return {ok: false, msg: String(e.message), calls: T.calls}; } }""")
    check("ログインしていないときは、通信せずに「ログインし直して」と案内する", (not r["ok"]) and r["calls"] == [] and "ログイン" in r["msg"], r)
    # 動画のアップロード（Supabaseの保存先へ）も、先にトークンを更新する
    r = page.evaluate("""async () => { const T = window.__T; T.refreshed = 0; T.refreshFail = false; T.sess = {access_token: 'old', expires_at: Math.floor(Date.now()/1000) + 20};
        const t = await freshAccessToken(requireClient()); return {t, refreshed: T.refreshed}; }""")
    check("freshAccessToken：期限が近いと更新して新しいトークンを返す", r["t"] == "new" and r["refreshed"] == 1, r)
    r = page.evaluate("""async () => { const T = window.__T; T.refreshed = 0; T.sess = {access_token: 'old', expires_at: Math.floor(Date.now()/1000) + 20}; const t = await freshAccessToken(requireClient(), false); T.sess = {access_token: 'ok', expires_at: Math.floor(Date.now()/1000) + 3000}; const t2 = await freshAccessToken(requireClient(), false); return {t, t2, refreshed: T.refreshed}; }""")
    check("freshAccessToken：余裕があれば更新しない", r["t2"] == "ok" and r["refreshed"] == 1, r)
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
if srv: srv.terminate()
print("合計", len(res), "失敗", res.count(False))
