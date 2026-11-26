import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
for mobile in (False, True):
  for label, txt in (("A あ×4000","あ"*4000), ("B 4000字(改行・引用符・絵文字つき)", (("行1 \"引用\" 😀\n")*400)[:4000]), ("C 日本語3000字", "日本語の長い文章です。"*300)):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx, pg, lg = mkpage(b, "u-me", "", mobile=mobile)
        pg.goto(BASE + "/chat.html"); pg.wait_for_selector("#roomList"); pg.wait_for_timeout(1200)
        pg.click('[data-room-id="r1"]'); pg.wait_for_timeout(1200)
        pg.fill("#messageInput", txt); pg.wait_for_timeout(300)
        st = pg.evaluate("()=>[document.getElementById('charCount').textContent, document.getElementById('sendButton').disabled]")
        pg.evaluate("()=>document.getElementById('sendButton').click()"); pg.wait_for_timeout(1500)
        toast = pg.evaluate("()=>(document.getElementById('toast')||{}).textContent"); stat = pg.evaluate("()=>(document.getElementById('attachmentStatus')||{}).textContent")
        shown = pg.evaluate("()=>[...document.querySelectorAll('#messages .bubble')].map(b=>b.textContent.length)")
        inp = pg.evaluate("()=>document.getElementById('messageInput').value.length")
        print(label, "mobile" if mobile else "pc", "count/disabled", st, "toast:", toast, "status:", stat, "bubbles:", shown[-2:], "input after:", inp, [x for x in lg if x[0]=="pageerror"][:2])
        b.close()
