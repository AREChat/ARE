"use strict";
// ===== やりすぎヒーロー伝説＆ドリームストーリー：ゲートの 行き先・称号・もくてき =====
(function(){
    const L = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99, 99, 99, 99, 99, 99, 99, 99, 99];
    const T = ["ちいさな ヒーローの はじまり", "ふしぎな しょうがっこう じけん", "ぞうの なぞと おうちの あかり", "なまえ どろぼうと おぼえる ひみつ", "ビリから トップへ！ 勉強の まほう",
        "とどいた ちょうせんじょう", "氷の上の ヒロイン", "ボタンを もった 竜也", "せいとかい だいさくせん！", "試験の日は ちこく しそう！",
        "マジック たいけつ！", "ゆめの きょういくじっしゅう", "さらわれた 桃寧！", "ほんとうの やさしさ", "ロボット紘 だいさくせん！",
        "遊園地の かなしみ", "あんごうの とびら", "ひこうきと なぞとき研究部", "タオルの なぞと ドッキリ大作戦", "ありがとう ぜんぶの 物語"];
    for(let i = 1; i <= 20; i++){
        RPG_ERAS.push({id:"yh" + i, n:"追加：やりすぎヒーロー伝説 第" + i + "話 " + T[i - 1] + "〔推奨Lv" + L[i - 1] + "〕", map:"yh" + i, pos:[9, 10], done:"e_yh" + i, req: i === 1 ? "e_future" : "e_yh" + (i - 1)});
    }
    const xe = RPG_ERAS.find((e) => e.id === "xr"); if(xe){ RPG_ERAS.splice(RPG_ERAS.indexOf(xe), 1); RPG_ERAS.push(xe); }
    const F = (k) => () => !!G.S.f[k];
    for(let i = 1; i <= 20; i++){
        const t = {id:"t_yh" + i, n:"ヒーロー第" + i + "話", d:"やりすぎヒーロー伝説 第" + i + "話を クリア", f:F("e_yh" + i), g:500 + i * 100}; TQ_TITLES.push(t); TQ_TITLE_BY[t.id] = t;
    }
    const all = {id:"t_yh_all", n:"やりすぎヒーロー伝説 かんけつ！", d:"やりすぎヒーロー伝説＆ドリームストーリーを 20話ぜんぶ クリア", f:F("e_yh20"), g:10000}; TQ_TITLES.push(all); TQ_TITLE_BY[all.id] = all;
    const gen = {id:"t_genius", n:"天才への みち", d:"15の 職業を ぜんぶ きわめた", f:() => { const j = tqJ(); return !!j && TQ_JOBS.filter((d) => !d.genius).every((d) => j.mast.includes(d.id)); }, g:5000}; TQ_TITLES.push(gen); TQ_TITLE_BY[gen.id] = gen;
    const _obj = tqObjective;
    window.tqObjective = function(){
        const f = G.S.f;
        if(f.e_ks5 || f.yh_started){
            for(let i = 1; i <= 20; i++) if(!f["e_yh" + i]) return "追加：やりすぎヒーロー伝説 第" + i + "話『" + T[i - 1] + "』へ（ゲート）〔推奨Lv" + L[i - 1] + "〕　※むずかしさは ぜんぶ『ひじょうに むずかしい』で こてい";
        }
        return _obj();
    };
    // 話者の かおを じどうで そろえる
    Object.keys(RPG_EV).filter((k) => /^yh/.test(k)).forEach((k) => {
        const walk = (a) => { if(!Array.isArray(a)) return; if(a[0] === "say" && typeof a[1] === "string" && a[1] && !TQ_PORTRAIT_LOOK[a[1]]) yPortrait(a[1]); a.forEach(walk); };
        walk(RPG_EV[k]);
    });
})();
