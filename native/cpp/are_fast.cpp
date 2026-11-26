// ARE 高速部品（C++ → WebAssembly）
//   ・写真の「明るさ・コントラスト・白黒・色フィルター」と、スタンプの「背景（白）を消す」を、画素ごとに速く計算する
//     （JS の元の計算と、1画素も違わない結果になるよう、小数は double、丸めも JS の Uint8ClampedArray と同じ「四捨五入・0.5 は偶数へ」）
//   ・縮小（面積平均：ギザギザにならず、細かい線も残る）
//   ・ゲーム用の当たり判定（四角どうしの重なり探し／タイルのマップでの移動）
// 外のライブラリを使いません（標準ライブラリなし）。
// ビルド：python3 native/cpp/build.py    →  are-fast.wasm（ルートに出る）
// 検査  ：python3 native/cpp/test.py     →  JS の元の計算と同じ結果か／当たり判定が総当たりと同じか／速さ
typedef unsigned char u8;
typedef unsigned int u32;
typedef int i32;

#define EXPORT extern "C" __attribute__((visibility("default")))

// ===== 記憶の管理（ごく簡単な「積み上げ」方式。終わったら are_reset で全部もどす）=====
extern "C" u8 __heap_base;
static u32 g_top = 0;

EXPORT u8* are_alloc(u32 n) {
    if (g_top == 0) g_top = (u32)(unsigned long)&__heap_base;
    u32 p = (g_top + 15u) & ~15u;
    u32 end = p + n;
    if (end < p) return 0;
    u32 have = (u32)__builtin_wasm_memory_size(0) << 16;
    if (end > have) {
        u32 need = ((end - have) + 65535u) >> 16;
        if (__builtin_wasm_memory_grow(0, need) == (u32)-1) return 0;   // 足りない：0 を返す（JS 側で、元の計算にもどる）
    }
    g_top = end;
    return (u8*)(unsigned long)p;
}
EXPORT void are_reset() { g_top = (u32)(unsigned long)&__heap_base; }
EXPORT u32 are_mark() { return g_top; }
EXPORT void are_release(u32 m) { g_top = m; }

// ===== 写真の色 =====
static inline double clampd(double v) { return v < 0.0 ? 0.0 : (v > 255.0 ? 255.0 : v); }
// JS の Uint8ClampedArray に入れたときと同じ丸め（四捨五入。ちょうど 0.5 のときは偶数へ）
static inline u8 to_u8(double v) {
    if (!(v > 0.0)) return 0;          // 0 以下・NaN
    if (v >= 255.0) return 255;
    i32 i = (i32)v;
    double d = v - (double)i;
    if (d > 0.5 || (d == 0.5 && (i & 1))) i++;
    return (u8)i;
}

