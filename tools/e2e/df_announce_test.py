#!/usr/bin/env python3
"""ドリーム・フロンティア：全アトラクションの アナウンス（声・字幕・こうか）と おばけやしきの かざりの 試験。
  GAME_SRC=/…/game python3 tools/e2e/df_announce_test.py"""
import os, subprocess, sys, time, datetime
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8780
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
RUN = """(args)=>{ const d=window.__df, g=d.game; if(g.ride) g.endRide(true,true); g.sv.coins=9999; g._noQueue=true; g._noBoard=true; g.board(d.att.find(a=>a.id===args.id));
  const R=g.ride; if(!R) return {err:'start'}; const inp={mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false}; let steps=0, bad=0, maxD=0, caps=0, capSeen=false, fired=0;
  while(g.mode==='ride' && steps<args.max){ g.update(.05, inp); steps++; if(g.ride && g.ride.cap) caps++; if(g.ride && g.ride.ann) fired=Object.keys(g.ride.ann.done).length;
    if(steps%10===0 && g.mode==='ride'){ const D=g.dyn(g.t); maxD=Math.max(maxD,D.length); for(const q of D) for(const k of ['x','y','z']) if(q[k]!==undefined && !isFinite(q[k])) bad++; } }
  const done = g.mode!=='ride'; if(!done){ inp.esc=true; g.update(.05,inp); inp.esc=false; g.update(.05,inp); }
  return {steps, bad, maxD, caps, fired, done, after:{cap:!!document.getElementById('dfCap'), mode:g.mode}}; }"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(timezone_id="Asia/Tokyo"); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE); time.sleep(2); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.5)
        data = pg.evaluate("import('./js/df-announce-lines.js').then(m=>({L:m.ANN_LINES,E:m.ANN_END}))")
        L, E = data["L"], data["E"]
        ids = pg.evaluate("window.__df.att.map(a=>a.id)")
        check(all(k in ids for k in L), "ほんとうに ない アトラクションの せりふが ある")
        nvoice = 0
        for rid, lines in L.items():
            for ln in lines:
                f = f"{GAME}/dream-frontier/voice/{ln['id']}.mp3"; nvoice += 1
                check(os.path.exists(f) and os.path.getsize(f) > 2500, f"声ファイルが ない/ちいさい: {ln['id']}")
                check(ln["d"] > .6 and ln["tx"] and ln["who"], f"せりふ表が おかしい: {ln['id']}")
        for k in E: check(os.path.exists(f"{GAME}/dream-frontier/voice/ann_{k}.mp3"), f"おわりの声が ない: {k}")
        print(f"  アナウンス {len(L)}アトラクション／せりふ {nvoice}本")
        XM = {"rhythm", "maze", "loop", "jump", "kart"}
        for rid, lines in L.items():
            r = pg.evaluate(RUN, {"id": rid, "max": 700 if rid in XM else 7000})
            if r.get("err"): check(False, f"{rid}: はじまらない"); continue
            check(r["bad"] == 0, f"{rid}: ざひょうが おかしい {r['bad']}")
            check(r["after"]["mode"] == "walk" and not r["after"]["cap"], f"{rid}: おりた あとの あとしまつ {r['after']}")
            need = len(lines) if rid not in XM else len(lines)
            check(r["fired"] >= need - (1 if rid not in XM else 0), f"{rid}: せりふが ぜんぶ 出ない {r['fired']}/{len(lines)} (steps {r['steps']}, done {r['done']})")
            if any(not ln.get("nc") for ln in lines): check(r["caps"] > 20, f"{rid}: 字幕が 出ない {r['caps']}")
            if rid == "ghost": print(f"  ghost: うごくものの さいだい {r['maxD']}こ")
            if rid == "ghost": check(r["maxD"] > 40, f"ghost: かざりが すくない {r['maxD']}")
        check(not errs, f"ページの エラー: {errs[:3]}")
        br.close()
finally:
    srv.terminate()
print(f"announce: ○ {ok} / × {ng}")
sys.exit(1 if ng else 0)
