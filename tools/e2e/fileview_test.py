import sys, json, re, base64
from urllib.parse import quote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
JA = "こんにちは、世界。これは文字化けのテストです。\r\n日本語のファイルです。漢字・ひらがな・カタカナ（ＡＢＣ）\r\n" * 2
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
FILES = {   # 保存先のパス → (中身, 保存先が返す Content-Type)
  "r1/u/sjis.txt": (JA.encode("cp932"), "text/plain"),
  "r1/u/utf8.md": (JA.encode("utf-8"), "text/markdown"),
  "r1/u/euc.txt": (JA.encode("euc_jp", errors="ignore"), "text/plain"),
  "r1/u/jis.txt": (JA.encode("iso2022_jp_ext", errors="ignore"), "text/plain"),
  "r1/u/u16.txt": (b"\xff\xfe" + JA.encode("utf-16-le"), "text/plain"),
  "r1/u/evil.txt": ("<script>window.__pwned=1</script><b>太字</b><img src=x onerror=window.__pwned=1>".encode("utf-8"), "text/plain"),
  "r1/u/bin.txt": (b"\x00\x01\xff\xfe\x80abc\x00", "text/plain"),
  "r1/u/pic.png": (PNG, "image/png"),
  "r1/u/movie.webm": (open("/tmp/t.webm", "rb").read(), "video/webm"),
  "r1/u/sound.wav": (open("/tmp/t.wav", "rb").read(), "audio/wav"),
  "r1/u/doc.pdf": (b"%PDF-1.4\n%%EOF", "application/pdf"),
  "r1/u/sheet.docx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}
requests = []
def storage_route(route):
    url = route.request.url
    requests.append(url)
    CORS = {"access-control-allow-origin": "*"}
    m = re.search(r"/storage/v1/object/(?:sign|public)/chat-attachments/([^?]+)", url)
    if m and m.group(1) in FILES:
        body, ct = FILES[m.group(1)]
        return route.fulfill(status=200, headers=CORS, content_type=ct, body=body)
    return route.fulfill(status=404, headers=CORS, content_type="application/json", body=b'{"error":"not found"}')

def viewer(page, path, name=None, raw=None):
    u = raw if raw is not None else sign(path)
    page.goto(BASE + "/fileview.html#u=" + quote(u, safe="") + (("&n=" + quote(name, safe="")) if name else ""))
    page.wait_for_timeout(900)

with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=800, touch=False)
    import re as _re
    ctx.route(_re.compile(r".*supabase\.co/storage/.*"), storage_route)
    # 1. 文字のファイル：文字コードごと
    for path, name, label in [("r1/u/sjis.txt", "メモ.txt", "Shift_JIS"), ("r1/u/euc.txt", "euc.txt", "EUC-JP"), ("r1/u/jis.txt", "jis.txt", "JIS"), ("r1/u/u16.txt", "u16.txt", "UTF-16"), ("r1/u/utf8.md", "読んで.md", "UTF-8")]:
        viewer(page, path, name)
        txt = page.evaluate("(document.querySelector('pre')||{}).textContent || ''")
        meta = page.inner_text("#fvMeta")
        exp = FILES[path][0]
        want = exp.decode({"Shift_JIS": "cp932", "EUC-JP": "euc_jp", "JIS": "iso2022_jp_ext", "UTF-16": "utf-16", "UTF-8": "utf-8"}[label])
        check(f"{label} のファイルが、文字化けせずに表示される", txt == want, txt[:30])
        check(f"{label}：文字コードの案内が出る", label in meta or (label == "JIS" and "JIS" in meta), meta)
    check("名前と タブの題が出る", page.inner_text("#fvName") == "読んで.md" and "読んで.md" in page.title(), (page.inner_text("#fvName"), page.title()))
    check("文字のファイルに『コピー』『ダウンロード』が出て、『閉じる』もある", page.is_visible("#fvCopy") and page.is_visible("#fvSave") and page.is_visible("#fvClose"))
    # ダウンロード：直した UTF-8（txt は目印つき）
    viewer(page, "r1/u/sjis.txt", "メモ.txt")
    with page.expect_download() as d: page.click("#fvSave")
    dl = d.value; data = open(dl.path(), "rb").read()
    check("Shift_JIS の txt をダウンロードすると、UTF-8（目印つき）に直ったものが保存される", dl.suggested_filename == "メモ.txt" and data[:3] == b"\xef\xbb\xbf" and data[3:].decode("utf-8") == JA, (dl.suggested_filename, data[:12]))
    viewer(page, "r1/u/utf8.md", "読んで.md")
    with page.expect_download() as d: page.click("#fvSave")
    data = open(d.value.path(), "rb").read()
    check("もともと UTF-8 のファイルは、1 バイトも変えずにダウンロードされる", data == FILES["r1/u/utf8.md"][0])
    # コピー
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    viewer(page, "r1/u/sjis.txt", "メモ.txt")
    page.click("#fvCopy"); page.wait_for_timeout(400)
    clip = page.evaluate("navigator.clipboard.readText()")
    check("『コピー』で直った文章がコピーされる", clip == JA, clip[:20])
    # 2. 危険な中身は、文字としてしか表示しない
    viewer(page, "r1/u/evil.txt", "evil.txt")
    check("HTML・スクリプトが書いてあっても、文字として表示するだけ（実行されない）", page.evaluate("!window.__pwned && !document.querySelector('pre script') && !document.querySelector('pre b') && !document.querySelector('pre img')") and "<script>" in page.inner_text("pre"))
    viewer(page, "r1/u/sjis.txt", '<img src=x onerror=window.__pwned=1>/../a.txt')
    check("名前に HTML が入っていても、実行されず、危ない記号は『_』に置きかわる", page.evaluate("!window.__pwned && !document.querySelector('#fvName img')") and "<" not in page.inner_text("#fvName"), page.inner_text("#fvName"))
    viewer(page, "r1/u/bin.txt", "bin.txt")
    check("読めない中身は『ダウンロードしてください』になる（文字化けを表示しない）", "判定できません" in page.inner_text("#fvMain") and not page.query_selector("pre") and page.is_visible("#fvSave"), page.inner_text("#fvMain")[:50])
    # 3. 画像・動画・音声・PDF・その他
    viewer(page, "r1/u/pic.png", "写真.png")
    check("画像：img で表示され、ドラッグできず、クリックで拡大/縮小", page.evaluate("(()=>{const i=document.querySelector('img.view');return !!i && i.draggable===false && i.src.includes('/pic.png')})()"))
    page.click("img.view"); z1 = page.evaluate("document.querySelector('img.view').classList.contains('zoom')"); page.click("img.view"); z2 = page.evaluate("document.querySelector('img.view').classList.contains('zoom')")
    check("画像：クリックで拡大して、もう一度で元にもどる", z1 and not z2, (z1, z2))
    viewer(page, "r1/u/movie.webm", "動画.webm")
    check("動画：video（ダウンロードボタンなし・ピクチャインピクチャなし）で表示される", page.evaluate("(()=>{const v=document.querySelector('video');return !!v && v.controls && /nodownload/.test(v.getAttribute('controlsList')||'') && v.hasAttribute('disablePictureInPicture')})()"))
    viewer(page, "r1/u/sound.wav", "音.wav")
    check("音声：audio で表示される", page.evaluate("!!document.querySelector('audio[controls]')"))
    viewer(page, "r1/u/doc.pdf", "資料.pdf")
    check("PDF：ブラウザ標準の表示（embed・iframe・object）を使わず、ダウンロードだけ案内する", not page.query_selector("embed,iframe,object") and "ダウンロード" in page.inner_text("#fvMain") and page.is_visible("#fvSave"), page.inner_text("#fvMain")[:40])
    viewer(page, "r1/u/sheet.docx", "表.docx")
    check("docx など：表示せず、ダウンロードだけ案内する", not page.query_selector("pre,img.view,video,audio") and page.is_visible("#fvSave"))
    # 4. 保存先以外のURLは開かない（ほかのサイト・http・別の道筋）
    before = len(requests)
    ext_reqs = []
    page.on("request", lambda r: ext_reqs.append(r.url) if "evil.example" in r.url else None)
    for raw, what in [("https://evil.example/storage/v1/object/sign/chat-attachments/x.txt", "別のサイト"),
                      (HOST.replace("https", "http") + "/storage/v1/object/sign/chat-attachments/r1/u/sjis.txt", "http"),
                      (HOST + "/rest/v1/profiles", "保存先ではない道筋"),
                      ("javascript:alert(1)", "javascript:"), ("data:text/html,<script>1</script>", "data:"), ("", "空")]:
        viewer(page, None, "x.txt", raw=raw)
        check(f"保存先以外は開かない：{what}", "開けません" in page.inner_text("#fvName") and "正しくない" in page.inner_text("#fvMain") and not ext_reqs and len(requests) == before, page.inner_text("#fvName"))
    page.goto(BASE + "/fileview.html"); page.wait_for_timeout(500)
    check("リンクの付いていない直接アクセスは、エラーの案内になる", "開けません" in page.inner_text("#fvName"))
    # 期限切れ・存在しない
    viewer(page, "r1/u/nothing.txt", "x.txt")
    check("ファイルが取れないとき（期限切れなど）は、わかりやすい案内が出る", "読み込めませんでした" in page.inner_text("#fvMain") or "開けません" in page.inner_text("#fvName"), page.inner_text("#fvMain")[:40])
    # 5. 右クリック・F12 などの禁止（protect.js）
    viewer(page, "r1/u/sjis.txt", "メモ.txt")
    ev = page.evaluate("""() => {
        const out = {};
        const key = (init) => { const e = new KeyboardEvent('keydown', Object.assign({bubbles:true, cancelable:true}, init)); document.dispatchEvent(e); return e.defaultPrevented; };
        out.f12 = key({key:'F12'});
        out.ctrlU = key({key:'u', ctrlKey:true});
        out.ctrlS = key({key:'s', ctrlKey:true});
        out.ctrlP = key({key:'p', ctrlKey:true});
        out.ctrlShiftI = key({key:'I', ctrlKey:true, shiftKey:true});
        out.ctrlShiftJ = key({key:'J', ctrlKey:true, shiftKey:true});
        out.ctrlShiftC = key({key:'C', ctrlKey:true, shiftKey:true});
        out.f7 = key({key:'F7'});
        out.ctxKey = key({key:'ContextMenu'});
        out.shiftF10 = key({key:'F10', shiftKey:true});
        out.metaAltI = key({key:'i', metaKey:true, altKey:true});
        const c = new MouseEvent('contextmenu', {bubbles:true, cancelable:true}); (document.querySelector('pre')||document.body).dispatchEvent(c); out.contextmenu = c.defaultPrevented;
        out.ctrlC = key({key:'c', ctrlKey:true});   // コピーは止めない
        return out;
    }""")
    check("専用ページで F12・Ctrl+U・Ctrl+S・Ctrl+P・Ctrl+Shift+I/J/C・F7・メニューキー・Shift+F10 が止まる", all(ev[k] for k in ["f12","ctrlU","ctrlS","ctrlP","ctrlShiftI","ctrlShiftJ","ctrlShiftC","f7","ctxKey","shiftF10","metaAltI"]), ev)
    check("専用ページで右クリックのメニューが出ない", ev["contextmenu"], ev["contextmenu"])
    check("文章のコピー（Ctrl+C）は止めない", ev["ctrlC"] is False)
    pr = page.evaluate("getComputedStyle(document.body).display")
    page.emulate_media(media="print")
    pd = page.evaluate("getComputedStyle(document.body).display")
    check("印刷しても、画面の中身が出ない", pd == "none", (pr, pd))
    page.emulate_media(media="screen")
    # 画像でも右クリック
    viewer(page, "r1/u/pic.png", "写真.png")
    ctxp = page.evaluate("(()=>{const c=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('img.view').dispatchEvent(c);return c.defaultPrevented})()")
    check("画像の上の右クリックも止まる", ctxp)
    errs = [l for l in logs if l[0] == "pageerror"]
    check("専用ページのエラーなし", not errs, errs[:2])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
