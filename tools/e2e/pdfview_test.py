import sys, json, re, hashlib
from urllib.parse import quote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:240]) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
FILES = {p: open("/tmp/" + f, "rb").read() for p, f in {"r1/u/en.pdf": "t_en.pdf", "r1/u/ja.pdf": "t_ja.pdf", "r1/u/many.pdf": "t_many.pdf", "r1/u/pw.pdf": "t_pw.pdf", "r1/u/bad.pdf": "t_bad.pdf"}.items()}
requests = []
def storage_route(route):
    url = route.request.url; requests.append(url)
    m = re.search(r"/storage/v1/object/(?:sign|public)/chat-attachments/([^?]+)", url)
    if m and m.group(1) in FILES:
        return route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="application/pdf", body=FILES[m.group(1)])
    return route.fulfill(status=404, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=b"{}")
def viewer(page, path, name=None, wait=2500):
    page.goto(BASE + "/fileview.html#u=" + quote(sign(path), safe="") + (("&n=" + quote(name, safe="")) if name else ""))
    page.wait_for_timeout(wait)
NONBLANK = "(c)=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i]<200||d[i+1]<200||d[i+2]<200)n++;}return n;}"
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=800, touch=False)
    import re as _re
    ctx.route(_re.compile(r".*supabase\.co/storage/.*"), storage_route)
    allreq = []
    page.on("request", lambda r: allreq.append(r.url))
    # 1. 英語3枚
    viewer(page, "r1/u/en.pdf", "資料.pdf")
    check("PDF：3ページぶんの枠が並ぶ", page.locator("#fvMain .pg").count() == 3, page.locator("#fvMain .pg").count())
    check("PDF：ページ数が出る", "3 ページ" in page.inner_text("#fvMeta"), page.inner_text("#fvMeta"))
    check("PDF：ブラウザ標準の表示（embed・iframe・object）を使わない", not page.query_selector("embed,iframe,object"))
    cv = page.locator("#fvMain .pg canvas")
    check("PDF：見えているページが canvas に描かれる", cv.count() >= 1, cv.count())
    check("PDF：描かれた中身が白紙ではない（文字が入っている）", cv.count() >= 1 and page.evaluate(NONBLANK, cv.first.element_handle()) > 500, page.evaluate(NONBLANK, cv.first.element_handle()) if cv.count() else None)
    check("PDF：名前が出て、ダウンロードボタンが出る", page.inner_text("#fvName") == "資料.pdf" and page.is_visible("#fvSave"))
    page.screenshot(path="/tmp/pdfview_en.png")
    # ダウンロード（元のファイルそのもの）
    with page.expect_download() as dl:
        page.click("#fvSave")
    d = dl.value; path = d.path()
    check("PDF：ダウンロードは元のファイルと同じ中身・名前", hashlib.sha256(open(path, "rb").read()).hexdigest() == hashlib.sha256(FILES["r1/u/en.pdf"]).hexdigest() and d.suggested_filename == "資料.pdf", d.suggested_filename)
    # 守り
    ev = page.evaluate("""() => { const c = document.querySelector('#fvMain canvas'); const out = {};
        const ce = new MouseEvent('contextmenu', {bubbles: true, cancelable: true}); c.dispatchEvent(ce); out.ctx = ce.defaultPrevented;
        const de = new Event('dragstart', {bubbles: true, cancelable: true}); c.dispatchEvent(de); out.drag = de.defaultPrevented;
        const keys = {F12:{key:'F12'}, CtrlU:{key:'u',ctrlKey:true}, CtrlS:{key:'s',ctrlKey:true}, CtrlP:{key:'p',ctrlKey:true}, CtrlShiftI:{key:'I',ctrlKey:true,shiftKey:true}, CtrlShiftC:{key:'C',ctrlKey:true,shiftKey:true}, F7:{key:'F7'}, MenuKey:{key:'ContextMenu'}};
        for (const k in keys) { const e = new KeyboardEvent('keydown', Object.assign({bubbles: true, cancelable: true}, keys[k])); document.dispatchEvent(e); out[k] = e.defaultPrevented; }
        return out; }""")
    check("PDF画面：右クリック・ドラッグ・F12・Ctrl+U/S/P・Ctrl+Shift+I/C・F7・メニューキーが止まる", all(ev.values()), ev)
    page.emulate_media(media="print")
    check("PDF画面：印刷しても中身が出ない", page.evaluate("getComputedStyle(document.body).display") == "none")
    page.emulate_media(media="screen")
    # 2. 日本語（フォント非埋め込み：文字の対応表 cmap が要る）
    allreq.clear()
    viewer(page, "r1/u/ja.pdf", "日本語.pdf")
    cv = page.locator("#fvMain .pg canvas")
    check("日本語PDF：描かれる（白紙ではない）", cv.count() == 1 and page.evaluate(NONBLANK, cv.first.element_handle()) > 500)
    txt = page.evaluate("""async () => { const buf = await (await fetch(%s)).arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: new Uint8Array(buf), cMapUrl: './vendor/lazy/cmaps/', cMapPacked: true, isEvalSupported: false}).promise;
        const tc = await (await pdf.getPage(1)).getTextContent(); return tc.items.map(i => i.str).join(''); }""" % json.dumps(sign("r1/u/ja.pdf")))
    check("日本語PDF：文字の対応表（cmap）が自分のサイトから読まれ、文字が正しく読める", "日本語のＰＤＦテスト" in txt and any("cmaps/" in u and ".bcmap" in u for u in allreq), txt)
    page.screenshot(path="/tmp/pdfview_ja.png")
    # 3. 60ページ：見える付近だけ描く
    viewer(page, "r1/u/many.pdf", "たくさん.pdf", wait=3500)
    check("60ページ：枠は60個、描いてあるのは一部だけ", page.locator("#fvMain .pg").count() == 60 and 1 <= page.locator("#fvMain .pg canvas").count() <= 12, page.locator("#fvMain .pg canvas").count())
    page.evaluate("document.getElementById('fvMain').scrollTop = document.getElementById('fvMain').scrollHeight")
    page.wait_for_timeout(3500)
    n_end = page.locator("#fvMain .pg canvas").count()
    last_has = page.evaluate("!!document.querySelector('#fvMain .pg:last-child canvas')")
    first_has = page.evaluate("!!document.querySelector('#fvMain .pg:first-child canvas')")
    check("60ページ：いちばん下まで行くと最後のページが描かれ、遠くなった最初のページは捨てられる", last_has and not first_has and n_end <= 25, (last_has, first_has, n_end))
    page.evaluate("document.getElementById('fvMain').scrollTop = 0")
    page.wait_for_timeout(3000)
    check("60ページ：もどると最初のページがまた描かれる", page.evaluate("!!document.querySelector('#fvMain .pg:first-child canvas')"))
    # 4. パスワードつき・こわれたPDF
    viewer(page, "r1/u/pw.pdf", "鍵.pdf")
    check("パスワードつきPDF：案内が出て、ダウンロードできる", "パスワード" in page.inner_text("#fvMain") and page.is_visible("#fvSave") and page.locator("canvas").count() == 0, page.inner_text("#fvMain")[:50])
    viewer(page, "r1/u/bad.pdf", "こわれた.pdf")
    check("こわれたPDF：案内が出て、ダウンロードできる（画面は止まらない）", "表示できませんでした" in page.inner_text("#fvMain") and page.is_visible("#fvSave"), page.inner_text("#fvMain")[:60])
    # 5. 通信先・ブラウザの安全ルール違反
    bad = [u for u in allreq if not (u.startswith(BASE) or u.startswith(HOST) or u.startswith("data:") or u.startswith("blob:"))]
    check("PDF画面の通信先は、このサイトと保存先だけ", not bad, bad[:3])
    csp = [str(l) for l in logs if "content security policy" in str(l).lower() or "refused to" in str(l).lower()]
    check("ブラウザの安全ルール（CSP）違反が出ない", not csp, csp[:2])
    errs = [str(l) for l in logs if "pageerror" in str(l).lower()]
    check("画面のエラーが出ない", not errs, errs[:2])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
sys.exit(1 if False in res else 0)
