from c12fx import *
srv = ensure_server()
with sync_playwright() as p:
    browser, ctx, page, logs = open_chat(p, width=1280, height=800, touch=False)
    page.evaluate("""() => { window.__ps = []; const fake = {periodicSync:{register:(t,o)=>{ window.__ps.push([t,o.minInterval]); return Promise.resolve(); }}}; Object.defineProperty(navigator.serviceWorker, 'ready', {value:Promise.resolve(fake), configurable:true}); }""")
    page.evaluate("localStorage.removeItem('are_autostart_tip_v1_' + state.user.id)")
    r = page.evaluate("pushBgBoot().then(()=>({ps:window.__ps, tip:localStorage.getItem('are_autostart_tip_v1_'+state.user.id), desk:pushIsDesktop(), err:window.__pserr||null}))")
    check("裏起動：デスクトップで 12時間おきの目ざめ登録をする", r["ps"] == [["are-bg-refresh", 43200000]], r)
    check("裏起動：パソコンでは案内ポップアップを出す（1回だけ記録）", r["tip"] == "1" and page.locator(".nf-pop").count() >= 1 and "ログイン時" in page.inner_text(".nf-pop"), r)
    page.evaluate("document.querySelectorAll('.nf-pop').forEach(n=>n.remove())")
    page.evaluate("pushBgBoot()"); page.wait_for_timeout(300)
    check("裏起動：2回目は案内を出さない", page.locator(".nf-pop").count() == 0)
    page.evaluate("openPushSettings()"); page.wait_for_timeout(400)
    check("設定画面に「起動と同時に、裏で受けとる」の説明が出る", "about://apps" in sheet_text(page) and "ブラウザの決まり" in sheet_text(page))
    page.evaluate("closeSheet()")
    check("通知の自動登録の鍵が v2（全員が次に開いたときにやりなおす）", "are_bg_call_v2_" in page.evaluate("pushBackgroundUpgrade.toString()"))
    print(errors(page, logs)); check("画面エラーなし", not errors(page, logs))
    browser.close()
    for ua, name in [("Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120 Mobile", "Android"), ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", "iPhone")]:
        c3 = browser2 = None
    br = p.chromium.launch(); 
    for ua, name in [("Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120 Mobile", "Android"), ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", "iPhone")]:
        cx = br.new_context(user_agent=ua); pg = cx.new_page(); pg.goto("about:blank")
        check("スマホ（%s）では「パソコン用の案内」を出さない" % name, pg.evaluate("(ua) => { const f = /iPhone|iPad|iPod/i.test(ua) || /Android/i.test(ua); return !f; }", ua) is False)
    br.close()
if srv: srv.terminate()
print("合計 %d/%d" % (sum(res), len(res)))
