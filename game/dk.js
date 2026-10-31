"use strict";
// ===== 出来事（クリア後の おまけ・全10話） 〜 エンジン =====
//   主人公と ゆうざいくん 以外の 名前・地名は ぜんぶ 架空に かえてあります。
//   1話 ＝ 1つの 地図。町の人に 話しかけて、場面を じゅんばんに すすめる。 さいごに 語り手に 話しかけると おしまい。
const DK_EPS = [];
Y_HAND["ゆうざいくん"] = "yuzai";
Y_PEOPLE["主人公"] = ["#f6d2b0", "#1b1b27", "short", "#2f6fdc", "#374151", "none"];
Y_PEOPLE["語り手"] = ["#f9d9bd", "#555", "bun", "#8a5ab6", "#4b5563", "glasses"];
TQ_PORTRAIT_IMG["ゆうざいくん"] = TQ_PORTRAIT_IMG["ゆうざいくん"] || "yuzai";

// 戦う 相手（模擬戦＝まけても だいじょうぶ。むずかしさは ふつうの ルール）
function dkFoe(id, name, emo, img, lv, acts, say, mult){
    RPG_FOES[id] = rpgE(name, emo, 10, 5, 1, 1, 1, acts, Object.assign({boss:true, spar:true}, img ? {img} : {}, {say50:say}));
    const st = tqBossStat(lv), m = mult || 1; st.hp = Math.round(st.hp * m); st.atk = Math.round(st.atk * Math.min(1, 0.7 + m * 0.3)); st.exp = Math.round(st.exp * 0.9); st.g = Math.round(st.g * 4);
    Object.assign(RPG_FOES[id], st, {bossLv:lv}); return id;
}

// 1つの 場面（NPC 1人ぶん）。lines → （なぞ／たたかい）→ after → フラグ
function dkScene(id, prev, prevLabel, o){
    const flag = o.flag, x = id + "_x";
    const hint = [rpgN("（まだ その 場面には 早いみたい。『" + (prevLabel || "ほかの 人") + "』の ところから 先に 話を 聞いてみよう。）")];
    if(o.q){
        yq(x, {chk:flag, set:flag, intro:o.lines, fin:o.after, done:o.done, steps:o.q});
    } else if(o.battle){
        RPG_EV[x] = [["if", flag, YKL(o.done || ["（この 場面は もう おわったよ。）"]),
            YKL(o.lines).concat([["battle", [o.battle], YKL(o.after || []).concat([["set", flag]])]])]];
    } else {
        RPG_EV[x] = [["if", flag, YKL(o.done || ["（この 場面は もう おわったよ。）"]), YKL(o.lines).concat(YKL(o.after || []), [["set", flag]])]];
    }
    RPG_EV[id] = [["if", flag, [["run", x]], prev ? [["if", prev, [["run", x]], hint]] : [["run", x]]]];
}

function DKE(n, c){
    const m = "dk" + n, L = "abcde", flags = c.steps.map((_s, i) => m + "s" + (i + 1));
    DK_EPS.push({n, title:c.title, sub:c.sub, date:c.date, learn:c.learn});
    // --- 場面
    c.steps.forEach((s, i) => dkScene(m + "_" + L[i], i ? flags[i - 1] : "", i ? c.steps[i - 1].label : "", Object.assign({flag:flags[i]}, s)));
    // --- ざつだん
    (c.talks || []).forEach((t, i) => { RPG_EV[m + "_t" + (i + 1)] = YKL(t[1]); });
    // --- 語り手（まとめ役）
    const list = c.steps.map((s, i) => ["if", flags[i], [], [rpgN("・" + s.label + "（まだ）")]]);
    const reward = [["gold", 3000 + n * 600], ["item", "special", 3], ["item", "omamori", 1], rpgN((3000 + n * 600) + "G と スペシャルおにぎり 3こ・ふっかつのおまもり 1こ を てにいれた！"), rpgN("📖 今回の まなび：" + c.learn)];
    RPG_EV[m + "_hq"] = [["if", "e_" + m, YKL(c.after || ["語り手｜この 出来事は もう おしまい。ゲートから つぎの 出来事へ すすもう！"]),
        [["if", flags.join("&"), YKL(c.fin).concat(reward, [["set", "e_" + m]], n === 10 ? [["run", "dk_final"]] : [["run", "lab_ret_go"]]), YKL(c.guide).concat(list)]]]];
    RPG_EV[m + "_enter"] = [["if", "!" + m + "_in", [["set", m + "_in"], ["set", "dk_started"]].concat(YKL(c.intro)), []]];
    // --- 地図
    const objs = [yNpc(m + "_hq", Y_GUIDE[0], Y_GUIDE[1], "語り手", m + "_hq")];
    c.steps.forEach((s, i) => objs.push(yNpc(m + "_" + L[i], Y_SLOT[i][0], Y_SLOT[i][1], s.who, m + "_" + L[i])));
    (c.talks || []).forEach((t, i) => objs.push(yNpc(m + "_t" + (i + 1), Y_SLOT[c.steps.length + i][0], Y_SLOT[c.steps.length + i][1], t[0], m + "_t" + (i + 1))));
    RPG_MAPS[m] = yMap(c.theme, objs, "出来事 第" + n + "話　" + c.title);
    RPG_ENTER[m] = m + "_enter"; TQ_BGM_MAP[m] = c.bgm || "town";
    c.steps.forEach((s) => yPortrait(s.who));
    (c.talks || []).forEach((t) => yPortrait(t[0]));
}
