import sys, json, os, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
os.environ["ARE_SW"] = "block"
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
def f(name, mime, buf): return {"name": name, "mimeType": mime, "buffer": buf}
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    st = {"starts": [], "finishes": 0, "puts": 0, "fail": None}
    def gas(route, req):
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        b = json.loads(req.post_data or "{}")
        if b.get("action") == "start":
            st["starts"].append(b)
            if st["fail"]: return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": False, "message": st["fail"]}))
            return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": True, "sessionUrl": "https://www.googleapis.com/upload/drive/v3/files?upload_id=T%d" % len(st["starts"]), "retentionDays": 365}))
        st["finishes"] += 1
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"ok": True, "link": "https://drive.google.com/file/d/ID%d/view" % st["finishes"], "retentionDays": 365}))
    def drive(route, req):
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
        st["puts"] += 1
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"id": "FILEID%d" % st["puts"]}))
    page.route("https://script.google.com/**", gas); page.route("https://www.googleapis.com/upload/**", drive)
    def bundle(route):
        r = route.fetch(); body = r.text()
        body = body.replace("MAX_VIDEO_BYTES=50*1024*1024", "MAX_VIDEO_BYTES=1*1024*1024").replace("MAX_FILE_BYTES=50*1024*1024", "MAX_FILE_BYTES=1*1024*1024")
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
    def links(word): return [m.get("text", "") for m in sent() if word in m.get("text", "")]
    def reset():
        st["starts"].clear(); st["finishes"] = 0; st["puts"] = 0; st["fail"] = None
        page.evaluate("window.__calls.length = 0")
    def wait_links(word, n, secs=25):
        for _ in range(secs * 4):
            page.wait_for_timeout(250)
            if len(links(word)) >= n: break
        page.wait_for_timeout(500)
    print("DEBUG", page.evaluate("[MAX_FILE_BYTES, MAX_VIDEO_BYTES]"))
    P1 = b"%PDF-1.4\n" + b"\0" * 2_000_000; Z1 = b"PK\x03\x04" + b"\0" * 3_000_000; V1 = b"\0" * 2_500_000
    # A: 大きい PDF と ZIP を 📎 で
    reset()
    page.set_input_files("#fileInput", [f("大きい資料.pdf", "application/pdf", P1), f("まとめ.zip", "application/zip", Z1)])
    wait_links("ファイルのリンク", 2)
    L = links("ファイルのリンク")
    names = sorted((b["name"], b["size"], b.get("kind")) for b in st["starts"])
    check("A 大きいファイル2つ：それぞれ別にドライブへ（kind=file・1つずつの大きさ）", names == sorted([("大きい資料.pdf", len(P1), "file"), ("まとめ.zip", len(Z1), "file")]), names)
    check("A 送るときの種類(mime)が、動画ではなくファイルのまま", sorted(b["mime"] for b in st["starts"]) == ["application/pdf", "application/zip"], [b["mime"] for b in st["starts"]])
    check("A 「📎 ファイルのリンク」が2通、別々のリンク", len(L) == 2 and len({re.search(r'https://\S+', t).group(0) for t in L}) == 2 and all(t.startswith("📎") for t in L), L)
    check("A 動画の言葉（🎬）は出ない", not links("🎬"))
    # B: 小さいファイルは、いつもどおり（リンクにならない）
    reset()
    page.set_input_files("#fileInput", [f("ちいさい.pdf", "application/pdf", b"%PDF-1.4\n" + b"\0" * 500_000)])
    page.wait_for_timeout(2500)
    check("B 1MB以下（本物は50MB以下）のファイルは、ドライブには行かない", len(st["starts"]) == 0, st["starts"])
    # C: 動画とファイルをまぜる：動画は🎬、ファイルは📎
    reset()
    page.set_input_files("#fileInput", [f("大動画.mp4", "video/mp4", V1), f("資料.pdf", "application/pdf", P1)])
    wait_links("ファイルのリンク", 1); wait_links("動画のリンク", 1)
    check("C まぜて選ぶと、動画は「🎬 動画のリンク」、ファイルは「📎 ファイルのリンク」", len(links("動画のリンク")) == 1 and len(links("ファイルのリンク")) == 1 and {b.get("kind") for b in st["starts"]} == {"video", "file"}, ([b.get("kind") for b in st["starts"]], links("動画のリンク"), links("ファイルのリンク")))
    # D: 古い受け口（動画だけ）でことわられたとき：リンクを貼る画面（ファイル用の言葉）に切りかわる
    reset(); st["fail"] = "動画ファイルだけ送れます。"
    page.set_input_files("#fileInput", [f("断られる.pdf", "application/pdf", P1)])
    page.wait_for_timeout(2500)
    sheet = page.evaluate("document.querySelector('#profileSheet').innerText")
    check("D ドライブにことわられたら、ファイル用のリンク貼り付け画面になる", "ファイルをリンクで送る" in sheet and "動画ファイルだけ送れます" in sheet and "ファイルのリンク" in sheet, sheet[:200])
    page.fill("#vlUrl", "https://example.com/doc.pdf"); page.click("[data-t='vlink:send']"); page.wait_for_timeout(1200)
    L = links("ファイルのリンク")
    check("D 貼ったリンクが「📎 ファイルのリンク」として送られる", len(L) == 1 and "https://example.com/doc.pdf" in L[0] and "断られる.pdf" in L[0], L)
    # E: 実行できる種類は、今までどおり先にことわる
    reset()
    page.set_input_files("#fileInput", [f("わな.exe", "application/octet-stream", b"MZ" + b"\0" * 2_000_000)])
    page.wait_for_timeout(1500)
    check("E .exe は大きくても 送れない（ドライブにも行かない）", len(st["starts"]) == 0 and not sent(), (st["starts"], sent()))
    errs = [l for l in logs if "pageerror" in str(l).lower()]
    check("ページのエラーが出ていない", not errs, errs[:2])
    browser.close()
print(f"\n{sum(res)}/{len(res)} 通過")
sys.exit(0 if all(res) else 1)
