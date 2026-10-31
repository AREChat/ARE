"use strict";
// ===== ARE QUEST 3：メインループ（タイトル→フィールド→会話→メニュー→戦闘）=====
import {createRenderer, M4, Geo, canvasTex} from "./gl.js";
import {Input} from "./input.js";
import {UI} from "./ui.js";
import {Save} from "./save.js";
import {charMeshes, drawChar} from "./chars.js";
import {monsterModel, drawMonster, specOf} from "./mon3d.js";
import {buildWorld} from "./world.js";
import {Battle} from "./battle.js";
import {Story, TOTAL} from "./story.js";
import {Audio2} from "./audio.js";
import {newMember, statsOf, expNeed, setGameData, setEquip, fixMember, learnCheck, gainExp} from "./rules.js";
import {makeRanch} from "./ranch.js";
import {Places} from "./places.js";
import {Park} from "./park.js";
import {createExtra} from "../../shared/q23-extra.js";
import {Cheats, applyFx, openCodeBox, watchKonami} from "./cheats.js";

const $ = UI.$;
const qs = new URLSearchParams(location.search);
const base = new URL("../", import.meta.url);
const jget = async (p) => { const r = await fetch(new URL(p, base)); if(!r.ok) throw new Error(p + " (" + r.status + ")"); return r.json(); };
const lerpA = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = qs.get("seed") ? mulberry(+qs.get("seed")) : Math.random;

// ---------- 設定 ----------
const CFG_KEY = "areq3_cfg";
const cfg = Object.assign({flip: "none", quality: "auto", touch: "auto", speed: 2, auto: false, sound: true, bgmVol: .5, seVol: .6}, (() => { try{ return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); }catch(_e){ return {}; } })());
const saveCfg = () => { try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(_e){} };
UI.textSpeed = cfg.speed;

// ---------- 全体の状態 ----------
const ctx = {A: Audio2, R: null, data: null, S: null, UI, Input, rnd, jget, cssW: 800, cssH: 450};
UI.blip = () => Audio2.se("talk");   // 会話の文字送り音
let state = "boot";               // boot / title / field / talk / menu / battle / busy
let world = null, mapDef = null, battle = null, story = null;
let npcs = [], P = {x: 0, z: 0, yaw: 0, walk: 0, t: 0, P: null}, trail = [], camYaw = Math.PI, walkAcc = 0, cool = 0, grace = 0, markMesh = null, hold = 0;
let nearNpc = null, scale = 1, ema = 1 / 60, frames = 0, maxScale = 1, tNow = 0, fps = 0;

const newState = (name) => ({v: 1, name, chapter: 1, flags: {}, inv: {yakusou: 3}, gold: 30, party: [newMember("hero", ctx.data.members, 1)], equip: {}, coins: 0, titles: [], luckBattles: 0, map: "town", x: 0, z: 18, yaw: Math.PI, obj: "", ret: null, steps: 0, cleared: 0});

// ---------- マップ・人 ----------
function setWorld(id){
    if(world) world.dispose(); mapDef = Object.assign({id}, ctx.data.maps[id]); world = buildWorld(ctx.R, mapDef); buildBosses();
}
function refreshNpcs(){
    const R = ctx.R, S = ctx.S; npcs = [];
    if(!mapDef) return;
    for(const f of (mapDef.folk || [])) npcs.push({kind: "folk", id: f.id, name: f.name, x: f.at[0], z: f.at[1], yaw: rnd() * 6, P: charMeshes(R, f.look), lines: f.lines || [], shop: f.shop, rest: f.rest, fac: f.fac, home: f.at.slice(), wander: f.wander || 0, tgt: null, wait: rnd() * 2, t: rnd() * 9, li: 0, walk: 0});
    for(const n of story.npcsOn(mapDef.id)) npcs.push({kind: "story", id: n.id, name: n.name, x: n.at[0], z: n.at[1], yaw: n.yaw || 0, P: charMeshes(R, n.look), def: n, home: n.at.slice(), wander: 0, t: rnd() * 9, walk: 0});
    const sp = mapDef.spawn;
    for(const n of npcs){ const [x, z] = world.freeSpot(n.x, n.z); n.x = x; n.z = z; }
}
// ---------- 原っぱのボス（いつでも戦える・何度でも挑戦できる）----------
let bossSpots = [], bossFx = null;
const EX = createExtra({ctx, cfg, saveCfg, prefix: "areq3_x_", getState: () => state, getMap: () => mapDef, getP: () => P, getNpcs: () => npcs, getBossSpots: () => bossSpots});
EX.patchBattle(Battle);
const fbDone = (id) => !!(ctx.S && ctx.S.flags && ctx.S.flags["fb_" + id]);
function fbOpen(b){ return !b.secret || ctx.data.maps.field.bosses.filter((o) => !o.secret).every((o) => fbDone(o.id)); }
function buildBosses(){
    bossSpots = []; if(!mapDef || mapDef.id !== "field" || !mapDef.bosses || !ctx.S) return;
    for(const b of mapDef.bosses){
        const d = ctx.data.monsters[b.id]; if(!d) continue;
        const model = monsterModel(ctx.R, specOf(Object.assign({id: b.id}, d))); bossSpots.push({b, d, x: b.at[0], z: b.at[1], model, sc: Math.min(3.4, d.size * .62) / model.h * 1.2, yaw: 0});
    }
}
function bossNear(){ let best = null, bd = 4.2; for(const s of bossSpots){ if(!fbOpen(s.b)) continue; const d = Math.hypot(s.x - P.x, s.z - P.z); if(d < bd){ bd = d; best = s; } } return best; }
function avgLv(){ const p = ctx.S.party; return Math.round(p.reduce((a, m) => a + (m.lv || 1), 0) / Math.max(1, p.length)); }
async function challengeBoss(sp, skipMenu){
    state = "talk"; const b = sp.b; const lv = avgLv(); const done = fbDone(b.id);
    const hint = lv >= b.rec ? "（いまの なかまの強さ Lv" + lv + "。いけそうだ！）" : "（おすすめ Lv" + b.rec + "。いまは Lv" + lv + "…少しあぶない！）";
    if(!skipMenu) await UI.say(b.name, done ? "また きたのか… いいだろう、もういちど あいてに なってやる！" : "ここは おれの なわばりだ！ よくぞ ここまで きた… かかってこい！");
    const r = skipMenu ? 0 : await UI.menu(b.name + (done ? "（たおした ことがある）" : "") + "　にいどむ？", [{label: "たたかう！", meta: "ボスせん"}, {label: "やめておく", meta: hint}], {cancel: true, hint});
    if(r !== 0){ state = "field"; hold = .3; return; }
    const res = await fight([b.id], {boss: true}); state = "field"; grace = 4;
    if(res === "win"){
        const first = !fbDone(b.id); ctx.S.flags["fb_" + b.id] = 1; EX.noteBoss(b.id);
        if(first){
            const g = b.gift || {}; if(g.gold){ ctx.S.gold += g.gold; } if(g.item){ ctx.S.inv[g.item] = (ctx.S.inv[g.item] || 0) + 1; }
            if(b.title){ ctx.S.titles = ctx.S.titles || []; if(!ctx.S.titles.includes(b.title)) ctx.S.titles.push(b.title); }
            ctx.A.jingle && ctx.A.jingle("save");
            await UI.card("ボス げきは！", b.name + " を たおした！", 1900);
            UI.toast("はじめての げきはボーナス：" + (g.gold || 0) + "G" + (g.item ? " ＋ " + ctx.data.items[g.item].name : "") + (b.title ? "　称号『" + b.title + "』" : ""), 4200);
            const left = mapDef.bosses.filter((o) => !o.secret && !fbDone(o.id)).length;
            if(!left && !fbDone("fb_secret")) await UI.say("？？？", "原っぱの はるか 北のはてに、ただならぬ 気配が あらわれた…！（道のつきあたり）");
        } else UI.toast(b.name + " を また たおした！");
        story.hud(); autosave();
    }
}
async function warpMap(id, x, z, yaw){
    if(!ctx.data.maps[id]) return; ctx.A.se("warp");
    if(!ctx.UI.fast) UI.flash();
    setWorld(id); const sp = ctx.data.maps[id].spawn; const px = x === undefined ? sp[0] : x, pz = z === undefined ? sp[1] : z;
    const fs = world.freeSpot(px, pz); P.x = fs[0]; P.z = fs[1]; P.yaw = yaw === undefined ? Math.PI : yaw; ctx.S.map = id;
    trail = []; refreshNpcs(); grace = 6; cool = 1.2; walkAcc = 0;
    camYaw = Math.PI; // 常に北向き（画面の上＝奥）から始める
    if(ctx.data.maps[id].name) UI.toast("📍 " + ctx.data.maps[id].name, 1800);
    syncSave();
}
function healAll(){ for(const m of ctx.S.party){ const st = statsOf(m, ctx.data.members); m.hp = st.maxhp; m.mp = st.maxmp; } }
// セーブデータを いまの形に ととのえる（古いデータの なかまに MP・職業を つける）
function initState(){ const S = ctx.S; if(!S.equip) S.equip = {}; if(S.coins === undefined) S.coins = 0; if(!S.titles) S.titles = []; if(!S.luckBattles) S.luckBattles = 0; for(const m of S.party) fixMember(m, ctx.data.members); setEquip(S); ctx.ranch.st(); }
function syncSave(){ const S = ctx.S; if(!S) return; S.x = P.x; S.z = P.z; S.yaw = P.yaw; }
function autosave(){ syncSave(); Save.write("auto", ctx.S); }

