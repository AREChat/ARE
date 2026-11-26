import sys, json, re, os, base64
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
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
WEBM = open("/tmp/imp_fx/tiny.webm", "rb").read()
def f(name, mime, buf=b"hello"): return {"name": name, "mimeType": mime, "buffer": buf}
def sent(page):
    out = []
    for c in page.evaluate("window.__calls"):
        if c.get("rpc") == "send_message":
            try: out.append(json.loads(c["args"]["p_content"]))
            except Exception: pass
    return out
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    def reset():
        page.evaluate("() => { window.__uploads.length = 0; window.__calls.length = 0; }")
    def toasts():
        return page.evaluate("() => (window.__toasts || []).slice()")
    page.evaluate("""() => { window.__toasts = []; const o = window.showToast; window.showToast = function(t){ window.__toasts.push(String(t)); return o && o.apply(this, arguments); }; }""")
    acc = page.evaluate("document.getElementById('fileInput').accept")
    check("📎の選択に 写真・動画も入る（image/*, video/* を受け付ける）", "image/*" in acc.split(",") and "video/*" in acc.split(","), acc[:40])
    check("📎のボタンに「写真・動画もまぜてOK」と書いてある", "まぜてOK" in page.inner_text("label[for=fileInput]"), page.inner_text("label[for=fileInput]"))
    check("📎は 複数選択できる（multiple）", page.evaluate("document.getElementById('fileInput').multiple"))

    # --- 写真・PDF・テキスト・動画・jpg を まぜて 1回で選ぶ
    reset()
    page.set_input_files("#fileInput", [f("メモ.txt", "text/plain"), f("a.png", "image/png", PNG), f("資料.pdf", "application/pdf", b"%PDF-1.4 x"), f("b.jpg", "image/jpeg", PNG), f("c.webm", "video/webm", WEBM)])
    for _ in range(40):
        page.wait_for_timeout(500)
        if len(sent(page)) >= 5: break
    s = sent(page); order = [(x.get("type"), x.get("name")) for x in s]
    check("まぜて5個えらぶ → 5個とも 送られる", len(s) == 5, order)
    check("送る順番は「写真 → 動画 → ファイル」（写真2・動画1・ファイル2）", [t for t, _ in order] == ["image", "image", "video", "file", "file"], order)
    check("写真は 写真として（画像のメッセージ）、PDFとtxtは ファイルとして送られる", [n for t, n in order if t == "file"] == ["資料.pdf", "メモ.txt"] or sorted([n for t, n in order if t == "file"]) == sorted(["資料.pdf", "メモ.txt"]), order)
    ups = page.evaluate("window.__uploads")
    check("アップロードの種類が正しい（image/png・image/jpeg・application/pdf・text/plain。動画は 進み具合つきの別の送り方なので ここには出ない）", sorted((u["type"] or "").split(";")[0] for u in ups) == sorted(["image/png", "image/jpeg", "application/pdf", "text/plain"]), [u["type"] for u in ups])
    check("「5個を 順番に送ります」と知らせる", any("5個を 順番に送ります" in t for t in toasts()), toasts()[-3:])
    check("送ったあと、選択欄が空に戻る（同じファイルを また選べる）", page.evaluate("document.getElementById('fileInput').value") == "")

    # --- 写真が11枚（上限10）→ 1つも送らず、わかりやすい知らせ
    reset(); page.evaluate("window.__toasts.length = 0")
    page.set_input_files("#fileInput", [f(f"p{i}.png", "image/png", PNG) for i in range(11)] + [f("x.txt", "text/plain")]); page.wait_for_timeout(1200)
    check("写真が11枚まじると 1つも送らず「最大10枚」と知らせる", len(sent(page)) == 0 and any("最大10枚" in t for t in toasts()), (len(sent(page)), toasts()[-2:]))
    # --- 動画が6本（上限5）
    reset(); page.evaluate("window.__toasts.length = 0")
    page.set_input_files("#fileInput", [f(f"v{i}.webm", "video/webm", WEBM) for i in range(6)]); page.wait_for_timeout(1200)
    check("動画が6本だと 1つも送らず「最大5本」と知らせる", len(sent(page)) == 0 and any("最大5本" in t for t in toasts()), (len(sent(page)), toasts()[-2:]))
    # --- 送れない種類（exe・svg）が まじっている → 1つも送らない
    reset(); page.evaluate("window.__toasts.length = 0")
    page.set_input_files("#fileInput", [f("a.png", "image/png", PNG), f("ok.txt", "text/plain"), f("evil.exe", "application/x-msdownload", b"MZ")]); page.wait_for_timeout(1200)
    check("exe がまじっていると 写真もふくめて 1つも送らず、どれがだめか知らせる", len(sent(page)) == 0 and any("evil.exe" in t for t in toasts()), (len(sent(page)), toasts()[-1:]))
    reset(); page.evaluate("window.__toasts.length = 0")
    page.set_input_files("#fileInput", [f("a.png", "image/png", PNG), f("pic.svg", "image/svg+xml", b"<svg/>")]); page.wait_for_timeout(1200)
    check("svg（安全のため不可）がまじっていると 1つも送らない", len(sent(page)) == 0 and any("svg" in t for t in toasts()), (len(sent(page)), toasts()[-1:]))
    # --- 写真だけ（📎から）・ファイルだけ は ふつうに送れる
    reset()
    page.set_input_files("#fileInput", [f("a.png", "image/png", PNG), f("b.png", "image/png", PNG)])
    for _ in range(20):
        page.wait_for_timeout(400)
        if len(sent(page)) >= 2: break
    s = sent(page)
    check("📎から 写真だけ2枚 → 写真2つとして送られる", [x.get("type") for x in s] == ["image", "image"], [x.get("type") for x in s])
    reset()
    page.set_input_files("#fileInput", [f("a.txt", "text/plain"), f("b.csv", "text/csv"), f("c.pdf", "application/pdf", b"%PDF-1.4 x")])
    for _ in range(20):
        page.wait_for_timeout(400)
        if len(sent(page)) >= 3: break
    check("📎から ファイルだけ3つ → 3つ送られる（今までどおり）", [x.get("type") for x in sent(page)] == ["file", "file", "file"], [x.get("type") for x in sent(page)])
    # --- 他の2つの選択（写真・動画）も 今までどおり複数選べる
    reset()
    page.set_input_files("#imageInput", [f("a.png", "image/png", PNG), f("b.png", "image/png", PNG), f("c.png", "image/png", PNG)])
    for _ in range(20):
        page.wait_for_timeout(400)
        if len(sent(page)) >= 3: break
    check("📷写真：3枚まとめて送れる（今までどおり）", [x.get("type") for x in sent(page)] == ["image"] * 3, [x.get("type") for x in sent(page)])
    reset()
    page.set_input_files("#videoInput", [f("a.webm", "video/webm", WEBM), f("b.webm", "video/webm", WEBM)])
    for _ in range(30):
        page.wait_for_timeout(400)
        if len(sent(page)) >= 2: break
    check("🎬動画：2本まとめて送れる（今までどおり）", [x.get("type") for x in sent(page)] == ["video", "video"], [x.get("type") for x in sent(page)])
    # --- 貼り付け・ドラッグの確認トレー：11個で「10個まで」と知らせる
    page.evaluate("window.__toasts.length = 0")
    page.evaluate("""() => { const fs = []; for(let i = 0; i < 12; i++) fs.push(new File(['x'], 'q' + i + '.txt', {type: 'text/plain'})); qsAdd(fs); }"""); page.wait_for_timeout(300)
    check("ドラッグ・貼り付けで12個 → 10個だけ トレーに入り、「10個まで」と知らせる", page.evaluate("feat.qs.files.length") == 10 and any("10個まで" in t for t in toasts()), (page.evaluate("feat.qs.files.length"), toasts()[-1:]))
    page.evaluate("qsClear()")
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
if srv: srv.terminate()
print("合計", len(res), "失敗", res.count(False))
