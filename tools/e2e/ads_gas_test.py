import sys, json, base64
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)[:200]) if note else ""), flush=True)
VIDEO = open("/tmp/ad_test.mp4","rb").read()
N = len(VIDEO); cut = [0, N//3, 2*N//3, N]
PARTS = [VIDEO[cut[i]:cut[i+1]] for i in range(3)]
GAS = "https://script.google.com/macros/s/TEST/exec"
calls = []
JAN1 = "Date.parse('2027-01-01T00:10:00+09:00')"
FX = ("window.__NOW=%s; window.__adNow=function(){return window.__NOW;};\n"
      "window.__fx.rpc.ad_free_status=function(){return {free:false, until:null, price:500, days:30};};\n"
      "window.__fx.rpc.my_access=function(){return {points:800, admin:false, locked_until:null};};\n"
      "window.__fx.rpc.guest_status_me=function(){return {guest:false};};\n" % JAN1)
def setup(page, ok=True):
    def gas(route):
        u = route.request.url; calls.append(u)
        cors = {"access-control-allow-origin": "*"}
        if not ok: return route.fulfill(status=500, body="x", headers=cors)
        if "action=list" in u:
            body = {"ok": True, "partBytes": 3145728, "ads": [{"id": "AD002", "size": N, "parts": 3, "v": 111}, {"id": "AD007", "size": N, "parts": 3, "v": 222}]}
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers=cors)
        import re
        m = re.search(r"id=(AD\d+)&i=(\d+)", u)
        if m: return route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "i": int(m.group(2)), "b64": base64.b64encode(PARTS[int(m.group(2))]).decode()}), headers=cors)
        route.fulfill(status=404, body="", headers=cors)
    page.route("https://script.google.com/macros/s/TEST/**", gas)
    page.add_init_script("(function(){ var set=function(){ try{ window.ARE_CONFIG = Object.assign({}, window.ARE_CONFIG||{}, {adsUrl:'%s'}); }catch(e){} }; set(); document.addEventListener('DOMContentLoaded', set); window.addEventListener('load', set); })();" % GAS)
    page.route("**/ads/AD*.mp4", lambda route: route.fulfill(status=404, body=""))   # 将来 GitHub にあっても使わない
def boot(p, ok=True):
    browser, ctx, page, logs = new_page(p, width=420, height=800, extra_fx=FX)
    setup(page, ok)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(500)
    return browser, page, logs
def ov(page): return page.evaluate("()=>{const o=document.getElementById('adOverlay');if(!o)return '';const v=o.querySelector('video');return v.getAttribute('src')+'|'+(v.readyState)}")
with sync_playwright() as p:
    browser, page, logs = boot(p)
    page.wait_for_timeout(6000)       # 起動時の自動チェックで、ドライブから受け取って流れる
    s = ov(page)
    check("1 ドライブ（GAS）から受け取った映像が流れる（blob）", s.startswith("blob:"), s)
    ready = page.evaluate("()=>{const v=document.querySelector('#adOverlay video');return v?[v.readyState,v.videoWidth,v.error&&v.error.code]:null}")
    check("2 つなぎ直した映像が再生できる形（幅・高さが読めた）", ready and ready[1] > 0 and not ready[2], ready)
    parts1 = [u for u in calls if "action=part" in u]
    ids = {u.split("id=")[1].split("&")[0] for u in parts1}
    check("3 一覧にある映像（AD002・AD007）だけを使う（ほかは取りにいかない）", ids <= {"AD002", "AD007"} and len(ids) >= 1, ids)
    check("4 3分割ぶん（3回）受け取る", len(parts1) >= 3, len(parts1))
    page.wait_for_timeout(9000)       # 終わる
    page.wait_for_timeout(500)
    page.evaluate("()=>{const b=[...document.querySelectorAll('#adOverlay button')].find(x=>x.textContent==='スキップ ▶'); if(b) b.click();}"); page.wait_for_timeout(500)
    keys = page.evaluate("async()=>{const c=await caches.open('are-ads');return (await c.keys()).map(k=>k.url)}")
    check("5 端末に残る（Cache Storage）", len(keys) >= 1, keys)
    n0 = len([u for u in calls if "action=part" in u])
    # 1時間後：同じ映像が またあたっても、通信しない
    page.evaluate("()=>{window.__NOW += 3600000; const s=JSON.parse(localStorage.getItem('are_ad_v1_u-me')); s.bag=[s.last]; s.next=null; localStorage.setItem('are_ad_v1_u-me', JSON.stringify(s)); AREAds.check(); return 1;}")
    page.wait_for_timeout(2500)
    s2 = ov(page)
    n1 = len([u for u in calls if "action=part" in u])
    check("6 2回目は、残してあるものを使う（通信なし）", s2.startswith("blob:") and n1 == n0, (s2, n0, n1))
    errs = [l for l in logs if l[0] == "pageerror"]
    check("7 画面エラーなし", not errs, errs[:2])
    browser.close()
    # GASが落ちているとき：広告を出さず、画面は無事
    calls.clear()
    browser, page, logs = boot(p, ok=False)
    page.wait_for_timeout(4000)
    check("8 GASが使えないときは 広告を出さない", ov(page) == "", ov(page))
    check("9 チャット画面は使える", page.evaluate("()=>!!document.getElementById('roomList')"))
    browser.close()
print("%d/%d" % (sum(res), len(res)))