// ---------- 戦闘 ----------
async function fight(foeIds, opt){
    const prev = state; state = "busy"; ctx.A.se("encounter"); await ctx.UI.encounterClose(); state = "battle"; document.body.dataset.mode = "battle";
    const ground = ctx.data.maps[ctx.S.map].interior ? "store" : (ctx.S.map === "street" ? "street" : "field");
    const bossId = foeIds.find((id) => ctx.data.monsters[id].boss); let bgm = "mainbattle"; if(bossId) bgm = ctx.data.monsters[bossId].bgm || ((ctx.S.chapter >= 29 && ctx.S.chapter <= 30) || ctx.S.chapter >= 39 ? "lastboss" : "midboss"); battle.bgm = bgm;
    foeIds.forEach((id) => ctx.ranch.noteSeen(id)); const res = await battle.run(foeIds, Object.assign({ground}, opt));
    document.body.dataset.mode = "field"; ctx.UI.stopSkip();
    if(res === "lose"){ await defeat(); }
    state = prev === "battle" ? "field" : prev; story.hud(); autosave();
    return res;
}
async function defeat(){
    const S = ctx.S; await UI.card("ぜんめつ…", "目の前が まっくらになった", 1800);
    if(!cfg.pen) S.gold = Math.floor(S.gold / 2); healAll(); const home = story.def && story.def.start ? story.def.start.map : "town";
    await warpMap(home); UI.toast("気がつくと、町に もどっていた。" + (cfg.pen ? "" : "（所持金が半分になった）"), 3200); story.hud();
}
function encFor(){
    if(mapDef.id !== "field") return mapDef.enc;
    const base = mapDef.enc; const tbl = ctx.data.chapters.encByChapter; let table = base.table;
    if(story.def && story.def.enc) table = story.def.enc.table; else if(tbl) for(const [n, t] of tbl) if(ctx.S.chapter >= n) table = t;
    return Object.assign({}, base, {table});
}
// どうぐやで買い物
async function shop(ids){
    const S = ctx.S, D = ctx.data;
    for(;;){
        const r = await UI.menu("どうぐや　所持金 " + S.gold + "G", ids.map((id) => ({label: D.items[id].name, meta: D.items[id].price + "G　もっている " + (S.inv[id] || 0)})).concat([{label: "そざいを うる"}, {label: "やめる"}]), {cancel: true}); 
        if(r < 0 || r === ids.length + 1) break;
        if(r === ids.length){ await sellMats(); continue; }
        const it = D.items[ids[r]]; if(S.gold < it.price){ UI.toast("おかねが たりない！"); continue; }
        S.gold -= it.price; S.inv[ids[r]] = (S.inv[ids[r]] || 0) + 1; ctx.A.se("ok"); UI.toast(it.name + " を かった！（のこり " + S.gold + "G）"); story.hud();
    }
    await UI.say("どうぐやの主人", "まいど！ また きてくれよな。");
}
async function sellMats(){
    const S = ctx.S, D = ctx.data;
    for(;;){
        const ids = Object.keys(D.items).filter((k) => D.items[k].kind === "mat" && (S.inv[k] || 0) > 0);
        if(!ids.length){ UI.toast("うれる そざいを もっていない"); return; }
        const r = await UI.menu("そざいを うる　" + S.gold + "G", ids.map((k) => ({label: D.items[k].name, meta: D.items[k].sell + "G　×" + S.inv[k]})).concat([{label: "ぜんぶ うる（" + ids.reduce((a, k) => a + D.items[k].sell * S.inv[k], 0) + "G）"}, {label: "やめる"}]), {cancel: true});
        if(r < 0 || r === ids.length + 1) return;
        if(r === ids.length){ for(const k of ids){ S.gold += D.items[k].sell * S.inv[k]; S.inv[k] = 0; } }
        else { S.inv[ids[r]]--; S.gold += D.items[ids[r]].sell; }
        ctx.A.se("ok"); story.hud();
    }
}
// 休む（HP全回復＋オートセーブ）
async function rest(){
    const r = await UI.menu("ゆっくり やすみますか？", [{label: "やすむ"}, {label: "やめておく"}], {cancel: true});
    if(r !== 0) return;
    healAll(); ctx.A.se("heal"); autosave(); ctx.A.jingle("save"); await UI.card("ぐっすり ねむった…", "HPが ぜんかいふくした！（オートセーブ）", 1700);
}
function rollEncounter(){
    if(Cheats.flags.noenc) return;
    const S = ctx.S; const enc = encFor(); if(!enc) return;
    const z = enc.zone; if(P.x < z[0] || P.x > z[2] || P.z < z[1] || P.z > z[3]) return;
    if(world && world.dangerAt && !world.dangerAt(P.x, P.z)) return;
    if(rnd() > enc.rate * EX.encMul()) return;
    const n = 1 + Math.floor(rnd() * Math.min(3, 1 + S.party.length)); const foes = []; const pool = (mapDef.id === "field" && ctx.data.encpool) ? ctx.data.encpool[S.chapter] : null;
    for(let i = 0; i < n; i++){ if(pool && pool.length && rnd() < .7) foes.push(pool[Math.floor(rnd() * pool.length)]); else foes.push(enc.table[Math.floor(rnd() * enc.table.length)]); }
    return foes;
}

