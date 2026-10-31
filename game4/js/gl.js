"use strict";
// ===== 自作の軽量3D描画（WebGL2・外部ライブラリなし）=====
// ここだけが描画の担当。将来 Three.js などに差し替える場合も、このファイルの入口（createRenderer / Geo / 行列）を置き換えればよい。

// ---------- 行列（列優先 mat4）----------
export const M4 = {
    id(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
    mul(a, b){
        const o = new Float32Array(16);
        for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++){
            o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
        }
        return o;
    },
    T(x, y, z){ const m = M4.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    S(x, y, z){ const m = M4.id(); m[0] = x; m[5] = y !== undefined ? y : x; m[10] = z !== undefined ? z : x; return m; },
    RY(a){ const c = Math.cos(a), s = Math.sin(a), m = M4.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    RX(a){ const c = Math.cos(a), s = Math.sin(a), m = M4.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    RZ(a){ const c = Math.cos(a), s = Math.sin(a), m = M4.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    persp(fovy, asp, n, f){
        const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
        m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
    },
    look(e, t, up){
        let zx = e[0]-t[0], zy = e[1]-t[1], zz = e[2]-t[2]; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
        let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
        const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
        const m = new Float32Array(16);
        m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
        m[12] = -(xx*e[0] + xy*e[1] + xz*e[2]); m[13] = -(yx*e[0] + yy*e[1] + yz*e[2]); m[14] = -(zx*e[0] + zy*e[1] + zz*e[2]); m[15] = 1; return m;
    },
    // 位置 + Y回転 + 一様スケール
    trs(x, y, z, ry, s){ const m = M4.RY(ry || 0); if(s !== undefined && s !== 1){ for(let i = 0; i < 12; i++) m[i] *= s; } m[12] = x; m[13] = y; m[14] = z; return m; }
};

// ---------- ジオメトリ（頂点色つき・結合できる）----------
const hex = (c) => (typeof c === "string" ? [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255] : c);
const shade = (c, k) => [Math.min(1, c[0]*k), Math.min(1, c[1]*k), Math.min(1, c[2]*k)];

export class Geo{
    constructor(){ this.v = []; this.i = []; this.n = 0; }
    _tf(m, p, n){
        if(!m) return [p, n];
        const x = p[0], y = p[1], z = p[2];
        return [[m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]],
                [m[0]*n[0] + m[4]*n[1] + m[8]*n[2], m[1]*n[0] + m[5]*n[1] + m[9]*n[2], m[2]*n[0] + m[6]*n[1] + m[10]*n[2]]];
    }
    vert(m, p, n, c, uv){
        const [pp, nn] = this._tf(m, p, n); const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        this.v.push(pp[0], pp[1], pp[2], nn[0]/l, nn[1]/l, nn[2]/l, c[0], c[1], c[2], uv ? uv[0] : 0, uv ? uv[1] : 0); return this.n++;
    }
    tri(a, b, c){ this.i.push(a, b, c); }
    quadf(m, p0, p1, p2, p3, n, c, uvs){ // 反時計回り p0,p1,p2,p3
        const u = uvs || [[0,0],[1,0],[1,1],[0,1]];
        const a = this.vert(m, p0, n, c, u[0]), b = this.vert(m, p1, n, c, u[1]), d = this.vert(m, p2, n, c, u[2]), e = this.vert(m, p3, n, c, u[3]);
        this.tri(a, b, d); this.tri(a, d, e);
    }
    // 底面中心が原点の直方体（y: 0〜h）
    box(sx, sy, sz, color, m, opt){
        const c = hex(color), x = sx/2, z = sz/2, h = sy, o = opt || {};
        const top = shade(c, o.top || 1.08), side = c, bot = shade(c, .7);
        this.quadf(m, [-x,h,z], [x,h,z], [x,h,-z], [-x,h,-z], [0,1,0], top);
        this.quadf(m, [-x,0,-z], [x,0,-z], [x,0,z], [-x,0,z], [0,-1,0], bot);
        this.quadf(m, [-x,0,z], [x,0,z], [x,h,z], [-x,h,z], [0,0,1], shade(side, .96));
        this.quadf(m, [x,0,-z], [-x,0,-z], [-x,h,-z], [x,h,-z], [0,0,-1], shade(side, .86));
        this.quadf(m, [x,0,z], [x,0,-z], [x,h,-z], [x,h,z], [1,0,0], shade(side, .9));
        this.quadf(m, [-x,0,-z], [-x,0,z], [-x,h,z], [-x,h,-z], [-1,0,0], shade(side, .8));
    }
    // y: 0〜h の円柱/円すい（上の半径 rt が 0 なら円すい）
    cyl(rt, rb, h, seg, color, m, cap){
        const c = hex(color); seg = seg || 8;
        const ring = (r, y, n, col) => { const ids = []; for(let k = 0; k <= seg; k++){ const a = k / seg * Math.PI * 2; ids.push(this.vert(m, [Math.cos(a)*r, y, Math.sin(a)*r], n(a), col, [k / seg, y / h])); } return ids; };
        const slope = (rb - rt) / (h || 1);
        const nf = (a) => [Math.cos(a), slope, Math.sin(a)];
        const bot = ring(rb, 0, nf, shade(c, .92)), top = ring(rt, h, nf, c);
        for(let k = 0; k < seg; k++){ this.tri(bot[k], bot[k+1], top[k+1]); this.tri(bot[k], top[k+1], top[k]); }
        if(cap && rt > 0){ const ctr = this.vert(m, [0,h,0], [0,1,0], shade(c, 1.1)); const t2 = ring(rt, h, () => [0,1,0], shade(c, 1.1)); for(let k = 0; k < seg; k++) this.tri(ctr, t2[k+1], t2[k]); }
        if(cap && rb > 0){ const ctr = this.vert(m, [0,0,0], [0,-1,0], shade(c, .6)); const b2 = ring(rb, 0, () => [0,-1,0], shade(c, .6)); for(let k = 0; k < seg; k++) this.tri(ctr, b2[k], b2[k+1]); }
    }
    sphere(r, seg, rings, color, m){
        const c = hex(color); seg = seg || 10; rings = rings || 6; const idx = [];
        for(let j = 0; j <= rings; j++){ const p = j / rings * Math.PI, row = []; for(let k = 0; k <= seg; k++){ const a = k / seg * Math.PI * 2; const nx = Math.sin(p)*Math.cos(a), ny = Math.cos(p), nz = Math.sin(p)*Math.sin(a); row.push(this.vert(m, [nx*r, ny*r, nz*r], [nx, ny, nz], c, [k / seg, j / rings])); } idx.push(row); }
        for(let j = 0; j < rings; j++) for(let k = 0; k < seg; k++){ const a = idx[j][k], b = idx[j][k+1], d = idx[j+1][k], e = idx[j+1][k+1]; this.tri(a, d, b); this.tri(b, d, e); }
    }
    // XZ平面の板（中心原点）。uvは (u,v) 繰り返し数
    plane(w, d, color, m, uvx, uvy){ const c = hex(color), x = w/2, z = d/2; this.quadf(m, [-x,0,z], [x,0,z], [x,0,-z], [-x,0,-z], [0,1,0], c, [[0,uvy||1],[uvx||1,uvy||1],[uvx||1,0],[0,0]]); }
    // XY平面の板（下端中心が原点・+Z向き）
    sprite(w, h, color, m){ const c = hex(color || [1,1,1]), x = w/2; this.quadf(m, [-x,0,0], [x,0,0], [x,h,0], [-x,h,0], [0,0,1], c, [[0,1],[1,1],[1,0],[0,0]]); }
    // 他のGeoを変換して追加
    add(g, m){ const base = this.n; for(let k = 0; k < g.v.length; k += 11){ this.vert(m, [g.v[k], g.v[k+1], g.v[k+2]], [g.v[k+3], g.v[k+4], g.v[k+5]], [g.v[k+6], g.v[k+7], g.v[k+8]], [g.v[k+9], g.v[k+10]]); } for(const t of g.i) this.i.push(t + base); }
}

// ---------- レンダラ ----------
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aUv;
uniform mat4 uVP; uniform mat4 uM; uniform vec3 uCam;
out vec3 vCol; out vec3 vNor; out vec2 vUv; out vec3 vW;
void main(){ vec4 w = uM * vec4(aPos, 1.0); gl_Position = uVP * w; vNor = mat3(uM) * aNor; vCol = aCol; vUv = aUv; vW = w.xyz; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vCol; in vec3 vNor; in vec2 vUv; in vec3 vW;
uniform vec3 uCam; uniform vec4 uTint; uniform sampler2D uTex; uniform int uMode; uniform vec3 uLight; uniform vec3 uAmb; uniform vec3 uFogC; uniform vec2 uFog; uniform float uCut; uniform vec2 uUvOff;
out vec4 o;
void main(){
  vec4 base = vec4(vCol, 1.0) * uTint;
  if(uMode == 1 || uMode == 2) base *= texture(uTex, vUv + uUvOff);
  if(base.a < uCut) discard;
  vec3 c = base.rgb;
  if(uMode < 2){
    vec3 n = normalize(vNor);
    float hl = dot(n, uLight) * 0.5 + 0.5;
    hl = mix(hl, floor(hl * 3.0 + 0.5) / 3.0, 0.35);
    c *= uAmb + (vec3(1.0) - uAmb) * hl;
  }
  if(uMode != 3){ float f = clamp((length(vW - uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0); c = mix(c, uFogC, f * f); }
  o = vec4(c, base.a);
}`;

export function createRenderer(canvas, opts){
    const gl = canvas.getContext("webgl2", {antialias:true, alpha:false, powerPreference:"high-performance", preserveDrawingBuffer:!!(opts && opts.keep)});
    if(!gl) return null;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const U = {}; ["uVP","uM","uCam","uTint","uTex","uMode","uLight","uAmb","uFogC","uFog","uCut","uUvOff"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.clearColor(.5, .7, 1, 1);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, white); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
    const R = {gl, canvas, scale:1, w:1, h:1, vp:null, cam:[0,0,0], env:{light:[.4,.8,.45], amb:[.5,.55,.68], fogC:[.6,.75,.95], fogNear:30, fogFar:90}, stats:{draws:0, tris:0}, queue:[], white};
    R.mesh = (g) => {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.v), gl.STATIC_DRAW);
        const big = g.n > 65535; const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(g.i) : new Uint16Array(g.i), gl.STATIC_DRAW);
        const st = 44; gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, st, 36);
        gl.bindVertexArray(null);
        return {vao, count:g.i.length, type:big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, vb, ib};
    };
    R.free = (m) => { if(!m) return; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); };
    R.tex = (src, opt) => {
        const o = opt || {}; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        const pot = (n) => (n & (n - 1)) === 0; const w = src.width || src.videoWidth, h = src.height || src.videoHeight;
        if(pot(w) && pot(h)){ gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.pixel ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR); }
        else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.pixel ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o.pixel ? gl.NEAREST : gl.LINEAR);
        const wrap = o.repeat && pot(w) && pot(h) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        return t;
    };
    R.freeTex = (t) => { if(t) gl.deleteTexture(t); };
    R.resize = (cssW, cssH, scale) => {
        R.scale = scale; const w = Math.max(2, Math.floor(cssW * scale)), h = Math.max(2, Math.floor(cssH * scale));
        if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
        R.w = w; R.h = h; gl.viewport(0, 0, w, h);
    };
    R.begin = (cam, env) => {
        if(env) R.env = Object.assign({}, R.env, env);
        const asp = R.w / R.h; const fov = cam.fov || 0.9;
        const proj = M4.persp(fov, asp, 0.1, 220); const view = M4.look(cam.eye, cam.target, [0,1,0]);
        R.vp = M4.mul(proj, view); R.view = view; R.cam = cam.eye; R.queue.length = 0; R.stats.draws = 0; R.stats.tris = 0;
        const e = R.env; gl.clearColor(e.fogC[0], e.fogC[1], e.fogC[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(prog); gl.uniformMatrix4fv(U.uVP, false, R.vp); gl.uniform3fv(U.uCam, R.cam);
        gl.uniform3fv(U.uLight, e.light); gl.uniform3fv(U.uAmb, e.amb); gl.uniform3fv(U.uFogC, e.fogC); gl.uniform2f(U.uFog, e.fogNear, e.fogFar);
        gl.uniform1i(U.uTex, 0); gl.uniform2f(U.uUvOff, 0, 0);
    };
    // opt: {m, tint:[r,g,b,a], tex, mode:0頂点色+光 1テクスチャ+光 2テクスチャ(光なし) 3色のみ, blend, cut, nodepth, uv:[x,y]}
    R.draw = (mesh, opt) => { if(mesh) R.queue.push([mesh, opt]); };
    const one = (mesh, o) => {
        gl.uniformMatrix4fv(U.uM, false, o.m || M4.id()); const t = o.tint || [1,1,1,1]; gl.uniform4f(U.uTint, t[0], t[1], t[2], t[3] === undefined ? 1 : t[3]);
        gl.uniform1i(U.uMode, o.mode || 0); gl.uniform1f(U.uCut, o.cut !== undefined ? o.cut : (o.blend ? 0.01 : 0.0));
        gl.uniform2f(U.uUvOff, o.uv ? o.uv[0] : 0, o.uv ? o.uv[1] : 0);
        gl.bindTexture(gl.TEXTURE_2D, o.tex || white);
        if(o.add) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if(o.cull === false) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
        gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0); R.stats.draws++; R.stats.tris += mesh.count / 3;
    };
    R.flush = () => {
        const op = [], bl = [];
        for(const q of R.queue){ (q[1] && (q[1].blend || q[1].late || q[1].add) ? bl : op).push(q); }
        gl.disable(gl.BLEND); gl.depthMask(true);
        for(const q of op){ const o = q[1] || {}; if(o.nodepth){ gl.disable(gl.DEPTH_TEST); gl.depthMask(false); } else { gl.enable(gl.DEPTH_TEST); gl.depthMask(true); } one(q[0], o); }
        gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.depthMask(false);
        const key = (q) => { const m = (q[1] && q[1].m) || null; return m ? -((m[12]-R.cam[0])**2 + (m[13]-R.cam[1])**2 + (m[14]-R.cam[2])**2) : 0; };
        bl.sort((a, b) => key(a) - key(b));
        for(const q of bl) one(q[0], q[1] || {});
        gl.depthMask(true); gl.disable(gl.BLEND); R.queue.length = 0;
    };
    // ワールド座標 → 画面(CSSピクセル)  {x,y,visible}
    R.project = (p, cssW, cssH) => {
        const m = R.vp; const x = p[0], y = p[1], z = p[2];
        const cx = m[0]*x + m[4]*y + m[8]*z + m[12], cy = m[1]*x + m[5]*y + m[9]*z + m[13], cw = m[3]*x + m[7]*y + m[11]*z + m[15];
        if(cw <= 0.01) return {x:0, y:0, visible:false};
        return {x:(cx / cw * .5 + .5) * cssW, y:(1 - (cy / cw * .5 + .5)) * cssH, visible:true};
    };
    return R;
}

// ---------- キャンバスで作る簡易テクスチャ ----------
export function canvasTex(w, h, draw){ const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; }
