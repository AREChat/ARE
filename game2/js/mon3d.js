"use strict";
// ===== モンスターの3Dモデル（手作りの低ポリ。外部モデル・画像なし）=====
// 種類(kind)ごとの組み立て＋色・飾り(角・王冠・輪)の違いで、数百体ぶんの見た目を作る。
// 前（顔）は +Z 向き。足元が y=0、高さは約2。アニメは「部品(role)ごとに回転」で表現する。
import {Geo, M4} from "./gl.js";

const shadeC = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join(""); };
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
export const KINDS = ["slime", "bat", "mushroom", "ghost", "golem", "dragon", "fish", "flower", "robot", "food", "armor", "star", "pad"];

// 楕円体・コーン・箱を置く小さな道具
const ell = (g, c, x, y, z, rx, ry, rz, seg, rings) => g.sphere(1, seg || 10, rings || 7, c, M4.mul(M4.T(x, y, z), M4.S(rx, ry, rz)));
const cone = (g, c, x, y, z, r, h, ax, az, seg) => g.cyl(0, r, h, seg || 6, c, M4.mul(M4.T(x, y, z), M4.mul(M4.RZ(az || 0), M4.RX(ax || 0))), true);
const bx = (g, c, x, y, z, w, h, d, ry) => g.box(w, h, d, c, M4.mul(M4.T(x, y, z), M4.RY(ry || 0)));
const hx = (c) => (typeof c === "string" ? [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255] : c);
const eyes = (g, y, z, gap, r, col) => { for(const s of [-1, 1]){ ell(g, "#ffffff", s * gap, y, z, r, r * 1.15, r * .6, 8, 6); ell(g, col || "#1a1a2a", s * gap * .92, y - r * .05, z + r * .32, r * .52, r * .62, r * .35, 7, 5); ell(g, "#ffffff", s * gap * .92 - r * .15, y + r * .2, z + r * .55, r * .17, r * .17, r * .12, 5, 4); } };
const mouthSmile = (g, y, z, w) => { ell(g, "#2a1020", 0, y, z, w, w * .42, w * .25, 8, 5); ell(g, "#e8707a", 0, y - w * .1, z + w * .05, w * .55, w * .2, w * .15, 6, 4); };

// 部品リスト: {geo, role, pivot}
function builder(){
    const parts = []; let cur = null;
    return {
        part(role, pivot, fn){ const g = new Geo(); fn(g); parts.push({g, role, pivot: pivot || [0, 0, 0]}); },
        done(){ return parts; }
    };
}

