import sys, os, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
EXTRA = open(HERE + "/chat_test.py", encoding="utf-8").read().split('EXTRA = """')[1].split('"""')[0] + "\nwindow.__fx.rpc.my_access = function(){ return {points:120, admin:true, trial_active:true, trial_ends:'2099-01-01T00:00:00Z', streak:1, passes:[]}; };\n"
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=EXTRA)
    page.on("dialog", lambda d: d.dismiss())
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1500)
    page.locator("#roomList button, #roomList .room, #roomList [data-room], #roomList > *").filter(has_text="みどり").first.click(); page.wait_for_timeout(1000)
    page.evaluate("() => document.querySelector('[data-tool=calc]').click()"); page.wait_for_timeout(600)
    html = page.evaluate("() => document.getElementById('profileSheet').innerHTML")
    import re
    print("電卓のボタン例:", re.findall(r'<button[^>]*data-t="calc:[^"]*"[^>]*>[^<]*</button>', html)[:6])
    for label in ["7", "+", "8", "="]:
        page.evaluate("(l) => { const b = [...document.querySelectorAll('#profileSheet button')].find(x => (x.textContent||'').trim() === l); if(b) b.click(); }", label); page.wait_for_timeout(150)
        print("押した:", label, "→ 式:", page.evaluate("() => (document.getElementById('clExpr')||{}).value"), "| 結果欄:", page.evaluate("() => (document.getElementById('clOut')||document.querySelector('#profileSheet .calc-out,#profileSheet [id*=Out],#profileSheet [id*=Res]')||{innerText:'?'}).innerText"))
    print("エラー:", [l for l in logs if l[0] == "pageerror"][:3])
    browser.close()
if srv: srv.terminate()
