import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
exec(open("call_test.py").read().split("with sync_playwright() as p:")[0])
with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS); gas_reset()
    c1, A, l1 = mkpage(browser, "u-me"); c2, B1, l2 = mkpage(browser, "u1"); c3, B2, l3 = mkpage(browser, "u1")
    boot(A); boot(B1, room=False); boot(B2, room=False); speed(B1); speed(B2)
    A.click("#telAudioBtn")
    ok = wait_for(B1, "()=>!!AREtel.state.incoming", 20000) and wait_for(B2, "()=>!!AREtel.state.incoming", 20000)
    check("1 受ける側が2台でも、2台とも着信が鳴る", ok)
    B1.evaluate("()=>AREtel.accept(false)"); B2.evaluate("()=>AREtel.accept(false)")
    A.wait_for_timeout(15000)
    st = [x.evaluate("()=>!!AREtel.state.call") for x in (A, B1, B2)]
    check("2 2台が同時に出ても、つながるのは1台だけ（もう1台は切れる）", st[0] and (st[1] != st[2]), st)
    errs = [x for x in l1 + l2 + l3 if x[0] == "pageerror"]
    check("3 ページのエラーなし", not errs, errs[:3])
    browser.close()
print("\n受ける側2台のテスト %d / %d" % (sum(res), len(res))); sys.exit(0 if all(res) else 1)
