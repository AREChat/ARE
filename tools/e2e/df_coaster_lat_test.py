#!/usr/bin/env python3
"""ジェットコースター（ワールド・ジェット／スイーツ／オーロラ）：のりものの 視点が レールの まうえから よこに はみださないかを、1コマずつ しらべる。
  GAME_SRC=/…/game python3 tools/e2e/df_coaster_lat_test.py"""
import os, subprocess
import sys, time
from playwright.sync_api import sync_playwright
import subprocess, os
GAME=os.environ.get('GAME_SRC','/home/claude/r2/game'); PORT=8778
srv=subprocess.Popen([sys.executable,'-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',GAME],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
bad=0
JS="""(id)=>{ const d=window.__df,g=d.game; g.sv.coins=9999; g._noQueue=true; g._noBoard=true; g.board(d.att.find(a=>a.id===id)); const R=g.ride; let n=0, worst=0, ws=null, over=0, tot=0; const inp={mx:0,my:0,lx:0,ly:0,act:false,act2:false,esc:false,run:false};
 const acts={}; 
 while(g.mode==='ride' && n<20000){ g.update(.05, Object.assign({},inp)); n++; const c=R.camOut; if(!c||!c.P) continue; if(!R._pp){ R._pp=c.P.slice(); continue; } const F=[c.P[0]-R._pp[0],0,c.P[2]-R._pp[2]]; R._pp=c.P.slice(); const h=Math.hypot(F[0],F[2]); if(h<.02) continue; F[0]/=h; F[2]/=h; const px=F[2]/h, pz=-F[0]/h; const lat=(c.eye[0]-c.P[0])*px+(c.eye[2]-c.P[2])*pz; tot++; if(Math.abs(lat)>.64) over++; if(Math.abs(lat)>worst){ worst=Math.abs(lat); ws=[R.A&&R.A.id, +R.ct.toFixed(1), +c.roll.toFixed(2)]; } }
 return {steps:n, tot, over, worst:+worst.toFixed(2), at:ws}; }"""
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={"width":800,"height":450}); ctx.add_init_script("try{localStorage.setItem('are_gtips_off','1');}catch(e){}"); pg=ctx.new_page()
    pg.on("pageerror",lambda e:print("ERR",e))
    pg.goto(f"http://127.0.0.1:{PORT}/dream-frontier/index.html"); time.sleep(2.5); pg.evaluate("document.getElementById('startBtn').click()"); time.sleep(1.5)
    for aid in ['worldjet','sweets','aurora']:
        r = pg.evaluate(JS, aid); print(aid, r)
        if r['over'] or r['tot'] < 100: bad += 1
        pg.evaluate("()=>{ const g=window.__df.game; if(g.mode==='ride') g.endRide(false,true); g.mode='walk'; }")
    br.close()
srv.terminate()
print('すべて OK（視点は レールの まうえ）' if not bad else '← NG あり'); sys.exit(1 if bad else 0)
