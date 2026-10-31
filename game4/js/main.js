"use strict";
// ===== ARE CARD 〜そういうときは、AREだ！〜（土台版）=====
// 3D盤面（自前WebGL2）＋ DOMの手札。ルールは rules.js、CPUは ai.js。
import {createRenderer, M4, Geo} from "./gl.js";
import {monsterModel, drawMonster, specOf} from "./mon3d.js";
import {buildBackdrop} from "./world.js";
import {Game, LIMITS} from "./rules.js";
import {cpuTurn, cpuAskARE} from "./ai.js";
import {Snd} from "./audio4.js";

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const FAST = qs.get("fast") === "1";            // テスト用：待ち時間を短く
let D = null, db = {}, R = null, back = null, G = null;
let level = 1, deckIdx = 0, busy = false, busySince = 0, sel = null, aborted = false, shake = 0, tNow = 0, scale = 1, cssW = 1, cssH = 1;
const V = [Array(LIMITS.slots).fill(null), Array(LIMITS.slots).fill(null)];   // 見た目の状態
const baseV = [{flash: 0, hp: 20}, {flash: 0, hp: 20}];
const proj = [];                                  // 飛んでいく光
const meshes = {};

const rec = () => { try{ return Object.assign({w: 0, l: 0}, JSON.parse(localStorage.getItem("areq4_rec") || "{}")); }catch(_e){ return {w: 0, l: 0}; } };
const saveRec = (r) => { try{ localStorage.setItem("areq4_rec", JSON.stringify(r)); }catch(_e){} };
let animSpeed = 1; try{ animSpeed = Number(localStorage.getItem("areq4_speed")) || 1; }catch(_e){}
const wait = (ms) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 20) : Math.round(ms / animSpeed)));
const msg = (t) => { $("msg").textContent = t || ""; };

// ---------- 「いま なにをする？」ガイド ----------
function guideText(){
    if(!G || !inMatch) return "";
    if(G.over) return "";
    if(G.turn !== 0 || busy) return "⏳ 相手のターンです。まっててね";
    if(sel && sel.k === "hand"){ const c = db[G.p[0].hand[sel.hi]]; return c && c.t === "unit" ? "② 下側の「＋ここに置く」マスを タップ（やめるときは同じカードをもう一度）" : "② 光っている「🎯」の 対象を タップ"; }
    if(sel && sel.k === "unit") return "② 「🎯」が出ている 相手を タップして こうげき！";
    const me = G.p[0]; const canPlay = me.hand.some((_x, i) => G.canPlay(0, i).ok);
    const ready = me.board.some((u) => u && !u.sick && !u.acted && u.atk > 0);
    if(ready) return "① 金色にひかる数字の ユニットを タップ → 相手を こうげき。カードを出すなら 明るい手札を タップ";
    if(canPlay) return "① 手札の 明るいカードを タップして えらぶ（暗いカードは 灯が足りません）";
    return "出せるカードも 動けるユニットも ありません。「ターン終了」を おそう";
}
function updateGuide(){ const el = $("guide"); if(!el) return; const t = guideText(); el.textContent = t; el.hidden = !t; }
// ---------- 盤面の座標 ----------
function layout(){ const asp = cssW / cssH; const dx = Math.max(1.5, Math.min(2.5, asp * 3.4)); return {dx, s: Math.min(1, dx / 2.4)}; }
const slotPos = (side, i) => { const L = layout(); return [(i - 2) * L.dx, side === 0 ? 2.5 : -2.5]; };
const basePos = (side) => [0, side === 0 ? 6.3 : -6.3];
const worldOf = (t) => (t.t === "base" ? basePos(t.side) : slotPos(t.side, t.slot));

// ---------- シーン ----------
function buildMeshes(){
    const t = new Geo(); t.cyl(8.9, 9.2, .55, 48, "#6b4a2a", M4.T(0, -.55, 0), true); t.cyl(8.3, 8.3, .05, 48, "#3f8f64", M4.T(0, 0, 0), true); t.cyl(8.5, 8.5, .02, 48, "#e8d27a", M4.T(0, -.01, 0), true);
    t.box(15, .03, .1, "#e8d27a", M4.T(0, .06, 0)); meshes.table = R.mesh(t);
    const s = new Geo(); s.cyl(1.0, 1.0, .06, 28, "#2c7352", M4.T(0, .05, 0), true); meshes.slot = R.mesh(s);
    const r = new Geo(); r.cyl(1.12, 1.12, .03, 28, "#ffffff", M4.T(0, .12, 0), true); meshes.ring = R.mesh(r);
    const sh = new Geo(); sh.cyl(.5, .5, .01, 16, [0, 0, 0], M4.T(0, .08, 0)); meshes.shadow = R.mesh(sh);
    const o = new Geo(); o.sphere(.28, 10, 8, "#ffffff", M4.T(0, 0, 0)); meshes.orb = R.mesh(o);
    const bsd = new Geo(); bsd.cyl(1.7, 1.9, .3, 24, "#3a3a52", M4.T(0, 0, 0), true); meshes.basePad = R.mesh(bsd);
}
function modelOf(card){ return monsterModel(R, specOf({id: card.id, name: card.n, art: {kind: card.kind, color: card.color}})); }
let baseModels = null;
function baseModel(side){ if(!baseModels) baseModels = [monsterModel(R, specOf({id: "baseP", art: {kind: "crystal", color: "#3a7ae8"}})), monsterModel(R, specOf({id: "baseE", art: {kind: "crystal", color: "#e8503a"}}))]; return baseModels[side]; }

