"use strict";
// ===== AREシューティング（作り直し）：ノイズ射的 ～ねらって うて！～ =====
// 的（ノイズ）を ねらって うつ 的あて シューティング。3ステージ ＋ ボス（玲也・悪魔・？？？）。
// 操作：🖥️ マウスで ねらって クリック／スペース＝うつ　R＝リロード　B＝ボム　矢印・WASD＝ねらいを うごかす
//       📱 タップ＝その場所を うつ　🎮 左スティック／十字＝ねらい　A・ZR・R＝うつ　B・ZL・L＝リロード　X・Y＝ボム　−/＋＝やめる
const PK_SH_IMG = {};
function pkShImg(n){ if(!PK_SH_IMG[n]){ const im = new Image(); im.src = "./img/" + n + ".webp"; PK_SH_IMG[n] = im; } return PK_SH_IMG[n]; }
const PK_SH_BOSS = [{img:"reiya", n:"玲也", e:"😈", say:"ひひひ…ねらえるもんなら ねらってみろ〜！"}, {img:"akuma", n:"悪魔", e:"🌹", say:"ふふ…わたしの バラを うちぬける？"}, {img:"unknown", n:"？？？", e:"👤", say:"…すべての へんじを、ここで うけとめよう。"}];
const PK_SH_CFG = {
    easy:{gap:1.0, life:2.4, lives:5, friend:0.08, chase:0.06, boss:[14, 20, 28], bgap:1.8, wave:18, mag:12},
    normal:{gap:0.78, life:1.8, lives:4, friend:0.13, chase:0.10, boss:[20, 30, 42], bgap:1.4, wave:18, mag:10},
    hard:{gap:0.58, life:1.4, lives:3, friend:0.18, chase:0.15, boss:[28, 42, 60], bgap:1.0, wave:18, mag:8}
};
pkShNew = function(did, token){
    const d = PK_SHOOT.difficulty_levels.find((x) => x.id === did) || PK_SHOOT.difficulty_levels[0], c = PK_SH_CFG[d.id];
    PK_SH_BOSS.forEach((b) => pkShImg(b.img)); pkShImg("yuzai");
    return {id:"CAS005", diff:d.id, d, cfg:c, phase:"ready", token, keys:{}, ax:320, ay:180, lives:c.lives, score:0, kills:0, shots:0, hits:0, combo:0, maxc:0, ammo:c.mag, reload:0, bombs:1, stage:1, st:0, mode:"wave", foes:[], pops:[], boss:null, t:0, sp:0.6, banner:{text:"STAGE 1", t:1.6}, flash:0, hurt:0, last:0, cleared:0, res:null};
};
pkShBegin = function(){ const g = G.pk.game; if(!g || g.id !== "CAS005" || g.phase !== "ready") return; g.phase = "play"; g.last = performance.now(); G.pk.raf = requestAnimationFrame(pkShLoop); render(); };
function pkShPop(g, x, y, text, col){ g.pops.push({x, y, text, col:col || "#fff", t:0.8}); }
function pkShSpawn(g, kind){
    const c = g.cfg, x = 50 + G.rnd() * (PK_SH.W - 100), y = 50 + G.rnd() * (PK_SH.H - 100);
    if(kind === "noise") g.foes.push({kind, x, y, r:22, e:["👾", "🍙", "💾", "🐟", "🦠"][Math.floor(G.rnd() * 5)] , life:c.life * (0.85 + G.rnd() * 0.4), age:0, hp:1, pts:10, vx:(G.rnd() - 0.5) * 50, vy:(G.rnd() - 0.5) * 30});
    else if(kind === "gold") g.foes.push({kind, x, y, r:18, e:"⭐", life:c.life * 0.6, age:0, hp:1, pts:50, vx:(G.rnd() < 0.5 ? -1 : 1) * 130, vy:(G.rnd() - 0.5) * 60});
    else if(kind === "friend") g.foes.push({kind, x, y, r:22, e:G.rnd() < 0.5 ? "🐱" : "🐶", life:c.life * 1.1, age:0, hp:1, pts:0, vx:0, vy:0, img:G.rnd() < 0.3 ? "yuzai" : null});
    else if(kind === "chase") g.foes.push({kind, x, y, r:12, e:"😈", life:2.6 + (c.life - 1.4) * 0.3, age:0, hp:1, pts:25, vx:0, vy:0, grow:true});
    else if(kind === "bomb") g.foes.push({kind, x, y, r:20, e:"🎁", life:c.life * 1.2, age:0, hp:1, pts:20, vx:0, vy:0});
}
function pkShFire(g){
    if(!g || g.phase !== "play" || g.banner.t > 0.9 && g.banner.big) return;
    if(g.reload > 0) return;
    if(g.ammo <= 0){ g.reload = 0.9; return; }
    g.ammo--; g.shots++; g.flash = 0.08; pkBeep(520 + G.rnd() * 60, 0.03, 0.03);
    // うしろ（あとから でた もの）を さきに あてる
    const x = g.ax, y = g.ay; let hit = null;
    for(let i = g.foes.length - 1; i >= 0; i--){ const f = g.foes[i]; if(Math.hypot(f.x - x, f.y - y) <= f.r + 4){ hit = f; break; } }
    if(hit){ pkShHit(g, hit); return; }
    if(g.boss){ const b = g.boss; if(Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2){ const head = y < b.y - b.h * 0.22; b.hp -= head ? 3 : 1; g.hits++; g.combo++; g.maxc = Math.max(g.maxc, g.combo); g.score += head ? 30 : 10; b.shake = 0.15; pkShPop(g, x, y, head ? "HEAD! -3" : "-1", head ? "#ffe066" : "#fff"); pkBeep(head ? 880 : 660, 0.05, 0.04); return; } }
    g.combo = 0; pkShPop(g, x, y, "MISS", "#9aa");
    if(g.ammo <= 0) g.reload = 0.9;
}
function pkShHit(g, f){
    g.hits++; const i = g.foes.indexOf(f);
    if(f.kind === "friend"){ g.foes.splice(i, 1); g.combo = 0; g.score = Math.max(0, g.score - 30); g.lives--; g.hurt = 0.4; pkShPop(g, f.x, f.y, "ともだち！ ダメ！", "#ff8a8a"); pkBeep(140, 0.15, 0.05); return; }
    g.foes.splice(i, 1); g.combo++; g.maxc = Math.max(g.maxc, g.combo); g.kills++;
    const mul = 1 + Math.min(4, Math.floor(g.combo / 5)), pts = f.pts * mul; g.score += pts; pkShPop(g, f.x, f.y, "+" + pts, f.kind === "gold" ? "#ffe066" : "#7dffb0"); pkBeep(f.kind === "gold" ? 980 : 760, 0.05, 0.04);
    if(f.kind === "bomb"){ g.bombs = Math.min(3, g.bombs + 1); g.ammo = g.cfg.mag; pkShPop(g, f.x, f.y - 22, "ボム ＋1 ・ 弾 かいふく", "#9ad1ff"); }
}
function pkShBomb(g){
    if(!g || g.phase !== "play" || g.bombs <= 0) return; g.bombs--; g.flash = 0.35; pkBeep(200, 0.25, 0.06);
    g.foes.filter((f) => f.kind === "noise" || f.kind === "chase" || f.kind === "gold").forEach((f) => { g.kills++; g.score += f.pts; pkShPop(g, f.x, f.y, "+" + f.pts, "#ffb86b"); });
    g.foes = g.foes.filter((f) => !(f.kind === "noise" || f.kind === "chase" || f.kind === "gold"));
    if(g.boss) g.boss.hp -= 5;
}
pkShStep = function(g, dt){
    const c = g.cfg; g.t += dt;
    if(g.banner.t > 0) g.banner.t -= dt;
    g.flash = Math.max(0, g.flash - dt); g.hurt = Math.max(0, g.hurt - dt);
    // ねらいの いどう（キー）
    let dx = 0, dy = 0; if(g.keys.left) dx--; if(g.keys.right) dx++; if(g.keys.up) dy--; if(g.keys.down) dy++;
    if(g.pad){ dx += g.pad.x; dy += g.pad.y; }
    if(dx || dy){ const n = Math.max(1, Math.hypot(dx, dy)); g.ax = Math.max(6, Math.min(PK_SH.W - 6, g.ax + dx / n * 330 * dt)); g.ay = Math.max(6, Math.min(PK_SH.H - 6, g.ay + dy / n * 330 * dt)); }
    // リロード
    if(g.reload > 0){ g.reload -= dt; if(g.reload <= 0){ g.ammo = c.mag; g.reload = 0; pkBeep(400, 0.06, 0.03); } }
    // てきの しゅつげん
    if(g.banner.t <= 0.9 || !g.banner.big){
        if(g.mode === "wave"){
            g.st += dt; g.sp -= dt;
            if(g.sp <= 0){
                g.sp = c.gap * (0.75 + G.rnd() * 0.5) * (1 - Math.min(0.3, (g.stage - 1) * 0.12));
                const r = G.rnd();
                const kind = r < c.friend ? "friend" : r < c.friend + c.chase ? "chase" : r < c.friend + c.chase + 0.07 ? "gold" : r < c.friend + c.chase + 0.11 ? "bomb" : "noise";
                pkShSpawn(g, kind);
                if(g.stage >= 2 && G.rnd() < 0.35) pkShSpawn(g, "noise");
            }
            if(g.st >= c.wave){ g.mode = "boss"; const B = PK_SH_BOSS[g.stage - 1], hp = c.boss[g.stage - 1]; g.foes = g.foes.filter((f) => f.kind === "chase"); g.boss = {x:PK_SH.W / 2, y:150, w:120, h:150, hp, max:hp, dir:1, fire:1.2, ph:0, shake:0, B}; g.banner = {text:"BOSS  " + B.n, t:2.0, big:1, sub:B.say}; }
        }else if(g.boss){
            const b = g.boss; b.ph += dt; b.shake = Math.max(0, b.shake - dt);
            b.x = PK_SH.W / 2 + Math.sin(b.ph * (0.9 + g.stage * 0.25)) * (170 + g.stage * 25); b.y = 150 + Math.sin(b.ph * 1.7) * 36;
            b.fire -= dt; if(b.fire <= 0){ b.fire = c.bgap * (1 - (1 - b.hp / b.max) * 0.35); const n = b.hp < b.max / 2 && g.stage >= 2 ? 2 : 1; for(let k = 0; k < n; k++){ g.foes.push({kind:"chase", x:b.x + (k - (n - 1) / 2) * 60, y:b.y + 40, r:12, e:"💢", life:2.4, age:0, hp:1, pts:25, vx:(G.rnd() - 0.5) * 80, vy:60, grow:true}); } if(G.rnd() < 0.25) pkShSpawn(g, "friend"); }
            if(b.hp <= 0){ pkShBossDown(g); }
        }
    }
    // てきの うごき・じかん
    g.foes.forEach((f) => {
        f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; if(f.x < 20 || f.x > PK_SH.W - 20) f.vx = -f.vx; if(f.y < 30 || f.y > PK_SH.H - 40) f.vy = -f.vy;
        if(f.grow) f.r = 12 + 34 * Math.min(1, f.age / f.life);
    });
    const gone = g.foes.filter((f) => f.age >= f.life);
    gone.forEach((f) => { if(f.kind === "chase"){ g.lives--; g.hurt = 0.5; g.combo = 0; pkShPop(g, f.x, Math.min(f.y, PK_SH.H - 40), "やられた！", "#ff8a8a"); pkBeep(120, 0.2, 0.05); } else if(f.kind === "noise"){ g.combo = 0; } });
    g.foes = g.foes.filter((f) => f.age < f.life);
    g.pops.forEach((p) => { p.t -= dt; p.y -= 24 * dt; }); g.pops = g.pops.filter((p) => p.t > 0);
    if(g.lives <= 0) pkShEnd(g, false);
};
function pkShBossDown(g){
    g.score += 200 * g.stage + g.lives * 20; g.cleared++; g.foes = []; g.boss = null; g.combo = 0;
    if(g.stage >= 3){ pkShEnd(g, true); return; }
    g.stage++; g.mode = "wave"; g.st = 0; g.sp = 1.2; g.ammo = g.cfg.mag; g.reload = 0; g.bombs = Math.min(3, g.bombs + 1); g.banner = {text:"STAGE " + g.stage, t:1.8, big:1, sub:"CLEAR！ ボム ＋1"};
}
pkShLoop = function(now){
    const u = G.pk; u.raf = 0; const g = u.game; if(!g || g.id !== "CAS005" || g.phase !== "play" || G.mode !== "pack") return;
    const dt = Math.min(0.05, (now - g.last) / 1000); g.last = now; pkShStep(g, dt); if(g.phase !== "play") return; pkShDraw(g);
    u.raf = requestAnimationFrame(pkShLoop);
};
pkShCalc = function(g, cleared){
    const k = {easy:1, normal:2, hard:4}[g.diff], clr = {easy:15, normal:40, hard:100}[g.diff];
    const acc = g.shots ? g.hits / g.shots : 0, accB = g.shots >= 20 && acc >= 0.7 ? g.kills : 0;
    return {coins:g.kills * k + g.cleared * clr + (cleared ? clr * 2 + g.lives * 10 : 0) + accB, cleared, acc, accB};
};
pkShEnd = function(g, cleared){
    if(g.phase !== "play") return; g.phase = "end"; const r = pkShCalc(g, cleared); g.res = r;
    pkCasFinish("CAS005", {coins:r.coins, score:g.score, high:cleared && g.diff === "hard"}); render();
};
pkShAfter = function(g){
    if(g.phase === "play"){ if(!G.pk.raf) G.pk.raf = requestAnimationFrame(pkShLoop); }
    const cv = $("pkCv"); if(cv && !cv._b2){ cv._b2 = 1;
        const at = (e) => { const r = cv.getBoundingClientRect(); g.ax = Math.max(0, Math.min(PK_SH.W, (e.clientX - r.left) / r.width * PK_SH.W)); g.ay = Math.max(0, Math.min(PK_SH.H, (e.clientY - r.top) / r.height * PK_SH.H)); };
        cv.addEventListener("pointermove", (e) => { if(g.phase === "play") at(e); });
        cv.addEventListener("pointerdown", (e) => { e.preventDefault(); if(g.phase !== "play") return; at(e); pkShFire(g); });
        cv.addEventListener("contextmenu", (e) => { e.preventDefault(); if(g.phase === "play") pkShBomb(g); });
    }
    pkShDraw(g);
};
document.addEventListener("keydown", (e) => {
    if(G.mode !== "pack" || !G.pk || !G.pk.game || G.pk.game.id !== "CAS005" || G.pk.game.phase !== "play" || e.repeat) return; const g = G.pk.game;
    if(e.key === " "){ e.preventDefault(); e.stopPropagation(); pkShFire(g); }
    else if(e.key === "r" || e.key === "R"){ if(g.reload <= 0 && g.ammo < g.cfg.mag){ g.reload = 0.9; } }
    else if(e.key === "b" || e.key === "B"){ pkShBomb(g); }
}, true);
// ---- 画面
function pkShDraw(g){
    const cv = $("pkCv"); if(!cv) return; const x = cv.getContext("2d"), W = PK_SH.W, H = PK_SH.H, st = g.stage;
    const sky = [["#12306b", "#2b6cb0"], ["#0c2a3f", "#0a5b6b"], ["#140a2e", "#3b1260"]][st - 1];
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(255,255,255,.07)"; for(let i = 0; i < 14; i++){ const sx = ((i * 83 - g.t * (6 + i % 4 * 4)) % W + W) % W, sy = 20 + (i * 47) % 200; x.beginPath(); x.arc(sx, sy, 10 + i % 3 * 6, 0, 7); x.fill(); }
    x.fillStyle = "rgba(0,0,0,.28)"; x.fillRect(0, H - 34, W, 34);          // たな
    x.textAlign = "center"; x.textBaseline = "middle";
    // ボス
    if(g.boss){ const b = g.boss, im = pkShImg(b.B.img), sh = b.shake > 0 ? (G.rnd() - 0.5) * 8 : 0;
        if(im.complete && im.naturalWidth){ const h = b.h + 10, w = h * im.naturalWidth / im.naturalHeight; x.drawImage(im, b.x - w / 2 + sh, b.y - h / 2, w, h); b.w = Math.max(70, w * 0.8); }
        else{ x.font = "84px serif"; x.fillText(b.B.e, b.x + sh, b.y); b.w = 100; }
        x.fillStyle = "#333"; x.fillRect(180, 8, 280, 9); x.fillStyle = b.hp / b.max > 0.3 ? "#f87171" : "#fbbf24"; x.fillRect(180, 8, 280 * Math.max(0, b.hp) / b.max, 9);
        x.fillStyle = "#fff"; x.font = "bold 12px sans-serif"; x.fillText(b.B.n + "（あたま ＝ 3ダメージ）", W / 2, 28); }
    // 的
    g.foes.forEach((f) => {
        const k = f.kind, life = 1 - f.age / f.life, pop = Math.min(1, f.age / 0.12);
        x.save(); x.translate(f.x, f.y); x.scale(0.4 + 0.6 * pop, 0.4 + 0.6 * pop);
        x.fillStyle = k === "friend" ? "rgba(120,200,255,.35)" : k === "gold" ? "rgba(255,220,80,.45)" : k === "chase" ? "rgba(255,80,80,.35)" : k === "bomb" ? "rgba(120,160,255,.4)" : "rgba(255,255,255,.22)";
        x.beginPath(); x.arc(0, 0, f.r + 2, 0, 7); x.fill();
        x.strokeStyle = k === "friend" ? "#7cc7ff" : "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, f.r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, life)); x.stroke();
        const im = f.img ? pkShImg(f.img) : null;
        if(im && im.complete && im.naturalWidth){ const h = f.r * 2; x.drawImage(im, -h * im.naturalWidth / im.naturalHeight / 2, -h / 2, h * im.naturalWidth / im.naturalHeight, h); }
        else{ x.font = Math.round(f.r * 1.5) + "px serif"; x.fillStyle = "#fff"; x.fillText(f.e, 0, 2); }
        if(k === "friend"){ x.font = "bold 11px sans-serif"; x.fillStyle = "#cfe9ff"; x.fillText("うたない！", 0, f.r + 14); }
        x.restore();
    });
    // ポップ
    x.font = "bold 14px sans-serif"; g.pops.forEach((p) => { x.globalAlpha = Math.min(1, p.t * 2); x.fillStyle = p.col; x.fillText(p.text, p.x, p.y); }); x.globalAlpha = 1;
    // バナー
    if(g.banner.t > 0){ x.fillStyle = "rgba(0,0,0,.45)"; x.fillRect(0, H / 2 - 44, W, 88); x.fillStyle = "#fff"; x.font = "bold 34px sans-serif"; x.fillText(g.banner.text, W / 2, H / 2 - 10); if(g.banner.sub){ x.font = "14px sans-serif"; x.fillText(g.banner.sub, W / 2, H / 2 + 26); } }
    // ねらい
    x.strokeStyle = g.reload > 0 ? "#ffb347" : "#ff4d4d"; x.lineWidth = 2; x.beginPath(); x.arc(g.ax, g.ay, 15, 0, 7); x.moveTo(g.ax - 22, g.ay); x.lineTo(g.ax - 6, g.ay); x.moveTo(g.ax + 6, g.ay); x.lineTo(g.ax + 22, g.ay); x.moveTo(g.ax, g.ay - 22); x.lineTo(g.ax, g.ay - 6); x.moveTo(g.ax, g.ay + 6); x.lineTo(g.ax, g.ay + 22); x.stroke();
    if(g.flash > 0){ x.fillStyle = "rgba(255,255,255," + Math.min(0.5, g.flash * 3) + ")"; x.fillRect(0, 0, W, H); }
    if(g.hurt > 0){ x.fillStyle = "rgba(255,0,0," + Math.min(0.35, g.hurt) + ")"; x.fillRect(0, 0, W, H); }
    // HUD
    x.textAlign = "left"; x.textBaseline = "alphabetic"; x.fillStyle = "#fff"; x.font = "bold 14px sans-serif";
    x.fillText("SCORE " + g.score + "　STAGE " + g.stage + "/3　" + (g.mode === "wave" ? "あと " + Math.max(0, Math.ceil(g.cfg.wave - g.st)) + "秒でボス" : "BOSS！") + "　COMBO " + g.combo, 8, H - 18);
    x.fillText("❤️×" + g.lives + "　💣×" + g.bombs + "　" + (g.reload > 0 ? "リロード中…" : "弾 " + "●".repeat(g.ammo) + "○".repeat(Math.max(0, g.cfg.mag - g.ammo))), 8, H - 4);
};
pkShView = function(g){
    if(g.phase === "ready") return '<div class="card"><b>' + esc(g.d.name) + '</b><div class="meta">ノイズの 的を ねらって うつ「ノイズ射的」！ 3ステージ すすむと、各ステージの さいごに ボス（玲也・悪魔・？？？）が あらわれるよ。<br>' +
        '🖥️ <b>マウス</b>で ねらって クリック（スペースでも うてる）／<b>R</b>＝リロード／<b>B</b>（右クリック）＝ボム／矢印・WASD＝ねらいを うごかす<br>📱 ねらった ところを <b>タップ</b>　🎮 <b>左スティック・十字</b>で ねらい／<b>A・ZR・R</b>＝うつ／<b>B・ZL・L</b>＝リロード／<b>X・Y</b>＝ボム／<b>−・＋</b>＝やめる<br>' +
        '⭐ きんいろの 的＝50てん　🎁 ボム＋弾かいふく　😈 だんだん 大きくなる ノイズ＝おおきくなる まえに うて！（うちもらすと ダメージ）　🐱🐶 ともだちは うっちゃダメ！<br>れんぞく命中で コンボ倍率アップ。ごほうび：たおした 数 × ' + ({easy:1, normal:2, hard:4}[g.diff]) + ' ＋ ステージクリア ＋ めいちゅうりつ70%以上で ボーナス</div><div class="row">' + pkBtn("スタート！", "sgo") + '</div></div>';
    if(g.phase === "end"){ const r = g.res; return '<div class="card"><h3>' + (r.cleared ? "ぜんステージ クリア！" : "ゲームオーバー…（STAGE " + g.stage + "）") + '</h3><div>スコア ' + g.score + '　たおした数 ' + g.kills + '　めいちゅうりつ ' + Math.round(r.acc * 100) + '%　さいだいコンボ ' + g.maxc + '</div><div class="okc">🪙 ' + pkNum(r.coins) + ' コイン' + (r.accB ? '（めいちゅうボーナス ＋' + r.accB + '）' : '') + '</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>'; }
    return '<canvas id="pkCv" width="640" height="360" style="width:100%;border-radius:1cqw;touch-action:none;cursor:crosshair"></canvas>';
};
// ---- コントローラー（ゲーム中だけ 専用の入力にする）
(function(){
    window.TQ_PAD = window.TQ_PAD || {};
    const prev = window.TQ_PAD.game;
    window.TQ_PAD.game = function(down, edge, ax, dt){
        const g = G.mode === "pack" && G.pk && G.pk.game; if(!g || g.phase !== "play") return prev ? prev(down, edge, ax, dt) : false;
        if(g.id === "CAS004"){                                    // AREの達人：A＝ドン　B＝カッ　L・R・ZL・ZR＝連打　−/＋＝やめる
            if(edge[8] || edge[9]){ pkCasAbort(); G.pk.game = null; render(); return true; }
            if(edge[1]) pkRhHit("don");
            if(edge[0]) pkRhHit("ka");
            if(edge[4] || edge[5] || edge[6] || edge[7]) pkRhHit("rap");
            return true;
        }
        if(g.id !== "CAS005") return prev ? prev(down, edge, ax, dt) : false;
        if(edge[8] || edge[9]){ pkCasAbort(); G.pk.game = null; render(); return true; }
        const dz = (v) => Math.abs(v) < 0.18 ? 0 : v;
        let x = dz(ax.lx) + dz(ax.rx), y = dz(ax.ly) + dz(ax.ry); if(down[14]) x -= 1; if(down[15]) x += 1; if(down[12]) y -= 1; if(down[13]) y += 1;
        g.pad = {x:Math.max(-1, Math.min(1, x)), y:Math.max(-1, Math.min(1, y))};
        if(edge[1] || edge[7] || edge[5]) pkShFire(g);
        if(edge[0] || edge[6] || edge[4]){ if(g.reload <= 0 && g.ammo < g.cfg.mag) g.reload = 0.9; }
        if(edge[2] || edge[3]) pkShBomb(g);
        return true;
    };
})();