// ---------- 会話 ----------
async function talkTo(n){
    state = "talk"; n.yaw = Math.atan2(P.x - n.x, P.z - n.z); P.yaw = Math.atan2(n.x - P.x, n.z - P.z); n.walk = 0;
    try{
        if(n.kind === "folk"){ const l = n.lines.length ? n.lines[n.li++ % n.lines.length] : "…"; await UI.say(n.name, story.tx(l)); if(n.shop) await shop(n.shop); if(n.rest) await rest(); if(n.fac) await ctx.places.facility(n); }
        else { await story.runTop(n.def.talk); }
    } finally { UI.hideDlg(); UI.stopSkip(); if(state === "talk") state = "field"; autosave(); }
}

// ---------- メニュー ----------
async function openMenu(){
    state = "menu"; const S = ctx.S, D = ctx.data;
    for(;;){
        const r = await UI.menu("メニュー　" + S.gold + "G　コイン" + (S.coins || 0), [{label: "つよさ"}, {label: "じゅもん"}, {label: "どうぐ"}, {label: "ずかん"}, {label: "もくてき", meta: S.obj}, {label: "セーブ"}, {label: "せってい"}, {label: "タイトルへ"}, {label: "ひみつのコード"}].concat(world.interior ? [{label: "そとへ でる（こまったとき）"}] : [], [{label: "おまけ・きろく"}]), {cancel: true});
        if(r < 0) break;
        if(r === 9 + (world.interior ? 1 : 0)){ await EX.menu(); continue; }
        if(r === 8){ await codeBox(); continue; }
        if(r === 9 && world.interior){ const rr = S.ret || {map: "town", x: 0, z: 18}; await warpMap(rr.map, rr.x, rr.z, Math.PI); break; }
        if(r === 0) await ctx.places.status();
        else if(r === 1){ const w = await ctx.places.fieldSpells(); if(w === "warp") break; }
        else if(r === 2) await itemMenu();
        else if(r === 3) await ctx.places.zukan();
        else if(r === 4){ UI.toast("もくてき：" + (S.obj || "なし"), 3000); }
        else if(r === 5){
            syncSave();
            const j = await UI.menu("どこに セーブする？", ["1", "2", "3"].map((s) => ({label: "スロット" + s, meta: Save.label(Save.read(s))})), {cancel: true}); if(j < 0) continue;
            UI.toast(Save.write(String(j + 1), S) ? (ctx.A.jingle("save"), "セーブしました") : "セーブに しっぱいしました（保存領域が使えません）");
        }
        else if(r === 6) await settingsMenu();
        else if(r === 7){ const j = await UI.menu("タイトルに もどりますか？（オートセーブします）", [{label: "はい"}, {label: "いいえ"}], {cancel: true}); if(j === 0){ autosave(); await showTitle(); return; } }
    }
    state = "field"; hold = .25;
}
async function itemMenu(){
    const S = ctx.S, D = ctx.data;
    for(;;){
        const ids = Object.keys(D.items).filter((k) => (S.inv[k] || 0) > 0 && D.items[k].kind !== "equip");
        if(!ids.length){ UI.toast("どうぐを もっていない"); break; }
        const i = await UI.menu("どうぐ", ids.map((k) => ({label: D.items[k].name, meta: "×" + S.inv[k] + "　" + D.items[k].desc})), {cancel: true}); if(i < 0) break;
        const id = ids[i], it = D.items[id], kind = it.kind;
        if(kind === "mat" || kind === "breed" || kind === "flute"){ UI.toast(kind === "flute" ? "せんとうちゅうに つかう どうぐ だ。" : kind === "breed" ? "ぼくじょうで つかう どうぐ だ。" : "どうぐやで うれる そざい だ。"); continue; }
        if(kind === "ticket"){ S.luckBattles = (S.luckBattles || 0) + 10; S.inv[id]--; ctx.A.se("levelup"); UI.toast("つぎの 10せんとう ゴールドが 1.5ばい！"); continue; }
        if(kind === "book"){ S.inv[id]--; let ups = 0; for(const m of S.party){ const u = gainExp(m, D.members, Math.max(1, expNeed(m.lv) - m.exp)); ups += u.length; } ctx.A.se("levelup"); UI.toast("みんなの レベルが あがった！"); story.hud(); continue; }
        const w = await UI.menu("だれに つかう？", S.party.map((m) => { const st = statsOf(m, D.members); return {label: D.members[m.id].name.replace("{name}", S.name), meta: "HP " + m.hp + "/" + st.maxhp + "　MP " + (m.mp || 0) + "/" + st.maxmp, disabled: kind === "revive" ? m.hp > 0 : m.hp <= 0}; }), {cancel: true}); if(w < 0) continue;
        const m = S.party[w], st = statsOf(m, D.members);
        if(kind === "hp"){ if(m.hp >= st.maxhp){ UI.toast("HPは まんたんだ"); continue; } S.inv[id]--; m.hp = Math.min(st.maxhp, m.hp + it.heal); ctx.A.se("heal"); UI.toast("HPが かいふくした！"); }
        else if(kind === "mp"){ if((m.mp || 0) >= st.maxmp){ UI.toast("MPは まんたんだ"); continue; } S.inv[id]--; m.mp = Math.min(st.maxmp, (m.mp || 0) + it.mp); ctx.A.se("heal"); UI.toast("MPが かいふくした！"); }
        else if(kind === "revive"){ S.inv[id]--; m.hp = Math.max(1, Math.round(st.maxhp * it.revive)); ctx.A.se("heal"); UI.toast("ふっかつ した！"); }
    }
}
async function settingsMenu(){
    const Q = {auto: "じどう", high: "たかい", mid: "ふつう", low: "ひくい"}, T = {auto: "じどう", on: "ひょうじ", off: "かくす"}, SP = {1: "ゆっくり", 2: "ふつう", 4: "はやい"};
    for(;;){
        const r = await UI.menu("せってい", [{label: "かいぞうど（がぞうひんしつ）", meta: Q[cfg.quality]}, {label: "もじの はやさ", meta: SP[cfg.speed]}, {label: "かいわの オート", meta: UI.autoTalk ? "ON" : "OFF"}, {label: "タッチボタン", meta: T[cfg.touch]}, {label: "おと（BGM・こうかおん）", meta: cfg.sound ? "ON" : "OFF"}, {label: "BGMの おおきさ", meta: Math.round(cfg.bgmVol * 100) + "%"}, {label: "こうかおんの おおきさ", meta: Math.round(cfg.seVol * 100) + "%"}, {label: "そうさの せつめい"}, {label: "がめんの むき（絵が さかさま のとき）", meta: FLIP[cfg.flip || "none"]}].concat(EX.settingsItems()), {cancel: true}); if(r < 0) break;
        if(r === 0){ const o = ["auto", "high", "mid", "low"]; cfg.quality = o[(o.indexOf(cfg.quality) + 1) % o.length]; scale = 0; }
        else if(r === 1){ const o = [1, 2, 4]; cfg.speed = o[(o.indexOf(cfg.speed) + 1) % o.length]; UI.textSpeed = cfg.speed; }
        else if(r === 2){ UI.toggleAuto(); cfg.auto = UI.autoTalk; }
        else if(r === 3){ const o = ["auto", "on", "off"]; cfg.touch = o[(o.indexOf(cfg.touch) + 1) % o.length]; applyTouch(); }
        else if(r === 4){ cfg.sound = !cfg.sound; ctx.A.on = cfg.sound; if(!cfg.sound) ctx.A.stopAll(); else ctx.A.sync(); }
        else if(r === 5){ const o = [0, .25, .5, .75, 1]; cfg.bgmVol = o[(o.findIndex((v) => Math.abs(v - cfg.bgmVol) < .01) + 1) % o.length]; ctx.A.setVol(cfg.bgmVol); }
        else if(r === 6){ const o = [0, .3, .6, .8, 1]; cfg.seVol = o[(o.findIndex((v) => Math.abs(v - cfg.seVol) < .01) + 1) % o.length]; ctx.A.seVol = cfg.seVol; ctx.A.se("ok"); }
        else if(r === 7){ await showHelp(); }
        else if(r === 8){ nextFlip(); }
        else if(r >= 9) EX.settingsHandle(r - 9);
        saveCfg();
    }
}
const FLIP = {none: "ふつう", v: "上下を反転", h: "左右を反転", vh: "上下左右を反転（180°）"};
function applyFlip(){ const c = $("gl"); if(!c) return; const f = cfg.flip || "none"; c.style.transform = f === "none" ? "" : "scale(" + (f.includes("h") ? -1 : 1) + "," + (f.includes("v") ? -1 : 1) + ")"; }
function nextFlip(){ const o = ["none", "v", "h", "vh"]; cfg.flip = o[(o.indexOf(cfg.flip) + 1) % o.length]; applyFlip(); saveCfg(); return FLIP[cfg.flip]; }
function applyTouch(){ document.body.classList.toggle("touch", cfg.touch === "on" || (cfg.touch === "auto" && (Input.touch || qs.get("touch") === "1"))); }

