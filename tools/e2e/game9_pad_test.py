import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from game_pad_lib import *
res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))
srv = ensure_game_server()
def focus_to(pg, target):
    cur = lambda: pg.evaluate("()=>{const e=document.querySelector('.are-pad-focus');return e?(e.id||e.textContent.slice(0,8)):''}")
    seq = []
    for k in range(40):
        c = cur(); seq.append(c)
        if c == target: return True, seq
        for d in (13, 15, 12, 14):          # 下・右・上・左 の順に ためす
            press(pg, d); n = cur()
            if n != c and n not in seq[-6:]: break
    return cur() == target, seq
def delta(pg, fn, ms=700):
    a = pg.evaluate("()=>G9Debug.read()"); fn(); pg.wait_for_timeout(ms); fn_stop = None
    return a
with sync_playwright() as p:
    b, c, pg, logs = new_game_page(p)
    pg.goto(GBASE + "/game9/index.html"); pg.wait_for_selector("#stageSelect [data-i]", timeout=20000); pg.wait_for_timeout(800)
    check("1 標準の配置は ニンテンドー配置", pg.evaluate("()=>AREPadMap.layout()") == "nin")
    # 2 メニュー：十字で えらんで A で決定、B でもどる
    okf, ids = focus_to(pg, "bHow")
    check("2a 十字キーで『あそびかた』にフォーカスが動く", okf, ids[-6:])
    press(pg, 1)
    check("2b A で決定（あそびかたが開く）", pg.evaluate("()=>document.getElementById('s-how').classList.contains('on')"))
    press(pg, 0)
    check("2c B でもどる（タイトルへ）", pg.evaluate("()=>document.getElementById('s-title').classList.contains('on')"))
    # 3 ステージ開始
    pg.click("#stageSelect [data-i='0']"); pg.wait_for_timeout(1500)
    check("3a ステージが はじまる", pg.evaluate("()=>G9Debug.read().running"))
    def move(fn_down, fn_up, ms=600):
        a = pg.evaluate("()=>G9Debug.read()"); fn_down(); pg.wait_for_timeout(ms); fn_up(); pg.wait_for_timeout(100)
        b2 = pg.evaluate("()=>G9Debug.read()")
        return (b2["x"] - a["x"]) * a["rx"] + (b2["z"] - a["z"]) * a["rz"], (b2["x"]-a["x"], b2["z"]-a["z"])
    kd = lambda k: (lambda: pg.keyboard.down(k)); ku = lambda k: (lambda: pg.keyboard.up(k))
    d, raw = move(kd("KeyD"), ku("KeyD")); check("4a D キー（右）で 画面の右へ動く", d > 0.3, (round(d, 2), raw))
    d, raw = move(kd("KeyA"), ku("KeyA")); check("4b A キー（左）で 画面の左へ動く", d < -0.3, (round(d, 2), raw))
    d, raw = move(kd("ArrowRight"), ku("ArrowRight")); check("4c → キーで 画面の右へ", d > 0.3, round(d, 2))
    d, raw = move(kd("ArrowLeft"), ku("ArrowLeft")); check("4d ← キーで 画面の左へ", d < -0.3, round(d, 2))
    d, raw = move(lambda: axis(pg, 0, 1), lambda: axis(pg, 0, 0)); check("5a 左スティックを右へ → 画面の右へ", d > 0.3, round(d, 2))
    d, raw = move(lambda: axis(pg, 0, -1), lambda: axis(pg, 0, 0)); check("5b 左スティックを左へ → 画面の左へ", d < -0.3, round(d, 2))
    d, raw = move(lambda: pg.evaluate("()=>{window.__pad.buttons[15]=1}"), lambda: pg.evaluate("()=>{window.__pad.buttons[15]=0}")); check("5c 十字キー右 → 画面の右へ", d > 0.3, round(d, 2))
    a = pg.evaluate("()=>G9Debug.read()"); axis(pg, 2, 1); pg.wait_for_timeout(500); axis(pg, 2, 0); b2 = pg.evaluate("()=>G9Debug.read()")
    check("6 右スティックを右へ → 右を向く（向きの値が減る）", b2["yaw"] < a["yaw"] - 0.3, (round(a["yaw"], 2), round(b2["yaw"], 2)))
    ammo0 = pg.evaluate("()=>document.getElementById('ammoText').textContent")
    press(pg, 7, 400); ammo1 = pg.evaluate("()=>document.getElementById('ammoText').textContent")
    check("7 ZR でうてる（弾が へる）", ammo0 != ammo1, (ammo0, ammo1))
    w0 = pg.evaluate("()=>G9Debug.read().weapon"); press(pg, 2); pg.wait_for_timeout(200); w1 = pg.evaluate("()=>G9Debug.read().weapon")
    check("8a Y で 次の武器", w1 != w0, (w0, w1)); press(pg, 4); pg.wait_for_timeout(200); w2 = pg.evaluate("()=>G9Debug.read().weapon")
    check("8b L で 前の武器", w2 == w0, (w0, w1, w2))
    press(pg, 9, 150); pg.wait_for_timeout(400)
    check("9 ＋ でタイトルにもどる", pg.evaluate("()=>document.getElementById('s-title').classList.contains('on')") and not pg.evaluate("()=>G9Debug.read().running"))
    # 10 Xbox・Steam配置：下ボタン(0)が 決定、右ボタン(1)が もどる
    pg.evaluate("()=>AREPadMap.setLayout('xbox')"); pg.wait_for_timeout(200)
    focus_to(pg, "bHow")
    press(pg, 0); op = pg.evaluate("()=>document.getElementById('s-how').classList.contains('on')")
    press(pg, 1); back = pg.evaluate("()=>document.getElementById('s-title').classList.contains('on')")
    check("10 Xbox・Steam配置：下ボタンで決定、右ボタンでもどる", op and back, (op, back))
    pg.evaluate("()=>AREPadMap.setLayout('nin')")
    errs = [l for l in logs if l[0] == "pageerror"]; check("11 画面エラーなし", not errs, errs[:2])
    b.close()
print("%d/%d" % (sum(res), len(res)))
