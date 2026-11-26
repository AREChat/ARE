import sys, re
from urllib.parse import quote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>てすと</title><style>h1{color:rgb(200,0,0)}</style></head><body>
<h1 id="h">見出し</h1><p id="out">静か</p><img id="ext" src="https://img.example.test/a.png"><p id="r"></p>
<script>
document.getElementById('out').textContent='動いた';
var r=[];
try{ r.push('parent:'+(typeof parent.document.title)); }catch(e){ r.push('parent:blocked'); }
try{ r.push('ls:'+localStorage.length); }catch(e){ r.push('ls:blocked'); }
try{ top.location='https://evil.example.test/top'; r.push('top:tried'); }catch(e){ r.push('top:blocked'); }
try{ fetch('https://evil.example.test/f').then(function(){r.push('fetch:ok')},function(){}); }catch(e){}
try{ window.open('https://evil.example.test/pop'); }catch(e){}
try{ alert(1); }catch(e){}
document.getElementById('r').textContent=r.join(' ');
</script></body></html>"""
SJIS = ("<!DOCTYPE html><html><head><meta charset=\"Shift_JIS\"></head><body><p id=\"p\">日本語のページです。漢字・ひらがな・カタカナ。</p></body></html>").encode("cp932")
REFRESH = '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=https://evil.example.test/refresh"></head><body><p id="p">refresh</p></body></html>'
FILES = {"r1/u/page.html": (PAGE.encode("utf-8"), "text/plain"), "r1/u/sj.html": (SJIS, "text/plain"), "r1/u/ref.html": (REFRESH.encode("utf-8"), "text/plain"),
         "r1/u/quirk.htm": ("<p id='p'>doctypeなし</p>".encode("utf-8"), "text/plain")}
ext_req = []
def storage_route(route):
    url = route.request.url
    m = re.search(r"/storage/v1/object/(?:sign|public)/chat-attachments/([^?]+)", url)
    CORS = {"access-control-allow-origin": "*"}
    if m and m.group(1) in FILES:
        body, ct = FILES[m.group(1)]
        return route.fulfill(status=200, headers=CORS, content_type=ct, body=body)
    return route.fulfill(status=404, headers=CORS, content_type="application/json", body=b"{}")
def ext_route(route):
    ext_req.append(route.request.url)
    return route.fulfill(status=200, content_type="text/plain", body="x")
def viewer(page, path, name):
    page.goto(BASE + "/fileview.html#u=" + quote(sign(path), safe="") + "&n=" + quote(name, safe=""))
    page.wait_for_timeout(1200)
def inner(page):
    for f in page.frames:
        if f != page.main_frame: return f
    return None
dialogs = []
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=800, touch=False)
    import re as _re
    ctx.route(_re.compile(r".*supabase\.co/storage/.*"), storage_route)
    ctx.route(_re.compile(r".*evil\.example\.test.*|.*img\.example\.test.*"), ext_route)
    page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    viewer(page, "r1/u/page.html", "ページ.html")
    f = inner(page)
    check("HTMLが コードではなく、枠の中の『ページ』として表示される", f is not None and f.evaluate("document.getElementById('h') && document.getElementById('h').textContent") == "見出し")
    check("デザイン（CSS）が効いている", f and f.evaluate("getComputedStyle(document.getElementById('h')).color") == "rgb(200, 0, 0)")
    check("プログラムが動く（初期は動かす）", f and f.evaluate("document.getElementById('out').textContent") == "動いた", f and f.evaluate("document.getElementById('out').textContent"))
    check("DOCTYPE があるページは 標準モード（見た目が崩れない）", f and f.evaluate("document.compatMode") == "CSS1Compat")
    r = f.evaluate("document.getElementById('r').textContent") if f else ""
    check("枠の外（親ページ）にはさわれない", "parent:blocked" in r, r)
    check("保存データ（localStorage）にもさわれない", "ls:blocked" in r, r)
    check("ページの乗っ取り（top.location）はできない", BASE in page.url and "evil" not in page.url, page.url)
    check("外への通信（fetch・外の画像・ポップアップ）は 1件も出ない", not ext_req, ext_req)
    check("alert などの ポップアップは出ない", not dialogs, dialogs)
    check("名前・案内・ボタンが出る", page.inner_text("#fvName") == "ページ.html" and page.is_visible("#fvRun") and page.is_visible("#fvNet") and page.is_visible("#fvSave"))
    check("『安全な枠』の案内が出る", "安全な枠" in page.inner_text("#fvMain"))
    fr = page.query_selector("iframe.hf")
    check("枠は sandbox（allow-scripts だけ）", fr and fr.get_attribute("sandbox") == "allow-scripts", fr and fr.get_attribute("sandbox"))
    # 右クリック・F12 などの抑止（枠の中にも付いている）
    f0 = inner(page)
    gd = f0.evaluate("""() => { const r = {};
        const mk = (type, init) => new (type === 'keydown' ? KeyboardEvent : MouseEvent)(type, Object.assign({bubbles:true, cancelable:true}, init));
        const t = (type, init) => { const e = mk(type, init); document.body.dispatchEvent(e); return e.defaultPrevented; };
        r.f12 = t('keydown', {key:'F12'}); r.ctrlShiftI = t('keydown', {key:'I', ctrlKey:true, shiftKey:true}); r.ctrlU = t('keydown', {key:'u', ctrlKey:true});
        r.f7 = t('keydown', {key:'F7'}); r.ctrlShiftS = t('keydown', {key:'S', ctrlKey:true, shiftKey:true}); r.ctrlP = t('keydown', {key:'p', ctrlKey:true}); r.ctrlC = t('keydown', {key:'c', ctrlKey:true}); r.ctrlV = t('keydown', {key:'v', ctrlKey:true});
        r.drop = (() => { const e = new Event('drop', {bubbles:true, cancelable:true}); document.body.dispatchEvent(e); return e.defaultPrevented; })();
        r.ctx = t('contextmenu', {button:2}); r.letterA = t('keydown', {key:'a'}); r.enter = t('keydown', {key:'Enter'}); return r; }""") if f0 else {}
    check("枠の中でも 右クリック・F12・Ctrl+Shift+I・Ctrl+U が止まる", gd and gd.get("f12") and gd.get("ctrlShiftI") and gd.get("ctrlU") and gd.get("ctx"), gd)
    check("ふつうのキー（A・Enter・Ctrl+C・Ctrl+V）は止めない", gd and not gd.get("letterA") and not gd.get("enter") and not gd.get("ctrlC") and not gd.get("ctrlV"), gd)
    check("枠の中でも F7・Ctrl+Shift+S・Ctrl+P・ファイルのドロップが止まる（protect.js と同じ）", gd and gd.get("f7") and gd.get("ctrlShiftS") and gd.get("ctrlP") and gd.get("drop"), gd)
    # 外の画像
    ext_req.clear()
    page.click("#fvNet"); page.wait_for_timeout(900)
    check("『外の画像も読む』をおすと、外の画像だけ 読みにいく", any("img.example.test" in u for u in ext_req) and not any("evil" in u for u in ext_req), ext_req)
    page.click("#fvNet"); page.wait_for_timeout(300)
    # プログラムを止める
    page.click("#fvRun"); page.wait_for_timeout(500)
    f = inner(page)
    check("プログラムを止めると、動かない（文字は『静か』のまま）", f and f.evaluate("document.getElementById('out').textContent") == "静か")
    check("止めても、見た目（CSS）は出る", f and f.evaluate("getComputedStyle(document.getElementById('h')).color") == "rgb(200, 0, 0)")
    fr = page.query_selector("iframe.hf")
    check("止めると、外の画像ボタンは 消える（いちばん固い設定）", not page.is_visible("#fvNet"))
    check("止めたときの枠は sandbox（なし＝すべて禁止）", fr and fr.get_attribute("sandbox") == "", fr and fr.get_attribute("sandbox"))
    # コードは、画面に出さない（ボタンも、コピーも ない）
    check("『コードを見る』ボタンは、もう無い", page.query_selector("#fvView") is None and "コードを見る" not in page.content())
    check("コピーのボタンも出ない（HTML の中身は 渡さない）", not page.is_visible("#fvCopy"))
    check("画面のどこにも HTML のコード（<pre>・タグの文字）が出ない", page.query_selector("pre") is None and "<h1" not in page.inner_text("#fvMain"))
    check("ページの画面は 残っている（枠）", page.query_selector("iframe.hf") is not None)
    # Shift_JIS
    viewer(page, "r1/u/sj.html", "sj.html")
    f = inner(page)
    check("Shift_JIS の HTML も 文字化けしない", f and "日本語のページです" in f.evaluate("document.getElementById('p').textContent"), f and f.evaluate("document.getElementById('p').textContent"))
    check("文字コードの案内が出る", "Shift_JIS" in page.inner_text("#fvMeta"), page.inner_text("#fvMeta"))
    # 拡張子 htm・doctypeなし
    viewer(page, "r1/u/quirk.htm", "quirk.htm")
    f = inner(page)
    check(".htm も ページとして出る（DOCTYPEなしでも）", f and f.evaluate("document.getElementById('p').textContent") == "doctypeなし")
    # meta refresh で外へ飛ばされない
    ext_req.clear()
    viewer(page, "r1/u/ref.html", "ref.html")
    page.wait_for_timeout(800)
    check("meta refresh で 外のサイトへ 飛ばされない", not ext_req and "evil" not in page.url, (ext_req, page.url))
    # ダウンロード
    viewer(page, "r1/u/page.html", "ページ.html")
    with page.expect_download() as d: page.click("#fvSave")
    check("ダウンロードは .html のまま", d.value.suggested_filename.endswith(".html"), d.value.suggested_filename)
    errs = [l for l in logs if "pageerror" in str(l).lower()]
    check("このページ自体の エラーなし", not errs, errs[:2])
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1200)
    r = page.evaluate("() => [resolveMime({name:'a.html', type:'text/html'}), resolveMime({name:'b.htm', type:''}), fileRejectReason({name:'a.html'}), fileRejectReason({name:'b.htm'}), fileRejectReason({name:'c.svg'}), fileRejectReason({name:'d.js'}), fileRejectReason({name:'e.xhtml'}), fileViewKind('html'), fileViewKind('htm'), fileViewKind('txt'), isTextFixTarget({name:'z.html'})]")
    check("HTML は 保存先には「文字（text/plain）」として あずける（保存先の画面で動かない）", r[0] == "text/plain" and r[1] == "text/plain", r[:2])
    check("html・htm は 送れる／svg・js・xhtml は 今までどおり 送れない", r[2] == "" and r[3] == "" and "危険" in r[4] and "危険" in r[5] and "危険" in r[6], r[2:7])
    check("html は ページとして表示する種類、txt は 今までどおり 文字", r[7] == "html" and r[8] == "html" and r[9] == "text", r[7:10])
    check("html も 文字コードの自動なおし（Shift_JIS→UTF-8）の対象", r[10] is True, r[10])
    browser.close()
print("PASS" if all(res) else "FAIL", sum(res), "/", len(res))
