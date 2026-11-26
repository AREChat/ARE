import sys, json, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
FX="""window.__fx.rpc.is_current_user_admin=function(){return false;};
window.__fx.rpc.my_aibot_config=function(){return {url:'https://script.google.com/macros/s/X/exec',token:'t'};};"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=411, height=860, extra_fx=FX, touch=False)
    page.goto(BASE+"/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    page.evaluate("segSt.flags={other:null,show_users:true}; aibotSyncEntrances(); qfPaint()"); page.wait_for_timeout(600)
    check("履歴ゼロでも おすすめ列が出る(はじめの提案)", page.evaluate("!!document.querySelector('.qf-rec .qf-b')"))
    check("よく使う列は まだ出ない", page.evaluate("!document.querySelector('.qf-freq')"))
    # 機能を実際に押して数える（その他タブの ボタン）
    for tid in ['memo','memo','memo','budget','budget','diary']:
        page.evaluate("t=>{ qfRecord('tool:'+t); }", tid); page.wait_for_timeout(100)
    page.evaluate("setTab('chats')"); page.wait_for_timeout(900)
    freq = page.evaluate("[...document.querySelectorAll('.qf-freq .qf-b')].map(b=>b.dataset.qf)")
    check("よく使う順に並ぶ(メモ→家計簿→日記)", freq[:3]==['tool:memo','tool:budget','tool:diary'], freq)
    rec = page.evaluate("[...document.querySelectorAll('.qf-rec .qf-b')].map(b=>b.dataset.qf)")
    check("おすすめに よく使うものは入らない", not set(rec)&set(freq), rec)
    check("おすすめは 似たなかま(メモ・お金)から", any(x in rec for x in ['tool:oneline','tool:secret','tool:stars','tool:split','tool:calc','tool:shop']), rec)
    check("アイコンだけ(ボタンに文字なし)", page.evaluate("[...document.querySelectorAll('.qf-b')].every(b=>b.textContent.trim().length<=3 && b.getAttribute('aria-label'))"))
    order = page.evaluate("(()=>{const a=document.getElementById('aibotPin'),w=document.getElementById('qfWrap'),r=document.getElementById('roomList');return [a&&a.nextElementSibling===w, w.nextElementSibling===r]})()")
    check("AIbotの すぐ下・一覧の上", order==[True,True], order)
    page.screenshot(path='/tmp/qf.png')
    print('vis', page.evaluate("(()=>{const w=document.getElementById('qfWrap');const r=w.getBoundingClientRect();const cs=getComputedStyle(w);return [r.width,r.height,cs.display,w.hidden, getComputedStyle(document.querySelector('.pane-chats')).display]})()"))
    # 押すと開く
    page.click('.qf-freq .qf-b >> nth=0'); page.wait_for_timeout(500)
    check("アイコンを押すと機能が開く", page.evaluate("!!document.querySelector('.memo-screen, #memoView, [data-memo-root]') || !el.profileModal.hidden || document.body.innerText.includes('このメモは自分だけ')"))
    page.evaluate("closeSheet()")
    # 記録はユーザーごと
    check("端末に保存(アカウントごと)", page.evaluate("Object.keys(localStorage).some(k=>k.startsWith('are_use_v1_'))"))
    # 🤖 重なり
    check("🤖はAIbotだけ(ツール一覧)", page.evaluate("TOOL_LIST.filter(t=>t[1]==='🤖').map(t=>t[0]).join()")=='aibot')
    check("エラーなし", not [l for l in logs if l[0]=='pageerror'], [l for l in logs if l[0]=='pageerror'][:2])
    page.screenshot(path='/tmp/qf.png'); browser.close()
print(sum(res),'/',len(res))