// ---------- 演出（rules.js の emit を受ける）----------
function floater(text, wp, color){
    const p = R.project([wp[0], 1.6, wp[1]], cssW, cssH); if(!p.visible) return;
    const d = document.createElement("div"); d.className = "fl"; d.textContent = text; d.style.cssText = "left:" + p.x + "px;top:" + p.y + "px;color:" + (color || "#fff"); $("floaters").appendChild(d); setTimeout(() => d.remove(), 1000);
}
const vAt = (side, slot) => V[side][slot];
let matchLog = [];
function logEv(ev){
    try{
        const who = ev.p === 0 ? "あなた" : "CPU", nm = ev.id && db[ev.id] ? db[ev.id].n : "";
        const t = {turn: who + "の ターン", summon: who + "：" + nm + " を 出した", spell: who + "：「" + nm + "」", attack: who + "の ユニットが こうげき", hurt: who + "の ユニットに " + ev.n + " ダメージ", hitBase: who + "の 本拠地に " + ev.n + " ダメージ", die: who + "の ユニットが たおれた", are: who + "：AREだ！"}[ev.type];
        if(t) matchLog.push(t); if(matchLog.length > 200) matchLog.shift();
    }catch(_e){}
}
function showLog(){
    let d = $("logPanel"); if(!d){ d = document.createElement("div"); d.id = "logPanel"; d.style.cssText = "position:fixed;inset:8% 6%;z-index:50;background:rgba(6,12,50,.96);border:2px solid #8fb4ff;border-radius:12px;padding:12px 16px;overflow:auto;color:#fff;font-size:15px;line-height:1.6"; document.body.appendChild(d); }
    d.innerHTML = "<b>📜 対戦ログ</b><br>" + (matchLog.length ? matchLog.slice().reverse().map((x) => "・" + x).join("<br>") : "まだ ありません") + '<br><button type="button" id="logX" class="sub" style="margin-top:8px">とじる</button>';
    d.querySelector("#logX").onclick = () => d.remove();
}
async function onEvent(ev){
    if(aborted) throw new Error("aborted");
    logEv(ev);
    switch(ev.type){
        case "turn": msg(ev.p === 0 ? "あなたの ターン！" : "CPUの ターン…"); Snd.se("move"); updateHud(); renderHand(); await wait(ev.p === 0 ? 450 : 550); break;
        case "draw": if(ev.p === 0) Snd.se("talk"); updateHud(); renderHand(); await wait(ev.p === 0 ? 140 : 40); break;
        case "burn": msg("手札がいっぱいで カードが 燃えた！"); await wait(300); break;
        case "summon": { const c = db[ev.id]; V[ev.p][ev.slot] = {model: modelOf(c), uid: ev.uid, born: tNow, flash: 0, dead: 0, dying: false, lunge: null, c}; Snd.se("ok"); updateHud(); renderHand(); await wait(450); break; }
        case "spell": { const c = db[ev.id]; msg("「" + c.n + "」！"); const tg = ev.target; const from = basePos(ev.p); const to = tg && tg.t !== "none" ? worldOf(tg) : [0, 0];
            proj.push({from, to, t0: tNow, dur: .42, col: c.op === "dmg" || c.op === "destroy" ? [1, .55, .3] : [.5, 1, .6]}); Snd.se(c.op === "dmg" ? "crit" : "heal"); await wait(480); renderHand(); break; }
        case "attack": { const v = vAt(ev.p, ev.slot); if(v){ const a = slotPos(ev.p, ev.slot), b = worldOf(ev.target); v.lunge = {sx: a[0], sz: a[1], tx: b[0], tz: b[1], t0: tNow, dur: .6}; } await wait(330); break; }
        case "hurt": { const v = vAt(ev.p, ev.slot); if(v) v.flash = 1; floater("-" + ev.n, slotPos(ev.p, ev.slot), "#ff8a8a"); Snd.se("hit"); updateHud(); await wait(260); break; }
        case "hitBase": { baseV[ev.p].flash = 1; shake = .5; floater("-" + ev.n, basePos(ev.p), "#ff5a5a"); Snd.se("crit"); updateHud(); await wait(380); break; }
        case "healBase": if(ev.n > 0){ floater("+" + ev.n, basePos(ev.p), "#8fe08f"); Snd.se("heal"); } updateHud(); await wait(260); break;
        case "heal": Snd.se("heal"); updateHud(); await wait(200); break;
        case "buff": { floater("UP!", slotPos(ev.p, ev.slot), "#ffd24a"); Snd.se("levelup"); updateHud(); await wait(260); break; }
        case "lamp": Snd.se("heal"); updateHud(); await wait(120); break;
        case "die": { const v = vAt(ev.p, ev.slot); if(v){ v.dying = true; v.dieT = tNow; } Snd.se("lose"); await wait(420); V[ev.p][ev.slot] = null; updateHud(); break; }
        case "are": { const c = db[ev.id]; const b = $("banner"); b.textContent = "そういうときは、AREだ！"; b.hidden = false; document.body.classList.add("flash"); setTimeout(() => { b.hidden = true; document.body.classList.remove("flash"); }, 1500); msg(c.n + "　" + c.txt); Snd.se("encounter"); Snd.se("levelup"); updateHud(); await wait(1500); break; }
        case "over": updateHud(); setTimeout(() => { try{ showResult(); }catch(_e){} }, FAST ? 30 : 900); break;
        default: break;
    }
}

