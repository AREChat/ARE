"use strict";
// ===== レベル上げ・ゴールド稼ぎが しやすい モンスター =====
// 地図2(アカリ市)クリア後：「ラッキーノイズ」が ときどき でる（かんたんに たおせて、けいけんちが おおい）
// 地図4(まっしろルーム)クリア後：「ごほうびノイズ」（けいけんち 大）と「こがねノイズ」（ゴールド 大）も でる
// ※ ボス戦や ストーリーの 戦闘には でません（ふつうの 草むらなどの 戦闘だけ）。強さは いまの レベルに あわせて 毎回つくります。
(function(){
    function mk(id, n, e, lv, expRate, gRate, gBase){
        const need = rpgNeed(Math.min(98, lv));
        RPG_FOES[id] = rpgE(n, e, Math.round(14 + lv * 5), Math.max(2, Math.round(2 + lv * 0.7)), 0,
            Math.max(3, Math.round(need * expRate)), Math.round(gBase + lv * gRate),
            [["ころころ たいあたり", 0, 1, 0.7], ["きらきら ひかる", 1, 0.3, 0.2]], {lucky:true});
    }
    function pickLucky(){
        const S = G.S; if(!S || !window.pkStage) return null;
        const st = pkStage(); if(st < 2 || S.lv >= TQ_MAX_LV) return null;
        const r = G.rnd(), lv = S.lv;
        if(st >= 4){
            if(r < 0.06){ mk("lk_gold", "こがねノイズ", "🪙", lv, 0.12, 250, 300); return "lk_gold"; }
            if(r < 0.14){ mk("lk_super", "ごほうびノイズ", "🌟", lv, 0.9, 120, 300); return "lk_super"; }
        }
        if(r < (st >= 4 ? 0.26 : 0.12)){ mk("lk_lucky", "ラッキーノイズ", "🍀", lv, 0.3, 40, 60); return "lk_lucky"; }
        return null;
    }
    const _enc = encounter;
    encounter = function(){
        let id = null; try{ id = pickLucky(); }catch(e){ console.error("[lucky]", e); }
        if(!id) return _enc.apply(this, arguments);
        const n = G.rnd() < 0.3 ? 2 : 1;
        battleStart(Array(n).fill(id), null);
    };
})();
