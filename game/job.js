"use strict";
// ===== 職業（転職）システム =====
// ・15しゅるいの 職業。転職は レベル10から。（主人公が つく）
// ・職業レベル（1〜99）は 戦闘の経験値で そだつ。各職業の さいごの わざは 職業レベル99で おぼえる。
// ・転職すると、その職業で のびた せいちょうの「半分」が ずっと のこる（ほかの職業でも ステータスが たかい！）
// ・おぼえた わざ（呪文・とくぎ）は、職業を かえても つかえる。
// ・マスター（職業レベル99）した 職業の かず、ためした 職業の かずで、さらに ステータス・成長スピードが アップ。
//   → 転職すればするほど 有利。
// ・ぜんぶで 15職 × わざ（4つ×5職 ＋ 3つ×10職）＝ 50しゅるい。ダブりは ありません。

const TQ_JOB_MIN_LV = 10;
const TQ_JOB_ARE_NEED = 3;      // ARE使いは 3つの職業を マスターすると なれる
const TQ_JOBS = [
    {id:"engineer", n:"エンジニア", e:"🛠️", d:"ARE の しくみを しりつくした 技術者。バグを みつけて なおす プロ。", prof:{hp:0.2, mp:0.35, atk:0.2, def:0.25, agi:0.25}, ab:[
        ["デバッグ・スキャン", "特技", 6, "foes", 15, "てき ぜんたいの こうげき・ぼうぎょを さげる", [["debuff"]]],
        ["ホットフィックス", "呪文", 9, "ally", 40, "なかまの HPを 5わり かいふく", [["heal", 0.5]]],
        ["ロールバック", "呪文", 20, "ally", 70, "たおれた なかまを HP6わりで ふっかつ", [["revive", 0.6]]],
        ["フルビルド・ARE", "特技", 30, "foes", 99, "てき ぜんたいに 大ダメージ！ AREゲージも ふえる", [["dmgAll", 2.6], ["gauge", 30]]]]},
    {id:"battle", n:"バトルの達人", e:"⚔️", d:"たたかいを きわめた 達人。ちからと ぼうぎょが ぐんぐん のびる。", prof:{hp:0.25, mp:0.0, atk:0.6, def:0.35, agi:0.25}, ab:[
        ["ばくれつ ラッシュ", "特技", 5, "foe", 15, "3れんぞく こうげき", [["multi", 3, 0.8]]],
        ["せいしん とういつ", "特技", 8, "party", 40, "みんなの こうげき・ぼうぎょ アップ", [["buffAD"]]],
        ["かわし ぎり", "特技", 10, "foe", 70, "かいしん 2.2ばい の いちげき", [["crit", 2.2]]],
        ["ひゃくれつ たつまき", "特技", 32, "foes", 99, "てき ぜんたいを まきこむ 大たつまき", [["dmgAll", 3.0]]]]},
    {id:"chef", n:"料理博士", e:"🍳", d:"おいしい りょうりで みんなを げんきに！ たいりょくが たっぷり。", prof:{hp:0.45, mp:0.2, atk:0.15, def:0.25, agi:0.1}, ab:[
        ["ほかほか スープ", "呪文", 12, "party", 15, "みんなの HPを 2.5わり かいふく", [["healAll", 0.25]]],
        ["スパイス ボンバー", "特技", 10, "foes", 40, "てき ぜんたいに ピリ辛ダメージ", [["dmgAll", 1.4]]],
        ["まんぷく ごちそう", "呪文", 18, "ally", 70, "なかまの HPを ぜんかいふく", [["heal", 1.0]]],
        ["フルコース・サプライズ", "特技", 34, "party", 99, "みんなを 8わり かいふく＋パワーアップ", [["healAll", 0.8], ["buffAD"]]]]},
    {id:"star", n:"星読み", e:"⭐", d:"星の ながれを よむ ふしぎな 人。まほうが とくい。", prof:{hp:0.1, mp:0.6, atk:0.3, def:0.1, agi:0.3}, ab:[
        ["ながれぼし", "呪文", 7, "foe", 15, "ながれぼしを ぶつける", [["dmg", 1.8]]],
        ["ほしの おつげ", "呪文", 9, "party", 40, "こうげき アップ＋AREゲージ", [["buffA"], ["gauge", 20]]],
        ["ほしぞら ゆうえい", "呪文", 18, "foes", 70, "てき ぜんたいを ダメージ＋うごけなく する", [["dmgAll", 1.6], ["stunAll"]]],
        ["しんぱくの ほしふり", "呪文", 36, "foes", 99, "ほしの あめを ふらせる 大まほう", [["dmgAll", 3.2]]]]},
    {id:"plush", n:"ぬいぐるみ使い", e:"🧸", d:"ぬいぐるみの なかまと たたかう ふしぎな 職業。かわいくて つよい。", prof:{hp:0.35, mp:0.25, atk:0.3, def:0.4, agi:0.1}, ab:[
        ["ぬいぐるみ ダイブ", "特技", 5, "foe", 15, "ぬいぐるみで ぽふっと こうげき", [["dmg", 1.7]]],
        ["ふわふわ ガード", "特技", 8, "party", 40, "みんなの ぼうぎょ アップ＋まもりを かためる", [["buffD"], ["guard"]]],
        ["おともだち ぞくぞく", "呪文", 16, "foes", 70, "3ターン ぬいぐるみが こうげき", [["summon", 3, 0.9]]],
        ["ぬいぐるみ軍団 そうしゅつげき", "特技", 30, "foes", 99, "ぜんいん で とっげき！＋3ターン おうえん", [["dmgAll", 2.4], ["summon", 3, 1.0]]]]},
    {id:"music", n:"音楽家", e:"🎵", d:"おんがくで みんなを げんきづける。リズムに のって たたかう。", prof:{hp:0.2, mp:0.35, atk:0.2, def:0.15, agi:0.5}, ab:[
        ["げんきの ふえ", "呪文", 10, "party", 20, "みんなの HPを 3わり かいふく", [["healAll", 0.3]]],
        ["ノリノリ ドラム", "特技", 12, "party", 55, "みんなの こうげき・ぼうぎょ アップ", [["buffAD"]]],
        ["フィナーレ・シンフォニー", "呪文", 34, "foes", 99, "だいえんそうで てきに ダメージ＋みんなを かいふく", [["dmgAll", 2.6], ["healAll", 0.3]]]]},
    {id:"weather", n:"お天気博士", e:"🌤️", d:"あめ・かみなり・ハリケーン。てんきを あやつる はかせ。", prof:{hp:0.1, mp:0.55, atk:0.3, def:0.1, agi:0.3}, ab:[
        ["にわか あめ", "呪文", 6, "foes", 20, "てき ぜんたいに あめを ふらせる", [["dmgAll", 1.1]]],
        ["いなずま ピカッ", "呪文", 14, "foe", 55, "かみなりを ひとりに ドーン", [["dmg", 2.6]]],
        ["ハリケーン・ホリデー", "呪文", 34, "foes", 99, "だいあらし！ ダメージ＋うごけなく する", [["dmgAll", 2.9], ["stunAll"]]]]},
    {id:"detective", n:"名探偵", e:"🔍", d:"なぞを とく めいたんてい。てきの よわてんを みぬく。", prof:{hp:0.15, mp:0.3, atk:0.4, def:0.2, agi:0.45}, ab:[
        ["ちゅうい ぶかい", "特技", 6, "foes", 20, "てきの よわてんを さがして ちからを さげる", [["debuff"]]],
        ["じけんの かぎ", "特技", 12, "foe", 55, "かいしん 2ばい の いちげき", [["crit", 2.0]]],
        ["すいり・かんぺき", "特技", 30, "foe", 99, "なぞを ぜんぶ とく！ ひとりに 超ダメージ", [["dmg", 4.2]]]]},
    {id:"magic", n:"手品師", e:"🎩", d:"ハトが ポン！ ふしぎな マジックで てきを まどわせる。", prof:{hp:0.15, mp:0.4, atk:0.25, def:0.15, agi:0.5}, ab:[
        ["ハトが ポン", "特技", 5, "foes", 20, "ハトで てきを びっくり！ うごけなく する", [["stunAll"]]],
        ["ぶんしん ショー", "特技", 12, "foe", 55, "4れんぞく こうげき", [["multi", 4, 0.7]]],
        ["ふしぎな マジック", "呪文", 32, "foes", 99, "ダメージ＋みんなの HPを かいふく", [["dmgAll", 2.5], ["healAll", 0.4]]]]},
    {id:"inventor", n:"発明家", e:"💡", d:"へんな どうぐを つぎつぎ はつめい。ひらめきが ちから。", prof:{hp:0.2, mp:0.4, atk:0.3, def:0.2, agi:0.25}, ab:[
        ["ビリビリ ボール", "特技", 7, "foe", 20, "でんきの ボールを ぶつける", [["dmg", 2.0]]],
        ["じどう はんとうき", "特技", 13, "ally", 55, "なかまの HPを 6わり かいふく", [["heal", 0.6]]],
        ["ロボ・アーミー", "特技", 32, "foes", 99, "ロボが 4ターン こうげき＋てき ぜんたいに ダメージ", [["dmgAll", 1.5], ["summon", 4, 1.0]]]]},
    {id:"dream", n:"夢見人", e:"🌙", d:"ゆめの せかいを あんない。ねむりで てきを とめる。", prof:{hp:0.3, mp:0.45, atk:0.15, def:0.2, agi:0.2}, ab:[
        ["ふわふわ ねむり", "呪文", 8, "foes", 20, "てき ぜんたいを ねむらせる", [["stunAll"]]],
        ["ゆめの つづき", "呪文", 14, "ally", 55, "たおれた なかまを HP5わりで ふっかつ", [["revive", 0.5]]],
        ["ぐっすり ドリーム", "呪文", 34, "party", 99, "みんなを 7わり かいふく＋MPも かいふく", [["healAll", 0.7], ["mp", 0.4]]]]},
    {id:"traveler", n:"時の旅人", e:"⏳", d:"じかんを ゆきき する たびびと。ARE の ものがたりに ぴったり。", prof:{hp:0.15, mp:0.4, atk:0.25, def:0.15, agi:0.6}, ab:[
        ["ちょっと はやまわし", "呪文", 9, "party", 20, "みんなの こうげき アップ", [["buffA"]]],
        ["もどって やりなおし", "呪文", 18, "ally", 55, "たおれた なかまを HP7わりで ふっかつ", [["revive", 0.7]]],
        ["じかん ストップ・ARE", "呪文", 36, "foes", 99, "てきの じかんを とめて ダメージ", [["dmgAll", 2.0], ["stunAll"]]]]},
    {id:"fairy", n:"妖精", e:"🧚", d:"はなと ひかりの ようせい。やさしい まほうで みんなを まもる。", prof:{hp:0.2, mp:0.5, atk:0.1, def:0.3, agi:0.35}, ab:[
        ["キラキラ こな", "呪文", 6, "ally", 20, "なかまの HPを 4.5わり かいふく", [["heal", 0.45]]],
        ["はなの かんむり", "呪文", 13, "party", 55, "ぼうぎょ アップ＋みんなを ちょっと かいふく", [["buffD"], ["healAll", 0.2]]],
        ["せいれいの うた", "呪文", 32, "party", 99, "みんなを ぜんかいふく＋パワーアップ", [["healAll", 1.0], ["buffAD"]]]]},
    {id:"cat", n:"ねこ使い", e:"🐱", d:"ねこと なかよし。すばしっこく て ひるねも だいすき。", prof:{hp:0.25, mp:0.2, atk:0.35, def:0.2, agi:0.6}, ab:[
        ["ねこパンチ", "特技", 4, "foe", 20, "2れんぞく ねこパンチ", [["multi", 2, 1.0]]],
        ["おひるね ゴロゴロ", "特技", 10, "self", 55, "じぶんの HPと MPを かいふく", [["healSelf", 0.6], ["mp", 0.25]]],
        ["ねこの もりの なかまたち", "特技", 30, "foes", 99, "ねこが 4ターン こうげき＋てき ぜんたいに ダメージ", [["dmgAll", 2.2], ["summon", 4, 1.1]]]]},
    {id:"are", n:"ARE使い", e:"🌟", d:"『そういうときは、AREだ！』を つかいこなす でんせつの 職業。3つの 職業を マスターすると なれる。", prof:{hp:0.4, mp:0.5, atk:0.5, def:0.4, agi:0.4}, need:TQ_JOB_ARE_NEED, ab:[
        ["AREの ひかり", "呪文", 12, "party", 30, "みんなを 5わり かいふく＋こうげき アップ", [["healAll", 0.5], ["buffA"]]],
        ["そういう ときは AREだ！", "特技", 24, "foes", 60, "てき ぜんたいに ダメージ＋AREゲージ モリモリ", [["dmgAll", 2.6], ["gauge", 50]]],
        ["ARE・オーバードライブ", "特技", 40, "foes", 99, "ARE の ぜんりょく！ 超ダメージ＋パワーアップ", [["dmgAll", 4.0], ["buffAD"]]]]},
    {id:"genius", n:"天才", e:"🌈", genius:true, d:"15の 職業を すべて きわめた ものだけが たどりつく ふしぎな 職業。ぜんぶ ケタちがい！", prof:{hp:0.9, mp:0.9, atk:0.9, def:0.9, agi:0.9}, ab:[
        ["てんさいの へんしん", "呪文", 20, "foes", 1, "てきを ランダムで「けいけんち」「ゴールド」「ドロップ」「転生」モンスターに へんしんさせる！", [["transform"]]],
        ["いつでも かいしん", "特技", 0, "self", 1, "【ずっと】こうげきが いつも かいしんの いちげきに なる（ON/OFF）", [["passive", "gcrit"]]],
        ["いつでも にげられる", "特技", 0, "self", 1, "【ずっと】どんな あいてからも かならず にげられる（ON/OFF）", [["passive", "gflee"]]],
        ["スカウトの かみさま", "特技", 0, "self", 1, "【ずっと】モンスターが かならず なかまに なりたがる 100%（ON/OFF）", [["passive", "gscout"]]],
        ["ゴールドの かみさま", "特技", 0, "self", 1, "【ずっと】もらえる ゴールドが 3ばい（ON/OFF）", [["passive", "ggold"]]],
        ["けいけんの かみさま", "特技", 0, "self", 1, "【ずっと】もらえる 経験値が 3ばい（ON/OFF）", [["passive", "gexp"]]],
        ["てんさいの いやし", "呪文", 40, "party", 1, "みんなを ぜんかいふく！ ふっかつ＋HP・MPまんたん", [["godHeal"]]],
        ["ボス とばし", "特技", 50, "foes", 1, "ボスせんを いっしゅんで おわらせる！（ほうびは ちゃんと もらえる）", [["bossSkip"]]],
        ["ビッグバン・ARE", "呪文", 60, "foes", 1, "うちゅうの はじまりの ひかり！ てき ぜんたいに 超・超ダメージ", [["dmgAll", 14.0], ["gauge", 100]]],
        ["じかんよ とまれ", "特技", 80, "foes", 1, "じかんが とまる！ てきが ぜんいん 3ターン うごけない＋みんな パワーアップ", [["timeStop"]]]]}
];
// わざ（50）の 一覧を つくる（id: "J" + 職業番号 + 順番）
const TQ_JOB_AB = {};
TQ_JOBS.forEach((j, ji) => {
    j.abil = j.ab.map((a, ai) => { const o = {id:"J" + String(ji + 1).padStart(2, "0") + String.fromCharCode(97 + ai), job:j.id, n:a[0], type:a[1], mp:a[2], tg:a[3], lv:a[4], d:a[5], fx:a[6]}; TQ_JOB_AB[o.id] = o; return o; });
});
const TQ_JOB_BY = {}; TQ_JOBS.forEach((j) => { TQ_JOB_BY[j.id] = j; });
const TQ_JOB_STATS = ["hp", "mp", "atk", "def", "agi"], TQ_JOB_STAT_N = {hp:"HP", mp:"MP", atk:"こうげき", def:"ぼうぎょ", agi:"すばやさ"};

