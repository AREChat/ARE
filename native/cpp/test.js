"use strict";
// C++（WASM）が、本物の JS の計算と同じ結果か／当たり判定が総当たりと同じか／速さ、を調べる
//   node native/cpp/test.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
const AREFast = require(path.join(ROOT, "chat-fast.js"));
let pass = 0, fail = 0;
function check(name, ok, note) { if (ok) pass++; else fail++; console.log((ok ? "OK  " : "NG  ") + name + (note ? " : " + note : "")); }

// 本物の JS の計算（chat-imgedit.js の ieApplyFilter を、そのまま取り出して使う）
const src = fs.readFileSync(path.join(ROOT, "chat-imgedit.js"), "utf8");
const m = src.match(/function ieApplyFilter\(name, r, g, b\)\{[\s\S]*?\n\}/);
if (!m) { console.log("NG  chat-imgedit.js から ieApplyFilter が取り出せません"); process.exit(1); }
const ieApplyFilter = vm.runInNewContext("(" + m[0].replace(/^function ieApplyFilter/, "function") + ")");
const FILTERS = ["none", "sepia", "vivid", "fade", "warm", "cool", "invert", "vintage"];   // chat-imgedit.js の IE_FILTERS と同じ順
check("フィルター名の並びが chat-imgedit.js と同じ", /const IE_FILTERS = \[\["none"[^\n]*\["sepia"[^\n]*\["vivid"[^\n]*\["fade"[^\n]*\["warm"[^\n]*\["cool"[^\n]*\["invert"[^\n]*\["vintage"/.test(src));
function jsAdjust(px, bright, contrast, gray, filter) {   // chat-imgedit.js renderEdit の中の計算と同じ
    const c = contrast * 2.55, f = (259 * (c + 255)) / (255 * (259 - c)), add = bright * 2.55;
    for (let i = 0; i < px.length; i += 4) {
        let r = px[i], g = px[i + 1], b = px[i + 2];
        if (gray) { r = g = b = 0.299 * r + 0.587 * g + 0.114 * b; }
        if (filter && filter !== "none") { const o = ieApplyFilter(filter, r, g, b); r = o[0]; g = o[1]; b = o[2]; }
        px[i] = Math.max(0, Math.min(255, f * (r - 128) + 128 + add));
        px[i + 1] = Math.max(0, Math.min(255, f * (g - 128) + 128 + add));
        px[i + 2] = Math.max(0, Math.min(255, f * (b - 128) + 128 + add));
    }
}
let seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function randPixels(n) { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < a.length; i++) a[i] = Math.floor(rnd() * 256); return a; }
function sameBytes(a, b) { if (a.length !== b.length) return -1; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return null; }

(async () => {
    const ok = await AREFast.load(path.join(ROOT, "are-fast.wasm"));
    check("wasm が読みこめる", ok === true && AREFast.ready());
    if (!ok) process.exit(1);

    // ---- 1) 写真の色づけ：1画素も違わない ----
    {
        let bad = null, runs = 0;
        const base = randPixels(30000);
        for (let fi = 0; fi < FILTERS.length && !bad; fi++) for (const gray of [false, true]) for (const bright of [-100, -37, 0, 12.5, 100]) for (const contrast of [-100, -55, 0, 20, 99, 100]) {
            const a = new Uint8ClampedArray(base), img = { data: new Uint8ClampedArray(base) };
            jsAdjust(a, bright, contrast, gray, FILTERS[fi]);
            AREFast.adjust(img, bright, contrast, gray, fi); runs++;
            const d = sameBytes(a, img.data);
            if (d !== null) { bad = "filter=" + FILTERS[fi] + " gray=" + gray + " bright=" + bright + " contrast=" + contrast + " 位置=" + d + " js=" + a[d] + " wasm=" + img.data[d]; break; }
        }
        check("写真の色づけ：JS と1画素も違わない（" + runs + " 通り × 3万画素）", !bad, bad);
    }
    // ---- 2) スタンプの背景消し ----
    {
        let bad = null;
        for (const t of [0, 1, 100, 215, 255, 256]) {
            const a = randPixels(20000); for (let i = 0; i < a.length; i += 12) { a[i] = a[i + 1] = a[i + 2] = 200 + (i % 56); }
            const img = { data: new Uint8ClampedArray(a) };
            for (let i = 0; i < a.length; i += 4) { if (a[i] >= t && a[i + 1] >= t && a[i + 2] >= t) a[i + 3] = 0; }   // chat-draw.js stpDraw と同じ
            AREFast.removeLight(img, t);
            if (sameBytes(a, img.data) !== null) { bad = "t=" + t; break; }
        }
        check("背景（白）消し：JS と1画素も違わない", !bad, bad);
    }
    // ---- 3) 縮小（面積平均）----
    {
        function jsResize(src, sw, sh, dw, dh) {
            const out = new Uint8ClampedArray(dw * dh * 4), xs = sw / dw, ys = sh / dh;
            for (let y = 0; y < dh; y++) { const y0 = y * ys, y1 = y0 + ys; let iy0 = Math.trunc(y0), iy1 = Math.trunc(y1); if (iy1 >= sh) iy1 = sh - 1;
                for (let x = 0; x < dw; x++) { const x0 = x * xs, x1 = x0 + xs; let ix0 = Math.trunc(x0), ix1 = Math.trunc(x1); if (ix1 >= sw) ix1 = sw - 1;
                    let r = 0, g = 0, b = 0, a = 0, ws = 0;
                    for (let yy = iy0; yy <= iy1; yy++) { const wy = Math.min(yy + 1, y1) - Math.max(yy, y0); if (wy <= 0) continue;
                        for (let xx = ix0; xx <= ix1; xx++) { const wx = Math.min(xx + 1, x1) - Math.max(xx, x0); if (wx <= 0) continue;
                            const o = (yy * sw + xx) * 4, w = wx * wy, wa = w * src[o + 3]; r += src[o] * wa; g += src[o + 1] * wa; b += src[o + 2] * wa; a += wa; ws += w; } }
                    const d = (y * dw + x) * 4; if (a > 0 && ws > 0) { out[d] = r / a; out[d + 1] = g / a; out[d + 2] = b / a; out[d + 3] = a / ws; } } }
            return out;
        }
        let bad = null;
        for (const [sw, sh, dw, dh] of [[64, 48, 32, 24], [100, 77, 33, 29], [301, 200, 150, 100], [50, 50, 50, 50], [17, 9, 5, 3]]) {
            const s = { data: randPixels(sw * sh), width: sw, height: sh };
            const o = AREFast.resizeArea(s, dw, dh), ref = jsResize(s.data, sw, sh, dw, dh);
            if (!o || sameBytes(ref, o.data) !== null) { bad = sw + "x" + sh + "→" + dw + "x" + dh; break; }
        }
        check("縮小：JS の同じ計算と1画素も違わない", !bad, bad);
        const solid = new Uint8ClampedArray(40 * 40 * 4); for (let i = 0; i < solid.length; i += 4) { solid[i] = 10; solid[i + 1] = 200; solid[i + 2] = 90; solid[i + 3] = 255; }
        const so = AREFast.resizeArea({ data: solid, width: 40, height: 40 }, 7, 9);
        check("縮小：1色の画像は、1色のまま", so && so.data.every((v, i) => v === [10, 200, 90, 255][i % 4]));
        const ck = new Uint8ClampedArray(2 * 2 * 4); [[0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]].forEach((c, i) => { ck.set([c[0], c[1], c[2], 255], i * 4); });
        const co = AREFast.resizeArea({ data: ck, width: 2, height: 2 }, 1, 1);
        check("縮小：白黒2×2を1つにすると、灰色（128）", co && co.data[0] === 128 && co.data[3] === 255, co && Array.from(co.data).join(","));
        check("縮小：大きくする向きは、断る（null）", AREFast.resizeArea({ data: solid, width: 40, height: 40 }, 80, 80) === null);
    }
    // ---- 4) 当たり判定：総当たりと同じ ----
    {
        function brute(b, n) { const o = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const p = i * 4, q = j * 4; if (b[p] < b[q] + b[q + 2] && b[q] < b[p] + b[p + 2] && b[p + 1] < b[q + 1] + b[q + 3] && b[q + 1] < b[p + 1] + b[p + 3]) o.push(i + "," + j); } return o.sort(); }
        let bad = null, cases = 0;
        for (const n of [0, 1, 2, 3, 50, 400, 1500]) for (const mode of ["small", "mixed", "grid-touch", "same", "huge"]) {
            const b = new Float32Array(Math.max(4, n * 4));
            for (let i = 0; i < n; i++) {
                let x = rnd() * 1000, y = rnd() * 1000, w = 4 + rnd() * 30, h = 4 + rnd() * 30;
                if (mode === "mixed" && i % 17 === 0) { w = 200 + rnd() * 300; h = 150 + rnd() * 300; }
                if (mode === "grid-touch") { x = (i % 30) * 20; y = Math.floor(i / 30) * 20; w = 20; h = 20; }   // ぴったりくっついているだけ（重なりではない）
                if (mode === "same") { x = 100; y = 100; w = 10; h = 10; }
                if (mode === "huge" && i === 0) { x = -500; y = -500; w = 3000; h = 3000; }
                b[i * 4] = x; b[i * 4 + 1] = y; b[i * 4 + 2] = w; b[i * 4 + 3] = h;
            }
            for (const cell of [8, 33, 64, 500]) {
                const got = AREFast.aabbPairs(b, n, cell); cases++;
                const ref = brute(b, n);
                const gs = got ? Array.from({ length: got.length / 2 }, (_, k) => got[2 * k] + "," + got[2 * k + 1]).sort() : null;
                if (!gs || gs.length !== ref.length || gs.some((v, k) => v !== ref[k])) { bad = "n=" + n + " mode=" + mode + " cell=" + cell + " got=" + (gs && gs.length) + " ref=" + ref.length; break; }
            }
            if (bad) break;
        }
        check("当たり判定（四角どうし）：総当たりと同じ組になる（" + cases + " 通り。同じ組の二重数えなし）", !bad, bad);
    }
    // ---- 5) タイルのマップでの移動 ----
    {
        const mw = 40, mh = 30, tile = 16;
        let bad = null, moves = 0, hits = 0;
        for (let round = 0; round < 40 && !bad; round++) {
            const solid = new Uint8Array(mw * mh); for (let i = 0; i < solid.length; i++) solid[i] = rnd() < 0.18 ? 1 : 0;
            const w = 6 + Math.floor(rnd() * 20), h = 6 + Math.floor(rnd() * 20);
            // 壁でない場所に置く
            let x, y, tries = 0;
            const freeAt = (px, py) => { for (let ty = Math.floor(py / tile); ty <= Math.floor((py + h - 0.0001) / tile); ty++) for (let tx = Math.floor(px / tile); tx <= Math.floor((px + w - 0.0001) / tile); tx++) { if (tx < 0 || ty < 0 || tx >= mw || ty >= mh || solid[ty * mw + tx]) return false; } return true; };
            do { x = rnd() * (mw * tile - w); y = rnd() * (mh * tile - h); tries++; } while (!freeAt(x, y) && tries < 500);
            if (!freeAt(x, y)) continue;
            const tm = AREFast.tileMap(solid, mw, mh, tile);
            const pos = new Float32Array([x, y, w, h]);
            for (let k = 0; k < 60; k++) {
                const dx = (rnd() - 0.5) * 90, dy = (rnd() - 0.5) * 90;   // 1マスより大きく動く（すりぬけ確認）
                const hit = tm.move(pos, dx, dy); moves++; if (hit > 0) hits++;
                if (hit < 0 || !freeAt(pos[0], pos[1])) { bad = "壁にめりこんだ round=" + round + " k=" + k + " pos=" + Array.from(pos).join(",") + " hit=" + hit; break; }
                if (pos[2] !== w || pos[3] !== h) { bad = "大きさが変わった"; break; }
            }
        }
        check("タイルの移動：壁に めりこまない・すりぬけない（" + moves + " 回、ぶつかった " + hits + " 回）", !bad && hits > 50, bad);
        const solid = new Uint8Array(10 * 10); for (let y = 0; y < 10; y++) solid[y * 10 + 5] = 1;   // 5列目が壁
        const tm = AREFast.tileMap(solid, 10, 10, 16), pos = new Float32Array([40, 20, 10, 10]);
        const hit = tm.move(pos, 500, 0);
        check("タイルの移動：壁にぴったり止まり、右にぶつかったと返す", hit === 1 && Math.abs(pos[0] - (5 * 16 - 10)) < 1e-3 && pos[1] === 20, "hit=" + hit + " x=" + pos[0]);
        const p2 = new Float32Array([40, 20, 10, 10]); const h2 = tm.move(p2, -500, 0);
        check("タイルの移動：マップの外（左の端）で止まり、左にぶつかったと返す", h2 === 2 && p2[0] === 0, "hit=" + h2 + " x=" + p2[0]);
    }
    // ---- 6) 速さ ----
    {
        const W = 2000, H = 1500, n = W * H, base = randPixels(n);
        let t = process.hrtime.bigint();
        const a = new Uint8ClampedArray(base); jsAdjust(a, 12, 20, true, "vintage");
        const tj = Number(process.hrtime.bigint() - t) / 1e6;
        const img = { data: new Uint8ClampedArray(base) };
        t = process.hrtime.bigint(); AREFast.adjust(img, 12, 20, true, 7); const tw = Number(process.hrtime.bigint() - t) / 1e6;
        check("速さ：300万画素の色づけ（JS " + tj.toFixed(0) + "ms → C++ " + tw.toFixed(0) + "ms、" + (tj / tw).toFixed(1) + " 倍）", sameBytes(a, img.data) === null);
        const N = 2500, b = new Float32Array(N * 4); for (let i = 0; i < N; i++) { b[i * 4] = rnd() * 3000; b[i * 4 + 1] = rnd() * 3000; b[i * 4 + 2] = 10 + rnd() * 20; b[i * 4 + 3] = 10 + rnd() * 20; }
        t = process.hrtime.bigint(); let c1 = 0; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const p = i * 4, q = j * 4; if (b[p] < b[q] + b[q + 2] && b[q] < b[p] + b[p + 2] && b[p + 1] < b[q + 1] + b[q + 3] && b[q + 1] < b[p + 1] + b[p + 3]) c1++; }
        const tb = Number(process.hrtime.bigint() - t) / 1e6;
        t = process.hrtime.bigint(); const g = AREFast.aabbPairs(b, N, 40); const tg = Number(process.hrtime.bigint() - t) / 1e6;
        check("速さ：四角 " + N + " 個の当たり判定（総当たり " + tb.toFixed(1) + "ms → C++ " + tg.toFixed(1) + "ms、" + (tb / Math.max(tg, 0.01)).toFixed(1) + " 倍）", g && g.length / 2 === c1, "組の数 " + (g && g.length / 2) + " / " + c1);
    }
    console.log(pass + " / " + (pass + fail));
    process.exit(fail ? 1 : 0);
})();
