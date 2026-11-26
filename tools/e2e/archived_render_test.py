import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:300]) if note else ""))
HOST = "https://kzrrnuzzvwijujhlbtln.supabase.co"
def row(i, content): return {"id": f"m{i}", "room_id": "r1", "sender_id": "u1", "content": json.dumps(content, ensure_ascii=False), "created_at": f"2026-10-01T01:0{i}:00Z", "edited_at": None, "expires_at": None, "is_auto_reply": False}
AT = {"at": "2026-11-01T00:00:00+00:00", "to": "drive"}
MSGS = [
  row(1, {"type": "file", "name": "メモ.txt", "archived": AT, "mimeType": "text/plain", "size": 500}),
  row(2, {"type": "file", "name": "新しい.txt", "url": HOST + "/storage/v1/object/sign/chat-attachments/r1/u1/b.txt?token=t", "path": "r1/u1/b.txt", "mimeType": "text/plain", "size": 500}),
  row(3, {"type": "file", "name": "<img src=x onerror=window.__pwn=1>.txt", "archived": AT, "size": 5}),
  row(4, {"type": "file", "archived": AT}),
  row(5, {"type": "text", "text": "ふつうの文章 archived"}),
  row(6, {"type": "image", "name": "写真.png", "archived": AT, "size": 5}),
]
EXTRA = "window.__fx.tables.messages = " + json.dumps(MSGS, ensure_ascii=False) + ";\nwindow.__fx.rpc.is_current_user_admin = function(){ return false; };\n"
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=900, height=900, touch=False, extra_fx=EXTRA)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1500)
    cards = page.locator("#messages .file-card.archived")
    check("移したファイル（4件：ファイル3＋画像1）が『案内カード』で出る", cards.count() == 4, cards.count())
    check("案内の文：30日たったので、チャットからは消えました…Google ドライブ", all(("30日たった" in cards.nth(i).inner_text() and "Google ドライブ" in cards.nth(i).inner_text()) for i in range(cards.count())), cards.nth(0).inner_text())
    card = lambda m: page.locator('article[data-mid="'+m+'"] .file-card.archived').first
    check("ファイル名が出る（メモ.txt）", "メモ.txt" in card("m1").inner_text(), card("m1").inner_text())
    check("名前がないときは『添付ファイル』と出る", "添付ファイル" in card("m4").inner_text(), card("m4").inner_text())
    check("『URLが不正』という表示は出ない", "URLが不正" not in page.locator("#messages").inner_text())
    check("名前に入れた <img onerror> は動かない（文字として出る）", page.evaluate("!window.__pwn") and page.locator("#messages img[src='x']").count() == 0 and "<img" in card("m3").inner_text(), card("m3").inner_text())
    check("移したカードはリンクではない（押しても何も開かない）", page.locator("#messages a.file-card.archived, #messages .file-card.archived a").count() == 0)
    check("まだ移していないファイルは、いつもどおりのカード（リンク）", page.locator('#messages a.file-card[href*="b.txt"]').count() == 1)
    check("ふつうの文章（archived という語を含む）はそのまま表示", "ふつうの文章 archived" in page.locator("#messages").inner_text())
    # 操作ボタン
    def tools_for(mid): return page.evaluate("(m)=>Array.from(document.querySelectorAll('article[data-mid=\"'+m+'\"] [data-tool]')).map(b=>b.dataset.tool)", mid)
    t1, t2 = tools_for("m1"), tools_for("m2")
    check("移したファイルには『端末に保存』『転送』のボタンを出さない", "save" not in t1 and "forward" not in t1, t1)
    check("返信などほかのボタンは残る", "reply" in t1, t1)
    check("まだ移していないファイルには、保存・転送が残る", "save" in t2 and "forward" in t2, t2)
    page.locator('article[data-mid="m1"] [data-tool="reply"]').first.click(); page.wait_for_timeout(500)
    check("移したファイルへの返信も、エラーなく始められる", not [l for l in logs if "error" in str(l).lower() and "supabase" not in str(l).lower()][:1], [l for l in logs][-3:])
    errs = [l for l in logs if "pageerror" in str(l).lower() or "uncaught" in str(l).lower()]
    check("画面にエラーが出ていない", not errs, errs[:2])
    browser.close()
print("合計", len(res), "失敗", res.count(False))
sys.exit(1 if False in res else 0)
