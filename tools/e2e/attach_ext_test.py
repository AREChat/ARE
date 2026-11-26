import sys, json, re
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
# アプリ本体の許可リストを読む（chat-base.js から）
src = open(SRC + "/chat-base.js", encoding="utf8").read()
s = src.index("const FILE_MIME_BY_EXT = {"); e = src.index("};", s)
TABLE = dict(re.findall(r'(?:^|[,\s{])"?([a-z0-9]+)"?:"([a-z0-9.+/-]+)"', src[s:e]))
TRUST = {"jpg","jpeg","png","gif","webp","heic","heif","mp4","mov","webm"}
print("許可リストの数:", len(TABLE))
EXTRA = """
window.__fx.tables.messages = [];
window.__fx.rpc.send_message = function(a){ window.__fx.tables.messages.push({id:'mx'+Math.random(), room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return 'ok'; };
window.__fx.rpc.is_current_user_admin = function(){ return false; };
"""
BLOCKED = ["exe","msi","bat","cmd","com","scr","ps1","vbs","js","jse","wsf","hta","jar","apk","sh","svg","xml","docm","xlsm","pptm","dll","lnk","iso","dmg"]
UNKNOWN = ["xyz","abcd","bin","dat"]
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    acc = page.evaluate("document.getElementById('fileInput').accept")
    check("ファイル選択の accept に .txt .md .json .csv .zip が入っている", all(("." + x) in acc.split(",") for x in ["txt","md","json","csv","zip","py","docx","pdf"]), acc[:60])
    check("accept に危険な拡張子（.exe .svg .js .bat）が入っていない", not any(("." + x) in acc.split(",") for x in ["exe","svg","js","bat","xml","msi"]))
    # --- 許可リストの全拡張子を いっぺんに送る（ブラウザの種類は わざと 空）
    exts = [x for x in TABLE if x not in TRUST]
    files = [{"name": f"サンプル.{x}", "mimeType": "", "buffer": b"hello " + x.encode()} for x in exts]
    page.set_input_files("#fileInput", files); 
    for _ in range(60):
        page.wait_for_timeout(500)
        if len(page.evaluate("window.__uploads")) >= len(exts): break
    ups = page.evaluate("window.__uploads")
    check(f"許可リストの {len(exts)} 種類（ブラウザの種類が空）が すべてアップロードされた", len(ups) == len(exts), (len(ups), len(exts)))
    bad = []
    for u in ups:
        ext = u["path"].rsplit(".", 1)[-1]
        if (u["type"] or "").split(";")[0] != TABLE.get(ext) or ((u["o"] or {}).get("contentType") or "").split(";")[0] != TABLE.get(ext): bad.append((ext, u["type"], (u["o"] or {}).get("contentType"), TABLE.get(ext)))
    check("アップロードの「種類」が、拡張子から決めた種類になっている（.md→text/markdown、.json→application/json など）", not bad, bad[:5])
    sent = [json.loads(c["args"]["p_content"]) for c in page.evaluate("window.__calls") if c.get("rpc") == "send_message"]
    sent = [x for x in sent if x.get("type") == "file"]
    check("ファイルのメッセージが種類ぶん送られ、名前（日本語）が残る", len(sent) == len(exts) and all(x["name"].startswith("サンプル.") for x in sent), (len(sent), sent[:1]))
    check("メッセージの mimeType が 拡張子の種類と同じ", all(x["mimeType"] == TABLE[x["name"].rsplit(".",1)[-1]] for x in sent), [x["name"] for x in sent if x["mimeType"] != TABLE[x["name"].rsplit(".",1)[-1]]][:3])
    shown = page.inner_text("#messages")
    check("画面に、送ったファイルのカードが並ぶ（.md と .json と .txt）", all(f"サンプル.{x}" in shown for x in ["md","json","txt"]), shown[:80].replace("\n"," "))
    # --- ブラウザが「まちがった種類」を言う場合（Windows の csv は excel と言うことがある）
    page.evaluate("window.__uploads.length = 0")
    page.set_input_files("#fileInput", [{"name": "data.csv", "mimeType": "application/vnd.ms-excel", "buffer": b"a,b\n1,2"}, {"name": "x.ts", "mimeType": "video/mp2t", "buffer": b"let a = 1;"}])
    page.wait_for_timeout(1500)
    ups = page.evaluate("window.__uploads")
    check("ブラウザが違う種類を言っても、拡張子の種類で送る（csv→text/csv、ts→text/plain）", [(u["type"] or "").split(";")[0] for u in ups] == ["text/csv", "text/plain"], [u["type"] for u in ups])
    # --- 危険・未知の拡張子は、1つでも混じっていたら 何も送らない
    for x in BLOCKED + UNKNOWN:
        page.evaluate("window.__uploads.length = 0")
        n0 = len([c for c in page.evaluate("window.__calls") if c.get("rpc") == "send_message"])
        page.set_input_files("#fileInput", [{"name": f"test.{x}", "mimeType": "", "buffer": b"x"}, {"name": "ok.txt", "mimeType": "text/plain", "buffer": b"ok"}])
        page.wait_for_timeout(450)
        n1 = len([c for c in page.evaluate("window.__calls") if c.get("rpc") == "send_message"])
        toast = page.evaluate("(document.querySelector('.toast, #toast, [role=status]')||{}).innerText || ''")
        if len(page.evaluate("window.__uploads")) != 0 or n1 != n0:
            check(f".{x} は 送れない", False, (len(page.evaluate("window.__uploads")), n1 - n0))
    check(f"危険な {len(BLOCKED)} 種類と 未知の {len(UNKNOWN)} 種類は、混じっていると 1つも送られない", True)
    # 理由の文
    page.set_input_files("#fileInput", [{"name": "evil.exe", "mimeType": "application/x-msdownload", "buffer": b"MZ"}]); page.wait_for_timeout(500)
    t1 = page.evaluate("Array.from(document.querySelectorAll('body *')).map(e=>e.innerText||'').filter(t=>/危険/.test(t)).slice(-1)[0] || ''")
    check("exe を選ぶと「危険なため送れません」と出る", "危険" in t1 and "evil.exe" in t1, t1[:90])
    page.set_input_files("#fileInput", [{"name": "memo", "mimeType": "", "buffer": b"x"}]); page.wait_for_timeout(500)
    t2 = page.evaluate("Array.from(document.querySelectorAll('body *')).map(e=>e.innerText||'').filter(t=>/拡張子/.test(t)).slice(-1)[0] || ''")
    check("拡張子がないファイルは「拡張子がないため送れません」と出る", "拡張子" in t2, t2[:90])
    # --- 画像・動画は 今までどおり
    page.evaluate("window.__uploads.length = 0")
    import base64
    PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    page.set_input_files("#imageInput", {"name": "a.png", "mimeType": "image/png", "buffer": PNG}); page.wait_for_timeout(1200)
    ups = page.evaluate("window.__uploads")
    check("画像（png）は今までどおり送れる（種類 image/png）", len(ups) == 1 and ups[0]["type"] == "image/png", [u["type"] for u in ups])
    # --- ドラッグ・貼り付け用の判定 qsKind
    kinds = page.evaluate("""() => { const mk = (n,t) => new File(['x'], n, {type:t}); const o = {};
      [['a.md',''],['a.json','application/json'],['a.ts','video/mp2t'],['a.svg','image/svg+xml'],['a.exe','application/x-msdownload'],['a.png','image/png'],['a.mp4','video/mp4'],['a.html','text/html'],['a.zip','application/zip'],['noext','']].forEach(([n,t]) => { o[n] = qsKind(mk(n,t)); }); return o; }""")
    exp = {"a.md":"file","a.json":"file","a.ts":"file","a.svg":None,"a.exe":None,"a.png":"image","a.mp4":"video","a.html":"file","a.zip":"file","noext":None}
    check("ドラッグ・貼り付けの判定：md/json/ts/zip はファイル、html もファイルとして送れる、svg/exe/拡張子なしは送らない、画像・動画は今までどおり", kinds == exp, kinds)
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "Failed to load" not in l[1]]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
if srv: srv.terminate()
print("合計", len(res), "失敗", res.count(False))