// ---------- あそびかた（操作の説明）----------
function showHelp(){
    return new Promise((resolve) => {
        const el = $("help"); el.hidden = false; const close = () => { el.hidden = true; removeEventListener("keydown", kd); el.removeEventListener("pointerdown", pd); resolve(); };
        const kd = (ev) => { if(["Escape", "Enter", " ", "x", "Backspace"].includes(ev.key)){ ev.preventDefault(); close(); } }; const pd = (ev) => { if(ev.target.closest("#helpX") || ev.target === el) close(); };
        addEventListener("keydown", kd); el.addEventListener("pointerdown", pd); $("helpX").focus();
    });
}
// ---------- タイトル ----------
async function showTitle(){
    state = "title"; document.body.dataset.mode = "title"; UI.hideDlg(); $("title").hidden = false; $("hud").hidden = true; $("prompt").hidden = true; $("bt").hidden = true;
    const box = $("titleBtns"); box.innerHTML = ""; const any = Save.slots.some((s) => Save.read(s));
    const mk = (label, fn, dis) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.disabled = !!dis; b.addEventListener("click", fn); box.appendChild(b); return b; };
    mk("はじめから", () => startNew());
    mk("つづきから", () => continueGame(), !any);
    mk("そうさの せつめい", () => showHelp());
    const fb = mk("🔄 がめんの むき：" + FLIP[cfg.flip || "none"] + "（絵がさかさまなら押す）", () => { fb.textContent = "🔄 がめんの むき：" + nextFlip() + "（絵がさかさまなら押す）"; });
    mk("🗝️ ひみつのコード", () => codeBox());
    mk("🗡️ ARE QUEST（1）へ", () => { location.href = "../game/index.html"; });
    mk("🎡 ドリームフロンティアへ", () => { location.href = "../dream-frontier/index.html"; });
    $("titleFoot").textContent = "移動 WASD/矢印　決定 Space/Enter　メニュー Esc　走る Shift　カメラ Q/E　オート V　／　Proコン・タッチ操作にも対応";
    if(qs.get("name")) $("nameIn").value = qs.get("name");
    window.__bootDone = true;
}
function hideTitle(){ $("title").hidden = true; $("hud").hidden = false; document.body.dataset.mode = "field"; }
async function startNew(chapter){
    delete (ctx.S || {}).ending;
    const name = ($("nameIn").value || "主人公").trim().slice(0, 8) || "主人公"; ctx.S = newState(name); { const y = ($("yomiIn") ? $("yomiIn").value : "").normalize("NFKC").replace(/\s+/g, ""); ctx.S.yomi = /^[ぁ-ゖァ-ヺー・]{1,16}$/.test(y) ? y : ""; } initState(); hideTitle(); ctx.A.se("ok"); state = "busy";
    const first = story.order()[0];
    if(chapter && chapter !== first) await prepareAt(chapter);
    await enterGame(chapter || first, true);
}
// 話えらび：その話までに仲間になるはずのメンバーと、それらしいレベルで始める
async function prepareAt(n){
    const S = ctx.S, D = ctx.data;
    const ord = story.order(), idx = Math.max(0, ord.indexOf(n));
    for(const i of ord.slice(0, idx)){ const d = await story.load(i); const seek = (ops) => { for(const o of ops){ if(!Array.isArray(o)) continue; if(o[0] === "join" && !S.party.some((m) => m.id === o[1])) S.party.push(newMember(o[1], D.members, 1)); for(const x of o) if(Array.isArray(x) && Array.isArray(x[0])) seek(x); } }; for(const nn of d.npcs) seek(nn.talk); seek(d.onStart || []); }
    const lv = Math.max(1, Math.round(1 + idx * 0.85)); for(const m of S.party){ m.lv = lv; m.exp = 0; learnCheck(m, D.members); const st = statsOf(m, D.members); m.hp = st.maxhp; m.mp = st.maxmp; }
    S.gold = 30 + idx * 40; S.inv.yakusou = 3 + Math.floor(idx / 3);
}
async function chapterSelect(){
    const t = $("title"); t.hidden = true;
    const ord = story.order(); const list = ord.map((i) => ({label: story.label(i), meta: ctx.data.chapters.chapters[i - 1].title}));
    const r = await UI.menu("どの話から はじめますか？", list, {cancel: true}); t.hidden = false;
    if(r >= 0) await startNew(ord[r]);
}
async function continueGame(){
    const t = $("title"); t.hidden = true;
    const list = Save.slots.map((s) => { const d = Save.read(s); return {label: s === "auto" ? "オートセーブ" : "スロット" + s, meta: Save.label(d), disabled: !d}; });
    const r = await UI.menu("どれを つづけますか？", list, {cancel: true}); t.hidden = false; if(r < 0) return;
    const d = Save.read(Save.slots[r]); if(!d) return;
    ctx.S = d; initState(); hideTitle(); state = "busy"; await enterGame(d.chapter, false);
}
async function enterGame(n, fresh){
    const S = ctx.S;
    if(fresh){
        setWorld("town"); S.map = "town"; P.x = 0; P.z = 18; P.yaw = Math.PI; refreshNpcs();
        await story.begin(n, false); await story.begin(n, true);
    } else {
        await story.begin(n, false); setWorld(S.map in ctx.data.maps ? S.map : "town"); const fs = world.freeSpot(S.x, S.z); P.x = fs[0]; P.z = fs[1]; P.yaw = S.yaw || 0; refreshNpcs(); story.hud();
    }
    P.P = charMeshes(ctx.R, ctx.data.members.hero.look); camYaw = Math.PI; trail = []; grace = 4; cool = 1; state = "field"; document.body.dataset.mode = "field"; story.hud();
}

