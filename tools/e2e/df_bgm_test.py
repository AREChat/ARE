#!/usr/bin/env python3
"""ドリームフロンティアの BGM：切りかえの途中で また切りかわっても、前の曲が 鳴りつづけない（洞窟の曲と チーズいせきの List123 が 重ならない）。
  GAME_SRC=/…/game python3 tools/e2e/df_bgm_test.py
音のファイルは「偽物」に差しかえて、どの曲が鳴っているか（止まっていない曲は どれか）だけを 調べる。"""
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8772
BASE = f"http://127.0.0.1:{PORT}/dream-frontier/index.html"
INIT = """
window.__auds=[];
window.Audio=function(src){ const a={src:String(src),paused:true,volume:1,currentTime:0,loop:false,preload:'',
  addEventListener(){}, pause(){ this.paused=true; }, play(){ this.paused=false; return Promise.resolve(); }, load(){}, canPlayType(){return 'probably'} };
  window.__auds.push(a); return a; };
try{localStorage.setItem('are_gtips_off','1');}catch(e){}
"""
ok = ng = 0
def check(c, m):
    global ok, ng
    if c: ok += 1
    else: ng += 1; print("NG:", m)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", GAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE); time.sleep(2); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.2)
        pg.evaluate("async()=>{ window.S=(await import('./js/audio.js')).Snd; S.resume(); }")
        def playing(): return pg.evaluate("window.__auds.filter(a=>/bgm\\//.test(a.src)&&!a.paused&&a.volume>0.01).map(a=>a.src.split('/').pop().replace('.mp3',''))")
        def go(steps, wait=1.6):
            for k, gap in steps: pg.evaluate("(k)=>S.setBgm(k)", k); time.sleep(gap)
            time.sleep(wait); return playing()
        check(go([("cave", 1.6), ("cheeseq", .3), ("cheeseride", 0)]) == ["cheeseride"], "洞窟→(0.3秒)→チーズ待ち→ライド：ライドの曲だけ")
        check(go([("cave", .3), ("cheeseq", 0)]) == ["cheeseq"], "ライド→(0.3秒)→洞窟→チーズ待ち：チーズ待ちの曲だけ")
        check(go([("cave", 0)]) == ["cave"], "チーズ待ち→洞窟：洞窟の曲だけ")
        check(go([("cheeseq", 0)]) == ["cheeseq"], "洞窟→チーズ待ち：List123 だけ")
        check(go([("cheeseride", 0)]) == ["cheeseride"], "チーズ待ち→ライド：List123 だけ（ライド側）")
        check(go([("town", .2), ("cave", .2), ("town", .2), ("cave", .2), ("cheeseq", 0)]) == ["cheeseq"], "ばらばらに 連打しても 最後の曲だけ")
        check(go([("cheeseq", .05), ("cheeseride", .05), ("cheeseq", .05), ("cheeseride", .05), ("cave", 0)]) == ["cave"], "チーズの2曲を 素早く 行き来しても 最後の曲だけ")
        check(go([("cheeseq", 0), ("cheeseq", 0), ("cheeseq", 0)]) == ["cheeseq"], "同じ曲を くりかえし 指定しても 1曲だけ")
        pg.evaluate("S.setOn(false)"); time.sleep(.5); check(playing() == [], "音を切ると ぜんぶ止まる")
        pg.evaluate("S.setOn(true)"); pg.evaluate("S.setBgm('cave')"); time.sleep(1.6); check(playing() == ["cave"], "入れなおすと 1曲だけ もどる")
        check(not errs, "エラーなし %s" % errs[:1])
        b.close()
finally:
    srv.terminate()
print(f"{ok} / {ok + ng}" + ("  ← NG あり" if ng else "  すべて OK")); sys.exit(1 if ng else 0)
