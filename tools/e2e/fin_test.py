import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
FX="window.__fx.rpc.is_current_user_admin=function(){return false;};window.__fx.rpc.my_aibot_config=function(){return {url:'https://script.google.com/macros/s/X/exec',token:'t'};};"
def bar(page): return page.evaluate("[...document.querySelectorAll('#quickBar [data-qk^=run]')].map(b=>b.dataset.qk.slice(4))")
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=411, height=860, extra_fx=FX)
    page.goto(BASE+"/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    for name,fl,exp in [("管理者",{"is_admin":True,"other":None},True),("友人",{"other":None,"show_users":True,"quick":"q3"},True),("家庭",{"restricted":True,"other":None,"quick":"q1"},True),("その他",{"other":{"limit_admin":5},"quick":"q4"},False)]:
        page.evaluate("f=>{localStorage.clear(); segSt.flags=f; aibotSyncEntrances(); qkPaintBar();}", fl); page.wait_for_timeout(300)
        b=bar(page)
        check(f"{name}: 6つ目が🤖AIbot={exp}", (b[-1]=='tool:aibot')==exp and len(b)<=6, b)
    page.evaluate("f=>{localStorage.clear(); segSt.flags=f; aibotSyncEntrances(); qkPaintBar();}", {"is_admin":True,"other":None}); page.wait_for_timeout(300)
    check("💡の行はない", page.evaluate("!document.getElementById('qfWrap') && !document.querySelector('.qf-rec')"))
    check("チャット一覧のAIbotカードはない", page.evaluate("!document.getElementById('aibotPin')"))
    b0=bar(page); check("はじめは今までの5つ＋🤖", b0==['tool:study124','tool:itin','tool:rpg','shop','search:more','tool:aibot'], b0)
    for _ in range(4): page.evaluate("qfRecord('tool:memo')")
    page.evaluate("qkPaintBar()"); b1=bar(page)
    check("よく使う機能が入っても🤖は6つ目のまま", b1[0]=='tool:memo' and b1[-1]=='tool:aibot' and len(b1)==6, b1)
    for t in ['diary','budget','album','split','planner']:
        for _ in range(4): page.evaluate("t=>qfRecord('tool:'+t)", t)
    page.evaluate("qkPaintBar()"); b2=bar(page)
    check("よく使う機能が増えても🤖は残る", b2[-1]=='tool:aibot' and len(b2)==6, b2)
    page.click('#quickBar [data-qk="run:tool:aibot"]'); page.wait_for_timeout(500)
    check("🤖を押すとAIbotが開く", not page.evaluate("el.profileModal.hidden") and page.evaluate("!!document.getElementById('aibIn')"))
    check("エラーなし", not [l for l in logs if l[0]=='pageerror'], [l for l in logs if l[0]=='pageerror'][:2])
    page.screenshot(path='/tmp/fin.png'); browser.close()
print(sum(res),'/',len(res))