// ---------------------------------------------------------------- 状態
function tqJ(){
    const S = G.S; if(!S) return null;
    const j = (S.job = S.job || {});
    if(!j.carry) j.carry = {hp:0, mp:0, atk:0, def:0, agi:0};
    if(!j.best) j.best = {};
    if(!Array.isArray(j.mast)) j.mast = [];
    if(!Array.isArray(j.tried)) j.tried = [];
    if(!j.learned) j.learned = {};
    if(typeof j.cur !== "string") j.cur = "";
    if(!(j.jlv >= 1)) j.jlv = 1;
    if(!(j.jexp >= 0)) j.jexp = 0;
    if(!(j.changes >= 0)) j.changes = 0;
    return j;
}
function tqJobNeed(lv){ return Math.max(6, Math.round(rpgNeed(Math.min(lv, 98)) / 12)); }
function tqJobCan(id){
    const j = tqJ(), def = TQ_JOB_BY[id]; if(!j || !def) return {ok:false, why:"？"};
    if(window.pkGate && !pkGate(1)) return {ok:false, why:"地図1（ホシミ台）を クリアすると 転職できます。"};
    if(G.S.lv < TQ_JOB_MIN_LV) return {ok:false, why:"レベル" + TQ_JOB_MIN_LV + " から 転職できます。（いま Lv" + G.S.lv + "）"};
    if(def.genius){ const left = TQ_JOBS.filter((x) => !x.genius && !j.mast.includes(x.id)).length; if(left > 0) return {ok:false, why:"？？？（まだ ひみつ… あと " + left + " しゅるいの 職業を マスターすると…）"}; }
    else if(def.need && j.mast.length < def.need) return {ok:false, why:"3つの 職業を マスター（職業Lv99）すると なれます。（いま " + j.mast.length + "/" + def.need + "）"};
    if(j.cur === id) return {ok:false, why:"いま この 職業です。"};
    return {ok:true};
}
// ボーナスの けいさん
function tqJobMul(stat){
    const j = tqJ(); if(!j) return 1;
    const def = TQ_JOB_BY[j.cur], cur = def ? 1 + def.prof[stat] * (j.jlv / 99) : 1;
    const carry = 1 + Math.min(1.0, j.carry[stat] || 0), team = 1 + 0.03 * j.mast.length + 0.01 * Math.max(0, j.tried.length - 1);
    return carry * cur * team;
}
function tqJobStartLv(id){
    const j = tqJ(); let s = 1 + 2 * j.mast.length + Math.floor(j.changes / 2);
    if(j.best[id]) s = Math.max(s, Math.floor(j.best[id] * 0.6));
    return Math.max(1, Math.min(60, s));
}
function tqJobRate(){ const j = tqJ(); return 1 + 0.1 * Math.min(10, Math.max(0, j.tried.length - 1)); }

