import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 411; H = int(sys.argv[2]) if len(sys.argv) > 2 else 860
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=W, height=H, extra_fx=EXTRA, touch=(W < 700))
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(6500)
    page.locator("#roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1500)
    page.evaluate("document.getElementById('messageInput').blur()"); page.wait_for_timeout(700)
    n = page.evaluate("document.querySelectorAll('#messages [data-tool=selcopy]').length")
    check("メッセージに ☑️（選んでコピー）ボタンが出る", n >= 2, n)
    page.locator("#messages [data-tool=selcopy]").first.click(); page.wait_for_timeout(300)
    st = page.evaluate("({mode: document.body.classList.contains('sel-mode'), bar: !document.getElementById('selBar').hidden, on: document.querySelectorAll('.message-row.sel-on').length, composer: getComputedStyle(document.querySelector('.composer')).display, cnt: document.querySelector('#selBar .sel-count').innerText})")
    check("選ぶモード：バーが出て 入力欄が かくれ、1件 選ばれている", st["mode"] and st["bar"] and st["on"] == 1 and st["composer"] == "none", st)
    page.locator("#messages article[data-mid]").nth(1).locator(".bubble").click(position={"x": 10, "y": 10}); page.wait_for_timeout(300)
    on = page.evaluate("document.querySelectorAll('.message-row.sel-on').length")
    check("もう1件 タップすると 2件に（リンクは開かない）", on == 2, on)
    page.screenshot(path=f"/tmp/shots/sel_{W}.png")
    page.click("#selBar [data-sel=copy]"); page.wait_for_timeout(500)
    clip = page.evaluate("navigator.clipboard.readText()")
    check("コピー：名前・時刻・本文が 古い順に入る", "こんにちは" in clip and "やあ" in clip and clip.index("やあ") < clip.index("こんにちは") and "（" in clip, repr(clip))
    check("コピー後は 選ぶモードが終わる", not page.evaluate("document.body.classList.contains('sel-mode')") and page.evaluate("getComputedStyle(document.querySelector('.composer')).display") != "none")
    # 全部／やめる／タップで外す
    page.locator("#messages [data-tool=selcopy]").nth(1).click(); page.wait_for_timeout(200)
    page.click("#selBar [data-sel=all]"); page.wait_for_timeout(200)
    a = page.evaluate("document.querySelectorAll('.message-row.sel-on').length"); total = page.evaluate("document.querySelectorAll('#messages article[data-mid]').length")
    check("「全部」で すべて 選ばれる", a == total and total >= 2, (a, total))
    page.click("#selBar [data-sel=all]"); page.wait_for_timeout(200)
    check("「全部はずす」で 0件。コピーは 押せない", page.evaluate("document.querySelectorAll('.message-row.sel-on').length") == 0 and page.evaluate("document.querySelector('#selBar [data-sel=copy]').disabled"))
    page.click("#selBar [data-sel=cancel]"); page.wait_for_timeout(200)
    check("「やめる」で もとの画面", not page.evaluate("document.body.classList.contains('sel-mode')"))
    # 選ぶモード中の更新（再描画）でも 選びが残る
    page.locator("#messages [data-tool=selcopy]").first.click(); page.wait_for_timeout(200)
    page.evaluate("renderMessages(false)"); page.wait_for_timeout(300)
    check("画面の更新があっても 選びが残る", page.evaluate("document.querySelectorAll('.message-row.sel-on').length") == 1)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Esc でも やめられる", not page.evaluate("document.body.classList.contains('sel-mode')"))
    errs = [l for l in logs if l[0] in ("error", "pageerror") and "supabase" not in l[1].lower() and "Failed to load resource" not in l[1]]
    check("コンソールにエラーなし", not errs, errs[:3])
    browser.close()
print("結果:", sum(res), "/", len(res))
