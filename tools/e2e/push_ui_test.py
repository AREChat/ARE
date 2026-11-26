import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for mobile in (False, True):
        tag = "スマホ" if mobile else "PC"
        ctx, pg, lg = mkpage(b, "u-me", "window.__fx.rpc.x=1;", mobile=mobile)
        boot(pg)
        pg.evaluate("()=>localStorage.removeItem('are_pushbar_hush')"); pg.wait_for_timeout(7500)
        bar = pg.evaluate("()=>{const b=document.getElementById('pushBar');return b?b.innerText:null}")
        check(tag + " 1 通知がオフのとき、画面に「通知がオフです」の帯が出る", bar and "通知" in bar, bar)
        pg.evaluate("()=>openPushSettings()"); pg.wait_for_timeout(1500)
        d = pg.evaluate("()=>document.querySelector('[data-push-diag]').innerText")
        check(tag + " 2 設定に「診断」が出て、❌と なおし方が書いてある", "❌" in d and "👉" in d, d[:200])
        pg.evaluate("()=>{requireClient().functions.invoke=async()=>({data:{ok:true,devices:[{kind:'Android',ok:true,status:201},{kind:'パソコン',ok:false,status:410,removed:true}]}})}")
        pg.click('[data-t="push:servertest"]'); pg.wait_for_timeout(800)
        o = pg.evaluate("()=>document.querySelector('[data-push-testout]').innerText")
        check(tag + " 3 サーバーからのテスト送信の結果が、端末ごとに出る", "Android" in o and "パソコン" in o and "✅" in o and "❌" in o, o)
        errs = [x for x in lg if x[0] == "pageerror"]
        check(tag + " 4 ページのエラーなし", not errs, errs[:2])
        ctx.close()
    b.close()
print("\n通知の診断テスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
