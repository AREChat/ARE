import sys
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(2500)
    r = page.evaluate("""()=>{const b=document.getElementById('installAppButton'), i=document.getElementById('installAppItem');
      const vis=(e)=>!!e && !e.hidden && e.getBoundingClientRect().width>0 && getComputedStyle(e).display!=='none';
      return {btnVisible: vis(b), itemHidden: i?i.hidden:null, itemParent: i&&i.parentElement.className}}""")
    print("A チャットタブの📲は見えない:", not r["btnVisible"], r)
    print("B その他に『アプリとして追加』がある:", r["itemHidden"] is False and "pane-more" in (r["itemParent"] or ""))
    page.evaluate("()=>document.querySelector('[data-tab=more], .rail-btn[data-tab=\"more\"]') && document.querySelector('[data-tab=more]').click()"); page.wait_for_timeout(500)
    page.evaluate("()=>document.getElementById('installAppItem').click()"); page.wait_for_timeout(800)
    print("C 押すと手順の案内が開く:", page.evaluate("()=>!!document.getElementById('hdrInstallSheet')"))
    errs = [l for l in logs if l[0]=="pageerror"]; print("D 画面エラーなし:", not errs, errs[:2])
    browser.close()
