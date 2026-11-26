import sys, json, re, base64, glob, os
from urllib.parse import quote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:260]) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
SECRET = "SECRET_SOURCE_LINE_12345"
FILES = {
  "r1/u/a.py": (("print('%s')\n" % SECRET).encode(), "text/plain"),
  "r1/u/a.css": (("body{content:'%s'}\n" % SECRET).encode(), "text/plain"),
  "r1/u/a.json": (('{"k":"%s"}' % SECRET).encode(), "application/json"),
  "r1/u/a.sql": (("select '%s';\n" % SECRET).encode(), "text/plain"),
  "r1/u/a.yaml": (("k: %s\n" % SECRET).encode(), "text/plain"),
  "r1/u/a.java": (("class A{String s=\"%s\";}\n" % SECRET).encode(), "text/plain"),
  "r1/u/a.cpp": (("int main(){return 0;}// %s\n" % SECRET).encode(), "text/plain"),
  "r1/u/a.ts": (("const s='%s';\n" % SECRET).encode(), "text/plain"),
  "r1/u/memo.txt": (("ふつうのメモです。%s\n" % "OKMEMO").encode(), "text/plain"),
  "r1/u/read.md": (b"# title\nOKMD\n", "text/markdown"),
  "r1/u/a.csv": (b"a,b\n1,OKCSV\n", "text/csv"),
  "r1/u/page.html": (("<!doctype html><html><body><h1 id=h>見出し</h1><p>%s</p></body></html>" % SECRET).encode(), "text/plain"),
}
def storage_route(route):
    url = route.request.url
    CORS = {"access-control-allow-origin": "*"}
    m = re.search(r"/storage/v1/object/(?:sign|public)/chat-attachments/([^?]+)", url)
    if m and m.group(1) in FILES:
        body, ct = FILES[m.group(1)]
        return route.fulfill(status=200, headers=CORS, content_type=ct, body=body)
    return route.fulfill(status=404, headers=CORS, content_type="application/json", body=b'{"error":"not found"}')
def viewer(page, path, name):
    page.goto(BASE + "/fileview.html#u=" + quote(sign(path), safe="") + "&n=" + quote(name, safe=""))
    page.wait_for_timeout(1000)
