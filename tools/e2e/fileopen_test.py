import sys, json, re
from urllib.parse import quote, unquote
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:260]) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def sign(path): return f"{HOST}/storage/v1/object/sign/chat-attachments/{path}?token=t"
def row(i, content): return {"id": f"m{i}", "room_id": "r1", "sender_id": "u1", "content": json.dumps(content, ensure_ascii=False), "created_at": f"2026-10-31T01:0{i}:00Z", "edited_at": None, "expires_at": None, "is_auto_reply": False}
MSGS = [
  row(1, {"type": "image", "name": "写真.png", "url": sign("r1/u1/a.png"), "path": "r1/u1/a.png", "mimeType": "image/png", "size": 1000}),
  row(2, {"type": "file", "name": "メモ.txt", "url": sign("r1/u1/b.txt"), "path": "r1/u1/b.txt", "mimeType": "text/plain", "size": 500}),
  row(3, {"type": "file", "name": "表.docx", "url": sign("r1/u1/c.docx"), "path": "r1/u1/c.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": 500}),
  row(4, {"type": "video", "name": "動画.webm", "url": sign("r1/u1/d.webm"), "path": "r1/u1/d.webm", "mimeType": "video/webm", "size": 500}),
  row(5, {"type": "file", "name": "資料.pdf", "url": sign("r1/u1/e.pdf"), "path": "r1/u1/e.pdf", "mimeType": "application/pdf", "size": 500}),
  row(6, {"type": "file", "name": "圧縮.zip", "url": sign("r1/u1/f.zip"), "path": "r1/u1/f.zip", "mimeType": "application/zip", "size": 500}),
]
EXTRA = "window.__fx.tables.messages = " + json.dumps(MSGS, ensure_ascii=False) + ";\nwindow.__fx.rpc.is_current_user_admin = function(){ return false; };\n"
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=900, touch=False, extra_fx=EXTRA)
    import re as _re
    import base64 as _b64
    _PNG = _b64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    ctx.route(_re.compile(r".*supabase\.co/storage/.*"), lambda r: r.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type=("image/png" if ".png" in r.request.url else "text/plain"), body=(_PNG if ".png" in r.request.url else b"x")))
    opened = []
    ctx.on("page", lambda pg: opened.append(pg))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1500)
    check("メッセージ（画像・ファイル・動画）が6件並んでいる", page.locator("#messages .attachment").count() == 6, page.locator("#messages .attachment").count())
    def click_and_collect(sel, **kw):
        opened.clear()
        page.locator(sel).first.click(**kw)
        page.wait_for_timeout(1300)
        pgs = list(opened)
        return pgs, [pg.url for pg in pgs]
    def viewer_info(url):
        m = re.match(re.escape(BASE) + r"/fileview\.html#u=([^&]*)(?:&n=(.*))?$", url)
        return (unquote(m.group(1)), unquote(m.group(2) or "")) if m else None
    # 画像
    pgs, urls = click_and_collect('#messages a[href*="a.png"]')
    check("画像をクリック → 専用ページが『1つだけ』新しいタブで開く（link-copy.js と二重にならない）", len(urls) == 1 and viewer_info(urls[0]) and viewer_info(urls[0])[0] == sign("r1/u1/a.png"), urls)
    check("画像：名前（写真.png）が渡る", urls and viewer_info(urls[0])[1] == "写真.png", urls)
    if pgs:
        pgs[0].wait_for_timeout(800)
        check("開いた先で、画像が表示される", pgs[0].evaluate("!!document.querySelector('img.view')"))
        pgs[0].close()
    # 文字ファイル
    pgs, urls = click_and_collect('#messages a.file-card[href*="b.txt"]')
    check("txt のカードをクリック → 専用ページが 1 つだけ開く", len(urls) == 1 and viewer_info(urls[0]) and viewer_info(urls[0]) == (sign("r1/u1/b.txt"), "メモ.txt"), urls)
    for pg in pgs: pg.close()
    # 動画のリンク
    pgs, urls = click_and_collect('#messages a[href*="d.webm"]')
    check("動画のリンクをクリック → 専用ページが 1 つだけ開く", len(urls) == 1 and viewer_info(urls[0]) and viewer_info(urls[0])[0] == sign("r1/u1/d.webm"), urls)
    for pg in pgs: pg.close()
    # PDF
    pgs, urls = click_and_collect('#messages a.file-card[href*="e.pdf"]')
    check("PDF のカード → 専用ページ（ダウンロード案内）が開く", len(urls) == 1 and viewer_info(urls[0]) and viewer_info(urls[0])[0] == sign("r1/u1/e.pdf"), urls)
    for pg in pgs: pg.close()
    # docx・zip は今までどおり（保存先のURLをそのまま）
    for name in ["c.docx", "f.zip"]:
        pgs, urls = click_and_collect(f'#messages a.file-card[href*="{name}"]')
        check(f"{name} は専用ページに回さず、今までどおり", all(viewer_info(u) is None for u in urls) and (not urls or name in urls[0]), urls)
        for pg in pgs: pg.close()
    # Ctrl+クリック・中ボタン
    pgs, urls = click_and_collect('#messages a.file-card[href*="b.txt"]', modifiers=["Control"])
    check("Ctrl+クリックでも、専用ページが開く（保存先の生の表示は開かない）", urls and all(viewer_info(u) for u in urls) and len(urls) == 1, urls)
    for pg in pgs: pg.close()
    pgs, urls = click_and_collect('#messages a.file-card[href*="b.txt"]', button="middle")
    check("中ボタンクリックでも、専用ページが開く（保存先の生の表示は開かない）", urls and all(viewer_info(u) for u in urls) and len(urls) == 1, urls)
    for pg in pgs: pg.close()
    # 保存先以外のリンクは、今までどおり
    page.evaluate("""() => { const a = document.createElement('a'); a.id='extA'; a.href='https://example.com/a.txt'; a.target='_blank'; a.rel='noopener'; a.textContent='外'; document.body.appendChild(a); }""")
    pgs, urls = click_and_collect('#extA')
    check("ふつうの外部リンク（保存先以外）は、専用ページに回さない", all(viewer_info(u) is None for u in urls), urls)
    for pg in pgs: pg.close()
    # target なしの保存先リンク → 同じタブで専用ページ
    page.evaluate("""() => { const a = document.createElement('a'); a.id='sameA'; a.href=%s; a.textContent='同'; document.body.appendChild(a); }""" % json.dumps(sign("r1/u1/b.txt")))
    page.click('#sameA'); page.wait_for_timeout(1000)
    check("target なしの保存先リンクも、同じタブの専用ページで開く（生の表示にならない）", viewer_info(page.url) is not None, page.url)
    errs = [l for l in logs if l[0] == "pageerror"]
    check("画面のエラーなし", not errs, errs[:2])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
