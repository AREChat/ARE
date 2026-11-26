import sys, json, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:400]) if note else ""))
EXTRA = """
window.__fx.tables.messages = [];
window.__fx.rpc.send_message = function(a){ window.__fx.tables.messages.push({id:'mx'+Math.random(), room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return 'ok'; };
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    state = {"gas": [], "puts": 0, "reject_old_on": None}
    def gas(route, req):
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        b = json.loads(req.post_data or "{}"); state["gas"].append((b.get("action"), b.get("token")))
        if state["reject_old_on"] == b.get("action") and b.get("token") == "old":
            return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": False, "message": "ログインが確認できません。もう一度ログインしてください。"}))
        if b.get("action") == "start": return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": True, "sessionUrl": "https://www.googleapis.com/upload/drive/v3/files?upload_id=TEST", "retentionDays": 14}))
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": True, "link": "https://drive.google.com/file/d/ABC/view", "retentionDays": 14}))
    def drive(route, req):
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        state["puts"] += 1
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"id": "FILEID"}))
    page.route("https://script.google.com/**", gas); page.route("https://www.googleapis.com/upload/**", drive)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    page.evaluate("""() => { window.__T = {sess: null, refreshed: 0}; const c = requireClient();
      c.auth.getSession = async () => ({data: {session: window.__T.sess}, error: null});
      c.auth.refreshSession = async () => { window.__T.refreshed++; window.__T.sess = {access_token: 'new', expires_at: Math.floor(Date.now()/1000) + 3600}; return {data: {session: window.__T.sess}, error: null}; };
      window.driveUploadUrl = () => 'https://script.google.com/macros/s/TEST/exec'; }""")
    def sent():
        out = []
        for c in page.evaluate("window.__calls"):
            if c.get("rpc") == "send_message":
                try: out.append(json.loads(c["args"]["p_content"]))
                except Exception: out.append({"text": c["args"]["p_content"]})
        return out
    def one(exp, reject):
        state["gas"].clear(); state["puts"] = 0; state["reject_old_on"] = reject
        page.evaluate("window.__calls.length = 0")
        page.evaluate("""(exp) => { window.__T.refreshed = 0; window.__T.sess = {access_token: 'old', expires_at: Math.floor(Date.now()/1000) + exp};
            const f = new File([new Uint8Array(300000)], '大きい動画.mp4', {type: 'video/mp4'}); openVideoLinkSheet(null, '', [{file: f, reason: 'size'}]); }""", exp)
        for _ in range(40):
            page.wait_for_timeout(300)
            if sent(): break
        page.wait_for_timeout(300)
        return sent()
    s = one(3600, None)
    check("ふつうに通る：ドライブに置いて、リンクのメッセージが送られる", len(s) == 1 and "drive.google.com" in json.dumps(s, ensure_ascii=False) and state["puts"] >= 1, (s, state))
    check("このとき ログイン更新はしない（start と finish は 同じトークン）", [a for a, _ in state["gas"]] == ["start", "finish"] and {t for _, t in state["gas"]} == {"old"}, state["gas"])
    s = one(30, None)
    check("期限が近い：先に更新して、新しいトークンで start・finish とも通る", len(s) == 1 and [a for a, _ in state["gas"]] == ["start", "finish"] and {t for _, t in state["gas"]} == {"new"}, (s, state["gas"]))
    # 今回の不具合の再現：アップロード中に期限が切れ、最後の finish で「ログインが確認できません」と断られる
    s = one(3600, "finish")
    check("【今回の不具合】finish で「ログインが確認できません」と断られても、更新して やり直し、リンクが送られる（もう一度アップロードしなくていい）", len(s) == 1 and "drive.google.com" in json.dumps(s, ensure_ascii=False) and [a for a, _ in state["gas"]] == ["start", "finish", "finish"] and state["gas"][-1][1] == "new" and state["puts"] >= 1, (s, state))
    check("ドライブへの送信は 1回分だけ（やり直しで 重ねて送らない）", state["puts"] == 1, state["puts"])
    s = one(3600, "start")
    check("start で断られても 更新してやり直し、最後まで送れる", len(s) == 1 and state["gas"][0] == ("start", "old") and state["gas"][1] == ("start", "new"), (s, state["gas"]))
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
if srv: srv.terminate()
print("合計", len(res), "失敗", res.count(False))
