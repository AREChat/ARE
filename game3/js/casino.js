"use strict";
// ===== カジノの ミニゲーム 6しゅ（すべて オリジナル）=====
//  アイテム神経衰弱 / 友披露(トランプ) / タイピング / AREの達人(リズム)
//  キーボード・ゲームパッド・タッチ ぜんぶ そうさ できる。  playGame(ctx, game, level) → Promise<{coins,text,title}|null>

const W = 360, H = 520;
const MAP = {ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", Space: "ok", Enter: "ok", KeyZ: "ok", KeyX: "alt", ShiftLeft: "alt", ShiftRight: "alt", Escape: "exit"};
const PAL = ["#ff6b6b", "#4dabf7", "#69db7c", "#ffd43b", "#b197fc", "#ff922b", "#3bc9db"];
const rnd = (n) => Math.floor(Math.random() * n);
const shuf = (a) => { for(let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function shell(title, pad){
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0;z-index:99;background:rgba(8,6,20,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:inherit;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none";
    const bar = document.createElement("div"); bar.style.cssText = "width:min(96vw,420px);display:flex;justify-content:space-between;align-items:center;font-weight:bold;padding:4px 2px";
    const t = document.createElement("span"); t.textContent = "🎰 " + title; const x = document.createElement("button"); x.textContent = "× やめる"; x.style.cssText = "background:#432;color:#fff;border:2px solid #fff;border-radius:6px;padding:4px 10px;font:inherit";
    bar.append(t, x);
    const info = document.createElement("div"); info.style.cssText = "width:min(96vw,420px);min-height:1.4em;font-size:14px;color:#ffe9a8;padding:2px";
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.style.cssText = "height:min(62vh," + H + "px);max-width:96vw;aspect-ratio:" + W + "/" + H + ";background:#14102a;border:3px solid #fff;border-radius:8px";
    const pd = document.createElement("div"); pd.style.cssText = "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;justify-content:center";
    root.append(bar, info, cv, pd); document.body.appendChild(root);
    const h = {root, cv, g: cv.getContext("2d"), info: (s) => { info.textContent = s; }, key: null, tap: null, exit: null, update: null, draw: null, input: null, done: false};
    for(const [k, label] of pad){
        const b = document.createElement("button"); b.textContent = label; b.style.cssText = "min-width:54px;height:46px;font-size:20px;background:#2b2150;color:#fff;border:2px solid #fff;border-radius:10px;touch-action:none";
        let iv = 0; const fire = () => h.key && h.key(k);
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); fire(); if(k === "left" || k === "right" || k === "down"){ clearInterval(iv); iv = setInterval(fire, 110); } });
        for(const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => clearInterval(iv));
        pd.appendChild(b);
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    cv.addEventListener("pointerdown", (e) => { if(h.tap){ const p = pos(e); h.tap(p[0], p[1]); } });
    const kd = (e) => { const k = MAP[e.code];
        if(h.input && e.key && e.key.length === 1 && /[a-zA-Z\-]/.test(e.key) && !e.ctrlKey && !e.metaKey){ e.preventDefault(); e.stopImmediatePropagation(); h.input(e.key.toLowerCase()); return; }
        if(!k) { if(e.code && !e.ctrlKey && !e.metaKey && e.code !== "F5" && e.code !== "F12") e.stopImmediatePropagation(); return; }
        e.preventDefault(); e.stopImmediatePropagation(); if(k === "exit") h.exit && h.exit(); else h.key && h.key(k); };
    window.addEventListener("keydown", kd, true);
    const ku = (e) => { e.stopImmediatePropagation(); }; window.addEventListener("keyup", ku, true);
    let ip = null; if(pad.some((p) => p[0] === "type")){ ip = document.createElement("input"); ip.style.cssText = "position:absolute;opacity:0;bottom:0;left:0;width:1px;height:1px"; ip.autocapitalize = "off"; ip.autocomplete = "off"; root.appendChild(ip);
        ip.addEventListener("input", () => { const v = ip.value; ip.value = ""; for(const c of v.toLowerCase()) if(/[a-z\-]/.test(c) && h.input) h.input(c); }); cv.addEventListener("pointerdown", () => ip.focus()); setTimeout(() => ip.focus(), 50); }
    let last = performance.now(), raf = 0, gpPrev = {};
    const pollPad = () => { const gp = (navigator.getGamepads ? navigator.getGamepads() : []) || []; for(const p of gp){ if(!p) continue; const b = p.buttons, a = p.axes;
        const st = {left: (b[14] && b[14].pressed) || a[0] < -.5, right: (b[15] && b[15].pressed) || a[0] > .5, up: (b[12] && b[12].pressed) || a[1] < -.5, down: (b[13] && b[13].pressed) || a[1] > .5, ok: b[0] && b[0].pressed, alt: b[1] && b[1].pressed, exit: b[8] && b[8].pressed};
        for(const k in st){ if(st[k] && !gpPrev[k]){ if(k === "exit") h.exit && h.exit(); else h.key && h.key(k); } gpPrev[k] = st[k]; } break; } };
    const frame = (now) => { if(h.done) return; const dt = Math.min(.05, (now - last) / 1000); last = now; pollPad(); if(h.update) h.update(dt); if(h.draw){ h.g.clearRect(0, 0, W, H); h.draw(h.g); } raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    h.close = () => { h.done = true; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true); root.remove(); };
    x.addEventListener("click", () => h.exit && h.exit());
    return h;
}
const txt = (g, s, x, y, o) => { o = o || {}; g.font = (o.b === false ? "" : "bold ") + (o.size || 16) + "px sans-serif"; g.fillStyle = o.c || "#fff"; g.textAlign = o.a || "left"; g.textBaseline = o.v || "alphabetic"; g.fillText(s, x, y); };
const rr = (g, x, y, w, h, r, fill, stroke) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); if(fill){ g.fillStyle = fill; g.fill(); } if(stroke){ g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
const result = (h, ok, coins, text, title, resolve) => { h.over = {ok, coins, text, title}; h.overT = 0; resolve && 0; };

export function playGame(ctx, game, lv){
    return new Promise((resolve) => {
        const G = {memory, daifugo, typing, rhythm, runeSlot, fateCards, starRoulette, ruins}[game.id];
        const pads = {memory: [["left", "◀"], ["up", "▲"], ["down", "▼"], ["right", "▶"], ["ok", "めくる"]], daifugo: [["left", "◀"], ["right", "▶"], ["ok", "えらぶ"], ["up", "だす"], ["down", "パス"]], typing: [["type", "⌨ キーボード"]], rhythm: [["left", "ドン"], ["right", "カッ"]], runeSlot: [["ok", "とめる"], ["up", "やめる"]], fateCards: [["up", "▲ たかい"], ["down", "▼ ひくい"], ["ok", "かえる"]], starRoulette: [["left", "◀"], ["right", "▶"], ["ok", "スタート"], ["up", "やめる"]], ruins: [["left", "◀"], ["up", "▲"], ["down", "▼"], ["right", "▶"], ["ok", "あける"], ["alt", "かえる"]]}[game.id];
        const h = shell(game.n, pads); let fin = false;
        const finish = (r) => { if(fin) return; fin = true; h.close(); resolve(r); };
        h.finish = finish; h.exit = () => { if(h.over) return finish({coins: h.over.coins, text: h.over.text, title: h.over.title}); finish(null); };
        h.end = (coins, text, title) => { coins = Math.max(0, Math.round(coins)); h.over = {coins, text, title}; h.info("おわり！　" + (title || "") + "　コイン " + coins + "まい（けってい／もどるで おわる）"); const k0 = h.key; h.key = (k) => { if(k === "ok" || k === "alt") finish({coins, text, title}); }; h.tap = () => finish({coins, text, title}); h.update = null; };
        G(h, ctx, game, lv);
    });
}

// ---------------- 1. アイテム神経衰弱 ----------------
function memory(h, ctx, game, lv){
    const FACE = ["🍎", "🍙", "🍓", "🧪", "⚔️", "🛡️", "💎", "🔑", "🍄", "🌸", "🐟", "🐉", "🐢", "🌙", "⭐", "🍇", "🍋", "🎁", "👑", "🔔"];
    const n = lv.pairs, cols = n <= 6 ? 4 : n <= 10 ? 5 : 6, rows = Math.ceil(n * 2 / cols); const cw = Math.min(62, Math.floor((W - 20) / cols) - 6), ch = Math.min(70, Math.floor((H - 160) / rows) - 6);
    const cards = shuf(shuf(FACE.slice()).slice(0, n).flatMap((f) => [{f, s: 0}, {f, s: 0}])); let cur = 0, open = [], lock = 0, left = lv.sec, found = 0, flips = 0;
    const ox = (W - cols * (cw + 6) + 6) / 2, oy = 70;
    const flip = (i) => { const c = cards[i]; if(lock > 0 || c.s !== 0 || open.length >= 2) return; c.s = 1; open.push(i); ctx.A.se("move"); flips++;
        if(open.length === 2){ const [a, b] = open; if(cards[a].f === cards[b].f){ cards[a].s = cards[b].s = 2; open = []; found++; ctx.A.se("ok"); if(found === n){ const bonus = Math.max(.4, left / lv.sec); h.end(lv.coin * (.5 + bonus * .5) + (flips <= n * 2 + 2 ? lv.coin * .25 : 0), "ぜんぶ そろった！ のこり " + Math.ceil(left) + "びょう", "クリア！"); } } else lock = .7; } };
    h.key = (k) => { if(k === "left") cur = (cur + cards.length - 1) % cards.length; else if(k === "right") cur = (cur + 1) % cards.length; else if(k === "up") cur = (cur - cols + cards.length) % cards.length; else if(k === "down") cur = (cur + cols) % cards.length; else if(k === "ok" || k === "alt") flip(cur); };
    h.tap = (x, y) => { const c = Math.floor((x - ox) / (cw + 6)), r = Math.floor((y - oy) / (ch + 6)); const i = r * cols + c; if(c >= 0 && c < cols && r >= 0 && i < cards.length){ cur = i; flip(i); } };
    h.update = (dt) => { left -= dt; if(lock > 0){ lock -= dt; if(lock <= 0){ for(const i of open) cards[i].s = 0; open = []; } }
        if(left <= 0){ h.end(lv.coin * .3 * found / n, found + "/" + n + " ペア みつけた", "じかんぎれ"); } h.info("のこり " + Math.ceil(Math.max(0, left)) + "びょう　ペア " + found + "/" + n); };
    h.draw = (g) => { cards.forEach((c, i) => { const x = ox + (i % cols) * (cw + 6), y = oy + Math.floor(i / cols) * (ch + 6);
        rr(g, x, y, cw, ch, 8, c.s ? "#fff8e0" : "#5a3fb0", i === cur ? "#ffd43b" : "#222"); if(c.s) txt(g, c.f, x + cw / 2, y + ch / 2 + 2, {size: Math.min(cw, ch) * .6, a: "center", v: "middle", c: "#000"}); else txt(g, "？", x + cw / 2, y + ch / 2, {size: 22, a: "center", v: "middle", c: "#c9b8ff"}); }); };
}

// ---------------- 2. 友披露（トランプ）----------------
function daifugo(h, ctx, game){
    const SU = ["♠", "♥", "♦", "♣"], RN = {11: "J", 12: "Q", 13: "K", 14: "A", 15: "2"}; const rn = (r) => RN[r] || String(r);
    const deck = []; for(let s = 0; s < 4; s++) for(let r = 3; r <= 15; r++) deck.push({r, s}); shuf(deck);
    const hands = [[], [], [], []]; deck.forEach((c, i) => hands[i % 4].push(c)); for(const hd of hands) hd.sort((a, b) => a.r - b.r || a.s - b.s);
    const names = ["あなた", "ヒカリ", "ゴロー", "ミドリ"]; let field = null, turn = 0, last = -1, passes = 0, order = [], sel = new Set(), cur = 0, wait = 0.7, msg = "あなたの ばん（◀▶でえらぶ けってい／ ▲だす ▼パス）", shown = ["", "", "", ""];
    const alive = () => hands.map((x, i) => i).filter((i) => !order.includes(i));
    const nextAlive = (i) => { for(let k = 1; k <= 4; k++){ const j = (i + k) % 4; if(!order.includes(j)) return j; } return i; };
    const legal = (cs) => cs.length > 0 && cs.every((c) => c.r === cs[0].r) && (!field || (cs.length === field.n && cs[0].r > field.r));
    const play = (p, cs) => { for(const c of cs) hands[p].splice(hands[p].indexOf(c), 1); field = {n: cs.length, r: cs[0].r, cs}; last = p; passes = 0; shown[p] = cs.map((c) => SU[c.s] + rn(c.r)).join(" "); ctx.A.se("move");
        if(!hands[p].length){ order.push(p); shown[p] = "あがり！"; if(p === 0 || order.length >= 3) return fin(); }
        advance(); };
    const pass = (p) => { passes++; shown[p] = "パス"; advance(); };
    const advance = () => { turn = nextAlive(turn); wait = .8;
        if(passes >= alive().length - (order.includes(last) ? 0 : 1)){ field = null; passes = 0; shown = ["", "", "", ""]; if(order.includes(last)) turn = nextAlive(last); else turn = last; msg = turn === 0 ? "あなたが ばを ながした！ すきな カードを だそう" : names[turn] + "が ながした。"; } if(turn === 0) msg = field ? "あなたの ばん（ばの " + field.n + "まい より つよく）" : "あなたの ばん（すきなカードを だそう）"; };
    const cpu = (p) => { const hd = hands[p]; const groups = {}; hd.forEach((c) => (groups[c.r] = groups[c.r] || []).push(c));
        const opts = Object.values(groups).filter((gs) => !field || (gs.length >= field.n && gs[0].r > field.r)).map((gs) => gs.slice(0, field ? field.n : gs.length));
        if(!opts.length) return pass(p); if(field && Math.random() < .08 && hd.length > 3) return pass(p);
        opts.sort((a, b) => a[0].r - b[0].r || b.length - a.length); play(p, opts[0]); };
    const fin = () => { const place = order.indexOf(0) >= 0 ? order.indexOf(0) + 1 : 4; const coins = game.lv[0].coin[place - 1]; h.end(coins, "あなたは " + place + "いで あがり！", place + "い"); };
    h.key = (k) => { if(turn !== 0 || h.over) return; const hd = hands[0];
        if(k === "left") cur = (cur + hd.length - 1) % hd.length; else if(k === "right") cur = (cur + 1) % hd.length;
        else if(k === "ok" || k === "alt"){ const c = hd[cur]; if(sel.has(c)) sel.delete(c); else sel.add(c); ctx.A.se("move"); }
        else if(k === "up"){ const cs = hd.filter((c) => sel.has(c)); if(legal(cs)){ sel.clear(); play(0, cs); cur = Math.min(cur, hands[0].length - 1); } else { ctx.A.se("cancel"); msg = "そのカードは だせません。（おなじ かずの つよい カードを）"; } }
        else if(k === "down"){ if(!field){ msg = "さいしょの ばんは パスできません。"; ctx.A.se("cancel"); } else { sel.clear(); pass(0); } } };
    h.tap = (x, y) => { if(y > 380){ const hd = hands[0]; const sp = Math.min(40, (W - 60) / Math.max(1, hd.length)); const i = Math.floor((x - 20) / sp); if(i >= 0 && i < hd.length){ if(cur === i) h.key("ok"); else cur = i; } } else if(y > 300 && y < 380){ h.key(x < W / 2 ? "up" : "down"); } };
    h.update = (dt) => { if(h.over) return; wait -= dt; if(turn !== 0 && wait <= 0){ cpu(turn); } h.info(msg); };
    h.draw = (g) => {
        for(let p = 1; p < 4; p++){ const x = [0, 20, 130, 240][p]; rr(g, x, 20, 100, 70, 8, turn === p ? "#4c3a99" : "#2b2150", turn === p ? "#ffd43b" : "#fff"); txt(g, names[p], x + 8, 40, {size: 14}); txt(g, "🂠 ×" + hands[p].length, x + 8, 62, {size: 14}); txt(g, shown[p], x + 8, 82, {size: 12, c: "#ffe9a8"}); }
        rr(g, 40, 120, W - 80, 130, 14, "#1d6b43", "#fff"); txt(g, "ば", 55, 142, {size: 12, c: "#bdf"});
        if(field){ field.cs.forEach((c, i) => { const x = W / 2 - field.cs.length * 27 + i * 54; card(g, x, 150, c, false, false, 50, 76); }); txt(g, names[last] + "が だした", W / 2, 240, {size: 12, a: "center", c: "#cfe"}); } else txt(g, "（なにも ない）", W / 2, 190, {a: "center", c: "#cfe", size: 14});
        rr(g, 20, 300, 150, 52, 10, turn === 0 ? "#b8860b" : "#444", "#fff"); txt(g, "▲ だす", 95, 332, {a: "center"}); rr(g, 190, 300, 150, 52, 10, turn === 0 ? "#2b6cb0" : "#444", "#fff"); txt(g, "▼ パス", 265, 332, {a: "center"});
        const hd = hands[0], sp = Math.min(40, (W - 60) / Math.max(1, hd.length)); hd.forEach((c, i) => card(g, 20 + i * sp, sel.has(c) ? 380 : 400, c, i === cur, sel.has(c), 48, 76)); };
    const card = (g, x, y, c, cu, se, w, hh) => { rr(g, x, y, w, hh, 6, "#fffdf2", cu ? "#ffd43b" : "#333"); const red = c.s === 1 || c.s === 2; txt(g, rn(c.r), x + 4, y + 20, {size: 17, c: red ? "#d32" : "#111"}); txt(g, SU[c.s], x + 4, y + 40, {size: 18, c: red ? "#d32" : "#111"}); };
}

// ---------------- 3. タイピングチャレンジ ----------------
function typing(h, ctx, game, lv){
    const WORDS = [["ぼうけん", "bouken"], ["ぷるぷる", "purupuru"], ["ドラゴン", "doragon"], ["まほう", "mahou"], ["ゆうしゃ", "yuusha"], ["たからばこ", "takarabako"], ["おしろ", "oshiro"], ["かじ", "kaji"], ["コイン", "koin"], ["レベルアップ", "reberuappu"], ["ふっかつ", "fukkatu"], ["けいけんち", "keikenti"], ["ぼくじょう", "bokujou"], ["かくとうじょう", "kakutoujou"], ["てんしょく", "tensyoku"], ["ひかりのつるぎ", "hikarinotsurugi"], ["いかずち", "ikazuchi"], ["ほのお", "honoo"], ["まどうし", "madoushi"], ["せんし", "sensi"], ["たびだち", "tabidati"], ["ARE", "are"], ["ゴーレム", "go-remu"], ["ひみつきち", "himitukiti"]];
    const list = shuf(WORDS.slice()).slice(0, lv.n_words); let idx = 0, pos = 0, miss = 0, typed = 0, t = 0, fl = 0;
    h.input = (c) => { if(h.over) return; const w = list[idx][1]; typed++; if(c === w[pos]){ pos++; ctx.A.se("move"); if(pos >= w.length){ idx++; pos = 0; ctx.A.se("ok"); if(idx >= list.length){ const acc = typed ? (typed - miss) / typed : 0; const speed = Math.min(1.3, Math.max(.4, list.length * 3.2 / t)); h.end(lv.coin * acc * speed * 1.2, "せいかくさ " + Math.round(acc * 100) + "%　タイム " + t.toFixed(1) + "びょう", "クリア！"); } } } else { miss++; fl = .25; ctx.A.se("cancel"); } };
    h.update = (dt) => { if(!h.over) t += dt; fl = Math.max(0, fl - dt); h.info((idx + 1 > list.length ? list.length : idx + 1) + " / " + list.length + "　ミス " + miss + "　" + t.toFixed(1) + "びょう"); };
    h.draw = (g) => { if(idx >= list.length) return; const [k, r] = list[idx]; rr(g, 20, 120, W - 40, 220, 16, fl > 0 ? "#6b1f2a" : "#1d1a40", "#fff"); txt(g, k, W / 2, 190, {size: 34, a: "center"});
        g.font = "bold 26px monospace"; const w = g.measureText(r).width; let x = W / 2 - w / 2; for(let i = 0; i < r.length; i++){ const cw = g.measureText(r[i]).width; txt(g, r[i], x, 270, {size: 26, c: i < pos ? "#7be08a" : i === pos ? "#ffd43b" : "#fff"}); g.fillStyle = "#fff"; x += cw; }
        txt(g, "ローマ字で うとう（きほんの つづり）", W / 2, 320, {size: 12, a: "center", c: "#aab"}); txt(g, "スマホは 画面を タップして キーボードを だす", W / 2, 400, {size: 12, a: "center", c: "#889"}); };
}

// ---------------- 4. AREの達人（リズム）----------------
function rhythm(h, ctx, game, lv){
    const beat = 60 / lv.bpm; const notes = []; const total = 32; for(let i = 0; i < total; i++){ const sub = i % 4 === 3 && Math.random() < .5; notes.push({t: 2 + i * beat * (lv.bpm > 100 ? .5 : 1) * 1, lane: rnd(2), done: 0}); if(sub) notes.push({t: 2 + (i + .5) * beat * (lv.bpm > 100 ? .5 : 1), lane: rnd(2), done: 0}); }
    notes.sort((a, b) => a.t - b.t); let t = 0, ok = 0, combo = 0, best = 0, fb = "", fbT = 0; const Y = 400, SP = 260;
    const hit = (lane) => { if(h.over) return; let b = null; for(const n of notes){ if(n.done) continue; if(n.lane === lane && Math.abs(n.t - t) < .2 && (!b || Math.abs(n.t - t) < Math.abs(b.t - t))) b = n; }
        if(b){ const d = Math.abs(b.t - t); b.done = d < .06 ? 3 : d < .12 ? 2 : 1; ok += b.done === 3 ? 1 : b.done === 2 ? .7 : .4; combo++; best = Math.max(best, combo); fb = b.done === 3 ? "ばっちり！" : b.done === 2 ? "いいね" : "ギリギリ"; ctx.A.se(lane ? "hit" : "move"); } else { combo = 0; fb = "ミス"; } fbT = .5; };
    h.key = (k) => { if(k === "left" || k === "ok") hit(0); else if(k === "right" || k === "alt") hit(1); };
    h.tap = (x) => hit(x < W / 2 ? 0 : 1);
    h.update = (dt) => { t += dt; for(const n of notes) if(!n.done && t - n.t > .2){ n.done = -1; combo = 0; fb = "ミス"; fbT = .5; } fbT -= dt;
        if(notes.every((n) => n.done) && !h.over){ const r = ok / notes.length; h.end(lv.coin * (r * 1.2 + (best >= notes.length * .8 ? .25 : 0)), "せいこうりつ " + Math.round(r * 100) + "%　さいだい コンボ " + best, r >= .9 ? "パーフェクト！" : r >= .6 ? "いいかんじ！" : "もうすこし"); }
        h.info("コンボ " + combo + "　（ ◀/Z=ドン　▶/X=カッ ）"); };
    h.draw = (g) => { for(let l = 0; l < 2; l++){ rr(g, 30 + l * 150, 40, 150, 440, 0, l ? "#1a2c4a" : "#4a1a2a"); }
        g.fillStyle = "#fff"; g.fillRect(30, Y, 300, 4); for(let l = 0; l < 2; l++){ g.beginPath(); g.arc(105 + l * 150, Y + 2, 30, 0, 7); g.strokeStyle = l ? "#6cf" : "#f66"; g.lineWidth = 4; g.stroke(); txt(g, l ? "カッ" : "ドン", 105 + l * 150, Y + 70, {a: "center", size: 18, c: l ? "#6cf" : "#f66"}); }
        for(const n of notes){ if(n.done > 0 || n.done === -1 && 0) continue; const y = Y + 2 - (n.t - t) * SP; if(y < 20 || y > H) continue; g.beginPath(); g.arc(105 + n.lane * 150, y, 24, 0, 7); g.fillStyle = n.done === -1 ? "#555" : n.lane ? "#6cf" : "#f66"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 3; g.stroke(); }
        if(fbT > 0) txt(g, fb, W / 2, 250, {size: 28, a: "center", c: "#ffd43b"}); };
}

// ---------------- 5. ルーン・リール ----------------
export const SLOT_SYM = [["月", "#e8e8ff", .08, 60], ["星", "#ffd24a", .12, 20], ["剣", "#9ad0ff", .16, 10], ["杯", "#ff9a6a", .20, 6], ["鍵", "#b8e090", .20, 5], ["骸", "#9a8aa8", .24, 4]];
export function slotPick(r){ let x = r, a = 0; for(let i = 0; i < SLOT_SYM.length; i++){ a += SLOT_SYM[i][2]; if(x < a) return i; } return SLOT_SYM.length - 1; }
export function slotPay(a, b, c, bet){
    if(a === b && b === c) return bet * SLOT_SYM[a][3];
    if(a === b || b === c || a === c){ const s = a === b ? a : b === c ? b : a; return Math.round(bet * (SLOT_SYM[s][3] >= 20 ? 3 : 1.1)); }
    return 0;
}
function runeSlot(h, ctx, game, lv){
    const R = RR(ctx), bet = lv.bet; let reels = [0, 1, 2], stop = [true, true, true], spins = 0, phase = "ready", pos = [0, 0, 0], total = 0, msg = "けってい／めくる で まわす", t = 0, next = 0, hist = [];
    const stopAt = [0, 0, 0];
    const spin = () => { if(spins >= lv.rounds){ return; } spins++; stop = [false, false, false]; phase = "spin"; next = 0; msg = "とめる：けってい を 3かい"; ctx.A.se("ok"); };
    const stopNext = () => { const i = stop.findIndex((s) => !s); if(i < 0) return; reels[i] = slotPick(R()); stop[i] = true; ctx.A.se("move");
        if(stop.every((s) => s)){ const p = slotPay(reels[0], reels[1], reels[2], bet); total += p; hist.push(p); phase = "result"; msg = p > 0 ? "あたり！ +" + p + "まい" : "はずれ…"; ctx.A.se(p > 0 ? "levelup" : "cancel"); } };
    h.key = (k) => { if(h.over) return; if(k === "ok" || k === "alt" || k === "down"){ if(phase === "ready" || phase === "result"){ if(spins >= lv.rounds) finishIt(); else spin(); } else if(phase === "spin") stopNext(); } if(k === "up" && (phase === "ready" || phase === "result") && spins > 0) finishIt(); };
    h.tap = () => h.key("ok");
    const finishIt = () => { h.end(total, spins + "かい まわして " + total + "まい もどった（かけ金 " + bet + "まい × " + spins + "かい）", total >= bet * spins ? "かち！" : "また こんど…"); };
    h.update = (dt) => { t += dt; for(let i = 0; i < 3; i++) if(!stop[i]) pos[i] += dt * 14; };
    h.draw = (g) => {
        txt(g, "ルーン・リール", W / 2, 38, {size: 22, a: "center", c: "#ffd24a"}); txt(g, "かけ金 " + bet + "まい／1かい　のこり " + (lv.rounds - spins) + "かい", W / 2, 62, {size: 13, a: "center", c: "#cfc"});
        for(let i = 0; i < 3; i++){ const x = 36 + i * 100; rr(g, x, 110, 92, 130, 12, "#1c1840", "#ffffff"); const idx = stop[i] ? reels[i] : Math.floor(pos[i]) % 6; const s = SLOT_SYM[idx]; txt(g, s[0], x + 46, 200, {size: 64, a: "center", c: s[1]}); if(!stop[i]) { g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x, 110, 92, 130); } }
        txt(g, msg, W / 2, 280, {size: 15, a: "center", c: "#ffe9a8"}); txt(g, "ごうけい もどり " + total + "まい", W / 2, 306, {size: 14, a: "center"});
        txt(g, "やくひょう", W / 2, 346, {size: 12, a: "center", c: "#9bd"}); SLOT_SYM.forEach((s, i) => txt(g, s[0] + "×3 = " + s[3] + "ばい", 40 + (i % 3) * 110, 372 + Math.floor(i / 3) * 22, {size: 13, c: s[1]}));
        txt(g, "ふたつ そろい：" + "月・星は 3ばい／ほかは 1.1ばい", W / 2, 428, {size: 11, a: "center", c: "#889"}); txt(g, "▲ で やめる（もどる ぶんは もらえる）", W / 2, 452, {size: 11, a: "center", c: "#889"});
    };
    h.info("かけ金 " + bet + "まい。 けってい で まわして 3かい とめよう。");
}

// ---------------- 6. 運命のカード（ハイ＆ロー）----------------
export function fateMult(streak){ return [0, 1.2, 1.5, 2, 2.6, 3.4, 4.4, 5.7][Math.min(streak, 7)]; }
function fateCards(h, ctx, game, lv){
    const R = RR(ctx), bet = lv.bet; let cur = 1 + Math.floor(R() * 13), streak = 0, phase = "pick", shown = null, msg = "つぎの カードは たかい？ ひくい？", t = 0;
    const pick = (dir) => { if(phase !== "pick") return; let nx = 1 + Math.floor(R() * 13); shown = nx; phase = "flip"; t = 0; h._dir = dir; h._nx = nx; };
    const cash = () => { if(phase !== "pick" || streak < 1) return; h.end(Math.round(bet * fateMult(streak)), streak + "れんしょう！ " + fateMult(streak) + "ばい", "かち！"); };
    h.key = (k) => { if(h.over) return; if(k === "up") pick("hi"); else if(k === "down") pick("lo"); else if(k === "ok" || k === "alt") cash(); };
    h.tap = (x, y) => { if(y < 250) pick("hi"); else if(y < 330) pick("lo"); else cash(); };
    h.update = (dt) => { t += dt; if(phase === "flip" && t > .9){ const nx = h._nx, d = h._dir; const win = d === "hi" ? nx > cur : nx < cur; if(nx === cur){ msg = "おなじ！ もういちど ひきなおし"; cur = nx; phase = "pick"; } else if(win){ streak++; cur = nx; msg = "あたり！ " + streak + "れんしょう（" + fateMult(streak) + "ばい）"; ctx.A.se("levelup"); phase = streak >= 7 ? "max" : "pick"; if(phase === "max") h.end(Math.round(bet * fateMult(streak)), "7れんしょう！ マスター", "でんせつ！"); } else { msg = "はずれ…"; ctx.A.se("cancel"); phase = "lost"; h.end(0, streak + "れんしょうで おしい！", "また こんど…"); } shown = null; } };
    h.draw = (g) => {
        txt(g, "運命のカード", W / 2, 38, {size: 22, a: "center", c: "#ffd24a"}); txt(g, "かけ金 " + bet + "まい　れんしょう " + streak + "　いま " + Math.round(bet * fateMult(streak)) + "まい", W / 2, 62, {size: 13, a: "center", c: "#cfc"});
        const card = (x, v, back) => { rr(g, x, 90, 110, 150, 12, back ? "#3a2a70" : "#f4efe0", "#fff"); if(!back) txt(g, String(v), x + 55, 188, {size: 56, a: "center", c: v >= 11 ? "#c03040" : "#202030"}); else txt(g, "?", x + 55, 188, {size: 56, a: "center", c: "#8f80d0"}); };
        card(40, cur, false); card(210, shown === null ? 0 : shown, shown === null || t < .45);
        txt(g, msg, W / 2, 280, {size: 15, a: "center", c: "#ffe9a8"});
        rr(g, 40, 300, 130, 44, 10, "#2c4a7a", "#fff"); txt(g, "▲ たかい", 105, 330, {size: 18, a: "center"}); rr(g, 190, 300, 130, 44, 10, "#7a2c4a", "#fff"); txt(g, "▼ ひくい", 255, 330, {size: 18, a: "center"});
        rr(g, 90, 360, 180, 44, 10, streak ? "#2c7a4a" : "#333", "#fff"); txt(g, "けってい：かえる", W / 2, 390, {size: 16, a: "center"});
        txt(g, "1〜13。おなじ数字は ひきなおし。7れんしょうで 5.7ばい！", W / 2, 440, {size: 11, a: "center", c: "#889"});
    };
}

// ---------------- 7. 星のルーレット ----------------
export const ROU = ["金", "青", "赤", "青", "赤", "無", "青", "赤", "青", "赤", "青", "赤"];
export function rouPay(color, hit, bet){ if(color === "金") return hit === "金" ? bet * 11 : 0; return hit === color ? Math.round(bet * 2.3) : 0; }
function starRoulette(h, ctx, game, lv){
    const R = RR(ctx), bet = lv.bet; let sel = 1, phase = "pick", ang = 0, spd = 0, target = 0, t = 0, msg = "いろを えらんで けってい", rounds = 0, total = 0;
    const COL = {"金": "#ffd24a", "青": "#4a90e8", "赤": "#e0506a", "無": "#3a3a48"};
    const go = () => { if(phase !== "pick") return; if(rounds >= lv.rounds) return fin(); phase = "spin"; rounds++; spd = 9 + R() * 4; t = 0; const hit = Math.floor(R() * 12); h._hit = hit; target = hit; };
    const fin = () => h.end(total, rounds + "かい あそんで " + total + "まい もどった", total >= bet * rounds ? "かち！" : "また こんど…");
    h.key = (k) => { if(h.over) return; if(phase === "pick"){ if(k === "left") sel = (sel + 2) % 3; else if(k === "right") sel = (sel + 1) % 3; else if(k === "ok" || k === "alt") go(); else if(k === "up" && rounds > 0) fin(); } else if(phase === "show" && (k === "ok" || k === "alt")){ phase = "pick"; if(rounds >= lv.rounds) fin(); } };
    h.tap = (x, y) => { if(phase === "pick"){ if(y > 330 && y < 390){ sel = x < 120 ? 0 : x < 240 ? 1 : 2; } else go(); } else if(phase === "show") h.key("ok"); };
    h.update = (dt) => { if(phase === "spin"){ t += dt; spd = Math.max(0, spd - dt * 3.2); ang += spd * dt; if(spd <= 0){ const per = Math.PI * 2 / 12; ang = -(h._hit + .5) * per + Math.PI / 2 * 0; phase = "show"; const hitC = ROU[h._hit], col = ["金", "青", "赤"][sel]; const p = rouPay(col, hitC, bet); total += p; msg = hitC + "に とまった！ " + (p ? "+" + p + "まい" : "はずれ…"); ctx.A.se(p ? "levelup" : "cancel"); } } };
    h.draw = (g) => {
        txt(g, "星のルーレット", W / 2, 36, {size: 22, a: "center", c: "#ffd24a"}); txt(g, "かけ金 " + bet + "まい／1かい　のこり " + (lv.rounds - rounds) + "かい　もどり " + total + "まい", W / 2, 58, {size: 12, a: "center", c: "#cfc"});
        const cx = W / 2, cy = 190, r = 110, per = Math.PI * 2 / 12;
        for(let i = 0; i < 12; i++){ g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, ang + i * per - Math.PI / 2, ang + (i + 1) * per - Math.PI / 2); g.closePath(); g.fillStyle = COL[ROU[i]]; g.fill(); g.strokeStyle = "#101020"; g.lineWidth = 2; g.stroke(); }
        g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.fillStyle = "#14102a"; g.fill(); g.beginPath(); g.moveTo(cx - 10, cy - r - 14); g.lineTo(cx + 10, cy - r - 14); g.lineTo(cx, cy - r + 6); g.closePath(); g.fillStyle = "#fff"; g.fill();
        txt(g, msg, W / 2, 330, {size: 14, a: "center", c: "#ffe9a8"});
        ["金（×11）", "青（×2.3）", "赤（×2.3）"].forEach((s, i) => { rr(g, 12 + i * 116, 346, 108, 40, 10, sel === i ? "#3a5a9a" : "#26204a", sel === i ? "#ffd24a" : "#fff"); txt(g, s, 66 + i * 116, 372, {size: 14, a: "center", c: ["#ffd24a", "#8fc0ff", "#ff9aaa"][i]}); });
        txt(g, "◀▶ えらぶ　けってい スタート　▲ やめる", W / 2, 420, {size: 11, a: "center", c: "#889"});
    };
}

