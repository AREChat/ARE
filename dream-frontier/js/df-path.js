// ===== 道すじ（コースター・ボートなどの レール）。エンジンに よらない 計算だけ =====
const CR = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return p1.map((_, i) => .5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)); };
// pts: [[x, z, たかさ], ...] → サンプル点は [x, たかさ, z]
export function makePath(pts, closed, per){
    per = per || 16; const N = pts.length, S = [];
    const get = (i) => closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))];
    const segs = closed ? N : N - 1;
    for(let i = 0; i < segs; i++) for(let k = 0; k < per; k++){ const q = CR(get(i - 1), get(i), get(i + 1), get(i + 2), k / per); S.push([q[0], q[2], q[1]]); }
    if(!closed){ const l = pts[N - 1]; S.push([l[0], l[2], l[1]]); }
    const len = [0]; const M = S.length; const cnt = closed ? M : M - 1;
    for(let i = 1; i <= cnt; i++){ const a = S[i - 1], b = S[i % M]; len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
    const total = len[len.length - 1];
    const find = (s) => { let lo = 0, hi = len.length - 1; while(lo < hi - 1){ const m = (lo + hi) >> 1; if(len[m] <= s) lo = m; else hi = m; } return lo; };
    const at = (s) => { s = closed ? ((s % total) + total) % total : Math.max(0, Math.min(total - .001, s)); const i = find(s), a = S[i % M], b = S[(i + 1) % M], k = (s - len[i]) / Math.max(.0001, len[i + 1] - len[i]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
    return {pts: S, len, total, closed, at, find};
}
export const yawOf = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);
export const pitchOf = (a, b) => Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
