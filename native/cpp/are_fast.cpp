// ARE 高速部品（C++ → WebAssembly）
//   ・写真の「明るさ・コントラスト・白黒・色フィルター」と、スタンプの「背景（白）を消す」を、画素ごとに速く計算する
//   ・縮小（ぼかさず きれいに：面積平均）
//   ・ゲーム用の当たり判定（四角どうし／タイルのマップでの移動）
// 外のライブラリを使いません（標準ライブラリなし）。ブラウザの外（node や テスト）でも、同じ結果になります。
// ビルド：python3 native/cpp/build.py    →  native/cpp/are_fast.wasm
//
// 使い方（JavaScript 側は shared/are-fast.js）：
//   const p = fast.alloc(bytes) で wasm の記憶に場所をとり、画素を書きこみ、関数を呼び、読みもどす。
typedef unsigned char u8;
typedef unsigned int u32;
typedef int i32;

extern "C" {

// ===== 記憶の管理（ごく簡単な「積み上げ」方式。終わったら reset で全部もどす）=====
extern u8 __heap_base;
static u32 g_top = 0;

static u32 pages_for(u32 bytes) { return (bytes + 65535u) >> 16; }

u8* are_alloc(u32 n) {
    if (g_top == 0) g_top = (u32)(unsigned long)&__heap_base;
    u32 p = (g_top + 15u) & ~15u;
    u32 end = p + n;
    u32 have = (u32)__builtin_wasm_memory_size(0) << 16;
    if (end > have) {
        u32 need = pages_for(end - have);
        if (__builtin_wasm_memory_grow(0, need) == (u32)-1) return 0;   // 足りない：0 を返す
    }
    g_top = end;
    return (u8*)(unsigned long)p;
}
void are_reset() { g_top = (u32)(unsigned long)&__heap_base; }

// ===== 写真の色 =====
static inline float clampf(float v) { return v < 0.f ? 0.f : (v > 255.f ? 255.f : v); }

// filter: 0=なし 1=sepia 2=vivid 3=fade 4=warm 5=cool 6=invert 7=vintage（chat-imgedit.js の IE_FILTERS と同じ計算）
// bright: -100〜100、contrast: -100〜100（chat-imgedit.js と同じ式）、gray: 0/1
void are_adjust_rgba(u8* px, i32 n_pixels, float bright, float contrast, i32 gray, i32 filter) {
    const float c = contrast * 2.55f;
    const float f = (259.f * (c + 255.f)) / (255.f * (259.f - c));
    const float add = bright * 2.55f;
    for (i32 i = 0; i < n_pixels; i++) {
        u8* q = px + (i << 2);
        float r = q[0], g = q[1], b = q[2];
        if (gray) { r = g = b = 0.299f * r + 0.587f * g + 0.114f * b; }
        switch (filter) {
            case 1: { float a = clampf(0.393f * r + 0.769f * g + 0.189f * b), d = clampf(0.349f * r + 0.686f * g + 0.168f * b), e = clampf(0.272f * r + 0.534f * g + 0.131f * b); r = a; g = d; b = e; break; }
            case 2: { float l = 0.299f * r + 0.587f * g + 0.114f * b; r = clampf(l + (r - l) * 1.5f); g = clampf(l + (g - l) * 1.5f); b = clampf(l + (b - l) * 1.5f); break; }
            case 3: r = clampf(r * 0.8f + 45.f); g = clampf(g * 0.8f + 45.f); b = clampf(b * 0.8f + 50.f); break;
            case 4: r = clampf(r * 1.1f + 10.f); b = clampf(b * 0.88f); break;
            case 5: r = clampf(r * 0.9f); b = clampf(b * 1.12f + 10.f); break;
            case 6: r = 255.f - r; g = 255.f - g; b = 255.f - b; break;
            case 7: {
                float s0 = clampf(0.393f * r + 0.769f * g + 0.189f * b), s1 = clampf(0.349f * r + 0.686f * g + 0.168f * b), s2 = clampf(0.272f * r + 0.534f * g + 0.131f * b);
                r = clampf(r * 0.4f + s0 * 0.6f + 8.f); g = clampf(g * 0.4f + s1 * 0.6f); b = clampf(b * 0.4f + s2 * 0.6f - 8.f);
                break;
            }
            default: break;
        }
        // JS の Uint8ClampedArray と同じく、最後に 0〜255 に丸める（四捨五入・0.5 は偶数へ）
        float R = clampf(f * (r - 128.f) + 128.f + add), G = clampf(f * (g - 128.f) + 128.f + add), B = clampf(f * (b - 128.f) + 128.f + add);
        q[0] = (u8)(R + 0.5f - ((R + 0.5f) == (float)(int)(R + 0.5f) && ((int)(R + 0.5f) & 1) ? 1.f : 0.f));
        q[1] = (u8)(G + 0.5f - ((G + 0.5f) == (float)(int)(G + 0.5f) && ((int)(G + 0.5f) & 1) ? 1.f : 0.f));
        q[2] = (u8)(B + 0.5f - ((B + 0.5f) == (float)(int)(B + 0.5f) && ((int)(B + 0.5f) & 1) ? 1.f : 0.f));
    }
}

// スタンプの背景（明るい白っぽい色）を透明にする：r,g,b がすべて t 以上なら、透明にする（chat-draw.js と同じ）
void are_remove_light(u8* px, i32 n_pixels, i32 t) {
    for (i32 i = 0; i < n_pixels; i++) {
        u8* q = px + (i << 2);
        if (q[0] >= t && q[1] >= t && q[2] >= t) q[3] = 0;
    }
}

// ===== 縮小（面積平均：ギザギザにならず、細かい線も残る）=====
// src: sw×sh の RGBA。dst: dw×dh の RGBA（dw<=sw, dh<=sh を想定。大きくする向きは、ブラウザに まかせる）
void are_resize_area(const u8* src, i32 sw, i32 sh, u8* dst, i32 dw, i32 dh) {
    const float xs = (float)sw / (float)dw, ys = (float)sh / (float)dh;
    for (i32 y = 0; y < dh; y++) {
        float y0 = y * ys, y1 = y0 + ys;
        i32 iy0 = (i32)y0, iy1 = (i32)y1; if (iy1 >= sh) iy1 = sh - 1;
        for (i32 x = 0; x < dw; x++) {
            float x0 = x * xs, x1 = x0 + xs;
            i32 ix0 = (i32)x0, ix1 = (i32)x1; if (ix1 >= sw) ix1 = sw - 1;
            float r = 0, g = 0, b = 0, a = 0, wsum = 0;
            for (i32 yy = iy0; yy <= iy1; yy++) {
                float wy = (yy + 1 < y1 ? yy + 1 : y1) - (yy > y0 ? yy : y0);
                if (wy <= 0) continue;
                for (i32 xx = ix0; xx <= ix1; xx++) {
                    float wx = (xx + 1 < x1 ? xx + 1 : x1) - (xx > x0 ? xx : x0);
                    if (wx <= 0) continue;
                    const u8* s = src + (((u32)yy * (u32)sw + (u32)xx) << 2);
                    float w = wx * wy, wa = w * s[3];   // 透明な画素の色を、まぜすぎないよう、アルファで重みをつける
                    r += s[0] * wa; g += s[1] * wa; b += s[2] * wa; a += wa; wsum += w;
                }
            }
            u8* d = dst + (((u32)y * (u32)dw + (u32)x) << 2);
            if (a > 0.f && wsum > 0.f) {
                d[0] = (u8)(r / a + 0.5f); d[1] = (u8)(g / a + 0.5f); d[2] = (u8)(b / a + 0.5f); d[3] = (u8)(a / wsum + 0.5f);
            } else { d[0] = d[1] = d[2] = d[3] = 0; }
        }
    }
}

// ===== ゲームの当たり判定 =====
// boxes: n 個の四角。1つにつき float 4つ（x, y, w, h）。重なっている組を out に（番号2つずつ）書き、組の数を返す。
// 「格子（グリッド）」で近くのものだけ比べるので、数が多くても速い。cell は 格子の1マスの大きさ（四角の大きさの2倍くらい）
i32 are_aabb_pairs(const float* boxes, i32 n, float cell, i32* out, i32 max_pairs) {
    if (n < 2 || cell <= 0.f) return 0;
    // 全体の外わく
    float minx = boxes[0], miny = boxes[1], maxx = boxes[0] + boxes[2], maxy = boxes[1] + boxes[3];
    for (i32 i = 1; i < n; i++) {
        const float* b = boxes + 4 * i;
        if (b[0] < minx) minx = b[0]; if (b[1] < miny) miny = b[1];
        if (b[0] + b[2] > maxx) maxx = b[0] + b[2]; if (b[1] + b[3] > maxy) maxy = b[1] + b[3];
    }
    i32 gw = (i32)((maxx - minx) / cell) + 1, gh = (i32)((maxy - miny) / cell) + 1;
    if (gw < 1) gw = 1; if (gh < 1) gh = 1;
    if ((long)gw * gh > 262144) { cell *= 4.f; gw = (i32)((maxx - minx) / cell) + 1; gh = (i32)((maxy - miny) / cell) + 1; }   // 格子が多すぎるときは、マスを大きくする
    u32 cells = (u32)gw * (u32)gh;
    u32 mark = g_top;
    i32* head = (i32*)are_alloc(cells * 4);    // 各マスの先頭
    i32* nxt = (i32*)are_alloc((u32)n * 4 * 4);   // 四角ごとの「次」の鎖（1つの四角が最大4マスにまたがる前提で、鎖の数を確保）
    i32* own = (i32*)are_alloc((u32)n * 4 * 4);   // 鎖の要素がもつ、四角の番号
    if (!head || !nxt || !own) { g_top = mark; return 0; }
    for (u32 i = 0; i < cells; i++) head[i] = -1;
    i32 links = 0;
    for (i32 i = 0; i < n; i++) {
        const float* b = boxes + 4 * i;
        i32 cx0 = (i32)((b[0] - minx) / cell), cx1 = (i32)((b[0] + b[2] - minx) / cell);
        i32 cy0 = (i32)((b[1] - miny) / cell), cy1 = (i32)((b[1] + b[3] - miny) / cell);
        if (cx1 >= gw) cx1 = gw - 1; if (cy1 >= gh) cy1 = gh - 1;
        for (i32 cy = cy0; cy <= cy1; cy++) for (i32 cx = cx0; cx <= cx1; cx++) {
            if (links >= n * 4) continue;   // 大きすぎる四角は、鎖が足りなくなる。その分は、下の全探索に まかせる（下を見よ）
            i32 c = cy * gw + cx;
            own[links] = i; nxt[links] = head[c]; head[c] = links; links++;
        }
    }
    i32 np = 0;
    for (u32 c = 0; c < cells; c++) {
        for (i32 a = head[c]; a >= 0; a = nxt[a]) {
            for (i32 bb = nxt[a]; bb >= 0; bb = nxt[bb]) {
                i32 i = own[a], j = own[bb];
                if (i == j) continue;
                if (i > j) { i32 t = i; i = j; j = t; }
                const float* p = boxes + 4 * i; const float* q = boxes + 4 * j;
                if (p[0] < q[0] + q[2] && q[0] < p[0] + p[2] && p[1] < q[1] + q[3] && q[1] < p[1] + p[3]) {
                    // 同じ組が、べつのマスでも見つかる：「その組の最初のマス」だけ数える
                    i32 ax0 = (i32)((p[0] > q[0] ? p[0] : q[0]) - minx) / (i32)cell;   // 重なり部分の左上のマス
                    i32 ay0 = (i32)((p[1] > q[1] ? p[1] : q[1]) - miny) / (i32)cell;
                    float ox = (p[0] > q[0] ? p[0] : q[0]) - minx, oy = (p[1] > q[1] ? p[1] : q[1]) - miny;
                    ax0 = (i32)(ox / cell); ay0 = (i32)(oy / cell);
                    if (ax0 >= gw) ax0 = gw - 1; if (ay0 >= gh) ay0 = gh - 1;
                    if ((u32)(ay0 * gw + ax0) != c) continue;
                    if (np < max_pairs) { out[2 * np] = i; out[2 * np + 1] = j; }
                    np++;
                }
            }
        }
    }
    g_top = mark;
    return np < max_pairs ? np : max_pairs;
}

// タイルのマップでの移動：四角（x,y,w,h）を (dx,dy) だけ動かし、壁（solid=1）には めりこまずに止まる。
// pos: float 4つ（x,y,w,h）→ 動いたあとの x,y を書きもどす。返す値：ビット 1=右にぶつかった 2=左 4=下 8=上
i32 are_tile_move(const u8* solid, i32 mw, i32 mh, float tile, float* pos, float dx, float dy) {
    i32 hit = 0;
    float x = pos[0], y = pos[1], w = pos[2], h = pos[3];
    // 横 → 縦の順に、1マスより大きく動かないよう小分けにして動かす
    for (i32 axis = 0; axis < 2; axis++) {
        float d = axis == 0 ? dx : dy;
        if (d == 0.f) continue;
        float step = tile * 0.5f;
        i32 n = (i32)((d < 0 ? -d : d) / step) + 1;
        float s = d / (float)n;
        for (i32 k = 0; k < n; k++) {
            float nx = axis == 0 ? x + s : x, ny = axis == 1 ? y + s : y;
            i32 tx0 = (i32)(nx / tile), tx1 = (i32)((nx + w - 0.0001f) / tile);
            i32 ty0 = (i32)(ny / tile), ty1 = (i32)((ny + h - 0.0001f) / tile);
            if (nx < 0) tx0 = -1; if (ny < 0) ty0 = -1;
            bool blocked = false;
            for (i32 ty = ty0; ty <= ty1 && !blocked; ty++) for (i32 tx = tx0; tx <= tx1; tx++) {
                bool wall = tx < 0 || ty < 0 || tx >= mw || ty >= mh || solid[ty * mw + tx] != 0;
                if (wall) { blocked = true; break; }
            }
            if (blocked) {
                if (axis == 0) { if (s > 0) { x = (float)((i32)((nx + w - 0.0001f) / tile)) * tile - w; hit |= 1; } else { x = (float)((i32)(nx / tile) + 1) * tile; hit |= 2; } }
                else { if (s > 0) { y = (float)((i32)((ny + h - 0.0001f) / tile)) * tile - h; hit |= 4; } else { y = (float)((i32)(ny / tile) + 1) * tile; hit |= 8; } }
                break;
            }
            x = nx; y = ny;
        }
    }
    pos[0] = x; pos[1] = y;
    return hit;
}

}  // extern "C"
