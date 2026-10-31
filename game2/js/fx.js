"use strict";
// ===== 戦闘の演出（パーティクル）=====
// 加算合成のビルボード粒で、炎・氷・雷・光・斬撃などを表現する（画像ファイルなし）。
import {Geo, M4} from "./gl.js";

const mk = (draw) => { const c = document.createElement("canvas"); c.width = c.height = 64; draw(c.getContext("2d")); return c; };
const TEX = {
    glow: () => mk((x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.35, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }),
    star: () => mk((x) => { x.translate(32, 32); x.fillStyle = "#fff"; for(let k = 0; k < 4; k++){ x.rotate(Math.PI / 2); x.beginPath(); x.moveTo(0, -30); x.quadraticCurveTo(3, -3, 30, 0); x.quadraticCurveTo(3, 3, 0, 30); x.quadraticCurveTo(-3, 3, -30, 0); x.quadraticCurveTo(-3, -3, 0, -30); x.fill(); } const g = x.createRadialGradient(0, 0, 0, 0, 0, 14); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(-32, -32, 64, 64); }),
    ring: () => mk((x) => { x.strokeStyle = "#fff"; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 26, 0, 7); x.stroke(); x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 10; x.beginPath(); x.arc(32, 32, 26, 0, 7); x.stroke(); }),
    slash: () => mk((x) => { const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.beginPath(); x.moveTo(0, 32); x.quadraticCurveTo(32, 18, 64, 32); x.quadraticCurveTo(32, 46, 0, 32); x.fill(); }),
    drop: () => mk((x) => { x.fillStyle = "#fff"; x.beginPath(); x.moveTo(32, 6); x.quadraticCurveTo(54, 36, 32, 56); x.quadraticCurveTo(10, 36, 32, 6); x.fill(); }),
    petal: () => mk((x) => { x.fillStyle = "#fff"; x.beginPath(); x.ellipse(32, 32, 24, 11, .5, 0, 7); x.fill(); }),
    smoke: () => mk((x) => { for(let k = 0; k < 6; k++){ const g = x.createRadialGradient(20 + k * 5, 28 + (k % 2) * 8, 0, 20 + k * 5, 28 + (k % 2) * 8, 18); g.addColorStop(0, "rgba(255,255,255,.5)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); } })
};
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const hx = (c) => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];

export class Fx{
    constructor(R){
        this.R = R; this.ps = []; this.t = 0; this.tex = {};
        const g = new Geo(); const v = (x, y, u, w) => g.vert(null, [x, y, 0], [0, 0, 1], [1, 1, 1], [u, w]);
        const a = v(-.5, -.5, 0, 1), b = v(.5, -.5, 1, 1), c = v(.5, .5, 1, 0), d = v(-.5, .5, 0, 0); g.tri(a, b, c); g.tri(a, c, d);
        this.quad = R.mesh(g);
    }
    _tex(n){ if(!this.tex[n]) this.tex[n] = this.R.tex(TEX[n]()); return this.tex[n]; }
    clear(){ this.ps.length = 0; }
    get busy(){ return this.ps.length > 0; }
    // 粒をひとつ追加
    p(o){ this.ps.push(Object.assign({age: 0, life: 1, pos: [0, 0, 0], vel: [0, 0, 0], g: 0, s0: .5, s1: 0, c0: "#ffffff", c1: null, a0: 1, a1: 0, tex: "glow", spin: 0, rot: 0, drag: 0, stretch: 0, add: true, delay: 0}, o)); }
    update(dt){
        for(const q of this.ps){
            if(q.delay > 0){ q.delay -= dt; continue; }
            q.age += dt; q.vel[1] -= q.g * dt; const dr = Math.max(0, 1 - q.drag * dt);
            q.vel[0] *= dr; q.vel[1] *= dr; q.vel[2] *= dr;
            q.pos[0] += q.vel[0] * dt; q.pos[1] += q.vel[1] * dt; q.pos[2] += q.vel[2] * dt; q.rot += q.spin * dt;
        }
        this.ps = this.ps.filter((q) => q.age < q.life);
    }
    draw(){
        const R = this.R, V = R.view; if(!V) return;
        const rx = [V[0], V[4], V[8]], uy = [V[1], V[5], V[9]], fz = [V[2], V[6], V[10]];
        for(const q of this.ps){
            if(q.delay > 0) continue;
            const k = q.age / q.life; const s = lerp(q.s0, q.s1, k); if(s <= 0.001) continue;
            const c0 = hx(q.c0), c1 = q.c1 ? hx(q.c1) : c0; const a = lerp(q.a0, q.a1, k);
            const cs = Math.cos(q.rot), sn = Math.sin(q.rot); const sx = s * (1 + q.stretch), sy = s;
            const m = new Float32Array(16);
            // 画面に正対するよう、カメラの右・上を使って回転とスケールを組む
            for(let i = 0; i < 3; i++){ m[i] = (rx[i] * cs + uy[i] * sn) * sx; m[4 + i] = (-rx[i] * sn + uy[i] * cs) * sy; m[8 + i] = fz[i]; }
            m[12] = q.pos[0]; m[13] = q.pos[1]; m[14] = q.pos[2]; m[15] = 1;
            R.draw(this.quad, {m, tex: this._tex(q.tex), mode: 2, blend: true, add: q.add, cull: false, cut: .003, tint: [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k), a]});
        }
    }
    // ===== 演出メニュー =====
    // from/to は [x,y,z]。dur は目安の長さ（秒）
    play(kind, from, to, o){
        const op = o || {}; const f = from, t = to || from; const P = (i) => lerp(f[i], t[i], 1);
        const dir = [t[0] - f[0], t[1] - f[1], t[2] - f[2]]; const len = Math.hypot(dir[0], dir[1], dir[2]) || 1; const nd = dir.map((v) => v / len);
        const at = (u) => [lerp(f[0], t[0], u), lerp(f[1], t[1], u), lerp(f[2], t[2], u)];
        let dur = .8;
        const burst = (pos, n, col, col2, sp, size, life, tex) => { for(let i = 0; i < n; i++){ const a = rnd(0, 6.283), b = rnd(-1, 1); this.p({pos: pos.slice(), vel: [Math.cos(a) * sp * rnd(.3, 1), Math.abs(b) * sp * .8 + sp * .2, Math.sin(a) * sp * rnd(.3, 1)], g: 3, s0: size * rnd(.6, 1.2), s1: 0, c0: col, c1: col2, life: life * rnd(.6, 1), tex: tex || "glow"}); } };
        switch(kind){
        case "fire": case "flame": {   // 口から炎を吹く：長い火炎放射＋着弾の火柱
            dur = 1.3;
            for(let i = 0; i < 70; i++){ const d0 = i / 70 * .6; const spread = .25 + i / 70 * .5; const sp = len * 1.6 * rnd(.8, 1.1);
                this.p({delay: d0, pos: f.slice(), vel: [nd[0] * sp + rnd(-1, 1) * spread, nd[1] * sp + rnd(-1, 1) * spread + .4, nd[2] * sp + rnd(-1, 1) * spread], life: rnd(.5, .75), s0: .35, s1: rnd(1.2, 2.0), c0: "#fff2a0", c1: "#ff3a00", a0: 1, a1: 0, drag: .6, rot: rnd(0, 6), spin: rnd(-3, 3)}); }
            for(let i = 0; i < 40; i++){ this.p({delay: .35 + rnd(0, .5), pos: [t[0] + rnd(-.8, .8), t[1] - .6, t[2] + rnd(-.5, .5)], vel: [rnd(-.5, .5), rnd(2, 4.2), rnd(-.5, .5)], life: rnd(.5, .9), s0: .8, s1: rnd(1.6, 2.4), c0: "#ffd060", c1: "#d02000", a0: 1, a1: 0}); }
            for(let i = 0; i < 18; i++) this.p({delay: .45 + rnd(0, .5), pos: [t[0] + rnd(-1, 1), t[1] + rnd(-.5, 1), t[2]], vel: [rnd(-1, 1), rnd(1, 3), rnd(-1, 1)], g: -1, life: 1.1, s0: .9, s1: 2.2, c0: "#303030", c1: "#101010", a0: .35, a1: 0, tex: "smoke", add: false});
            break; }
        case "fire2": case "inferno": {   // 火の玉・爆発（メラ系）
            dur = 1.0;
            for(let i = 0; i < 18; i++) this.p({delay: i * .015, pos: at(i / 18 * .3), vel: [nd[0] * len * 1.3, nd[1] * len * 1.3 + 1, nd[2] * len * 1.3], life: .7, s0: .7, s1: 1.1, c0: "#ffe070", c1: "#ff4000", a1: 0.2});
            this.p({delay: .55, pos: t.slice(), life: .5, s0: .5, s1: 5, c0: "#ffffff", c1: "#ff6020", a0: 1, a1: 0}); this.p({delay: .55, pos: t.slice(), life: .6, s0: .5, s1: 6, c0: "#ffd000", c1: "#ff2000", a0: 1, a1: 0, tex: "ring"});
            for(let i = 0; i < 40; i++) this.p({delay: .55, pos: t.slice(), vel: [rnd(-5, 5), rnd(0, 6), rnd(-5, 5)], g: 6, life: rnd(.4, .9), s0: .5, s1: 0, c0: "#ffd060", c1: "#ff2000"});
            break; }
        case "ice": case "frost": {   // 氷のつぶて
            dur = 1.1;
            for(let i = 0; i < 50; i++) this.p({delay: rnd(0, .4), pos: [t[0] + rnd(-1.4, 1.4), t[1] + 4 + rnd(0, 2), t[2] + rnd(-.8, .8)], vel: [0, -rnd(9, 13), 0], life: .4, s0: .35, s1: .3, c0: "#e0faff", c1: "#60c0ff", stretch: 1.6, tex: "drop", rot: 3.14});
            for(let i = 0; i < 30; i++) this.p({delay: .35 + rnd(0, .3), pos: [t[0] + rnd(-1.2, 1.2), t[1] + rnd(-.8, 1), t[2] + .5], vel: [rnd(-3, 3), rnd(1, 4), rnd(-2, 2)], g: 4, life: .8, s0: .5, s1: 0, c0: "#ffffff", c1: "#80d0ff", tex: "star", spin: 6});
            this.p({delay: .35, pos: t.slice(), life: .6, s0: 1, s1: 5, c0: "#c0f0ff", c1: "#4090ff", tex: "ring"});
            break; }
        case "bolt": case "thunder": {   // 雷
            dur = 1.0;
            const x0 = t[0] + rnd(-.3, .3);
            for(let seg = 0; seg < 14; seg++){ const y = t[1] + 6 - seg * (6 + 1) / 14; this.p({delay: .1, pos: [x0 + Math.sin(seg * 2.3) * .5, y, t[2]], life: .35, s0: 1.3, s1: .9, c0: "#ffffff", c1: "#ffe040", tex: "glow", stretch: 0, a0: 1, a1: 0}); this.p({delay: .1, pos: [x0 + Math.sin(seg * 2.3) * .5, y, t[2] + .05], life: .35, s0: .45, s1: .3, c0: "#ffffff", c1: "#ffffa0", tex: "star", a0: 1}); }
            for(let i = 0; i < 30; i++) this.p({delay: .12, pos: t.slice(), vel: [rnd(-6, 6), rnd(-1, 6), rnd(-3, 3)], g: 8, life: rnd(.2, .5), s0: .4, s1: 0, c0: "#ffffa0", c1: "#80a0ff", tex: "star", spin: 12});
            this.p({delay: .1, pos: [t[0], t[1] + 1, t[2]], life: .4, s0: 6, s1: 8, c0: "#ffffff", c1: "#a0c0ff", a0: .8});
            break; }
        case "wind": case "slash2": {   // かまいたち・つむじ風
            dur = .9;
            for(let i = 0; i < 4; i++) this.p({delay: i * .1, pos: [t[0] + rnd(-.8, .8), t[1] + rnd(-.6, .8), t[2] + .3], vel: [rnd(4, 7) * (i % 2 ? -1 : 1), 0, 0], life: .35, s0: 2.6, s1: 3.2, c0: "#e0ffe8", c1: "#60d0a0", tex: "slash", rot: rnd(-.7, .7), a0: 1, a1: 0});
            for(let i = 0; i < 22; i++){ const a = rnd(0, 6.283); this.p({delay: rnd(0, .4), pos: [t[0] + Math.cos(a) * 1.2, t[1] - .8 + rnd(0, 2), t[2] + Math.sin(a) * 1.2], vel: [-Math.sin(a) * 5, 1.5, Math.cos(a) * 5], life: .6, s0: .4, s1: .1, c0: "#d0ffe0", c1: "#60c090", tex: "petal", spin: 8}); }
            break; }
        case "water": case "wave": {   // 水しぶき
            dur = 1.1;
            for(let i = 0; i < 70; i++) this.p({delay: rnd(0, .45), pos: [t[0] + rnd(-1.5, 1.5), t[1] + 3.5 + rnd(0, 2), t[2] + rnd(-.8, .8)], vel: [rnd(-1, 1), -rnd(6, 10), 0], g: 4, life: .5, s0: .45, s1: .35, c0: "#c0e8ff", c1: "#2070ff", tex: "drop", stretch: 1, rot: 3.14, add: false});
            for(let i = 0; i < 26; i++) this.p({delay: .35 + rnd(0, .3), pos: [t[0] + rnd(-1.2, 1.2), t[1] - .6, t[2]], vel: [rnd(-3, 3), rnd(2, 5), rnd(-1, 1)], g: 9, life: .8, s0: .5, s1: .1, c0: "#ffffff", c1: "#60a8ff", tex: "drop"});
            break; }
        case "dark": case "curse": {   // 闇・呪い
            dur = 1.2;
            for(let i = 0; i < 45; i++){ const a = rnd(0, 6.283), r = rnd(1, 2.4); this.p({delay: rnd(0, .5), pos: [t[0] + Math.cos(a) * r, t[1] + rnd(-.8, 1.4), t[2] + Math.sin(a) * r * .5], vel: [-Math.cos(a) * 2.6, rnd(-.2, 1), -Math.sin(a) * 1.3], life: .7, s0: .9, s1: .2, c0: "#a050ff", c1: "#200030", add: false, a0: .8, tex: "smoke"}); this.p({delay: rnd(.2, .6), pos: [t[0] + rnd(-1, 1), t[1] + rnd(-.5, 1.2), t[2] + .4], life: .5, s0: .3, s1: 0, c0: "#ff80ff", c1: "#8030c0", tex: "star", spin: 5}); }
            break; }
        case "heal": case "holy": {   // 回復：きらめきが上る
            dur = 1.2;
            for(let i = 0; i < 46; i++){ const a = rnd(0, 6.283), r = rnd(.2, 1.3); this.p({delay: rnd(0, .7), pos: [t[0] + Math.cos(a) * r, t[1] - .8, t[2] + Math.sin(a) * r], vel: [0, rnd(1.2, 3), 0], life: rnd(.7, 1.1), s0: rnd(.25, .5), s1: 0, c0: "#fffff0", c1: "#60ff90", tex: i % 3 ? "glow" : "star", spin: 3}); }
            this.p({pos: [t[0], t[1] - .7, t[2]], life: .8, s0: .5, s1: 3.2, c0: "#c0ffd0", c1: "#40ff80", tex: "ring", a0: .9});
            break; }
        case "buff": {   // 強化：輪が上昇
            dur = 1.0;
            for(let i = 0; i < 3; i++) this.p({delay: i * .22, pos: [t[0], t[1] - .9 + i * .1, t[2]], vel: [0, 2.8, 0], life: .7, s0: 2.4, s1: 2.4, c0: "#ffe880", c1: "#ff9020", tex: "ring", a0: 1});
            for(let i = 0; i < 20; i++) this.p({delay: rnd(0, .5), pos: [t[0] + rnd(-1, 1), t[1] - .6, t[2] + rnd(-.6, .6)], vel: [0, rnd(2, 4), 0], life: .7, s0: .3, s1: 0, c0: "#ffffff", c1: "#ffc040", tex: "star", spin: 4});
            break; }
        case "debuff": {   // 弱体：輪が降りる
            dur = 1.0;
            for(let i = 0; i < 3; i++) this.p({delay: i * .22, pos: [t[0], t[1] + 1.8 - i * .1, t[2]], vel: [0, -2.8, 0], life: .7, s0: 2.4, s1: 2.4, c0: "#c0a0ff", c1: "#4020a0", tex: "ring"});
            for(let i = 0; i < 18; i++) this.p({delay: rnd(0, .5), pos: [t[0] + rnd(-1, 1), t[1] + 1.5, t[2] + rnd(-.6, .6)], vel: [0, -rnd(2, 4), 0], life: .7, s0: .3, s1: 0, c0: "#e0c0ff", c1: "#6040c0", tex: "star", spin: -4});
            break; }
        case "slash": case "hit": {   // 斬撃
            dur = .55;
            this.p({delay: .02, pos: [t[0], t[1], t[2] + .6], life: .22, s0: 2.8, s1: 3.6, c0: "#ffffff", c1: "#ffe8a0", tex: "slash", rot: -.7, a0: 1}); this.p({delay: .1, pos: [t[0], t[1], t[2] + .6], life: .2, s0: 2.4, s1: 3.2, c0: "#ffffff", c1: "#a0d0ff", tex: "slash", rot: .6});
            burst([t[0], t[1], t[2] + .5], 12, "#ffffff", "#ffd060", 4, .35, .4, "star");
            break; }
        case "crit": {
            dur = .8;
            this.p({pos: [t[0], t[1], t[2] + .6], life: .35, s0: 1, s1: 7, c0: "#ffffff", c1: "#ffd000", tex: "star", rot: .3}); this.p({delay: .04, pos: [t[0], t[1], t[2] + .6], life: .3, s0: 3.2, s1: 4.6, c0: "#ffffff", c1: "#ff6040", tex: "slash", rot: -.5});
            burst([t[0], t[1], t[2] + .5], 24, "#ffffff", "#ff8030", 7, .45, .6, "star");
            break; }
        case "bite": {   // かみつき
            dur = .6;
            for(let k = -2; k <= 2; k++){ this.p({delay: .05, pos: [t[0] + k * .22, t[1] + .6, t[2] + .6], vel: [0, -4, 0], life: .25, s0: .3, s1: .2, c0: "#ffffff", c1: "#ffd0d0", tex: "drop", stretch: 1.5, rot: 3.14}); this.p({delay: .05, pos: [t[0] + k * .22, t[1] - .6, t[2] + .6], vel: [0, 4, 0], life: .25, s0: .3, s1: .2, c0: "#ffffff", c1: "#ffd0d0", tex: "drop", stretch: 1.5}); }
            burst([t[0], t[1], t[2] + .6], 10, "#ffb0b0", "#ff4040", 3, .3, .4);
            break; }
        case "beam": case "laser": {   // 光線
            dur = 1.0;
            for(let i = 0; i < 24; i++) this.p({delay: i * .015, pos: at(i / 24), life: .45, s0: 1.2, s1: .6, c0: "#ffffff", c1: "#40d0ff", a0: 1});
            this.p({delay: .35, pos: t.slice(), life: .5, s0: .5, s1: 4.4, c0: "#ffffff", c1: "#40a0ff"}); burst(t, 16, "#ffffff", "#60c0ff", 5, .4, .5, "star");
            break; }
        case "petal": {   // 花びら（ねむり・誘惑）
            dur = 1.2;
            for(let i = 0; i < 40; i++) this.p({delay: rnd(0, .6), pos: [t[0] + rnd(-1.6, 1.6), t[1] + rnd(1, 3), t[2] + rnd(-.6, .6)], vel: [rnd(-1, 1), -rnd(.8, 2), 0], life: 1, s0: .5, s1: .35, c0: "#ffd0e8", c1: "#ff70b0", tex: "petal", spin: rnd(-6, 6), add: false});
            break; }
        case "sleep": {
            dur = 1.0;
            for(let i = 0; i < 12; i++) this.p({delay: i * .08, pos: [t[0] + rnd(-.5, .5), t[1] + 1 + i * .06, t[2] + .5], vel: [rnd(-.2, .6), 1.4, 0], life: 1, s0: .5, s1: .9, c0: "#e0e8ff", c1: "#8090ff", tex: "ring", a0: .8});
            break; }
        case "quake": {   // 地震・衝撃
            dur = 1.0;
            for(let i = 0; i < 40; i++) this.p({delay: rnd(0, .3), pos: [t[0] + rnd(-4, 4), t[1] - 1, t[2] + rnd(-1.2, 1.2)], vel: [rnd(-1, 1), rnd(3, 7), 0], g: 12, life: .8, s0: .6, s1: .1, c0: "#d0b080", c1: "#604020", add: false, a0: .9, tex: "smoke"});
            this.p({pos: [t[0], t[1] - 1, t[2]], life: .6, s0: 1, s1: 10, c0: "#ffe0a0", c1: "#a06020", tex: "ring"});
            break; }
        case "death": {   // 倒れる：光の粒に
            dur = .9;
            for(let i = 0; i < 36; i++) this.p({delay: rnd(0, .3), pos: [t[0] + rnd(-.9, .9), t[1] + rnd(-.8, 1), t[2] + rnd(-.5, .5)], vel: [rnd(-.5, .5), rnd(1, 3), 0], life: rnd(.5, .9), s0: .45, s1: 0, c0: "#ffffff", c1: "#a0c0ff", tex: i % 2 ? "glow" : "star", spin: 4});
            break; }
        case "revive": {
            dur = 1.2;
            for(let i = 0; i < 4; i++) this.p({delay: i * .18, pos: [t[0], t[1] + 2.5 - i * .3, t[2]], vel: [0, -1.2, 0], life: .8, s0: 1.8, s1: 2.6, c0: "#ffffff", c1: "#ffe070", tex: "ring"});
            for(let i = 0; i < 40; i++) this.p({delay: rnd(0, .6), pos: [t[0] + rnd(-.9, .9), t[1] + 3, t[2] + rnd(-.5, .5)], vel: [0, -rnd(1, 3), 0], life: .9, s0: .4, s1: 0, c0: "#ffffff", c1: "#ffd060", tex: "star", spin: 3});
            break; }
        case "blast": {   // 大爆発
            dur = 1.2;
            this.p({pos: t.slice(), life: .5, s0: 1, s1: 9, c0: "#ffffff", c1: "#ff8020"}); this.p({delay: .05, pos: t.slice(), life: .8, s0: 1, s1: 12, c0: "#ffd060", c1: "#ff2000", tex: "ring"});
            burst(t, 50, "#fff0a0", "#ff3000", 9, .7, .9);
            for(let i = 0; i < 16; i++) this.p({delay: .1, pos: [t[0] + rnd(-1, 1), t[1], t[2]], vel: [rnd(-2, 2), rnd(1, 3), rnd(-1, 1)], life: 1.3, s0: 1.2, s1: 3, c0: "#505050", c1: "#101010", a0: .4, tex: "smoke", add: false});
            break; }
        case "wave2": {   // 全体：画面ぜんたいに衝撃
            dur = 1.0;
            for(let i = 0; i < 5; i++) this.p({delay: i * .1, pos: [0, 1.2, 0], life: .8, s0: 1, s1: 16, c0: "#ffffff", c1: "#ffa060", tex: "ring"});
            break; }
        default: dur = .5; burst(t, 14, "#ffffff", "#a0c0ff", 4, .4, .5, "star");
        }
        return op.dur !== undefined ? op.dur : dur;
    }
}
