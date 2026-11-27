#!/usr/bin/env python3
"""ドリーム・フロンティア：のりこみ演出（動く床で のる／1だいずつ とまる）の 試験。
  GAME_SRC=/…/game python3 tools/e2e/df_board_test.py"""
import os, subprocess, sys, time, datetime
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8774
BASE = f"http://127.0.0.1:{PORT}/dream-frontier/index.html"
def init(ms):
    return """(function(){ const R=Date, base=%d, t0=R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(base+(R.now()-t0)); else super(...a);} static now(){ return base+(R.now()-t0); } } window.Date=D;
try{localStorage.setItem('are_gtips_off','1');}catch(e){}})();""" % ms
ok = ng = 0
def check(c, m):
    global ok, ng
    if c: ok += 1
    else: ng += 1; print("NG:", m)
def ms(y, mo, d, h, mi=0):
    return int(datetime.datetime(y, mo, d, h, mi, tzinfo=datetime.timezone(datetime.timedelta(hours=9))).timestamp() * 1000)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", GAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
STEP = """(args)=>{ const g=window.__df.game, inp=Object.assign({mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false}, args.inp||{}); let n=0; while(n<args.max && (!args.until || !eval(args.until))){ g.update(.05, Object.assign({}, inp)); n++; if(args.inp && args.once) args.inp=null; } return n; }"""
def open_page(br, when):
    ctx = br.new_context(timezone_id="Asia/Tokyo"); ctx.add_init_script(init(when)); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); time.sleep(2); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.5)
    pg.evaluate("(()=>{ const g=window.__df.game; g.sv.coins=9999; g.sv.bd={}; })()")
    return ctx, pg, errs
def st(pg):
    return pg.evaluate("""(()=>{ const g=window.__df.game; const r=document.getElementById('dfBoard'); return {mode:g.mode, coins:g.sv.coins, scene:!!r, belt:!!(r&&r.querySelector('.belt')), doors:!!(r&&r.querySelector('.dl')), bd:JSON.stringify(g.sv.bd||{}), ride:g.ride?g.ride.a.id:null, cap:r&&r.querySelector('.bc')?r.querySelector('.bc').textContent:'' }; })()""")