// ステータスに はんえい（主人公だけ）
(function(){
    const _stat = tqStat;
    tqStat = function(id){
        const st = _stat.apply(this, arguments);
        try{
            const S = G.S;
            if(id !== "hero" || !S || S.cx.st999 || !S.job) return st;
            tqJ();
            const o = {maxhp:"hp", maxmp:"mp", atk:"atk", def:"def", agi:"agi"};
            Object.keys(o).forEach((k) => { st[k] = Math.round(st[k] * tqJobMul(o[k])); });
        }catch(e){ console.error("[job stat]", e); }
        return st;
    };
})();

// 経験値 → 職業レベル
(function(){
    const _gain = tqGain;
    tqGain = function(exp){
        const S = G.S, pre = S && S.job && S.job.cur ? exp : 0, msgs = [];
        const ups = _gain.apply(this, arguments);
        try{
            if(pre > 0){
                const j = tqJ();
                if(j.jlv < 99){
                    j.jexp += Math.max(1, Math.round(pre * (S.expmul || 1) * tqJobRate()));
                    while(j.jlv < 99 && j.jexp >= tqJobNeed(j.jlv)){
                        j.jexp -= tqJobNeed(j.jlv); j.jlv++;
                        msgs.push(S.name + "の 職業レベルが " + j.jlv + " に あがった！（" + TQ_JOB_BY[j.cur].n + "）");
                        TQ_JOB_BY[j.cur].abil.forEach((a) => { if(j.jlv >= a.lv && !j.learned[a.id]){ j.learned[a.id] = 1; msgs.push(S.name + "は「" + a.n + "」を おぼえた！"); } });
                        if(j.jlv >= 99){ j.jexp = 0; if(!j.mast.includes(j.cur)){ j.mast.push(j.cur); j.best[j.cur] = 99; msgs.push("🎉 " + TQ_JOB_BY[j.cur].n + " を マスターした！（ステータスに ボーナス）"); } }
                    }
                    j.best[j.cur] = Math.max(j.best[j.cur] || 0, j.jlv);
                }
            }
        }catch(e){ console.error("[job gain]", e); }
        return ups.concat(msgs);
    };
})();