// filter: 0=なし 1=sepia 2=vivid 3=fade 4=warm 5=cool 6=invert 7=vintage（chat-imgedit.js の IE_FILTERS と同じ順・同じ計算）
// bright / contrast: -100〜100（chat-imgedit.js と同じ式）、gray: 0/1
EXPORT void are_adjust_rgba(u8* px, i32 n_pixels, double bright, double contrast, i32 gray, i32 filter) {
    const double c = contrast * 2.55;
    const double f = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));
    const double add = bright * 2.55;
    for (i32 i = 0; i < n_pixels; i++) {
        u8* q = px + ((u32)i << 2);
        double r = q[0], g = q[1], b = q[2];
        if (gray) { r = g = b = 0.299 * r + 0.587 * g + 0.114 * b; }
        switch (filter) {
            case 1: { double a = clampd(0.393 * r + 0.769 * g + 0.189 * b), d = clampd(0.349 * r + 0.686 * g + 0.168 * b), e = clampd(0.272 * r + 0.534 * g + 0.131 * b); r = a; g = d; b = e; break; }
            case 2: { double l = 0.299 * r + 0.587 * g + 0.114 * b; r = clampd(l + (r - l) * 1.5); g = clampd(l + (g - l) * 1.5); b = clampd(l + (b - l) * 1.5); break; }
            case 3: r = clampd(r * 0.8 + 45.0); g = clampd(g * 0.8 + 45.0); b = clampd(b * 0.8 + 50.0); break;
            case 4: r = clampd(r * 1.1 + 10.0); b = clampd(b * 0.88); break;
            case 5: r = clampd(r * 0.9); b = clampd(b * 1.12 + 10.0); break;
            case 6: r = 255.0 - r; g = 255.0 - g; b = 255.0 - b; break;
            case 7: {
                double s0 = clampd(0.393 * r + 0.769 * g + 0.189 * b), s1 = clampd(0.349 * r + 0.686 * g + 0.168 * b), s2 = clampd(0.272 * r + 0.534 * g + 0.131 * b);
                r = clampd(r * 0.4 + s0 * 0.6 + 8.0); g = clampd(g * 0.4 + s1 * 0.6); b = clampd(b * 0.4 + s2 * 0.6 - 8.0);
                break;
            }
            default: break;
        }
        q[0] = to_u8(clampd(f * (r - 128.0) + 128.0 + add));
        q[1] = to_u8(clampd(f * (g - 128.0) + 128.0 + add));
        q[2] = to_u8(clampd(f * (b - 128.0) + 128.0 + add));
    }
}

// スタンプの背景（明るい白っぽい色）を透明にする：r,g,b がすべて t 以上なら、透明にする（chat-draw.js と同じ）
EXPORT void are_remove_light(u8* px, i32 n_pixels, i32 t) {
    for (i32 i = 0; i < n_pixels; i++) {
        u8* q = px + ((u32)i << 2);
        if (q[0] >= t && q[1] >= t && q[2] >= t) q[3] = 0;
    }
}

// ===== 縮小（面積平均）=====
// src: sw×sh の RGBA。dst: dw×dh の RGBA（dw<=sw, dh<=sh。大きくする向きは、ブラウザに まかせる）
// 透明な画素の色は、まぜすぎないよう、アルファで重みをつける
EXPORT void are_resize_area(const u8* src, i32 sw, i32 sh, u8* dst, i32 dw, i32 dh) {
    const double xs = (double)sw / (double)dw, ys = (double)sh / (double)dh;
    for (i32 y = 0; y < dh; y++) {
        const double y0 = y * ys, y1 = y0 + ys;
        i32 iy0 = (i32)y0, iy1 = (i32)y1; if (iy1 >= sh) iy1 = sh - 1;
        for (i32 x = 0; x < dw; x++) {
            const double x0 = x * xs, x1 = x0 + xs;
            i32 ix0 = (i32)x0, ix1 = (i32)x1; if (ix1 >= sw) ix1 = sw - 1;
            double r = 0, g = 0, b = 0, a = 0, wsum = 0;
            for (i32 yy = iy0; yy <= iy1; yy++) {
                const double wy = ((double)(yy + 1) < y1 ? (double)(yy + 1) : y1) - ((double)yy > y0 ? (double)yy : y0);
                if (wy <= 0) continue;
                for (i32 xx = ix0; xx <= ix1; xx++) {
                    const double wx = ((double)(xx + 1) < x1 ? (double)(xx + 1) : x1) - ((double)xx > x0 ? (double)xx : x0);
                    if (wx <= 0) continue;
                    const u8* s = src + (((u32)yy * (u32)sw + (u32)xx) << 2);
                    const double w = wx * wy, wa = w * s[3];
                    r += s[0] * wa; g += s[1] * wa; b += s[2] * wa; a += wa; wsum += w;
                }
            }
            u8* d = dst + (((u32)y * (u32)dw + (u32)x) << 2);
            if (a > 0.0 && wsum > 0.0) { d[0] = to_u8(r / a); d[1] = to_u8(g / a); d[2] = to_u8(b / a); d[3] = to_u8(a / wsum); }
            else { d[0] = d[1] = d[2] = d[3] = 0; }
        }
    }
}

