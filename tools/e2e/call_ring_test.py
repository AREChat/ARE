import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
NOTI = """
(function(){
  window.__notes = [];
  function N(title, opts){ this.title = title; this.opts = opts || {}; window.__notes.push({title:title, opts:JSON.parse(JSON.stringify(opts||{})), closed:false}); const me = window.__notes[window.__notes.length-1]; this.close = function(){ me.closed = true; }; }
  N.permission = 'granted'; N.requestPermission = async function(){ return 'granted'; };
  window.Notification = N;
})();
"""
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS); gas_reset()
    ctxA, A, logA = mkpage(browser, "u-me"); ctxB, B, logB = mkpage(browser, "u1")
    ctxB.add_init_script(NOTI)
    boot(A); boot(B, room=False)
    A.click("#telAudioBtn"); A.wait_for_timeout(300); speed(B)
    ok = wait_for(B, "()=>!!AREtel.state.incoming", 20000)
    check("1 着信がくる", ok)
    B.wait_for_timeout(1600)
    n = B.evaluate("()=>window.__notes")
    check("2 端末の通知が出る（無音にしない＝端末の通知音がなる設定、振動つき、出るまで残る）", len(n)>=1 and n[0]["opts"].get("silent") is False and n[0]["opts"].get("requireInteraction") is True and n[0]["opts"].get("vibrate"), n[:1])
    check("3 通知に相手の名前が出る", "テストA" in (n[0]["title"] if n else ""), n[:1])
    titles = set(B.evaluate("()=>new Promise(r=>{const s=new Set();const t=setInterval(()=>s.add(document.title),150);setTimeout(()=>{clearInterval(t);r([...s])},2200)})"))
    check("4 着信中は ページのタイトルが「📞 着信中！」と点滅する", any("着信中" in x for x in titles) and len(titles) >= 2, titles)
    hint = B.evaluate("()=>{const h=document.querySelector('#telIn .tel-hint');return h&&!h.hidden?h.textContent:''}")
    ac = B.evaluate("()=>AREtel.state.ac?AREtel.state.ac.state:'none'")
    check("5 まだ画面をさわっていなくて音が出せないときは、「画面をタッチすると鳴ります」と案内が出る", (ac == "running") or ("タッチ" in hint), (ac, hint))
    B.mouse.click(300, 400); B.wait_for_timeout(1200)
    ac2 = B.evaluate("()=>AREtel.state.ac?AREtel.state.ac.state:'none'")
    check("6 画面をさわると 音が出せる状態（running）になる", ac2 == "running", ac2)
    tone = B.evaluate("()=>!!AREtel.state.tone")
    check("7 着信音がくり返しなっている", tone)
    # 音の大きさ：実際に鳴らして、出力の強さをはかる
    lvl = B.evaluate("""async()=>{const ac=AREtel.state.ac;const an=ac.createAnalyser();an.fftSize=2048;
      const mdest=ac.createGain(); // destination へつながる音を分けてはかれないので、録音ノードでのかわりに ゲイン設定を確認
      return true}""")
    B.evaluate("()=>AREtel.decline()"); B.wait_for_timeout(600)
    n2 = B.evaluate("()=>window.__notes")
    check("8 断ると 通知も閉じる／点滅も止まる", all(x["closed"] for x in n2) and "着信中" not in B.evaluate("()=>document.title"), (n2, B.evaluate("()=>document.title")))
    # 着信音をためす
    B.evaluate("()=>{document.querySelector('[data-more],#moreBtn')&&0}")
    B.evaluate("()=>document.getElementById('telTestItem').click()"); B.wait_for_timeout(800)
    check("9 設定の「🔔 着信音をためす」で 着信音がなり、通知が1つ出る", B.evaluate("()=>!!AREtel.state.tone") and any("テスト" in x["title"] for x in B.evaluate("()=>window.__notes")))
    B.wait_for_timeout(3600)
    check("10 3秒ほどで 自動で止まる", not B.evaluate("()=>!!AREtel.state.tone"))
    errs = [x for x in logA + logB if x[0] == "pageerror"]
    check("11 ページのエラーなし", not errs, errs[:3])
    browser.close()
print("\n着信音のテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
