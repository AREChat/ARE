"use strict";
// ===== 手作りの低ポリ3Dキャラ（外部の3Dモデルなし）と、モンスターのテクスチャ =====
import {Geo, M4, canvasTex} from "./gl.js";

const cache = new Map();
export function charMeshes(R, look){
    const key = JSON.stringify(look); if(cache.has(key)) return cache.get(key);
    const L = Object.assign({skin:"#f6cfa6", hair:"#3a2a20", shirt:"#3b6fd8", pants:"#2d3a5a", style:"short", accent:"#ffd24a", cape:null, size:1}, look || {});
    const mesh = (g) => R.mesh(g);
    const mk = (fn) => { const g = new Geo(); fn(g); return mesh(g); };
    const P = {};
    P.legL = P.legR = null;
    const leg = () => mk((g) => { g.box(.2, .46, .22, L.pants, M4.T(0, -.46, 0)); g.box(.24, .1, .3, "#33231a", M4.T(0, -.46, .03)); });
    P.legL = leg(); P.legR = leg();
    P.torso = mk((g) => {
        g.box(.62, .56, .38, L.shirt, M4.T(0, 0, 0));
        g.box(.64, .08, .4, L.accent, M4.T(0, .02, 0));
        if(L.cape) g.box(.64, .62, .06, L.cape, M4.mul(M4.T(0, -.04, -.22), M4.RX(.12)));
    });
    P.head = mk((g) => {
        g.sphere(.3, 10, 7, L.skin, M4.T(0, .3, 0));
        g.sphere(.045, 6, 4, "#1a1a22", M4.T(-.1, .32, .27)); g.sphere(.045, 6, 4, "#1a1a22", M4.T(.1, .32, .27));
        g.sphere(.03, 5, 3, "#e88a8a", M4.T(0, .22, .285));
        const hc = L.hair;
        if(L.style === "short"){ g.sphere(.33, 10, 6, hc, M4.mul(M4.T(0, .39, -.04), M4.S(1, .8, 1))); }
        else if(L.style === "long"){ g.sphere(.33, 10, 6, hc, M4.mul(M4.T(0, .4, -.04), M4.S(1, .85, 1))); g.box(.62, .6, .16, hc, M4.T(0, -.15, -.2)); }
        else if(L.style === "spiky"){ g.sphere(.32, 8, 5, hc, M4.mul(M4.T(0, .4, -.03), M4.S(1, .7, 1))); for(let k = 0; k < 6; k++){ const a = k / 6 * Math.PI * 2; g.cyl(0, .09, .22, 5, hc, M4.mul(M4.T(Math.cos(a) * .2, .6, Math.sin(a) * .2 - .02), M4.mul(M4.RZ(-Math.cos(a) * .6), M4.RX(Math.sin(a) * .6)))); } }
        else if(L.style === "cap"){ g.cyl(.3, .34, .18, 10, L.accent, M4.T(0, .52, -.01), true); g.box(.4, .04, .26, L.accent, M4.T(0, .5, .26)); }
        else if(L.style === "bun"){ g.sphere(.33, 10, 6, hc, M4.mul(M4.T(0, .39, -.04), M4.S(1, .8, 1))); g.sphere(.14, 7, 5, hc, M4.T(0, .68, -.05)); }
        else if(L.style === "hat"){ g.cyl(.42, .42, .04, 12, L.accent, M4.T(0, .5, 0), true); g.cyl(.14, .26, .3, 10, L.accent, M4.T(0, .52, 0), true); }
    });
    const arm = (s) => mk((g) => { g.box(.16, .46, .17, L.shirt, M4.T(0, -.46, 0)); g.sphere(.095, 6, 4, L.skin, M4.T(0, -.52, 0)); });
    P.armL = arm(1); P.armR = arm(-1);
    P.shadow = mk((g) => { g.cyl(.42, .42, .01, 12, [0, 0, 0], M4.T(0, .02, 0)); });
    P.size = L.size;
    cache.set(key, P); return P;
}
// 影つきで描く。obj: {x,y,z,yaw,walk(0〜1),t,hop}
export function drawChar(R, P, o, opt){
    const sc = P.size || 1, op = opt || {};
    const sw = Math.sin(o.t * 9) * 0.75 * (o.walk || 0), bob = Math.abs(Math.cos(o.t * 9)) * .06 * (o.walk || 0) + (o.hop || 0);
    const idle = (o.walk || 0) < .05 ? Math.sin(o.t * 2) * .012 : 0;
    const root = M4.mul(M4.trs(o.x, o.y || 0, o.z, o.yaw || 0, sc), M4.id());
    const tint = op.tint || null;
    const part = (mesh, m) => R.draw(mesh, {m:M4.mul(root, m), tint});
    const hip = .5;
    part(P.legL, M4.mul(M4.T(-.14, hip + bob, 0), M4.RX(sw)));
    part(P.legR, M4.mul(M4.T(.14, hip + bob, 0), M4.RX(-sw)));
    part(P.torso, M4.T(0, hip + .28 + bob + idle, 0));
    part(P.head, M4.T(0, hip + .56 + bob + idle, 0));
    part(P.armL, M4.mul(M4.T(-.4, hip + .78 + bob, 0), M4.mul(M4.RX(-sw), M4.RZ(.08))));
    part(P.armR, M4.mul(M4.T(.4, hip + .78 + bob, 0), M4.mul(M4.RX(sw), M4.RZ(-.08))));
    if(!op.noShadow) R.draw(P.shadow, {m:M4.trs(o.x, (o.y || 0) + .01, o.z, 0, sc), mode:3, tint:[0, 0, 0, .28], blend:true, late:true});
    return bob;
}