def reset_walk(pg):
    pg.evaluate("(()=>{ const g=window.__df.game; if(g.mode==='ride') g.endRide(false,true); if(g.mode==='board') g.cancelBoard(); g.mode='walk'; })()")
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx, pg, errs = open_page(br, ms(2026, 12, 3, 7))
        ids = pg.evaluate("import('./js/df-board.js').then(m=>m.BOARD_IDS)")
        check(len(ids) == 21, f"演出のある のりもの 21こ {len(ids)}")
        atts = pg.evaluate("window.__df.att.map(a=>a.id)")
        for i in ids: check(i in atts, f"{i} は のりものに ある")
        moves = pg.evaluate("import('./js/df-board.js').then(m=>Object.values(m.BOARD).filter(b=>b.s==='move').length)")
        stops = pg.evaluate("import('./js/df-board.js').then(m=>Object.values(m.BOARD).filter(b=>b.s==='stop').length)")
        check(moves == 9 and stops == 12, f"うごく床 9・とまる 12 {moves}/{stops}")
        # 1) ぜんぶの のりもので：演出 → のりこむ（1回目は ぜんぶ見せる）
        for i in ids:
            reset_walk(pg); c0 = pg.evaluate("(()=>{const g=window.__df.game; return g.sv.coins})()")
            pg.evaluate("(i)=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id===i)); }", i)
            s = st(pg)
            check(s["mode"] == "board" and s["scene"], f"{i}：のりばの演出が はじまる {s}")
            kind = pg.evaluate("(i)=>import('./js/df-board.js').then(m=>m.BOARD[i].s)", i)
            check((kind == "move" and s["belt"]) or (kind == "stop" and s["doors"]), f"{i}：{kind} の 見た目が 出る {s}")
            check(s["coins"] == c0, f"{i}：演出中は コインが へらない")
            cam = pg.evaluate("(()=>{ const c=window.__df.game.camera(); return [c.eye.every(Number.isFinite), Number.isFinite(c.yaw), Number.isFinite(c.pitch)]; })()")
            check(all(cam), f"{i}：演出中の カメラが 正しい {cam}")
            n = pg.evaluate(STEP, {"max": 600, "until": "g.mode!=='board'"})
            s = st(pg)
            check(s["mode"] == "ride" and s["ride"] == i and not s["scene"], f"{i}：演出が おわると のりものに のる {s}")
            check(n * .05 > 5.5, f"{i}：1回目は ぜんぶ 見せる（{n*.05:.1f}びょう）")
            pg.evaluate(STEP, {"max": 3})
        # 2) 3回目は みじかい版
        reset_walk(pg); pg.evaluate("window.__df.game.sv.bd={}")
        ts = []
        for k in range(3):
            pg.evaluate("(()=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id==='ghost')); })()")
            n = pg.evaluate(STEP, {"max": 600, "until": "g.mode!=='board'"}); ts.append(n * .05); reset_walk(pg)
        check(ts[0] > 5 and ts[1] > 5 and ts[2] < ts[0] - 1.5, f"3回目から みじかい {ts}")
        check(pg.evaluate("window.__df.game.sv.bd.ghost") == 3, "回数を おぼえている")
        # 3) とばす（E）／やめる（Esc）
        reset_walk(pg); pg.evaluate("(()=>{ const g=window.__df.game; g.sv.bd={}; const d=window.__df; g.board(d.att.find(a=>a.id==='carousel')); })()")
        pg.evaluate(STEP, {"max": 6}); check(st(pg)["mode"] == "board", "0.3びょうでは とばせない（まだ演出）")
        pg.evaluate(STEP, {"max": 20}); n = pg.evaluate(STEP, {"max": 100, "until": "g.mode!=='board'", "inp": {"act": True}})
        s = st(pg); check(s["mode"] == "ride" and n < 8, f"E で とばせる {n} {s}")
        reset_walk(pg); c0 = st(pg)["coins"]
        pg.evaluate("(()=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id==='mine')); })()"); pg.evaluate(STEP, {"max": 15})
        pg.evaluate(STEP, {"max": 1, "inp": {"esc": True}}); s = st(pg)
        check(s["mode"] == "walk" and not s["scene"] and s["coins"] == c0 and s["ride"] is None, f"Esc で やめる（コインは そのまま）{s}")
        ft = pg.evaluate("window.__df.ui.el.frame.className"); check(ft == "", f"やめたあと わく が のこらない [{ft}]")
        # 4) コインが たりない → 演出も はじまらない
        reset_walk(pg); pg.evaluate("(()=>{ const g=window.__df.game; g.sv.coins=0; })()")
        pg.evaluate("(()=>{ const d=window.__df; const a=d.att.find(a=>a.id==='sweets'); a.coin=a.coin||20; d.game.board(a); })()"); s = st(pg)
        check(s["mode"] == "walk" and not s["scene"], f"コインなしは 演出に ならない {s}"); pg.evaluate("window.__df.game.sv.coins=9999")
        # 5) オートプレイ中は 演出なし／おえたあとも 次の演出が 出る
        reset_walk(pg); pg.evaluate("(()=>{ const d=window.__df; d.game.auto.on=true; d.game.board(d.att.find(a=>a.id==='boat')); })()"); s = st(pg)
        check(s["mode"] == "ride" and not s["scene"], f"オート中は 演出を とばす {s}"); pg.evaluate("window.__df.game.auto.on=false")
        # 6) 演出中に オートを入れたら すぐ のりこむ
        reset_walk(pg); pg.evaluate("(()=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id==='boat')); })()"); pg.evaluate(STEP, {"max": 10})
        pg.evaluate("window.__df.game.auto.on=true"); pg.evaluate(STEP, {"max": 2}); s = st(pg); check(s["mode"] == "ride", f"演出中の オートで のりこむ {s}"); pg.evaluate("window.__df.game.auto.on=false")
        # 7) 演出の ないもの（チーズ・クエスト・パレード）
        reset_walk(pg); pg.evaluate("(()=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id==='cheese')); })()"); s = st(pg)
        check(s["mode"] == "ride" and not s["scene"], f"チーズいせきは 独自の のりこみ {s}")
        reset_walk(pg)
        for i in ("rhythm", "maze", "jump", "kart"):
            pg.evaluate("(i)=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id===i)); }", i); s = st(pg)
            check(s["mode"] != "board" and not s["scene"], f"{i}：演出の対象外 {s}"); reset_walk(pg)
        # 8) いろいろな 画面の 大きさ
        for w, h in ((390, 800), (1280, 720)):
            pg.set_viewport_size({"width": w, "height": h}); reset_walk(pg)
            pg.evaluate("(()=>{ const d=window.__df; d.game.sv.bd={}; d.game.board(d.att.find(a=>a.id==='ship')); })()"); pg.evaluate(STEP, {"max": 50})
            r = pg.evaluate("(()=>{ const q=e=>e?e.getBoundingClientRect():null; const r=document.getElementById('dfBoard'); const c=q(r.querySelector('.bc')), t=q(r.querySelector('.bt')); return [c.left>=0, c.right<=innerWidth+1, t.left>=-1, t.right<=innerWidth+1, c.height>0]; })()")
            check(all(r), f"{w}x{h}：字が はみださない {r}"); reset_walk(pg)
        check(not errs, f"エラーなし {errs[:2]}"); ctx.close()
        # 9) まち時間あり：キュー → 演出 → のりもの
        ctx, pg, errs = open_page(br, ms(2026, 12, 5, 11))
        pg.evaluate("(()=>{ const d=window.__df; d.game.board(d.att.find(a=>a.id==='ghost')); })()"); s = st(pg)
        check(s["mode"] == "ride" and not s["scene"], f"まち時間があれば まず キューライン {s}")
        n = pg.evaluate(STEP, {"max": 6000, "until": "g.mode==='board'"}); s = st(pg)
        check(s["mode"] == "board" and s["scene"], f"キューを ぬけたら 乗りこみ演出 {s}")
        pg.evaluate(STEP, {"max": 600, "until": "g.mode!=='board'"}); s = st(pg)
        check(s["mode"] == "ride" and s["ride"] == "ghost", f"演出のあと ほんとうの のりもの {s}")
        check(not errs, f"エラーなし(キュー) {errs[:2]}"); ctx.close(); br.close()
finally:
    srv.terminate()
print(f"{ok} / {ok + ng}" + ("  ← NG あり" if ng else "  すべて OK")); sys.exit(1 if ng else 0)
