// ===== テクスチャ（すべて コードで えがく。画像ファイルは いらない）=====
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mkc = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; };
const noise = (x, w, h, base, cols, n, s) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for(let i = 0; i < n; i++){ x.fillStyle = cols[(rnd() * cols.length) | 0]; x.fillRect(rnd() * w, rnd() * h, s, s); } };
const MAKE = {
    grass: () => mkc(128, 128, (x, w, h) => { noise(x, w, h, "#6fbf5a", ["#5fae4c", "#80cf6a", "#68b854", "#8ad674"], 900, 2); for(let i = 0; i < 9; i++){ x.fillStyle = ["#fff2a0", "#ffb0c8", "#ffffff"][i % 3]; x.fillRect(rnd() * w, rnd() * h, 2, 2); } }),
    cobble: () => mkc(128, 128, (x, w, h) => { x.fillStyle = "#d8c9a6"; x.fillRect(0, 0, w, h); for(let r = 0; r < 8; r++) for(let c = 0; c < 8; c++){ const ox = (r % 2) * 8; x.fillStyle = ["#cdbd98", "#e2d4b3", "#d3c3a0"][((r * 3 + c) % 3)]; x.fillRect(c * 16 + ox + 1, r * 16 + 1, 14, 14); } }),
    wood: () => mkc(128, 128, (x, w, h) => { for(let i = 0; i < 8; i++){ x.fillStyle = ["#c9915a", "#bd854f", "#d19c66"][i % 3]; x.fillRect(0, i * 16, w, 15); x.fillStyle = "rgba(60,30,10,.35)"; x.fillRect(0, i * 16 + 15, w, 1); } }),
    tile: () => mkc(64, 64, (x, w, h) => { x.fillStyle = "#e9eef5"; x.fillRect(0, 0, w, h); x.fillStyle = "#d3dbe8"; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); }),
    dirt: () => mkc(128, 128, (x, w, h) => noise(x, w, h, "#b48a5a", ["#a77d4f", "#c19766", "#b0855a"], 700, 2)),
    water: () => mkc(64, 64, (x, w, h) => { x.fillStyle = "#4aa8e8"; x.fillRect(0, 0, w, h); x.fillStyle = "rgba(255,255,255,.35)"; for(let i = 0; i < 14; i++) x.fillRect(rnd() * w, rnd() * h, 8, 1.5); }),
    glow: () => mkc(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.3, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
    beam: () => mkc(32, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
    star: () => mkc(64, 64, (x, w, h) => { x.fillStyle = "#fff"; x.beginPath(); for(let i = 0; i < 10; i++){ const r = i % 2 ? 12 : 28, a = i / 10 * 6.283 - 1.57; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.closePath(); x.fill(); }),
    are: () => mkc(256, 96, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = "bold 80px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = "#ffe9a0"; x.shadowBlur = 24; x.fillStyle = "#fff"; x.fillText("A R E", w / 2, h / 2 + 4); }),
    puff: () => mkc(64, 64, (x, w, h) => { x.fillStyle = "#fff"; for(let i = 0; i < 6; i++){ x.beginPath(); x.arc(32 + (rnd() - .5) * 26, 32 + (rnd() - .5) * 20, 12 + rnd() * 8, 0, 6.283); x.fill(); } })
};
export const TEX_NAMES = Object.keys(MAKE);
export function texCanvas(name){ seed = 7 + name.length * 977; return (MAKE[name] || MAKE.grass)(); }
