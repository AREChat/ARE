"use strict";
// ===== 本編 Map1〜10 の クリア後に ひらく 任意サブストーリー（合計140話）=====
//   ssa〜ssj ＝ Map1〜10。 LDX（ld.js）を そのまま つかう。
const SUB_MAPS = [  // key, 親のMap(ゲートID), 本編の おすすめLv, 話数, 名前
    ["ssa", "sendai", 1, 20, "コード・オブ・デスティニー"],
    ["ssb", "tokyo", 3, 20, "リプレイワールド"],
    ["ssc", "white", 10, 20, "人生2周目"],
    ["sse", "labn", 20, 10, "楽しい時ほど、大さんじ！？"],
    ["ssf", "n8", 28, 10, "人生おにハードモード"],
    ["ssg", "n9", 33, 10, "職業せんたく"],
    ["ssh", "n10", 38, 10, "デビルバイト"],
    ["ssi", "n11", 43, 10, "うそつきは うそはるの はじまり"],
    ["ssj", "future", 48, 10, "余命7日間の 彼女"]
];
SUB_MAPS.forEach((s) => { LD_EPS[s[0]] = []; LD_AREA[s[0]] = s[4]; });
// その話の おすすめレベルを きめる（Map の おすすめ + 2 から じわじわ 上がる）
function SBlv(key, n){
    const s = SUB_MAPS.find((x) => x[0] === key), lo = s[2] + 2, span = s[3] >= 20 ? 14 : 8;
    return Math.min(99, lo + Math.round((n - 1) * span / (s[3] - 1)));
}
// SB(キー, 話, {…LDX と おなじ（lvは じどう）})
function SB(key, n, c){
    const s = SUB_MAPS.find((x) => x[0] === key);
    LDX(key, n, Object.assign({lv:SBlv(key, n), last:n === s[3], base:1500 + SBlv(key, n) * 160 + n * 120}, c));
}
// 作品の さいごの ごほうび
SUB_MAPS.forEach((s, i) => {
    RPG_EV[s[0] + "_final"] = YKL(["語り手｜『" + s[4] + "』の " + s[3] + "話は ぜんぶ おしまい。", "語り手｜さいごまで 見てくれて ありがとう！ きみの ぼうけんに、とっておきの ごほうびを おくるよ。"])
        .concat([["gold", 30000 + i * 6000], ["item", "special", 5 + i], ["item", "omamori", 2 + (i >> 1)], rpgN((30000 + i * 6000).toLocaleString() + "G と スペシャルおにぎり " + (5 + i) + "こ・ふっかつのおまもり " + (2 + (i >> 1)) + "こを てにいれた！"), ["set", "e_" + s[0] + "_all"], ["run", "lab_ret_go"]]);
});
Object.assign(Y_PEOPLE, {
    "蒼太":["#f6d2b0", "#1b1b27", "short", "#2f6fdc", "#374151", "glasses"], "健斗":["#f6d2b0", "#3a2a1a", "spike", "#f2994a", "#374151", "none"],
    "美咲":["#f9d9bd", "#1b1b27", "long", "#d65a8a", "#4b3a6b", "none"], "竜也":["#f3cfae", "#222", "short", "#3b4a66", "#2b2b3a", "none"],
    "さえこ":["#f9d9bd", "#2a1a14", "long", "#2b2b3a", "#2b2b3a", "none"], "龍之介":["#f0d2b4", "#cfcfcf", "short", "#556", "#444", "glasses"]
});
// 戦う 相手（おすすめレベルと 画像は じどうで きまる）
const SBF = (key, n, name, emo, say, mult) => ldFoe(key + n + "_f", name, emo, key + n + "_boss", SBlv(key, n),
    [[name.split(" ").pop().slice(0, 4) + "アタック", 0, 1, 1.2], ["ぐるぐる ノイズ", 1, 0.7, 0.9], ["どっしり ジャンプ", 0, 0.6, 1.6]], (name + "「" + (say || "いい 勝負だったよ！") + "」"), mult || 1.1);
