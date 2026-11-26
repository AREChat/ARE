import sys
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
SEED = """
window.__fx.tables.messages = [
 {id:'m1', room_id:'r1', sender_id:'u1', content:'https://x.supabase.co/storage/v1/object/public/b/clip.webm', created_at:'2026-11-25T00:00:05Z', edited_at:null, expires_at:null, is_auto_reply:false},
 {id:'m2', room_id:'r1', sender_id:'u1', content:'とても長い文章 '.repeat(2) + 'x', created_at:'2026-11-25T00:00:06Z', edited_at:null, expires_at:null, is_auto_reply:false}
];
"""
WEBM = open("/tmp/lkv.webm","rb").read()
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS+["--autoplay-policy=user-gesture-required"])
    ctx, A, log = mkpage(browser, "u-me", extra=SEED)
    def vid(route):
        route.fulfill(status=200, content_type="video/webm", body=WEBM, headers={"access-control-allow-origin":"*","accept-ranges":"none"})
    ctx.route("https://x.supabase.co/storage/**", vid)
    boot(A); A.wait_for_timeout(1500)
    A.evaluate("()=>document.querySelector('#messages .lv-box').scrollIntoView({block:'center'})"); A.wait_for_timeout(2000)
    s = A.evaluate("()=>{const v=document.querySelector('#messages .lv-video');return v?{muted:v.muted,ctl:v.controls,pi:v.playsInline,paused:v.paused,t:v.currentTime,loop:v.loop,rs:v.readyState}:null}")
    check("1 画面を一度触ったあとなら、動画は「音つき」で自動再生される（ON のとき）", s and (not s["muted"]) and s["ctl"] and s["pi"] and not s["paused"] and s["t"]>0, s)
    # 見えなくなる → 止まる
    A.evaluate("()=>{document.getElementById('messages').style.visibility='hidden'; document.querySelector('.lv-box').style.display='none';}"); A.wait_for_timeout(1200)
    s2 = A.evaluate("()=>document.querySelector('#messages .lv-video').paused")
    check("2 画面の外に出ると止まる", s2 is True, s2)
    A.evaluate("()=>{document.getElementById('messages').style.visibility='';document.querySelector('.lv-box').style.display='';document.querySelector('#messages .lv-video').scrollIntoView({block:'center'})}"); A.wait_for_timeout(1500)
    s3 = A.evaluate("()=>document.querySelector('#messages .lv-video').paused")
    check("3 また見えると 自動で再開する", s3 is False, s3)
    # 自分で止めたら、見え直しても再開しない
    A.evaluate("()=>document.querySelector('#messages .lv-video').pause()"); A.wait_for_timeout(300)
    A.evaluate("()=>{document.querySelector('.lv-box').style.display='none';}"); A.wait_for_timeout(1000)
    A.evaluate("()=>{document.querySelector('.lv-box').style.display='';document.querySelector('#messages .lv-video').scrollIntoView({block:'center'})}"); A.wait_for_timeout(1500)
    s4 = A.evaluate("()=>document.querySelector('#messages .lv-video').paused")
    check("4 自分で止めた動画は、見え直しても勝手に再生しない", s4 is True, s4)
    browser.close()
    # オフ
    browser = p.chromium.launch(args=ARGS+["--autoplay-policy=user-gesture-required"])
    ctx, B, log2 = mkpage(browser, "u-me", extra=SEED)
    ctx.route("https://x.supabase.co/storage/**", vid)
    B.add_init_script("try{localStorage.setItem('are_lv_auto','0')}catch(e){}")
    boot(B); B.wait_for_timeout(1500)
    B.evaluate("()=>document.querySelector('#messages .lv-box').scrollIntoView({block:'center'})"); B.wait_for_timeout(2000)
    s5 = B.evaluate("()=>{const v=document.querySelector('#messages .lv-video');return v?{paused:v.paused,t:v.currentTime,pre:v.preload}:null}")
    check("5 オフのときは、プレビューは出るが 自動再生しない", s5 and s5["paused"] and s5["t"]==0, s5)
    check("6 設定の表示が OFF", B.evaluate("()=>/OFF/.test(document.getElementById('lkvSetItem').textContent)"))
    errs=[l for l in log+log2 if l[0]=="pageerror"]
    check("7 画面のエラーなし", not errs, errs[:2])
    browser.close()
print("\n再生テスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
