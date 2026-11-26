import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
FX="window.__fx.rpc.is_current_user_admin=function(){return false;};window.__fx.rpc.my_aibot_config=function(){return {url:'https://script.google.com/macros/s/X/exec',token:'t'};};"
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=411, height=860, extra_fx=FX)
    page.goto(BASE+"/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    page.evaluate("segSt.flags={other:null,show_users:true,is_admin:true}; aibotSyncEntrances(); pb.avail=true; pb.unseen=2; pbPinPaint(); qfPaint()"); page.wait_for_timeout(500)
    bar0 = page.evaluate("[...document.querySelectorAll('#quickBar [data-qk^=run]')].map(b=>b.dataset.qk.slice(4))")
    check("最大は6つ", page.evaluate("QK_MAX")==6)
    check("はじめは今までと同じ(自動・5つ)", bar0==page.evaluate("qkDefaultList()") and page.evaluate("qkIsAuto()"), bar0)
    for _ in range(4): page.evaluate("qfRecord('tool:memo')")
    page.wait_for_timeout(600)
    bar1 = page.evaluate("[...document.querySelectorAll('#quickBar [data-qk^=run]')].map(b=>b.dataset.qk.slice(4))")
    check("4回使ったメモが先頭に自動で入る(6つ)", bar1[0]=='tool:memo' and len(bar1)==6 and len(set(bar1))==6, bar1)
    page.evaluate("qfRecord('tool:budget')"); page.wait_for_timeout(300)
    check("1〜2回だけでは入れかわらない", 'tool:budget' not in page.evaluate("qkLoad()"))
    rec = page.evaluate("[...document.querySelectorAll('.qf-rec .qf-b')].map(b=>b.dataset.qf)")
    check("おすすめにバーの機能は入らない", not set(rec)&set(bar1), rec)
    check("🔥の列はもう無い", page.evaluate("!document.querySelector('.qf-freq')"))
    # 手動で外す→固定
    page.evaluate("qkAction('off','tool:memo')"); 
    check("自分で変えると固定(自動ではなくなる)", not page.evaluate("qkIsAuto()") and 'tool:memo' not in page.evaluate("qkLoad()"))
    for _ in range(5): page.evaluate("qfRecord('tool:memo')")
    check("固定中は勝手に入れかわらない", 'tool:memo' not in page.evaluate("qkLoad()"))
    page.evaluate("qkAction('reset','')")
    check("自動にもどすで復活", page.evaluate("qkIsAuto()") and page.evaluate("qkLoad()")[0]=='tool:memo')
    # タウン
    check("タウンボタンが グループ作成・友達追加・すべて と同じ行", page.evaluate("(()=>{const b=document.getElementById('pbPinIcon');return b&&b.textContent.includes('タウン')&&b.parentNode.className==='section-heading'&&b.parentNode.contains(document.getElementById('newGroupButton'))&&b.previousElementSibling!==null})()"))
    check("エラーなし", not [l for l in logs if l[0]=='pageerror'], [l for l in logs if l[0]=='pageerror'][:2])
    page.screenshot(path='/tmp/qk.png'); browser.close()
print(sum(res),'/',len(res))