// 転職
function tqJobChange(id){
    const S = G.S, j = tqJ(), c = tqJobCan(id); if(!c.ok) return {ok:false, msg:c.why};
    const def = TQ_JOB_BY[id], old = TQ_JOB_BY[j.cur];
    let msg = "";
    if(old){
        TQ_JOB_STATS.forEach((s) => { j.carry[s] = Math.min(1, (j.carry[s] || 0) + old.prof[s] * (j.jlv / 99) * 0.5); });
        j.best[old.id] = Math.max(j.best[old.id] || 0, j.jlv);
        if(j.jlv >= 99 && !j.mast.includes(old.id)) j.mast.push(old.id);
        msg += old.n + " で のびた 成長の 半分が ずっと のこる！\n";
    }
    if(!j.tried.includes(id)) j.tried.push(id);
    j.changes++; j.cur = id; j.jlv = tqJobStartLv(id); j.jexp = 0;
    def.abil.forEach((a) => { if(j.jlv >= a.lv) j.learned[a.id] = 1; });
    tqClamp(); tqAutoSave();
    return {ok:true, msg:msg + S.name + " は「" + def.n + "」に 転職した！（職業Lv" + j.jlv + " から スタート）"};
}
function tqJobKnown(){ const j = tqJ(); return j ? Object.keys(j.learned).filter((k) => TQ_JOB_AB[k] && j.learned[k]).map((k) => TQ_JOB_AB[k]) : []; }

