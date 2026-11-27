#!/usr/bin/env python3
"""チーズいせき：ライドの レールが かべ・はしら・ものの 中を とおっていないか しらべる（レールと ジープの ならぶ 点を、まわりの 箱・円柱と 重ねて 見る）。
  GAME_SRC=/…/game python3 tools/e2e/df_cheese_track_test.py"""
import os, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
GAME = os.environ.get("GAME_SRC", "/home/claude/r2/game"); PORT = 8776
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", GAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
JS = """async()=>{
  const A = await import('./js/df-x-cheese-art.js'), PA = await import('./js/df-path.js');
  const {SCN, HALL, SX, SZ} = A, rec = [];
  const mkL = () => ({prims: []});
  const layers = {}; 
  const K = {h: {
    box: (P, x, y, z, w, h, d, c, ry) => P.push({t:'b', x, y, z, w, h, d, ry: ry||0}),
    cyl: (P, x, y, z, rt, rb, h, c) => P.push({t:'c', x, y, z, r: Math.max(rt, rb), h}),
    sph: (P, x, y, z, r, c, sy) => P.push({t:'s', x, y, z, r, sy: sy||1}),
    pln: () => {}, layer: () => ({prims: []}), model: () => ({prims: []})
  }, mk: (n) => { const L = {solid: [], ground: [], glow: [], cloud: []}; layers[n] = L; return L; }};
  const zb = HALL.zb, pts = [[A.stationPt()[0] + 13, zb, 0], A.stationPt()];
  const start = []; SCN.forEach((sc, k) => { start.push(k === 0 ? 0 : pts.length - 1); if(k === 0) pts.push([sc.cx + 50, zb, 0]); for(const p of sc.pts) pts.push([sc.cx + p[0], zb + p[1], p[2]]); pts.push([sc.cx - 50, zb, 0]); });
  const P = PA.makePath(pts.map((q) => [q[0] + SX, q[1] + SZ, q[2]]), false, 12);
  A.buildStage(K, P);
  const S = layers.cheese.solid;
  // 箱の まわりの 判定
  const inBox = (b, x, y, z) => { const dx = x - b.x, dz = z - b.z, c = Math.cos(-b.ry), s = Math.sin(-b.ry), lx = dx * c + dz * s, lz = -dx * s + dz * c; return Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2 && y > b.y && y < b.y + b.h; };
  const inCyl = (b, x, y, z) => Math.hypot(x - b.x, z - b.z) < b.r && y > b.y && y < b.y + b.h;
  const bad = {};
  const rails = S.filter(p => p.t === 'b' && p.w <= .13 && p.h <= .13);   // レール本体
  for(let s = 0; s < P.total; s += .6){
    const c = P.at(s), c2 = P.at(Math.min(P.total - .01, s + 1)), yaw = Math.atan2(c2[0] - c[0], c2[2] - c[2]);
    const k = SCN.findIndex(sc => Math.abs(c[0] - (SX + sc.cx)) < 50);
    const pr = [[0, .8], [0, 1.6], [.8, .3], [-.8, .3], [1.1, 1.0], [-1.1, 1.0], [0, 2.2]];   // [よこ, たかさ]
    for(const [lat, h] of pr){
      const x = c[0] - Math.cos(yaw) * lat, z = c[2] + Math.sin(yaw) * lat, y = c[1] + h;
      for(const b of S){
        if(b.t === 'b' && b.w <= .13 && b.h <= .13) continue;               // レールそのもの
        if(b.t === 'b' && b.h <= .35 && b.w >= 2 && b.d <= .5) continue;      // まくらぎ
        let hit = false;
        if(b.t === 'b') hit = inBox(b, x, y, z); else if(b.t === 'c') hit = inCyl(b, x, y, z);
        else if(b.t === 's'){ const r = b.r; hit = Math.hypot(x - b.x, z - b.z) < r * .8 && y > b.y - r * b.sy && y < b.y + r * b.sy; }
        if(hit){ const key = k + ':' + b.t + ':' + [b.x, b.y, b.z, b.w || b.r, b.h || '', b.d || ''].map(v => typeof v === 'number' ? Math.round(v * 10) / 10 : v).join(','); bad[key] = (bad[key] || 0) + 1; }
      }
    }
  }
  return {n: S.length, bad};
}"""
ok = True
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://127.0.0.1:{PORT}/dream-frontier/index.html"); time.sleep(2)
        r = pg.evaluate(JS)
        print("ためした ものの かず:", r["n"])
        for k, v in sorted(r["bad"].items()): print("  重なり:", k, "回", v)
        ok = not r["bad"] and not errs
        if errs: print("エラー:", errs[:2])
        br.close()
finally:
    srv.terminate()
print("すべて OK（レールは かべや ものの 中を とおらない）" if ok else "← NG あり"); sys.exit(0 if ok else 1)
