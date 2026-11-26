import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res=[]
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ")+n+((" : "+str(note)) if note else ""))
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx="window.__fx.rpc.is_current_user_admin=function(){return false;};")
    calls=[]
    CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
    def gas(r):
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers=CORS,body='')
        if not r.request.post_data: return r.fulfill(status=200,headers=CORS,content_type='application/json',body='{}')
        body=json.loads(r.request.post_data); calls.append((r.request.headers.get('content-type'),body))
        out={'ok':False,'code':'auth'} if body.get('token')!='good' else {'ok':True,'reply':'こんにちは！'}
        r.fulfill(status=200,headers=CORS,content_type='application/json',body=json.dumps(out))
    ctx.route("https://script.google.com/**", gas)
    page.goto(BASE+"/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    check("機能が読み込まれた", page.evaluate("typeof initAiBot==='function' && !!feat.aib"))
    # 区分がまだわからない
    page.evaluate("segSt.flags=null; aibotSyncEntrances()")
    check("区分不明のあいだは出ない", page.evaluate("!aibAllowed() && (!document.getElementById('aibotPin') || document.getElementById('aibotPin').style.display==='none')"))
    for name,fl,exp in [("その他",{"other":{"limit_admin":5}},False),("家庭",{"restricted":True,"other":None},True),("社員",{"other":None,"show_users":True},True),("友人",{"other":None,"show_users":True},True),("管理者",{"is_admin":True,"other":None},True)]:
        page.evaluate("f=>{segSt.flags=f; aibotSyncEntrances()}", fl)
        ok = page.evaluate("aibAllowed()")==exp
        pin = page.evaluate("(()=>{const e=document.getElementById('aibotPin');return !!e && e.style.display!=='none'})()")
        tool = page.evaluate("(()=>{const e=document.querySelector('[data-tool=aibot]');return !!e && e.style.display!=='none'})()")
        check(f"区分「{name}」 使える={exp}", ok and pin==exp and tool==exp, f"pin={pin} tool={tool}")
    page.evaluate("segSt.flags={other:{limit_admin:5}}; aibotSyncEntrances(); openAiBot()")
    check("その他は画面が開かない", page.evaluate("el.profileModal.hidden"))
    page.evaluate("segSt.flags={other:null,show_users:true}; aibotSyncEntrances()")
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    page.evaluate("document.getElementById('aibotPin').click()")
    page.wait_for_timeout(300)
    check("ピンを押すと画面が開く", not page.evaluate("el.profileModal.hidden"))
    page.click('[data-t="aibot:settings"]')
    page.fill('#aibUrl','http://evil.example/exec'); page.click('[data-t="aibot:save"]')
    check("GAS以外のURLは保存されない", page.evaluate("feat.aib.cfg.url===''"))
    page.fill('#aibUrl','https://script.google.com/macros/s/ABC123/exec'); page.fill('#aibToken','bad'); page.click('[data-t="aibot:save"]')
    page.fill('#aibIn','テスト'); page.click('#aibSend'); page.wait_for_timeout(700)
    check("合言葉ちがいで説明が出る", '合言葉' in page.inner_text('#aibLog'), page.inner_text('#aibLog')[-40:])
    page.click('[data-t="aibot:settings"]'); page.fill('#aibToken','good'); page.click('[data-t="aibot:save"]')
    page.fill('#aibIn','こんにちは'); page.click('#aibSend'); page.wait_for_timeout(700)
    check("返事が表示される", 'こんにちは！' in page.inner_text('#aibLog'))
    ct, body = calls[-1]
    check("text/plain で送る", ct and ct.startswith('text/plain'), ct)
    check("送る項目は token/system/messages だけ", sorted(body.keys())==['messages','system','token'], sorted(body.keys()))
    check("送った会話はbot画面の文だけ", all(m['role'] in ('user','assistant') for m in body['messages']) and body['messages'][-1]['content']=='こんにちは')
    # 保存先はlocalStorageのみ・ユーザーごと
    page.evaluate("state.user={id:'u2'}; aibEnsure()")
    check("別アカウントには記録・設定が見えない", page.evaluate("feat.aib.hist.length===0 && feat.aib.cfg.url===''"))
    page.evaluate("state.user={id:'u-me'}; aibEnsure()")
    check("元のアカウントでは残っている", page.evaluate("feat.aib.hist.length>=2"))
    page.click('[data-pm="close"]') if page.query_selector('[data-pm="close"]') else None
    page.evaluate("openAiBot()"); page.once('dialog', lambda d: d.accept()); page.click('[data-t="aibot:clear"]'); page.wait_for_timeout(200)
    check("きろくを消せる", page.evaluate("feat.aib.hist.length===0"))
    page.screenshot(path='/tmp/aib.png')
    errs=[l for l in logs if l[0]=='pageerror']
    check("ページのエラーなし", not errs, errs[:3])
    browser.close()
print(sum(res),'/',len(res))
