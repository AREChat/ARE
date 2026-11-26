import sys, json, re, base64, time
from urllib.parse import quote, unquote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def jwt(exp):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return b({"alg": "HS256", "typ": "JWT"}) + "." + b({"url": "chat-attachments/x", "exp": exp}) + ".sig"
NOW = int(time.time())
def sign(path, exp, bucket="chat-attachments"): return f"{HOST}/storage/v1/object/sign/{bucket}/{quote(path)}?token={jwt(exp)}"
def row(i, content): return {"id": f"m{i}", "room_id": "r1", "sender_id": "u1", "content": json.dumps(content, ensure_ascii=False), "created_at": f"2026-10-31T01:0{i}:00Z", "edited_at": None, "expires_at": None, "is_auto_reply": False}
OLD = NOW - 86400 * 2          # 期限切れ（2日前）
SOON = NOW + 3600              # あと1時間
FAR = NOW + 86400 * 5          # まだ5日ある
MSGS = [
  row(1, {"type": "file", "name": "期限切れ.pptx", "url": sign("r1/u1/old.pptx", OLD), "path": "r1/u1/old.pptx", "size": 500}),
  row(2, {"type": "file", "name": "もうすぐ切れる.pdf", "url": sign("r1/u1/soon.pdf", SOON), "path": "r1/u1/soon.pdf", "size": 500}),
  row(3, {"type": "file", "name": "まだ大丈夫.zip", "url": sign("r1/u1/far.zip", FAR), "path": "r1/u1/far.zip", "size": 500}),
  row(4, {"type": "image", "name": "期限切れ写真.png", "url": sign("r1/u1/oldpic.png", OLD), "path": "r1/u1/oldpic.png", "size": 500}),
  row(5, {"type": "file", "name": "日本語 名前.docx", "url": sign("r1/u1/日本語 名前.docx", OLD), "path": "r1/u1/日本語 名前.docx", "size": 500}),
]
EXTRA = "window.__fx.tables.messages = " + json.dumps(MSGS, ensure_ascii=False) + ";\nwindow.__fx.rpc.is_current_user_admin = function(){ return false; };\n"
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=900, touch=False, extra_fx=EXTRA)
    ctx.route(re.compile(r".*supabase\.co/storage/.*"), lambda r: r.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="text/plain", body=b"x"))
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    # 取り直しの窓口（偽サーバー）：呼ばれたパスを記録して、期限が7日先のリンクを返す
    page.add_init_script("""window.__signCalls = []; window.__signFail = false;
      window.addEventListener('DOMContentLoaded', () => { const iv = setInterval(() => { try { const c = requireClient(); const b = c.storage.from('chat-attachments');
        if (b.__patched) { clearInterval(iv); return; } b.__patched = true;
        const bulk = async (paths, ttl, rec) => { if (rec) window.__signCalls.push([paths.slice(), ttl]); if (window.__signFail) return {data: null, error: {message: 'x'}};
          const mk = (p) => { const e = Math.floor(Date.now()/1000) + ttl; const h = (o) => btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_'); return 'https://kzrrnuzzvwijujhlbtln.supabase.co/storage/v1/object/sign/chat-attachments/' + encodeURIComponent(p).replace(/%2F/g,'/') + '?token=' + h({alg:'HS256'}) + '.' + h({exp:e}) + '.sig'; };
          return {data: paths.map((p) => ({path: p, signedUrl: mk(p), error: null})), error: null}; };
        b.createSignedUrls = (paths, ttl) => bulk(paths, ttl, true);
        b.createSignedUrl = async (path, ttl) => { window.__oneCalls = (window.__oneCalls || []).concat([[path, ttl]]); const r = await bulk([path], ttl, false); return {data: {signedUrl: r.data[0].signedUrl}, error: null}; };
      } catch (e) {} }, 50); });""")
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(2500)
    calls = page.evaluate("window.__signCalls")
    flat = [p for c in calls for p in c[0]]
    check("期限が切れた・もうすぐ切れるリンクだけ、取り直しを頼む", sorted(set(flat)) == sorted(["r1/u1/old.pptx", "r1/u1/soon.pdf", "r1/u1/oldpic.png", "r1/u1/日本語 名前.docx"]), flat)
    check("まだ余裕のあるリンク（5日ぶん）は、頼まない", "r1/u1/far.zip" not in flat)
    check("頼むときの有効期間は7日", all(c[1] == 7 * 24 * 3600 for c in calls), [c[1] for c in calls])
    hrefs = page.evaluate("[...document.querySelectorAll('#messages a[href*=\"/storage/v1/object/sign/\"]')].map(a => a.getAttribute('href'))")
    def exp_of(h):
        t = re.search(r"token=([^&]+)", h).group(1).split(".")[1]; t += "=" * (-len(t) % 4)
        return json.loads(base64.urlsafe_b64decode(t))["exp"]
    exps = [exp_of(h) for h in hrefs]
    check("画面のリンクが、ぜんぶ 6時間以上先の期限になった", len(hrefs) == 5 and all(e > NOW + 6 * 3600 for e in exps), exps)
    check("まだ余裕のあった zip のリンクは、そのまま", any("far.zip" in h and exp_of(h) == FAR for h in hrefs))
    check("日本語・空白の名前のパスも、正しく取り直せる", any("%E6%97%A5%E6%9C%AC%E8%AA%9E" in h and exp_of(h) > NOW + 6 * 86400 for h in hrefs), [h[-90:] for h in hrefs if "docx" in h])
    # 取り直したリンクで、ファイルを開く（表示ページの #u= が新しいリンク）
    opened = []; ctx.on("page", lambda pg: opened.append(pg))
    page.locator("#messages a.file-card").filter(has_text="期限切れ.pptx").first.click(); page.wait_for_timeout(1500)
    m = re.match(re.escape(BASE) + r"/fileview\.html#u=([^&]*)", opened[0].url) if opened else None
    check("期限切れだった pptx を押すと、開く直前に取り直した新しいリンク（1時間）で表示ページが開く", m and exp_of(unquote(m.group(1))) > NOW + 3000 and page.evaluate("(window.__oneCalls || []).some(c => c[0] === 'r1/u1/old.pptx' && c[1] === 3600)"), opened[0].url[-120:] if opened else "開かなかった")
    # 失敗しても、画面は壊れず、1分は 取り直しにいかない
    n0 = len(page.evaluate("window.__signCalls"))
    page.evaluate("window.__signFail = true; ffk.fresh.clear(); ffk.retryAt = 0; document.querySelectorAll('#messages a[href*=\"old.pptx\"]').forEach(a => a.setAttribute('href', a.getAttribute('href').replace(/token=[^&]+/, 'token=' + 'x.' + btoa('{\"exp\":1000}') + '.s')))")
    page.evaluate("ffSchedule()"); page.wait_for_timeout(1200)
    n1 = len(page.evaluate("window.__signCalls"))
    page.evaluate("ffSchedule()"); page.wait_for_timeout(1000)
    n2 = len(page.evaluate("window.__signCalls"))
    check("取り直しに失敗しても、エラーにならない（1分は 次の取り直しをしない）", n1 == n0 + 1 and n2 == n1 and not errs, (n0, n1, n2, errs))
    check("画面のエラーなし", not errs, errs)
    print("%d/%d 通過" % (sum(res), len(res)))
    browser.close()
sys.exit(0 if all(res) else 1)
