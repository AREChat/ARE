import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from h import *
srv = ensure_server()
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
def veil(page):
    try: return page.evaluate("!!document.getElementById('dtVeil')")
    except Exception: return None
def normal(page):
    try: return page.evaluate("!document.getElementById('dtVeil') && document.body.children.length>3")
    except Exception: return False
with sync_playwright() as p:
    # ---- 1) 一時停止（デバッガ）で見つける ----
    browser, ctx, page, logs = new_page(p, width=1000, height=700, touch=False)
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(4000)
    check("ふだんは、画面が消えない（誤反応なし）", normal(page))
    cdp = ctx.new_cdp_session(page)
    paused = []
    def on_paused(_e):
        paused.append(1); time.sleep(0.35)
        try: cdp.send("Debugger.resume")
        except Exception: pass
    cdp.on("Debugger.paused", on_paused)
    cdp.send("Debugger.enable")
    page.wait_for_timeout(3500)
    kids = page.evaluate("document.body.children.length") if veil(page) else -1
    check("開いたと見なして、画面の中身を消す", veil(page) is True and kids == 0, "veil=%s bodyChildren=%s pauses=%d" % (veil(page), kids, len(paused)))
    # ---- 2) 消した画面を、開発者ツールで元に戻そうとしても、すぐ消しなおす ----
    page.evaluate("document.getElementById('dtVeil').remove()"); page.wait_for_timeout(300)
    check("覆い（メッセージ）を消しても、すぐ出なおす", veil(page) is True)
    page.evaluate("document.getElementById('dtVeil').style.cssText='display:none'"); page.wait_for_timeout(300)
    vis = page.evaluate("(()=>{const v=document.getElementById('dtVeil');const r=v.getBoundingClientRect();return getComputedStyle(v).display!=='none'&&r.width>500&&r.height>500})()")
    check("覆いを見えなくしても、すぐ見えなおす", vis is True)
    page.evaluate("document.body.appendChild(Object.assign(document.createElement('div'),{id:'leak',textContent:'secret'}));document.documentElement.appendChild(Object.assign(document.createElement('main'),{id:'leak2',textContent:'x'}))"); page.wait_for_timeout(300)
    check("あとから足した部品も、すぐ取りのぞく", page.evaluate("!document.getElementById('leak') && !document.getElementById('leak2')"))
    page.evaluate("document.body.remove()"); page.wait_for_timeout(300)
    check("body を消されても、覆いは残る", veil(page) is True)
    cdp.send("Debugger.disable")
    page.wait_for_timeout(5500)
    try:
        page.wait_for_load_state("load", timeout=8000)
        back = normal(page)
    except Exception:
        back = False
    check("閉じると、自動で もとの画面に もどる", back)
    browser.close()

    # ---- 3) 「ブレークポイントを無効にする」をされても、コンソールのおとりで見つける ----
    #   （一時停止は すぐ再開＝止まらない。かわりに、開発者ツールが するように、コンソールに出た「おとり」の中身を読みに来る動きをまねる）
    browser, ctx, page, logs = new_page(p, width=1000, height=700, touch=False, neutral_console=False)
    cdp = ctx.new_cdp_session(page)
    def resume_now(_e):
        try: cdp.send("Debugger.resume")
        except Exception: pass
    cdp.on("Debugger.paused", resume_now)
    def on_console(e):
        for a in e.get("args", []):
            oid = a.get("objectId")
            if oid:
                try: cdp.send("Runtime.callFunctionOn", {"objectId": oid, "functionDeclaration": "function(){try{return String(this.stack)+String(this.id)}catch(e){return ''}}"})
                except Exception: pass
    cdp.on("Runtime.consoleAPICalled", on_console)
    cdp.send("Runtime.enable"); cdp.send("Debugger.enable")
    page.goto(BASE + "/chat.html", wait_until="commit"); page.wait_for_timeout(5000)
    check("ブレークポイントを無効にしても、見つけて消す（おとり）", veil(page) is True, "veil=%s" % veil(page))
    browser.close()

    # ---- 4) 見張りの関数を「ソース」で書きかえられたら、すぐ気づく ----
    browser, ctx, page, logs = new_page(p, width=1000, height=700, touch=False)
    cdp = ctx.new_cdp_session(page)
    scripts = {}
    cdp.on("Debugger.scriptParsed", lambda e: scripts.update({e["scriptId"]: e.get("url", "")}))
    def resume_now2(_e):
        try: cdp.send("Debugger.resume")
        except Exception: pass
    cdp.on("Debugger.paused", resume_now2)
    cdp.send("Debugger.enable")
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(3500)
    check("書きかえる前は、画面が消えない", normal(page))
    sid = next((k for k, v in scripts.items() if v.endswith("/protect.js")), None)
    ok_edit = False; skipped = False
    if sid:
        src = cdp.send("Debugger.getScriptSource", {"scriptId": sid})["scriptSource"]
        edited = src.replace("150", "999999", 1)
        try:
            cdp.send("Debugger.setScriptSource", {"scriptId": sid, "scriptSource": edited}); ok_edit = edited != src
        except Exception as e:
            skipped = "no longer available" in str(e)
    page.wait_for_timeout(1500)
    if skipped:
        print("SKIP 見張りの関数を書きかえると、すぐ画面を消す : この Chrome には、ソースの書きかえ機能（setScriptSource）が無く、再現できません（未確認）")
    else:
        check("見張りの関数を書きかえると、すぐ画面を消す", ok_edit and veil(page) is True, "edited=%s veil=%s" % (ok_edit, veil(page)))
    browser.close()

    # ---- 5) 見張りの時計を止められても（clearInterval など）、べつの仕組みが気づく ----
    browser, ctx, page, logs = new_page(p, width=1000, height=700, touch=False)
    page.goto(BASE + "/chat.html"); page.wait_for_timeout(3500)
    page.evaluate("for(let i=1;i<20000;i++){clearInterval(i);clearTimeout(i)}")
    page.wait_for_timeout(4000)
    page.mouse.move(100, 100); page.mouse.move(200, 220); page.wait_for_timeout(800)
    check("時計を止められても、画面を操作すると気づいて消す", veil(page) is True, "veil=%s" % veil(page))
    browser.close()
print(sum(res), "/", len(res))
sys.exit(0 if all(res) else 1)
