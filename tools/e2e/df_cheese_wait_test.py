#!/usr/bin/env python3
"""チーズいせき：まち時間 0ふん のときは、キューラインを とばして すぐ のれる（ならんでいる人も いない）。まち時間があるときは 今までどおり キューに ならぶ。
  GAME_SRC=/…/game python3 tools/e2e/df_cheese_wait_test.py"""
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8773
BASE = f"http://127.0.0.1:{PORT}/dream-frontier/index.html"
def init(ms):   # ブラウザの「いま」を ms（UTC ミリ秒）に固定する
    return """(function(){ const R=Date, base=%d, t0=R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(base+(R.now()-t0)); else super(...a);} static now(){ return base+(R.now()-t0); } } window.Date=D; })();
try{localStorage.setItem('are_gtips_off','1');}catch(e){}""" % ms
ok = ng = 0
def check(c, m):
    global ok, ng
    if c: ok += 1
    else: ng += 1; print("NG:", m)
def ms(y, mo, d, h, mi=0):   # 日本時間 → UTC ミリ秒（ブラウザの時間帯を Asia/Tokyo にそろえる）
    import datetime
    return int(datetime.datetime(y, mo, d, h, mi, tzinfo=datetime.timezone(datetime.timedelta(hours=9))).timestamp() * 1000)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", GAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
def run(br, when, label, expect_zero):
    ctx = br.new_context(timezone_id="Asia/Tokyo"); ctx.add_init_script(init(when)); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); time.sleep(2); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.5)
    w = pg.evaluate("import('./js/df-wait.js').then(m=>m.waitMinutes('cheese'))")
    check((w == 0) == expect_zero, f"{label}：まち時間の前提 {w}")
    pg.evaluate("(()=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id==='cheese')); })()"); time.sleep(1.5)
    st = pg.evaluate("(()=>{ const g=window.__df.game, R=g.ride; return R ? {t:R.t, boarded:!!R.boarded, w0:R.w0, bgm:g.bgmKey(), mode:g.mode} : null; })()")
    if expect_zero:
        check(st and st["mode"] == "ride" and st["boarded"] and st["t"] >= 360 and st["w0"] == 0, f"{label}：0分ならキューを とばして すぐ のりこむ {st}")
        check(st and st["bgm"] == "cheeseride", f"{label}：曲は ライドの List123 だけ {st}")
        n = pg.evaluate("(()=>{ const g=window.__df.game; const D=[]; g.dyn(g.t); return 0; })()")
    else:
        check(st and st["mode"] == "ride" and not st["boarded"] and st["t"] < 360 and st["w0"] == w, f"{label}：まち時間があるときは キューに ならぶ {st}")
        check(st and st["bgm"] == "cheeseq", f"{label}：ならぶ間の曲 {st}")
    check(not errs, f"{label}：エラーなし {errs[:1]}")
    ctx.close()
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        run(br, ms(2026, 12, 3, 7), "平日 朝7時（営業時間まえ・0分）", True)
        run(br, ms(2026, 12, 3, 22), "平日 夜10時（0分）", True)
        run(br, ms(2026, 12, 3, 11), "平日 昼11時（まち時間あり）", False)
        run(br, ms(2026, 12, 5, 11), "土曜 昼11時（20分）", False)
        br.close()
finally:
    srv.terminate()
print(f"{ok} / {ok + ng}" + ("  ← NG あり" if ng else "  すべて OK")); sys.exit(1 if ng else 0)