// ---------------------------------------------------------------- 戦闘
(function(){
    if(typeof pkBattleBtns !== "function") return;
    const _btns = pkBattleBtns, _menu = pkBattleMenu, _bcmd = pkBcmd, _act = pkHeroAct, _re = roundEnd;
    pkBattleBtns = function(){ let h = _btns.apply(this, arguments); try{ if(G.S && G.S.job && tqJobKnown().length) h += '<button class="opt" data-a="bcmd" data-v="pkmenu|job">🎓 しょくぎょうわざ</button>'; }catch(_e){} return h; };
    pkBattleMenu = function(menu){
        if(menu === "pkjob"){
            const back = '<button class="opt" data-a="bcmd" data-v="back">もどる</button>';
            return tqJobKnown().filter((a) => !(a.fx[0] && a.fx[0][0] === "passive")).map((a) => '<button class="opt" data-a="bcmd" data-v="jobuse|' + a.id + '">' + esc(a.n) + '（MP' + a.mp + '）</button>').join("") + back;
        }
        return _menu.apply(this, arguments);
    };
    pkBcmd = function(c, arg){
        if(c === "jobuse"){
            const b = G.b, S = G.S, a = TQ_JOB_AB[arg]; if(!b || !a || !tqJobKnown().includes(a)) return true;
            if(S.m.hero.mp < a.mp && !S.cx.infmp){ b.text = "MPが たりない！"; b.menu = "top"; render(); return true; }
            if(a.tg === "foe"){ if(foesAlive().length > 1){ G.pend = {k:"pkjob", id:arg}; b.menu = "target"; render(); } else heroTurn({k:"pkjob", id:arg, t:foesAlive()[0]}); return true; }
            if(a.tg === "ally"){ G.pend = {k:"pkjob", id:arg}; b.menu = "ally"; render(); return true; }
            heroTurn({k:"pkjob", id:arg, t:foesAlive()[0]}); return true;
        }
        return _bcmd.apply(this, arguments);
    };
    pkHeroAct = function(act){
        if(act.k !== "pkjob") return _act.apply(this, arguments);
        const b = G.b, S = G.S, a = TQ_JOB_AB[act.id], hn = S.name; if(!a) return false;
        if(S.m.hero.mp < a.mp && !S.cx.infmp){ bLog("MPが たりない！"); return false; }
        const st = tqStat("hero"), atkB = b.buff.atk > 0 ? 1.25 : 1, fa = foesAlive();
        bSpend("hero", a.mp); bLog(hn + (a.type === "呪文" ? "は " + a.n + " を となえた！" : "の " + a.n + "！"));
        const hit = (t, mult, crit) => { const r = bDmg(st.atk * atkB, t.def, mult * (crit || 1)), dm = bFoeHurt(t, r.d); bHit(b.foes.indexOf(t)); S.gauge = Math.min(100, S.gauge + 6); bLog(t.label + "に " + dm + "のダメージ！" + (r.crit ? "（かいしん！）" : "")); return dm; };
        const pickT = () => { let t = act.t; if(!t || t.cur <= 0) t = foesAlive()[0]; return t; };
        const healTo = (cid, amt) => { if(!bAlive(cid)) { bLog(tqName(cid) + "は たおれていて きかない！"); return; } const mm = S.m[cid], bf = mm.hp; mm.hp = Math.min(tqStat(cid).maxhp, bf + Math.max(1, Math.round(amt))); bLog(tqName(cid) + "の HPが " + (mm.hp - bf) + " かいふく！"); };
        a.fx.forEach((f) => {
            const k = f[0];
            if(k === "dmg"){ const t = pickT(); if(t) hit(t, f[1]); }
            else if(k === "crit"){ const t = pickT(); if(t) hit(t, f[1], 1); }
            else if(k === "multi"){ for(let i = 0; i < f[1]; i++){ const t = pickT() || foesAlive()[0]; if(!t || t.cur <= 0) break; hit(t, f[2]); } }
            else if(k === "dmgAll"){ foesAlive().forEach((t) => hit(t, f[1] * 0.85)); }
            else if(k === "heal"){ const c = act.to || "hero"; healTo(c, tqStat(c).maxhp * f[1]); }
            else if(k === "healSelf"){ healTo("hero", tqStat("hero").maxhp * f[1]); }
            else if(k === "healAll"){ S.party.filter((c) => bAlive(c)).forEach((c) => healTo(c, tqStat(c).maxhp * f[1])); }
            else if(k === "revive"){ const c = act.to || S.party.find((x) => !bAlive(x)); if(!c || bAlive(c)){ bLog("ふっかつさせる なかまが いない！"); } else { S.m[c].hp = Math.max(1, Math.round(tqStat(c).maxhp * f[1])); bLog(tqName(c) + "が ふっかつした！"); } }
            else if(k === "mp"){ const mm = S.m.hero, mx = tqStat("hero").maxmp, bf = mm.mp; mm.mp = Math.min(mx, bf + Math.round(mx * f[1])); bLog(hn + "の MPが " + (mm.mp - bf) + " かいふく！"); }
            else if(k === "buffA"){ b.buff.atk = Math.max(b.buff.atk, 3); bLog("みんなの こうげきが アップ！"); }
            else if(k === "buffD"){ b.buff.def = Math.max(b.buff.def, 3); bLog("みんなの ぼうぎょが アップ！"); }
            else if(k === "buffAD"){ b.buff.atk = Math.max(b.buff.atk, 3); b.buff.def = Math.max(b.buff.def, 3); bLog("みんなの こうげき・ぼうぎょが アップ！"); }
            else if(k === "guard"){ b.guard = true; }
            else if(k === "debuff"){ foesAlive().forEach((t) => { t.atk = Math.max(1, Math.round(t.atk * 0.8)); t.def = Math.max(0, Math.round(t.def * 0.75)); bLog(t.label + "の ちからが さがった！"); }); }
            else if(k === "stunAll"){ foesAlive().forEach((t) => { if(t.boss && G.rnd() > 0.35){ bLog(t.label + "には きかなかった！"); return; } t.stun = 2; bLog(t.label + "は うごけなくなった！"); }); }
            else if(k === "gauge"){ S.gauge = Math.min(100, S.gauge + f[1]); bLog("AREゲージが たまった！"); }
            else if(k === "transform"){ tqGeniusTransform(a); }
            else if(k === "godHeal"){ S.party.forEach((c) => { const mm = S.m[c], st2 = tqStat(c); mm.hp = st2.maxhp; mm.mp = st2.maxmp; }); bLog("みんなが ひかりに つつまれて ぜんかいふく！ ふっかつも した！"); }
            else if(k === "bossSkip"){ foesAlive().forEach((t) => { t.cur = 1; bFoeHurt(t, 999999999); bHit(b.foes.indexOf(t)); }); bLog("てんさいの ちからで たたかいが いっしゅんで おわった！"); }
            else if(k === "timeStop"){ foesAlive().forEach((t) => { t.stun = 3; bLog(t.label + "は じかんの なかに とじこめられた！"); }); b.buff.atk = Math.max(b.buff.atk, 4); b.buff.def = Math.max(b.buff.def, 4); S.gauge = 100; bLog("じかんが とまった！ みんなが パワーアップ！"); }
            else if(k === "passive"){ bLog("これは ずっと はたらく ちから。メニューの てんしょくで ON/OFF できる！"); }
            else if(k === "summon"){ b.jobFx = (b.jobFx || []).concat([{k:"summon", turns:f[1], mult:f[2], name:a.n}]); bLog("なかまが かけつけた！（" + f[1] + "ターン）"); }
        });
        return false;
    };
    // ターンの おわりに ぬいぐるみ などが こうげき
    roundEnd = function(){
        const b = G.b;
        try{
            if(b && b.jobFx && b.jobFx.length && foesAlive().length > 0){
                const S = G.S, st = tqStat("hero");
                b.jobFx.forEach((f) => {
                    const fa = foesAlive(); if(!fa.length || f.turns <= 0) return;
                    const t = fa[Math.floor(G.rnd() * fa.length)], r = bDmg(st.atk, t.def, f.mult * 0.9), dm = bFoeHurt(t, r.d); bHit(b.foes.indexOf(t));
                    bLog("おともだちの こうげき！ " + t.label + "に " + dm + "のダメージ！"); f.turns--;
                });
                b.jobFx = b.jobFx.filter((f) => f.turns > 0);
                b.text = b.log.slice(-6).join("\n");
            }
        }catch(e){ console.error("[job fx]", e); }
        return _re.apply(this, arguments);
    };
})();

