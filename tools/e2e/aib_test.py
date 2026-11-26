import json, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':420,'height':800})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    # GAS mock
    calls=[]
    def route(r):
        req=r.request; body=json.loads(req.post_data); calls.append(body)
        if body.get('token')!='good': r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin':'*'}, body=json.dumps({'ok':False,'code':'auth'}))
        else: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin':'*'}, body=json.dumps({'ok':True,'reply':'こんにちは！'}))
    pg.route('https://script.google.com/**', route)
    pg.goto('http://localhost:8765/chat.html'); pg.wait_for_timeout(2500)
    print('has aib', pg.evaluate("typeof initAiBot+typeof feat.aib"))
    # blocked: no flags / other
    pg.evaluate("state.user={id:'u1'}; segSt.flags=null; aibotSyncEntrances()")
    print('pin without flags:', pg.evaluate("document.getElementById('aibotPin')"))
    pg.evaluate("segSt.flags={other:{limit_admin:5}}; aibotSyncEntrances()")
    print('other allowed?', pg.evaluate("aibAllowed()"))
    pg.evaluate("openAiBot()"); print('sheet hidden (other):', pg.evaluate("el.profileModal.hidden"))
    for name,fl in [('home',{restricted:True,other:null}),('admin',{is_admin:True,other:null}),('work',{other:null,show_users:True})]:
        pg.evaluate("f=>{segSt.flags=f; aibotSyncEntrances()}", fl)
        print(name,'allowed', pg.evaluate("aibAllowed()"))
    pg.evaluate("document.getElementById('roomList')||0")
    print('pin exists:', pg.evaluate("!!document.getElementById('aibotPin')"), 'visible', pg.evaluate("document.getElementById('aibotPin') && getComputedStyle(document.getElementById('aibotPin')).display"))
    pg.evaluate("openAiBot()"); print('sheet shown:', not pg.evaluate("el.profileModal.hidden"))
    # settings
    pg.evaluate("aibRenderSettings()")
    pg.evaluate("feat.aib.shared={url:'https://script.google.com/macros/s/ABC123/exec', token:'bad'}")
    pg.click('[data-t="aibot:save"]'); pg.wait_for_timeout(200)
    pg.fill('#aibIn','テスト'); pg.click('#aibSend'); pg.wait_for_timeout(600)
    print('log after bad token:', pg.inner_text('#aibLog')[-60:])
    pg.evaluate("feat.aib.shared={url:'https://script.google.com/macros/s/ABC123/exec', token:'good'}")
    pg.fill('#aibIn','こんにちは'); pg.click('#aibSend'); pg.wait_for_timeout(600)
    print('log after good:', pg.inner_text('#aibLog')[-40:])
    print('payload keys:', sorted(calls[-1].keys()), 'msgs', calls[-1]['messages'])
    # per-user isolation
    pg.evaluate("state.user={id:'u2'}; aibEnsure()"); print('u2 hist len', pg.evaluate("feat.aib.hist.length"), 'u2 url', repr(pg.evaluate("feat.aib.cfg.url")))
    pg.evaluate("state.user={id:'u1'}; aibEnsure()"); print('u1 hist len', pg.evaluate("feat.aib.hist.length"))
    print('errors:', errs)
    pg.screenshot(path='/tmp/aib.png'); b.close()
