"use strict";
// ===== ARE 高速部品の読みこみ口（C++ → WebAssembly：are-fast.wasm）=====
// ・写真の色づけ／スタンプの背景消し／縮小／ゲームの当たり判定を、速くする。
// ・読みこみに失敗したり、まだ読みこみ中のときは、すべて「false / null」を返す → 呼ぶ側は、これまでの JS の計算にもどる（動きは変わらない）。
// ・結果は JS の計算と1画素も違わない（native/cpp/test.js で確かめている）。
// ・ブラウザ（window.AREFast）でも Node（require）でも使える。
(function (root) {
    var ex = null, loading = null;

    function useBytes(bytes) {
        return WebAssembly.instantiate(bytes, {}).then(function (r) { ex = r.instance.exports; return true; });
    }
    function load(url) {
        if (ex) return Promise.resolve(true);
        if (loading) return loading;
        try {
            if (typeof WebAssembly !== "object") return Promise.resolve(false);
            if (typeof process !== "undefined" && process.versions && process.versions.node && typeof window === "undefined") {
                var fs = require("fs");
                loading = useBytes(fs.readFileSync(url || (__dirname + "/are-fast.wasm"))).catch(function () { ex = null; return false; });
            } else {
                loading = fetch(url || "./are-fast.wasm").then(function (r) { if (!r.ok) throw new Error("wasm"); return r.arrayBuffer(); }).then(useBytes).catch(function () { ex = null; return false; });
            }
        } catch (_e) { loading = Promise.resolve(false); }
        return loading;
    }
    function ready() { return !!ex; }

    // wasm の記憶に n バイトの場所をとって fn(p) を呼び、終わったら もどす。とれなければ false
    function scratch(n, fn) {
        if (!ex) return false;
        var m = ex.are_mark(), p = ex.are_alloc(n);
        if (!p) { ex.are_release(m); return false; }
        try { fn(p); } finally { ex.are_release(m); }
        return true;
    }
    function view(p, n) { return new Uint8Array(ex.memory.buffer, p, n); }

    // ImageData の色づけ（明るさ・コントラスト・白黒・フィルター番号 0〜7）。やったら true
    function adjust(img, bright, contrast, gray, filter) {
        if (!ex || !img || !img.data) return false;
        var n = img.data.length >> 2;
        return scratch(n * 4, function (p) {
            view(p, n * 4).set(img.data);
            ex.are_adjust_rgba(p, n, +bright || 0, +contrast || 0, gray ? 1 : 0, filter | 0);
            img.data.set(view(p, n * 4));
        });
    }
    // 明るい白っぽい色（r,g,b がすべて t 以上）を、透明にする。やったら true
    function removeLight(img, t) {
        if (!ex || !img || !img.data) return false;
        var n = img.data.length >> 2;
        return scratch(n * 4, function (p) {
            view(p, n * 4).set(img.data);
            ex.are_remove_light(p, n, t | 0);
            img.data.set(view(p, n * 4));
        });
    }
    // 縮小（面積平均）。{data:Uint8ClampedArray,width,height} を返す。できなければ null
    function resizeArea(src, dw, dh) {
        if (!ex || !src || !(dw > 0) || !(dh > 0) || dw > src.width || dh > src.height) return null;
        var out = new Uint8ClampedArray(dw * dh * 4), sn = src.width * src.height * 4;
        var ok = scratch(sn + dw * dh * 4, function (p) {
            view(p, sn).set(src.data);
            ex.are_resize_area(p, src.width, src.height, p + sn, dw, dh);
            out.set(view(p + sn, dw * dh * 4));
        });
        return ok ? { data: out, width: dw, height: dh } : null;
    }
    // 四角（Float32Array：x,y,w,h を n 個ぶん）どうしの重なりを探す。[a,b,a,b,…] の Int32Array を返す（a<b）。できなければ null
    function aabbPairs(boxes, n, cell) {
        if (!ex || n < 0 || boxes.length < n * 4) return null;
        var cap = Math.max(64, n * 8), result = null;
        for (var tries = 0; tries < 4 && !result; tries++) {
            var np = -2;
            var ok = scratch(n * 16 + cap * 8, function (p) {
                new Float32Array(ex.memory.buffer, p, n * 4).set(boxes.subarray ? boxes.subarray(0, n * 4) : boxes);
                np = ex.are_aabb_pairs(p, n, cell, p + n * 16, cap);
                if (np >= 0 && np <= cap) result = new Int32Array(new Int32Array(ex.memory.buffer, p + n * 16, np * 2));
            });
            if (!ok || np === -1) return null;
            if (np > cap) { cap = np; result = null; }   // 足りなかったら、組の数ぶんに広げて もう一度
            if (np === 0) result = new Int32Array(0);
        }
        return result;
    }
    // タイルのマップ（solid: Uint8Array、1=壁）の上で、四角を動かす道具。move(pos, dx, dy) で pos(Float32Array x,y,w,h) を書きかえ、ぶつかった向きのビット（1右 2左 4下 8上）を返す。できなければ null
    function tileMap(solid, mw, mh, tile) {
        if (!ex || solid.length < mw * mh) return null;
        var mp = ex.are_alloc(mw * mh);   // 動かす道具が生きているあいだ、取りっぱなし（are_reset を呼ばないこと）
        if (!mp) return null;
        view(mp, mw * mh).set(solid.subarray ? solid.subarray(0, mw * mh) : solid);
        return {
            move: function (pos, dx, dy) {
                var hit = -1;
                scratch(16, function (p) {
                    new Float32Array(ex.memory.buffer, p, 4).set(pos);
                    hit = ex.are_tile_move(mp, mw, mh, tile, p, dx, dy);
                    pos.set(new Float32Array(ex.memory.buffer, p, 4));
                });
                return hit;
            }
        };
    }

    var api = { load: load, ready: ready, adjust: adjust, removeLight: removeLight, resizeArea: resizeArea, aabbPairs: aabbPairs, tileMap: tileMap };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.AREFast = api;
})(typeof window !== "undefined" ? window : null);
