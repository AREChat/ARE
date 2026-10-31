"use strict";
// ===== テーマパーク編（コイヌネランド／ワンコロランド／ウサウサランド）エンジン =====
//   dk.js の 場面システム（DKE）を そのまま つかい、ランドごとの 名前・難しさ・ごほうびだけ かえる。
const LD_EPS = {kn:[], wn:[], us:[]};
const LD_AREA = {kn:"コイヌネランド", wn:"ワンコロランド", us:"ウサウサランド"};
Object.assign(Y_PEOPLE, {
    "タカシ":["#f6d2b0", "#2d2118", "spike", "#e8506b", "#374151", "none"], "ケンジ":["#f9d9bd", "#1b1b27", "short", "#2f6fdc", "#4b5563", "glasses"],
    "リヒト":["#f6d2b0", "#1f2a44", "short", "#14b8a6", "#374151", "none"], "サトル":["#f3cfae", "#4a2a1a", "cap", "#f2c94c", "#35507a", "none"],
    "アカネ":["#f9d9bd", "#7a4a2a", "twin", "#c0475a", "#4b3a6b", "none"], "マイカ":["#f6d2b0", "#2a1a14", "bob", "#8a5ab6", "#6a4a7a", "none"]
});

// land: kn / wn / us ,  n: 1〜10 ,  c: DKE と おなじ ＋ lv（推奨レベル）, mobs:[[emo,name]×3]
function LDX(land, n, c){
    const m = land + n, L = "abcde", flags = c.steps.map((_s, i) => m + "s" + (i + 1)), area = LD_AREA[land];
    LD_EPS[land].push({n, title:c.title, sub:c.sub, lv:c.lv, learn:c.learn});
    c.steps.forEach((s, i) => dkScene(m + "_" + L[i], i ? flags[i - 1] : "", i ? c.steps[i - 1].label : "", Object.assign({flag:flags[i]}, s)));
    (c.talks || []).forEach((t, i) => { RPG_EV[m + "_t" + (i + 1)] = YKL(t[1]); });
    const list = c.steps.map((s, i) => ["if", flags[i], [], [rpgN("・" + s.label + "（まだ）")]]);
    const base = c.base || (2500 + n * 450 + (land === "wn" ? 3000 : land === "us" ? 8000 : 0));
    const reward = [["gold", base], ["item", "special", 3], ["item", "omamori", 1], rpgN(base + "G と スペシャルおにぎり 3こ・ふっかつのおまもり 1こ を てにいれた！"), rpgN("📖 今回の まなび：" + c.learn)];
    RPG_EV[m + "_hq"] = [["if", "e_" + m, YKL(c.after || ["語り手｜この 話は もう おしまい。 ゲートから つぎへ すすもう！"]),
        [["if", flags.join("&"), YKL(c.fin).concat(reward, [["set", "e_" + m]], (c.last !== undefined ? c.last : n === 10) ? [["run", land + "_final"]] : [["run", "lab_ret_go"]]), YKL(c.guide || ["語り手｜町の 人に 話しかけて、場面を じゅんばんに すすめよう。 さいごは わたしに 話しかけてね。"]).concat(list)]]]];
    RPG_EV[m + "_enter"] = [["if", "!" + m + "_in", [["set", m + "_in"], ["set", land + "_started"]].concat(YKL(c.intro)), []]];
    const objs = [yNpc(m + "_hq", Y_GUIDE[0], Y_GUIDE[1], "語り手", m + "_hq")];
    c.steps.forEach((s, i) => objs.push(yNpc(m + "_" + L[i], Y_SLOT[i][0], Y_SLOT[i][1], s.who, m + "_" + L[i])));
    (c.talks || []).forEach((t, i) => objs.push(yNpc(m + "_t" + (i + 1), Y_SLOT[c.steps.length + i][0], Y_SLOT[c.steps.length + i][1], t[0], m + "_t" + (i + 1))));
    RPG_MAPS[m] = yMap(c.theme, objs, (c.area || area) + " 第" + n + "話　" + c.title);
    RPG_ENTER[m] = m + "_enter"; TQ_BGM_MAP[m] = c.bgm || "field";
    c.steps.forEach((s) => yPortrait(s.who)); (c.talks || []).forEach((t) => yPortrait(t[0]));
}
// 戦う 相手（ランドの 推奨レベルに あわせた ボス）
const ldFoe = (id, name, emo, img, lv, acts, say, mult) => dkFoe(id, name, emo, img, lv, acts, say, mult || 1);

// ---- かきやすい ヘルパー ----
const _A = (x) => x == null ? [] : Array.isArray(x) ? x : [x];
const LP = (who, label, lines, after) => ({who, label, lines, after:_A(after)});                    // ふつうの 場面
const LB = (who, label, lines, foe, after) => ({who, label, lines, battle:foe, after:_A(after)});    // たたかい 場面
// なぞ場面：qs = [[もんだい, せいかい, [まちがい…], ヒント, せいかいの ひとこと]…]
const LQ = (who, label, lines, qs, after) => ({who, label, lines, after:_A(after), q:qs.map((x) => ({q:x[0], a:[x[1]].concat(x[2]), hint:_A(x[3]), ok:_A(x[4])}))});
