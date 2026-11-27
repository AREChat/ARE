#!/usr/bin/env python3
"""ドリーム・フロンティア：コスモクルーズ・ミッション「ほしのたまご」（18パターン）の 試験。
  GAME_SRC=/…/game python3 tools/e2e/df_cosmo2_test.py
  ・18パターン ぜんぶ、さいごまで のれる／うごく ものの ざひょうが ただしい／字幕が でる
  ・声ファイル33こ が ぜんぶ ある／せりふ表と ぴったり
  ・つづけて おなじ パターンに ならない／コンプリート ボーナス／Esc で おりる／ルート×フィナーレ×たまごの いろの わりふり"""
import os, subprocess, sys, time, datetime
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8781
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
RUN = """(pat)=>{ const d=window.__df, g=d.game; if(g.ride) g.endRide(true,true); g.sv.coins=999; g._noQueue=true; g._noBoard=true; g._cosmo2Pat=pat; g.board(d.att.find(a=>a.id==='cosmo2'));
  const inp={mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false}; const R=g.ride; if(!R||R.pat!==pat) return {err:'start', pat:R&&R.pat};
  const info={route:R.route, fin:R.fin, egg:R.egg}; let steps=0, maxD=0, bad=0, caps=0, maxT=0, envs={}, musics={}; while(g.mode==='ride' && steps<9000){ g.update(.05, inp); steps++; if(g.ride){ maxT=g.ride.t; if(g.ride.cap) caps++; envs[g.ride.A.env]=1; musics[g.ride.A.music]=1; }
    if(steps%8===0 && g.mode==='ride'){ const D=g.dyn(g.t); maxD=Math.max(maxD,D.length); for(const q of D){ for(const k of ['x','y','z']) if(q[k]!==undefined && !isFinite(q[k])) bad++; } const c=g.camera ? g.camera() : null; if(c && (c.eye.some(v=>!isFinite(v)) || !isFinite(c.yaw) || !isFinite(c.pitch))) bad++; } }
  return {steps, maxD, bad, caps, maxT, mode:g.mode, coins:g.sv.coins, seen:(g.sv.cosmo2Seen.split('1').length-1), info, envs:Object.keys(envs), musics:Object.keys(musics)}; }"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(timezone_id="Asia/Tokyo"); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE); time.sleep(2); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.5)
        lines = pg.evaluate("import('./js/df-x-cosmo2-lines.js').then(m=>m.COSMO2_LINES)")
        need = [f"{c}{i}" for c, n in zip("abcdefgh", [5, 3, 3, 5, 5, 2, 5, 3]) for i in range(1, n + 1) if not (c == "e" and i == 3)] + ["e3a", "e3b", "e3c"]
        check(len(need) == 33 and all(k in lines for k in need), f"せりふ表に たりない ものが ある {[k for k in need if k not in lines]}")
        miss = [k for k in need if not os.path.exists(f"{GAME}/dream-frontier/voice/cosmo2_{k}.mp3") or os.path.getsize(f"{GAME}/dream-frontier/voice/cosmo2_{k}.mp3") < 3000]
        check(not miss, f"声ファイルが ない: {miss}")
        check(all(lines[k][2] > .8 for k in need if k in lines), "せりふの ながさが おかしい")
        check(all(lines[k][0] in ("cmd", "gov", "pico", "pilot", "gf", "gm", "bot") for k in need if k in lines), "はなす ひとが おかしい")
        pg.evaluate("(()=>{ const g=window.__df.game; g.sv.cosmo2Seen=null; g.sv.cosmo2All=0; g.sv.cosmo2Last=-1; })()")
        worst = 0; t0 = time.time(); combos = set()
        for pat in range(18):
            r = pg.evaluate(RUN, pat)
            if r.get("err"): check(False, f"パターン{pat}: はじまらない {r}"); continue
            combos.add((r["info"]["route"], r["info"]["fin"], r["info"]["egg"]))
            check(r["mode"] == "walk", f"パターン{pat}: おわらない {r}")
            check(r["bad"] == 0, f"パターン{pat}: ざひょうが おかしい {r['bad']}")
            check(r["maxD"] < 3000, f"パターン{pat}: うごく ものが おおすぎる {r['maxD']}")
            check(r["caps"] > 300, f"パターン{pat}: 字幕が すくない {r['caps']}")
            check(r["maxT"] >= 273, f"パターン{pat}: じかんが たりない {r['maxT']}")
            check({"cosbay", "cosspace", "ironbay", "cos2cor"} <= set(r["envs"]), f"パターン{pat}: かんきょうが たりない {r['envs']}")
            check({"cosmo", "cos2dark", "cos2run"} <= set(r["musics"]), f"パターン{pat}: BGMが たりない {r['musics']}")
            worst = max(worst, r["maxD"])
        check(len(combos) == 18, f"ルート×フィナーレ×たまごが 18とおりに ならない {len(combos)}")
        last = pg.evaluate("(()=>{ const g=window.__df.game; return {seen:(g.sv.cosmo2Seen.split('1').length-1), all:g.sv.cosmo2All}; })()")
        check(last["seen"] == 18 and last["all"] == 1, f"コンプリートが きろく されない {last}")
        print(f"  18パターン {time.time()-t0:.0f}びょう／うごくものの さいだい {worst}こ／コンプリート {last}")
        seq = pg.evaluate("""(()=>{ const d=window.__df, g=d.game, out=[]; for(let i=0;i<60;i++){ g._cosmo2Pat=undefined; if(g.ride) g.endRide(true,true); g.sv.coins=999; g._noQueue=true; g._noBoard=true; g.board(d.att.find(a=>a.id==='cosmo2')); out.push(g.ride.pat); } g.endRide(true,true); return out; })()""")
        check(all(seq[i] != seq[i + 1] for i in range(len(seq) - 1)), f"おなじ パターンが つづいた {seq[:12]}")
        check(len(set(seq)) >= 14, f"ばらつきが すくない {len(set(seq))}")
        r = pg.evaluate("""(()=>{ const d=window.__df, g=d.game; g._cosmo2Pat=3; g.sv.coins=999; g._noQueue=true; g._noBoard=true; g.board(d.att.find(a=>a.id==='cosmo2')); const inp={mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false}; for(let i=0;i<260;i++) g.update(.05,inp);
          const before={cap:!!document.getElementById('dfCap'), body:document.body.classList.contains('x-cosmo'), mode:g.mode}; inp.esc=true; g.update(.05,inp); inp.esc=false; g.update(.05,inp);
          return {before, after:{cap:!!document.getElementById('dfCap'), body:document.body.classList.contains('x-cosmo'), mode:g.mode, ride:!!g.ride}}; })()""")
        check(r["before"]["body"] and r["before"]["mode"] == "ride", f"のっている あいだの ようす {r}")
        check(r["after"]["mode"] == "walk" and not r["after"]["cap"] and not r["after"]["body"] and not r["after"]["ride"], f"Esc の あとしまつ {r}")
        check(not errs, f"ページの エラー: {errs[:3]}")
        br.close()
finally:
    srv.terminate()
print(f"cosmo2: ○ {ok} / × {ng}")
sys.exit(1 if ng else 0)