// ---------- HUD・手札 ----------
function updateHud(){
    if(!G) return; const me = G.p[0], foe = G.p[1];
    $("meHp").textContent = "♥ " + me.base.hp; $("foeHp").textContent = "♥ " + foe.base.hp;
    $("meLamp").textContent = "💡 " + me.lamps + "/" + (me.maxLamps + (G.turn === 0 ? 0 : 0)); $("foeLamp").textContent = "💡 " + foe.lamps + "/" + foe.maxLamps;
    $("foeHand").textContent = "🂠 " + foe.hand.length + "　山 " + foe.deck.length;
    const ar = $("meAre"); ar.className = me.areUsed ? "used" : (G.canARE(me) ? "ready" : ""); ar.title = me.areUsed ? "AREだ！は使用済み" : "本拠地HPが10以下で攻撃されると『AREだ！』が使えます";
    $("btnEnd").disabled = busy || !G || G.over || G.turn !== 0;
    const crit = Math.min(me.base.hp, foe.base.hp) <= 10; if(inMatch) Snd.play(crit ? "battle_final" : "battle");
}
function cardEl(c, hi){
    const e = document.createElement("div"); e.className = "card " + (c.t === "spell" ? "spell " : "") + c.rar; e.dataset.hi = hi;
    const st = c.t === "unit" ? '<div class="st"><span class="a">⚔' + c.atk + '</span><span class="h">♥' + c.hp + "</span></div>" : '<div class="st"><span></span></div>';
    e.innerHTML = '<div class="cost">' + c.cost + '</div><div class="nm">' + c.n + '</div><div class="art" style="background:radial-gradient(circle,' + c.color + "aa,#0a1040)\">" + c.emo + "</div>" + st + '<div class="tx">' + (c.txt || "") + "</div>";
    return e;
}
function renderHand(){
    const h = $("hand"); if(!G){ h.innerHTML = ""; return; } h.innerHTML = ""; const me = G.p[0];
    const cw = Math.max(62, Math.min(116, innerWidth * .105)), gap = Math.max(2, Math.min(8, innerWidth * .006)), avail = innerWidth - 16, n = me.hand.length; const ov = n > 1 && n * (cw + gap) > avail ? -((n * (cw + gap) - avail) / (n - 1)) : 0;
    me.hand.forEach((id, i) => { const c = db[id]; const e = cardEl(c, i); const ok = G.canPlay(0, i).ok && !busy; if(!ok) e.classList.add("no"); if(sel && sel.k === "hand" && sel.hi === i) e.classList.add("sel");
        if(ov && i > 0) e.style.marginLeft = ov + "px"; e.addEventListener("click", () => onHandClick(i)); e.addEventListener("mouseenter", () => showDetail(c)); e.addEventListener("mouseleave", () => { $("detail").hidden = true; });
            { let lp = 0; e.addEventListener("touchstart", () => { clearTimeout(lp); lp = setTimeout(() => showDetail(c), 420); }, {passive: true}); const off = () => { clearTimeout(lp); setTimeout(() => { $("detail").hidden = true; }, 1800); }; e.addEventListener("touchend", off); e.addEventListener("touchcancel", off); } h.appendChild(e); });
}
const KWTXT = {guard: "守り：このユニットが いる間は、相手は 後ろの ユニットや 本拠地を こうげきできない", haste: "速攻：出したターンから こうげきできる"};
function showDetail(c){ const d = $("detail"); d.hidden = false; d.innerHTML = "<b>" + c.n + "</b>　コスト" + c.cost + "（💡" + c.cost + "つ つかう）" + (c.t === "unit" ? "<br>⚔こうげき" + c.atk + "　♥たいりょく" + c.hp + "　" + (c.fam || "") : "<br>🪄 じゅもん（つかうと きえる）") + "<br>" + (c.txt || "") + (c.kw || []).map((k) => KWTXT[k] ? "<br><small>" + KWTXT[k] + "</small>" : "").join(""); }
// ユニットの数値バッジ
const badgePool = [];
function updateBadges(){
    const root = $("badges"); let k = 0;
    if(G && inMatch) for(let side = 0; side < 2; side++) for(let i = 0; i < LIMITS.slots; i++){
        const v = V[side][i], u = G.p[side].board[i]; if(!v || !u || v.dying) continue; const pos = slotPos(side, i); const p = R.project([pos[0], .05, pos[1] + 1.05], cssW, cssH); if(!p.visible) continue;
        let el = badgePool[k]; if(!el){ el = document.createElement("div"); el.className = "ub"; root.appendChild(el); badgePool[k] = el; k = k; }
        const ready = side === 0 && G.turn === 0 && !u.sick && !u.acted && u.atk > 0;
        el.innerHTML = '<span class="a' + (ready ? " rdy" : "") + '">' + u.atk + '</span><span class="h">' + u.hp + "</span>" + (u.guard ? '<span class="g">守</span>' : "") + (u.haste ? '<span class="z">速</span>' : "");
        el.style.cssText = "left:" + p.x + "px;top:" + p.y + "px;display:flex"; k++;
    }
    for(let j = k; j < badgePool.length; j++) badgePool[j].style.display = "none";
    updateHints(); updateGuide();
}
const hintPool = [];
function updateHints(){
    const root = $("badges"); let k = 0;
    const put = (pos, y, text, cls) => { const p = R.project([pos[0], y, pos[1]], cssW, cssH); if(!p.visible) return; let el = hintPool[k]; if(!el){ el = document.createElement("div"); root.appendChild(el); hintPool[k] = el; } el.className = "hint " + cls; el.textContent = text; el.style.cssText = "left:" + p.x + "px;top:" + p.y + "px;display:block"; k++; };
    if(G && inMatch && !busy && G.turn === 0 && !G.over && sel){
        if(sel.k === "hand"){
            const c = db[G.p[0].hand[sel.hi]];
            if(c && c.t === "unit"){ for(let i = 0; i < LIMITS.slots; i++) if(!G.p[0].board[i]) put(slotPos(0, i), .3, "＋ここに置く", "put"); }
            else if(c){ for(const t of G.targetsOf(0, c)){ const pos = t.t === "base" ? basePos(t.side) : slotPos(t.side, t.slot); put(pos, t.t === "base" ? 1.2 : .6, "🎯", "tgt"); } }
        } else if(sel.k === "unit"){
            for(let i = 0; i < LIMITS.slots; i++){ const u = G.p[1].board[i]; if(u && G.canAttack(0, sel.slot, {t: "unit", side: 1, slot: i})) put(slotPos(1, i), .6, "🎯こうげき", "tgt"); }
            if(G.canAttack(0, sel.slot, {t: "base", side: 1})) put(basePos(1), 1.2, "🎯こうげき", "tgt");
        }
    }
    for(let j = k; j < hintPool.length; j++) hintPool[j].style.display = "none";
}


