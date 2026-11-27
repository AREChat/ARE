#!/usr/bin/env python3
"""ドリーム・フロンティア：コスモ・クルーズ（100パターン）の 試験。
  GAME_SRC=/…/game python3 tools/e2e/df_cosmo_test.py
  ・100パターン ぜんぶ、さいごまで のれる／うごく ものの すう・ざひょうが ただしい
  ・声ファイル（ブリーフィング・行き先10・できごと10×2・もどり）が ぜんぶ ある
  ・つづけて おなじ パターンに ならない／コンプリート ボーナス／Esc で おりる"""
import os, subprocess, sys, time, datetime, json
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8779
BASE = f"http://127.0.0.1:{PORT}/dream-frontier/index.html"
ok = ng = 0
def check(c, m):
    global ok, ng
    if c: ok += 1
    else: ng += 1; print("NG:", m)
def ms(y, mo, d, h):
    return int(datetime.datetime(y, mo, d, h, tzinfo=datetime.timezone(datetime.timedelta(hours=9))).timestamp() * 1000)
INIT = """(function(){ const R=Date, base=%d, t0=R.now(); class D extends R{ constructor(...a){ if(a.length===0) super(base+(R.now()-t0)); else super(...a);} static now(){ return base+(R.now()-t0); } } window.Date=D; try{localStorage.setItem('are_gtips_off','1');}catch(e){}})();""" % ms(2026, 12, 3, 7)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", GAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
RUN = """(pat)=>{ const d=window.__df, g=d.game; if(g.ride) g.endRide(true,true); g.sv.coins=999; g._noQueue=true; g._noBoard=true; g._cosmoPat=pat; g.board(d.att.find(a=>a.id==='cosmo'));
  const inp={mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false}; const R=g.ride; if(!R||R.pat!==pat) return {err:'start', pat:R&&R.pat};
  let steps=0, maxD=0, bad=0, caps=0, maxT=0; while(g.mode==='ride' && steps<4000){ g.update(.05, inp); steps++; if(g.ride) maxT=g.ride.t; if(g.ride&&g.ride.cap) caps++;
    if(steps%8===0 && g.mode==='ride'){ const D=g.dyn(g.t); maxD=Math.max(maxD,D.length); for(const q of D){ for(const k of ['x','y','z']) if(q[k]!==undefined && !isFinite(q[k])) bad++; } const c=g.camera ? g.camera() : null; if(c && c.eye.some(v=>!isFinite(v))) bad++; } }
  return {steps, maxD, bad, caps, maxT, mode:g.mode, coins:g.sv.coins, seen:(g.sv.cosmoSeen.split('1').length-1)}; }"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(timezone_id="Asia/Tokyo"); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE); time.sleep(2); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.5)
        # 声ファイル
        lines = pg.evaluate("import('./js/df-x-cosmo-lines.js').then(m=>m.COSMO_LINES)")
        need = ["b1", "b2", "b3", "b4", "cd", "l1", "l2"] + [f"d{i}" for i in range(10)] + [f"e{i}{ab}" for i in range(10) for ab in "ab"]
        check(all(k in lines for k in need), "せりふ表に たりない ものが ある")
        miss = [k for k in need if not os.path.exists(f"{GAME}/dream-frontier/voice/cosmo_{k}.mp3") or os.path.getsize(f"{GAME}/dream-frontier/voice/cosmo_{k}.mp3") < 3000]
        check(not miss, f"声ファイルが ない: {miss}")
        check(all(lines[k][2] > .8 for k in need if k in lines), "せりふの ながさが おかしい")
        # 100パターン
        pg.evaluate("(()=>{ const g=window.__df.game; g.sv.cosmoSeen=null; g.sv.cosmoAll=0; g.sv.cosmoLast=-1; })()")
        worst = 0; t0 = time.time()
        for pat in range(100):
            r = pg.evaluate(RUN, pat)
            if r.get("err"): check(False, f"パターン{pat}: はじまらない {r}"); continue
            check(r["mode"] == "walk", f"パターン{pat}: おわらない {r}")
            check(r["bad"] == 0, f"パターン{pat}: ざひょうが おかしい {r['bad']}")
            check(r["maxD"] < 3000, f"パターン{pat}: うごく ものが おおすぎる {r['maxD']}")
            check(r["caps"] > 200, f"パターン{pat}: 字幕が すくない {r['caps']}")
            check(r["maxT"] >= 78, f"パターン{pat}: じかんが たりない {r['maxT']}")
            worst = max(worst, r["maxD"])
        last = pg.evaluate("(()=>{ const g=window.__df.game; return {seen:(g.sv.cosmoSeen.split('1').length-1), all:g.sv.cosmoAll}; })()")
        check(last["seen"] == 100 and last["all"] == 1, f"コンプリートが きろく されない {last}")
        print(f"  100パターン {time.time()-t0:.0f}びょう／うごくものの さいだい {worst}こ／コンプリート {last}")
        # つづけて おなじに ならない
        seq = pg.evaluate("""(()=>{ const d=window.__df, g=d.game, out=[]; g._cosmoPat=undefined; for(let i=0;i<60;i++){ g._cosmoPat=undefined; if(g.ride) g.endRide(true,true); g.sv.coins=999; g._noQueue=true; g._noBoard=true; g.board(d.att.find(a=>a.id==='cosmo')); out.push(g.ride.pat); } g.endRide(true,true); return out; })()""")
        check(all(seq[i] != seq[i + 1] for i in range(len(seq) - 1)), f"おなじ パターンが つづいた {seq[:12]}")
        check(len(set(seq)) >= 25, f"ばらつきが すくない {len(set(seq))}")
        # Esc で おりる／あとしまつ
        r = pg.evaluate("""(()=>{ const d=window.__df, g=d.game; g._cosmoPat=3; g.sv.coins=999; g._noQueue=true; g._noBoard=true; g.board(d.att.find(a=>a.id==='cosmo')); const inp={mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false}; for(let i=0;i<260;i++) g.update(.05,inp);
          const before={cap:!!document.getElementById('dfCap'), body:document.body.classList.contains('x-cosmo'), mode:g.mode}; inp.esc=true; g.update(.05,inp); inp.esc=false; g.update(.05,inp);
          return {before, after:{cap:!!document.getElementById('dfCap'), body:document.body.classList.contains('x-cosmo'), mode:g.mode, ride:!!g.ride}}; })()""")
        check(r["before"]["body"] and r["before"]["mode"] == "ride", f"のっている あいだの ようす {r}")
        check(r["after"]["mode"] == "walk" and not r["after"]["cap"] and not r["after"]["body"] and not r["after"]["ride"], f"Esc の あとしまつ {r}")
        check(not errs, f"ページの エラー: {errs[:3]}")
        br.close()
finally:
    srv.terminate()
print(f"cosmo: ○ {ok} / × {ng}")
sys.exit(1 if ng else 0)