// ===== ゲームの当たり判定 =====
// 四角どうしの重なり探し。boxes: n 個の四角（1つにつき float 4つ：x, y, w, h）。
// 重なっている組を out に（番号2つずつ・小さい番号が先）書き、組の数を返す（max_pairs を超えた分は書かないが、数は返す）。
// 「格子」で近くのものだけ比べるので、数が多くても速い。cell は 格子の1マスの大きさ（四角の大きさの2倍くらいが目安）。
// 失敗（記憶が足りない）のときは -1 を返す → JS 側で総当たりにもどる。
// 同じ組を二重に数えないため、「重なり部分の左上が入るマス」でだけ、その組を数える。
EXPORT i32 are_aabb_pairs(const float* boxes, i32 n, float cell_in, i32* out, i32 max_pairs) {
    if (n < 2 || !(cell_in > 0.f)) return 0;
    double cell = cell_in;
    double minx = boxes[0], miny = boxes[1], maxx = boxes[0] + boxes[2], maxy = boxes[1] + boxes[3];
    for (i32 i = 1; i < n; i++) {
        const float* b = boxes + 4 * i;
        if (b[0] < minx) minx = b[0];
        if (b[1] < miny) miny = b[1];
        if (b[0] + b[2] > maxx) maxx = b[0] + b[2];
        if (b[1] + b[3] > maxy) maxy = b[1] + b[3];
    }
    i32 gw, gh;
    for (;;) {   // 格子が多すぎるときは、マスを大きくする
        gw = (i32)((maxx - minx) / cell) + 1; gh = (i32)((maxy - miny) / cell) + 1;
        if ((double)gw * (double)gh <= 262144.0) break;
        cell *= 2.0;
    }
    const u32 cells = (u32)gw * (u32)gh;
    const u32 mark = g_top;
    u32* count = (u32*)are_alloc((cells + 1) * 4);
    if (!count) { g_top = mark; return -1; }
    for (u32 i = 0; i <= cells; i++) count[i] = 0;
    // 1回目：各マスに、いくつの四角が入るかを数える
    u32 total = 0;
    for (i32 i = 0; i < n; i++) {
        const float* b = boxes + 4 * i;
        i32 cx0 = (i32)((b[0] - minx) / cell), cx1 = (i32)((b[0] + b[2] - minx) / cell);
        i32 cy0 = (i32)((b[1] - miny) / cell), cy1 = (i32)((b[1] + b[3] - miny) / cell);
        if (cx1 >= gw) cx1 = gw - 1; if (cy1 >= gh) cy1 = gh - 1;
        for (i32 cy = cy0; cy <= cy1; cy++) for (i32 cx = cx0; cx <= cx1; cx++) { count[(u32)cy * (u32)gw + (u32)cx + 1]++; total++; }
        if (total > 16u * 1024u * 1024u) { g_top = mark; return -1; }
    }
    for (u32 i = 0; i < cells; i++) count[i + 1] += count[i];   // count[c]〜count[c+1] が、マス c の入れ物
    i32* items = (i32*)are_alloc(total * 4 + 4);
    u32* fill = (u32*)are_alloc((cells + 1) * 4);
    if (!items || !fill) { g_top = mark; return -1; }
    for (u32 i = 0; i < cells; i++) fill[i] = count[i];
    for (i32 i = 0; i < n; i++) {
        const float* b = boxes + 4 * i;
        i32 cx0 = (i32)((b[0] - minx) / cell), cx1 = (i32)((b[0] + b[2] - minx) / cell);
        i32 cy0 = (i32)((b[1] - miny) / cell), cy1 = (i32)((b[1] + b[3] - miny) / cell);
        if (cx1 >= gw) cx1 = gw - 1; if (cy1 >= gh) cy1 = gh - 1;
        for (i32 cy = cy0; cy <= cy1; cy++) for (i32 cx = cx0; cx <= cx1; cx++) items[fill[(u32)cy * (u32)gw + (u32)cx]++] = i;
    }
    // 2回目：同じマスに入っている四角どうしを比べる
    i32 np = 0;
    for (u32 c = 0; c < cells; c++) {
        const u32 s = count[c], e = count[c + 1];
        for (u32 a = s; a < e; a++) {
            for (u32 bb = a + 1; bb < e; bb++) {
                i32 i = items[a], j = items[bb];
                if (i > j) { i32 t = i; i = j; j = t; }
                const float* p = boxes + 4 * i; const float* q = boxes + 4 * j;
                if (p[0] < q[0] + q[2] && q[0] < p[0] + p[2] && p[1] < q[1] + q[3] && q[1] < p[1] + p[3]) {
                    const double ox = (p[0] > q[0] ? p[0] : q[0]), oy = (p[1] > q[1] ? p[1] : q[1]);   // 重なり部分の左上
                    i32 ax = (i32)((ox - minx) / cell), ay = (i32)((oy - miny) / cell);
                    if (ax >= gw) ax = gw - 1; if (ay >= gh) ay = gh - 1;
                    if ((u32)ay * (u32)gw + (u32)ax != c) continue;   // この組は、べつのマスで数える
                    if (np < max_pairs) { out[2 * np] = i; out[2 * np + 1] = j; }
                    np++;
                }
            }
        }
    }
    g_top = mark;
    return np;
}

