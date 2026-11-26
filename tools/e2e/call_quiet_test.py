import sys
sys.path.insert(0,__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
ADM = ("window.__fx.rpc.my_access=function(){return {points:0, admin:true, locked_until:null};};"
       "window.__fx.rpc.ad_free_status=function(){return {free:true, admin:true, exempt:true, interval_min:60, until:null, price:500, days:30};};"
       "window.__T=Date.parse('2026-11-25T01:00:00Z'); window.__telNow=function(){return window.__T;};")
USR = "window.__T=Date.parse('2026-11-25T01:00:00Z'); window.__telNow=function(){return window.__T;};"
CASES = [  # (説明, 時刻(UTC), 管理者か, 消えるべきか)
 ("管理者・水曜 10:00（日本時間）", "2026-11-25T01:00:00Z", True, True),
 ("管理者・水曜 7:00 ちょうど", "2026-11-24T22:00:00Z", True, True),
 ("管理者・水曜 6:59", "2026-11-24T21:59:00Z", True, False),
 ("管理者・水曜 19:59", "2026-11-25T10:59:00Z", True, True),
 ("管理者・水曜 20:00 ちょうど", "2026-11-25T11:00:00Z", True, False),
 ("管理者・水曜 21:00", "2026-11-25T12:00:00Z", True, False),
 ("管理者・日曜 10:00", "2026-11-29T01:00:00Z", True, False),
 ("管理者・土曜 10:00", "2026-11-28T01:00:00Z", True, False),
 ("管理者・月曜 7:00（日本時間。UTCでは日曜 22:00）", "2026-11-29T22:00:00Z", True, True),
 ("管理者・金曜 19:30", "2026-11-27T10:30:00Z", True, True),
 ("一般ユーザー・水曜 10:00", "2026-11-25T01:00:00Z", False, False),
]
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS); gas_reset()
    ctxA, A, logA = mkpage(browser, "u-me"); boot(A)
    for isadm in (True, False):
        ctxB, B, logB = mkpage(browser, "u1", extra=ADM if isadm else USR); boot(B, room=False)
        for (name, t, adm, quiet) in CASES:
            if adm != isadm: continue
            B.evaluate("(t)=>{window.__T=Date.parse(t);}", t)
            A.click("#telAudioBtn"); A.wait_for_timeout(300); speed(B)
            ok = wait_for(B, "()=>!!AREtel.state.incoming", 20000)
            B.wait_for_timeout(400)
            tone = B.evaluate("()=>!!AREtel.state.tone"); muted = B.evaluate("()=>!!AREtel.state.toneMuted")
            txt = B.evaluate("()=>document.getElementById('telInKind').textContent")
            want_ok = (muted and not tone and "消しています" in txt) if quiet else (tone and not muted and "消しています" not in txt)
            check("%s → 着信は出る／着信音は%s" % (name, "消える" if quiet else "鳴る"), ok and want_ok, (ok, tone, muted, txt))
            B.evaluate("()=>AREtel.decline()"); speed(A); wait_for(A, "()=>!AREtel.state.call", 12000)
        ctxB.close()
    browser.close()
print("\n着信音ミュートのテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