// ---------- フィールドの更新 ----------
const SPEED = 5.2, DASH = 1.7;
function movePlayer(dt){
    const f = [Math.sin(camYaw), Math.cos(camYaw)], r = [-f[1], f[0]];
    let dx = f[0] * Input.my + r[0] * Input.mx, dz = f[1] * Input.my + r[1] * Input.mx; const l = Math.hypot(dx, dz);
    if(l > .08){
        const k = Math.min(1, l); const sp = SPEED * (Input.held.dash ? DASH : 1) * (Cheats.flags.mega ? 4 : Cheats.flags.fast ? 2 : 1); dx = dx / l * sp * k * dt; dz = dz / l * sp * k * dt;
        let [nx, nz] = world.move(P.x, P.z, dx, dz, .38);
        for(const n of npcs){ const dn = Math.hypot(nx - n.x, nz - n.z); if(dn < .85 && dn < Math.hypot(P.x - n.x, P.z - n.z)){ nx = P.x; nz = P.z; break; } }
        for(const sp of bossSpots){ if(!fbOpen(sp.b)) continue; const dn = Math.hypot(nx - sp.x, nz - sp.z); if(dn < 1.7 && dn < Math.hypot(P.x - sp.x, P.z - sp.z)){ nx = P.x; nz = P.z; break; } }
        const moved = Math.hypot(nx - P.x, nz - P.z); P.x = nx; P.z = nz; P.yaw = lerpA(P.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14)); P.walk = Math.min(1, P.walk + dt * 8); P.t += dt * Math.min(1, l) * (moved > 0 ? 1 : 0);
        walkAcc += moved; ctx.S.steps += moved;
        if(!trail.length || Math.hypot(trail[0].x - P.x, trail[0].z - P.z) > .45){ trail.unshift({x: P.x, z: P.z, yaw: P.yaw}); if(trail.length > 40) trail.pop(); }
        return moved;
    }
    P.walk = Math.max(0, P.walk - dt * 10); return 0;
}
function updateNpcs(dt){
    for(const n of npcs){
        n.t += dt;
        if(n.kind === "folk" && n.wander && state === "field"){
            n.wait -= dt;
            if(n.tgt){ const dx = n.tgt[0] - n.x, dz = n.tgt[1] - n.z, d = Math.hypot(dx, dz); if(d < .15){ n.tgt = null; n.walk = 0; n.wait = 1.5 + rnd() * 3; } else { const s = 1.1 * dt; const [nx, nz] = world.move(n.x, n.z, dx / d * s, dz / d * s, .35); if(Math.hypot(nx - P.x, nz - P.z) > .9){ n.x = nx; n.z = nz; } n.yaw = lerpA(n.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); n.walk = 1; } }
            else if(n.wait <= 0){ const a = rnd() * 6.28, r = rnd() * n.wander; n.tgt = [n.home[0] + Math.cos(a) * r, n.home[1] + Math.sin(a) * r]; if(world.hit(n.tgt[0], n.tgt[1], .4)) n.tgt = null; else n.walk = 1; n.wait = 99; }
        }
    }
}
function nearest(){
    let best = null, bd = 2.3;
    for(const n of npcs){ const d = Math.hypot(n.x - P.x, n.z - P.z); if(d < bd){ bd = d; best = n; } }
    return best;
}
function fieldTick(dt, e){
    if(hold > 0){ hold -= dt; }
    const moved = movePlayer(dt);
    updateNpcs(dt);
    camYaw += (Input.cam * 1.9 * dt) - (Input.dragRot || 0);
    nearNpc = nearest(); const nb = nearNpc ? null : bossNear(); const pr = $("prompt"); pr.hidden = !(nearNpc || nb); const key = document.body.classList.contains("touch") ? "（Aボタン）" : "（Space / Enter）";
    if(nearNpc) pr.textContent = "💬 " + nearNpc.name + "と話す" + key; else if(nb) pr.textContent = "⚔ " + nb.b.name + "に挑む" + key;
    zoneBadge();
    if(cool > 0) cool -= dt; if(grace > 0) grace -= moved;
    if(e.ok && nearNpc && hold <= 0){ talkTo(nearNpc); return; }
    if(e.ok && nb && hold <= 0){ challengeBoss(nb); return; }
    if(e.menu){ openMenu(); return; }
    if(cool <= 0){
        for(const w of world.warps){
            if(Math.hypot(P.x - w.x, P.z - w.z) < (w.r || 1.3) * .85 || (w.to === "__exit" && world.interior && P.z > w.z - .5)){
                if(w.to === "__exit"){ const r = ctx.S.ret || {map: "town", x: 0, z: 18}; state = "busy"; warpMap(r.map, r.x, r.z, Math.PI).then(() => { state = "field"; }); }
                else { if(ctx.data.maps[w.to] && ctx.data.maps[w.to].interior) ctx.S.ret = {map: mapDef.id, x: w.x, z: w.z + 2.8}; state = "busy"; warpMap(w.to, w.x2, w.z2, w.yaw).then(() => { state = "field"; }); }
                return;
            }
        }
    }
    if(moved > 0 && grace <= 0 && walkAcc > 1.6){
        walkAcc = 0; const foes = rollEncounter();
        if(foes){ state = "busy"; fight(foes, {}).then(() => { state = "field"; grace = 5; }); }
    }
}