const BUILD = {
    slime(b, S){
        b.part("body", [0, 0, 0], (g) => {
            ell(g, S.c1, 0, .72, 0, 1.0, .82, .95, 12, 9); ell(g, S.c1, 0, 1.5, 0, .2, .3, .2, 7, 5); ell(g, shadeC(S.c1, 1.45), -.38, 1.12, .52, .22, .14, .1, 6, 4);
            eyes(g, .82, .78, .3, .2); mouthSmile(g, .46, .84, .17);
            for(const s of [-1, 1]) ell(g, "#ff9ab0", s * .56, .56, .66, .14, .08, .05, 6, 4);
            if(S.f.crown) ell(g, S.c2, 0, 1.78, 0, .28, .12, .28, 7, 4);
        });
        return {top: [0, 1.8, 0], mouth: [0, .5, .9], center: [0, .9, 0], h: 1.8};
    },
    bat(b, S){
        b.part("body", [0, 0, 0], (g) => {
            ell(g, S.c1, 0, 1.15, 0, .62, .6, .55, 11, 8); ell(g, S.c2, 0, 1.0, .3, .38, .36, .3, 9, 6);
            for(const s of [-1, 1]){ cone(g, S.c1, s * .38, 1.62, -.05, .16, .45, 0, -s * .18, 5); }
            eyes(g, 1.28, .42, .23, .15, "#401030"); ell(g, "#2a1020", 0, 1.02, .5, .2, .09, .08, 7, 4);
            for(const s of [-1, 1]){ cone(g, "#ffffff", s * .09, 1.0, .53, .04, .12, Math.PI, 0, 4); }
            for(const s of [-1, 1]) ell(g, S.c2, s * .2, .5, .05, .1, .18, .16, 6, 4);
        });
        const wing = (s) => (g) => { const col = S.c2, rim = shadeC(S.c1, .8);
            // 骨(ゆび)と膜（板）
            const tips = [[1.7, .7], [1.9, -.1], [1.45, -.75]];
            const sh = [0, 0, 0]; const mk = (a, c) => { g.vert(null, [s * a[0], a[1], 0], [0, 0, 1], c); };
            const idx = []; const P = [[0, .12], [1.7, .85], [1.95, -.05], [1.45, -.85], [.5, -.55]].map((p) => [s * p[0], p[1], 0]);
            const ids = P.map((p) => g.vert(null, p, [0, 0, 1], hx(p === P[0] ? shadeC(col, 1.1) : col))); const ctr = g.vert(null, [s * .55, 0, 0], [0, 0, 1], hx(shadeC(col, 1.15)));
            for(let k = 0; k < P.length - 1; k++){ if(s > 0) g.tri(ctr, ids[k], ids[k + 1]); else g.tri(ctr, ids[k + 1], ids[k]); }
            for(let k = 1; k <= 3; k++){ g.cyl(.04, .06, Math.hypot(P[k][0], P[k][1]), 4, rim, M4.mul(M4.T(0, 0, 0), M4.mul(M4.RZ(Math.atan2(P[k][1], P[k][0]) - Math.PI / 2 + (s < 0 ? Math.PI : 0) * 0 ), M4.id()))); }
        };
        b.part(["wingL"], [-.5, 1.2, -.05], wing(-1)); b.part(["wingR"], [.5, 1.2, -.05], wing(1));
        return {top: [0, 1.9, 0], mouth: [0, 1.0, .6], center: [0, 1.2, 0], h: 1.9, fly: true};
    },
    mushroom(b, S){
        b.part("body", [0, 0, 0], (g) => {
            g.cyl(.42, .5, .95, 10, "#f6e8c8", M4.T(0, .12, 0), true);
            ell(g, S.c1, 0, 1.2, 0, 1.12, .72, 1.12, 14, 8);
            ell(g, shadeC(S.c1, .6), 0, 1.0, 0, .98, .12, .98, 12, 4);
            [[-.55, 1.62, .15, .2], [.35, 1.78, -.1, .22], [.75, 1.45, .35, .15], [-.1, 1.5, .62, .16], [.1, 1.9, .2, .14]].forEach(([x, y, z, r]) => ell(g, "#ffffff", x, y, z, r, r * .55, r, 7, 5));
            eyes(g, .72, .42, .2, .13); ell(g, "#2a1020", 0, .48, .47, .1, .05, .04, 6, 4);
            for(const s of [-1, 1]){ ell(g, "#f6e8c8", s * .5, .6, .15, .13, .22, .13, 6, 4); ell(g, "#f6e8c8", s * .2, .16, .12, .2, .1, .3, 6, 4); }
        });
        return {top: [0, 2, 0], mouth: [0, .5, .5], center: [0, 1.1, 0], h: 2};
    },
    ghost(b, S){
        b.part("body", [0, 0, 0], (g) => {
            ell(g, S.c1, 0, 1.4, 0, .86, .9, .8, 12, 9); g.cyl(.86, .2, 1.3, 12, S.c1, M4.T(0, .2, 0), false);
            for(let k = 0; k < 5; k++){ const a = k / 5 * 6.283; ell(g, S.c1, Math.cos(a) * .6, .35 + (k % 2) * .08, Math.sin(a) * .5, .24, .3, .24, 6, 4); }
            for(const s of [-1, 1]){ ell(g, shadeC(S.c1, .9), s * .95, 1.15, .1, .2, .42, .2, 7, 5); }
            for(const s of [-1, 1]){ ell(g, "#101828", s * .3, 1.5, .68, .17, .26, .12, 8, 6); ell(g, S.c2, s * .3, 1.55, .78, .06, .08, .04, 5, 4); }
            ell(g, "#101828", 0, 1.0, .74, .16, .22, .1, 7, 5);
        });
        return {top: [0, 2.35, 0], mouth: [0, 1.0, .8], center: [0, 1.3, 0], h: 2.3, fly: true, alpha: .9};
    },
    golem(b, S){
        b.part("body", [0, 0, 0], (g) => {
            for(const s of [-1, 1]){ bx(g, shadeC(S.c1, .85), s * .45, 0, 0, .55, .95, .62); bx(g, shadeC(S.c1, .7), s * .45, 0, .08, .62, .22, .72); }
            bx(g, S.c1, 0, .85, 0, 1.55, 1.2, 1.0); bx(g, shadeC(S.c1, 1.15), 0, 1.95, .02, .8, .65, .78);
            ell(g, S.c2, 0, 1.4, .52, .2, .2, .08, 7, 5);
            for(const s of [-1, 1]){ bx(g, S.c2, s * .22, 2.25, .38, .22, .12, .1); bx(g, shadeC(S.c1, .9), s * 1.0, 1.55, 0, .55, .45, .6); }
            bx(g, "#1a1a2a", 0, 2.02, .4, .5, .06, .06);
            for(let k = 0; k < 3; k++) cone(g, shadeC(S.c1, .8), -.5 + k * .5, 2.5, -.1, .14, .35, 0, 0, 5);
        });
        const arm = (s) => (g) => { bx(g, shadeC(S.c1, .95), s * 1.15, .55, 0, .48, 1.1, .5); ell(g, S.c1, s * 1.15, .45, .06, .38, .36, .38, 8, 6); };
        b.part("armL", [-1.0, 1.7, 0], arm(-1)); b.part("armR", [1.0, 1.7, 0], arm(1));
        return {top: [0, 2.7, 0], mouth: [0, 2.0, .5], center: [0, 1.4, 0], h: 2.7};
    },
    dragon(b, S){
        b.part("body", [0, 0, 0], (g) => {
            ell(g, S.c1, 0, 1.25, -.1, .95, .85, 1.25, 12, 9); ell(g, S.c2, 0, 1.15, .45, .62, .65, .8, 10, 7);
            ell(g, S.c1, 0, 1.95, .55, .42, .6, .42, 9, 6); ell(g, S.c1, 0, 2.35, .9, .46, .5, .46, 9, 6);
            ell(g, S.c1, 0, 2.5, 1.0, .52, .46, .62, 10, 7);
            bx(g, S.c1, 0, 2.28, 1.35, .46, .32, .6); ell(g, "#101018", -.14, 2.52, 1.62, .05, .04, .05, 4, 3); ell(g, "#101018", .14, 2.52, 1.62, .05, .04, .05, 4, 3);
            for(const s of [-1, 1]){ ell(g, "#ffffff", s * .26, 2.72, 1.12, .12, .15, .08, 6, 5); ell(g, "#d02020", s * .26, 2.72, 1.19, .06, .1, .04, 5, 4); ell(g, "#101018", s * .26, 2.72, 1.22, .03, .07, .02, 4, 3);
                cone(g, S.c2, s * .3, 2.88, .75, .1, .6, -.5, -s * .35, 5); }
            for(let k = 0; k < 4; k++) cone(g, S.c2, 0, 1.95 + k * .1, -.4 - k * .38, .14 - k * .01, .34, -.2, 0, 4);
            for(const s of [-1, 1]){ g.cyl(.26, .34, .95, 7, shadeC(S.c1, .9), M4.T(s * .55, 0, .15), true); ell(g, shadeC(S.c1, .8), s * .55, .05, .35, .34, .12, .45, 7, 4);
                for(let k = -1; k <= 1; k++) cone(g, "#f4ecd8", s * .55 + k * .12, .05, .72, .05, .16, Math.PI / 2, 0, 4);
                ell(g, shadeC(S.c1, .95), s * .55, 1.3, .9, .2, .5, .2, 6, 4); }
            if(S.f.crown) for(let k = 0; k < 5; k++) cone(g, "#ffd24a", -.2 + k * .1, 3.0, .75, .07, .26, 0, 0, 4);
        });
        b.part("jaw", [0, 2.18, 1.1], (g) => { bx(g, shadeC(S.c1, .85), 0, 2.08, 1.35, .42, .14, .55); for(let k = -1; k <= 1; k++) cone(g, "#ffffff", k * .12, 2.22, 1.58, .04, .12, Math.PI, 0, 4); });
        const wing = (s) => (g) => { const P = [[0, .1], [1.2, 1.5], [2.2, 1.1], [2.5, .2], [2.0, -.6], [.9, -.4]].map((p) => [s * p[0], p[1], 0]);
            const ids = P.map((p) => g.vert(null, p, [0, 0, 1], hx(S.c2))); const c = g.vert(null, [s * .6, .3, 0], [0, 0, 1], hx(shadeC(S.c2, 1.2)));
            for(let k = 0; k < P.length - 1; k++){ if(s > 0) g.tri(c, ids[k], ids[k + 1]); else g.tri(c, ids[k + 1], ids[k]); }
            for(const k of [1, 2, 3, 4]){ const l = Math.hypot(P[k][0], P[k][1]); g.cyl(.045, .08, l, 4, S.c1, M4.mul(M4.mul(M4.RZ((s > 0 ? -1 : 1) * (Math.PI / 2 - Math.atan2(P[k][1], Math.abs(P[k][0])))), M4.id()), M4.id())); } };
        b.part("wingL", [-.5, 1.9, -.4], wing(-1)); b.part("wingR", [.5, 1.9, -.4], wing(1));
        b.part("tail", [0, 1.0, -1.2], (g) => { let x = 0, z = -1.4, y = 1.0, r = .5; for(let k = 0; k < 6; k++){ ell(g, S.c1, x, y, z, r, r, r * 1.1, 8, 6); z -= r * 1.0; y -= .02; x += Math.sin(k * .8) * .1; r *= .8; } cone(g, S.c2, x, y, z - .1, .22, .6, -Math.PI / 2, 0, 5); });
        return {top: [0, 3.0, .7], mouth: [0, 2.25, 1.75], center: [0, 1.5, 0], h: 3.0};
    },
    fish(b, S){
        b.part("body", [0, 0, 0], (g) => {
            ell(g, S.c1, 0, 1.2, 0, .85, 1.1, .7, 12, 9); ell(g, S.c2, 0, 1.0, .3, .55, .8, .5, 10, 7);
            eyes(g, 1.55, .5, .36, .24, "#102040"); ell(g, "#e87080", 0, .98, .62, .24, .1, .1, 8, 5); ell(g, "#2a1020", 0, .98, .66, .15, .05, .05, 6, 4);
            for(const s of [-1, 1]){ ell(g, shadeC(S.c1, .8), s * .26, 1.9, .05, .1, .3, .3, 5, 4); ell(g, shadeC(S.c1, 1.3), s * .45, 1.0, .5, .08, .5, .04, 5, 4); ell(g, "#e0a040", s * .3, .1, .15, .18, .12, .3, 6, 4); g.cyl(.07, .09, .35, 5, "#e0a040", M4.T(s * .3, 0, .1)); }
            cone(g, shadeC(S.c1, .8), 0, 1.9, -.2, .32, .7, -.2, 0, 3);
            if(S.f.crown) cone(g, "#ffd24a", 0, 2.25, .1, .2, .3, 0, 0, 5);
        });
        const fin = (s) => (g) => { ell(g, shadeC(S.c1, 1.2), s * 1.0, .95, .1, .5, .22, .06, 7, 4); };
        b.part("armL", [-.8, 1.1, 0], fin(-1)); b.part("armR", [.8, 1.1, 0], fin(1));
        b.part("tail", [0, 1.0, -.6], (g) => { ell(g, shadeC(S.c1, .9), 0, 1.0, -.8, .12, .5, .5, 6, 4); ell(g, S.c2, 0, 1.45, -.95, .1, .35, .3, 6, 4); ell(g, S.c2, 0, .6, -.95, .1, .3, .3, 6, 4); });
        return {top: [0, 2.35, 0], mouth: [0, 1.0, .8], center: [0, 1.2, 0], h: 2.3};
    },
    flower(b, S){
        b.part("body", [0, 0, 0], (g) => {
            g.cyl(.12, .16, 1.5, 6, "#4aa04a", M4.T(0, 0, 0)); ell(g, "#4aa04a", -.55, .65, .1, .5, .12, .25, 7, 4); ell(g, "#4aa04a", .55, .8, .1, .5, .12, .25, 7, 4);
            g.cyl(.45, .35, .45, 8, "#c0703a", M4.T(0, 0, 0), true);
        });
        b.part("head", [0, 1.55, 0], (g) => {
            const n = 9; for(let k = 0; k < n; k++){ const a = k / n * 6.283; ell(g, S.c1, Math.cos(a) * .72, 1.9 + Math.sin(a) * .72, -.05, .42, .3, .12, 7, 5); }
            ell(g, S.c2, 0, 1.9, .05, .56, .56, .3, 11, 8); eyes(g, 1.98, .26, .22, .12); mouthSmile(g, 1.68, .32, .14);
            for(const s of [-1, 1]) ell(g, "#ff9ab0", s * .36, 1.75, .27, .1, .06, .04, 5, 4);
        });
        return {top: [0, 2.9, 0], mouth: [0, 1.7, .4], center: [0, 1.5, 0], h: 2.8};
    },
    robot(b, S){
        b.part("body", [0, 0, 0], (g) => {
            for(const s of [-1, 1]){ bx(g, shadeC(S.c1, .8), s * .4, 0, 0, .4, .75, .5); bx(g, "#303040", s * .4, 0, .08, .5, .15, .62); }
            bx(g, S.c1, 0, .75, 0, 1.3, 1.0, .85); bx(g, S.c2, 0, 1.0, .44, .5, .4, .06); ell(g, "#7affc0", 0, 1.2, .5, .12, .12, .05, 6, 4);
            bx(g, shadeC(S.c1, 1.1), 0, 1.75, 0, .9, .75, .8); bx(g, "#14182a", 0, 1.95, .4, .76, .32, .06);
            for(const s of [-1, 1]){ ell(g, "#7affc0", s * .2, 2.1, .45, .1, .1, .05, 6, 4); }
            g.cyl(.04, .04, .45, 5, "#303040", M4.T(0, 2.5, 0)); ell(g, S.c2, 0, 3.0, 0, .12, .12, .12, 6, 4);
            for(const s of [-1, 1]) ell(g, S.c2, s * .75, 1.55, 0, .26, .26, .26, 7, 5);
        });
        const arm = (s) => (g) => { bx(g, shadeC(S.c1, .9), s * .85, .7, 0, .3, .95, .34); ell(g, "#303040", s * .85, .62, .05, .24, .24, .24, 7, 5); };
        b.part("armL", [-.75, 1.55, 0], arm(-1)); b.part("armR", [.75, 1.55, 0], arm(1));
        return {top: [0, 3.2, 0], mouth: [0, 2.0, .5], center: [0, 1.5, 0], h: 3.1};
    },
    food(b, S){
        const v = S.seed % 3;
        b.part("body", [0, 0, 0], (g) => {
            if(v === 0){ g.cyl(.35, 1.0, 1.7, 3, "#fafafa", M4.mul(M4.T(0, .05, 0), M4.RY(Math.PI / 2)), true); ell(g, "#fafafa", 0, .6, 0, .95, .7, .72, 8, 6); bx(g, "#1c3028", 0, .02, .5, 1.1, .75, .22); eyes(g, 1.15, .72, .26, .15); mouthSmile(g, .98, .76, .12); }
            else if(v === 1){ ell(g, S.c1, 0, 1.0, 0, .85, 1.05, .8, 12, 9); ell(g, "#fff6d8", 0, 1.35, .3, .6, .55, .5, 10, 7); for(let k = 0; k < 6; k++){ const a = k / 6 * 6.283; cone(g, "#fff6d8", Math.cos(a) * .55, 1.95, Math.sin(a) * .5, .16, .3, 0, 0, 4); } eyes(g, 1.2, .72, .28, .18); mouthSmile(g, .85, .76, .14); }
            else { g.cyl(.9, 1.0, 1.0, 12, S.c1, M4.T(0, .1, 0), true); ell(g, "#8a4a1a", 0, 1.12, 0, .95, .28, .9, 12, 5); ell(g, "#e04a60", 0, 1.6, 0, .24, .24, .24, 7, 5); eyes(g, .72, .9, .3, .17); mouthSmile(g, .45, .96, .14); }
            if(S.f.crown) cone(g, "#ffd24a", 0, 1.95, 0, .22, .3, 0, 0, 5);
            for(const s of [-1, 1]){ ell(g, "#f0b0a0", s * .55, .68, .6, .12, .07, .05, 5, 4); ell(g, shadeC(S.c2, 1), s * .55, .18, .1, .2, .12, .3, 6, 4); }
        });
        return {top: [0, 2.0, 0], mouth: [0, .9, .8], center: [0, 1.0, 0], h: 2.0};
    },
    armor(b, S){
        b.part("body", [0, 0, 0], (g) => {
            for(const s of [-1, 1]) bx(g, shadeC(S.c1, .8), s * .35, .0, 0, .4, .85, .45);
            bx(g, S.c1, 0, .8, 0, 1.15, 1.0, .75); bx(g, S.c2, 0, 1.2, .38, .3, .5, .06);
            ell(g, shadeC(S.c1, 1.2), 0, 2.15, 0, .6, .62, .6, 11, 8); bx(g, "#14182a", 0, 2.0, .45, .6, .18, .1); ell(g, "#ffd24a", -.15, 2.07, .52, .06, .06, .03, 5, 4); ell(g, "#ffd24a", .15, 2.07, .52, .06, .06, .03, 5, 4);
            cone(g, S.c2, 0, 2.7, 0, .12, .7, 0, 0, 5);
            for(const s of [-1, 1]) ell(g, S.c1, s * .75, 1.65, 0, .3, .26, .3, 7, 5);
        });
        b.part("armL", [-.7, 1.6, 0], (g) => { bx(g, shadeC(S.c1, .9), -.9, .6, 0, .32, .9, .36); g.cyl(.55, .55, .08, 10, S.c2, M4.mul(M4.T(-1.0, 1.0, .3), M4.RX(Math.PI / 2)), true); });
        b.part("armR", [.7, 1.6, 0], (g) => { bx(g, shadeC(S.c1, .9), .9, .6, 0, .32, .9, .36); bx(g, "#d8e0f0", 1.0, .5, .35, .1, .12, 1.4); bx(g, S.c2, 1.0, .5, .2, .3, .1, .14); });
        return {top: [0, 2.9, 0], mouth: [0, 2.0, .5], center: [0, 1.3, 0], h: 2.8};
    },
    star(b, S){
        b.part("body", [0, 0, 0], (g) => {
            ell(g, S.c1, 0, 1.4, 0, .72, .72, .55, 12, 9);
            for(let k = 0; k < 5; k++){ const a = k / 5 * 6.283 + Math.PI / 2; const x = Math.cos(a), y = Math.sin(a); g.cyl(0, .4, 1.0, 5, S.c1, M4.mul(M4.T(x * .5, 1.4 + y * .5, 0), M4.mul(M4.RZ(a - Math.PI / 2 + Math.PI), M4.id())), true); }
            for(let k = 0; k < 5; k++){ const a = k / 5 * 6.283 + Math.PI / 2; ell(g, shadeC(S.c1, 1.3), Math.cos(a) * 1.25, 1.4 + Math.sin(a) * 1.25, 0, .16, .16, .16, 5, 4); }
            eyes(g, 1.48, .5, .26, .17); mouthSmile(g, 1.12, .52, .12);
            for(const s of [-1, 1]){ ell(g, "#ff9ab0", s * .46, 1.28, .46, .1, .06, .04, 5, 4); ell(g, S.c2, s * .3, .12, .1, .2, .12, .3, 6, 4); g.cyl(.08, .1, .5, 5, S.c2, M4.T(s * .3, .2, .1)); }
        });
        return {top: [0, 2.8, 0], mouth: [0, 1.1, .6], center: [0, 1.4, 0], h: 2.8, fly: false};
    },
    pad(b, S){
        b.part("body", [0, 0, 0], (g) => {
            for(const s of [-1, 1]){ bx(g, shadeC(S.c1, .8), s * .4, 0, 0, .35, .6, .4); bx(g, "#303040", s * .4, 0, .06, .45, .12, .55); }
            bx(g, S.c1, 0, .55, 0, 2.0, 1.3, .7); for(const s of [-1, 1]) ell(g, S.c1, s * 1.0, 1.0, 0, .46, .7, .4, 8, 6);
            bx(g, "#14182a", 0, 1.1, .34, 1.15, .62, .1); eyes(g, 1.38, .46, .26, .16, "#101830"); mouthSmile(g, 1.17, .5, .1);
            bx(g, S.c2, -.7, .8, .36, .5, .14, .06); bx(g, S.c2, -.7, .62, .36, .14, .5, .06);
            [[.55, .85, "#e04a60"], [.78, .65, "#4a90e8"], [.55, .45, "#40b060"], [.32, .65, "#ffd24a"]].forEach(([x, y, c]) => ell(g, c, x, y + .0, .38, .1, .1, .05, 6, 4));
            g.cyl(.04, .04, .6, 5, "#303040", M4.mul(M4.T(0, 1.85, -.1), M4.RX(0)));
        });
        return {top: [0, 2.2, 0], mouth: [0, 1.0, .5], center: [0, 1.2, 0], h: 2.1};
    }
};