// タイルのマップでの移動：四角（x,y,w,h）を (dx,dy) だけ動かし、壁（solid != 0 のマス・マップの外）には めりこまずに止まる。
// pos: float 4つ（x,y,w,h）→ 動いたあとの x,y を書きもどす。
// 返す値：ビット  1=右にぶつかった  2=左  4=下  8=上
// 1マスの半分ずつ小分けにして動かすので、速い動きでも壁をすりぬけない。横→縦の順。
EXPORT i32 are_tile_move(const u8* solid, i32 mw, i32 mh, float tile_in, float* pos, float dx, float dy) {
    i32 hit = 0;
    const double tile = tile_in;
    double x = pos[0], y = pos[1];
    const double w = pos[2], h = pos[3];
    for (i32 axis = 0; axis < 2; axis++) {
        const double d = axis == 0 ? dx : dy;
        if (d == 0.0) continue;
        const double step = tile * 0.5;
        const i32 n = (i32)((d < 0 ? -d : d) / step) + 1;
        const double s = d / (double)n;
        for (i32 k = 0; k < n; k++) {
            const double nx = axis == 0 ? x + s : x, ny = axis == 1 ? y + s : y;
            // 四角が かかっているマスの範囲（右・下の辺ちょうどは、そのマスに かからない）
            i32 tx0 = (i32)__builtin_floor(nx / tile), tx1 = (i32)__builtin_floor((nx + w - 0.0001) / tile);
            i32 ty0 = (i32)__builtin_floor(ny / tile), ty1 = (i32)__builtin_floor((ny + h - 0.0001) / tile);
            bool blocked = false;
            for (i32 ty = ty0; ty <= ty1 && !blocked; ty++) {
                for (i32 tx = tx0; tx <= tx1; tx++) {
                    if (tx < 0 || ty < 0 || tx >= mw || ty >= mh || solid[ty * mw + tx] != 0) { blocked = true; break; }
                }
            }
            if (blocked) {
                if (axis == 0) {
                    if (s > 0) { x = (double)tx1 * tile - w; hit |= 1; }
                    else { x = (double)(tx0 + 1) * tile; hit |= 2; }
                } else {
                    if (s > 0) { y = (double)ty1 * tile - h; hit |= 4; }
                    else { y = (double)(ty0 + 1) * tile; hit |= 8; }
                }
                break;
            }
            x = nx; y = ny;
        }
    }
    pos[0] = (float)x; pos[1] = (float)y;
    return hit;
}