// ---------- 入力 ----------
function onHandClick(i){
    if(busy || !G || G.over || G.turn !== 0){ return; }
    if(sel && sel.k === "hand" && sel.hi === i){ sel = null; msg(""); renderHand(); return; }
    const ck = G.canPlay(0, i); const c = db[G.p[0].hand[i]];
    if(!ck.ok){ msg(ck.why === "灯が たりない" ? "灯が たりません（コスト" + c.cost + "）" : ck.why); Snd.se("cancel"); return; }
    if(c.t === "spell" && !(c.tg === "enemy" || c.tg === "any" || c.tg === "ally")){ act(async () => { await G.playSpell(0, i, {t: "none"}); }); return; }
    sel = {k: "hand", hi: i}; msg(c.t === "unit" ? "置く場所（自分の空きマス）を えらんでね" : "対象を えらんでね"); Snd.se("ok"); showDetail(c); renderHand(); updateGuide();
}
function hitTest(x, y){
    let best = null, bd = 1e9; const R0 = Math.max(34, cssH * .075);
    const test = (side, slot, isBase) => { const wp = isBase ? basePos(side) : slotPos(side, slot); const p = R.project([wp[0], isBase ? 1.2 : .4, wp[1]], cssW, cssH); if(!p.visible) return; const d = Math.hypot(p.x - x, p.y - y); const lim = isBase ? R0 * 1.6 : R0 * 1.15; if(d < lim && d < bd){ bd = d; best = {t: isBase ? "base" : "unit", side, slot: isBase ? undefined : slot}; } };
    for(let side = 0; side < 2; side++){ for(let i = 0; i < LIMITS.slots; i++) test(side, i, false); test(side, 0, true); }
    return best;
}
function onCanvasClick(x, y){
    if(busy || !G || G.over || G.turn !== 0) return; const hit = hitTest(x, y);
    if(!hit){ sel = null; msg(""); renderHand(); return; }
    if(sel && sel.k === "hand"){
        const c = db[G.p[0].hand[sel.hi]]; if(!c){ sel = null; return; }
        if(c.t === "unit"){ if(hit.side === 0 && hit.t === "unit" && !G.p[0].board[hit.slot]){ const hi = sel.hi; act(async () => { await G.playUnit(0, hi, hit.slot); }); } else { msg("自分の 空いているマスを えらんでね"); Snd.se("cancel"); } return; }
        const ok = G.targetsOf(0, c).some((t) => t.t === hit.t && t.side === hit.side && t.slot === hit.slot);
        if(ok){ const hi = sel.hi; act(async () => { await G.playSpell(0, hi, {t: hit.t, side: hit.side, slot: hit.slot}); }); } else { msg("そこは 対象に できません"); Snd.se("cancel"); } return;
    }
    if(hit.side === 0 && hit.t === "unit"){
        const u = G.p[0].board[hit.slot]; if(!u){ sel = null; return; }
        if(sel && sel.k === "unit" && sel.slot === hit.slot){ sel = null; msg(""); return; }
        if(u.sick){ msg("出したばかりで まだ 動けません"); Snd.se("cancel"); return; } if(u.acted){ msg("このユニットは もう 攻撃しました"); Snd.se("cancel"); return; }
        sel = {k: "unit", slot: hit.slot}; msg("攻撃する相手を えらんでね"); Snd.se("ok"); return;
    }
    if(sel && sel.k === "unit" && hit.side === 1){
        const tg = hit.t === "base" ? {t: "base", side: 1} : {t: "unit", side: 1, slot: hit.slot}; const slot = sel.slot;
        if(!G.canAttack(0, slot, tg)){ msg(G.guards(1).length ? "守りのユニットを 先にたおそう" : "そこは 攻撃できません"); Snd.se("cancel"); return; }
        act(async () => { await G.attack(0, slot, tg); }); return;
    }
    sel = null; msg("");
}
async function act(fn){
    if(busy || !G || G.over) return; busy = true; busySince = performance.now(); sel = null; renderHand();
    try{ await fn(); }catch(e){ if(!aborted) console.error(e); }
    finally{ busy = false; renderHand(); updateHud(); if(G && G.over) showResult(); else if(G && G.turn === 0) msg("あなたの ターン"); }
}
async function endTurn(){
    if(busy || !G || G.over || G.turn !== 0) return;
    await act(async () => {
        await G.endTurn(); let guard = 0;
        while(!G.over && G.turn === 1 && guard++ < 3){ await cpuTurn(G, 1, {level, after: () => wait(320)}); }
    });
}