// ---------------- 8. ひかりの遺跡（あてっこ探検）----------------
export function ruinsMult(n, traps){ if(n <= 0) return 0; let p = 1; for(let i = 0; i < n; i++) p *= (25 - traps - i) / (25 - i); return Math.max(1.05, Math.round(0.93 / p * 100) / 100); }
function ruins(h, ctx, game, lv){
    const R = RR(ctx), bet = lv.bet, N = 5, T = lv.traps; const trap = new Set(); while(trap.size < T) trap.add(Math.floor(R() * N * N));
    const open = new Set(); let cur = 12, phase = "play", msg = "タイルを あけよう。罠は " + T + "こ。";
    const cash = () => { if(phase !== "play" || open.size < 1) return; h.end(Math.round(bet * ruinsMult(open.size, T)), open.size + "まい あけて でた！ " + ruinsMult(open.size, T) + "ばい", "かち！"); };
    const dig = (i) => { if(phase !== "play" || open.has(i)) return; if(trap.has(i)){ phase = "lost"; for(const t of trap) open.add(t); msg = "罠だ！"; ctx.A.se("cancel"); h.end(0, "罠に かかった…", "また こんど…"); } else { open.add(i); ctx.A.se("move"); msg = "セーフ！ いま " + Math.round(bet * ruinsMult(open.size - 0, T)) + "まい"; if(open.size >= N * N - T){ cash(); } } };
    h.key = (k) => { if(h.over) return; if(k === "left") cur = (cur % N) ? cur - 1 : cur; else if(k === "right") cur = ((cur + 1) % N) ? cur + 1 : cur; else if(k === "up") cur = cur >= N ? cur - N : cur; else if(k === "down") cur = cur < N * (N - 1) ? cur + N : cur; else if(k === "ok") dig(cur); else if(k === "alt") cash(); };
    h.tap = (x, y) => { const c = Math.floor((x - 30) / 60), r = Math.floor((y - 90) / 60); if(c >= 0 && c < N && r >= 0 && r < N){ cur = r * N + c; dig(cur); } else if(y > 410) cash(); };
    h.draw = (g) => {
        txt(g, "ひかりの遺跡", W / 2, 36, {size: 22, a: "center", c: "#ffd24a"}); txt(g, "かけ金 " + bet + "まい　罠 " + T + "こ　あけた " + [...open].filter((i) => !trap.has(i)).length + "まい", W / 2, 60, {size: 13, a: "center", c: "#cfc"});
        for(let i = 0; i < N * N; i++){ const x = 30 + (i % N) * 60, y = 90 + Math.floor(i / N) * 60; const o = open.has(i), tr = trap.has(i); rr(g, x + 2, y + 2, 56, 56, 8, o ? (tr ? "#7a2030" : "#2c6a4a") : (i === cur ? "#4a4290" : "#2a2458"), i === cur ? "#ffd24a" : "#8a80c0"); if(o) txt(g, tr ? "罠" : "✦", x + 30, y + 42, {size: 28, a: "center", c: tr ? "#ff9a9a" : "#ffe9a8"}); }
        txt(g, msg, W / 2, 410, {size: 14, a: "center", c: "#ffe9a8"}); txt(g, "けってい あける　もどる/Shift で かえる（" + Math.round(bet * ruinsMult(Math.max(0, open.size), T)) + "まい）", W / 2, 440, {size: 11, a: "center", c: "#889"});
    };
}
