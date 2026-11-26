import sys, os, json, random
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
print("配信元:", SRC, "port", PORT)
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0]
def sent(page):
    return page.evaluate("() => window.__calls.filter(c => c.rpc === 'send_message').map(c => { let t=''; try{ t = JSON.parse(c.args.p_content).text; }catch(e){}; return Array.from(t).length; })")
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList button, #roomList .room, #roomList [data-room], #roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1200)
    print("入力欄の上限(maxlength):", page.evaluate("() => document.getElementById('messageInput').maxLength"))
    rnd = lambda n: "".join(random.choice("あいうえおかきくけこ漢字テスト😀") for _ in range(n))
    for n in (3999, 4000, 4001, 4100):
        page.evaluate("() => { window.__calls.length = 0; }")
        t = rnd(n)
        page.fill("#messageInput", ""); page.focus("#messageInput")
        page.keyboard.insert_text(t); page.wait_for_timeout(400)
        typed = page.evaluate("() => Array.from(document.getElementById('messageInput').value).length")
        counter = page.inner_text("#charCount")
        disabled = page.evaluate("() => document.getElementById('sendButton').disabled")
        page.evaluate("() => { const t = document.getElementById('toast'); if(t) t.classList.remove('show'); }")
        page.focus("#messageInput"); page.keyboard.press("Enter"); page.wait_for_timeout(1200)
        s = sent(page)
        toast = page.evaluate("() => { const t = document.getElementById('toast'); return t && t.classList.contains('show') ? t.textContent : ''; }")
        remain = page.evaluate("() => Array.from(document.getElementById('messageInput').value).length")
        print(f"{n}文字 → 入力できた:{typed} / 数の表示:{counter} / 送信ボタン無効:{disabled} / Enterで送られた:{s} / 画面の通知:{toast[:30]!r} / 入力欄に残り:{remain}")
        page.fill("#messageInput", "")
    print("pageerror:", [l for l in logs if l[0] == "pageerror"][:3])
    browser.close()
if srv: srv.terminate()
