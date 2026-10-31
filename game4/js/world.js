"use strict";
// ===== マップ（JSON）→ 3Dの町・原っぱ・店内を組み立てる。当たり判定つき =====
import {Geo, M4, canvasTex} from "./gl.js";

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };

const texCache = new WeakMap();
export function getTex(R, name){
    let c = texCache.get(R); if(!c){ c = {}; texCache.set(R, c); }
    if(c[name]) return c[name];
    const noise = (x, w, h, base, cols, n, s) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for(let i = 0; i < n; i++){ x.fillStyle = cols[(Math.random() * cols.length) | 0]; x.fillRect(Math.random() * w, Math.random() * h, s, s); } };
    const mk = {
        grass: () => canvasTex(128, 128, (x, w, h) => { noise(x, w, h, "#6fbf5a", ["#5fae4c", "#80cf6a", "#68b854", "#8ad674"], 900, 2); for(let i = 0; i < 9; i++){ x.fillStyle = ["#fff2a0", "#ffb0c8", "#ffffff"][i % 3]; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }),
        cobble: () => canvasTex(128, 128, (x, w, h) => { x.fillStyle = "#d8c9a6"; x.fillRect(0, 0, w, h); for(let r = 0; r < 8; r++) for(let c = 0; c < 8; c++){ const ox = (r % 2) * 8; x.fillStyle = ["#cdbd98", "#e2d4b3", "#d3c3a0"][((r * 3 + c) % 3)]; x.fillRect(c * 16 + ox + 1, r * 16 + 1, 14, 14); } }),
        wood: () => canvasTex(128, 128, (x, w, h) => { for(let i = 0; i < 8; i++){ x.fillStyle = ["#c9915a", "#bd854f", "#d19c66"][i % 3]; x.fillRect(0, i * 16, w, 15); x.fillStyle = "rgba(60,30,10,.35)"; x.fillRect(0, i * 16 + 15, w, 1); } }),
        tile: () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#e9eef5"; x.fillRect(0, 0, w, h); x.fillStyle = "#d3dbe8"; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); }),
        dirt: () => canvasTex(128, 128, (x, w, h) => noise(x, w, h, "#b48a5a", ["#a77d4f", "#c19766", "#b0855a"], 700, 2)),
        water: () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#4aa8e8"; x.fillRect(0, 0, w, h); x.fillStyle = "rgba(255,255,255,.35)"; for(let i = 0; i < 14; i++) x.fillRect(Math.random() * w, Math.random() * h, 8, 1.5); })
    };
    c[name] = R.tex((mk[name] || mk.grass)(), {repeat:true}); return c[name];
}
export function textSign(R, text, bg, fg){
    return R.tex(canvasTex(256, 96, (x, w, h) => { x.fillStyle = bg || "#223a8a"; x.fillRect(0, 0, w, h); x.strokeStyle = "#ffd24a"; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8); x.fillStyle = fg || "#fff"; x.font = "bold 44px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, w / 2, h / 2 + 2, w - 24); }));
}

let skyMesh = null, skyR = null;
function skyDome(R, top, hor){
    const g = new Geo(); const seg = 16, rings = 8, r = 160;
    const cT = hexv(top), cH = hexv(hor); const idx = [];
    for(let j = 0; j <= rings; j++){ const p = j / rings * Math.PI / 2, row = []; for(let k = 0; k <= seg; k++){ const a = k / seg * Math.PI * 2; const t = Math.pow(j / rings, .8); const c = [cH[0] + (cT[0] - cH[0]) * t, cH[1] + (cT[1] - cH[1]) * t, cH[2] + (cT[2] - cH[2]) * t]; row.push(g.vert(null, [Math.cos(a) * Math.cos(p) * r, Math.sin(p) * r - 6, Math.sin(a) * Math.cos(p) * r], [0, -1, 0], c)); } idx.push(row); }
    for(let j = 0; j < rings; j++) for(let k = 0; k < seg; k++){ const a = idx[j][k], b = idx[j][k + 1], d = idx[j + 1][k], e = idx[j + 1][k + 1]; g.tri(a, b, d); g.tri(b, e, d); }
    // 雲
    const cl = new Geo(); for(let i = 0; i < 9; i++){ const a = i * 2.4, rr = 90 + (i % 3) * 14, y = 40 + (i % 4) * 9; for(let k = 0; k < 4; k++) cl.sphere(7 + (k % 2) * 3, 6, 4, [1, 1, 1], M4.mul(M4.T(Math.cos(a) * rr + k * 7, y + (k % 2) * 2, Math.sin(a) * rr), M4.S(1.6, .55, 1))); }
    return {dome:R.mesh(g), cloud:R.mesh(cl)};
}
const hexv = (c) => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];

export function buildWorld(R, def){
    const W = {def, id:def.id, name:def.name, colliders:[], circles:[], warps:def.warps || [], enc:def.enc || null, bounds:def.bounds || [-def.size[0] / 2 + 1, -def.size[1] / 2 + 1, def.size[0] / 2 - 1, def.size[1] / 2 - 1], parts:[], free:[], interior:!!def.interior};
    const sx = def.size[0], sz = def.size[1];
    const env = {fogC:hexv(def.sky ? def.sky[1] : "#9fc8f0"), fogNear:def.fog ? def.fog[0] : 34, fogFar:def.fog ? def.fog[1] : 100, light:def.light || [.45, .8, .4], amb:def.amb || [.52, .56, .7]};
    W.env = env;
    const addPart = (geo, opt) => { if(!geo.n) return; const m = R.mesh(geo); W.free.push(m); W.parts.push({mesh:m, opt:opt || {}}); };
    // 地面
    const gt = def.ground || "grass";
    const g = new Geo(); g.plane(sx + 60, sz + 60, [1, 1, 1], M4.T(0, 0, 0), (sx + 60) / 5, (sz + 60) / 5); addPart(g, {tex:getTex(R, gt), mode:1});
    // 道・床の敷石
    const pg = new Geo(); for(const p of (def.paths || [])){ const [x0, z0, x1, z1] = p; pg.plane(x1 - x0, z1 - z0, [1, 1, 1], M4.T((x0 + x1) / 2, .02, (z0 + z1) / 2), (x1 - x0) / 2.5, (z1 - z0) / 2.5); }
    addPart(pg, {tex:getTex(R, def.pathTex || "cobble"), mode:1});
    // 水たまり・池
    const wg = new Geo(); for(const w of (def.water || [])){ wg.plane(w[2] - w[0], w[3] - w[1], [1, 1, 1], M4.T((w[0] + w[2]) / 2, .04, (w[1] + w[3]) / 2), (w[2] - w[0]) / 3, (w[3] - w[1]) / 3); const cx = (w[0] + w[2]) / 2, cz = (w[1] + w[3]) / 2; W.circles.push([cx, cz, Math.min(w[2] - w[0], w[3] - w[1]) / 2]); }
    addPart(wg, {tex:getTex(R, "water"), mode:1, tint:[1, 1, 1, .88], blend:true});
    // 建物・棚
    const sg = new Geo(), signs = [];
    for(const b of (def.buildings || [])){
        const col = b.color || "#e8c9a0", roof = b.roof || "#b8433a"; const w = b.w, d = b.d, h = b.h || 3;
        sg.box(w, h, d, col, M4.T(b.x, 0, b.z)); W.colliders.push([b.x - w / 2, b.z - d / 2, b.x + w / 2, b.z + d / 2]);
        if(!def.interior && b.roof !== "none"){ const rh = b.rh || Math.max(1.6, Math.min(w, d) * .45); sg.cyl(0, 1, rh, 4, roof, M4.mul(M4.T(b.x, h, b.z), M4.mul(M4.RY(Math.PI / 4), M4.S(w * .78, 1, d * .78))), true); }
        const side = b.door || "s"; const dir = {s:[0, 1], n:[0, -1], e:[1, 0], w:[-1, 0]}[side]; const along = dir[0] ? [0, 1] : [1, 0];
        const fw = dir[0] ? d : w, off = (dir[0] ? w : d) / 2;
        const px = b.x + dir[0] * (off + .02), pz = b.z + dir[1] * (off + .02); const yaw = Math.atan2(dir[0], dir[1]);
        if(!b.nodoor){ sg.box(Math.min(1.4, fw * .3), 1.9, .12, "#5a3a22", M4.mul(M4.T(px, 0, pz), M4.RY(yaw))); sg.box(Math.min(1.7, fw * .36), .12, .2, "#7a5a3a", M4.mul(M4.T(px, 1.9, pz), M4.RY(yaw))); }
        if(!b.nowin && fw > 3 && h > 2.2) for(const s of [-1, 1]) sg.box(.9, .8, .1, "#ffe9a0", M4.mul(M4.T(px + along[0] * s * fw * .3, h * .45, pz + along[1] * s * fw * .3), M4.RY(yaw)));
        if(b.sign) signs.push({text:b.sign, x:px + dir[0] * .04, z:pz + dir[1] * .04, y:Math.min(h - .4, 2.9), yaw, w:Math.min(fw * .8, 4.2), bg:b.signBg});
    }
    addPart(sg, {mode:0});
    for(const s of signs){ const q = new Geo(); q.sprite(s.w, s.w * 96 / 256, [1, 1, 1], M4.mul(M4.T(s.x, s.y, s.z), M4.RY(s.yaw))); const m = R.mesh(q); W.free.push(m); const t = textSign(R, s.text, s.bg); W.parts.push({mesh:m, opt:{mode:2, tex:t}}); W.free.push({tex:t}); }
    // 木・草木
    const tg = new Geo();
    for(const t of (def.trees || [])){
        const s = t[2] || (.85 + hash(t[0], t[1]) * .5), kind = hash(t[1], t[0]) < .4;
        tg.cyl(.2 * s, .3 * s, 1.5 * s, 6, "#7a5230", M4.T(t[0], 0, t[1]));
        if(kind){ tg.sphere(1.35 * s, 8, 6, "#4fa045", M4.T(t[0], 2.5 * s, t[1])); tg.sphere(.9 * s, 7, 5, "#5cb552", M4.T(t[0] + .5 * s, 3.2 * s, t[1] - .2)); }
        else { tg.cyl(0, 1.6 * s, 2.2 * s, 7, "#3f8f4a", M4.T(t[0], 1.1 * s, t[1])); tg.cyl(0, 1.25 * s, 2 * s, 7, "#4aa254", M4.T(t[0], 2.3 * s, t[1])); }
        W.circles.push([t[0], t[1], .55 * s]);
    }
    for(const f of (def.flowers || [])){ for(let i = 0; i < (f[2] || 8); i++){ const a = hash(f[0] + i, f[1]) * 6.28, r = hash(f[1], f[0] + i * 3) * 2.2; const col = ["#ff7aa8", "#ffd24a", "#ffffff", "#9a7aff"][i % 4]; tg.cyl(0, .12, .28, 4, col, M4.T(f[0] + Math.cos(a) * r, 0, f[1] + Math.sin(a) * r)); } }
    for(const p of (def.props || [])){
        if(p.t === "fountain"){ tg.cyl(2.2, 2.4, .5, 14, "#c9ccd4", M4.T(p.x, 0, p.z), true); tg.cyl(1.9, 1.9, .06, 14, "#4aa8e8", M4.T(p.x, .46, p.z), true); tg.cyl(.35, .45, 1.4, 8, "#d9dce4", M4.T(p.x, .5, p.z), true); tg.sphere(.5, 8, 5, "#8fd0ff", M4.T(p.x, 2, p.z)); W.circles.push([p.x, p.z, 2.4]); }
        else if(p.t === "lamp"){ tg.cyl(.07, .1, 2.8, 6, "#3a3f4a", M4.T(p.x, 0, p.z)); tg.sphere(.28, 7, 5, "#fff2b0", M4.T(p.x, 2.95, p.z)); W.circles.push([p.x, p.z, .2]); }
        else if(p.t === "fence"){ const dx = p.x1 - p.x0, dz = p.z1 - p.z0, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 1.4)); for(let i = 0; i <= n; i++) tg.box(.12, .9, .12, "#8a5e38", M4.T(p.x0 + dx * i / n, 0, p.z0 + dz * i / n)); for(const hh of [.35, .7]) tg.box(len, .08, .08, "#9a6e48", M4.mul(M4.T((p.x0 + p.x1) / 2, hh, (p.z0 + p.z1) / 2), M4.RY(-Math.atan2(dz, dx)))); const hw = .15; W.colliders.push([Math.min(p.x0, p.x1) - hw, Math.min(p.z0, p.z1) - hw, Math.max(p.x0, p.x1) + hw, Math.max(p.z0, p.z1) + hw]); }
        else if(p.t === "box"){ tg.box(p.w || 1, p.h || 1, p.d || 1, p.color || "#c9915a", M4.mul(M4.T(p.x, 0, p.z), M4.RY(p.yaw || 0))); W.colliders.push([p.x - (p.w || 1) / 2, p.z - (p.d || 1) / 2, p.x + (p.w || 1) / 2, p.z + (p.d || 1) / 2]); }
        else if(p.t === "rock"){ tg.sphere(.8 * (p.s || 1), 6, 4, "#9a9aa6", M4.mul(M4.T(p.x, .3, p.z), M4.S(1, .65, 1))); W.circles.push([p.x, p.z, .7 * (p.s || 1)]); }
        else if(p.t === "bench"){ tg.box(1.6, .1, .5, "#9a6e48", M4.mul(M4.T(p.x, .45, p.z), M4.RY(p.yaw || 0))); tg.box(1.6, .5, .08, "#8a5e38", M4.mul(M4.T(p.x, .5, p.z - .22), M4.RY(p.yaw || 0))); }
    }
    addPart(tg, {mode:0});
    // 屋内の壁
    if(def.interior){
        const wg2 = new Geo(), wc = def.wall || "#e8dcc4", [x0, z0, x1, z1] = W.bounds; const t = .6, H = 4.2;
        wg2.box(x1 - x0 + 2, H, t, wc, M4.T((x0 + x1) / 2, 0, z0 - t / 2)); wg2.box(t, H, z1 - z0, wc, M4.T(x0 - t / 2, 0, (z0 + z1) / 2)); wg2.box(t, H, z1 - z0, wc, M4.T(x1 + t / 2, 0, (z0 + z1) / 2));
        addPart(wg2, {mode:0});
    }
    // ワープ位置の目印（光る輪）
    const mg = new Geo(); for(const w of W.warps){ mg.cyl(w.r || 1.2, w.r || 1.2, .05, 16, "#ffe680", M4.T(w.x, .05, w.z)); }
    addPart(mg, {mode:3, tint:[1, .95, .55, .55], blend:true});
    // 空
    if(!def.interior){ if(!skyMesh || skyR !== R || def.sky.join() !== skyMesh.key){ skyMesh = skyDome(R, def.sky[0], def.sky[1]); skyMesh.key = def.sky.join(); skyR = R; } W.sky = skyMesh; }
    W.draw = (cam) => {
        if(W.sky){ const m = M4.T(cam.eye[0], cam.eye[1], cam.eye[2]); R.draw(W.sky.dome, {m, mode:3, nodepth:true, cull:false}); R.draw(W.sky.cloud, {m, mode:3, tint:[1, 1, 1, .85], blend:true}); }
        for(const p of W.parts) R.draw(p.mesh, p.opt);
    };
    W.dispose = () => { for(const f of W.free){ if(f.vao) R.free(f); else if(f.tex) R.freeTex(f.tex); } W.free = []; W.parts = []; };
    // 当たり判定：円(r)で移動。軸ごとに試す
    const hit = (x, z, r) => {
        const [bx0, bz0, bx1, bz1] = W.bounds; if(x < bx0 + r || x > bx1 - r || z < bz0 + r || z > bz1 - r) return true;
        for(const c of W.colliders){ if(x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r) return true; }
        for(const c of W.circles){ const dx = x - c[0], dz = z - c[1]; if(dx * dx + dz * dz < (c[2] + r) * (c[2] + r)) return true; }
        return false;
    };
    W.hit = hit;
    W.move = (x, z, dx, dz, r) => { let nx = x, nz = z; if(!hit(x + dx, z, r)) nx = x + dx; if(!hit(nx, z + dz, r)) nz = z + dz; return [nx, nz]; };
    W.freeSpot = (x, z) => { if(!hit(x, z, .4)) return [x, z]; for(let rr = .8; rr < 6; rr += .6) for(let a = 0; a < 6.28; a += .7){ const nx = x + Math.cos(a) * rr, nz = z + Math.sin(a) * rr; if(!hit(nx, nz, .4)) return [nx, nz]; } return [x, z]; };
    return W;
}

