"use strict";
// ===== BGM（音楽）：場所・戦闘ごとに 10曲。ずっと ループ再生 =====
// 音楽ファイルは game/bgm/ に、下の名前の mp3 を置いてください（まだ無い曲は、無音のまま進みます）。
// 一覧は game/bgm/BGMリスト.txt にも書いてあります。
const TQ_BGM = {
    opening:     {file:"opening.mp3",     n:"オープニング（タイトル画面・プロフィールなど）"},
    ending:      {file:"ending.mp3",      n:"エンディング（スタッフクレジットが曲に合わせて流れます。1回だけ）"},
    save:        {file:"save.mp3",        n:"セーブ音（冒険の書に記録したとき。1回だけ）", se:true},
    field:       {file:"field.mp3",       n:"フィールド（野や道・おまけの体験会）"},
    town:        {file:"town.mp3",        n:"街（ホシミ台・アカリ市・ラボ・クリスマス）"},
    sea:         {file:"sea.mp3",         n:"海（第2層 ノイズの海ぞこ）"},
    cave:        {file:"cave.mp3",        n:"洞窟・研究室（ちいさな研究室・秘密基地）"},
    castle:      {file:"castle.mp3",      n:"城・塔（運命開発ビル・まっしろルーム・ARE タワー・サーバー城）"},
    demoncastle: {file:"demoncastle.mp3", n:"魔王城（第4層 ノイズ王国）"},
    mainbattle:  {file:"mainbattle.mp3",  n:"通常戦闘曲"},
    midboss:     {file:"midboss.mp3",     n:"中ボス戦闘曲（ふつうのボス）"},
    lastboss:    {file:"lastboss.mp3",    n:"ラスボス戦闘曲（ぬいぐるみ王・ノイズ・オメガ）"},
    secretboss:  {file:"secretboss.mp3",  n:"裏ボス戦闘曲（おまけの悪魔）"}
};
// 地図 → 曲（地図の名前は data / maps の キー）
const TQ_BGM_MAP = {lab:"town", sendai:"town", tokyo:"town", aprt:"town", xmas:"town", tower:"castle", white:"castle", future:"castle", n10:"castle",
    labn:"cave", base:"cave", n8:"field", n9:"sea", n11:"demoncastle", xr:"field", ep10:"field", ep11:"town", ep11b:"town", ep12:"castle", ep01:"field", ks1:"field", ks2:"town", ks3:"castle", ks4:"town", ks5:"field"};
const TQ_BGM_LAST = ["teddy", "king", "omega"], TQ_BGM_SECRET = ["s_akuma"];

const tqBgm = {cur:"", audios:{}, bad:{}, want:""};
function tqBgmWant(){
    if(G.mode === "end") return "ending";
    const fromMenu = (G.mode === "help" && G.helpFrom === "menu") || (G.mode === "settings" && G.setFrom === "menu") || (G.mode === "cheat" && G.cheatFrom === "menu") || (G.mode === "slots" && G.slotFrom === "menu");
    if(!G.S || (!fromMenu && ["title", "slots", "profile", "persona", "result", "help", "settings", "cheat"].includes(G.mode))) return "opening";
    if(G.mode === "battle" && G.b){
        const ids = G.b.foes.map((f) => f.id);
        if(ids.some((i) => TQ_BGM_SECRET.includes(i))) return "secretboss";
        if(ids.some((i) => TQ_BGM_LAST.includes(i))) return "lastboss";
        if(G.b.boss) return "midboss";
        return "mainbattle";
    }
    return TQ_BGM_MAP[G.S.map] || "field";
}
function tqBgmAudio(key){
    if(tqBgm.bad[key]){
        // 通信が とぎれて 読めなかった曲は、20秒 あとに もう一度 ためす（ずっと 無音に ならない）
        if(Date.now() - tqBgm.bad[key] < 20000) return null;
        delete tqBgm.bad[key]; delete tqBgm.audios[key];
    }
    let a = tqBgm.audios[key];
    if(!a){
        a = new Audio("./bgm/" + TQ_BGM[key].file); a.loop = key !== "ending"; a.preload = "auto";
        a.addEventListener("error", () => { tqBgm.bad[key] = Date.now(); });
        tqBgm.audios[key] = a;
    }
    return a;
}
function tqBgmVol(){ return Math.max(0, Math.min(1, [0.25, 0.5, 0.8][G.set.bgmVol == null ? 1 : G.set.bgmVol] || 0.5)); }
function tqBgmStop(){ Object.keys(tqBgm.audios).forEach((k) => { try{ tqBgm.audios[k].pause(); }catch(_e){} }); tqBgm.cur = ""; }
function tqBgmSync(){
    try{
        if(G.moviePlaying || G.pkQuiet){ if(tqBgm.cur) tqBgmStop(); return; }
        if(G.set.bgm === false || document.hidden){ if(tqBgm.cur) tqBgmStop(); return; }
        const key = tqBgmWant();
        if(key !== tqBgm.cur){
            Object.keys(tqBgm.audios).forEach((k) => { if(k !== key){ try{ tqBgm.audios[k].pause(); }catch(_e){} } });
            tqBgm.cur = key;
            if(key === "ending"){ const e = tqBgmAudio(key); if(e){ try{ e.currentTime = 0; }catch(_x){} } }
        }
        if(key === "ending" && tqBgm.audios.ending && tqBgm.audios.ending.ended) return;   // 曲が おわったら しずかに
        const a = tqBgmAudio(key); if(!a) return;
        a.volume = tqBgmVol();
        if(a.paused){ const p = a.play(); if(p && p.catch) p.catch(() => {}); }   // 画面を さわる まで 鳴らないブラウザでは、あとで もういちど ためす
    }catch(_e){ /* 音が 出せなくても ゲームは つづける */ }
}
setInterval(tqBgmSync, 500);
["pointerdown", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, tqBgmSync, {passive:true}));
document.addEventListener("visibilitychange", tqBgmSync);

// 効果音（1回だけ）：セーブ音など。BGMは止めません
function tqSePlay(key){
    try{
        if(G.set.bgm === false || !TQ_BGM[key] || tqBgm.bad["se_" + key]) return;
        // いまの 効果音が あれば 止める（かさなって 鳴らない）
        if(tqBgm.se){ try{ tqBgm.se.pause(); }catch(_e){} clearTimeout(tqBgm.seT); tqBgm.se = null; }
        const a = new Audio("./bgm/" + TQ_BGM[key].file), vol = Math.min(1, tqBgmVol() + 0.2); a.volume = vol;
        a.addEventListener("error", () => { tqBgm.bad["se_" + key] = 1; });
        tqBgm.se = a;
        const p = a.play(); if(p && p.catch) p.catch(() => {});
        // ファイルが 長くても、5秒で ふわっと きえる
        const SE_MAX = 5000, SE_FADE = 1200, t0 = Date.now();
        const tick = () => {
            if(tqBgm.se !== a) return;
            const left = SE_MAX - (Date.now() - t0);
            if(left <= 0 || a.ended){ try{ a.pause(); }catch(_e){} tqBgm.se = null; return; }
            if(left < SE_FADE){ try{ a.volume = Math.max(0, vol * left / SE_FADE); }catch(_e){} }
            tqBgm.seT = setTimeout(tick, 100);
        };
        tqBgm.seT = setTimeout(tick, 100);
    }catch(_e){ /* 無視 */ }
}
