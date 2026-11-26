import sys, time, shutil
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
HTML="/home/claude/are/chat.html"
orig=open(HTML,encoding='utf-8').read()
try:
    with sync_playwright() as p:
        browser, ctx, page, logs = new_page(p, width=411, height=860, extra_fx="", touch=True)
        page.goto(BASE+"/chat.html"); time.sleep(4); page.goto(BASE+"/chat.html"); time.sleep(3)
        print("SW制御中:", page.evaluate("!!navigator.serviceWorker.controller"))
        open(HTML,'w',encoding='utf-8').write(orig.replace("</body>","<!--NEWVERSION--></body>"))
        t0=time.time(); page.goto(BASE+"/chat.html", wait_until="domcontentloaded")
        first = page.evaluate("document.documentElement.outerHTML.includes('NEWVERSION')")
        print("開いた直後は控えの版(NEWVERSIONなし)=", not first, "(%.2fs)"%(time.time()-t0))
        time.sleep(4)
        now = page.evaluate("document.documentElement.outerHTML.includes('NEWVERSION')")
        print("数秒後に自動で最新へ=", now)
        # 触った後は開き直さない
        open(HTML,'w',encoding='utf-8').write(orig.replace("</body>","<!--NEWVERSION2--></body>"))
        page.goto(BASE+"/chat.html", wait_until="domcontentloaded"); page.mouse.click(10,10); page.keyboard.press("a"); time.sleep(4)
        print("触っていたら開き直さない=", not page.evaluate("document.documentElement.outerHTML.includes('NEWVERSION2')"))
        print("errors:", [l for l in logs if l[0]=='pageerror'][:3])
        browser.close()
finally:
    open(HTML,'w',encoding='utf-8').write(orig)
