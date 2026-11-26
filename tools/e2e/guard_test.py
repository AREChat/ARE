import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800)
    # バンドルを 4 秒おくらせて「読み込み中に押す」状態を作る
    held=[]
    page.route("**/chat.bundle.js*", lambda r: held.append(r))
    page.goto(BASE+"/chat.html", wait_until="commit")
    page.wait_for_timeout(800)
    page.evaluate("var b=document.createElement('button');b.id='tstBtn';b.textContent='x';b.style.cssText='position:fixed;top:60px;left:10px;z-index:99999;width:80px;height:40px';document.body.appendChild(b);")
    page.evaluate("document.getElementById('hdrForce')&&document.getElementById('hdrForce').remove()")
    page.click('#tstBtn')
    t=page.evaluate("(document.getElementById('guardToast')||{}).textContent||''")
    check("読み込み中に押すと『読み込み中です』と出る", '読み込み中' in t and '未実装' not in t, t)
    for r in held: r.continue_()
    page.wait_for_timeout(7000)
    ready = page.evaluate("typeof AREFeatures!=='undefined'")
    # 起動後は つながっていないボタンで 従来どおり 未実装
    page.evaluate("document.getElementById('guardToast').textContent=''; window.__t=0")
    page.wait_for_timeout(2700)
    # 起動の合図がきたか（booted）: 起動後にもう一度押す
    page.evaluate("document.getElementById('hdrForce')&&document.getElementById('hdrForce').remove()")
    page.click('#tstBtn'); t2=page.evaluate("(document.getElementById('guardToast')||{}).textContent||''")
    check("起動完了後は 従来どおり『未実装です』", '未実装' in t2, t2)
print(sum(res),"/",len(res))