GUARD = """() => { const r = {}; const t = (type, init, tgt) => { const e = new (type==='keydown'?KeyboardEvent:MouseEvent)(type, Object.assign({bubbles:true,cancelable:true}, init)); (tgt||document.body).dispatchEvent(e); return e.defaultPrevented; };
  r.f12 = t('keydown',{key:'F12'}); r.ctrlShiftI = t('keydown',{key:'I',ctrlKey:true,shiftKey:true}); r.ctrlShiftJ = t('keydown',{key:'J',ctrlKey:true,shiftKey:true}); r.ctrlShiftC = t('keydown',{key:'C',ctrlKey:true,shiftKey:true});
  r.ctrlU = t('keydown',{key:'u',ctrlKey:true}); r.ctrlS = t('keydown',{key:'s',ctrlKey:true}); r.ctx = t('contextmenu',{button:2}); r.menuKey = t('keydown',{key:'ContextMenu'}); r.shiftF10 = t('keydown',{key:'F10',shiftKey:true}); return r; }"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=800, touch=False)
    ctx.route(re.compile(r".*supabase\.co/storage/.*"), storage_route)
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    # 1. コードの種類は、中身を出さない（ダウンロードの案内だけ）
    for ext in ["py", "css", "json", "sql", "yaml", "java", "cpp", "ts"]:
        viewer(page, "r1/u/a." + ext, "a." + ext)
        body = page.inner_text("body"); html = page.content()
        check(f".{ext}：中身が画面のどこにも出ない・<pre>も無い・コピーも出ない", SECRET not in body and SECRET not in html and page.query_selector("pre") is None and not page.is_visible("#fvCopy"), body[:120])
    # 2. ふつうの文字のファイルは、いままでどおり読める
    for name, key in [("memo.txt", "OKMEMO"), ("read.md", "OKMD"), ("a.csv", "OKCSV")]:
        viewer(page, "r1/u/" + name, name)
        check(f"{name}：文字として読める", key in page.inner_text("#fvMain"), page.inner_text("#fvMain")[:80])
    # 3. HTML：ページとしては出る。コードの表示・コピーは無い
    viewer(page, "r1/u/page.html", "page.html")
    check("HTML：ページの画面（枠）で出る", page.query_selector("iframe.hf") is not None)
    check("HTML：『コードを見る』『コピー』が無い・<pre>も無い", page.query_selector("#fvView") is None and not page.is_visible("#fvCopy") and page.query_selector("pre") is None)
    outer = page.evaluate("document.getElementById('fvMain').innerText")
    check("HTML：外側のページの文字に、ソースの <h1 など が入っていない", "<h1" not in outer and "<!doctype" not in outer.lower(), outer[:120])
    # 4. 直接ほかのパスから開こうとしても同じ（fileview.html に ?code などの隠し入口が無い）
    page.goto(BASE + "/fileview.html?view=code#u=" + quote(sign("r1/u/page.html"), safe="") + "&n=page.html&code=1&mode=code"); page.wait_for_timeout(900)
    check("隠しパラメータ（?view=code など）でも、コードは出ない", page.query_selector("pre") is None and page.query_selector("#fvView") is None)
    # 5. 右クリック・F12 などは、アプリの全ページで止まる
    pages = sorted(f for f in os.listdir(os.environ.get("ARE_SRC", "/home/claude/r3/AREDA")) if f.endswith(".html"))
    skip = {"googlea6a4c5f3a6953ee3.html"}
    bad = []
    for f in pages:
        if f in skip: continue
        try:
            page.goto(BASE + "/" + f, wait_until="domcontentloaded"); page.wait_for_timeout(700)
            g = page.evaluate(GUARD)
        except Exception as e:
            bad.append((f, "error " + str(e)[:60])); continue
        miss = [k for k, v in g.items() if not v]
        if miss: bad.append((f, miss))
    check("全ページ（%d枚）で、右クリック・F12・Ctrl+Shift+I/J/C・Ctrl+U・Ctrl+S・メニューキーが止まる" % (len(pages) - len(skip)), not bad, bad)
    # 6. HTML の枠の中でも止まる
    viewer(page, "r1/u/page.html", "page.html")
    fr = page.query_selector("iframe.hf"); cf = fr.content_frame() if fr else None
    g = cf.evaluate(GUARD) if cf else {}
    check("HTML の枠の中でも、右クリック・F12・Ctrl+U が止まる", g and all(g.get(k) for k in ["f12", "ctrlShiftI", "ctrlU", "ctx"]), g)
    # 7. 文字化けなおしツールも、コードのファイルは開かない
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    r = page.evaluate("""async () => { const out = {}; for (const n of ['a.py', 'a.css', 'a.json', 'a.html', 'a.sql', 'memo.txt', 'x.CSV', 'read.md']) { const st = {}; await ftActs.textfix('add', {files: [new File(['hello'], n)], value: ''}, st); out[n] = {bytes: !!st.bytes, msg: st.msg || ''}; } return out; }""")
    bad_codes = [n for n in ["a.py", "a.css", "a.json", "a.html", "a.sql"] if r[n]["bytes"] or "ここでは開けません" not in r[n]["msg"]]
    check("文字直しツール：.py .css .json .html .sql は、開かずに ことわる", not bad_codes, r)
    check("文字直しツール：.txt .csv .md は、いままでどおり開ける", all(r[n]["bytes"] for n in ["memo.txt", "x.CSV", "read.md"]), r)
    html = page.evaluate("ftPainters.textfix({})")
    m = re.search(r'accept="([^"]*)"', html)
    check("文字直しツール：ファイル選びの候補（accept）に json・xml・html・ini が入っていない", m and not re.search(r"json|xml|html|htm|ini|text/\*", m.group(1)), m and m.group(1))
    check("画面のエラーなし", not errs, errs)
    print("%d/%d 通過" % (sum(res), len(res)))
    browser.close()
sys.exit(0 if all(res) else 1)