// 戦闘の背景（地面・空・遠くの木）。buildWorld を流用する
export function buildBackdrop(R, kind){
    const indoor = kind === "store";
    const trees = [];
    if(!indoor){
        // 二重の森(手前は低く疎ら、奥は高く密)。戦場(中央)は空ける
        for(let i = 0; i < 46; i++){ const a = i / 46 * 6.28 + hash(i, 3) * .2, r = 11 + hash(i, 7) * 16; const x = Math.cos(a) * r * 1.25, z = -Math.abs(Math.sin(a)) * r - 4; if(Math.sin(a) > -0.25 || Math.abs(x) < 4.5 && z > -10) continue; trees.push([x, z, .9 + hash(i, 11) * .9]); }
        for(let i = 0; i < 14; i++){ const x = (i < 7 ? -1 : 1) * (7 + hash(i, 5) * 9), z = 4 + hash(i, 9) * 8; trees.push([x, z, 1.0 + hash(i, 2) * .8]); }
    }
    const flowers = [], props = [];
    if(!indoor){ for(let i = 0; i < 20; i++) flowers.push([(hash(i, 21) - .5) * 30, 7 - hash(i, 23) * 24, 5 + (i % 5)]); for(let i = 0; i < 7; i++) props.push({t:"rock", x:(hash(i, 31) - .5) * 26, z:-6 - hash(i, 33) * 8, s:.6 + hash(i, 35) * .8}); }
    const def = indoor
        ? {id:"bt", name:"", size:[40, 30], interior:true, bounds:[-14, -9, 14, 14], ground:"wood", sky:["#2a2a4a", "#2c2a46"], fog:[24, 60], light:[.3, .9, .3], amb:[.6, .56, .68]}
        : {id:"bt", name:"", size:[80, 80], ground:kind === "street" ? "cobble" : "grass", sky:["#2f78d8", "#d4eefa"], fog:[22, 64], trees, flowers, props, light:[.55, .75, .35], amb:[.58, .62, .74],
           paths:[[-2.2, -4, 2.2, 14]], pathTex:"dirt"};
    const w = buildWorld(R, def); w.colliders = []; w.circles = [];
    if(!indoor){
        // 草の房(戦場の周囲)と、木漏れ日の光の筋・舞う光の粒
        const gg = new Geo(); for(let i = 0; i < 260; i++){ const x = (hash(i, 41) - .5) * 40, z = 9 - hash(i, 43) * 34; if(Math.abs(x) < 2.4 && z > -4) continue; const h = .25 + hash(i, 45) * .4; const c = i % 3 ? "#58b04a" : "#7cc858"; for(let k = 0; k < 3; k++) gg.cyl(0, .05, h, 3, c, M4.mul(M4.T(x + (k - 1) * .06, 0, z), M4.RZ((k - 1) * .35))); }
        const gm = R.mesh(gg); w.free.push(gm); w.parts.push({mesh:gm, opt:{mode:0, cull:false}});
        const rg = new Geo(); for(let i = 0; i < 4; i++){ const x = -8 + i * 5 + hash(i, 51) * 2, z = -12 - hash(i, 53) * 5; rg.box(.35 + hash(i, 55) * .4, 22, .03, [1, .95, .7], M4.mul(M4.T(x, 8, z), M4.mul(M4.RZ(.42), M4.RY(.2 + i * .05)))); }
        const rm = R.mesh(rg); w.free.push(rm); const ropt = {mode:3, tint:[1, .95, .72, .03], blend:true, add:true, cull:false, nodepth:false};
        const pg2 = new Geo(); for(let i = 0; i < 40; i++) pg2.sphere(.05, 4, 3, [1, 1, .8], M4.T((hash(i, 61) - .5) * 16, .4 + hash(i, 63) * 4, 6 - hash(i, 65) * 14));
        const pm = R.mesh(pg2); w.free.push(pm); const popt = {mode:3, tint:[1, 1, .8, .55], blend:true, add:true};
        const base = w.draw; let tt = 0;
        w.draw = (cam) => { base(cam); tt += .016; ropt.tint[3] = .03 + Math.sin(tt * .8) * .012; if(R.w >= R.h) R.draw(rm, ropt); popt.tint[3] = .35 + Math.sin(tt * 2) * .2; R.draw(pm, Object.assign(popt, {m: M4.T(Math.sin(tt * .3) * .6, Math.sin(tt * .5) * .3, 0)})); };
    }
    return w;
}
