import sys, json, os, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:420]) if note else ""))
EXTRA = """
window.__fx.tables.messages = [];
window.__fx.rpc.send_message = function(a){ window.__fx.tables.messages.push({id:'mx'+Math.random(), room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return 'ok'; };
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
PNG = __import__("base64").b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
def f(name, mime, buf): return {"name": name, "mimeType": mime, "buffer": buf}
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    st = {"starts": [], "finishes": 0, "puts": 0, "fail": False}
    def gas(route, req):
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        b = json.loads(req.post_data or "{}")
        if b.get("action") == "start":
            st["starts"].append((b.get("name"), b.get("size")))
            if st["fail"]: return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": False, "message": "動画は1本 500MB までです。"}))
            return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": True, "sessionUrl": "https://www.googleapis.com/upload/drive/v3/files?upload_id=T%d" % len(st["starts"]), "retentionDays": 365}))
        st["finishes"] += 1
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": True, "link": "https://drive.google.com/file/d/ID%d/view" % st["finishes"], "retentionDays": 365}))
    def drive(route, req):
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        st["puts"] += 1
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"id": "FILEID%d" % st["puts"]}))
    page.route("https://script.google.com/**", gas); page.route("https://www.googleapis.com/upload/**", drive)
    # 50MB の判定を 1MB に下げて、小さいファイルで「大きい動画」を作る（ほかは本物のまま）
    def bundle(route):
        r = route.fetch(); body = r.text()
        n = body.count("MAX_VIDEO_BYTES=50*1024*1024")
        body = body.replace("MAX_VIDEO_BYTES=50*1024*1024", "MAX_VIDEO_BYTES=1*1024*1024")
        route.fulfill(response=r, body=body, headers={**r.headers, "cache-control": "no-store"})
    page.route(re.compile(r".*/chat\.bundle\.js.*"), bundle)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    page.evaluate("window.driveUploadUrl = () => 'https://script.google.com/macros/s/TEST/exec'")
    page.evaluate("""() => { const c = requireClient(); c.auth.getSession = async () => ({data: {session: {access_token: 'tok', expires_at: Math.floor(Date.now()/1000) + 3000}}, error: null}); }""")
    def sent():
        out = []
        for c in page.evaluate("window.__calls"):
            if c.get("rpc") == "send_message":
                try: out.append(json.loads(c["args"]["p_content"]))
                except Exception: pass
        return out
    def links(): return [m.get("text", "") for m in sent() if "動画のリンク" in m.get("text", "")]
    def reset():
        st["starts"].clear(); st["finishes"] = 0; st["puts"] = 0
        page.evaluate("window.__calls.length = 0")
    def wait_links(n, secs=25):
        for _ in range(secs * 4):
            page.wait_for_timeout(250)
            if len(links()) >= n: break
        page.wait_for_timeout(500)
    print("DEBUG MAX_VIDEO_BYTES =", page.evaluate("MAX_VIDEO_BYTES"), "driveUploadUrl =", page.evaluate("driveUploadUrl()"))
    V1 = b"\0" * 2_000_000; V2 = b"\0" * 3_000_000; V3 = b"\0" * 2_500_000
    # --- A: 📎（写真・動画・ファイルをまぜる）で、大きい動画を2本
    reset()
    page.set_input_files("#fileInput", [f("a.png", "image/png", PNG), f("大1.mp4", "video/mp4", V1), f("メモ.txt", "text/plain", b"hello"), f("大2.mp4", "video/mp4", V2)])
    wait_links(2)
    L = links()
    check("A 📎でまぜて選んだ大きい動画2本：それぞれ別に ドライブへ置く問い合わせが行く（合計ではなく1本ずつの大きさ）", sorted(st["starts"]) == sorted([("大1.mp4", 2_000_000), ("大2.mp4", 3_000_000)]), st["starts"])
    check("A 2本とも、別々のリンクのメッセージになる", len(L) == 2 and any("大1.mp4" in t for t in L) and any("大2.mp4" in t for t in L), L)
    check("A リンクは 1本ずつ（別のリンク）で、大きさも それぞれ", len(L) == 2 and len({re.search(r'https://\S+', t).group(0) for t in L}) == 2, L)
    # --- B: 動画の選択で、大きい動画を3本
    reset()
    page.set_input_files("#videoInput", [f("三1.mp4", "video/mp4", V1), f("三2.mp4", "video/mp4", V2), f("三3.mp4", "video/mp4", V3)])
    wait_links(3)
    print("DEBUG sheet:", page.evaluate("(document.querySelector('#profileModal')||document.body).innerText.slice(0,300)"), "| logs:", logs[-4:], "| calls:", [c.get('rpc') for c in page.evaluate('window.__calls')][:8])
    L = links()
    check("B 動画の選択で3本：3本とも 1本ずつ問い合わせ・リンク化される", len(st["starts"]) == 3 and len(L) == 3, (st["starts"], len(L)))
    # --- C: 📎で 大きい動画3本だけ
    reset()
    page.set_input_files("#fileInput", [f("c1.mp4", "video/mp4", V1), f("c2.mp4", "video/mp4", V2), f("c3.mp4", "video/mp4", V3)])
    wait_links(3)
    L = links()
    check("C 📎で大きい動画3本：3本とも リンク化される", len(st["starts"]) == 3 and len(L) == 3, (st["starts"], len(L)))
    # --- D: やめた直後に新しく選んだ動画は、ちゃんと置かれる（前の列を引きずらない）
    reset()
    page.evaluate("""() => { const mk = (n, sz) => new File([new Uint8Array(sz)], n, {type: 'video/mp4'});
        openVideoLinkSheet(null, '', [{file: mk('やめる1.mp4', 2000000), reason: 'size'}, {file: mk('やめる2.mp4', 2100000), reason: 'size'}]);
        onVideoLinkAction('cancel');
        setTimeout(() => openVideoLinkSheet(null, '', [{file: mk('あと1.mp4', 2200000), reason: 'size'}]), 50); }""")
    page.wait_for_timeout(4000)
    L = links()
    check("D やめた直後に選んだ動画は、置かれてリンクになる（やめた分は出ない）", len(L) >= 1 and any("あと1.mp4" in t for t in L) and not any("やめる" in t for t in L), (L, st["starts"]))
    # --- E: 置けなかった（失敗）あとに、新しく選んだ動画は、前の失敗分に混ざらずに置かれる
    reset(); st["fail"] = True
    page.evaluate("""() => { const mk = (n, sz) => new File([new Uint8Array(sz)], n, {type: 'video/mp4'}); window.__mk = mk; openVideoLinkSheet(null, '', [{file: mk('失敗1.mp4', 2000000), reason: 'size'}]); }""")
    page.wait_for_timeout(2500)
    check("E 置けなかったときは、リンクを貼る画面になる", "リンクで送る" in page.inner_text("#profileModal") or "https://" in page.inner_text("#profileModal"), page.inner_text("#profileModal")[:100])
    st["fail"] = False; st["starts"].clear()
    page.evaluate("openVideoLinkSheet(null, '', [{file: window.__mk('次の1.mp4', 2300000), reason: 'size'}])")
    page.wait_for_timeout(4000)
    L = links()
    check("E 失敗の画面のあとで選んだ動画は、新しく置かれてリンクになる（失敗分をくり返さない）", any("次の1.mp4" in t for t in L) and [n for n, _ in st["starts"]] == ["次の1.mp4"], (L, st["starts"]))
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1] and "[ARE drive upload]" not in l[1]]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
if srv: srv.terminate()
print("合計", len(res), "失敗", res.count(False))