// ---------------------------------------------------------------- 天才の ちから
const TQ_GEN_PASS = {gcrit:"いつでも かいしん", gflee:"いつでも にげられる", gscout:"スカウト 100%", ggold:"ゴールド ×3", gexp:"経験値 ×3"};
function tqGeniusTransform(a){
    const b = G.b, kinds = ["exp", "gold", "drop", "rebirth"];
    foesAlive().forEach((f) => {
        if(f.boss){ f.exp = Math.round(f.exp * 1.5); f.g = Math.round(f.g * 1.5); b.log.push(f.label + "は へんしんを はねかえした！ …でも ごほうびが ふえた！"); return; }
        const k = kinds[Math.floor(G.rnd() * kinds.length)], old = f.label;
        if(k === "exp"){ f.exp = f.exp * 6 + 20; f.label = "✨経験値の" + old; b.log.push(old + "は 🌟けいけんちモンスター に へんしん！"); }
        else if(k === "gold"){ f.g = f.g * 6 + 30; f.label = "💰ゴールドの" + old; b.log.push(old + "は 💰ゴールドモンスター に へんしん！"); }
        else if(k === "drop"){ f.sureDrop = true; f.g = f.g * 2; f.label = "🎁ドロップの" + old; b.log.push(old + "は 🎁ドロップモンスター に へんしん！ かならず なにか おとす！"); }
        else{ f.exp = f.exp * 3 + 10; f.g = f.g * 3 + 20; f.sureDrop = true; f.sureScout = true; f.label = "🌈転生の" + old; b.log.push(old + "は 🌈転生モンスター に へんしん！ すべてが ふえて なかまにも なりたがる！"); }
        f.atk = Math.max(1, Math.round(f.atk * 0.5));
    });
}
ACT.gTog = (v) => { const S = G.S; if(!TQ_GEN_PASS[v]) return; const ok = tqJobKnown().some((a) => a.fx[0] && a.fx[0][1] === v); if(!ok) return; S.cx[v] = !S.cx[v]; tqAutoSave(); render(); };