// 見た目の指定（図鑑データから決まる）
export function specOf(m){
    const seed = hashS(m.id || m.name || "x");
    const A = m.art || {}; return {kind: A.kind || KINDS[seed % KINDS.length], c1: A.color || "#6aa0e8", c2: A.color2 || shadeC(A.color || "#6aa0e8", 1.45), seed, f: A.f || {}};
}
const cache = new WeakMap();
export function monsterModel(R, spec){
    let c = cache.get(R); if(!c){ c = new Map(); cache.set(R, c); }
    const key = spec.kind + spec.c1 + spec.c2 + JSON.stringify(spec.f) + (spec.kind === "food" ? spec.seed % 3 : 0);
    if(c.has(key)) return c.get(key);
    const b = builder(); const info = (BUILD[spec.kind] || BUILD.slime)(b, spec);
    const parts = b.done().map((p) => ({mesh: R.mesh(p.g), role: p.role, pivot: p.pivot, cull: false}));
    // 転生の輪・ボスの飾り
    if(spec.f.halo){ const g = new Geo(); g.cyl(.55, .55, .06, 18, "#ffe680", M4.T(0, info.top[1] + .35, info.top[2] || 0), false); g.cyl(.45, .45, .08, 18, "#ffe680", M4.T(0, info.top[1] + .34, info.top[2] || 0), false); parts.push({mesh: R.mesh(g), role: "halo", pivot: [0, info.top[1], 0], cull: false}); }
    const model = Object.assign({spec, parts}, info); c.set(key, model); return model;
}
// 部品ごとのアニメ。st: {x,z,yaw,s,t,sq(つぶれ),lunge,flash,alpha,jaw(0..1),atk(0..1),dead(0..1)}
export function drawMonster(R, model, st, tex){
    const s = st.s || 1, t = st.t || 0, fly = model.fly ? Math.sin(t * 2.4) * .22 : 0;
    const bob = Math.sin(t * 2.2 + (st.ph || 0)) * .05 + fly + (st.hop || 0);
    const sq = st.sq || 0, dead = st.dead || 0;
    const root = M4.mul(M4.trs(st.x, (model.fly ? .5 : 0) + bob, st.z + (st.lunge || 0), st.yaw || 0, s), M4.S(1 + sq * .25 + dead * .2, Math.max(.02, 1 - sq * .35 - dead * .95), 1 + sq * .25 + dead * .2));
    const fl = st.flash || 0; const a = st.alpha === undefined ? 1 : st.alpha; const baseA = (model.alpha || 1) * a;
    const tint = [1 + fl * 1.8, 1 + fl * 1.8, 1 + fl * 1.8, baseA];
    for(const p of model.parts){
        let m = null;
        const pv = p.pivot;
        if(p.role === "wingL" || p.role === "wingR"){ const k = (p.role === "wingL" ? 1 : -1) * Math.sin(t * 7 + (st.ph || 0)) * (.55 + (st.atk || 0) * .3); m = M4.mul(M4.T(pv[0], pv[1], pv[2]), M4.mul(M4.RZ(k), M4.T(-pv[0], -pv[1], -pv[2]))); }
        else if(p.role === "jaw"){ const k = (st.jaw || 0) * .7 + Math.sin(t * 1.5) * .02; m = M4.mul(M4.T(pv[0], pv[1], pv[2]), M4.mul(M4.RX(k), M4.T(-pv[0], -pv[1], -pv[2]))); }
        else if(p.role === "tail"){ const k = Math.sin(t * 2.6 + 1) * .25; m = M4.mul(M4.T(pv[0], pv[1], pv[2]), M4.mul(M4.RY(k), M4.T(-pv[0], -pv[1], -pv[2]))); }
        else if(p.role === "armL" || p.role === "armR"){ const k = (p.role === "armL" ? -1 : 1) * (Math.sin(t * 2.2) * .12 + (st.atk || 0) * -1.4); m = M4.mul(M4.T(pv[0], pv[1], pv[2]), M4.mul(M4.RX(k), M4.T(-pv[0], -pv[1], -pv[2]))); }
        else if(p.role === "head"){ const k = Math.sin(t * 1.8) * .12; m = M4.mul(M4.T(pv[0], pv[1], pv[2]), M4.mul(M4.RZ(k), M4.T(-pv[0], -pv[1], -pv[2]))); }
        else if(p.role === "halo"){ m = M4.mul(M4.T(0, Math.sin(t * 2) * .06, 0), M4.id()); }
        const mm = m ? M4.mul(root, m) : root;
        R.draw(p.mesh, {m: mm, tint, blend: baseA < .999, cull: p.cull === false ? false : true});
    }
}
export function monsterShadow(R, shadowMesh, st){ R.draw(shadowMesh, {m: M4.trs(st.x, .02, st.z + .1, 0, (st.s || 1) * 1.1), mode: 3, tint: [0, 0, 0, .32 * (st.alpha === undefined ? 1 : st.alpha)], blend: true}); }