// ---------- 対戦の流れ ----------
let inMatch = false;
function humanAsk(ctx){
    return new Promise((resolve) => {
        const c = db[G.p[0].are]; $("askText").innerHTML = "本拠地HP <b>" + G.p[0].base.hp + "</b>。" + (ctx.attacker ? db[ctx.attacker.id].n + "（⚔" + ctx.attacker.atk + "）が 攻めてきた！" : "") + "<br><small>" + c.n + "：" + c.txt + "</small>";
        $("ask").hidden = false; const done = (v) => { $("ask").hidden = true; $("askYes").onclick = $("askNo").onclick = null; resolve(v); };
        $("askYes").onclick = () => done(true); $("askNo").onclick = () => done(false);
    });
}
async function startMatch(){
    matchLog = [];
    aborted = false; busy = false; sel = null; $("menu").hidden = true; $("result").hidden = true; $("ask").hidden = true; inMatch = true;
    for(const s of V) s.fill(null); baseV[0].flash = baseV[1].flash = 0;
    const mine = D.decks[deckIdx]; let oi = Math.floor(Math.random() * D.decks.length); if(oi === deckIdx) oi = (oi + 1) % D.decks.length; const foeDeck = D.decks[oi];
    const dA = {list: mine.list, are: mine.are, name: "主人公"}, dB = {list: foeDeck.list, are: foeDeck.are, name: "CPU"};
    G = new Game(db, [dA, dB], {seed: (Math.random() * 1e9) | 0, emit: onEvent, askARE: async (pl) => (pl.id === 0 ? humanAsk({attacker: lastAttacker()}) : cpuAskARE(G, pl, {attacker: lastAttacker()}, level))});
    $("foeName").textContent = "CPU　" + foeDeck.name; $("meName").textContent = "主人公　" + mine.name; msg("対戦開始！"); updateHud(); renderHand(); Snd.play("battle");
    busy = true; busySince = performance.now();
    try{ await G.start(); if(!G.over && G.turn === 1){ let guard = 0; while(!G.over && G.turn === 1 && guard++ < 3) await cpuTurn(G, 1, {level, after: () => wait(320)}); } }catch(e){ if(!aborted) console.error(e); }
    busy = false; renderHand(); updateHud(); if(G.over) showResult(); else msg("あなたの ターン");
}
function lastAttacker(){ if(!G) return null; for(let i = G.log.length - 1; i >= 0; i--){ const e = G.log[i]; if(e.type === "attack"){ const u = G.p[e.p].board[e.slot]; return u || null; } } return null; }
function showResult(){
    if(!G || !G.over || G.recorded) return; G.recorded = true; inMatch = false; const win = G.over.winner === 0; const r = rec(); if(win) r.w++; else r.l++; saveRec(r);
    $("resTitle").textContent = win ? "しょうり！" : "はいぼく…"; $("resText").textContent = win ? "相手の本拠地を たおした！" : "本拠地が たおされた… 次は デッキを 変えてみよう。"; Snd.play(win ? "win" : "lose"); Snd.se(win ? "win" : "lose");
    setTimeout(() => { $("result").hidden = false; }, FAST ? 10 : 700);
}
function toMenu(){ aborted = true; inMatch = false; busy = false; G = null; sel = null; $("result").hidden = true; $("ask").hidden = true; $("menu").hidden = false; $("hand").innerHTML = ""; $("badges").innerHTML = ""; badgePool.length = 0; hintPool.length = 0; msg(""); Snd.play("title"); showRec(); }
function rescue(){ toMenu(); msg("もどしました"); }
const RANKS = [[0, "見習い"], [5, "一人前"], [20, "ベテラン"], [50, "名人"], [100, "AREマスター"]];
function rankOf(w){ let r = RANKS[0][1]; for(const x of RANKS){ if(w >= x[0]) r = x[1]; } return r; }
function showRec(){ const r = rec(); $("rec").textContent = "せんせき　" + r.w + "勝 " + r.l + "敗　ランク：" + rankOf(r.w); }
function buildMenu(){
    const dl = $("deckList"); dl.innerHTML = ""; try{ deckIdx = Math.min(D.decks.length - 1, Math.max(0, +(localStorage.getItem("areq4_deck") || 0))); }catch(_e){}
    D.decks.forEach((d, i) => { const e = document.createElement("div"); e.className = "dk" + (i === deckIdx ? " on" : ""); e.innerHTML = "<b>" + d.name + "</b><small>" + d.desc + "　AREだ！：" + db[d.are].n.replace("そういうときは、AREだ！ ", "") + "</small>"; e.onclick = () => { deckIdx = i; try{ localStorage.setItem("areq4_deck", i); }catch(_e){} dl.querySelectorAll(".dk").forEach((x, j) => x.classList.toggle("on", j === i)); Snd.se("ok"); }; dl.appendChild(e); });
}