// 「いま立っている場所にモンスターが出るか」を画面上に出す
function zoneBadge(){
    const el = $("zoneBadge"); if(!el) return;
    if(!mapDef || !mapDef.enc || !world || !world.dangerAt){ el.hidden = true; return; }
    const d = world.dangerAt(P.x, P.z); el.hidden = false; el.className = d ? "danger" : "safe";
    el.textContent = d ? "⚔ ここは モンスターが出る場所！（赤い地面）" : "🕊 ここは安全（モンスターは出ません）";
}
// ---------- 描画 ----------
function drawField(dt){
    EX.frame(dt);
    const R = ctx.R; const t = tNow;
    const portrait = ctx.cssH > ctx.cssW; const dist = (world.interior ? 7 : (portrait ? 10 : 8.2)) * EX.camMul(), hgt = (world.interior ? 6.2 : (portrait ? 6.8 : 5.3)) * (EX.camMul() > 1 ? 1.12 : EX.camMul() < 1 ? .92 : 1);
    const eye = [P.x - Math.sin(camYaw) * dist, 1.2 + hgt, P.z - Math.cos(camYaw) * dist];
    if(world.interior){ const b = world.bounds; eye[0] = Math.max(b[0] - .2, Math.min(b[2] + .2, eye[0])); eye[2] = Math.max(b[1] - .2, Math.min(b[3] + 9, eye[2])); }
    const cam = {eye, target: [P.x, 1.0, P.z], fov: portrait ? 1.0 : .88};
    R.begin(cam, world.env); world.draw(cam);
    drawChar(R, P.P, {x: P.x, z: P.z, yaw: P.yaw, walk: P.walk, t: P.t}, {});
    const S = ctx.S;
    for(let i = 1; i < S.party.length; i++){
        const d = ctx.data.members[S.party[i].id]; const T = trail[Math.min(trail.length - 1, i * 6)] || {x: P.x - Math.sin(P.yaw) * i * 1.1, z: P.z - Math.cos(P.yaw) * i * 1.1, yaw: P.yaw};
        const mv = trail.length > 1 && P.walk > .1; drawChar(R, charMeshes(R, d.look), {x: T.x, z: T.z, yaw: T.yaw, walk: mv ? 1 : 0, t: P.t}, {});
    }
    for(const n of npcs){
        drawChar(R, n.P, {x: n.x, z: n.z, yaw: n.yaw, walk: n.walk || 0, t: n.t * 1.2}, {});
        if(n.kind === "story" && story.hasMark(n)){
            if(!markMesh){ const g = new Geo(); g.sprite(.8, .8, [1, 1, 1], M4.id()); markMesh = {m: R.mesh(g), tex: R.tex(canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#ffd24a"; x.strokeStyle = "#7a4a00"; x.lineWidth = 6; x.beginPath(); x.arc(32, 32, 26, 0, 6.3); x.fill(); x.stroke(); x.fillStyle = "#7a2a00"; x.font = "bold 44px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("!", 32, 35); }))}; }
            R.draw(markMesh.m, {m: M4.mul(M4.T(n.x, 2.5 + Math.sin(t * 4) * .1, n.z), M4.RY(camYaw + Math.PI)), tex: markMesh.tex, mode: 2, blend: true, cut: .02});
        }
    }
    for(const sp of bossSpots){
        if(!fbOpen(sp.b)) continue;
        sp.yaw = Math.atan2(P.x - sp.x, P.z - sp.z);
        if(!bossFx){ const g = new Geo(); g.cyl(2.2, 2.2, .05, 24, "#ff4a30", M4.T(0, .07, 0)); const g2 = new Geo(); g2.sprite(1.6, 1.6, [1, 1, 1], M4.id());
            bossFx = {ring: R.mesh(g), mark: R.mesh(g2), tex: R.tex(canvasTex(96, 96, (x) => { x.fillStyle = "#d02020"; x.strokeStyle = "#fff"; x.lineWidth = 6; x.beginPath(); x.arc(48, 48, 40, 0, 6.3); x.fill(); x.stroke(); x.fillStyle = "#fff"; x.font = "bold 58px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("⚔", 48, 52); }))}; }
        const done = fbDone(sp.b.id);
        R.draw(bossFx.ring, {m: M4.T(sp.x, 0, sp.z), mode: 3, tint: done ? [.4, 1, .5, .35] : [1, .2, .1, .4 + Math.sin(t * 4) * .15], blend: true});
        drawMonster(R, sp.model, {x: sp.x, z: sp.z, yaw: sp.yaw, s: sp.sc, t, ph: sp.x}, null);
        R.draw(bossFx.mark.m || bossFx.mark, {m: M4.mul(M4.T(sp.x, sp.d.size * .75 + 1.6 + Math.sin(t * 3) * .12, sp.z), M4.RY(camYaw + Math.PI)), tex: bossFx.tex, mode: 2, blend: true, cut: .02});
    }
    R.flush();
}

// ---------- BGM ----------
function bgmFor(){
    if(state === "title" || state === "boot" || !ctx.S) return "opening";
    if(state === "park") return ctx.park.bgm();
    if(ctx.S.ending) return "ending";
    if(battle && battle.active) return battle.bgm || "mainbattle";
    const ov = ctx.data.chapters.bgm && ctx.data.chapters.bgm[ctx.S.chapter]; return (ov && ov[mapDef.id]) || mapDef.bgm || "field";
}
// ---------- ループ ----------
function resize(){
    const c = $("gl"); const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight; ctx.cssW = w; ctx.cssH = h;
    const dpr = Math.max(1, window.devicePixelRatio || 1); const budget = Math.sqrt(2.2e6 / (w * h)); const limit = cfg.quality === "low" ? .6 : cfg.quality === "mid" ? 1 : 2;
    maxScale = ctx.R.name === "three" ? Math.max(.35, Math.min(1, budget / dpr, limit)) : Math.max(.5, Math.min(dpr, budget, limit));
    if(!scale || scale > maxScale) scale = cfg.quality === "auto" ? Math.min(maxScale, 1.25) : maxScale;
    ctx.R.resize(w, h, scale);
}
function adapt(){
    if(cfg.quality !== "auto" || ++frames % 90) return;
    if(ema > .026 && scale > .5){ scale = Math.max(.5, scale * .85); ctx.R.resize(ctx.cssW, ctx.cssH, scale); }
    else if(ema < .0185 && scale < maxScale && frames % 360 === 0){ scale = Math.min(maxScale, scale * 1.1); ctx.R.resize(ctx.cssW, ctx.cssH, scale); }
}
let last = 0;

// ---------- ひみつのコード・もどし機能・フリーズ対策 ----------
function cheatCtx(){
    return Object.assign(ctx, {startBossRush: async () => { if(state !== "field" || !ctx.S) return; const ids = Object.keys(ctx.data.monsters).filter((i) => /^MON\d+$/.test(i) && +i.slice(3) < 500 && +i.slice(3) > 10).sort((a, b) => ctx.data.monsters[a].hp - ctx.data.monsters[b].hp); const top = ids.slice(Math.floor(ids.length * .5)); const pick = [0, .25, .5, .75, 1].map((q) => top[Math.floor(q * (top.length - 1))]).filter((v, i, a) => v && a.indexOf(v) === i); for(const id of pick){ healAll(); const res = await fight([id], {boss: true}); if(res !== "win") return; } ctx.UI.toast("ボスラッシュ ぜんぶ たおした！"); healAll(); }, gainExp, expNeed, statsOf, setEquip, story, autosave, rescue, jumpChapter: (n) => { if(!story.order().includes(+n) || !ctx.S) return false; state = "busy"; enterGame(+n, true).then(() => { if(state === "busy") state = "field"; }).catch((e) => { console.error(e); rescue("話へ ジャンプ"); }); return true; }});
}
async function codeBox(){ const was = state; await openCodeBox(cheatCtx()); applyFx(); if(state === "menu" || state === "title") { /* そのまま */ } else state = was; }
let rescues = 0;
function rescue(why){
    rescues++; console.warn("[rescue]", why);
    try{ if(battle){ battle.active = false; battle.autoAll = false; battle._idle = 0; } }catch(_e){}
    try{ for(const id of ["codeBox"]){ const e = document.getElementById(id); if(e) e.remove(); } document.querySelectorAll("body > div[style*='z-index:99']").forEach((e) => e.remove()); }catch(_e){}
    try{ UI.hideDlg(); }catch(_e){}
    if(ctx.S && world){ state = "field"; hold = .3; try{ autosave(); }catch(_e){} UI.toast && UI.toast("うごかなく なったので もとに もどしました（セーブ済み）", 3500); }
    else state = "title";
}
// 連続エラー → じどうで もどす。 ひと休みの 自動セーブ。 Escを 3びょう 長おし／右上の ⚠ ボタンで もどす
let errRun = 0, escHold = 0, lastAuto = 0, stallT = 0;
addEventListener("error", () => { errRun++; if(errRun >= 4){ errRun = 0; rescue("エラーが つづいた"); } });
addEventListener("unhandledrejection", () => { errRun++; if(errRun >= 4){ errRun = 0; rescue("エラーが つづいた"); } });
addEventListener("keydown", (e) => { if(e.key === "p" || e.key === "P"){ if(Cheats.flags.photo && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) document.body.classList.toggle("photo"); } });
document.addEventListener("visibilitychange", () => { if(document.hidden && ctx.S && state === "field"){ try{ autosave(); }catch(_e){} } });
function watchdog(dt){
    if(ctx.S && state === "field"){ lastAuto += dt; if(lastAuto > 60){ lastAuto = 0; try{ autosave(); }catch(_e){} } }
    // Esc を ずっと おす → もどす
    if(Input.held && (Input.held.cancel || Input.held.menu) && state !== "title"){ escHold += dt; } else escHold = 0;
    if(escHold > 3){ escHold = 0; rescue("Escの ながおし"); }
    // 「はなしかけ中・メニュー中・ビジー」のまま ぜんぜん うごかない ときの ボタン
    const stuck = (state === "busy" || state === "talk" || state === "menu") && !document.getElementById("dlg")?.offsetParent && !document.querySelector("#menu:not([hidden])");
    stallT = stuck ? stallT + dt : 0;
    const b = document.getElementById("rescueBtn"); if(b) b.hidden = !(stallT > 8 || (state === "battle" && battle && (battle._idle || 0) > 40));
    if(state === "battle" && battle){ battle._idle = (battle._idle || 0) + dt; if(battle._idle > 120){ battle._idle = 0; rescue("せんとうが すすまない"); } }
    if(Cheats.flags.clock && ctx.S){ let c = document.getElementById("clockHud"); if(!c){ c = document.createElement("div"); c.id = "clockHud"; c.style.cssText = "position:fixed;right:8px;top:8px;z-index:30;background:#000a;color:#fff;padding:2px 8px;border-radius:8px;font:12px monospace"; document.body.appendChild(c); } ctx.S.play = (ctx.S.play || 0) + dt; const t = Math.floor(ctx.S.play); c.textContent = String(Math.floor(t / 3600)).padStart(2, "0") + ":" + String(Math.floor(t / 60) % 60).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); } else { const c = document.getElementById("clockHud"); if(c) c.remove(); }
}
function frame(ts){
    requestAnimationFrame(frame);
    try{ frameBody(ts); errRun = 0; }catch(err){ console.error(err); if(++errRun >= 4){ errRun = 0; rescue("がめん更新で エラー"); } }
}
function frameBody(ts){
    const dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts; tNow = ts / 1000; ema += (dt - ema) * .05; fps = fps * .9 + (1 / Math.max(dt, .001)) * .1; adapt();
    if(qs.get("dbg") || Cheats.flags.fps) $("hudDbg").textContent = Math.round(fps) + "fps " + ctx.R.w + "x" + ctx.R.h + " d" + ctx.R.stats.draws;
    Input.poll(); const e = Input.edge; watchdog(dt);
    if(battle && battle._idle && (e.ok || e.cancel || e.menu)) battle._idle = 0;
    { const k = bgmFor(); if(k !== ctx.A.want) ctx.A.play(k); if(!UI.fast){ if(e.ok) ctx.A.se("ok"); else if(e.cancel) ctx.A.se("cancel"); } }
    if(state === "title"){ UI.route(e); if(world) { /* タイトル背景は町を回す */ } drawTitleBg(dt); return; }
    if(state === "boot" || !world) return;
    const routed = UI.route(e);
    if(state === "park"){ ctx.park.update(dt, e, routed); return; }
    if(state === "battle"){ if(!battle){ state = "field"; return; } battle.update(dt); battle.render(); return; }
    if(state === "field" && !routed) fieldTick(dt, e);
    else { updateNpcs(dt); P.walk = Math.max(0, P.walk - dt * 10); if(state === "talk" || state === "menu" || state === "busy"){ $("prompt").hidden = true; } }
    if(state === "battle") return;
    drawField(dt);
}
function drawTitleBg(dt){
    if(!world) return; camYaw += dt * .12; P.walk = 0; const R = ctx.R;
    const cam = {eye: [Math.sin(camYaw) * 16, 7, Math.cos(camYaw) * 16 + 6], target: [0, 2, 0], fov: .9}; R.begin(cam, world.env); world.draw(cam); R.flush();
}

// ---------- 起動 ----------
async function boot(){
    try{
        let canvas = $("gl"), R = null;
        if(qs.get("engine") !== "webgl2"){
            try{ const three = await import("../../shared/three-renderer.js"); R = three.createThreeRenderer(canvas, {keep: qs.get("keep") === "1"}); }
            catch(err){ console.warn("Three.js を起動できないため、互換描画へ切り替えます。", err); }
        }
        if(!R){ const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement; R = createRenderer(canvas, {keep: qs.get("keep") === "1"}); if(R) R.name = "webgl2"; }
        if(!R) throw new Error("3D描画を開始できませんでした"); ctx.R = R;
        const [maps, monsters, items, members, chapters, abilities, jobs, mons, casino, encpool] = await Promise.all(["maps", "monsters", "items", "members", "chapters", "abilities", "jobs", "mons", "casino", "encpool"].map((n) => jget("data/" + n + ".json")));
        for(const m of Object.values(mons)) monsters[m.id] = {name: m.n, art: m.art, hp: m.hp, atk: m.atk, def: m.def, spd: m.spd, exp: m.exp, gold: m.gold, size: m.size, sk: m.sk, drop: m.drop, rank: m.rank, cat: m.cat};
        for(const b of ((maps.field || {}).bosses || [])){ const base = monsters[b.from]; if(!base) continue; monsters[b.id] = Object.assign({}, base, {name: b.name, boss: true, hp: Math.round(base.hp * (b.hp || 1)), atk: Math.round(base.atk * (b.atk || 1)), exp: Math.round(base.exp * (b.exp || 1)), gold: Math.round(base.gold * (b.gold || 1)), size: Math.max(base.size || 3, 3.6), bgm: b.bgm || base.bgm, drop: undefined}); }
        ctx.data = {maps, monsters, items, members, chapters, abilities, jobs, mons, casino, encpool}; setGameData(ctx.data); ctx.ranch = makeRanch(ctx); ctx.places = new Places(ctx); ctx.park = new Park(ctx); ctx.setState = (v) => { state = v; }; ctx.getState = () => state;
        story = new Story(ctx); ctx.story = story; battle = new Battle(ctx); ctx.shop = shop; ctx.rest = rest; ctx.refreshNpcs = refreshNpcs; ctx.warpMap = warpMap; ctx.fight = fight; ctx.healAll = healAll; ctx.autosave = autosave;
        UI.init(); applyFlip(); watchKonami(() => { if(state === "title" || state === "field") codeBox(); }); applyFx(); $("rescueBtn").addEventListener("click", () => rescue("ボタン")); Audio2.init(cfg); Input.init($("app")); applyTouch(); if(cfg.auto) UI.toggleAuto();
        addEventListener("resize", resize); addEventListener("orientationchange", () => setTimeout(resize, 200)); resize();
        P.P = charMeshes(R, members.hero.look); setWorld("town");
        canvas.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); UI.toast("画面の描画が中断されました。ページを再読み込みしてください。", 8000); });
        document.addEventListener("visibilitychange", () => { if(document.hidden && ctx.S && state === "field") autosave(); });
        addEventListener("pagehide", () => { if(ctx.S && state === "field") autosave(); });
        await showTitle(); requestAnimationFrame(frame);
        if(qs.get("auto")) { /* テスト用：?auto=1 でタイトルを自動で進める */ }
    }catch(err){ console.error(err); $("fail").hidden = false; $("title").hidden = true; $("failMsg").textContent = String(err && err.message || err); window.__bootDone = true; }
}

// ---------- テスト用API（本番のコードをそのまま通す）----------
window.__q2 = {
    ctx, warpMap: (...a) => warpMap(...a), fight: (...a) => fight(...a), cheatCtx, rescue, codeBox, applyFx, get state(){ return state; }, get S(){ return ctx.S; }, get story(){ return story; }, get npcs(){ return npcs; }, get world(){ return world; }, P: () => P,
    fast(on){ UI.fast = !!on; }, bosses: () => bossSpots, challengeBoss, setAutoBattle(v){ ctx.autoBattle = !!v; }, zoneAt: (x, z) => world && world.dangerAt ? world.dangerAt(x, z) : null, press: (n) => Input.press(n), startNew, showTitle, continueGame, autosave, Save, UI,
    async begin(name, chapter){ $("nameIn").value = name || "主人公"; await startNew(chapter); },
    fps: () => ({fps, scale, w: ctx.R.w, h: ctx.R.h, ema}),
    teleport(x, z){ const fs = world.freeSpot(x, z); P.x = fs[0]; P.z = fs[1]; },
    async idle(ms){ await new Promise((r) => setTimeout(r, ms)); },
    async waitState(s, ms){ const t0 = performance.now(); while(state !== s && performance.now() - t0 < (ms || 20000)) await new Promise((r) => setTimeout(r, 20)); return state === s; },
    // いまの話の「次にやること」の人へ行って話しかける（全話通しテスト用）
    async doStep(){
        const d = story.def; const n0 = ctx.S.chapter;
        for(const nd of d.npcs){
            const act = story.hasMark(nd); if(!act) continue;
            if(ctx.S.map !== nd.map) await warpMap(nd.map);
            const o = npcs.find((x) => x.id === nd.id); if(!o) return "npc-missing:" + nd.id;
            this.teleport(nd.at[0] + .3, nd.at[1] + 1.5); await talkTo(o); return ctx.S.chapter !== n0 ? "advanced" : "talked";
        }
        return "nothing";
    },
    async grind(k){ // 原っぱでランダム遭遇を k 回（高速）
        if(ctx.S.map !== "field") await warpMap("field");
        const enc = (story.def.enc) || mapDef.enc; for(let i = 0; i < k; i++){ const n = 1 + Math.floor(rnd() * 3); const f = []; for(let j = 0; j < n; j++) f.push(enc.table[Math.floor(rnd() * enc.table.length)]); const r = await fight(f, {}); if(r === "lose") return "lose"; }
        return "ok";
    },
    async playAll({maxGrind} = {}){
        const rep = []; UI.fast = true; let guard = 0;
        while(!ctx.S.cleared && guard++ < 400){
            const n = ctx.S.chapter; let r = await this.doStep(); let tries = 0;
            while(r === "talked" && ctx.S.chapter === n && story.hasAnyMark() && tries < (maxGrind || 8)){ const lv0 = ctx.S.party[0].lv; await this.grind(6); tries++; healAll(); r = await this.doStep(); }
            if(r === "nothing" || (r !== "advanced" && ctx.S.chapter === n && !story.hasAnyMark())){ if(ctx.S.chapter === n && !ctx.S.cleared){ rep.push({n, r, stuck: true}); break; } }
            rep.push({n, r, lv: ctx.S.party[0].lv, gold: ctx.S.gold, party: ctx.S.party.length, tries});
        }
        UI.fast = false; return rep;
    }
};
Story.prototype.hasAnyMark = function(){ return this.def && this.def.npcs.some((n) => this.hasMark(n)); };
boot();
