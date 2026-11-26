import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
FX = """window.__fx.rpc.is_current_user_admin=function(){return false;};
window.__fx.rpc.my_aibot_config=function(){ return {url:'https://script.google.com/macros/s/HUB123/exec',token:'x'}; };
window.__acalls=[];
window.AREAndroid={
  isApp:function(){return true;}, version:function(){return '1.0.0';}, deviceId:function(){return 'a'.repeat(32);},
  initFirebase:function(j){ window.__acalls.push(['init',j]); setTimeout(function(){ window.__areFcm && window.__areFcm('FCM'+'x'.repeat(90)+':APA91b', ''); },50); },
  status:function(){ return JSON.stringify({notif:true,battery:false,dnd:false,fullscreen:true,fcm:true}); },
  openNotificationSettings:function(){window.__acalls.push(['notif']);}, requestBatteryExempt:function(){window.__acalls.push(['battery']);},
  requestDndAccess:function(){window.__acalls.push(['dnd']);}, requestFullScreen:function(){window.__acalls.push(['full']);},
  testNotification:function(k){window.__acalls.push(['test',k]);}
};"""
with sync_playwright() as p:
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=FX)
    posts = []
    CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
    def hub(r):
        if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers=CORS, body='')
        b = json.loads(r.request.post_data or '{}'); posts.append(b)
        if b.get('op') == 'config':
            out = {'ok': True, 'enabled': True, 'firebase': {'projectId': 'proj', 'appId': '1:2:android:3', 'apiKey': 'AIza-x', 'senderId': '123'}}
        else:
            out = {'ok': True}
        r.fulfill(status=200, headers=CORS, content_type='application/json', body=json.dumps(out))
    ctx.route("https://script.google.com/**", hub)
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(5500)
    page.evaluate("document.getElementById('hdrForce') && document.getElementById('hdrForce').remove()")
    ops = [b.get('op') for b in posts if b.get('action') == 'push']
    check("アプリの中で、GAS に 設定→登録 の順で つながる", ops[:2] == ['config', 'register'], ops)
    reg = next((b for b in posts if b.get('op') == 'register'), {})
    check("登録に、端末番号と通知番号が入っている", reg.get('device') == 'a' * 32 and str(reg.get('fcm', '')).startswith('FCM'))
    calls = page.evaluate("window.__acalls")
    check("アプリへ Firebase の接続値が渡る", any(c[0] == 'init' and 'proj' in c[1] for c in calls))
    rows = page.evaluate("window.__calls.filter(c=>c.from==='push_subscriptions'&&c.op==='upsert').map(c=>JSON.stringify(c.args))")
    check("Supabase の通知先に fcm:端末:自分の番号 が1行入る", len(rows) == 1 and ('"endpoint":"fcm:' + 'a' * 32 + ':') in rows[0], rows)
    check("「アプリの通知」ツールが見える", page.evaluate("getComputedStyle(document.querySelector('[data-tool=andapp]')).display!=='none'"))
    page.evaluate("openAndroidApp()"); page.wait_for_timeout(300)
    txt = page.inner_text('#profileSheet')
    check("設定の画面に つながり・許可が出る", 'つながっています' in txt and '電池' in txt)
    for act in ['battery', 'dnd', 't-call']:
        page.click('[data-t="andapp:%s"]' % act); page.wait_for_timeout(100)
    calls = page.evaluate("window.__acalls")
    check("ボタンでアプリ側の機能が呼ばれる", ['battery'] in calls and ['dnd'] in calls and ['test', 'call'] in calls, calls[-4:])
    page.evaluate("andOff()"); page.wait_for_timeout(600)
    rows2 = page.evaluate("window.__calls.filter(c=>c.from==='push_subscriptions'&&c.op==='delete').length")
    check("ログアウトのとき、登録が消える", rows2 >= 1 and any(b.get('op') == 'unregister' for b in posts), rows2)
    errs = [l for l in logs if l[0] == 'pageerror']
    check("エラーなし", not errs, errs[:2])
print(sum(res), "/", len(res))