// ---------- はじめてガイド（やさしい あそびかた）----------
const TUTO = [
  ["① かちかた", '<p>相手の <b>本拠地（HP20）</b>を <b>0</b> にすれば あなたの 勝ち！</p><p>あなたの 本拠地も HP20。0になると まけです。</p><div class="tdia"><div class="r"><i>相手の本拠地 ♥20</i></div><div class="r"><i>相手の場（5マス）</i></div><div class="r"><i class="me">あなたの場（5マス）</i></div><div class="r"><i class="me">あなたの本拠地 ♥20</i></div></div><p>カードを出して 仲間（ユニット）を ならべ、相手の本拠地を こうげきしよう。</p>'],
  ["② 1ターンの ながれ", '<p>ターンが 始まると <b>カードを1枚ひき</b>、<b>💡灯（ひ）が1つ ふえます</b>（最大10）。</p><p>灯は カードを出す ための おかねです。カード左上の <b>黄色い数字＝コスト</b>。灯が足りれば 出せます。</p><p>やることが なくなったら <b>「ターン終了」ボタン</b>。そうすると 相手（CPU）の ターンです。</p>'],
  ["③ カードを 出す", '<p><b>(1)</b> 画面下の 手札で <b>明るいカード</b>を タップ（暗いカードは 灯が足りません）。</p><p><b>(2)</b> <b>緑の「＋ここに置く」</b>が 出た マスを タップ。</p><p>🪄<b>じゅもん</b>のカードは 出すと 効果を 使って きえます。対象を えらぶ ときは 赤い <b>🎯</b>を タップ。</p><p>カードを タップすると 右上に くわしい説明が 出ます。</p>'],
  ["④ こうげき", '<p>出した ターンの ユニットは まだ 動けません（<b>速攻</b>は 除く）。次の ターンから こうげきできます。</p><p><b>(1)</b> 数字が <b>金色に光る</b> 自分の ユニットを タップ。</p><p><b>(2)</b> 赤い <b>🎯こうげき</b>が 出た 相手を タップ。</p><p><b>守</b>マークの ユニットが いる間は、その 後ろの ユニットや 本拠地は こうげきできません。先に たおそう！</p>'],
  ["⑤ ことば と AREだ！", '<p>⚔＝こうげき力　♥＝たいりょく　💡＝灯（コスト用）</p><p><b>守</b>＝守り（前に出て みんなを まもる）　<b>速</b>＝速攻（出してすぐ こうげき）</p><p>自分の本拠地HPが <b>10以下</b>で こうげきを 受けるとき、<b>1回だけ</b>「そういうときは、AREだ！」が 使えます。画面に 質問が 出たら <b>ボタンを おすだけ</b>！ 逆転の チャンスです。</p><p>画面の 上の 黄色い ガイドが 「いま なにをするか」を おしえて くれます。</p>']];
