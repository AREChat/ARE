// ===== ドリーム・フロンティア：起動 =====
//  描画エンジンの きめかた：  Three.js（vendor/three に 公式ファイルが あれば）→ だめなら 自作 WebGL2（外部ライブラリなし）
//  ?engine=gl2 で WebGL2 版を 強制 ／ ?engine=three で Three.js 版を 強制（失敗したら 理由を 表示）
import {DF} from "./config.js";
import {buildWorld} from "./df-world.js";
import {Game} from "./df-game.js";
import {UI} from "./ui.js";
import {Controls} from "./controls.js";
import {Snd} from "./audio.js";
import {ATTRACTIONS} from "./df-data.js";

const $ = (id) => document.getElementById(id);
const info = window.__dfInfo = {backend: null, threeStatus: "未確認", tried: []};
const setLoad = (t) => { const e = $("loadMsg"); if(e) e.textContent = t; };
const params = new URLSearchParams(location.search);
if(window.__dfTouch || ("ontouchstart" in window) || navigator.maxTouchPoints > 0) document.body.classList.add("touch");

function freshCanvas(){ const old = $("view"), c = old.cloneNode(false); old.replaceWith(c); return c; }
async function pickBackend(world){
    const want = params.get("engine") || "auto"; let B = null;
    if(want !== "gl2"){
        setLoad("Three.js を さがしています…");
        try{
            const eng = await import("./engine.js"); info.tried = eng.source.tried; info.threeStatus = "読みこみ OK（r" + eng.source.revision + "）— ただし 動作確認は 実機でのみ";
            const m = await import("./backend-three.js"); B = await m.create($("view"), {}); B.setScene({layers: world.layers, models: world.models});
            info.backend = "Three.js r" + eng.source.revision;
        }catch(e){
            info.tried = (e && e.tried) || info.tried; info.threeStatus = "使えませんでした → WebGL2 版に きりかえ：" + ((e && e.message) || e); console.warn("[DF] Three.js 版を 使えません:", e);
            try{ const bad = $("view"); const gl = bad.getContext && null; }catch(_e){}
            B = null; freshCanvas();
        }
        if(!B && want === "three"){ throw new Error("Three.js 版を 強制しましたが 使えません：" + info.threeStatus); }
    } else info.threeStatus = "?engine=gl2 で WebGL2 版を 指定";
    if(!B){ setLoad("WebGL2 版で じゅんび中…"); const m = await import("./backend-gl2.js"); B = await m.create($("view"), {}); B.setScene({layers: world.layers, models: world.models}); info.backend = "WebGL2（自作・外部ライブラリなし）"; }
    return B;
}

