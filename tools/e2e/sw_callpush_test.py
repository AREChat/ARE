import sys, json
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import devs
from devs import *
srv = ensure_server()
res = []
def check(n, ok, d=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(d)[:200]) if (d and not ok) or d else ""))
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(service_workers="allow", user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"); ctx.grant_permissions(["notifications"], origin=devs.BASE)
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(devs.BASE + "/help.html", wait_until="load"); page.wait_for_timeout(2500)
    cdp = ctx.new_cdp_session(page)
    cdp.send("ServiceWorker.enable")
    scope = devs.BASE + "/"
    def push(data):
        cdp.send("ServiceWorker.deliverPushMessage", {"origin": devs.BASE, "registrationId": REG, "data": json.dumps(data)})
        page.wait_for_timeout(900)
    regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e.get("registrations", [])))
    page.reload(wait_until="load"); page.wait_for_timeout(1500)
    REG = (regs[-1]["registrationId"] if regs else None)
    check("0 サービスワーカーが動いている", REG is not None, regs)
    def notes():
        return page.evaluate("""async()=>{const r=await navigator.serviceWorker.getRegistration();const l=await r.getNotifications();return l.map(n=>({t:n.title,tag:n.tag,silent:n.silent,ri:n.requireInteraction,body:n.body,vib:n.vibrate}))}""")
    # 画面が見えていない状態にするため、別のタブを前面に
    other = ctx.new_page(); other.goto("about:blank"); other.bring_to_front()
    room = "11111111-2222-3333-4444-555555555555"
    push({"type":"call","title":"📞 着信：テストA","body":"音声通話の着信です。タップして出る","room":room,"tag":"are-call","silent":False})
    n = notes()
    check("1 閉じている間の着信：通知が出る（タグ are-call・出るまで残る）", len(n) == 1 and n[0]["tag"] == "are-call" and n[0]["ri"], n)
    check("2 通知に相手の名前と「着信」が出る", n and "テストA" in n[0]["t"], n)
    check("3 通常の相手では、バイブつき（無音ではない）", n and not n[0]["silent"] and (n[0]["vib"] or []) != [], n)
    push({"type":"clear","tag":"are-call","room":room})
    check("4 かけた側が切ると、着信の通知が消える", len(notes()) == 0, notes())
    push({"type":"call","title":"📞 着信：管理者","body":"音声通話の着信です。","room":room,"tag":"are-call","silent":True})
    n = notes()
    check("5 管理者あての着信は「ミュート」（音もバイブもなし）", len(n) == 1 and n[0]["silent"], n)
    check("6 ページのエラーなし", not errs, errs[:2])
    b.close()
print("\n閉じている間の着信通知 %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