let tutoI = 0;
function showTuto(i){
    tutoI = Math.max(0, Math.min(TUTO.length - 1, i)); $("tuto").hidden = false; $("tutoStep").textContent = (tutoI + 1) + " / " + TUTO.length; $("tutoT").textContent = TUTO[tutoI][0]; $("tutoBody").innerHTML = TUTO[tutoI][1];
    $("tutoPrev").disabled = tutoI === 0; $("tutoNext").textContent = tutoI === TUTO.length - 1 ? "わかった！ ✔" : "つぎへ ▶";
}
function closeTuto(){ $("tuto").hidden = true; try{ localStorage.setItem("areq4_tuto", "1"); }catch(_e){} }
function initTuto(){
    $("btnGuide").onclick = () => showTuto(0); $("btnHelp").onclick = () => showTuto(0); $("tutoClose").onclick = closeTuto;
    $("tutoPrev").onclick = () => showTuto(tutoI - 1); $("tutoNext").onclick = () => { if(tutoI >= TUTO.length - 1) closeTuto(); else showTuto(tutoI + 1); };
    let seen = false; try{ seen = !!localStorage.getItem("areq4_tuto"); }catch(_e){}
    if(!seen && !FAST) showTuto(0);
}
// ---------- 描画ループ ----------
function resize(){
    const c = $("gl"); cssW = c.clientWidth || innerWidth; cssH = c.clientHeight || innerHeight; const dpr = Math.min(window.devicePixelRatio || 1, 2); const budget = Math.sqrt(2.2e6 / (cssW * cssH)); scale = Math.max(.5, Math.min(dpr, budget, 1.5)); R.resize(cssW, cssH, scale);
}
let last = 0, errs = 0;
function frame(ts){
    requestAnimationFrame(frame);
    try{ const dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts; tNow += dt; render(dt); errs = 0; }
    catch(e){ if(++errs < 3) console.error(e); if(errs >= 5){ errs = 0; try{ rescue(); }catch(_e){} } }
    // 固まったときの かくにん
    const stuck = busy && performance.now() - busySince > 12000; $("rescueBtn").hidden = !stuck;
    if(busy && performance.now() - busySince > 45000){ rescue(); }
}
function render(dt){
    const asp = cssW / cssH; const k = asp < 1 ? 1.45 : 1; const sx = shake > 0 ? Math.sin(tNow * 70) * shake * .25 : 0; shake = Math.max(0, shake - dt * 1.6);
    const sway = Math.sin(tNow * .3) * .35;
    const cam = {eye: [sway + sx, 12.6 * k, 14.2 * k], target: [0, 0, 1.9], fov: .8};
    R.begin(cam, back.env); back.draw(cam);
    R.draw(meshes.table, {mode: 0});
    const L = layout(); const sc = L.s;
    // 空きマス（ハイライトつき）
    const hl = highlights();
    for(let side = 0; side < 2; side++) for(let i = 0; i < LIMITS.slots; i++){ const p = slotPos(side, i); const key = side + "_" + i; R.draw(meshes.slot, {m: M4.mul(M4.T(p[0], 0, p[1]), M4.S(L.dx / 2.4, 1, L.dx / 2.4)), mode: 0, tint: side === 0 ? [.9, 1.05, 1.2, 1] : [1.2, .95, .95, 1]});
        if(hl[key]) R.draw(meshes.ring, {m: M4.mul(M4.T(p[0], 0, p[1]), M4.S(L.dx / 2.4, 1, L.dx / 2.4)), mode: 3, tint: hl[key], blend: true, add: true}); }
    // 本拠地
    for(let side = 0; side < 2; side++){ const bp = basePos(side), m = baseModel(side); const bv = baseV[side]; bv.flash = Math.max(0, bv.flash - dt * 2.2);
        R.draw(meshes.basePad, {m: M4.T(bp[0], 0, bp[1]), mode: 0}); drawMonster(R, m, {x: bp[0], z: bp[1], s: 2.6 / m.h, t: tNow, ph: side, flash: bv.flash, yaw: side === 0 ? Math.PI : 0});
        if(hl["b" + side]) R.draw(meshes.ring, {m: M4.mul(M4.T(bp[0], .02, bp[1]), M4.S(1.9, 1, 1.9)), mode: 3, tint: hl["b" + side], blend: true, add: true}); }
    // ユニット
    for(let side = 0; side < 2; side++) for(let i = 0; i < LIMITS.slots; i++){
        const v = V[side][i]; if(!v) continue; const p = slotPos(side, i); let x = p[0], z = p[1], hop = 0;
        const born = Math.min(1, (tNow - v.born) / .35); let s0 = (1.55 / v.model.h) * sc * (born < 1 ? (1 - Math.pow(1 - born, 3)) : 1); hop = born < 1 ? (1 - born) * 1.2 : 0;
        if(v.lunge){ const q = (tNow - v.lunge.t0) / v.lunge.dur; if(q >= 1) v.lunge = null; else { const e = q < .45 ? q / .45 : 1 - (q - .45) / .55; const ee = Math.sin(Math.min(1, Math.max(0, e)) * Math.PI / 2); x = v.lunge.sx + (v.lunge.tx - v.lunge.sx) * ee * .78; z = v.lunge.sz + (v.lunge.tz - v.lunge.sz) * ee * .78; } }
        v.flash = Math.max(0, v.flash - dt * 3); let dead = 0; if(v.dying){ dead = Math.min(1, (tNow - v.dieT) / .4); }
        R.draw(meshes.shadow, {m: M4.trs(x, 0, z, 0, 1.5 * sc), mode: 3, tint: [0, 0, 0, .3 * (1 - dead)], blend: true});
        drawMonster(R, v.model, {x, z, s: Math.max(.01, s0), t: tNow + i, ph: i, flash: v.flash, yaw: side === 0 ? Math.PI : 0, dead, hop, alpha: 1 - dead * .6, atk: v.lunge ? .7 : 0});
    }
    // 飛ぶ光
    for(let j = proj.length - 1; j >= 0; j--){ const pr = proj[j]; const q = (tNow - pr.t0) / pr.dur; if(q >= 1){ proj.splice(j, 1); continue; }
        const x = pr.from[0] + (pr.to[0] - pr.from[0]) * q, z = pr.from[1] + (pr.to[1] - pr.from[1]) * q, y = 1.2 + Math.sin(q * Math.PI) * 1.6; R.draw(meshes.orb, {m: M4.mul(M4.T(x, y, z), M4.S(1 + Math.sin(q * 9) * .2, 1, 1)), mode: 3, tint: [pr.col[0], pr.col[1], pr.col[2], .95], blend: true, add: true}); }
    R.flush(); updateBadges();
    if(sel && sel.k === "unit" && G){ /* 選択中は特になし */ }
}
// 選択に応じて、押せる場所を光らせる
function highlights(){
    const out = {}; if(!G || !inMatch || busy || G.over || G.turn !== 0 || !sel) return out; const pulse = .45 + Math.sin(tNow * 6) * .15;
    if(sel.k === "hand"){ const c = db[G.p[0].hand[sel.hi]]; if(!c) return out;
        if(c.t === "unit"){ G.p[0].board.forEach((u, i) => { if(!u) out["0_" + i] = [.4, 1, .5, pulse]; }); }
        else for(const t of G.targetsOf(0, c)){ if(t.t === "base") out["b" + t.side] = [1, .5, .3, pulse]; else out[t.side + "_" + t.slot] = t.side === 1 ? [1, .5, .3, pulse] : [.4, 1, .5, pulse]; } }
    else if(sel.k === "unit"){ out["0_" + sel.slot] = [1, .9, .3, pulse + .2]; G.p[1].board.forEach((u, i) => { if(u && G.canAttack(0, sel.slot, {t: "unit", slot: i})) out["1_" + i] = [1, .4, .3, pulse]; }); if(G.canAttack(0, sel.slot, {t: "base"})) out.b1 = [1, .4, .3, pulse]; }
    return out;
}