// ---------------------------------------------------------------- 画面（メニュー → 転職）
function tqJobView(){
    const S = G.S, j = tqJ(), cur = TQ_JOB_BY[j.cur];
    let h = '<h2>👔 てんしょく</h2>';
    h += '<div class="card"><b>いまの 職業：' + (cur ? cur.e + " " + esc(cur.n) : "（なし）") + '</b>' + (cur ? '　職業Lv ' + j.jlv + (j.jlv >= 99 ? "（マスター！）" : '　つぎまで ' + (tqJobNeed(j.jlv) - j.jexp)) : "") +
        '<div class="meta">キャラ Lv' + S.lv + '　マスター ' + j.mast.length + '/15　ためした職業 ' + j.tried.length + '/16　転職 ' + j.changes + '回　成長スピード ×' + tqJobRate().toFixed(1) + '</div>' +
        '<div class="meta">ボーナス：' + TQ_JOB_STATS.map((s) => TQ_JOB_STAT_N[s] + " ×" + tqJobMul(s).toFixed(2)).join("　") + '</div></div>';
    if(window.pkGate && !pkGate(1)) h += '<div class="card">🔒 地図1（ホシミ台）を クリアすると 転職できます。</div>';
    else if(S.lv < TQ_JOB_MIN_LV) h += '<div class="card">🔒 レベル' + TQ_JOB_MIN_LV + ' から 転職できます。（いま Lv' + S.lv + '）</div>';
    h += '<div class="card meta">転職すると、いまの 職業で のびた 成長の「半分」が ずっと のこります。おぼえた わざは 職業を かえても つかえます。マスターした 職業が ふえるほど、あたらしい 職業の スタートが 高くなります。</div>';
    if(G.jobMsg) h += '<div class="card okc" style="white-space:pre-wrap">' + esc(G.jobMsg) + '</div>';
    const passK = tqJobKnown().filter((a) => a.fx[0] && a.fx[0][0] === "passive");
    if(passK.length){
        h += '<div class="card"><b>🌈 てんさいの ちから（ずっと）</b>' + passK.map((a) => { const k = a.fx[0][1]; return '<div class="row"><span class="meta">' + esc(a.n) + '：' + esc(a.d) + '</span><button class="btn' + (S.cx[k] ? "" : " sub") + '" data-a="gTog" data-v="' + k + '">' + (S.cx[k] ? "ON" : "OFF") + '</button></div>'; }).join("") + '</div>';
    }
    TQ_JOBS.forEach((d) => {
        const c = tqJobCan(d.id), me = j.cur === d.id, best = j.best[d.id] || 0, pend = G.jobPend === d.id;
        if(d.genius && !c.ok && !me && !best){ h += '<div class="card"><b>❓ ？？？</b><div class="meta">' + esc(c.why) + '</div></div>'; return; }
        h += '<div class="card"><b>' + d.e + ' ' + esc(d.n) + '</b>' + (me ? ' <span class="okc">◀ いま</span>' : "") + (j.mast.includes(d.id) ? ' <span class="okc">★マスター</span>' : (best ? ' <span class="meta">さいこう Lv' + best + '</span>' : "")) +
            '<div class="meta">' + esc(d.d) + '</div><div class="meta">せいちょう：' + TQ_JOB_STATS.map((s) => TQ_JOB_STAT_N[s] + "+" + Math.round(d.prof[s] * 100) + "%").join(" ") + '</div>' +
            '<div class="meta">' + d.abil.map((a) => (j.learned[a.id] ? "✅" : "▫️") + esc(a.n) + '(Lv' + a.lv + ')').join("　") + '</div>' +
            (me ? "" : pend ? '<div class="row"><button class="btn" data-a="jobGo" data-v="' + d.id + '">ほんとうに 転職する</button><button class="btn sub" data-a="jobNo">やめる</button></div>' :
                c.ok ? '<div class="row"><button class="btn" data-a="jobSet" data-v="' + d.id + '">転職する</button></div>' : '<div class="meta">🔒 ' + esc(c.why) + '</div>') + '</div>';
    });
    return h;
}
ACT.jobSet = (v) => { G.jobPend = v; G.jobMsg = ""; render(); };
ACT.jobNo = () => { G.jobPend = null; render(); };
ACT.jobGo = (v) => { const r = tqJobChange(v); G.jobPend = null; G.jobMsg = r.msg; render(); };
