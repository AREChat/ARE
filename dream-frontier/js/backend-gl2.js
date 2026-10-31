// ===== 描画バックエンド①：外部ライブラリなしの WebGL2（自作 gl.js）=====
//  Three.js が 使えない時の 代替として そのまま ゲームが うごく。
import {createRenderer, M4, Geo} from "./gl.js";
import {texCanvas} from "./textures.js";

const mat = (p) => { let m = M4.T(p.x || 0, p.y || 0, p.z || 0); if(p.ry) m = M4.mul(m, M4.RY(p.ry)); if(p.rx) m = M4.mul(m, M4.RX(p.rx)); if(p.rz) m = M4.mul(m, M4.RZ(p.rz)); return m; };
export function addPrim(g, p){
    const m = mat(p), c = p.c || "#ffffff";
    if(p.t === "b") g.box(p.w, p.h, p.d, c, m);
    else if(p.t === "c") g.cyl(p.rt, p.rb === undefined ? p.rt : p.rb, p.h, p.seg || 8, c, m, true);
    else if(p.t === "s") g.sphere(p.r, p.seg || 8, p.rings || 5, c, (p.sx || p.sy || p.sz) ? M4.mul(m, M4.S(p.sx || 1, p.sy || 1, p.sz || 1)) : m);
    else if(p.t === "p") g.plane(p.w, p.d, c, m, p.ux || 1, p.uy || 1);
}
export async function create(canvas, opts){
    const o = opts || {};
    const R = createRenderer(canvas, {keep: !!o.keep});
    if(!R){ const e = new Error("WebGL2 を 取得できませんでした（この ブラウザ／端末では 3D が 使えません）"); e.code = "NO_WEBGL2"; throw e; }
    const texCache = {}; const tex = (n) => texCache[n] || (texCache[n] = R.tex(texCanvas(n), {repeat: true}));
    const sg = new Geo(); sg.sprite(1, 1, [1, 1, 1], M4.id()); const spr = R.mesh(sg);
    const B = {name: "webgl2", info: "自作 WebGL2（外部ライブラリなし）", R, layers: [], models: {}, spr};
    B.resize = (w, h, scale) => R.resize(w, h, scale);
    B.getSize = () => [R.w, R.h];
    const build = (prims) => { const g = new Geo(); for(const p of prims) addPrim(g, p); return g; };
    B.setScene = (scene) => {
        for(const l of B.layers) R.free(l.mesh); for(const k of Object.keys(B.models)) R.free(B.models[k].mesh); B.layers = []; B.models = {};
        for(const L of scene.layers){ const g = build(L.prims); if(!g.n) continue; B.layers.push({id: L.id, mesh: R.mesh(g), hidden: !!L.hidden, scroll: L.scroll, opt: {mode: L.tex ? 1 : 0, tex: L.tex ? tex(L.tex) : undefined, tint: L.tint, blend: !!(L.blend || L.add), add: !!L.add, cull: L.cull}}); }
        for(const [name, M] of Object.entries(scene.models)){ const g = build(M.prims); if(g.n) B.models[name] = {mesh: R.mesh(g), opt: {mode: 0, tint: M.tint, blend: !!(M.blend || M.add), add: !!M.add}}; }
    };
    B.setHidden = (id, hidden) => { for(const l of B.layers) if(l.id === id) l.hidden = !!hidden; };
    B.frame = (cam, env, dyn, t) => {
        const cp = Math.cos(cam.pitch), eye = cam.eye; const tgt = [eye[0] + Math.sin(cam.yaw) * cp, eye[1] + Math.sin(cam.pitch), eye[2] + Math.cos(cam.yaw) * cp];
        R.begin({eye, target: tgt, fov: cam.fov * Math.PI / 180}, {fogC: env.fog, fogNear: env.near, fogFar: env.far, amb: env.amb, light: env.light});
        for(const l of B.layers){ if(l.hidden) continue; R.draw(l.mesh, l.scroll ? Object.assign({}, l.opt, {uv: [t * l.scroll[0], t * l.scroll[1]]}) : l.opt); }
        for(const d of dyn){
            if(d.m){ const M = B.models[d.m]; if(!M) continue; let m = M4.T(d.x, d.y || 0, d.z); if(d.yaw) m = M4.mul(m, M4.RY(d.yaw)); if(d.rx) m = M4.mul(m, M4.RX(d.rx)); if(d.sx || d.sy || d.sz) m = M4.mul(m, M4.S(d.sx || 1, d.sy || 1, d.sz || 1)); R.draw(M.mesh, Object.assign({}, M.opt, {m})); }
            else if(d.s){ const face = Math.atan2(eye[0] - d.x, eye[2] - d.z), w = d.w || d.size || 1, h = d.h || d.size || 1, c = d.c || [1, 1, 1]; R.draw(spr, {m: M4.mul(M4.T(d.x, d.y - h / 2, d.z), M4.mul(M4.RY(face), M4.S(w, h, 1))), tex: tex(d.s), mode: 2, add: d.add !== false, blend: d.add === false, tint: [c[0], c[1], c[2], d.a === undefined ? .8 : d.a]}); }
        }
        R.flush();
    };
    return B;
}