// ---------- モンスター（キャンバスで描くので画像ファイル不要）----------
const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k); return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")"; };
export function monsterCanvas(kind, color){
    return canvasTex(256, 256, (x, w, h) => {
        x.clearRect(0, 0, w, h); x.lineJoin = "round"; x.lineWidth = 6; x.strokeStyle = "#1c1c2a";
        const eyes = (ex, ey, gap, r) => { for(const s of [-1, 1]){ x.fillStyle = "#fff"; x.beginPath(); x.arc(ex + s * gap, ey, r, 0, 7); x.fill(); x.lineWidth = 3; x.stroke(); x.fillStyle = "#1c1c2a"; x.beginPath(); x.arc(ex + s * gap + s * -2, ey + 2, r * .5, 0, 7); x.fill(); } x.lineWidth = 6; };
        const grad = (cx, cy, r) => { const g = x.createRadialGradient(cx - r * .3, cy - r * .4, r * .1, cx, cy, r * 1.1); g.addColorStop(0, shadeHex(color, 1.35)); g.addColorStop(1, shadeHex(color, .8)); return g; };
        if(kind === "slime"){
            x.fillStyle = grad(128, 170, 90); x.beginPath(); x.moveTo(36, 214); x.bezierCurveTo(20, 140, 80, 60, 128, 52); x.bezierCurveTo(176, 60, 236, 140, 220, 214); x.bezierCurveTo(180, 232, 76, 232, 36, 214); x.fill(); x.stroke();
            x.fillStyle = "rgba(255,255,255,.55)"; x.beginPath(); x.ellipse(92, 100, 18, 10, -.6, 0, 7); x.fill(); eyes(128, 150, 34, 15);
            x.fillStyle = "#1c1c2a"; x.beginPath(); x.arc(128, 188, 14, 0, Math.PI); x.fill();
        } else if(kind === "bat"){
            x.fillStyle = shadeHex(color, .85); for(const s of [-1, 1]){ x.beginPath(); x.moveTo(128, 120); x.quadraticCurveTo(128 + s * 110, 30, 128 + s * 118, 130); x.lineTo(128 + s * 84, 110); x.lineTo(128 + s * 62, 150); x.lineTo(128 + s * 36, 124); x.closePath(); x.fill(); x.stroke(); }
            x.fillStyle = grad(128, 140, 52); x.beginPath(); x.arc(128, 140, 52, 0, 7); x.fill(); x.stroke();
            x.fillStyle = shadeHex(color, .8); for(const s of [-1, 1]){ x.beginPath(); x.moveTo(128 + s * 30, 100); x.lineTo(128 + s * 44, 62); x.lineTo(128 + s * 54, 108); x.fill(); x.stroke(); }
            eyes(128, 134, 20, 11); x.fillStyle = "#fff"; x.beginPath(); x.moveTo(116, 166); x.lineTo(122, 180); x.lineTo(128, 166); x.fill(); x.beginPath(); x.moveTo(128, 166); x.lineTo(134, 180); x.lineTo(140, 166); x.fill();
        } else if(kind === "mushroom"){
            x.fillStyle = "#f3e6c8"; x.beginPath(); x.roundRect(88, 130, 80, 92, 24); x.fill(); x.stroke();
            x.fillStyle = grad(128, 112, 100); x.beginPath(); x.ellipse(128, 112, 108, 76, 0, Math.PI, 0); x.lineTo(236, 120); x.quadraticCurveTo(128, 150, 20, 120); x.closePath(); x.fill(); x.stroke();
            x.fillStyle = "rgba(255,255,255,.9)"; for(const [a, b, r] of [[80, 84, 14], [140, 66, 16], [190, 96, 12], [120, 108, 9]]){ x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
            eyes(128, 170, 20, 11); x.fillStyle = "#1c1c2a"; x.beginPath(); x.arc(128, 200, 8, 0, Math.PI); x.fill();
        } else if(kind === "ghost"){
            x.fillStyle = grad(128, 120, 90); x.beginPath(); x.moveTo(40, 220); x.lineTo(40, 110); x.bezierCurveTo(40, 30, 216, 30, 216, 110); x.lineTo(216, 220); x.lineTo(188, 200); x.lineTo(160, 224); x.lineTo(128, 200); x.lineTo(96, 224); x.lineTo(68, 200); x.closePath(); x.fill(); x.stroke();
            eyes(128, 120, 32, 16); x.fillStyle = "#1c1c2a"; x.beginPath(); x.ellipse(128, 170, 16, 22, 0, 0, 7); x.fill();
        } else if(kind === "golem"){
            x.fillStyle = grad(128, 140, 100); x.beginPath(); x.roundRect(60, 60, 136, 120, 22); x.fill(); x.stroke();
            for(const s of [-1, 1]){ x.beginPath(); x.roundRect(s < 0 ? 14 : 190, 90, 52, 100, 18); x.fill(); x.stroke(); x.beginPath(); x.roundRect(s < 0 ? 70 : 134, 176, 52, 56, 14); x.fill(); x.stroke(); }
            x.fillStyle = "#ffd24a"; for(const s of [-1, 1]){ x.beginPath(); x.rect(128 + s * 32 - 14, 92, 28, 16); x.fill(); x.stroke(); }
            x.fillStyle = "#1c1c2a"; x.fillRect(100, 140, 56, 10);
        } else { // dragon系（ボス用）
            x.fillStyle = grad(128, 140, 100); x.beginPath(); x.ellipse(128, 150, 80, 70, 0, 0, 7); x.fill(); x.stroke();
            x.beginPath(); x.moveTo(60, 100); x.lineTo(40, 40); x.lineTo(96, 80); x.fill(); x.stroke(); x.beginPath(); x.moveTo(196, 100); x.lineTo(216, 40); x.lineTo(160, 80); x.fill(); x.stroke();
            eyes(128, 130, 32, 16); x.fillStyle = "#fff"; for(let k = -2; k <= 2; k++){ x.beginPath(); x.moveTo(128 + k * 22 - 8, 180); x.lineTo(128 + k * 22, 202); x.lineTo(128 + k * 22 + 8, 180); x.fill(); }
        }
    });
}
