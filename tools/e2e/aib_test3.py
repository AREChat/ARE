import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
FX="""window.__fx.rpc.is_current_user_admin=function(){return false;};
window.__fx.rpc.my_aibot_config=function(){ return window.__shared===false?null:{url:'https://script.google.com/macros/s/SHARED123/exec',token:'sharedtok'}; };"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=FX)
    calls=[]
    CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
    def gas(r):
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers=CORS,body='')
        if not r.request.post_data: return r.fulfill(status=200,headers=CORS,content_type='application/json',body='{}')
        calls.append((r.request.url, json.loads(r.request.post_data)))
        r.fulfill(status=200,headers=CORS,content_type='application/json',body=json.dumps({'ok':True,'reply':'ひらいたよ'}))
    ctx.route("https://script.google.com/**", gas)
    page.goto(BASE+"/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    page.evaluate("segSt.flags={other:null,show_users:true}; aibotSyncEntrances()"); page.wait_for_timeout(500)
    check("共通設定を自動で受け取った", page.evaluate("!!feat.aib.shared"))
    check("端末(localStorage)に保存されていない", not page.evaluate("Object.keys(localStorage).some(k=>k.startsWith('are_aibot_cfg') && localStorage.getItem(k).includes('sharedtok'))"))
    page.evaluate("openAiBot()"); page.wait_for_timeout(200)
    page.fill('#aibIn','やあ'); page.click('#aibSend'); page.wait_for_timeout(600)
    check("入力なしで送れて返事が出る", 'ひらいたよ' in page.inner_text('#aibLog'))
    check("共通のURL・合言葉で送った", calls and 'SHARED123' in calls[-1][0] and calls[-1][1]['token']=='sharedtok')
    # その他: サーバーが null
    page.evaluate("window.__shared=false; state.user={id:'u9'}; aibEnsure(); segSt.flags={other:null}")
    page.evaluate("aibLoadShared()"); page.wait_for_timeout(300)
    check("渡されない人は共通設定なし", page.evaluate("!feat.aib.shared && !aibConn()"))
    check("エラーなし", not [l for l in logs if l[0]=='pageerror'], [l for l in logs if l[0]=='pageerror'][:2])
    browser.close()
print(sum(res),'/',len(res))
