import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
ensure_game_server()
with sync_playwright() as p:
    b, c, pg, logs = new_game_page(p)
    pg.goto(GBASE + "/game9/index.html"); pg.wait_for_selector("#bBR", timeout=20000); pg.wait_for_timeout(800)
    pg.click("#bBR"); pg.wait_for_timeout(2500)
    check("1 バトルロワイヤルがはじまる", pg.evaluate("()=>document.getElementById('s-br').classList.contains('on')"))
    check("2 飛行機のあいだは、メニュー用のパッド操作が止まる（ARE_PAD_OFF）", pg.evaluate("()=>window.ARE_PAD_OFF()"))
    press(pg, 1)   # A：ジャンプ
    pg.wait_for_timeout(600)
    big = pg.evaluate("()=>document.getElementById('brBig').textContent")
    check("3 A で飛行機からジャンプ", "ジャンプ" in big, big)
    axis(pg, 1, -1); axis(pg, 2, 1); pg.wait_for_timeout(1500); axis(pg, 1, 0); axis(pg, 2, 0)
    check("4 左スティックで進み、右スティックで向きをかえられる（エラーなし）", not [l for l in logs if l[0] == "pageerror"], [l for l in logs if l[0] == "pageerror"][:2])
    pg.evaluate("()=>{window.__pad.buttons[7]=1}"); pg.wait_for_timeout(300); pg.evaluate("()=>{window.__pad.buttons[7]=0}")
    press(pg, 3); press(pg, 2); press(pg, 4)
    check("5 ZR・X・Y・L を おしても エラーなし", not [l for l in logs if l[0] == "pageerror"])
    press(pg, 9, 150); pg.wait_for_timeout(500)
    check("6 ＋ でタイトルへもどる", pg.evaluate("()=>document.getElementById('s-title').classList.contains('on')"))
    check("7 もどったあとは メニュー用のパッド操作が 動く", not pg.evaluate("()=>window.ARE_PAD_OFF()"))
    errs = [l for l in logs if l[0] == "pageerror"]; check("8 画面エラーなし", not errs, errs[:2])
    b.close()
print("%d/%d" % (sum(res), len(res)))
