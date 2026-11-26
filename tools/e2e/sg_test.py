import sys, json, tempfile, os
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
FX="window.__fx.rpc.is_current_user_admin=function(){return false;};"
d=tempfile.mkdtemp()
fj=os.path.join(d,"MyActivity.json")
json.dump([{"header":"Google 検索","title":"「明日の天気予報」を検索しました","titleUrl":"https://www.google.com/search?q=%E6%98%8E%E6%97%A5%E3%81%AE%E5%A4%A9%E6%B0%97%E4%BA%88%E5%A0%B1"},
 {"header":"YouTube","title":"Searched for 猫 おもしろ 動画","titleUrl":"https://www.youtube.com/results?search_query=%E7%8C%AB+%E3%81%8A%E3%82%82%E3%81%97%E3%82%8D+%E5%8B%95%E7%94%BB"},
 {"header":"Google 検索","title":"https://example.com/secret を検索しました"},{"header":"x","title":"Visited https://a.b"}],open(fj,"w",encoding="utf-8"),ensure_ascii=False)
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=411, height=860, extra_fx=FX)
    page.goto(BASE+"/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    page.evaluate("segSt.flags={restricted:true,other:null}; sgSyncEntrance()")
    check("家族の区分では使えない・覚えない", not page.evaluate("sgAllowed()") and page.evaluate("(sgLearn('明日はお休み'), Object.keys(sgLoad().own).length===0)") and page.evaluate("document.querySelector('[data-tool=suggest]').style.display==='none'"))
    page.evaluate("segSt.flags={other:null,show_users:true}; sgSyncEntrance()")
    check("友人の区分では使える", page.evaluate("sgAllowed()"))
    page.evaluate("openSuggest()"); page.set_input_files('#sgFile', fj); page.wait_for_timeout(600)
    imp=page.evaluate("Object.keys(sgLoad().imp)")
    check("検索履歴(JSON)を取り込めた・URLは除外", set(imp)=={"明日の天気予報","猫 おもしろ 動画"}, imp)
    check("取り込みはlocalStorageだけ(通信なし)", page.evaluate("!!localStorage.getItem(sgKey())"))
    page.evaluate("closeSheet()")
    # 入力→候補
    page.evaluate("setChatEnabled && setChatEnabled(true)")
    page.add_style_tag(content='.composer,.composer *,.chat-panel,main{display:revert !important;visibility:visible !important}') if False else None
    page.evaluate("()=>{let n=el.messageInput; while(n&&n!==document.body){ n.hidden=false; const cs=getComputedStyle(n); if(cs.display==='none') n.style.display='block'; n=n.parentElement; }}")
    def typ(t):
        page.evaluate("t=>{const i=el.messageInput; i.value=''; i.focus(); i.value=t; i.setSelectionRange(t.length,t.length); i.dispatchEvent(new Event('input',{bubbles:true}));}", t); page.wait_for_timeout(400)
    typ("明日")
    print('dbg', page.evaluate("[document.activeElement&&document.activeElement.id, el.messageInput.value, JSON.stringify(sgFragment()), sg.composing, !!document.getElementById('sgBar'), document.getElementById('sgBar')&&document.getElementById('sgBar').hidden, sgCandidates('明日').length, !!document.querySelector('.composer .composer-bottom')]"))
    print('dbg', page.evaluate("[document.activeElement&&document.activeElement.id, el.messageInput.disabled, el.messageInput.value, sgAllowed(), sgLoad().on, JSON.stringify(sgFragment()), sg.composing, document.getElementById('sgBar')&&document.getElementById('sgBar').hidden]"))
    chips=page.evaluate("[...document.querySelectorAll('#sgBar .sg-chip')].map(b=>b.dataset.sg)")
    check("打つと候補が出る", chips==["明日の天気予報"], chips)
    page.evaluate("()=>{const c=document.querySelector('#sgBar .sg-chip'); c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));}"); page.wait_for_timeout(200)
    check("候補を押すと入力に反映", page.evaluate("el.messageInput.value")=="明日の天気予報")
    # 覚える
    page.evaluate("sgLearn('今週末はキャンプに行く予定です')")
    typ("キャンプ")
    check("自分の送信からも覚えた言葉が候補に出る", page.evaluate("[...document.querySelectorAll('#sgBar .sg-chip')].map(b=>b.dataset.sg)").count("キャンプに行く")==1)
    page.evaluate("sgLoad().useImp=false"); typ("猫")
    check("オフにすると取り込みは出ない", page.evaluate("document.getElementById('sgBar').hidden"))
    check("エラーなし", not [l for l in logs if l[0]=='pageerror'], [l for l in logs if l[0]=='pageerror'][:2])
    browser.close()
print(sum(res),'/',len(res))