async function main(){
    const world = buildWorld(); const ui = new UI(); ui.bind(); Snd.init(); const B = await pickBackend(world);
    const controls = new Controls($("view"), document.body);
    const q = {levels: [["ひくい", .55], ["ふつう", .8], ["たかい", 1]], i: params.get("q") ? +params.get("q") : (matchMedia("(pointer:coarse)").matches ? 0 : 2)};
    const resize = () => { const dpr = Math.max(1, window.devicePixelRatio || 1), qualityScale = q.levels[q.i][1]; B.resize(Math.floor(innerWidth), Math.floor(innerHeight), qualityScale * (B.name === "webgl2" ? Math.min(dpr, 2) : 1)); };
    addEventListener("resize", resize); resize();
    const inEmbed = window.parent !== window;
    const game = new Game(world, ui, {emit: (ev, d) => { if(inEmbed){ try{ parent.postMessage({source: "dream-frontier", ev, data: d}, "*"); }catch(e){} } }, sfx: (n) => Snd.sfx(n), zone: () => Snd.setBgm(game.bgmKey())});
    $("engineTag").textContent = "描画: " + info.backend + "　v" + DF.version;
    window.__df = {game, B, ui, controls, info, world, att: ATTRACTIONS};
    const menuCb = {stamps: () => ui.showStamps(game), help: () => ui.help(), snd: () => { Snd.setOn(!Snd.isOn()); ui.toast("おと：" + (Snd.isOn() ? "ON" : "OFF")); }, sndOn: () => Snd.isOn(), bgmVolume: () => Snd.getVol(), seVolume: () => Snd.getSeVol(), setBgmVolume: (v) => Snd.setVol(v), setSeVolume: (v) => Snd.setSeVol(v), q: () => { q.i = (q.i + 1) % 3; resize(); ui.toast("がしつ：" + q.levels[q.i][0]); }, quality: () => q.levels[q.i][0], diag: () => window.__showDiag && window.__showDiag(), save: () => { game.save(); ui.toast("セーブしました"); }, reset: () => { if(confirm("ほんとうに はじめから やりなおしますか？")){ game.reset(); location.reload(); } }, engine: () => info.backend, back: inEmbed ? () => parent.postMessage({source: "dream-frontier", ev: "exit"}, "*") : null};
    let last = performance.now(), started = false, acc = 0;
    function frame(now){
        requestAnimationFrame(frame); const dt = Math.min(.1, (now - last) / 1000); last = now; if(!started) { B.frame({eye: [0, 12, 40], yaw: Math.PI + Math.sin(now / 6000) * .5, pitch: -.12, fov: 65}, game.env(), game.dyn(now / 1000), now / 1000); return; }
        let inp = controls.read(); controls.wantClickAct = game.mode === "ride" && game.ride && game.ride.a.kind === "shoot";
        if(ui.modal){ if(inp.esc || inp.act2) ui.close(); inp = {mx: 0, my: 0, lx: 0, ly: 0}; }
        else if(ui.dlg){ if(inp.act || inp.act2) ui.advance(); inp = {mx: 0, my: 0, lx: 0, ly: 0}; }
        else if(game.mode === "walk" && inp.esc){ ui.menu(game, menuCb); inp = {mx: 0, my: 0, lx: 0, ly: 0}; }
        game.update(dt, inp); ui.hud(game);
        B.frame(game.camera(), game.env(), game.dyn(game.t), game.t);
        acc += dt; if(acc > 1){ acc = 0; window.__dfFps = Math.round(1 / Math.max(dt, .001)); }
    }
    requestAnimationFrame(frame);
    const btn = $("startBtn"); btn.style.display = "inline-block"; setLoad(game.count() ? "つづきから あそべます（" + game.count() + "/" + ATTRACTIONS.length + "）" : "じゅんび かんりょう！"); $("loadEngine").textContent = "えんじん：" + info.backend + (info.backend.indexOf("WebGL2") === 0 && info.threeStatus.indexOf("使えません") >= 0 ? "（Three.js は 使えなかったので 代わりに 自作 WebGL2 で うごいています）" : "");
    const go = () => { if(started) return; started = true; Snd.resume(); Snd.startBgm(); Snd.setBgm(game.bgmKey()); $("loading").classList.add("off"); window.__dfStarted = true; last = performance.now(); document.querySelector(".pill") && 0; if(!game.sv.played && !game.count()) ui.say("ナビ", ["ようこそ、ドリーム・フロンティアへ！", "パークには " + ATTRACTIONS.length + "この アトラクションが あるよ。ぜんぶ のって スタンプを あつめよう！", "ふわふわ ういている ほしが つぎの もくてきちへ あんないするよ。まずは 広場の みんなに はなしかけてみよう。"]); game.zone = null; };
    btn.onclick = go; addEventListener("keydown", (e) => { if(!started && (e.code === "Enter" || e.code === "Space")) go(); });
    if(params.get("auto") === "1") go();
    window.__dfBoot = "ready";
}
main().catch((e) => { console.error(e); window.__bootErrors && window.__bootErrors.push("起動エラー: " + (e && e.message)); setLoad("起動に しっぱいしました：" + ((e && e.message) || e)); const l = $("loadEngine"); if(l) l.textContent = "→ 画面の 「しんだん」ボタンで げんいんを しらべられます"; const b = $("diagBtn"); if(b) b.style.display = "inline-block"; setTimeout(() => window.__showDiag && window.__showDiag(), 400); });
