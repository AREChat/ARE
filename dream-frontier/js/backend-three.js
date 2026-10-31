// ===== 描画バックエンド②：Three.js（公式ファイルを vendor/three/ に おいた時だけ つかわれる）=====
//  !! この ファイルは Three.js が 手元に ない 環境で 書かれたため、実際の Three.js での 動作は 未検証です !!
//  動かない／エラーが出た場合は 自動的に WebGL2 版に きりかわり、理由が 診断画面に のこります。
import {T, source} from "./engine.js";          // ここで Three.js の 読みこみに しっぱいすると この import 自体が エラーになる
import {Geo} from "./gl.js";
import {texCanvas} from "./textures.js";
import {addPrim} from "./backend-gl2.js";

export async function create(canvas, opts){
    const o = opts || {};
    T.ColorManagement.enabled = true;
    const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: "high-performance"});
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(70, 1, .1, 500);
    camera.rotation.order = "YXZ";
    const hemi = new T.HemisphereLight(0xeaf3ff, 0x514337, .8), amb = new T.AmbientLight(0xffffff, .42), sun = new T.DirectionalLight(0xfff1d6, 1.45);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -88; sun.shadow.camera.right = 88; sun.shadow.camera.top = 88; sun.shadow.camera.bottom = -88; sun.shadow.camera.near = .5; sun.shadow.camera.far = 380; sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.00018; sun.shadow.normalBias = .025;
    scene.add(hemi, amb, sun, sun.target);
    const envCanvas = document.createElement("canvas"); envCanvas.width = 512; envCanvas.height = 256;
    const envCtx = envCanvas.getContext("2d"), envGrad = envCtx.createLinearGradient(0, 0, 0, 256);
    envGrad.addColorStop(0, "#718ebd"); envGrad.addColorStop(.48, "#d5d4d0"); envGrad.addColorStop(.56, "#ffe2a5"); envGrad.addColorStop(1, "#6e765f"); envCtx.fillStyle = envGrad; envCtx.fillRect(0, 0, 512, 256);
    const sunGlow = envCtx.createRadialGradient(368, 112, 2, 368, 112, 42); sunGlow.addColorStop(0, "rgba(255,246,218,.92)"); sunGlow.addColorStop(1, "rgba(255,223,164,0)"); envCtx.fillStyle = sunGlow; envCtx.fillRect(326, 70, 84, 84);
    const envMap = new T.CanvasTexture(envCanvas); envMap.mapping = T.EquirectangularReflectionMapping; envMap.colorSpace = T.SRGBColorSpace; envMap.needsUpdate = true;
    const texCache = {}; const tex = (n) => { if(texCache[n]) return texCache[n]; const t = new T.CanvasTexture(texCanvas(n)); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return texCache[n] = t; };
    const toGeom = (g) => {
        const bg = new T.BufferGeometry(), n = g.n, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
        const linear = (v) => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
        for(let i = 0; i < n; i++){ const k = i * 11; pos[i * 3] = g.v[k]; pos[i * 3 + 1] = g.v[k + 1]; pos[i * 3 + 2] = g.v[k + 2]; nor[i * 3] = g.v[k + 3]; nor[i * 3 + 1] = g.v[k + 4]; nor[i * 3 + 2] = g.v[k + 5]; col[i * 3] = linear(g.v[k + 6]); col[i * 3 + 1] = linear(g.v[k + 7]); col[i * 3 + 2] = linear(g.v[k + 8]); uv[i * 2] = g.v[k + 9]; uv[i * 2 + 1] = g.v[k + 10]; }
        bg.setAttribute("position", new T.BufferAttribute(pos, 3)); bg.setAttribute("normal", new T.BufferAttribute(nor, 3)); bg.setAttribute("color", new T.BufferAttribute(col, 3)); bg.setAttribute("uv", new T.BufferAttribute(uv, 2));
        bg.setIndex(new T.BufferAttribute(n > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i), 1)); bg.computeBoundingSphere(); return bg;
    };
    const build = (prims) => { const g = new Geo(); for(const p of prims) addPrim(g, p); return g; };
    const mkMat = (L) => {
        const add = !!L.add, bl = add || !!L.blend, a = L.tint && L.tint[3] !== undefined ? L.tint[3] : 1;
        if(add){ const m = new T.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending, fog: true}); if(L.tint) m.color = new T.Color(L.tint[0], L.tint[1], L.tint[2]); return m; }
        const water = L.id === "water";
        return new T.MeshStandardMaterial({vertexColors: true, map: L.tex ? tex(L.tex) : null, transparent: bl, opacity: a, depthWrite: !bl, roughness: water ? .24 : .76, metalness: water ? .14 : .035, envMap, envMapIntensity: water ? .42 : .24});
    };
    const B = {name: "three", info: "Three.js r" + source.revision + "（" + source.used + "）", layers: [], protos: {}, pools: {}, sprites: [], used: 0};
    const root = new T.Group(); scene.add(root);
    B.resize = (w, h, scale) => { const s = scale || 1; renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(Math.max(2, Math.floor(w * s)), Math.max(2, Math.floor(h * s)), false); camera.aspect = w / h; camera.updateProjectionMatrix(); B.w = renderer.domElement.width; B.h = renderer.domElement.height; };
    B.getSize = () => [B.w || canvas.clientWidth, B.h || canvas.clientHeight];
    B.setScene = (sc) => {
        for(const l of B.layers){ root.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose(); } B.layers = [];
        for(const p of Object.values(B.pools)) for(const m of p){ root.remove(m); } for(const p of Object.values(B.protos)) p.mat.dispose(); B.pools = {}; B.protos = {};
        for(const L of sc.layers){ const g = build(L.prims); if(!g.n) continue; const mesh = new T.Mesh(toGeom(g), mkMat(L)); mesh.frustumCulled = false; mesh.castShadow = L.id === "solid"; mesh.receiveShadow = L.id === "solid" || L.id === "ground" || L.id === "paths" || L.id === "water"; if(L.add || L.blend) mesh.renderOrder = 2; root.add(mesh); B.layers.push({id: L.id, mesh, scroll: L.scroll, map: mesh.material.map}); }
        for(const [name, M] of Object.entries(sc.models)){ const g = build(M.prims); if(g.n) B.protos[name] = {geo: toGeom(g), mat: mkMat(M)}; }
    };
    B.setHidden = (id, h) => { for(const l of B.layers) if(l.id === id) l.mesh.visible = !h; };
    const smat = (n, add) => new T.SpriteMaterial({map: tex(n), transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending});
    B.frame = (cam, env, dyn, t) => {
        camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.position.set(cam.eye[0], cam.eye[1], cam.eye[2]); camera.rotation.set(cam.pitch, cam.yaw + Math.PI, 0, "YXZ");
        const c = new T.Color().setRGB(env.fog[0], env.fog[1], env.fog[2]), density = Math.max(.003, Math.min(.055, 1.4 / Math.max(1, env.far || 120))); scene.background = c; if(!scene.fog || !scene.fog.isFogExp2) scene.fog = new T.FogExp2(c, density); scene.fog.color.copy(c); scene.fog.density = density;
        amb.color.setRGB(env.amb[0], env.amb[1], env.amb[2]); amb.intensity = .48; hemi.color.setRGB(Math.min(1, env.amb[0] * 1.12), Math.min(1, env.amb[1] * 1.12), Math.min(1, env.amb[2] * 1.12)); hemi.groundColor.setRGB(env.amb[0] * .42, env.amb[1] * .34, env.amb[2] * .28); sun.color.setRGB(1, .94, .82); sun.intensity = 1.45;
        const light = env.light || [.4, .8, .45], lightLen = Math.hypot(light[0], light[1], light[2]) || 1, tx = cam.eye[0], tz = cam.eye[2]; sun.target.position.set(tx, 0, tz); sun.position.set(tx + light[0] / lightLen * 135, light[1] / lightLen * 135, tz + light[2] / lightLen * 135);
        for(const l of B.layers) if(l.scroll && l.map){ l.map.offset.set(t * l.scroll[0], t * l.scroll[1]); }
        for(const p of Object.values(B.pools)) for(const m of p) m.visible = false; for(const s of B.sprites) s.visible = false;
        const used = {}; let si = 0;
        for(const d of dyn){
            if(d.m){ const P = B.protos[d.m]; if(!P) continue; const pool = B.pools[d.m] || (B.pools[d.m] = []); const k = used[d.m] = (used[d.m] || 0) + 1; let m = pool[k - 1]; if(!m){ m = new T.Mesh(P.geo, P.mat); m.rotation.order = "YXZ"; m.frustumCulled = false; if(P.mat.transparent) m.renderOrder = 3; root.add(m); pool.push(m); }
                m.visible = true; m.position.set(d.x, d.y || 0, d.z); m.rotation.set(d.rx || 0, d.yaw || 0, 0, "YXZ"); m.scale.set(d.sx || 1, d.sy || 1, d.sz || 1); m.castShadow = !P.mat.transparent; m.receiveShadow = !P.mat.transparent; }
            else if(d.s){ let s = B.sprites[si++]; const key = d.s + (d.add !== false); if(!s){ s = new T.Sprite(smat(d.s, d.add !== false)); s.userData.key = key; root.add(s); B.sprites.push(s); } else if(s.userData.key !== key){ s.material.dispose(); s.material = smat(d.s, d.add !== false); s.userData.key = key; } const c2 = d.c || [1, 1, 1]; s.visible = true; s.position.set(d.x, d.y, d.z); s.scale.set(d.w || d.size || 1, d.h || d.size || 1, 1); s.renderOrder = 4; s.material.opacity = d.a === undefined ? .8 : d.a; s.material.color.setRGB(c2[0], c2[1], c2[2]); }
        }
        renderer.render(scene, camera);
    };
    B.renderer = renderer; return B;
}
