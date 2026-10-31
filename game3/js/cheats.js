"use strict";
// ===== ひみつの コード（チート）と ふくざいりょう =====
//  タイトル・せっていメニューから「ひみつのコード」を ひらき、コードを にゅうりょく。 ↑↑↓↓←→←→BA でも ひらく。
//  ここは ほかの ファイルに 依存しない（せんとうなどから 読まれる）。
const KEY = "areq3_cheat";
export const Cheats = {flags: {}, ctx: null};
const load = () => { try{ Cheats.flags = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(_e){ Cheats.flags = {}; } };
const save = () => { try{ localStorage.setItem(KEY, JSON.stringify(Cheats.flags)); }catch(_e){} };
load();
export const FX = ["retro", "sepia", "noir", "neon", "mirror", "dream", "blood"];
export function applyFx(){ for(const f of FX) document.body.classList.toggle("fx-" + f, !!Cheats.flags["fx_" + f]); document.body.classList.toggle("fx-rainbow", !!Cheats.flags.rainbow); }
const toggle = (k, label) => { Cheats.flags[k] = !Cheats.flags[k]; save(); applyFx(); return label + "：" + (Cheats.flags[k] ? "ON" : "OFF"); };
const fxOnly = (name, label) => { const was = !!Cheats.flags["fx_" + name]; for(const f of FX) Cheats.flags["fx_" + f] = false; Cheats.flags["fx_" + name] = !was; save(); applyFx(); return label + "：" + (!was ? "ON" : "OFF"); };

// コード表（ぜんぶ 大文字・スペースなし。「CH:12」のように 引数つきも ある）
export const CODES = {
 "GOLD9999": {d: "ゴールド +9999", f: (c) => { c.S.gold += 9999; c.story.hud && c.story.hud(); return "9999G ふえた！"; }},
 "COIN9999": {d: "カジノコイン +9999", f: (c) => { c.S.coins = (c.S.coins || 0) + 9999; return "コインが 9999まい ふえた！"; }},
 "KINGOFNIGHT": {d: "カジノコイン +100000", f: (c) => { c.S.coins = (c.S.coins || 0) + 100000; return "コイン 100000まい！ 夜の王だ。"; }},
 "LEVELUP": {d: "全員 5レベルアップ", f: (c) => { let n = 0; for(const m of c.S.party){ for(let i = 0; i < 5; i++){ const u = c.gainExp(m, c.data.members, Math.max(1, c.expNeed(m.lv) - m.exp)); n += u.length; } } c.story.hud && c.story.hud(); return "みんなが つよくなった！"; }},
 "FULLHEAL": {d: "全員 HP/MP 全回復", f: (c) => { for(const m of c.S.party){ const st = c.statsOf(m, c.data.members); m.hp = st.maxhp; m.mp = st.maxmp; } return "みんな げんきに なった！"; }},
 "ALLITEMS": {d: "どうぐを 各5こ", f: (c) => { for(const k of Object.keys(c.data.items)){ if(c.data.items[k].kind !== "equip") c.S.inv[k] = (c.S.inv[k] || 0) + 5; } return "どうぐが ぜんぶ とどいた！"; }},
 "ALLGEAR": {d: "そうび 全部", f: (c) => { c.S.equip = c.S.equip || {}; for(const k of Object.keys(c.data.items)){ if(c.data.items[k].kind === "equip") c.S.equip[k] = 1; } c.setEquip(c.S); return "ぜんぶの そうびを てにいれた！"; }},
 "GODMODE": {d: "ぶじゃく（ダメージ0）切替", f: () => toggle("god", "むてきモード")},
 "ONEHIT": {d: "ワンパン（てきを1撃）切替", f: () => toggle("onehit", "いちげきモード")},
 "NOENCOUNT": {d: "エンカウント なし 切替", f: () => toggle("noenc", "てきに であわない")},
 "SPEEDUP": {d: "移動 2ばい 切替", f: () => toggle("fast", "ダッシュ ブースト")},
 "MEGASPEED": {d: "移動 4ばい 切替", f: () => toggle("mega", "ちょうそく")},
 "RICHLUCK": {d: "戦闘の ゴールド 2ばい 切替", f: () => toggle("rich", "ゴールド2ばい")},
 "EXPBOOST": {d: "戦闘の けいけんち 3ばい 切替", f: () => toggle("exp3", "けいけんち3ばい")},
 "RETRO": {d: "古い ブラウン管ふうの がめん", f: () => fxOnly("retro", "レトロ画面")},
 "SEPIA": {d: "セピア色の がめん", f: () => fxOnly("sepia", "セピア")},
 "NOIR": {d: "白黒の がめん", f: () => fxOnly("noir", "モノクロ")},
 "NEON": {d: "ネオンのように あざやか", f: () => fxOnly("neon", "ネオン")},
 "MIRROR": {d: "がめんを 左右ぎゃくに", f: () => fxOnly("mirror", "鏡の世界")},
 "DREAM": {d: "ゆめのような ぼかし", f: () => fxOnly("dream", "夢の中")},
 "BLOODMOON": {d: "赤い月の いろあい", f: () => fxOnly("blood", "赤い月")},
 "RAINBOW": {d: "がめんの 色が にじ色に かわる", f: () => toggle("rainbow", "にじ色")},
 "STARRAIN": {d: "星が ふりそそぐ（演出）", f: () => { starRain(); return "星が ふってきた！"; }},
 "PHOTO": {d: "しゃしんモード（Pキーで HUDを かくす）", f: () => toggle("photo", "しゃしんモード（Pキー）")},
 "FPS": {d: "フレームレートを ひょうじ", f: () => { const u = new URL(location.href); const on = !Cheats.flags.fps; Cheats.flags.fps = on; save(); let e = document.getElementById("hudDbg"); if(e) e.style.display = on ? "block" : "none"; return "FPS表示：" + (on ? "ON" : "OFF"); }},
 "TIMEATTACK": {d: "プレイ時間を 画面に ひょうじ", f: () => toggle("clock", "タイムアタック表示")},
 "SLOWMO": {d: "動きを ゆっくりに（演出）", f: () => toggle("slow", "スローモーション")},
 "BOSSRUSH": {d: "つよい てきと すぐ せんとう", f: (c) => { if(!c.startBossRush) return "いまは つかえない"; setTimeout(() => c.startBossRush(), 50); return "ボスラッシュ かいし！（メニューを とじてね）"; }},
 "ZOO": {d: "モンスターを 10ひき ぼくじょうへ", f: (c) => { let n = 0; const ids = Object.keys(c.data.mons).filter((k) => c.data.mons[k].scout); for(let i = 0; i < 10; i++){ const id = ids[Math.floor(c.rnd() * ids.length)]; const r = c.ranch.add(id, 5, "cheat"); if(r.ok) n++; } return n + "ひき あずけた！（ぼくじょうを ひらこう）"; }},
 "JOBMASTER": {d: "ぜんしょくぎょう かいほう", f: (c) => { c.S.flags.jobsAll = 1; for(const m of c.S.party) m.jobsAll = 1; return "しょくぎょうが ぜんぶ えらべる"; }},
 "SAVEME": {d: "いますぐ オートセーブ", f: (c) => { c.autosave(); return "セーブしました"; }},
 "RESCUE": {d: "うごかなく なった とき（強制もどし）", f: (c) => { c.rescue && c.rescue("コード"); return "もとに もどした"; }},
 "MP3BGM": {d: "おんがくを きろくの音源(mp3)に", f: (c) => { c.A.setMode("mp3"); return "mp3の BGMに きりかえ"; }},
 "SYNTHBGM": {d: "おんがくを あたらしい合成エンジンに", f: (c) => { c.A.setMode("synth"); return "合成エンジンの BGMに きりかえ"; }},
 "RESETFX": {d: "がめんの ようす を もとに", f: () => { for(const f of FX) Cheats.flags["fx_" + f] = false; Cheats.flags.rainbow = false; save(); applyFx(); return "もとに もどした"; }},
 "ALLOFF": {d: "チートを ぜんぶ OFF", f: () => { Cheats.flags = {}; save(); applyFx(); return "ぜんぶ OFFに した"; }},
};
// 引数つき: CH:12（その話から）/ GOLD:500 / LV:30
export function run(raw, c){
    const code = String(raw || "").toUpperCase().replace(/[\s　]/g, "");
    if(!code) return "コードを いれてね";
    if(!c.S && !/^(RESETFX|ALLOFF|RETRO|SEPIA|NOIR|NEON|MIRROR|DREAM|BLOODMOON|RAINBOW|STARRAIN|FPS|MP3BGM|SYNTHBGM)$/.test(code)) return "ゲームを はじめてから つかってね";
    if(CODES[code]){ try{ return CODES[code].f(c) || "OK"; }catch(err){ console.error(err); return "うまく かからなかった…（" + code + "）"; } }
    let m = /^CH[:：](\d+)$/.exec(code);
    if(m){ const n = +m[1]; const ok = c.jumpChapter && c.jumpChapter(n); return ok ? n + "話に とんだ！" : "そんな 話は ない"; }
    m = /^GOLD[:：](\d+)$/.exec(code); if(m){ c.S.gold += Math.min(9999999, +m[1]); return m[1] + "G ふえた"; }
    m = /^LV[:：](\d+)$/.exec(code);
    if(m){ const to = Math.min(99, +m[1]); for(const x of c.S.party){ let g = 0; while(x.lv < to && g++ < 120) c.gainExp(x, c.data.members, Math.max(1, c.expNeed(x.lv) - x.exp)); } c.story.hud && c.story.hud(); return "レベル " + to + " まで あげた"; }
    return "そんな コードは ない…";
}
export function helpText(){ return Object.entries(CODES).map(([k, v]) => k + "：" + v.d).concat(["CH:話数：その話に とぶ", "LV:数：全員を そのレベルに", "GOLD:数：ゴールド追加", "↑↑↓↓←→←→BA：コード入力を ひらく"]).join("\n"); }

// ---- 星の雨（Canvasで 3びょう） ----
export function starRain(){
    const cv = document.createElement("canvas"); cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60"; cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
    const g = cv.getContext("2d"), P = Array.from({length: 90}, () => ({x: Math.random() * cv.width, y: -Math.random() * cv.height, v: 120 + Math.random() * 260, s: 3 + Math.random() * 7, h: Math.random() * 360}));
    let t0 = performance.now();
    const f = (t) => { const e = (t - t0) / 1000; if(e > 3.2){ cv.remove(); return; } g.clearRect(0, 0, cv.width, cv.height); for(const p of P){ p.y += p.v * .016; g.fillStyle = "hsl(" + p.h + ",90%,70%)"; g.beginPath(); for(let i = 0; i < 5; i++){ const a = i * 1.2566 - 1.57, b = a + .6283; g.lineTo(p.x + Math.cos(a) * p.s, p.y + Math.sin(a) * p.s); g.lineTo(p.x + Math.cos(b) * p.s * .45, p.y + Math.sin(b) * p.s * .45); } g.closePath(); g.fill(); } requestAnimationFrame(f); };
    requestAnimationFrame(f);
}
// ---- コード入力の オーバーレイ ----
export function openCodeBox(c){
    return new Promise((resolve) => {
        if(document.getElementById("codeBox")){ resolve(); return; }
        const r = document.createElement("div"); r.id = "codeBox"; r.style.cssText = "position:fixed;inset:0;z-index:120;background:rgba(6,4,16,.92);display:flex;align-items:center;justify-content:center;color:#fff;font-family:inherit";
        r.innerHTML = '<div style="width:min(92vw,520px);max-height:90vh;overflow:auto;background:#17122e;border:2px solid #fff;border-radius:14px;padding:14px"><div style="font-weight:bold;font-size:18px;margin-bottom:8px">🗝️ ひみつのコード</div><div style="display:flex;gap:6px"><input id="codeIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="コードを にゅうりょく" style="flex:1;font-size:18px;padding:8px;border-radius:8px;border:2px solid #ffd24a;background:#0c0a1c;color:#fff"><button id="codeGo" style="font-size:16px;padding:8px 14px;border-radius:8px;background:#ffd24a;border:0;font-weight:bold">OK</button></div><div id="codeMsg" style="min-height:1.6em;margin:8px 0;color:#ffe9a8"></div><details><summary style="cursor:pointer">コードの いちらん</summary><pre id="codeList" style="white-space:pre-wrap;font-size:12px;line-height:1.5;color:#cfe"></pre></details><div style="text-align:right;margin-top:8px"><button id="codeX" style="font-size:15px;padding:6px 14px;border-radius:8px;border:2px solid #fff;background:#432;color:#fff">とじる</button></div></div>';
        document.body.appendChild(r);
        const inp = r.querySelector("#codeIn"), msg = r.querySelector("#codeMsg"); r.querySelector("#codeList").textContent = helpText();
        const close = () => { r.remove(); window.removeEventListener("keydown", kd, true); resolve(); };
        const go = () => { msg.textContent = run(inp.value, c); inp.value = ""; try{ c.A.se("ok"); }catch(_e){} };
        const kd = (e) => { e.stopPropagation(); if(e.key === "Escape"){ e.preventDefault(); close(); } else if(e.key === "Enter"){ e.preventDefault(); go(); } };
        window.addEventListener("keydown", kd, true);
        r.querySelector("#codeGo").addEventListener("click", go); r.querySelector("#codeX").addEventListener("click", close);
        setTimeout(() => inp.focus(), 50);
    });
}
// ---- ↑↑↓↓←→←→BA ----
const SEQ = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
export function watchKonami(cb){ let i = 0; window.addEventListener("keydown", (e) => { if(e.code === SEQ[i]){ i++; if(i === SEQ.length){ i = 0; cb(); } } else i = e.code === SEQ[0] ? 1 : 0; }); }
