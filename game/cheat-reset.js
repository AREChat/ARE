"use strict";
// ===== チートの「ぜんぶリセット」コード（指紋だけ。コード本体は入っていません）=====
// ずっと続くチート（無敵・ワンパン・MPむげん・倍率・ステータス999・ヒーロー伝説の敵の強さ…）を、まとめて もとに もどす。
// ※ 一回きりの チート（所持金・レベルの上げ下げ・職業マスター等）は「続く効果」ではないので そのまま。
if(typeof TQ_CHEATS !== "undefined"){
    TQ_CHEATS.push(["67694e5644d1141c267f0861c0be86ca40702b5fd239ff9ed5f5ff051ce63169", "z_reset"]);
    TQ_CHEATS.push(["289384218a04e39f4a27974835a4158c6b1c4fb8db2fc4640c18036e6435102a", "z_reset"]);
}
const TQ_PERSIST_FLAGS = ["god", "onehit", "infmp", "areall", "noenc", "encx3", "speed", "rainbow", "showpos", "gcrit", "gflee", "gscout", "ggold", "gexp", "yw", "ys", "st999"];
const TQ_FLAG_JP = {gcrit:"いつでも かいしん", gflee:"いつでも にげられる", gscout:"スカウト100%", ggold:"ゴールド×3", gexp:"経験値×3", yw:"ヒーロー伝説の てき 1/4", ys:"ヒーロー伝説の てき ×2"};
function tqResetAllCheats(){
    const S = G.S, c = S.cx, out = [];
    try{ const m = tqReleaseAll(true); if(m) out.push(m); }catch(_e){}      // レベル・そうび・なかま等、記録つきのチートを かいじょ
    TQ_PERSIST_FLAGS.forEach((k) => { if(c[k]) out.push("・" + (TQ_FLAG_JP[k] || k) + " を OFF"); delete c[k]; });
    if((S.expmul || 1) !== 1){ out.push("・経験値の倍率を 1倍に"); }
    S.expmul = 1;
    if(!c.replay) { if(c.allgate) out.push("・ゲート全開を OFF"); delete c.allgate; }   // リプレイの冒険の書は ゲートが開いたまま
    c.act = [];
    // チートで ふやした なかま（4人より多い分）を もどす。ストーリーの 一時なかまは そのまま
    const keep = new Set(["hero", "haruki", "akito", "kaito"]);
    const tmp = S.temp || {};
    for(let i = S.party.length - 1; i >= 0 && S.party.length > 4; i--){
        const id = S.party[i]; if(keep.has(id) || tmp[id]) continue;
        S.party.splice(i, 1); delete S.m[id]; out.push("・なかま " + (typeof tqName === "function" ? tqName(id) : id) + " がぬけた");
    }
    try{ tqFixAfterRelease(); }catch(_e){ try{ tqClamp(); }catch(_e2){} }
    return out;
}
(function(){
    const _ac = _tqApplyBase;
    _tqApplyBase = function(raw){
        const f = tqFindCheat(raw);
        if(!f || f.id !== "z_reset" || !G.S) return _ac.apply(this, arguments);
        const out = tqResetAllCheats();
        try{ tqTitleCheck(true); }catch(_e){}
        tqAutoSave();
        return {ok:true, msg:"♻ チートを ぜんぶ リセットした！ ふだんの 状態に もどったよ。" + (out.length ? "\n" + out.join("\n") : "\n（続いていた チートは ありませんでした）")};
    };
})();
