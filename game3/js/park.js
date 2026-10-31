"use strict";
// ===== サブストーリー：ドリーム・フロンティア（一人称・3Dテーマパーク）=====
//  game2 の 自作WebGL2 だけで うごく（外部ライブラリ なし）。町の「パークの ゲート」から 入る。
//  5エリア：セントラル・ガーデン / ファンタジー・グローブ / スカイ・コースト / ミステリー・マナー / ブルー・ラグーン
import {Geo, M4, canvasTex} from "./gl.js";
import {getTex} from "./world.js";
import {charMeshes, drawChar} from "./chars.js";

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
const $ = (id) => document.getElementById(id);
const ZONES = {
    center: {env: {fogC: [.75, .88, 1], fogNear: 46, fogFar: 125, amb: [.56, .6, .72], light: [.4, .8, .45]}, bgm: "town"},
    grove: {env: {fogC: [.36, .3, .62], fogNear: 14, fogFar: 62, amb: [.42, .44, .66], light: [.3, .8, .3]}, bgm: "cave"},
    sky: {env: {fogC: [.62, .84, 1], fogNear: 60, fogFar: 150, amb: [.6, .64, .76], light: [.5, .8, .3]}, bgm: "field"},
    manor: {env: {fogC: [.14, .1, .22], fogNear: 7, fogFar: 42, amb: [.34, .3, .42], light: [.2, .7, .2]}, bgm: "demoncastle"},
    lagoon: {env: {fogC: [.5, .85, .9], fogNear: 36, fogFar: 110, amb: [.58, .64, .74], light: [.4, .8, .5]}, bgm: "sea"}
};
const EYE = 1.62;
// コースターの コース（x, z, たかさ）
const TRACK = [[0, -50, 1.2], [14, -52, 1.2], [28, -60, 9], [34, -76, 18], [26, -92, 6], [8, -96, 2.5], [-10, -90, 10], [-26, -80, 15], [-30, -66, 5], [-18, -54, 1.8], [-6, -50, 1.2]];
const CR = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return p1.map((_, i) => .5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)); };
function buildTrack(){
    const pts = [], N = TRACK.length, per = 22;
    for(let i = 0; i < N; i++) for(let k = 0; k < per; k++) pts.push(CR(TRACK[(i + N - 1) % N], TRACK[i], TRACK[(i + 1) % N], TRACK[(i + 2) % N], k / per));
    const len = [0]; for(let i = 1; i <= pts.length; i++){ const a = pts[i - 1], b = pts[i % pts.length]; len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
    return {pts, len, total: len[len.length - 1]};
}

export class Park{
    constructor(ctx){ this.c = ctx; this.built = false; this.t = 0; this.zone = "center"; this.env = null; this.look = {yaw: Math.PI, pitch: -.04}; this.p = {x: 14, z: 14}; this.busy = false; this.ride = null; this.npcs = []; this.dyn = []; this.track = buildTrack(); this.done = null; this.lock = false; }
    get S(){ const S = this.c.S; if(!S.park) S.park = {q: 0, got: {}, rides: {}, code: false, end: false}; return S.park; }
    // ---------- 立体を くみたてる ----------
    build(){
        const R = this.c.R, B = this.B = {parts: [], free: [], col: [], circ: [], gates: {}};
        const add = (g, opt) => { if(!g.n) return null; const m = R.mesh(g); B.free.push(m); const p = {mesh: m, opt: opt || {}}; B.parts.push(p); return p; };
        const rect = (x0, z0, x1, z1) => { const r = [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]; B.col.push(r); return r; };
        const box = (g, cx, cz, w, d, h, col, y) => g.box(w, h, d, col, M4.T(cx, y || 0, cz));
        const solid = new Geo(), grass = new Geo(), cob = new Geo(), wood = new Geo(), water = new Geo(), tile = new Geo();
        this.tex = {glow: R.tex(canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.3, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); })),
            grass: getTex(R, "grass"), cobble: getTex(R, "cobble"), wood: getTex(R, "wood"), water: getTex(R, "water"), tile: getTex(R, "tile"), dirt: getTex(R, "dirt"),
            beam: R.tex(canvasTex(32, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); }))};
        // 地面
        grass.plane(300, 300, [1, 1, 1], M4.T(0, 0, 0), 60, 60);
        const patch = (cx, cz, w, d, col) => grass.plane(w, d, col, M4.T(cx, .015, cz), w / 5, d / 5);
        patch(-66, 0, 70, 70, [.62, .5, .95]); patch(0, -66, 70, 70, [.85, .95, 1.05]); patch(66, 0, 70, 70, [.5, .45, .62]); patch(0, 68, 70, 70, [.75, 1, .95]);
        // 道（十字）と ひろば
        const path = (x0, z0, x1, z1) => cob.plane(x1 - x0, z1 - z0, [1, 1, 1], M4.T((x0 + x1) / 2, .03, (z0 + z1) / 2), (x1 - x0) / 2.5, (z1 - z0) / 2.5);
        path(-98, -3, 98, 3); path(-3, -98, 3, 98);
        solid.cyl(15, 15, .06, 32, "#e8dcb6", M4.T(0, .02, 0), true); solid.cyl(11, 11, .09, 32, "#d9c590", M4.T(0, .03, 0), true); solid.cyl(8, 8, .12, 32, "#e8dcb6", M4.T(0, .04, 0), true);
        // ふんすい
        solid.cyl(4.2, 4.4, .9, 20, "#b8c4d4", M4.T(0, 0, 0), true); solid.cyl(3.6, 3.6, .1, 20, "#6cc0f0", M4.T(0, .82, 0), true); solid.cyl(.6, .9, 2.4, 10, "#c8d2e0", M4.T(0, 0, 0), true); solid.cyl(1.7, 1.1, .45, 12, "#c8d2e0", M4.T(0, 2.2, 0), true);
        B.circ.push([0, 0, 4.5]);
        // 花だん・街灯・ベンチ（ひろば）
        for(let i = 0; i < 12; i++){ const a = i / 12 * 6.283 + .26, r = 12.5; const x = Math.cos(a) * r, z = Math.sin(a) * r; if(Math.abs(x) < 4.5 || Math.abs(z) < 4.5) continue;
            solid.cyl(1.5, 1.7, .4, 8, "#9a7a5a", M4.T(x, 0, z), true); for(let k = 0; k < 7; k++){ const aa = k * .9, rr = k ? .8 : 0; solid.sphere(.28, 5, 3, ["#ff7aa8", "#ffd24a", "#ff9a5a", "#c88aff", "#ffffff"][(i + k) % 5], M4.T(x + Math.cos(aa) * rr, .6, z + Math.sin(aa) * rr)); } B.circ.push([x, z, 1.6]); }
        const lamp = (x, z) => { solid.cyl(.07, .1, 3.2, 6, "#2a2a3a", M4.T(x, 0, z), true); solid.sphere(.28, 6, 4, "#fff2b0", M4.T(x, 3.3, z)); B.circ.push([x, z, .3]); this.glows.push([x, 3.3, z, [1, .9, .5], 1.6]); };
        this.glows = [];
        for(let i = -8; i <= 8; i += 4){ if(i === 0) continue; lamp(i * 11 / 8 * 1.0 + (i < 0 ? -1 : 1) * 5, 4.4); lamp(i * 11 / 8 * 1.0 + (i < 0 ? -1 : 1) * 5, -4.4); lamp(4.4, i * 11 / 8 + (i < 0 ? -1 : 1) * 5); lamp(-4.4, i * 11 / 8 + (i < 0 ? -1 : 1) * 5); }
        const bench = (x, z, rot) => { const m = (g, a, b, c, d, e, f) => g.box(a, b, c, d, M4.mul(M4.T(x, e, z), M4.RY(rot))); wood.box(2, .12, .6, [1, 1, 1], M4.mul(M4.T(x, .5, z), M4.RY(rot))); wood.box(2, .5, .1, [1, 1, 1], M4.mul(M4.T(x, .6, z), M4.mul(M4.RY(rot), M4.T(0, 0, -.3)))); B.circ.push([x, z, 1]); };
        bench(-9, 9, 0); bench(9, -9, Math.PI); bench(-9, -9, 0); bench(10, 9, 0);
        // ゲート（出口）
        this.exit = {x: 16, z: 16}; solid.cyl(.4, .4, 4, 8, "#a04030", M4.T(15, 0, 16), true); solid.cyl(.4, .4, 4, 8, "#a04030", M4.T(17, 0, 16), true); solid.box(3.2, .5, .5, "#e8c050", M4.T(16, 4, 16)); B.circ.push([15, 16, .5], [17, 16, .5]);
        // エリアの ゲート（まほうの かべ）
        const gate = (id, ax, cx, cz, along) => {
            const w = 3.3; const px = along === "z" ? [[cx, cz - w], [cx, cz + w]] : [[cx - w, cz], [cx + w, cz]];
            for(const p of px){ solid.cyl(.4, .5, 4.4, 8, "#eee4cc", M4.T(p[0], 0, p[1]), true); solid.sphere(.55, 6, 4, "#ffd24a", M4.T(p[0], 4.7, p[1])); B.circ.push([p[0], p[1], .55]); }
            solid.box(along === "z" ? .6 : w * 2, .6, along === "z" ? w * 2 : .6, "#eee4cc", M4.T(cx, 4.2, cz));
            const r = rect(along === "z" ? cx - .3 : cx - w, along === "z" ? cz - w : cz - .3, along === "z" ? cx + .3 : cx + w, along === "z" ? cz + w : cz + .3);
            const wg = new Geo(); wg.box(along === "z" ? .12 : w * 2, 4.2, along === "z" ? w * 2 : .12, [.7, .6, 1], M4.T(cx, 0, cz), {top: 1}); const part = add(wg, {blend: true, tint: [1, 1, 1, .45], add: true});
            B.gates[id] = {rect: r, part, x: cx, z: cz};
        };
        gate("grove", "x", -26, 0, "z"); gate("sky", "z", 0, -26, "x"); gate("manor", "x", 26, 0, "z"); gate("lagoon", "z", 0, 26, "x");
        // かざりの木（エリアごとに ちがう）
        const keepOut = (x, z) => Math.abs(x) < 6 && true ? Math.abs(x) < 6 : false;
        const clear = (x, z) => { if(Math.abs(x) < 6.5 || Math.abs(z) < 6.5) return false; if(Math.hypot(x, z) < 22) return false; if(Math.abs(x) > 96 || Math.abs(z) > 96) return false;
            if(x > 58 && x < 98 && Math.abs(z) < 15) return false; if(z > 56 && Math.abs(x) < 30 && z < 98) return false; if(z < -34 && Math.abs(x) < 42) return false; return true; };
        for(let i = 0; i < 260; i++){ const x = (hash(i, 1) - .5) * 192, z = (hash(i, 2) - .5) * 192; if(!clear(x, z)) continue; const s = .8 + hash(i, 3) * .9;
            const zone = x < -30 && Math.abs(z) < 50 ? "g" : x > 30 && Math.abs(z) < 50 ? "m" : z < -30 ? "s" : z > 30 ? "l" : "c";
            if(zone === "g"){ solid.cyl(.22 * s, .3 * s, 2.4 * s, 6, "#5a3a6a", M4.T(x, 0, z), true); solid.sphere(1.5 * s, 7, 5, ["#7a5ae0", "#5a8ae8", "#c07ae8"][i % 3], M4.T(x, 3.1 * s, z)); this.glows.push([x, 3.2 * s, z, [.6, .6, 1], 1.1]); }
            else if(zone === "m"){ solid.cyl(.12 * s, .35 * s, 4 * s, 5, "#2a2230", M4.T(x, 0, z), true); solid.cyl(0, .9 * s, 2.2 * s, 5, "#1f2a2a", M4.T(x, 2.6 * s, z), true); }
            else if(zone === "s"){ solid.cyl(.2 * s, .28 * s, 1.6 * s, 6, "#8a5a30", M4.T(x, 0, z), true); solid.sphere(1.3 * s, 7, 5, "#6cc84a", M4.T(x, 2.2 * s, z)); }
            else if(zone === "l"){ solid.cyl(.12 * s, .2 * s, 3 * s, 5, "#9a7a50", M4.T(x, 0, z), true); for(let k = 0; k < 4; k++){ const a = k * 1.57 + i; solid.box(.22, .06, 1.7 * s, "#3aa860", M4.mul(M4.T(x, 3 * s, z), M4.mul(M4.RY(a), M4.mul(M4.RX(.7), M4.T(0, 0, .8 * s))))); } }
            else { solid.cyl(.22 * s, .3 * s, 2 * s, 6, "#7a5230", M4.T(x, 0, z), true); solid.sphere(1.5 * s, 7, 5, ["#58b84a", "#6cc84a", "#4aa84a"][i % 3], M4.T(x, 2.7 * s, z)); }
            B.circ.push([x, z, .5 * s]); }
        // ---- ファンタジー・グローブ ----
        this.crystals = [[-46, -16], [-56, 15], [-71, -21], [-85, 8], [-66, 25]].map((p, i) => ({x: p[0], z: p[1], col: [[.4, .9, 1], [1, .5, .9], [1, .9, .4], [.6, 1, .6], [.8, .6, 1]][i], got: false}));
        for(const c of this.crystals){ solid.cyl(1.2, 1.5, .5, 7, "#4a4a6a", M4.T(c.x, 0, c.z), true); }
        for(let i = 0; i < 18; i++){ const x = -40 - hash(i, 11) * 55, z = (hash(i, 12) - .5) * 80; if(Math.abs(z) < 5) continue; const s = .6 + hash(i, 13);
            solid.cyl(.15 * s, .2 * s, 1.2 * s, 6, "#e8e0f8", M4.T(x, 0, z), true); solid.sphere(.8 * s, 7, 4, ["#ff7aa8", "#7ae0ff", "#ffe07a"][i % 3], M4.mul(M4.T(x, 1.3 * s, z), M4.S(1, .55, 1))); this.glows.push([x, 1.4 * s, z, [1, .7, .9], .9]); B.circ.push([x, z, .5 * s]); }
        for(let i = 0; i < 30; i++){ const x = -35 - hash(i, 21) * 62, z = (hash(i, 22) - .5) * 90; if(Math.abs(z) < 4.5) continue; const s = .3 + hash(i, 23) * .4; solid.cyl(0, .25 * s * 2, 1.4 * s * 2, 5, ["#58e0c0", "#7ab0ff", "#e090ff"][i % 3], M4.T(x, 0, z), true); this.glows.push([x, .8 * s * 2, z, [.5, 1, .9], .6]); }
        // 光の番人 の ほこら
        solid.cyl(2, 2.4, .6, 8, "#6a5a9a", M4.T(-34, 0, -6), true); solid.cyl(0, 1.3, 3.4, 8, "#9a8aea", M4.T(-34, .6, -6), true); B.circ.push([-34, -6, 2.4]);
        // ---- スカイ・コースト ----
        box(solid, 0, -43, 14, 8, 4, "#f2e8d0"); solid.cyl(0, 1, 2.2, 4, "#e05a4a", M4.mul(M4.T(0, 4, -43), M4.mul(M4.RY(Math.PI / 4), M4.S(10.6, 1, 6.2)))); rect(-7, -47, 7, -39);
        solid.box(5, .3, 1.6, "#ffd24a", M4.T(0, 3.2, -38.9)); for(let i = -2; i <= 2; i++){ solid.box(.12, 1, 1, "#ffffff", M4.T(i * 1.6, 0, -35)); }
        box(solid, 12, -40, 4, 3, 2.6, "#fff0d8"); solid.cyl(0, 1, 1.2, 4, "#4a90e0", M4.mul(M4.T(12, 2.6, -40), M4.mul(M4.RY(Math.PI / 4), M4.S(3.4, 1, 2.6)))); rect(10, -41.5, 14, -38.5);
        const T = this.track, step = 2; B.trackPts = [];
        for(let i = 0; i < T.pts.length; i += step){ const a = T.pts[i], b = T.pts[(i + step) % T.pts.length]; const dx = b[0] - a[0], dy = b[2] - a[2], dz = b[1] - a[1], l = Math.hypot(dx, dy, dz); const yaw = Math.atan2(dx, dz), pit = Math.atan2(dy, Math.hypot(dx, dz));
            const m = M4.mul(M4.T((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, (a[1] + b[1]) / 2), M4.mul(M4.RY(yaw), M4.RX(-pit)));
            solid.box(.18, .14, l + .05, "#ff6a4a", M4.mul(m, M4.T(-.55, -.07, 0))); solid.box(.18, .14, l + .05, "#ff6a4a", M4.mul(m, M4.T(.55, -.07, 0))); solid.box(.5, .12, l + .05, "#6a6a80", M4.mul(m, M4.T(0, -.4, 0)));
            if((i / step) % 4 === 0){ solid.box(1.4, .08, .18, "#5a4a3a", M4.mul(m, M4.T(0, -.2, 0))); if(a[2] > 2.2){ const h = a[2] - .45; solid.cyl(.18, .24, h, 6, "#c8d0dc", M4.T(a[0], 0, a[1]), true); } } }
        // ---- ミステリー・マナー（歩ける やかた）----
        const MX0 = 62, MX1 = 94, MZ0 = -12, MZ1 = 12, WH = 4.2, WT = .8;
        const wall = (x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.abs(x1 - x0), d = Math.abs(z1 - z0); wood.box(w, WH, d, [.62, .5, .55], M4.T(cx, 0, cz)); rect(x0, z0, x1, z1); };
        wall(MX0, MZ0, MX1, MZ0 + WT); wall(MX0, MZ1 - WT, MX1, MZ1); wall(MX1 - WT, MZ0, MX1, MZ1); wall(MX0, MZ0, MX0 + WT, -1.8); wall(MX0, 1.8, MX0 + WT, MZ1);
        wall(76, MZ0, 76.6, -8); wall(76, -5, 76.6, 5); wall(76, 8, 76.6, MZ1); wall(76.6, -.3, MX1, .3);
        tile.plane(MX1 - MX0, MZ1 - MZ0, [.55, .45, .6], M4.T((MX0 + MX1) / 2, .05, 0), 8, 3); tile.plane(MX1 - MX0, MZ1 - MZ0, [.5, .45, .6], M4.mul(M4.T((MX0 + MX1) / 2, WH, 0), M4.RX(Math.PI)), 8, 3);
        solid.cyl(0, 1, 3.4, 4, "#3a2a46", M4.mul(M4.T((MX0 + MX1) / 2, WH, 0), M4.mul(M4.RY(Math.PI / 4), M4.S(34, 1, 18))));
        // へやの かざり
        solid.box(.9, 2.6, 5, "#6a3a22", M4.T(93, 0, -6)); for(let k = 0; k < 7; k++) solid.box(.5, 2.2, .3, ["#4a7ae0", "#4a7ae0", "#e04a4a"][k % 3], M4.T(92.4, .2, -8 + k * .7)); B.circ.push([92.5, -6, 1.2]);   // ほんだな
        solid.box(.2, 2.2, 3.2, "#c8a050", M4.T(93.6, .9, 6)); solid.box(.1, 1.8, 2.8, "#d8e0f0", M4.T(93.5, 1.1, 6)); solid.sphere(.3, 6, 4, "#2a2a3a", M4.T(93.4, 1.8, 5.3)); solid.sphere(.3, 6, 4, "#2a2a3a", M4.T(93.4, 1.4, 6.6));   // え
        solid.box(.5, 2.6, .9, "#4a3020", M4.T(70, .6, MZ1 - 1.2)); solid.cyl(.5, .5, .2, 12, "#fff0c8", M4.mul(M4.T(70, 2.4, MZ1 - 1.5), M4.RX(Math.PI / 2)), true); solid.box(.06, .5, .06, "#222", M4.T(70, 2.4, MZ1 - 1.62)); // とけい
        solid.box(1.4, 1.2, 1.2, "#3a3a46", M4.T(66, 0, -9.6)); solid.cyl(.3, .3, .1, 8, "#e8c050", M4.mul(M4.T(66, .8, -8.95), M4.RX(Math.PI / 2)), true); B.col.push([65.3, -10.2, 66.7, -9]);   // きんこ
        solid.box(2.4, .6, 2.4, "#6a2a3a", M4.T(70, 0, 0)); solid.box(2.4, .1, 2.4, "#c8a050", M4.T(70, .6, 0)); B.col.push([68.8, -1.2, 71.2, 1.2]);
        for(const [x, z] of [[64, -6], [64, 6], [86, -10], [86, 10], [86, -2], [86, 2], [72, 0]]) this.glows.push([x, 2.2, z, [1, .75, .4], 1.4]);
        // マナーの もん・フェンス
        for(let z = -30; z <= 30; z += 3){ if(Math.abs(z) < 4) continue; solid.cyl(.06, .08, 1.8, 5, "#222", M4.T(52, 0, z), true); } rect(51.9, -30, 52.1, -3.5); rect(51.9, 3.5, 52.1, 30);
        // ---- ブルー・ラグーン ----
        const PX0 = -24, PX1 = 24, PZ0 = 66, PZ1 = 92;
        water.plane(PX1 - PX0, PZ1 - PZ0, [1, 1, 1], M4.T(0, .1, (PZ0 + PZ1) / 2), 12, 8); rect(PX0, PZ0, PX1, PZ1);
        for(let i = 0; i < 24; i++){ const a = i / 24 * 6.283, rx = 25.5, rz = 14; solid.sphere(.9 + hash(i, 31) * .7, 6, 4, "#8a8a98", M4.T(Math.cos(a) * rx, .2, 79 + Math.sin(a) * rz)); }
        solid.box(10, 7, 3, "#7a7a88", M4.T(0, 0, 95)); water.plane(5, 7, [1, 1, 1], M4.mul(M4.T(0, 3.6, 93.2), M4.mul(M4.RX(Math.PI / 2), M4.S(1, 1, 1))), 2, 4);
        this.fall = {x: 0, z: 93.3};
        wood.box(6, .3, 8, [1, 1, 1], M4.T(0, .0, 62)); wood.box(.3, 1, 8, [1, 1, 1], M4.T(-3, 0, 62)); wood.box(.3, 1, 8, [1, 1, 1], M4.T(3, 0, 62)); rect(-3.2, 58, -2.8, 66); rect(2.8, 58, 3.2, 66);
        box(solid, -12, 60, 5, 4, 3, "#e8f2f8"); solid.cyl(0, 1, 1.8, 4, "#2a9ac8", M4.mul(M4.T(-12, 3, 60), M4.mul(M4.RY(Math.PI / 4), M4.S(4.4, 1, 3.6)))); rect(-14.5, 58, -9.5, 62);
        this.lanterns = [[-27, 72], [27, 82], [0, 97]].map((p) => ({x: p[0], z: p[1], got: false}));
        for(const l of this.lanterns){ solid.cyl(.12, .16, 2.2, 6, "#6a5a4a", M4.T(l.x, 0, l.z), true); }
        for(let i = 0; i < 30; i++){ const a = hash(i, 41) * 6.283, r = 6 + hash(i, 42) * 8; solid.sphere(.3, 6, 4, "#ffd0e8", M4.mul(M4.T(Math.cos(a) * r * 1.5, .22, 79 + Math.sin(a) * r), M4.S(1.5, .25, 1.5))); }
        // せかいの はし（かべ）
        rect(-99, -99, 99, -98.6); rect(-99, 98.6, 99, 99); rect(-99, -99, -98.6, 99); rect(98.6, -99, 99, 99);
        // メッシュ化
        add(grass, {tex: this.tex.grass, mode: 1}); add(cob, {tex: this.tex.cobble, mode: 1}); add(tile, {tex: this.tex.tile, mode: 1}); add(wood, {tex: this.tex.wood, mode: 1}); add(solid, {mode: 0});
        this.waterPart = add(water, {tex: this.tex.water, mode: 1, tint: [1, 1, 1, .85], blend: true});
        // かがやき用スプライト
        const sg = new Geo(); sg.sprite(1, 1, [1, 1, 1], M4.id()); this.spr = R.mesh(sg); B.free.push(this.spr);
        // こうせん（ひかりの柱）
        const bg = new Geo(); bg.sprite(1, 1, [1, 1, 1], M4.id()); this.beam = R.mesh(bg); B.free.push(this.beam);
        // しょうてん用 かわり石（水晶／ランタン）
        const cg = new Geo(); cg.cyl(0, .5, .9, 6, [1, 1, 1], M4.T(0, .9, 0), true); cg.cyl(0, .5, .9, 6, [.85, .85, .85], M4.mul(M4.T(0, .9, 0), M4.RX(Math.PI)), true); this.cryM = R.mesh(cg); B.free.push(this.cryM);
        const lg = new Geo(); lg.box(.5, .7, .5, [1, .85, .5], M4.T(0, 0, 0)); lg.cyl(0, .4, .3, 4, [.8, .3, .2], M4.T(0, .7, 0), true); this.lanM = R.mesh(lg); B.free.push(this.lanM);
        const bt = new Geo(); bt.box(1.6, .5, 3.2, "#c85a3a", M4.T(0, .1, 0)); bt.box(1.2, .2, 2.6, "#e8d0a0", M4.T(0, .5, 0)); bt.cyl(.05, .05, 3, 5, "#6a4a2a", M4.T(0, .5, .2), true); bt.box(.05, 2.4, 1.6, "#f8f8ff", M4.T(0, .9, .9)); this.boatM = R.mesh(bt); B.free.push(this.boatM);
        // ARE もじ
        this.areTex = R.tex(canvasTex(256, 96, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = "bold 80px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = "#ffe9a0"; x.shadowBlur = 24; x.fillStyle = "#ffffff"; x.fillText("A R E", w / 2, h / 2 + 4); }));
        // ナビ と ひとびと
        const mk = (id, name, x, z, yaw, look, key) => this.npcs.push({id, name, x, z, yaw, P: charMeshes(R, look), t: Math.random() * 9, key});
        mk("navi", "ナビ", 0, 8, Math.PI, {shirt: "#ffffff", hair: "#7ae0ff", style: "bun", accent: "#ff7aa8"});
        mk("keeper", "ひかりの番人", -34, -3.5, Math.PI / 2 * 3, {shirt: "#c8b0ff", hair: "#eeeeff", style: "long", accent: "#8a6af0", cape: "#6a4ac0"});
        mk("staff", "コースターの スタッフ", 4, -36, 0, {shirt: "#e05a4a", hair: "#3a2a20", style: "cap", accent: "#ffd24a"});
        mk("butler", "しつじ", 64.4, 0, Math.PI / 2, {shirt: "#222233", hair: "#cccccc", style: "short", accent: "#aa2a2a"});
        mk("sailor", "ボートの おじさん", -8, 57, Math.PI, {shirt: "#2a8ac8", hair: "#a08060", style: "cap", accent: "#ffffff"});
        mk("kid", "はしゃぐ こども", -7, 12, .6, {shirt: "#ff9a5a", hair: "#8a5a2a", style: "spiky", size: .8, accent: "#ffd24a"});
        mk("guest", "おきゃくさん", 6, -12, 2.4, {shirt: "#58b878", hair: "#3a2a20", style: "bun", accent: "#ffd24a"});
        this.built = true; this.applyGates();
    }
    applyGates(){
        const q = this.S.q, B = this.B; const open = {grove: q >= 1, sky: q >= 2, manor: q >= 3, lagoon: q >= 4};
        for(const k of Object.keys(B.gates)){ const g = B.gates[k]; const idx = B.col.indexOf(g.rect); if(open[k] && idx >= 0) B.col.splice(idx, 1); g.part.hidden = !!open[k]; }
    }
    hit(x, z, r){
        for(const c of this.B.col){ if(x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r) return true; }
        for(const c of this.B.circ){ const dx = x - c[0], dz = z - c[1]; if(dx * dx + dz * dz < (c[2] + r) * (c[2] + r)) return true; }
        return false;
    }
    zoneAt(x, z){ if(x > 52 && Math.abs(z) < 40) return "manor"; if(x < -30) return "grove"; if(z < -30) return "sky"; if(z > 56) return "lagoon"; return "center"; }
    bgm(){ return ZONES[this.zone].bgm; }
    // ---------- クエスト ----------
    objective(){
        const P = this.S, g = P.got;
        const n = this.crystals ? this.crystals.filter((c) => c.got).length : 0, l = this.lanterns ? this.lanterns.filter((c) => c.got).length : 0;
        return ["ナビに はなしかけよう（ひろばの まんなか）", "ファンタジー・グローブで ひかりのかけらを 5つ あつめよう（" + n + "/5）→ ひかりの番人へ", "スカイ・コーストで スカイ・ライナーに のろう", "ミステリー・マナーで てがかりを 3つ みつけ、きんこを あけよう（" + (["clock", "pic", "book"].filter((k) => g[k]).length) + "/3）", "ブルー・ラグーンで ボートに のり、ランタンを 3つ あつめよう（" + l + "/3）→ ひろばの ナビへ", "パークの すべてを あそんだ！ ひろばの ふんすいを みにいこう"][Math.min(P.q, 5)];
    }
    hud(){ this.c.UI.setHud("ドリーム・フロンティア", this.objective(), this.c.S.gold); }
    async say(who, ...ls){ for(const l of ls) await this.c.UI.say(who, l); }
    async talkNavi(){
        const P = this.S, say = (...a) => this.say("ナビ", ...a);
        if(P.q === 0){
            await say("ようこそ、ドリーム・フロンティアへ！ わたしは ガイドの ナビ。", "このパークは、むかし ある ゲームの つくり手たちが「みんなの 夢を あつめる 場所」として つくったんだって。", "でもね、パークの 4つの エリアは ふしぎな かべで とじられてるの。ひとつずつ たのしんで ひらいていこう！", "まずは ひがしの… じゃなくて にしの ファンタジー・グローブ。ひかりの かけらを 5つ さがしてきて。", "かべが きえるよ！ いってらっしゃい！");
            P.q = 1; this.applyGates(); this.c.A.se("levelup");
        } else if(P.q === 4 && this.lanterns.every((l) => l.got) && P.rides.boat){
            await say("すごい！ ランタンが ぜんぶ そろったね！", "さあ、ふんすいの ところへ いこう。みんなの 夢の ひかりが、そこに あつまるの…！");
            P.q = 5; this.c.A.se("levelup");
        } else if(P.q === 5 && !P.end){
            await this.finale();
        } else if(P.end){ await say("またいつでも あそびに きてね！ ここは ずっと、みんなの 場所だから。");
        } else await say(["", "グローブは にしの みち。かべは もう ひらいてるよ。", "スカイ・コーストは きたの みち。コースターに のってみてね！", "ミステリー・マナーは ひがしの みち。くらいけど こわくないよ…たぶん。", "ラグーンは みなみの みち。ボートと ランタンが まってる！"][P.q] || "がんばってね！", "もくてきは メニュー（Esc）でも かくにんできるよ。");
        this.hud();
    }
    async finale(){
        const P = this.S, UI = this.c.UI, S = this.c.S, say = (...a) => this.say("ナビ", ...a);
        await say("みんなの ひかりが あつまった…！ ふんすいを みて！");
        this.finaleT = 12; this.c.A.se("levelup"); await new Promise((r) => setTimeout(r, UI.fast ? 10 : 2600));
        await this.say("", "ふんすいから ひかりの もじが うかびあがった… 「A R E」");
        await say("これが、このパークを つくった ひとたちが いちばん ねがった ものの なまえ。", "『ARE』… いつか だれかが ほんとうに てに する、ふしぎな ちから。", "あなたが ここまで たどりついたのは、きっと ぐうぜんじゃ ないよ。", "これは おれい！ また あそびに きてね。");
        S.coins = (S.coins || 0) + 300; S.inv.shizuku = (S.inv.shizuku || 0) + 1; S.titles = S.titles || []; if(!S.titles.includes("パーク・マスター")) S.titles.push("パーク・マスター"); P.end = true; this.c.A.se("levelup");
        await this.say("", "コイン300まいと はいごうの しずくを もらった！", "しょうごう『パーク・マスター』を てにいれた！");
        this.hud();
    }
    // ---------- 調べるもの ----------
    nearby(){
        const px = this.p.x, pz = this.p.z, P = this.S, out = [];
        const add = (x, z, r, label, act) => { const d = Math.hypot(px - x, pz - z); if(d < r) out.push({d, label, act}); };
        for(const n of this.npcs){ const act = n.id === "navi" ? () => this.talkNavi() : () => this.npcAct(n); add(n.x, n.z, 2.8, n.name + "と はなす", act); }
        add(this.exit.x, this.exit.z, 3, "ゲート：まちへ もどる", () => this.leave());
        for(const k of Object.keys(this.B.gates)){ const g = this.B.gates[k]; const open = (k === "grove" && P.q >= 1) || (k === "sky" && P.q >= 2) || (k === "manor" && P.q >= 3) || (k === "lagoon" && P.q >= 4); if(!open) add(g.x, g.z, 4.2, "ふしぎな かべ", () => this.say("", "ふしぎな ひかりの かべが とおせんぼ している…", "（ナビや エリアの ひとの おねがいを かなえると ひらく みたい）")); }
        add(0, -42.5, 5.5, "スカイ・ライナーに のる", () => this.coaster());
        add(0, 60.2, 3.5, "ボートに のる", () => this.boat());
        add(0, 0, 6.5, "ふんすいを みる", () => this.fountain());
        add(93, -6, 3, "ほんだなを しらべる", () => this.clue("book")); add(92.5, 6, 3, "えを しらべる", () => this.clue("pic")); add(70, 10.3, 3.2, "かべどけいを しらべる", () => this.clue("clock")); add(66, -8.6, 2.8, "きんこ を しらべる", () => this.safe());
        return out.sort((a, b) => a.d - b.d);
    }
    async npcAct(n){
        const P = this.S, say = (...a) => this.say(n.name, ...a);
        if(n.id === "keeper"){
            const got = this.crystals.filter((c) => c.got).length;
            if(P.q === 1 && got >= 5){ await say("おお… 5つの ひかりが そろった！", "この ひかりは むかし、パークの おおきな 夢から こぼれおちた かけら。ありがとう。", "おれいに、きたの スカイ・コーストの かべを ひらこう。"); P.q = 2; this.applyGates(); this.c.A.se("levelup"); this.c.S.coins = (this.c.S.coins || 0) + 30; await this.say("", "コイン30まいを もらった！"); }
            else if(P.q === 1) await say("ひかりの かけらを さがしておる のかね。", "このグローブの おくに、5つ ちらばって おる。ひかっている から すぐ わかるよ。（いま " + got + "/5）");
            else if(P.q === 0) await say("ナビに あいさつは すんだかな？ ひろばの まんなかに おるよ。");
            else await say("グローブの ひかりは いつでも おまえを みまもって おる。");
        } else if(n.id === "staff"){ await say("スカイ・ライナーへ ようこそ！ のりばは うしろの ホームだよ。", "オート運転か、じぶんで スピードを そうさする モードを えらべるぜ！", "すすむ・ブレーキは ↑↓（スティック）だ！"); }
        else if(n.id === "butler"){ if(P.q < 3) await say("ここは ミステリー・マナー… ごようの かたは おはいり ください。"); else if(P.code) await say("きんこは あけられた ようですな。 おみごとです。"); else await say("やかたには みっつの てがかりが ございます。", "とけい、え、ほんだな… その じゅんばんで すうじを ならべると、きんこが ひらくかも しれません。"); }
        else if(n.id === "sailor"){ await say("ブルー・ラグーンは ランタンの みずうみだ。", P.q >= 4 ? "ボートで ぐるっと まわってみな。ランタンは ほとりの はしらに かかってるぜ。" : "…おっと、まずは ほかの エリアを たのしんできな。"); }
        else if(n.id === "kid") await say("ぼく、コースターが すきなんだ！ でも きょうは ちょっと おなかが こわいな…");
        else if(n.id === "guest") await say("ここの ふんすい、ゆうがたに なると ひかるんですって。ロマンチックね。");
        this.hud();
    }
    async clue(k){
        const P = this.S, g = P.got, map = {book: ["ほんだなには あおい ほんが ずらり…", "あおい ほんは ぜんぶで 7さつ ならんでいる。", 7], pic: ["おおきな えが かざられている。", "えの なかの とりが 2わ…", 2], clock: ["かべどけいが かかっている。", "はりは 4じを さしている。", 4]};
        const c = map[k]; await this.say("", c[0], c[1]); if(!g[k]){ g[k] = 1; this.c.A.se("ok"); this.c.UI.toast("てがかり『" + c[2] + "』を メモした！"); } this.hud();
    }
    async safe(){
        const P = this.S, UI = this.c.UI;
        if(P.code){ await this.say("", "きんこは もう あいている。"); return; }
        if(P.q < 3){ await this.say("", "ふるい きんこだ。かぎが かかっている。"); return; }
        await this.say("", "きんこには ダイヤルが 3つ ついている。", "メモ：とけい、え、ほんだな の じゅんばん？");
        const digits = []; for(let i = 0; i < 3; i++){ const d = await UI.menu((i + 1) + "けためを えらぶ　" + (digits.join(" ") || "- - -"), Array.from({length: 10}, (_, n) => ({label: String(n)})), {cancel: true}); if(d < 0) return; digits.push(d); }
        if(digits.join("") === "427"){ this.c.A.se("levelup"); await this.say("", "カチッ…！ きんこが ひらいた！", "なかには 『ひみつの かぎ』と ラグーンの ちずが はいっていた。"); P.code = true; if(P.q === 3){ P.q = 4; this.applyGates(); } this.c.S.coins = (this.c.S.coins || 0) + 50; await this.say("", "コイン50まいも みつけた！"); }
        else { this.c.A.se("cancel"); await this.say("", "ガチャガチャ… ひらかない。（ばんごうが ちがう みたい）"); }
        this.hud();
    }
    async fountain(){
        const P = this.S;
        if(P.q >= 5 && !P.end) await this.talkNavi(); else if(P.end) { this.finaleT = 8; this.c.A.se("heal"); await this.say("", "ふんすいの うえに「A R E」の ひかりが ゆらめいている…"); }
        else await this.say("", "きれいな ふんすいだ。みずが きらきら ひかっている。");
    }
    leave(){ if(this.busy) return; this.exiting = true; }
    // ---------- のりもの ----------
    async coaster(){
        const P = this.S; if(P.q < 2){ await this.say("スタッフ", "ごめんね、まだ スカイ・コーストは オープン前だよ。"); return; }
        const m = await this.c.UI.menu("スカイ・ライナー", [{label: "オートで のる"}, {label: "じぶんで そうさ（↑でかそく ↓でブレーキ）"}, {label: "やめる"}], {cancel: true}); if(m < 0 || m === 2) return;
        const T = this.track, pt = T.pts[0], nx = T.pts[3]; this.ride = {kind: "coaster", s: 0, auto: m === 0, mult: 1, v: 2, off: 0, t: 0};
        this.c.A.se("encounter"); await this.rideWait(); const first = !P.rides.coaster; P.rides.coaster = 1;
        await this.say("", "おつかれさま！ スカイ・ライナーは さいこうだった！");
        if(first){ this.c.S.coins = (this.c.S.coins || 0) + 20; await this.say("", "コイン20まいを もらった！"); if(P.q === 2){ P.q = 3; this.applyGates(); await this.say("ナビ", "（ひがしの ミステリー・マナーの かべが ひらいたよ！）"); } }
        this.hud();
    }
    async boat(){
        const P = this.S; if(P.q < 4){ await this.say("ボートの おじさん", "まだ ラグーンは じゅんびちゅうだ。ほかの エリアを あそんできな。"); return; }
        this.ride = {kind: "boat", th: Math.PI / 2, off: 0, t: 0, a: 0}; this.c.A.se("heal"); await this.rideWait(); const first = !P.rides.boat; P.rides.boat = 1;
        await this.say("", "ゆったり ボートで ひとまわり。いい きもち…");
        if(first){ this.c.S.coins = (this.c.S.coins || 0) + 20; await this.say("", "コイン20まいを もらった！"); } this.hud();
    }
    rideWait(){ return new Promise((r) => { this.rideDone = r; }); }
    // ---------- 入る ----------
    enter(){
        const R = this.c.R; if(!this.built) this.build();
        const P = this.S; this.p.x = 14; this.p.z = 13; this.look = {yaw: Math.atan2(-14, -13) + Math.PI * 0 , pitch: -.05}; this.exiting = false; this.ride = null; this.busy = false; this.zone = "center"; this.env = null;
        this.c.setState("park"); document.body.dataset.mode = "park"; $("prompt").hidden = true; this.hud();
        const cv = $("gl"); this._lockFn = () => { if(this.c.getState() === "park" && !(this.c.Input.touch) && !document.pointerLockElement && !this.busy){ try{ cv.requestPointerLock && cv.requestPointerLock(); }catch(_e){} } };
        this._mm = (e) => { if(document.pointerLockElement === cv && this.c.getState() === "park" && !this.c.UI.menuOpen() && !this.c.UI.dlgOpen()){ this.look.yaw -= e.movementX * .0024; this.look.pitch = Math.max(-1.2, Math.min(1.2, this.look.pitch - e.movementY * .0024)); } };
        this._pd = (e) => { if(e.pointerType === "touch"){ this._ty = e.clientY; this._tid = e.pointerId; } }; this._pm = (e) => { if(e.pointerId === this._tid && this.c.getState() === "park" && e.pointerType === "touch"){ this.look.pitch = Math.max(-1.1, Math.min(1.1, this.look.pitch - (e.clientY - this._ty) * .004)); this._ty = e.clientY; } };
        cv.addEventListener("click", this._lockFn); document.addEventListener("mousemove", this._mm); cv.addEventListener("pointerdown", this._pd); cv.addEventListener("pointermove", this._pm);
        this.hint = 6; this.c.UI.toast("クリックで マウスしてん／Escで メニュー／スペースで しらべる", 4200);
        return new Promise((res) => { this.done = res; });
    }
    close(){
        const cv = $("gl"); cv.removeEventListener("click", this._lockFn); document.removeEventListener("mousemove", this._mm); cv.removeEventListener("pointerdown", this._pd); cv.removeEventListener("pointermove", this._pm);
        try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(_e){}
        $("prompt").hidden = true; document.body.dataset.mode = "field"; this.c.setState("talk"); if(this.c.story) this.c.story.hud(); const d = this.done; this.done = null; if(d) d();
    }
    // ---------- まいフレーム ----------
    update(dt, e, routed){
        const I = this.c.Input, UI = this.c.UI; this.t += dt;
        if(this.exiting && !this.busy){ this.exiting = false; this.close(); return; }
        if(!routed && !this.busy && !this.ride){
            if(e.menu){ this.busy = true; this.menu().finally(() => { this.busy = false; }); }
            else this.move(dt, I);
        } else if(this.ride && !routed) this.rideTick(dt, I);
        else if(routed){ $("prompt").hidden = true; }
        if(!this.ride && !routed && !this.busy){
            const list = this.nearby(), pr = $("prompt"); const top = list[0]; pr.hidden = !top; if(top){ pr.textContent = "💬 " + top.label + (document.body.classList.contains("touch") ? "（Aボタン）" : "（Space / Enter）"); }
            if(top && e.ok){ this.busy = true; pr.hidden = true; Promise.resolve(top.act()).catch((x) => console.error(x)).finally(() => { this.busy = false; }); }
        }
        this.draw(dt);
    }
    async menu(){
        const UI = this.c.UI; for(;;){
            const r = await UI.menu("パークメニュー　" + this.c.S.gold + "G　コイン" + (this.c.S.coins || 0), [{label: "もくてき"}, {label: "つづける"}, {label: "まちへ もどる"}], {cancel: true}); if(r < 0 || r === 1) return;
            if(r === 0) await this.say("もくてき", this.objective()); else if(r === 2){ const o = await UI.menu("パークを でますか？（すすみぐあいは のこります）", [{label: "でる"}, {label: "やめる"}], {cancel: true}); if(o === 0){ this.exiting = true; return; } }
        }
    }
    move(dt, I){
        const L = this.look; L.yaw -= (I.cam * 1.9 * dt) + (I.dragRot || 0);
        const sp = 5.2 * (I.held.dash ? 1.7 : 1), f = [Math.sin(L.yaw), Math.cos(L.yaw)], r = [-f[1], f[0]];
        let dx = f[0] * I.my + r[0] * I.mx, dz = f[1] * I.my + r[1] * I.mx; const l = Math.hypot(dx, dz);
        if(l > .08){ const k = Math.min(1, l); dx = dx / l * sp * k * dt; dz = dz / l * sp * k * dt; let nx = this.p.x, nz = this.p.z; if(!this.hit(nx + dx, nz, .4)) nx += dx; if(!this.hit(nx, nz + dz, .4)) nz += dz; this.walk = (this.walk || 0) + Math.hypot(nx - this.p.x, nz - this.p.z); this.p.x = nx; this.p.z = nz; }
        // ひろいもの（じどう）
        for(const c of this.crystals) if(!c.got && Math.hypot(this.p.x - c.x, this.p.z - c.z) < 1.9){ c.got = true; this.c.A.se("levelup"); const n = this.crystals.filter((q) => q.got).length; this.c.UI.toast("ひかりのかけらを てにいれた！（" + n + "/5）"); this.hud(); }
        if(this.S.q >= 4) for(const c of this.lanterns) if(!c.got && Math.hypot(this.p.x - c.x, this.p.z - c.z) < 2.6){ c.got = true; this.c.A.se("levelup"); const n = this.lanterns.filter((q) => q.got).length; this.c.UI.toast("ランタンを てにいれた！（" + n + "/3）"); this.hud(); if(n === 3) this.c.UI.toast("ナビに はなしかけよう！", 3000); }
        const z = this.zoneAt(this.p.x, this.p.z); if(z !== this.zone){ this.zone = z; }
    }
    rideTick(dt, I){
        const r = this.ride; r.t += dt; r.off = Math.max(-1.3, Math.min(1.3, (r.off || 0) - (I.cam * 1.9 * dt) - (I.dragRot || 0)));
        if(r.kind === "coaster"){
            const T = this.track; let s = r.s % T.total; const n = T.pts.length; let i = 0; { let lo = 0, hi = T.len.length - 1; while(lo < hi - 1){ const mid = (lo + hi) >> 1; if(T.len[mid] <= s) lo = mid; else hi = mid; } i = lo; }
            const y = T.pts[i % n][2]; if(!r.auto){ r.mult = Math.max(.6, Math.min(1.5, r.mult + (I.my > .3 ? 1 : I.my < -.3 ? -1.4 : 0) * dt * 1.2)); r.mult += (1 - r.mult) * dt * .15; }
            const first = r.s < 55; const v = (first ? 8 + r.s * .08 : Math.sqrt(49 + 12 * Math.max(0, 18.5 - y))) * (r.auto ? 1 : r.mult);
            r.v = v; r.s += v * dt; if(r.s >= T.total * 2 - 1){ this.ride = null; this.rideDone && this.rideDone(); }
            this.c.UI.toast && (r.t < .1 || Math.floor(r.t * 2) !== Math.floor((r.t - dt) * 2)) && ($("hudObj").textContent = "▶ スカイ・ライナー　スピード " + Math.round(v * 3.6) + "km/h" + (r.auto ? "" : "　↑かそく ↓ブレーキ"));
        } else {
            r.th += dt * .2 * (1 + 0); if(r.th > Math.PI / 2 + Math.PI * 2){ this.ride = null; this.rideDone && this.rideDone(); }
        }
    }
    // ---------- えいぞう ----------
    draw(dt){
        const R = this.c.R, t = this.t, B = this.B; const rd = this.ride; let eye, yaw, pitch, fov = 1.0;
        if(rd && rd.kind === "coaster"){
            const T = this.track, n = T.pts.length; const at = (s) => { s = ((s % T.total) + T.total) % T.total; let lo = 0, hi = T.len.length - 1; while(lo < hi - 1){ const mid = (lo + hi) >> 1; if(T.len[mid] <= s) lo = mid; else hi = mid; } const a = T.pts[lo % n], b = T.pts[(lo + 1) % n], k = (s - T.len[lo]) / Math.max(.001, T.len[lo + 1] - T.len[lo]); return [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k, a[1] + (b[1] - a[1]) * k]; };
            const p = at(rd.s), q = at(rd.s + 4); eye = [p[0], p[1] + 1.1, p[2]]; yaw = Math.atan2(q[0] - p[0], q[2] - p[2]); pitch = Math.atan2(q[1] - p[1], Math.hypot(q[0] - p[0], q[2] - p[2])) * .9; fov = 1.0 + Math.min(.35, (rd.v || 0) * .02);
            this.p.x = p[0]; this.p.z = p[2]; yaw -= rd.off * .9; this.zone = "sky";
        } else if(rd){ const th = rd.th, cx = 0, cz = 79, rx = 17, rz = 9; const x = cx + Math.cos(th) * rx, z = cz + Math.sin(th) * rz; eye = [x, .9 + Math.sin(t * 1.6) * .03, z]; const dx = -Math.sin(th) * rx, dz = Math.cos(th) * rz; yaw = Math.atan2(dx, dz) - rd.off; pitch = -.05; this.p.x = x; this.p.z = z; this.zone = "lagoon"; const ty = Math.atan2(dx, dz); this.boatPos = [x - Math.sin(ty) * 1.7, z - Math.cos(ty) * 1.7, ty]; }
        else { eye = [this.p.x, EYE + Math.sin((this.walk || 0) * 2.6) * .035, this.p.z]; yaw = this.look.yaw; pitch = this.look.pitch; }
        const cp = Math.cos(pitch), tgt = [eye[0] + Math.sin(yaw) * cp, eye[1] + Math.sin(pitch), eye[2] + Math.cos(yaw) * cp];
        // かんきょう（なめらかに きりかえ）
        const Z = ZONES[this.zone].env; if(!this.env) this.env = JSON.parse(JSON.stringify(Z)); const k = Math.min(1, dt * 2.2);
        for(const key of ["fogC", "amb", "light"]) for(let i = 0; i < 3; i++) this.env[key][i] += (Z[key][i] - this.env[key][i]) * k; this.env.fogNear += (Z.fogNear - this.env.fogNear) * k; this.env.fogFar += (Z.fogFar - this.env.fogFar) * k;
        R.begin({eye, target: tgt, fov: this.c.cssH > this.c.cssW ? fov * 1.12 : fov}, this.env);
        for(const p of B.parts){ if(p.hidden) continue; const o = p === this.waterPart ? Object.assign({}, p.opt, {uv: [t * .02, t * .03]}) : p.opt; R.draw(p.mesh, o); }
        const face = (x, z) => Math.atan2(eye[0] - x, eye[2] - z);
        const glow = (x, y, z, col, s, a) => R.draw(this.spr, {m: M4.mul(M4.T(x, y - s / 2, z), M4.mul(M4.RY(face(x, z)), M4.S(s, s, 1))), tex: this.tex.glow, mode: 2, add: true, tint: [col[0], col[1], col[2], a === undefined ? .8 : a], nodepth: false});
        for(const g of this.glows){ if(Math.hypot(g[0] - eye[0], g[2] - eye[2]) < 70) glow(g[0], g[1], g[2], g[3], g[4] * (1 + Math.sin(t * 2 + g[0]) * .08), .75); }
        for(const c of this.crystals){ if(c.got) continue; R.draw(this.cryM, {m: M4.mul(M4.T(c.x, .9 + Math.sin(t * 2 + c.x) * .2, c.z), M4.mul(M4.RY(t * 1.2), M4.S(1.1, 1.4, 1.1))), tint: [c.col[0], c.col[1], c.col[2], 1], mode: 0}); glow(c.x, 1.9, c.z, c.col, 4.2, .9);
            R.draw(this.beam, {m: M4.mul(M4.T(c.x, 0, c.z), M4.mul(M4.RY(face(c.x, c.z)), M4.S(.8, 11, 1))), tex: this.tex.beam, mode: 2, add: true, tint: [c.col[0], c.col[1], c.col[2], .6]}); }
        for(const l of this.lanterns){ if(l.got || this.S.q < 4) continue; R.draw(this.lanM, {m: M4.T(l.x, 2.3 + Math.sin(t * 2 + l.x) * .1, l.z), mode: 0, tint: [1, .9, .6, 1]}); glow(l.x, 2.6, l.z, [1, .7, .3], 4, .9); R.draw(this.beam, {m: M4.mul(M4.T(l.x, 0, l.z), M4.mul(M4.RY(face(l.x, l.z)), M4.S(.8, 10, 1))), tex: this.tex.beam, mode: 2, add: true, tint: [1, .75, .3, .5]}); }
        // ふんすいの みず・ひかり
        const fo = (this.S.q >= 5 ? 1 : .35) + (this.finaleT > 0 ? Math.min(1, this.finaleT / 4) : 0); if(this.finaleT > 0) this.finaleT -= dt;
        for(let i = 0; i < 8; i++){ const a = i / 8 * 6.283 + t * .5, ph = (t * .9 + i * .37) % 1; glow(Math.cos(a) * ph * 2.6, 2.6 + Math.sin(ph * 3.14) * 2.2, Math.sin(a) * ph * 2.6, [.6, .85, 1], .55, .8); }
        glow(0, 3.2, 0, [.7, .9, 1], 5 * fo, .55);
        if(this.S.end || this.finaleT > 0){ R.draw(this.spr, {m: M4.mul(M4.T(0, 4.6 + Math.sin(t) * .15, 0), M4.mul(M4.RY(face(0, 0)), M4.S(6.4, 2.4, 1))), tex: this.areTex, mode: 2, add: true, tint: [1, 1, 1, .95]}); }
        // ボート
        if(rd && rd.kind === "boat") R.draw(this.boatM, {m: M4.mul(M4.T(this.boatPos[0], .15, this.boatPos[1]), M4.RY(this.boatPos[2])), mode: 0}); else R.draw(this.boatM, {m: M4.mul(M4.T(-6, .15, 63), M4.RY(.3)), mode: 0});
        // ひとびと
        for(const n of this.npcs){ n.t += dt; if(Math.hypot(n.x - eye[0], n.z - eye[2]) < 5.5 && !rd) n.yaw = Math.atan2(eye[0] - n.x, eye[2] - n.z); drawChar(R, n.P, {x: n.x, z: n.z, yaw: n.yaw, walk: 0, t: n.t}, {}); }
        R.flush();
    }
}