// ---------- 起動 ----------
async function boot(){
    try{
        const canvas = $("gl"); R = createRenderer(canvas, {keep: qs.get("keep") === "1"}); if(!R){ document.body.insertAdjacentHTML("beforeend", "<p style='position:fixed;inset:30% 8%;z-index:99;text-align:center'>このブラウザでは WebGL2 が使えません。別のブラウザで ひらいてください。</p>"); return; }
        D = await (await fetch("data/cards.json")).json(); for(const c of D.cards) db[c.id] = c;
        resize(); addEventListener("resize", resize); buildMeshes(); back = buildBackdrop(R, "field");
        buildMenu(); showRec(); Snd.init(); Snd.play("title");
        $("level").value = String(level); $("level").onchange = () => { level = +$("level").value; };
        const vs = $("sndVol"); if(vs){ vs.value = Math.round(Snd.vol * 100); vs.oninput = () => { Snd.vol = vs.value / 100; Snd.save(); Snd.sync(); }; }
        const sp = $("animSpeed"); if(sp){ sp.value = String(animSpeed); sp.onchange = () => { animSpeed = Number(sp.value) || 1; try{ localStorage.setItem("areq4_speed", String(animSpeed)); }catch(_e){} }; }
        if($("btnLog")) $("btnLog").onclick = showLog;
        if($("btnSort")) $("btnSort").onclick = () => { if(!G || busy || G.over) return; G.p[0].hand.sort((a, b) => db[a].cost - db[b].cost || String(a).localeCompare(String(b))); sel = null; renderHand(); msg("コストの ひくい じゅんに ならべました"); };
        $("chkSnd").checked = Snd.on; $("chkSnd").onchange = () => { Snd.on = $("chkSnd").checked; Snd.save(); Snd.sync(); };
        $("btnStart").onclick = () => { Snd.se("ok"); startMatch(); }; $("btnAgain").onclick = () => { Snd.se("ok"); startMatch(); }; $("btnToMenu").onclick = () => { Snd.se("cancel"); toMenu(); };
        $("btnEnd").onclick = () => { Snd.se("ok"); endTurn(); }; $("btnMenu").onclick = () => { Snd.se("cancel"); toMenu(); }; $("rescueBtn").onclick = rescue; initTuto();
        let dn = null; canvas.addEventListener("pointerdown", (e) => { dn = {x: e.clientX, y: e.clientY}; }); canvas.addEventListener("pointerup", (e) => { if(dn && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < 14) onCanvasClick(e.clientX, e.clientY); dn = null; });
        $("ui").addEventListener("pointerup", (e) => { if(e.target.id === "ui" || e.target.id === "badges" || e.target.id === "floaters") onCanvasClick(e.clientX, e.clientY); });
        addEventListener("keydown", (e) => { if(e.key === "Escape"){ if(inMatch) toMenu(); } else if(e.key === "Enter" && inMatch && !busy){ endTurn(); } });
        addEventListener("error", (e) => console.error(e.message)); addEventListener("unhandledrejection", (e) => console.error(e.reason));
        requestAnimationFrame(frame);
        window.__g4 = {cpu0: () => act(async () => { await cpuTurn(G, 0, {level: 2, after: () => wait(5)}); if(!G.over && G.turn === 0){ await G.endTurn(); let g = 0; while(!G.over && G.turn === 1 && g++ < 3) await cpuTurn(G, 1, {level, after: () => wait(5)}); } }), get G(){ return G; }, get busy(){ return busy; }, get inMatch(){ return inMatch; }, db, start: startMatch, endTurn, act, handClick: onHandClick, canvasClick: onCanvasClick, setLevel: (l) => { level = l; }, hitTest, rescue, toMenu, project: (wp) => R.project(wp, cssW, cssH), get V(){ return V; }, slotPos, basePos};
    }catch(e){ console.error(e); document.body.insertAdjacentHTML("beforeend", "<p style='position:fixed;inset:30% 8%;z-index:99;text-align:center'>読み込みに失敗しました：" + String(e.message).slice(0, 120) + "</p>"); }
}
boot();
