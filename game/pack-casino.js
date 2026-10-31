"use strict";
// ===== 追加パック：カジノ（5ゲーム）=====
// CAS001 アイテム神経衰弱 / CAS002 友披露（大富豪）/ CAS003 タイピングチャレンジ（PCのみ）/ CAS004 AREの達人（リズム）/ CAS005 AREシューティング（2Dシューティング・独自追加）
// どのゲームも「ゲームの結果から」ごほうびを計算する（画面の表示値は信用しない）。コインは 1コイン＝5G。
const PK_SHOOT = {id:"CAS005", name:"AREシューティング", platforms:["PC", "スマートフォン"], type:"shooting", summary:"ノイズの 的を ねらって うつ 的あて シューティング。3ステージ ＋ ボス（マウス・タッチ・コントローラー対応）。むずかしさは 3だんかい。",
    difficulty_levels:[{id:"easy", name:"初級"}, {id:"normal", name:"中級"}, {id:"hard", name:"上級"}]};
const PK_BGM_FILES = ["opening", "field", "town", "sea", "cave", "castle", "demoncastle", "mainbattle", "midboss", "lastboss", "secretboss", "save", "ending"];   // AREの達人の13曲：すでに入っている BGM を そのまま つかう
function pkIsTouch(){ try{ return document.body.classList.contains("touch"); }catch(_e){ return false; } }
function pkCasList(){ return PK.L.games.concat([PK_SHOOT]); }
function pkCasDef(id){ return PK.GM[id] || (id === "CAS005" ? PK_SHOOT : null); }
function pkCasRec(id){ const p = pkS(); return (p.cas[id] = p.cas[id] || {plays:0, best:0, coins:0, items:0, high:0}); }
function pkCasFinish(id, o){
    // o = {coins, items, score, high}
    const p = pkS(), r = pkCasRec(id); r.plays++; r.coins += o.coins || 0; r.items += o.items || 0; r.best = Math.max(r.best, o.score || 0); if(o.high) r.high = 1;
    pkAddCoins(o.coins || 0); p.cnt.casino++; if(id === "CAS004") p.cnt.music++;
    pkQuestTick(); pkAchCheck();
}
function pkBeep(f, d, v){ try{ if(!G.set.voice && !G.set.bgm) return; const A = window.AudioContext || window.webkitAudioContext; if(!A) return; G.ac = G.ac || new A(); const o = G.ac.createOscillator(), g = G.ac.createGain(); o.frequency.value = f; o.type = "square"; g.gain.value = v || 0.04; o.connect(g); g.connect(G.ac.destination); o.start(); o.stop(G.ac.currentTime + (d || 0.06)); }catch(_e){} }
function pkShuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(G.rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------------------------------------------------------------- メニュー
function pkCasMenuHtml(){
    const touch = pkIsTouch();
    return pkCasList().map((g) => {
        const r = pkCasRec(g.id), dis = g.id === "CAS003" && touch;
        const lv = g.difficulty_levels || [{id:"normal", name:"ふつう"}];
        const btns = g.id === "CAS003" ? tyMenuBtns(g, dis) : g.id === "CAS002" ? pkBtn("あそぶ", "cas|" + g.id + "|normal") + pkBtn("ルールせつめい", "cas|" + g.id + "|help", {sub:1}) :
            g.id === "CAS004" ? '<label class="meta">曲：<select id="pkSong">' + g.songs.map((s, i) => '<option value="' + i + '"' + (G.pk.song === i ? " selected" : "") + '>' + (i + 1) + '. ' + esc(s.title) + '（BPM' + s.bpm + '）</option>').join("") + '</select></label> ' + lv.map((d) => pkBtn(esc(d.name), "cas|" + g.id + "|" + d.id, {dis})).join("") :
            lv.map((d) => pkBtn(esc(d.name), "cas|" + g.id + "|" + d.id, {dis})).join("");
        return '<div class="card"><b>' + esc(g.name) + '</b> <span class="meta">' + g.platforms.map((x) => x === "スマートフォン" ? "📱" : "🖥️").join("") + '　あそんだ ' + r.plays + '回・ベスト ' + pkNum(r.best) + '・かせいだ 🪙' + pkNum(r.coins) + (r.high ? '　⭐高評価' : '') + '</span><div class="meta">' + esc(g.summary) + (dis ? '<br>※ このゲームは パソコンの キーボードで あそびます。' : '') + '</div><div class="row">' + btns + '</div></div>';
    }).join("");
}
function pkCasDo(c, a){
    if(c === "cas"){
        const id = a[1], d = a[2], u = G.pk; if(d === "help"){ u.game = {id, help:true}; render(); return true; }
        if(id === "CAS004"){ const sel = $("pkSong"); u.song = sel ? Number(sel.value) : (u.song || 0); }
        const r = pkCasStart(id, d); if(!r.ok){ u.msg = r.msg; } render(); return true;
    }
    if(c === "cflip"){ pkMemFlip(Number(a[1])); return true; }
    if(c === "cdsel"){ pkDfSel(Number(a[1])); return true; }
    if(c === "cdplay"){ pkDfHumanPlay(); return true; }
    if(c === "cdpass"){ pkDfHumanPass(); return true; }
    if(c === "cdopt"){ const g = G.pk.game; if(g && g.opts && g.phase === "setup"){ g.opts[a[1]] = !g.opts[a[1]]; render(); } return true; }
    if(c === "cdgo"){ pkDfBegin(); return true; }
    if(c === "cend"){ const u = G.pk; pkCasAbort(); u.game = null; render(); return true; }
    if(c === "cagain"){ const g = G.pk.game; const id = g.id, d = g.diff; pkCasAbort(); const r = pkCasStart(id, d); if(!r.ok) G.pk.msg = r.msg; render(); return true; }
    if(c === "tgo"){ pkTypeBegin(); return true; }
    if(c === "rgo"){ pkRhBegin(); return true; }
    if(c === "sgo"){ pkShBegin(); return true; }
    if(c === "rhdon"){ pkRhHit("don"); return true; }
    if(c === "rhka"){ pkRhHit("ka"); return true; }
    if(c === "rhrap"){ pkRhHit("rap"); return true; }
    return false;
}
function pkCasStart(id, diff){
    const u = G.pk; pkCasAbort();
    if(id === "CAS003" && pkIsTouch()) return {ok:false, msg:"タイピングチャレンジは パソコンの キーボードで あそぶゲームです。"};
    const token = (u.token = (u.token || 0) + 1);
    if(id === "CAS001") u.game = pkMemNew(diff, token);
    else if(id === "CAS002") u.game = pkDfNew(token);
    else if(id === "CAS003") u.game = pkTypeNew(diff, token);
    else if(id === "CAS004") u.game = pkRhNew(diff, u.song || 0, token);
    else if(id === "CAS005") u.game = pkShNew(diff, token);
    else return {ok:false, msg:"？"};
    return {ok:true};
}
function pkCasAbort(){
    const u = G.pk; if(!u) return; const g = u.game;
    u.token = (u.token || 0) + 1; clearInterval(u.tmr); clearTimeout(u.tm2); if(u.raf) cancelAnimationFrame(u.raf); u.raf = 0;
    if(g && g.audio){ try{ g.audio.pause(); }catch(_e){} g.audio = null; }
    G.pkQuiet = false; try{ if(window.tqBgmSync) tqBgmSync(); }catch(_e){}
    if(u.keyup){ u.keys = {}; }
}
function pkCasGameView(){
    const g = G.pk.game; if(!g) return "";
    if(g.help) return pkDfHelp();
    const head = '<div class="row"><b>' + esc((pkCasDef(g.id) || {}).name || "") + '</b>' + pkBtn("やめる", "cend", {sub:1}) + '</div>';
    if(g.id === "CAS001") return head + pkMemView(g);
    if(g.id === "CAS002") return head + pkDfView(g);
    if(g.id === "CAS003") return head + pkTypeView(g);
    if(g.id === "CAS004") return head + pkRhView(g);
    if(g.id === "CAS005") return head + pkShView(g);
    return head;
}
function pkCasAfterRender(){
    const g = G.pk.game; if(!g) return;
    if(g.id === "CAS003") pkTypeAfter(g); else if(g.id === "CAS004") pkRhAfter(g); else if(g.id === "CAS005") pkShAfter(g);
}
function pkCasKey(k, e){
    const g = G.pk.game; if(!g) return false;
    if(k === "cancel" && g.phase !== "play" && !g.help){ pkCasAbort(); G.pk.game = null; render(); return true; }
    if(g.help && (k === "cancel" || k === "ok")){ G.pk.game = null; render(); return true; }
    if((g.id === "CAS004" || g.id === "CAS005" || g.id === "CAS003") && g.phase === "play"){ if(k === "cancel"){ pkCasAbort(); G.pk.game = null; render(); } else if(k === "ok" && g.id === "CAS004") pkRhHit("rap"); return true; }
    return false;
}
// ---- キーボード（F / J / 矢印 / スペース）
document.addEventListener("keydown", (e) => {
    if(G.mode !== "pack" || !G.pk || !G.pk.game) return; const g = G.pk.game, k = e.key;
    if(g.id === "CAS004" && g.phase === "play"){
        if(e.ctrlKey || e.metaKey || e.altKey) return;
        if(k === "f" || k === "F"){ e.preventDefault(); if(!e.repeat) pkRhHit("don"); }
        else if(k === "j" || k === "J"){ e.preventDefault(); if(!e.repeat) pkRhHit("ka"); }
        else if(k === "Enter"){ e.preventDefault(); e.stopPropagation(); pkRhHit("rap"); }
    }else if(g.id === "CAS005" && g.phase === "play"){
        const m = {ArrowUp:"up", w:"up", W:"up", ArrowDown:"down", s:"down", S:"down", ArrowLeft:"left", a:"left", A:"left", ArrowRight:"right", d:"right", D:"right", " ":"fire"}[k];
        if(m){ e.preventDefault(); e.stopPropagation(); g.keys[m] = true; }
    }
}, true);
document.addEventListener("keyup", (e) => {
    if(G.mode !== "pack" || !G.pk || !G.pk.game || G.pk.game.id !== "CAS005") return; const g = G.pk.game;
    const m = {ArrowUp:"up", w:"up", W:"up", ArrowDown:"down", s:"down", S:"down", ArrowLeft:"left", a:"left", A:"left", ArrowRight:"right", d:"right", D:"right", " ":"fire"}[e.key]; if(m) g.keys[m] = false;
}, true);

// ================================================================ 1. アイテム神経衰弱
function pkCalcMemory(diff, matched, total, timeLeft, limit){
    const base = diff.coin_reward, cleared = matched >= total;
    return cleared ? base + Math.floor(base * 0.5 * Math.max(0, timeLeft) / limit) : Math.floor(base * 0.5 * matched / total);
}
function pkMemNew(did, token){
    const def = PK.GM.CAS001, diff = def.difficulty_levels.find((d) => d.id === did) || def.difficulty_levels[0];
    const pool = pkShuffle(PK.L.items.slice()).slice(0, diff.pair_count), deck = pkShuffle(pool.concat(pool).map((x) => x.id));
    const g = {id:"CAS001", diff:diff.id, d:diff, cards:deck.map((x) => ({id:x, up:false, done:false})), first:-1, lock:false, matched:0, miss:0, left:diff.time_limit_seconds, items:[], phase:"play", token, t0:Date.now(), res:null};
    const u = G.pk; clearInterval(u.tmr);
    u.tmr = setInterval(() => {
        if(!u.game || u.game !== g || u.token !== token || g.phase !== "play") { clearInterval(u.tmr); return; }
        g.left = Math.max(0, g.d.time_limit_seconds - Math.floor((Date.now() - g.t0) / 1000));
        const el = $("pkTimer"); if(el) el.textContent = "のこり " + g.left + "秒";
        if(g.left <= 0) pkMemEnd(g);
    }, 250);
    return g;
}
function pkMemFlip(i){
    const g = G.pk.game; if(!g || g.id !== "CAS001" || g.phase !== "play" || g.lock) return; const c = g.cards[i]; if(!c || c.up || c.done) return;
    c.up = true;
    if(g.first < 0){ g.first = i; render(); return; }
    const a = g.cards[g.first]; const fi = g.first; g.first = -1;
    if(a.id === c.id){
        a.done = c.done = true; g.matched++; g.items.push(c.id); pkGive(c.id, 1); pkBeep(880, 0.08);
        if(g.matched >= g.cards.length / 2){ pkMemEnd(g); return; }
        render(); return;
    }
    g.miss++; g.lock = true; render();
    const tok = g.token; setTimeout(() => { if(G.pk.game !== g || g.token !== tok) return; a.up = false; c.up = false; g.lock = false; render(); }, G.pk.fast ? 0 : 700);
}
function pkMemEnd(g){
    if(g.phase !== "play") return; g.phase = "end"; clearInterval(G.pk.tmr);
    const total = g.cards.length / 2, left = Math.max(0, g.d.time_limit_seconds - Math.floor((Date.now() - g.t0) / 1000)), cleared = g.matched >= total;
    const coins = pkCalcMemory(g.d, g.matched, total, cleared ? left : 0, g.d.time_limit_seconds);
    g.res = {coins, cleared, matched:g.matched, total, miss:g.miss, items:g.items.slice()};
    pkCasFinish("CAS001", {coins, items:g.items.length, score:coins, high:cleared && g.diff === "hard"});
    render();
}
function pkMemView(g){
    if(g.phase === "end"){
        const r = g.res; return '<div class="card"><h3>' + (r.cleared ? "クリア！" : "じかんぎれ…") + '</h3><div>そろえた ペア ' + r.matched + '/' + r.total + '　まちがい ' + r.miss + '回</div><div class="okc">🪙 ' + pkNum(r.coins) + ' コインを てにいれた！</div><div class="meta">てにいれた どうぐ：' + (r.items.map((id) => esc(PK.I[id].name)).join("・") || "なし") + '</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>';
    }
    const cols = g.cards.length <= 12 ? 4 : g.cards.length <= 20 ? 5 : 6;
    return '<div class="meta"><span id="pkTimer">のこり ' + g.left + '秒</span>　そろえた ' + g.matched + '/' + g.cards.length / 2 + '　まちがい ' + g.miss + '　（' + esc(g.d.name) + '：クリアで 🪙' + g.d.coin_reward + '〜）</div><div class="cg" style="grid-template-columns:repeat(' + cols + ',1fr)">' +
        g.cards.map((c, i) => '<button class="mc' + (c.up || c.done ? " up" : "") + (c.done ? " dn" : "") + '" data-a="pk" data-v="cflip|' + i + '"' + (c.done ? " disabled" : "") + '>' + (c.up || c.done ? (PK_IT_ICON[PK.I[c.id].category] || "🎁") + '<small>' + esc(PK.I[c.id].name) + '</small>' : "？") + '</button>').join("") + '</div>';
}

// ================================================================ 2. 友披露（大富豪）
const PK_SUITS = ["♠", "♥", "♦", "♣"];
function pkRankLab(r){ return r === 16 ? "JOKER" : ({11:"J", 12:"Q", 13:"K", 14:"A", 15:"2"})[r] || String(r); }
function pkDfNew(token){ return {id:"CAS002", phase:"setup", opts:{kaidan:false, revo:true, cut8:true, back11:true, skip5:true, rev9:true, bonus12:true, spade3:true}, token}; }
function pkDfDeck(){ const d = []; for(let s = 0; s < 4; s++) for(let r = 3; r <= 15; r++) d.push({s, r}); d.push({s:4, r:16}, {s:4, r:16}); return d; }
function pkDfStr(c, g){ if(c.r === 16) return 99; return g.inv ? 18 - c.r : c.r; }
function pkDfBegin(){
    const g = G.pk.game; if(!g || g.phase !== "setup") return;
    const deck = pkShuffle(pkDfDeck()); g.hands = [[], [], [], []]; deck.forEach((c, i) => g.hands[i % 4].push(c));
    g.hands.forEach((h) => h.sort((a, b) => a.r - b.r || a.s - b.s));
    g.field = null; g.last = -1; g.turn = Math.floor(G.rnd() * 4); g.dir = 1; g.inv = false; g.rev = false; g.back = false; g.passes = 0; g.order = []; g.sel = []; g.log = ["ゲームスタート！"]; g.bonus = 0; g.count = 0; g.phase = "play"; g.hold = false; g.res = null;
    pkDfNext(g);
}
// 出し方の判定。cards：選んだカード。戻り：{ok, kind, n, rank, seq, why}
function pkDfAnalyze(cards){
    const jk = cards.filter((c) => c.r === 16), nj = cards.filter((c) => c.r !== 16);
    if(!cards.length) return {ok:false, why:"カードを えらんでね。"};
    if(!nj.length){ return jk.length <= 2 ? {ok:true, kind:"set", n:cards.length, rank:16, seq:false} : {ok:false, why:"?"}; }
    if(nj.every((c) => c.r === nj[0].r)) return {ok:true, kind:"set", n:cards.length, rank:nj[0].r, seq:false};
    if(!jk.length && cards.length >= 3 && nj.every((c) => c.s === nj[0].s)){
        const rs = nj.map((c) => c.r).sort((a, b) => a - b); let ok = true; for(let i = 1; i < rs.length; i++) if(rs[i] !== rs[i - 1] + 1) ok = false;
        if(ok) return {ok:true, kind:"seq", n:cards.length, rank:rs[0], seq:true, top:rs[rs.length - 1]};
    }
    return {ok:false, why:"その 組みあわせは だせません。"};
}
function pkDfCanPlay(g, cards){
    const a = pkDfAnalyze(cards); if(!a.ok) return a;
    if(a.kind === "seq" && !g.opts.kaidan) return {ok:false, why:"階段は オフです。"};
    const f = g.field; if(!f) return a;
    // スペードの3返し：1まいの ジョーカーには ♠3
    if(g.opts.spade3 && f.n === 1 && f.rank === 16 && a.kind === "set" && a.n === 1 && cards[0].r === 3 && cards[0].s === 0) return Object.assign({}, a, {spade3:true});
    if(a.kind !== f.kind || a.n !== f.n) return {ok:false, why:"場と おなじ まいすう・かたちで だそう。"};
    const sa = a.rank === 16 ? 99 : (g.inv ? 18 - a.rank : a.rank), sf = f.rank === 16 ? 99 : (g.inv ? 18 - f.rank : f.rank);
    if(a.kind === "seq"){ const sa2 = g.inv ? 18 - a.top : a.rank, sf2 = g.inv ? 18 - f.top : f.rank; if(sa2 <= sf2) return {ok:false, why:"場より 強い 階段を！"}; return a; }
    if(sa <= sf) return {ok:false, why:"場より 強い カードを だそう。"};
    return a;
}
function pkDfEnum(g, hand){
    const out = [], by = {};
    hand.forEach((c, i) => { if(c.r === 16) return; (by[c.r] = by[c.r] || []).push(i); });
    hand.forEach((c, i) => out.push([i]));
    Object.keys(by).forEach((r) => { const ix = by[r]; for(let k = 2; k <= ix.length; k++){ const comb = (arr, k2) => k2 === 0 ? [[]] : arr.flatMap((x, j) => comb(arr.slice(j + 1), k2 - 1).map((t) => [x].concat(t))); comb(ix, k).forEach((c2) => out.push(c2)); } });
    if(g.opts.kaidan){
        for(let s = 0; s < 4; s++){ const cs = hand.map((c, i) => ({c, i})).filter((x) => x.c.s === s && x.c.r !== 16).sort((a, b) => a.c.r - b.c.r); for(let i = 0; i < cs.length; i++){ for(let j = i + 2; j < cs.length; j++){ let ok = true; for(let k = i + 1; k <= j; k++) if(cs[k].c.r !== cs[k - 1].c.r + 1) ok = false; if(ok) out.push(cs.slice(i, j + 1).map((x) => x.i)); } } }
    }
    return out.filter((ix) => pkDfCanPlay(g, ix.map((i) => hand[i])).ok);
}
function pkDfLog(g, t){ g.log.push(t); if(g.log.length > 6) g.log.shift(); }
function pkDfActive(g){ return [0, 1, 2, 3].filter((i) => g.hands[i].length > 0); }
function pkDfNextIdx(g, from){ let i = from; for(let k = 0; k < 8; k++){ i = (i + g.dir + 4) % 4; if(g.hands[i].length) return i; } return from; }
function pkDfClear(g, lead){ g.field = null; g.passes = 0; g.back = false; if(g.inv && !g.rev) g.inv = false; g.inv = g.rev; g.turn = g.hands[lead].length ? lead : pkDfNextIdx(g, lead); }
const PK_DF_NAMES = ["あなた", "モモ", "ケン", "ユウ"];
function pkDfPlay(g, who, idxs){
    const hand = g.hands[who], cards = idxs.map((i) => hand[i]), a = pkDfCanPlay(g, cards); if(!a.ok) return a;
    g.count++;
    idxs.slice().sort((x, y) => y - x).forEach((i) => hand.splice(i, 1));
    g.field = {cards, kind:a.kind, n:a.n, rank:a.rank, top:a.top, owner:who}; g.last = who; g.passes = 0; g.hold = false;
    const label = cards.map((c) => c.r === 16 ? "🃏" : PK_SUITS[c.s] + pkRankLab(c.r)).join(" ");
    pkDfLog(g, PK_DF_NAMES[who] + "：" + label);
    const o = g.opts, ranks = cards.filter((c) => c.r !== 16).map((c) => c.r); let clear = false, skip = 0, again = false;
    if(a.spade3){ pkDfLog(g, "♠3返し！ ジョーカーを 返した！"); clear = true; again = true; }
    if(o.cut8 && ranks.includes(8)){ pkDfLog(g, "8切り！ 場が ながれた！"); clear = true; again = true; }
    if(o.back11 && ranks.includes(11) && a.kind === "set"){ g.back = !g.back; g.inv = g.rev !== g.back; pkDfLog(g, "11バック！ 強さが ぎゃくてん！"); }
    if(o.revo && a.kind === "set" && a.n >= 4 && ranks.length >= 4){ g.rev = !g.rev; g.inv = g.rev !== g.back; pkDfLog(g, "かくめい！ 強さが ひっくりかえった！"); }
    if(o.skip5 && ranks.includes(5)) skip = ranks.filter((r) => r === 5).length;
    if(o.rev9 && ranks.includes(9)){ g.dir = -g.dir; pkDfLog(g, "9リバース！ まわる むきが ぎゃくに！"); }
    if(o.bonus12 && ranks.includes(12) && who === 0){ const b = ranks.filter((r) => r === 12).length * 5; g.bonus = Math.min(100, g.bonus + b); pkDfLog(g, "12ボーナス！ +" + b + "コイン"); }
    if(!hand.length){ g.order.push(who); pkDfLog(g, PK_DF_NAMES[who] + " は あがり！（" + g.order.length + "いめ）"); again = false; }
    if(g.order.length >= 3){ const last = pkDfActive(g)[0]; if(last != null) g.order.push(last); pkDfEnd(g); return {ok:true}; }
    if(clear){ pkDfClear(g, who); if(!hand.length) g.turn = pkDfNextIdx(g, who); }
    else { let nxt = who; for(let k = 0; k <= skip; k++) nxt = pkDfNextIdx(g, nxt); if(skip) pkDfLog(g, "5スキップ！"); g.turn = nxt; }
    return {ok:true};
}
function pkDfPass(g, who){
    pkDfLog(g, PK_DF_NAMES[who] + "：パス"); g.passes++;
    const act = pkDfActive(g), need = act.filter((i) => i !== g.last).length;
    if(g.passes >= need){ pkDfLog(g, "みんな パス。場が ながれた。"); pkDfClear(g, g.last); }
    else g.turn = pkDfNextIdx(g, who);
}
function pkDfCpu(g, who){
    const hand = g.hands[who], opts = pkDfEnum(g, hand);
    if(!opts.length){ if(g.field) return pkDfPass(g, who); return pkDfPlay(g, who, [0]); }
    // いちばん弱い 出し方を えらぶ（ときどき パス）
    const score = (ix) => { const cs = ix.map((i) => hand[i]), a = pkDfAnalyze(cs); const r = a.rank === 16 ? 99 : (g.inv ? 18 - a.rank : a.rank); return r * 10 - cs.length * 6; };
    opts.sort((x, y) => score(x) - score(y));
    let pick = opts[0];
    if(g.field && score(pick) > 130 && hand.length > 4 && G.rnd() < 0.45) return pkDfPass(g, who);
    if(g.field && G.rnd() < 0.08 && hand.length > 3) return pkDfPass(g, who);
    pkDfPlay(g, who, pick);
}
function pkDfNext(g){
    if(g.phase !== "play") { render(); return; }
    if(g.count > 900){ g.order = [0, 1, 2, 3].sort((a, b) => g.hands[a].length - g.hands[b].length); pkDfEnd(g); return; }
    if(g.turn === 0){ if(!g.hands[0].length){ g.turn = pkDfNextIdx(g, 0); return pkDfNext(g); } render(); return; }
    render();
    const tok = g.token; const run = () => { if(G.pk.game !== g || g.token !== tok || g.phase !== "play") return; if(g.turn === 0){ pkDfNext(g); return; } const w = g.turn; pkDfCpu(g, w); pkDfNext(g); };
    if(G.pk.fast) run(); else G.pk.tm2 = setTimeout(run, 650);
}
function pkDfSel(i){ const g = G.pk.game; if(!g || g.phase !== "play" || g.turn !== 0) return; const k = g.sel.indexOf(i); if(k >= 0) g.sel.splice(k, 1); else g.sel.push(i); render(); }
function pkDfHumanPlay(){
    const g = G.pk.game; if(!g || g.phase !== "play" || g.turn !== 0) return;
    const r = pkDfPlay(g, 0, g.sel.slice()); if(!r.ok){ G.pk.msg = r.why || "だせません。"; render(); return; }
    G.pk.msg = ""; g.sel = []; pkDfNext(g);
}
function pkDfHumanPass(){
    const g = G.pk.game; if(!g || g.phase !== "play" || g.turn !== 0) return;
    if(!g.field){ G.pk.msg = "親は パスできません。"; render(); return; }
    pkDfPass(g, 0); g.sel = []; G.pk.msg = ""; pkDfNext(g);
}
function pkDfEnd(g){
    g.phase = "end"; const pay = PK.GM.CAS002.payouts, keys = ["first", "second", "third", "fourth"], place = g.order.indexOf(0), base = pay[keys[place]] || 0;
    const coins = base + g.bonus; g.res = {place:place + 1, coins, base, bonus:g.bonus, order:g.order.slice()};
    pkCasFinish("CAS002", {coins, score:coins, high:place === 0}); render();
}
function pkCard(c, on, idx){
    const red = c.s === 1 || c.s === 2;
    return '<button class="pc' + (red ? " rd" : "") + (on ? " sel" : "") + '" data-a="pk" data-v="cdsel|' + idx + '">' + (c.r === 16 ? "🃏" : PK_SUITS[c.s]) + '<b>' + (c.r === 16 ? "J" : pkRankLab(c.r)) + '</b></button>';
}
function pkDfView(g){
    if(g.phase === "setup"){
        const names = {kaidan:"階段（同じマークで 3まい いじょう つづき）", revo:"革命（4まいで 強さが ぎゃくてん）", cut8:"8切り（場を ながす）", back11:"11バック（強さが 一時的に ぎゃく）", skip5:"5スキップ（次の人を とばす）", rev9:"9リバース（まわる むきが ぎゃく）", bonus12:"12ボーナス（だすたび コイン+5・さいだい100）", spade3:"♠3返し（ジョーカーに ♠3）"};
        return '<div class="card"><b>ルール せってい</b>' + Object.keys(names).map((k) => '<div><label><input type="checkbox" data-a="pk" data-v="cdopt|' + k + '"' + (g.opts[k] ? " checked" : "") + '> ' + esc(names[k]) + '</label></div>').join("") + '<div class="meta">4人たいせん（あなた ＋ CPU3人）。1いは 🪙5000 の ジャックポット！ 2い 500・3い 150・4い 50。</div><div class="row">' + pkBtn("はじめる", "cdgo") + pkBtn("ルールせつめい", "cas|CAS002|help", {sub:1}) + '</div></div>';
    }
    if(g.phase === "end"){
        const r = g.res; return '<div class="card"><h3>' + r.place + 'い！</h3><div>' + r.order.map((i, k) => (k + 1) + 'い ' + PK_DF_NAMES[i]).join('　') + '</div><div class="okc">🪙 ' + pkNum(r.coins) + ' コイン（きほん ' + pkNum(r.base) + (r.bonus ? ' ＋ 12ボーナス ' + r.bonus : '') + '）</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>';
    }
    const f = g.field;
    return '<div class="meta">' + [1, 2, 3].map((i) => PK_DF_NAMES[i] + ' 🂠×' + g.hands[i].length + (g.order.includes(i) ? "（あがり）" : "")).join('　') + '　' + (g.inv ? "【強さ ぎゃくてん中】" : "") + '</div>' +
        '<div class="card pkfield"><div class="meta">場</div><div>' + (f ? f.cards.map((c) => '<span class="pc sm' + (c.s === 1 || c.s === 2 ? " rd" : "") + '">' + (c.r === 16 ? "🃏" : PK_SUITS[c.s] + pkRankLab(c.r)) + '</span>').join("") + ' <span class="meta">（' + PK_DF_NAMES[f.owner] + '）</span>' : '<span class="meta">（なにも ない）</span>') + '</div></div>' +
        '<div class="meta">' + g.log.map(esc).join("　／　") + '</div>' +
        '<div class="card"><div class="meta">あなたの 手ふだ（' + g.hands[0].length + 'まい）' + (g.turn === 0 ? "　👉 あなたの ばん！ カードを えらんで『だす』" : "　（" + PK_DF_NAMES[g.turn] + " の ばん…）") + '</div><div class="hand">' + g.hands[0].map((c, i) => pkCard(c, g.sel.includes(i), i)).join("") + '</div><div class="row">' + pkBtn("だす", "cdplay", {dis:g.turn !== 0 || !g.sel.length}) + pkBtn("パス", "cdpass", {sub:1, dis:g.turn !== 0 || !g.field}) + '</div></div>';
}
function pkDfHelp(){
    return '<div class="row"><b>友披露 ルールせつめい</b>' + pkBtn("とじる", "cend", {sub:1}) + '</div><div class="card meta" style="line-height:1.6">' +
        '・4人で 手札を さきに なくした 人が かち。1人プレイは CPU3人と たいせん。相手の 手札は 見えません。<br>' +
        '・強さ：3＜4＜…＜K＜A＜2＜ジョーカー。場と おなじ まいすうで、より強い カードを だす（1まい・ペア・3まい・4まい）。だせない／だしたくない ときは パス。<br>' +
        '・<b>3の効果</b>：<b>♠3返し</b>…場に ジョーカー1まいが あるとき ♠3 を だすと、ジョーカーを 返して 場が ながれる。<br>' +
        '・<b>5の効果（5スキップ）</b>：5を だすと 次の人を とばす。<b>8の効果（8切り）</b>：8を だすと 場が ながれ、もう一度 じぶんの ばん。<br>' +
        '・<b>9の効果（9リバース）</b>：まわる むきが ぎゃくに なる。<b>11の効果（11バック）</b>：場が ながれるまで 強さが ぎゃくてん。<br>' +
        '・<b>12の効果（12ボーナス）</b>：あなたが 12を だすたび ボーナス コイン +5（さいだい100）。<br>' +
        '・<b>革命</b>：同じ数字を 4まい いっしょに だすと、強さが ひっくりかえる（もう一度 4まいで もとに もどる）。<b>階段</b>：同じ マークで 3まい いじょう 数字が つづく とき（オプション）。<br>' +
        '・4・6・7・10 には とくべつな 効果は ありません。<br>' +
        '・1い 🪙5000／2い 500／3い 150／4い 50。せってい画面で ルールを オン・オフ できます。</div>';
}

// ================================================================ 3. タイピングチャレンジ
const PK_SENT = ["sou iu toki wa are da", "kyou mo ichinichi ganbarou", "are wo tsukatte mirai wo kaeru", "noizu wa kowakunai yo", "tomodachi to issho ni asobou", "kokoro ni nokotta henji wo sagasu", "arigatou wo tsutaeru kiseki", "yume no tsuzuki wo miyou",
    "asa no hikari ga mado ni todoku", "oishii onigiri wo tabeyou", "sora wo tobu kujira no yume", "hoshizora no michi wo aruku", "takoyaki matsuri ni ikou", "hanasaku oka de ohirune", "sakana tachi no parade", "kinoo no hanashi wo shiyou",
    "mou ichido chousen shiyou", "yuuki wo dashite ippo mae he", "minna de kuria wo mezasou", "tanoshii bouken no hajimari", "sono kimochi wo taisetsu ni", "koinune land de aimashou", "tegami no henji wo kakou", "saigo made akiramenai"];
function pkTypeNew(did, token){ const def = PK.GM.CAS003, diff = def.difficulty_levels.find((d) => d.id === did) || def.difficulty_levels[0]; return {id:"CAS003", diff:diff.id, d:diff, phase:"ready", token, list:pkShuffle(PK_SENT.slice()), si:0, pos:0, log:[], left:diff.duration_seconds}; }
function pkTypeBegin(){
    const g = G.pk.game; if(!g || g.id !== "CAS003" || g.phase !== "ready") return;
    g.phase = "play"; g.t0 = performance.now(); g.log = []; g.si = 0; g.pos = 0; const u = G.pk, tok = g.token; clearInterval(u.tmr);
    u.tmr = setInterval(() => { if(G.pk.game !== g || g.token !== tok || g.phase !== "play") { clearInterval(u.tmr); return; } g.left = Math.max(0, g.d.duration_seconds - (performance.now() - g.t0) / 1000); const el = $("pkTimer"); if(el) el.textContent = "のこり " + Math.ceil(g.left) + "秒"; if(g.left <= 0) pkTypeEnd(g); }, 200);
    render();
}
function pkTypeAfter(g){ if(g.phase === "play"){ const el = $("pkTyIn"); if(el){ el.value = g.list[g.si % g.list.length].slice(0, g.pos); el.focus(); } } }
// 入力：1文字ずつ 判定（まとめて ペーストされたら むこう）
function pkTypeInput(val){
    const g = G.pk && G.pk.game; if(!g || g.id !== "CAS003" || g.phase !== "play") return; const el = $("pkTyIn");
    const tgt = g.list[g.si % g.list.length], now = performance.now() - g.t0;
    if(val.length > g.pos + 1){ if(el) el.value = tgt.slice(0, g.pos); g.pasted = (g.pasted || 0) + 1; return; }
    if(val.length < g.pos){ if(el) el.value = tgt.slice(0, g.pos); return; }   // もどる（BackSpace）は むこう
    if(val.length === g.pos) return;
    const ch = val[val.length - 1];
    if(ch === tgt[g.pos]){ g.log.push([Math.round(now), 1]); g.pos++; pkBeep(660, 0.03, 0.02); if(g.pos >= tgt.length){ g.si++; g.pos = 0; if(el) el.value = ""; const t = $("pkTyTarget"); if(t) t.innerHTML = pkTypeTarget(g); return; } }
    else { g.log.push([Math.round(now), 0]); pkBeep(180, 0.05, 0.03); if(el) el.value = tgt.slice(0, g.pos); }
    const t = $("pkTyTarget"); if(t) t.innerHTML = pkTypeTarget(g);
}
// ごほうびの けいさん（ログから 計算しなおす：画面の数字は つかわない）
function pkTypingScore(log, dur, diffId){
    const sc = PK.GM.CAS003.scoring; let correct = 0, miss = 0, last = -1, bad = 0;
    (log || []).forEach((e) => {
        const t = e[0], ok = e[1]; if(typeof t !== "number" || t < 0 || t > dur * 1000 + 500 || t < last){ bad++; return; }
        if(ok === 1 && last >= 0 && t - last < 30){ bad++; last = t; return; }     // 1秒に 33文字より はやい入力は むこう
        last = t; if(ok === 1) correct++; else miss++;
    });
    const total = correct + miss, acc = total ? correct / total * 100 : 0, cpm = correct / dur * 60;
    const base = correct * sc.base_coins_per_correct_character, accB = acc >= sc.accuracy_bonus_threshold_percent && correct > 0 ? sc.accuracy_bonus : 0;
    const spd = sc.speed_bonus_enabled ? Math.min(150, Math.max(0, Math.floor((cpm - 150) / 2))) : 0;
    return {correct, miss, bad, acc, cpm, coins:base + accB + spd, base, accB, spd, high:acc >= 95 && cpm >= 200};
}
function pkTypeEnd(g){
    if(g.phase !== "play") return; g.phase = "end"; clearInterval(G.pk.tmr);
    const r = pkTypingScore(g.log, g.d.duration_seconds, g.diff); if(g.pasted) r.bad += g.pasted;
    const coins = r.bad > 0 && r.correct === 0 ? 0 : r.coins; g.res = Object.assign(r, {coins});
    pkCasFinish("CAS003", {coins, score:r.correct, high:r.high && g.diff !== "easy"}); render();
}
function pkTypeTarget(g){ const t = g.list[g.si % g.list.length]; return '<span class="okc">' + esc(t.slice(0, g.pos)) + '</span><span>' + esc(t.slice(g.pos)) + '</span>'; }
function pkTypeView(g){
    if(g.phase === "ready") return '<div class="card"><b>' + esc(g.d.name) + '</b>（' + g.d.duration_seconds + '秒）<div class="meta">でてくる 文章（ローマ字）を キーボードで そのまま うちこもう。まちがえた キーは カウントされ、正しい キーを うつまで すすみません。<br>ごほうび：せいかいした 文字ごとに 🪙1 ＋ せいかくさ95%いじょうで 🪙100 ＋ はやさボーナス。</div><div class="row">' + pkBtn("スタート！", "tgo") + '</div></div>';
    if(g.phase === "end"){ const r = g.res; return '<div class="card"><h3>けっか</h3><div>せいかい ' + r.correct + '文字　ミス ' + r.miss + '　せいかくさ ' + r.acc.toFixed(1) + '%　スピード ' + Math.round(r.cpm) + '文字/分</div>' + (r.bad ? '<div class="err">むこうな 入力が ' + r.bad + 'こ ありました。</div>' : '') + '<div class="okc">🪙 ' + pkNum(r.coins) + ' コイン（もじ ' + r.base + ' ＋ せいかくボーナス ' + r.accB + ' ＋ はやさ ' + r.spd + '）</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>'; }
    return '<div class="meta"><span id="pkTimer">のこり ' + Math.ceil(g.left) + '秒</span></div><div class="card" style="font-size:2.6cqw;letter-spacing:.2cqw" id="pkTyTarget">' + pkTypeTarget(g) + '</div><input id="pkTyIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;font-size:2.6cqw" data-ty="1">';
}
document.addEventListener("input", (e) => { if(e.target && e.target.id === "pkTyIn") pkTypeInput(e.target.value); });

// ================================================================ 4. AREの達人（リズム）
const PK_RH_PERFECT = 60, PK_RH_GOOD = 130, PK_RH_LEAD = 2.0, PK_RH_LEN = 45;
function pkRhChart(song, diffId){
    let seed = pkHash(song.id + diffId) + 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const spb = 60 / song.bpm, notes = [], dens = {easy:0.5, normal:0.8, hard:0.95}[diffId] || 0.5, step = {easy:1, normal:0.5, hard:0.5}[diffId] || 1;
    let t = PK_RH_LEAD, bar = 0;
    while(t < PK_RH_LEAD + PK_RH_LEN){
        const barStart = t; bar++;
        if(diffId !== "easy" && bar % (diffId === "hard" ? 4 : 6) === 0){ notes.push({t:Math.round(t * 1000) / 1000, k:"rap", len:Math.min(1.2, spb * 2)}); t += spb * 2; continue; }
        for(let i = 0; i < 4 / step; i++){
            const nt = barStart + i * spb * step; if(nt >= PK_RH_LEAD + PK_RH_LEN) break;
            const on = (i === 0) || rnd() < dens - (diffId === "easy" && i % 2 ? 0.35 : 0);
            if(on) notes.push({t:Math.round(nt * 1000) / 1000, k:rnd() < 0.55 ? "don" : "ka"});
        }
        t = barStart + 4 * spb;
    }
    return notes;
}
function pkRhMax(notes){ let s = 0, c = 0; notes.forEach((n) => { if(n.k === "rap") s += 10 * 12; else { c++; s += 100 + Math.min(10, Math.floor(c / 10)); } }); return s; }
function pkRhNew(did, si, token){
    const def = PK.GM.CAS004, song = def.songs[si] || def.songs[0], diff = def.difficulty_levels.find((d) => d.id === did) || def.difficulty_levels[0];
    const notes = pkRhChart(song, diff.id).map((n) => Object.assign({done:false, res:""}, n));
    return {id:"CAS004", diff:diff.id, d:diff, song, si, notes, phase:"ready", token, score:0, combo:0, maxc:0, per:0, good:0, miss:0, rapHits:0, max:pkRhMax(notes), clock:null, flash:"", t0:0};
}
function pkRhBegin(){
    const g = G.pk.game; if(!g || g.id !== "CAS004" || g.phase !== "ready") return;
    g.phase = "play"; g.t0 = performance.now(); G.pkQuiet = true; try{ if(window.tqBgmSync) tqBgmSync(); }catch(_e){}
    try{ const f = PK_BGM_FILES[g.si % PK_BGM_FILES.length]; const a = new Audio("./bgm/" + f + ".mp3"); a.volume = 0.8; a.loop = false; g.audio = a; const pr = a.play(); if(pr && pr.catch) pr.catch(() => { g.audio = null; }); }catch(_e){ g.audio = null; }
    G.pk.raf = requestAnimationFrame(pkRhLoop); render();
}
function pkRhNow(g){ return g.clock != null ? g.clock : (performance.now() - g.t0) / 1000; }
function pkRhAfter(g){ if(g.phase === "play" && !G.pk.raf) G.pk.raf = requestAnimationFrame(pkRhLoop); pkRhDraw(g); }
function pkRhHit(kind){
    const g = G.pk && G.pk.game; if(!g || g.id !== "CAS004" || g.phase !== "play") return null; const t = pkRhNow(g);
    if(kind === "rap"){
        const n = g.notes.find((x) => x.k === "rap" && !x.done && t >= x.t - 0.05 && t <= x.t + x.len + 0.1);
        if(n){ n.hits = (n.hits || 0) + 1; if(n.hits <= 12){ g.score += 10; g.rapHits++; } g.flash = "連打！"; pkBeep(520, 0.02, 0.02); return "rap"; }
        return null;
    }
    let best = null, bd = 1e9;
    g.notes.forEach((n) => { if(n.done || n.k !== kind) return; const d = Math.abs(n.t - t) * 1000; if(d < bd){ bd = d; best = n; } });
    if(!best || bd > PK_RH_GOOD) return null;
    best.done = true; const bonus = Math.min(10, Math.floor((g.combo + 1) / 10));
    if(bd <= PK_RH_PERFECT){ best.res = "perfect"; g.per++; g.score += 100 + bonus; g.flash = "PERFECT"; } else { best.res = "good"; g.good++; g.score += 60 + bonus; g.flash = "GOOD"; }
    g.combo++; g.maxc = Math.max(g.maxc, g.combo); pkBeep(kind === "don" ? 440 : 660, 0.04, 0.03);
    return best.res;
}
function pkRhTick(g){
    const t = pkRhNow(g);
    g.notes.forEach((n) => { if(!n.done){ if(n.k === "rap"){ if(t > n.t + n.len + 0.1) n.done = true; } else if(t > n.t + PK_RH_GOOD / 1000){ n.done = true; n.res = "miss"; g.miss++; g.combo = 0; g.flash = "MISS"; } } });
    const last = g.notes[g.notes.length - 1]; if(g.notes.every((n) => n.done) && t > (last ? last.t : 0) + 1.2) pkRhEnd(g);
}
function pkRhLoop(){
    const u = G.pk; u.raf = 0; const g = u.game; if(!g || g.id !== "CAS004" || g.phase !== "play" || G.mode !== "pack") return;
    pkRhTick(g); if(g.phase !== "play") return; pkRhDraw(g); u.raf = requestAnimationFrame(pkRhLoop);
}
function pkRhRank(g){ const r = g.max ? g.score / g.max : 0; return r >= 0.9 ? "S" : r >= 0.75 ? "A" : r >= 0.55 ? "B" : "C"; }
function pkRhCalc(g){ const base = {easy:40, normal:120, hard:300}[g.diff] || 40, r = g.max ? Math.min(1, g.score / g.max) : 0, rank = pkRhRank(g), full = g.miss === 0 && g.notes.some((n) => n.k !== "rap"); return {coins:Math.round(base * r) + (full ? 50 : 0) + (rank === "S" ? Math.round(base * 0.5) : 0), rank, full}; }
function pkRhEnd(g){
    if(g.phase !== "play") return; g.phase = "end"; if(g.audio){ try{ g.audio.pause(); }catch(_e){} g.audio = null; } G.pkQuiet = false; try{ if(window.tqBgmSync) tqBgmSync(); }catch(_e){}
    const c = pkRhCalc(g); g.res = c; pkCasFinish("CAS004", {coins:c.coins, score:g.score, high:c.rank === "S"}); render();
}
function pkRhDraw(g){
    const cv = $("pkCv"); if(!cv) return; const x = cv.getContext("2d"), W = 640, H = 200, t = pkRhNow(g);
    x.fillStyle = "#101a4a"; x.fillRect(0, 0, W, H); x.fillStyle = "#1c2a70"; x.fillRect(0, 70, W, 70);
    const HX = 110, SPD = 220; x.strokeStyle = "#fff"; x.lineWidth = 3; x.beginPath(); x.arc(HX, 105, 34, 0, 7); x.stroke();
    g.notes.forEach((n) => {
        const nx = HX + (n.t - t) * SPD; if(nx < -80 || nx > W + 80) return;
        if(n.k === "rap"){ const w = n.len * SPD; x.fillStyle = "#fbbf24"; x.fillRect(nx, 85, w, 40); x.fillStyle = "#000"; x.font = "bold 16px sans-serif"; x.fillText("連打！", nx + 6, 111); return; }
        if(n.done && n.res !== "miss") return; x.fillStyle = n.k === "don" ? "#ef4444" : "#3b82f6"; x.beginPath(); x.arc(nx, 105, 26, 0, 7); x.fill(); x.fillStyle = "#fff"; x.font = "bold 16px sans-serif"; x.textAlign = "center"; x.fillText(n.k === "don" ? "ドン" : "カッ", nx, 111); x.textAlign = "left";
    });
    x.fillStyle = "#fff"; x.font = "bold 18px sans-serif"; x.fillText("SCORE " + g.score + "   COMBO " + g.combo + "   " + (g.flash || ""), 12, 24);
    x.fillStyle = "#fff8"; x.fillRect(0, H - 8, W, 4); x.fillStyle = "#34d399"; x.fillRect(0, H - 8, W * Math.min(1, Math.max(0, (t - PK_RH_LEAD) / PK_RH_LEN)), 4);
}
function pkRhView(g){
    if(g.phase === "ready") return '<div class="card"><b>' + esc(g.song.title) + '</b>　BPM ' + g.song.bpm + '　' + esc(g.d.name) + '<div class="meta">BGM：ゲームの きょく（' + PK_BGM_FILES[g.si % PK_BGM_FILES.length] + '）。ノーツが わっかに かさなったら 入力！<br>🖥️ PC：<b>ドン＝Fキー</b>・<b>カッ＝Jキー</b>・<b>連打＝Enterキー</b>　📱 スマホ：<b>ドン／カッ／連打</b>の ボタンを タッチ　🎮 コントローラー：<b>A＝ドン</b>・<b>B＝カッ</b>・<b>L／R／ZL／ZR＝連打</b>（−／＋＝やめる）<br>ひょうか：PERFECT 100・GOOD 60・MISS 0（コンボで ボーナス）。<br>※ きょくの テンポと ノーツは BPM にあわせて 作っています。</div><div class="row">' + pkBtn("スタート！", "rgo") + '</div></div>';
    if(g.phase === "end"){ const r = g.res; return '<div class="card"><h3>ランク ' + r.rank + (r.full ? "　フルコンボ！" : "") + '</h3><div>スコア ' + g.score + '/' + g.max + '　PERFECT ' + g.per + '・GOOD ' + g.good + '・MISS ' + g.miss + '・さいだいコンボ ' + g.maxc + '</div><div class="okc">🪙 ' + pkNum(r.coins) + ' コイン</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>'; }
    return '<canvas id="pkCv" width="640" height="200" style="width:100%;border-radius:1cqw;touch-action:none"></canvas><div class="row rhpad"><button class="btn rh don" data-rh="don" data-keep="1">ドン</button><button class="btn rh ka" data-rh="ka" data-keep="1">カッ</button><button class="btn rh rap" data-rh="rap" data-keep="1">連打</button></div>';
}
document.addEventListener("pointerdown", (e) => { const b = e.target.closest && e.target.closest("[data-rh]"); if(b){ e.preventDefault(); pkRhHit(b.dataset.rh); } });

// ================================================================ 5. AREシューティング（独自追加）
const PK_SH = {W:640, H:360, T:60};
function pkShNew(did, token){
    const d = PK_SHOOT.difficulty_levels.find((x) => x.id === did) || PK_SHOOT.difficulty_levels[0];
    const cfg = {easy:{spawn:1.1, spd:70, hp:1, shoot:0, lives:5, boss:60, bshoot:1.6}, normal:{spawn:0.8, spd:95, hp:2, shoot:0.0035, lives:4, boss:90, bshoot:1.1}, hard:{spawn:0.5, spd:125, hp:3, shoot:0.008, lives:3, boss:130, bshoot:0.7}}[d.id];
    return {id:"CAS005", diff:d.id, d, cfg, phase:"ready", token, keys:{}, px:60, py:180, lives:cfg.lives, score:0, kills:0, shots:[], foes:[], eshots:[], fx:[], boss:null, t:0, sp:0, fire:0, inv:0, clock:null, res:null, target:null};
}
function pkShBegin(){ const g = G.pk.game; if(!g || g.id !== "CAS005" || g.phase !== "ready") return; g.phase = "play"; g.last = performance.now(); G.pk.raf = requestAnimationFrame(pkShLoop); render(); }
function pkShAfter(g){
    if(g.phase === "play"){ if(!G.pk.raf) G.pk.raf = requestAnimationFrame(pkShLoop); }
    const cv = $("pkCv"); if(cv && !cv._b){ cv._b = 1;
        const mv = (e) => { const r = cv.getBoundingClientRect(); g.target = {x:(e.clientX - r.left) / r.width * PK_SH.W, y:(e.clientY - r.top) / r.height * PK_SH.H}; };
        cv.addEventListener("pointerdown", (e) => { e.preventDefault(); mv(e); try{ cv.setPointerCapture(e.pointerId); }catch(_e){} });
        cv.addEventListener("pointermove", (e) => { if(e.buttons || e.pointerType === "touch") mv(e); });
        cv.addEventListener("pointerup", () => { g.target = null; });
    }
    pkShDraw(g);
}
function pkShStep(g, dt){
    const c = g.cfg; g.t += dt;
    // じぶんの いどう
    const sp = 190; let dx = 0, dy = 0; if(g.keys.left) dx -= 1; if(g.keys.right) dx += 1; if(g.keys.up) dy -= 1; if(g.keys.down) dy += 1;
    if(g.target){ const tx = g.target.x - g.px, ty = g.target.y - g.py, d = Math.hypot(tx, ty); if(d > 4){ dx = tx / d; dy = ty / d; } }
    g.px = Math.max(16, Math.min(PK_SH.W - 16, g.px + dx * sp * dt)); g.py = Math.max(16, Math.min(PK_SH.H - 16, g.py + dy * sp * dt));
    // じどう連射
    g.fire -= dt; if(g.fire <= 0){ g.fire = 0.2; g.shots.push({x:g.px + 14, y:g.py, vx:420}); }
    g.shots.forEach((s) => { s.x += s.vx * dt; }); g.shots = g.shots.filter((s) => s.x < PK_SH.W + 20);
    // てきの しゅつげん
    if(!g.boss && g.t < PK_SH.T){ g.sp -= dt; if(g.sp <= 0){ g.sp = c.spawn * (0.7 + G.rnd() * 0.6); const kind = Math.floor(G.rnd() * 4); g.foes.push({x:PK_SH.W + 20, y:30 + G.rnd() * (PK_SH.H - 60), hp:c.hp + (kind === 3 ? 1 : 0), e:["👾", "🍙", "💾", "🐟"][kind], wob:G.rnd() * 6, spd:c.spd * (0.8 + G.rnd() * 0.5), pts:kind === 3 ? 30 : 10}); } }
    if(!g.boss && g.t >= PK_SH.T){ g.boss = {x:PK_SH.W - 90, y:180, hp:c.boss, max:c.boss, dir:1, fire:1}; }
    g.foes.forEach((f) => { f.x -= f.spd * dt; f.y += Math.sin(g.t * 2 + f.wob) * 40 * dt; if(c.shoot && G.rnd() < c.shoot) g.eshots.push({x:f.x - 10, y:f.y, vx:-170, vy:(g.py - f.y) * 0.25}); });
    g.foes = g.foes.filter((f) => f.x > -30);
    if(g.boss){ const b = g.boss; b.y += b.dir * 70 * dt; if(b.y < 50 || b.y > PK_SH.H - 50) b.dir = -b.dir; b.fire -= dt; if(b.fire <= 0){ b.fire = c.bshoot; for(let k = -1; k <= 1; k++) g.eshots.push({x:b.x - 30, y:b.y, vx:-150, vy:k * 55}); } }
    g.eshots.forEach((s) => { s.x += s.vx * dt; s.y += (s.vy || 0) * dt; }); g.eshots = g.eshots.filter((s) => s.x > -20 && s.y > -20 && s.y < PK_SH.H + 20);
    // あたりはんてい
    g.shots.forEach((s) => { g.foes.forEach((f) => { if(f.hp > 0 && Math.abs(s.x - f.x) < 20 && Math.abs(s.y - f.y) < 20){ f.hp--; s.x = 9999; if(f.hp <= 0){ g.score += f.pts; g.kills++; g.fx.push({x:f.x, y:f.y, t:0.3}); } } }); if(g.boss && Math.abs(s.x - g.boss.x) < 40 && Math.abs(s.y - g.boss.y) < 44){ g.boss.hp--; s.x = 9999; g.score += 2; } });
    g.foes = g.foes.filter((f) => f.hp > 0); g.fx.forEach((f) => { f.t -= dt; }); g.fx = g.fx.filter((f) => f.t > 0);
    g.inv = Math.max(0, g.inv - dt);
    if(g.inv <= 0){
        const hit = g.eshots.some((s) => Math.hypot(s.x - g.px, s.y - g.py) < 12) || g.foes.some((f) => Math.hypot(f.x - g.px, f.y - g.py) < 22) || (g.boss && Math.abs(g.boss.x - g.px) < 36 && Math.abs(g.boss.y - g.py) < 40);
        if(hit){ g.lives--; g.inv = 1.6; g.eshots = []; g.foes = g.foes.filter((f) => Math.hypot(f.x - g.px, f.y - g.py) > 60); pkBeep(120, 0.15, 0.05); }
    }
    if(g.boss && g.boss.hp <= 0){ g.score += 300; pkShEnd(g, true); } else if(g.lives <= 0) pkShEnd(g, false);
}
function pkShLoop(now){
    const u = G.pk; u.raf = 0; const g = u.game; if(!g || g.id !== "CAS005" || g.phase !== "play" || G.mode !== "pack") return;
    const dt = Math.min(0.05, (now - g.last) / 1000); g.last = now; pkShStep(g, dt); if(g.phase !== "play") return; pkShDraw(g);
    u.raf = requestAnimationFrame(pkShLoop);
}
function pkShCalc(g, cleared){ const k = {easy:1, normal:2, hard:4}[g.diff], clr = {easy:30, normal:90, hard:250}[g.diff]; return {coins:g.kills * k + (cleared ? clr : 0) + g.lives * 10 * (cleared ? 1 : 0), cleared}; }
function pkShEnd(g, cleared){
    if(g.phase !== "play") return; g.phase = "end"; const r = pkShCalc(g, cleared); g.res = r;
    pkCasFinish("CAS005", {coins:r.coins, score:g.score, high:cleared && g.diff === "hard"}); render();
}
function pkShDraw(g){
    const cv = $("pkCv"); if(!cv) return; const x = cv.getContext("2d");
    x.fillStyle = "#070d2e"; x.fillRect(0, 0, 640, 360);
    for(let i = 0; i < 40; i++){ const sx = ((i * 97 - g.t * (20 + (i % 5) * 12)) % 640 + 640) % 640, sy = (i * 53) % 360; x.fillStyle = "#fff8"; x.fillRect(sx, sy, 2, 2); }
    x.textAlign = "center"; x.textBaseline = "middle";
    if(g.inv <= 0 || Math.floor(g.t * 10) % 2){ x.font = "28px serif"; x.fillText("🚀", g.px, g.py); }
    x.fillStyle = "#7dffb0"; g.shots.forEach((s) => x.fillRect(s.x - 6, s.y - 1.5, 12, 3));
    x.font = "26px serif"; g.foes.forEach((f) => x.fillText(f.e, f.x, f.y));
    x.fillStyle = "#ff6b6b"; g.eshots.forEach((s) => { x.beginPath(); x.arc(s.x, s.y, 4, 0, 7); x.fill(); });
    g.fx.forEach((f) => { x.font = "26px serif"; x.fillText("💥", f.x, f.y); });
    if(g.boss){ x.font = "72px serif"; x.fillText("👑", g.boss.x, g.boss.y); x.fillStyle = "#333"; x.fillRect(200, 8, 240, 8); x.fillStyle = "#f87171"; x.fillRect(200, 8, 240 * Math.max(0, g.boss.hp) / g.boss.max, 8); }
    x.textAlign = "left"; x.textBaseline = "alphabetic"; x.fillStyle = "#fff"; x.font = "bold 16px sans-serif"; x.fillText("SCORE " + g.score + "　❤️×" + g.lives + "　" + (g.boss ? "BOSS!" : "のこり " + Math.max(0, Math.ceil(PK_SH.T - g.t)) + "秒"), 10, 350);
}
function pkShView(g){
    if(g.phase === "ready") return '<div class="card"><b>' + esc(g.d.name) + '</b><div class="meta">ノイズの 群れを うちおとして、60秒後に あらわれる ボスを たおそう！ じどうで 弾が でます。<br>🖥️ PC：<b>矢印キー／WASD</b> で いどう　📱 スマホ：<b>画面を ドラッグ</b> で いどう<br>ごほうび：たおした 数 × ' + ({easy:1, normal:2, hard:4}[g.diff]) + ' ＋ ボスげきは ボーナス（ライフが のこるほど おおい）</div><div class="row">' + pkBtn("スタート！", "sgo") + '</div></div>';
    if(g.phase === "end"){ const r = g.res; return '<div class="card"><h3>' + (r.cleared ? "ボスげきは！ クリア！" : "ゲームオーバー…") + '</h3><div>スコア ' + g.score + '　たおした数 ' + g.kills + '</div><div class="okc">🪙 ' + pkNum(r.coins) + ' コイン</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>'; }
    return '<canvas id="pkCv" width="640" height="360" style="width:100%;border-radius:1cqw;touch-action:none"></canvas>';
}
