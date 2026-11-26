import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
W = int(sys.argv[1]); H = int(sys.argv[2])
JS = """() => { const h = document.querySelector('.chat-header'); const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const btns = [...h.children].filter(e => e.tagName === 'BUTTON');
  return {all: btns.map(e => e.id || e.className.slice(0,20)), vis: btns.filter(vis).map(e => e.id || e.className.slice(0,20)), open: h.classList.contains('hdr-open'), dots: !!document.getElementById('hdrMoreBtn') && vis(document.getElementById('hdrMoreBtn')), hh: Math.round(h.getBoundingClientRect().height)}; }"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=W, height=H, extra_fx=EXTRA, touch=(W < 700))
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(6500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1500)
    page.evaluate("document.getElementById('messageInput').blur()"); page.wait_for_timeout(700)
    v = page.evaluate(JS); print(v)
    if W <= 700:
        check("スマホ：最初は「戻る」と「⋯」だけ", v["dots"] and set(v["vis"]) <= {"backButton", "hdrMoreBtn"} and "hdrMoreBtn" in v["vis"], v["vis"])
        page.screenshot(path=f"/tmp/shots/dots_{W}_closed.png")
        page.click("#hdrMoreBtn"); page.wait_for_timeout(300)
        v2 = page.evaluate(JS)
        check("⋯を押すと 🔍 などが出る", v2["open"] and "searchBtn" in v2["vis"] and len(v2["vis"]) > len(v["vis"]), v2["vis"])
        page.screenshot(path=f"/tmp/shots/dots_{W}_open.png")
        page.click("#searchBtn"); page.wait_for_timeout(500)
        shown = page.evaluate("[...document.querySelectorAll('#profileModal:not([hidden]), .sheet, .modal')].some(e => e.getBoundingClientRect().width > 0)")
        check("開いた 🔍 が 押せて 画面が出る", shown)
        page.evaluate("(() => { const m = document.getElementById('profileModal'); if(m) m.hidden = true; })()"); page.wait_for_timeout(300)
        page.click("#hdrMoreBtn"); page.wait_for_timeout(300)
        check("もう一度 ⋯ で かくれる", not page.evaluate(JS)["open"])
        # キーボード中
        page.tap("#messageInput"); page.evaluate("document.getElementById('messageInput').focus()"); page.wait_for_timeout(400)
        v3 = page.evaluate(JS); check("入力中は 戻る・⋯ だけで 小さい", set(v3["vis"]) <= {"backButton", "hdrMoreBtn"} and v3["hh"] <= 60, (v3["vis"], v3["hh"]))
        page.screenshot(path=f"/tmp/shots/dots_{W}_typing.png")
        # 日誌ボタン（📔）：設定があるときは ⋯ なしで いつも見える
        page.evaluate("document.getElementById('messageInput').blur()"); page.wait_for_timeout(700)
        page.evaluate("(() => { const b = document.getElementById('roomLinkBtn'); b.hidden = false; b.textContent = '📔'; })()"); page.wait_for_timeout(200)
        v4 = page.evaluate(JS); check("📔（日誌）は ⋯ を押さなくても 見える", "roomLinkBtn" in v4["vis"] and not v4["open"], v4["vis"])
        page.screenshot(path=f"/tmp/shots/dots_{W}_diary.png")
    else:
        check("パソコン・タブレット：⋯ は出ない／ボタンは いままで通り", not v["dots"] and "searchBtn" in v["vis"], v["vis"])
        page.screenshot(path=f"/tmp/shots/dots_{W}.png")
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "supabase" not in l[1].lower() and "Failed to load resource" not in l[1]]
    check("コンソールにエラーなし", not errs, errs[:3])
    browser.close()
print("結果:", sum(res), "/", len(res))
