import * as T from "../dream-frontier/vendor/three/build/three.module.js";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const srgbToLinear = (v) => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createThreeRenderer(canvas, opts){
    T.ColorManagement.enabled = true;
    const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!(opts && opts.keep)});
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(52, 1, .1, 300);
    camera.up.set(0, 1, 0);
    const hemisphere = new T.HemisphereLight(0xe9f3ff, 0x62503c, .78);
    const ambient = new T.AmbientLight(0xffffff, .48);
    const sun = new T.DirectionalLight(0xfff1d4, 1.45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -92;
    sun.shadow.camera.right = 92;
    sun.shadow.camera.top = 92;
    sun.shadow.camera.bottom = -92;
    sun.shadow.camera.near = .5;
    sun.shadow.camera.far = 360;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -.00018;
    sun.shadow.normalBias = .025;
    scene.add(hemisphere, ambient, sun, sun.target);
    const environmentCanvas = document.createElement("canvas");
    environmentCanvas.width = 512;
    environmentCanvas.height = 256;
    const environmentContext = environmentCanvas.getContext("2d");
    const environmentGradient = environmentContext.createLinearGradient(0, 0, 0, 256);
    environmentGradient.addColorStop(0, "#718ebd");
    environmentGradient.addColorStop(.48, "#d5d4d0");
    environmentGradient.addColorStop(.56, "#ffe2a5");
    environmentGradient.addColorStop(1, "#6e765f");
    environmentContext.fillStyle = environmentGradient;
    environmentContext.fillRect(0, 0, 512, 256);
    const sunGlow = environmentContext.createRadialGradient(368, 112, 2, 368, 112, 42);
    sunGlow.addColorStop(0, "rgba(255,246,218,.92)");
    sunGlow.addColorStop(1, "rgba(255,223,164,0)");
    environmentContext.fillStyle = sunGlow;
    environmentContext.fillRect(326, 70, 84, 84);
    const environmentMap = new T.CanvasTexture(environmentCanvas);
    environmentMap.mapping = T.EquirectangularReflectionMapping;
    environmentMap.colorSpace = T.SRGBColorSpace;
    environmentMap.needsUpdate = true;
    const textureIds = new WeakMap();
    const textures = new WeakMap();
    let nextTextureId = 1;
    const textureId = (texture) => {
        if(!texture) return 0;
        if(!textureIds.has(texture)) textureIds.set(texture, nextTextureId++);
        return textureIds.get(texture);
    };
    const sceneTexture = (src, opt) => {
        const o = opt || {};
        let records = textures.get(src);
        if(!records){ records = new Map(); textures.set(src, records); }
        const key = [!!o.repeat, !!o.pixel].join(":");
        if(records.has(key)) return records.get(key);
        const texture = new T.CanvasTexture(src);
        texture.colorSpace = T.SRGBColorSpace;
        texture.flipY = false;   // 旧WebGL描画(UNPACK_FLIP_Y=false)と同じ向き。これが無いと 看板の文字などが さかさまになる
        texture.wrapS = texture.wrapT = o.repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
        texture.magFilter = o.pixel ? T.NearestFilter : T.LinearFilter;
        texture.minFilter = o.pixel ? T.NearestMipmapNearestFilter : T.LinearMipmapLinearFilter;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        texture.userData.cacheSource = src;
        texture.userData.cacheKey = key;
        records.set(key, texture);
        textureId(texture);
        return texture;
    };
    const makeMaterial = (o) => {
        const mode = o.mode || 0;
        const blended = !!(o.blend || o.add || o.late);
        const texture = o.tex && mode !== 3 ? o.tex.clone() : null;
        if(texture){ texture.needsUpdate = true; }
        const common = {
            color: 0xffffff,
            vertexColors: true,
            map: texture,
            transparent: blended,
            opacity: 1,
            depthWrite: !blended && !o.nodepth,
            depthTest: !o.nodepth,
            alphaTest: o.cut || 0,
            side: o.cull === false ? T.DoubleSide : T.FrontSide,
            fog: mode !== 3
        };
        const material = mode < 2 ? new T.MeshStandardMaterial(Object.assign(common, {roughness: .76, metalness: .035, envMap: environmentMap, envMapIntensity: .24})) : new T.MeshBasicMaterial(common);
        material.blending = o.add ? T.AdditiveBlending : T.NormalBlending;
        return material;
    };
    const drawPool = [];
    const R = {
        name: "three",
        renderer,
        gl: renderer.getContext(),
        canvas,
        scene,
        camera,
        scale: 1,
        w: 1,
        h: 1,
        cssW: 1,
        cssH: 1,
        cam: [0, 0, 0],
        env: {light: [.4, .8, .45], amb: [.5, .55, .68], fogC: [.6, .75, .95], fogNear: 30, fogFar: 90},
        stats: {draws: 0, tris: 0},
        queue: [],
        mesh(g){
            const count = g.n;
            const positions = new Float32Array(count * 3);
            const normals = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const uvs = new Float32Array(count * 2);
            for(let i = 0; i < count; i++){
                const source = i * 11, vertex = i * 3, uv = i * 2;
                positions[vertex] = g.v[source]; positions[vertex + 1] = g.v[source + 1]; positions[vertex + 2] = g.v[source + 2];
                normals[vertex] = g.v[source + 3]; normals[vertex + 1] = g.v[source + 4]; normals[vertex + 2] = g.v[source + 5];
                colors[vertex] = srgbToLinear(g.v[source + 6]); colors[vertex + 1] = srgbToLinear(g.v[source + 7]); colors[vertex + 2] = srgbToLinear(g.v[source + 8]);
                uvs[uv] = g.v[source + 9]; uvs[uv + 1] = g.v[source + 10];
            }
            const geometry = new T.BufferGeometry();
            geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
            geometry.setAttribute("normal", new T.BufferAttribute(normals, 3));
            geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
            geometry.setAttribute("uv", new T.BufferAttribute(uvs, 2));
            geometry.setIndex(new T.BufferAttribute(count > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i), 1));
            geometry.computeBoundingSphere();
            return {vao: true, geometry, count: g.i.length};
        },
        free(mesh){ if(mesh && mesh.geometry){ mesh.geometry.dispose(); mesh.vao = null; } },
        tex(src, opt){ return sceneTexture(src, opt); },
        freeTex(texture){ if(texture){ texture.dispose(); const records = textures.get(texture.userData.cacheSource); if(records) records.delete(texture.userData.cacheKey); } },
        resize(cssW, cssH, scale){
            R.scale = scale || 1;
            R.cssW = cssW;
            R.cssH = cssH;
            renderer.setPixelRatio(window.devicePixelRatio || 1);
            renderer.setSize(Math.max(2, Math.floor(cssW * R.scale)), Math.max(2, Math.floor(cssH * R.scale)), false);
            R.w = canvas.width;
            R.h = canvas.height;
            camera.aspect = cssW / Math.max(1, cssH);
            camera.updateProjectionMatrix();
        },
        begin(cam, env){
            if(env) R.env = Object.assign({}, R.env, env);
            const e = R.env, eye = cam.eye || [0, 0, 0], target = cam.target || [0, 0, 0];
            camera.fov = clamp((cam.fov || .9) * 180 / Math.PI, 24, 110);
            camera.aspect = R.cssW / Math.max(1, R.cssH);
            camera.position.set(eye[0], eye[1], eye[2]);
            camera.lookAt(target[0], target[1], target[2]);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            R.view = camera.matrixWorldInverse.elements;
            const fogColor = new T.Color().setRGB(e.fogC[0], e.fogC[1], e.fogC[2]);
            scene.background = fogColor;
            const density = clamp(1.4 / Math.max(1, e.fogFar || 120), .003, .055);
            if(!scene.fog || !scene.fog.isFogExp2) scene.fog = new T.FogExp2(fogColor, density);
            scene.fog.color.copy(fogColor);
            scene.fog.density = density;
            ambient.color.setRGB(e.amb[0], e.amb[1], e.amb[2]);
            hemisphere.color.setRGB(clamp(e.amb[0] * 1.12, 0, 1), clamp(e.amb[1] * 1.12, 0, 1), clamp(e.amb[2] * 1.12, 0, 1));
            hemisphere.groundColor.setRGB(e.amb[0] * .42, e.amb[1] * .34, e.amb[2] * .28);
            const light = e.light || [.4, .8, .45], length = Math.hypot(light[0], light[1], light[2]) || 1;
            sun.target.position.set(target[0], 0, target[2]);
            sun.position.set(target[0] + light[0] / length * 135, light[1] / length * 135, target[2] + light[2] / length * 135);
            for(const draw of drawPool) draw.visible = false;
            R.cam = eye;
            R.queue.length = 0;
            R.stats.draws = 0;
            R.stats.tris = 0;
        },
        draw(mesh, opt){ if(mesh) R.queue.push([mesh, opt || {}]); },
        flush(){
            const opaque = [], transparent = [];
            for(const item of R.queue){ const o = item[1]; (o.blend || o.add || o.late ? transparent : opaque).push(item); }
            const distance = (item) => { const m = item[1].m; if(!m) return 0; const x = m[12] - R.cam[0], y = m[13] - R.cam[1], z = m[14] - R.cam[2]; return x * x + y * y + z * z; };
            transparent.sort((a, b) => distance(b) - distance(a));
            const items = opaque.concat(transparent);
            for(let i = 0; i < items.length; i++){
                const [source, o] = items[i];
                let draw = drawPool[i];
                if(!draw){ draw = new T.Mesh(); draw.matrixAutoUpdate = false; draw.frustumCulled = false; scene.add(draw); drawPool.push(draw); }
                draw.geometry = source.geometry;
                const key = [o.mode || 0, !!(o.blend || o.add || o.late), !!o.add, !!o.nodepth, o.cut || 0, o.cull === false ? 1 : 0, textureId(o.tex)].join("|");
                if(draw.userData.materialKey !== key){ if(draw.material) draw.material.dispose(); draw.material = makeMaterial(o); draw.userData.materialKey = key; }
                const tint = o.tint || [1, 1, 1, 1];
                draw.material.color.setRGB(tint[0], tint[1], tint[2]);
                draw.material.opacity = tint[3] === undefined ? 1 : tint[3];
                draw.material.alphaTest = o.cut || 0;
                if(draw.material.map){ const uv = o.uv || [0, 0]; draw.material.map.offset.set(uv[0], uv[1]); }
                draw.matrix.fromArray(o.m || IDENTITY);
                draw.matrixWorldNeedsUpdate = true;
                draw.visible = true;
                draw.castShadow = !(o.blend || o.add || o.late || (o.mode || 0) > 1);
                draw.receiveShadow = !(o.blend || o.add || o.late || (o.mode || 0) > 1);
                draw.renderOrder = o.add ? 3 : o.blend || o.late ? 2 : 0;
                R.stats.draws++;
                R.stats.tris += source.count / 3;
            }
            R.queue.length = 0;
            renderer.render(scene, camera);
        },
        project(point, cssW, cssH){
            const projected = new T.Vector3(point[0], point[1], point[2]).project(camera);
            const visible = projected.z >= -1 && projected.z <= 1;
            return {x: (projected.x * .5 + .5) * cssW, y: (1 - (projected.y * .5 + .5)) * cssH, visible};
        }
    };
    return R;
}
