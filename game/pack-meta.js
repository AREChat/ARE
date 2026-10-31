"use strict";
// ===== 追加パック：クエスト・イベント回想・実績/称号・DLC（追加コンテンツ5本）・強くてニューゲーム・コード・バックアップ =====

// ---------------------------------------------------------------- 数える（クエストの進み具合のもと）
function pkCnt(kind, n){ const p = pkS(); p.cnt[kind] = (p.cnt[kind] || 0) + (n == null ? 1 : n); pkQuestTick(); pkAchCheck(); }

// ---------------------------------------------------------------- クエスト（QST 100 ＋ PGQ 100）
const PK_QKIND = {"討伐":"kill", "収集":"collect", "スカウト":"scout", "配合":"breed", "探索":"explore", "格闘場":"arena", "転生":"reinc", "ドロップ":"drop", "カジノ":"casino", "イベント":"event", "音楽ゲーム":"music"};
function pkQDef(id){ return PK.Q[id] || PK.PQ[id] || null; }
function pkQTarget(q){ const o = q.objective || {}; return o.target_count != null ? o.target_count : (o.count != null ? o.count : 1); }
function pkQKindOf(q){ const o = q.objective || {}; return PK_QKIND[o.kind || o.type] || "kill"; }
function pkQRew(q){ const r = q.reward || {}; return {gold:r.gold || 0, coins:r.casino_coins || 0, item:r.item_id || ""}; }
function pkQProg(q){ const p = pkS(), st = p.q[q.id]; if(!st || st.st === "idle") return 0; return Math.max(0, Math.min(pkQTarget(q), (p.cnt[pkQKindOf(q)] || 0) - (st.base || 0))); }
function pkQState(q){ const st = pkS().q[q.id]; if(!st) return "new"; if(st.st === "act" && pkQProg(q) >= pkQTarget(q)) return "done"; return st.st; }
function pkQAccept(id){
    const p = pkS(), q = pkQDef(id); if(!q) return {ok:false, msg:"？"};
    const s = pkQState(q);
    if(s === "act" || s === "done") return {ok:false, msg:"もう うけている！"};
    if(s === "claimed" && !q.repeatable) return {ok:false, msg:"この いらいは クリアずみ です。"};
    const old = p.q[id]; p.q[id] = {st:"act", base:p.cnt[pkQKindOf(q)] || 0, times:(old && old.times) || 0};
    return {ok:true, msg:"『" + q.name + "』を うけた！"};
}
function pkQuestTick(){
    const p = pkS(); let n = 0;
    Object.keys(p.q).forEach((id) => { const q = pkQDef(id); if(q && p.q[id].st === "act" && pkQProg(q) >= pkQTarget(q)){ p.q[id].st = "done"; n++; if(window.toast) toast("クエスト達成！『" + q.name + "』"); } });
    return n;
}
function pkQClaim(id){
    const p = pkS(), q = pkQDef(id); if(!q) return {ok:false, msg:"？"};
    pkQuestTick();
    if(p.q[id] && p.q[id].st !== "done") return {ok:false, msg:"まだ たっせい していない。"};
    if(!p.q[id]) return {ok:false, msg:"うけていない。"};
    const r = pkQRew(q), lines = [];
    if(r.gold){ S_gold(r.gold); lines.push(r.gold.toLocaleString() + "G"); }
    if(r.coins){ pkAddCoins(r.coins); lines.push(r.coins.toLocaleString() + "コイン"); }
    if(r.item && PK.I[r.item]){ pkGive(r.item, 1); lines.push(PK.I[r.item].name); }
    p.q[id] = {st:"claimed", base:0, times:(p.q[id].times || 0) + 1};
    pkAchCheck();
    return {ok:true, msg:"ほうしゅうを うけとった！ " + lines.join("・")};
}
function pkQSummary(){ const p = pkS(), all = PK.L.quests.concat(PK.L.pgquests); let done = 0, act = 0; all.forEach((q) => { const st = p.q[q.id]; if(st && st.times > 0) done++; if(pkQState(q) === "act") act++; }); return {done, act, total:all.length}; }

// ---------------------------------------------------------------- 休憩所（ラボの おねえさん）
RPG_EV.pk_rest = [["say", "休憩所の おねえさん", "いらっしゃいませ。のろいを とく のも、たおれた なかまを ふっかつさせる のも、レベル×10ゴールドです。"], ["pkcall", "pkOpenRest", ""]];
(function(){ const m = RPG_MAPS.lab; if(m && !m.objs.some((o) => o.id === "pkrest")) m.objs.push({k:"npc", id:"pkrest", x:7, y:6, look:"momone", name:"休憩所の おねえさん", ev:"pk_rest"}); })();
function pkOpenRest(){ const u = pkUI(); u.restOnly = true; u.tab = "rest"; u.page = 0; u.msg = ""; u.game = null; u.from = "map"; u.ret = true; u.open = true; if(!PK.ready) pkLoad(); }

// ---------------------------------------------------------------- イベント回想
(function(){   // すべての会話イベントの先頭に「見た」目印を入れる（本編の動きは変えない）
    if(typeof RPG_EV === "undefined") return;
    Object.keys(RPG_EV).forEach((k) => { const a = RPG_EV[k]; if(Array.isArray(a) && !(a[0] && a[0][0] === "pkev")) a.unshift(["pkev", k]); });
})();
function pkEvSeen(id){
    if(G.pkReplay) return;
    const p = pkS(); if(p.ev[id]) { p.ev[id].n++; return; }
    p.ev[id] = {n:1, t:G.S.play || 0}; p.cnt.event++;
    try{ pkQuestTick(); }catch(_e){}
}
function pkSan(steps, depth){
    const out = []; depth = depth || 0;
    (steps || []).forEach((op) => {
        const k = op[0];
        if(k === "say" || k === "bg" || k === "flash") out.push(op);
        else if(k === "choice") out.push(["choice", (op[1] || []).map((c) => [c[0], pkSan(c[1], depth)])]);
        else if(k === "if") out.push(["if", op[1], pkSan(op[2], depth), pkSan(op[3], depth)]);
        else if(k === "pick") out.push(["pick", (op[1] || []).map((a) => pkSan(a, depth))]);
        else if(k === "run" && depth < 6 && RPG_EV[op[1]]) pkSan(RPG_EV[op[1]], depth + 1).forEach((x) => out.push(x));
    });
    return out;
}
function pkEvTitle(id){
    const a = PK_DLC_SCENES[id] || RPG_EV[id]; if(!a) return id;
    const f = pkFirstSay(a); return f ? Array.from(f.replace(/\s+/g, "")).slice(0, 18).join("") + "…" : id;
}
function pkFirstSay(steps, d){
    d = d || 0; if(d > 4) return "";
    for(const op of steps || []){
        if(op[0] === "say") return rpgFmt(op[2]);
        if(op[0] === "if"){ const r = pkFirstSay(op[2], d + 1) || pkFirstSay(op[3], d + 1); if(r) return r; }
        if(op[0] === "run" && RPG_EV[op[1]]){ const r = pkFirstSay(RPG_EV[op[1]], d + 1); if(r) return r; }
    }
    return "";
}
function pkEventList(){
    const p = pkS();
    const ids = Object.keys(RPG_EV).filter((k) => pkSan(RPG_EV[k]).some((o) => o[0] === "say")).concat(Object.keys(PK_DLC_SCENES));
    return ids.map((id) => ({id, seen:!!p.ev[id], n:p.ev[id] ? p.ev[id].n : 0, title:p.ev[id] ? pkEvTitle(id) : "？？？（まだ みていない）"}));
}
function pkReplay(id){
    const p = pkS(); if(!p.ev[id]) return {ok:false, msg:"まだ みていない イベントです。"};
    const src = PK_DLC_SCENES[id] || RPG_EV[id]; if(!src) return {ok:false, msg:"？"};
    const san = pkSan(src); if(!san.some((o) => o[0] === "say")) return {ok:false, msg:"さいせい できる ばめんが ない。"};
    G.pkReplay = true; G.scripts = [{a:san, i:0}]; G.mode = "script"; G.pk = G.pk || {}; G.pk.open = false; pump();
    return {ok:true};
}
// pump() の おわりに よばれる（さいせいの おわり／探索のあとの もどり）
function pkPumpEnd(){
    if(G.pkReplay){ G.pkReplay = false; G.bg = ""; G.say = null; G.pk = G.pk || {}; G.pk.open = true; G.mode = "pack"; G.pk.tab = "ev"; render(); return true; }
    if(G.pk && G.pk.ret){ G.pk.ret = false; G.pk.msg = (G.pk.msg || ""); G.pk.open = true; G.say = null; G.mode = "pack"; tqAutoSave(); render(); return true; }
    return false;
}

// ---------------------------------------------------------------- 実績・称号
function pkSeenCount(){ return Object.keys(pkS().seen).length; }
function pkMagicAll(){ const lv = pkLv(), cr = G.S.pk.carry; return PK.L.spells.concat(PK.L.skills).every((x) => x.level_required <= lv || (cr && (cr.spells.includes(x.id) || cr.skills.includes(x.id)))); }
function pkCasHigh(id){ return !!(pkS().cas[id] && pkS().cas[id].high); }
const PK_ACH = [
    {id:"mon50", name:"モンスター見習い", desc:"モンスターを 50種 はっけん", f:() => pkSeenCount() >= 50, title:"みならい調教師"},
    {id:"mon200", name:"モンスター博士", desc:"モンスターを 200種 はっけん", f:() => pkSeenCount() >= 200, title:"モンスター博士"},
    {id:"mon550", name:"モンスター 550種 はっけん", desc:"図鑑の モンスターを ぜんぶ はっけん", f:() => pkSeenCount() >= 550, title:"モンスターマスター"},
    {id:"item30", name:"どうぐ集め", desc:"パックの どうぐを 30種 あつめる", f:() => Object.keys(pkS().itEver).length >= 30, title:""},
    {id:"item100", name:"アイテム 100種 収集", desc:"パックの どうぐを 100種 あつめる", f:() => Object.keys(pkS().itEver).length >= 100, title:"コレクター"},
    {id:"magic", name:"ぜんじゅもん・ぜんとくぎ", desc:"じゅもんと とくぎを すべて おぼえる", f:() => pkMagicAll(), title:"ことばの達人"},
    {id:"quest50", name:"依頼 50件 達成", desc:"クエストを 50件 クリア", f:() => pkQSummary().done >= 50, title:""},
    {id:"quest", name:"全クエスト達成", desc:"クエスト 200件を すべて クリア", f:() => pkQSummary().done >= 200, title:"ギルドの英雄"},
    {id:"cas1", name:"神経衰弱の名人", desc:"アイテム神経衰弱 上級を 時間内にクリア", f:() => pkCasHigh("CAS001"), title:""},
    {id:"cas2", name:"友披露の王", desc:"友披露で 1位に なる", f:() => pkCasHigh("CAS002"), title:""},
    {id:"cas3", name:"タイピング名人", desc:"タイピングで せいかくさ95%以上の 高スコア", f:() => pkCasHigh("CAS003"), title:""},
    {id:"cas4", name:"AREの達人", desc:"AREの達人で Sランク", f:() => pkCasHigh("CAS004"), title:""},
    {id:"casall", name:"カジノの申し子", desc:"カジノ 4ゲームすべてで 高評価", f:() => ["CAS001", "CAS002", "CAS003", "CAS004"].every(pkCasHigh), title:"カジノの申し子"},
    {id:"breed5", name:"配合の ひよっこ", desc:"配合を 5回 する", f:() => pkS().cnt.breed >= 5, title:""},
    {id:"reinc1", name:"はじめての転生", desc:"モンスターを 転生させる", f:() => pkS().cnt.reinc >= 1, title:"転生の使い手"},
    {id:"arena10", name:"格闘場の常連", desc:"格闘場で 10勝", f:() => pkS().cnt.arena >= 10, title:""},
    {id:"lv99", name:"レベル 99", desc:"レベルが 最大(99)に なる", f:() => G.S.lv >= PK_MAXLV, title:"レベルの頂"},
    {id:"dlcall", name:"追加コンテンツ 制覇", desc:"5つの 追加コンテンツを すべて クリア", f:() => PK.L.dlc.every((d) => d.chapters.every((c) => pkS().dlc[c.id] === "done")), title:"かんぜん制覇"}
];
function pkAchCheck(){
    if(!pkOk()) return []; const p = pkS(), got = [];
    PK_ACH.forEach((a) => {
        if(p.ach[a.id]) return; let ok = false; try{ ok = a.f(); }catch(_e){}
        if(ok){ p.ach[a.id] = 1; if(a.title && !p.titles.includes(a.title)) p.titles.push(a.title); got.push(a); if(window.toast) toast("実績かいほう！『" + a.name + "』"); }
    });
    return got;
}

// ---------------------------------------------------------------- 追加コンテンツ（DLC001〜005 / 全15章）
// 台詞はすべてオリジナル。クリア後だけ遊べる。報酬の受け取りは1章につき1回。
const PK_DLC_SCENES = {
    "dlc:DLC001-01":[["say", "", "ラボの ポストに、さし出し人のない 手紙が とどいていた。"], ["say", "", "『ARE を つくってくれて ありがとう。あの日の へんじ、ずっと まっていました。』"], ["say", "me", "…だれの 手紙だろう。でも、あたたかい 字だ。"], ["say", "アキト", "ははっ、ファンレターだな！ そういうときは、AREで 返事を かこう！"]],
    "dlc:DLC001-02":[["say", "", "旅を ともにした なかまたちを たずねて まわった。"], ["say", "ハルキ", "ここの コーヒーは、あの日と かわらない。おまえも のむか？"], ["say", "アキト", "ラボは 毎日 にぎやかだ！ 124機能 まで あと ちょっと だぞ！"], ["say", "海斗", "いつでも よんでくれ。おれは まだまだ 走れる！"]],
    "dlc:DLC001-03":[["say", "", "最後の 依頼人は、ひとりの ノイズだった。"], ["say", "", "「ぼくの へんじ、まだ とどいていない…」"], ["say", "me", "だいじょうぶ。いま、とどけに きたよ。"], ["say", "", "ノイズは ふわりと わらって、ひかりの つぶに なった。"]],
    "dlc:DLC002-01":[["say", "", "なつかしい 戦いの 記憶が よみがえる。"], ["say", "ハルキ", "本編の ボスと もう一度、か。今度は 手加減なしだ。"]],
    "dlc:DLC002-02":[["say", "", "「条件つきの 決戦だ。5ターン以内に 勝てるか？」"], ["say", "アキト", "よし、いっきに いくぞ！"]],
    "dlc:DLC002-03":[["say", "", "3人の 強敵が つづけて あらわれた！ 回復する ひまは ない！"], ["say", "me", "最後まで いくよ、みんな！"]],
    "dlc:DLC003-01":[["say", "", "コイヌネランドの 入園ゲートには、3つの なぞなぞが かかれていた。"], ["say", "", "ぜんぶ とけたら ゲートが ひらく らしい。"]],
    "dlc:DLC003-02":[["say", "", "園内の 4つの アトラクション（カジノの ゲーム）を ぜんぶ たのしもう！"]],
    "dlc:DLC003-03":[["say", "", "夜の パレードが はじまった。きらめく 光の 中、みたことのない 大きな かげが あらわれた！"], ["say", "me", "パレードの 主役は、きみか！"]],
    "dlc:DLC004-01":[["say", "", "ギルドの 依頼帳には、たくさんの 依頼が ならんでいる。"], ["say", "", "10件 こなせば、なにかが おきる 気がする。"]],
    "dlc:DLC004-02":[["say", "", "世界の あちこちに ちらばる 大切な 石碑。5つ あつめれば、記録が よみがえる。"]],
    "dlc:DLC004-03":[["say", "", "依頼を だしつづけていた 黒幕が、ついに すがたを あらわした！"], ["say", "me", "あなたが 最後の 依頼人だったんだね。"]],
    "dlc:DLC005-01":[["say", "", "配合研究所の 博士が わらう。「さあ、新しい いのちを つくってみよう！」"]],
    "dlc:DLC005-02":[["say", "", "格闘場の 頂点を めざして、仲間の モンスターが 立ちあがる！"]],
    "dlc:DLC005-03":[["say", "", "転生した モンスターの ひかりが まぶしい。きみは 転生の ひみつに ふれた。"]]
};
const PK_DLC_RULES = {
    "DLC001-01":{kind:"scene", rew:{gold:3000, it:{ITM005:2}}},
    "DLC001-02":{kind:"visit", need:3, rew:{gold:5000, it:{ITM008:3, ITM013:3}}},
    "DLC001-03":{kind:"boss", mon:"S-ボス系", lv:60, rew:{title:"その後の英雄", it:{ITM035:1, ITM006:2}, gold:10000}},
    "DLC002-01":{kind:"rematch", bosses:["gyutan", "panda", "anaun", "reindeer", "whale", "teddy"], medal:1, rew:{gold:8000, it:{ITM004:2}}},
    "DLC002-02":{kind:"limit", bosses:["spamking", "owl", "miraqueen"], turns:5, rew:{it:{ITM027:2}, gold:12000}},
    "DLC002-03":{kind:"chain", bosses:["whale", "teddy", "omega"], rew:{title:"連戦の覇者", coins:800, gold:20000}},
    "DLC003-01":{kind:"quiz", rew:{park:30, gold:3000}},
    "DLC003-02":{kind:"cond", text:"カジノの 4ゲームを それぞれ 1回 あそぶ", f:() => ["CAS001", "CAS002", "CAS003", "CAS004"].every((g) => pkS().cas[g] && pkS().cas[g].plays > 0), rew:{equip:"EQP031", gold:6000}},
    "DLC003-03":{kind:"boss", mon:"A-ボス系", lv:70, rew:{mon:"parade", title:"パレードの主役", coins:500}},
    "DLC004-01":{kind:"cond", text:"クエストを 10件 クリアする", f:() => pkQSummary().done >= 10, rew:{gold:20000, it:{ITM008:5, ITM028:3}}},
    "DLC004-02":{kind:"cond", text:"『大切な石碑』を 5こ あつめる", f:() => (pkS().it.ITM007 || 0) >= 5, take:{ITM007:5}, rew:{it:{ITM027:3}, gold:5000}},
    "DLC004-03":{kind:"boss", mon:"S-ARE軍隊系", lv:80, rew:{title:"依頼の達人", equip:"EQP046", gold:30000}},
    "DLC005-01":{kind:"cond", text:"配合を 1回 する", f:() => pkS().cnt.breed >= 1, rew:{it:{ITM024:3}, gold:4000}},
    "DLC005-02":{kind:"cond", text:"格闘場で Cランク以上の 優勝を する", f:() => ["C", "B", "A", "S"].some((r) => (pkS().arena[r] || 0) > 0), rew:{title:"格闘場トロフィー", coins:600}},
    "DLC005-03":{kind:"cond", text:"転生モンスターを 1種 はっけん する", f:() => Object.keys(pkS().seen).some((id) => Number(id.slice(3)) > 500), rew:{it:{ITM032:2}, title:"転生の探究者", gold:8000}}
};
PK_DLC_RULES.__quiz = [
    {q:"『ARE』は どう よむ？", c:["アレ", "エー・アール・イー", "アーレ"], a:0},
    {q:"このゲームの 合言葉は？", c:["そういうときは、AREだ！", "ARE ARE ARE", "はじめよう"], a:0},
    {q:"ARE かいはつラボは 西暦 何年？", c:["2030年", "1999年", "2100年"], a:0}
];
function pkDlcState(chId){ const v = pkS().dlc[chId]; return v || "new"; }
function pkDlcChapterOpen(d, i){ return i === 0 || pkS().dlc[d.chapters[i - 1].id] === "done"; }
function pkDlcGiveRew(rw){
    const lines = [], p = pkS();
    if(rw.gold){ S_gold(rw.gold); lines.push(rw.gold.toLocaleString() + "G"); }
    if(rw.coins){ pkAddCoins(rw.coins); lines.push(rw.coins.toLocaleString() + "コイン"); }
    if(rw.park){ p.parkCoin += rw.park; lines.push("パークコイン" + rw.park); }
    if(rw.it) Object.keys(rw.it).forEach((id) => { if(PK.I[id]){ pkGive(id, rw.it[id]); lines.push(PK.I[id].name + "×" + rw.it[id]); } });
    if(rw.equip && PK.EQ[rw.equip]){ pkGiveEquip(rw.equip); lines.push(PK.EQ[rw.equip].name); }
    if(rw.title){ if(!p.titles.includes(rw.title)) p.titles.push(rw.title); lines.push("称号『" + rw.title + "』"); }
    if(rw.mon){ const m = pkPickMon("A-ボス系", 3) || PK.L.monsters[0]; const r = pkAddMonster(m.id, 30, "dlc"); if(r.ok) lines.push(m.name + "（なかま）"); }
    if(rw.medal){ p.medals += rw.medal; lines.push("再戦メダル" + rw.medal); }
    return lines;
}
function pkPickMon(spec, salt){ const [rk, cat] = spec.split("-"); const l = (PK.byRank[rk] || []).filter((m) => m.category === cat && m.type === "通常モンスター"); return l.length ? l[(salt || 0) % l.length] : null; }
// 章を完了させる（報酬は1回だけ）
function pkDlcComplete(chId){
    const p = pkS(), rule = PK_DLC_RULES[chId]; if(!rule) return {ok:false, msg:"？"};
    if(p.dlc[chId] === "done") return {ok:false, msg:"この章は クリアずみ です。"};
    if(rule.take) Object.keys(rule.take).forEach((id) => pkTake(id, rule.take[id]));
    const lines = pkDlcGiveRew(Object.assign({}, rule.rew, rule.medal ? {medal:rule.medal} : {}));
    p.dlc[chId] = "done";
    const sid = "dlc:" + chId; if(PK_DLC_SCENES[sid] && !p.ev[sid]){ p.ev[sid] = {n:1, t:G.S.play || 0}; p.cnt.event++; }
    pkQuestTick(); pkAchCheck();
    return {ok:true, msg:"章クリア！ ほうしゅう：" + lines.join("・")};
}
function pkDlcWin(chId){ const r = pkDlcComplete(chId); G.pk = G.pk || {}; G.pk.msg = (r.msg || ""); }
// つよい ボスを 登録（本編の ボスの つよさを レベルに あわせて 作りなおす）
function pkRegBoss(id, mult, lvOverride){
    const f = RPG_FOES[id]; if(!f) return null;
    const lv = Math.max(20, Math.min(PK_MAXLV, lvOverride || pkLv())), b = tqBossStat(lv), key = "pk:boss:" + id + ":" + lv + ":" + mult;
    RPG_FOES[key] = Object.assign({}, f, {hp:Math.round(b.hp * mult), atk:Math.round(b.atk * (0.85 + mult * 0.15)), def:b.def, exp:Math.round(b.exp * mult), g:Math.round(b.g * mult), boss:true, spar:false, say50:f.say50 || ""});
    return key;
}
// 挑戦する（ボス戦や、シーン）。ここから戦闘に入ることがある
function pkDlcStart(chId, arg){
    const p = pkS(), rule = PK_DLC_RULES[chId]; if(!rule) return {ok:false, msg:"？"};
    if(p.dlc[chId] === "done") return {ok:false, msg:"この章は クリアずみ です。"};
    const scene = PK_DLC_SCENES["dlc:" + chId] || [];
    G.pk = G.pk || {}; G.pk.ret = true; G.pk.open = false;
    const run = (steps) => { G.scripts = [{a:steps, i:0}]; G.mode = "script"; pump(); };
    const markSeen = () => { const sid = "dlc:" + chId; if(!p.ev[sid]){ p.ev[sid] = {n:1, t:G.S.play || 0}; p.cnt.event++; } };
    if(rule.kind === "scene"){ markSeen(); run(scene.concat([["pkcall", "pkDlcWin", chId]])); return {ok:true}; }
    if(rule.kind === "visit"){
        const list = ["haruki", "akito", "kaito", "n001", "mira"], v = p.flags.dlcVisit = p.flags.dlcVisit || {};
        if(arg && list.includes(arg)){ v[arg] = 1; }
        markSeen(); const lines = [["say", "", tqName(arg && RPG_CLASS[arg] ? arg : "hero") + " の ところへ いった。"]];
        const talk = {haruki:"ハルキ", akito:"アキト", kaito:"海斗", n001:"亜理紗", mira:"ミラ"}[arg] || "";
        lines.push(["say", talk, "あれから ARE は どんどん みんなの 役に たっている。{名前}の おかげだ！"]);
        const cnt = Object.keys(v).length; lines.push(["say", "", cnt >= rule.need ? "これで " + rule.need + "人に あえた！" : "あと " + (rule.need - cnt) + "人 たずねよう。"]);
        if(cnt >= rule.need) lines.push(["pkcall", "pkDlcWin", chId]); else lines.push(["pkcall", "pkNoop", ""]);
        run(scene.slice(0, 1).concat(lines)); return {ok:true};
    }
    if(rule.kind === "boss"){
        const m = pkPickMon(rule.mon, 0) || PK.L.monsters[0], key = pkRegFoe(m.id, rule.lv);
        RPG_FOES[key].boss = true; markSeen(); p.seen[m.id] = 1;
        battleStart([key], scene.concat([["say", "", "たおした…！"], ["pkcall", "pkDlcWin", chId]]));
        // 戦闘が始まる前に scene を見せたいので、いったん表示してから戦う
        return {ok:true};
    }
    if(rule.kind === "rematch" || rule.kind === "limit"){
        const id = arg && rule.bosses.includes(arg) ? arg : rule.bosses[0]; const key = pkRegBoss(id, rule.kind === "limit" ? 1.2 : 1.5); if(!key) return {ok:false, msg:"？"};
        markSeen(); G.pk.limit = rule.turns ? {ch:chId, turns:rule.turns} : null;
        battleStart([key], [["say", "", RPG_FOES[id].n + " に しょうり！"], ["pkcall", "pkDlcWin", chId]]);
        if(rule.turns) G.b.pkLimit = rule.turns;
        return {ok:true};
    }
    if(rule.kind === "chain"){
        const ks = rule.bosses.map((id) => pkRegBoss(id, 1.1)); markSeen();
        const win = [["say", "", "れんせんを ぬけた！"], ["pkcall", "pkDlcWin", chId]];
        battleStart([ks[0]], [["battle", [ks[1]], [["battle", [ks[2]], win]]]]);
        return {ok:true};
    }
    if(rule.kind === "quiz"){ G.pk.quiz = {i:0, ok:0, ch:chId}; G.mode = "pack"; G.pk.open = true; G.pk.tab = "dlc"; G.pk.ret = false; render(); return {ok:true}; }
    return {ok:false, msg:"？"};
}
function pkNoop(){}
function pkDlcQuizAnswer(i){
    const qz = G.pk.quiz, Q = PK_DLC_RULES.__quiz; if(!qz) return {ok:false, msg:"？"};
    const right = Q[qz.i].a === i; if(right) qz.ok++; qz.i++;
    if(qz.i >= Q.length){ const ok = qz.ok; const ch = qz.ch; G.pk.quiz = null; if(ok >= 2){ const r = pkDlcComplete(ch); return {ok:true, end:true, msg:"せいかい " + ok + "/" + Q.length + "！ ゲートが ひらいた！\n" + r.msg}; } return {ok:true, end:true, msg:"せいかい " + ok + "/" + Q.length + "…。もう一度 ちょうせんしよう！"}; }
    return {ok:true, msg:right ? "せいかい！" : "ざんねん…"};
}
// 「制限付き決戦」：5ターンを こえたら しっぱい
(function(){
    const _rd = roundEnd;
    roundEnd = function(){
        const b = G.b;
        if(b && b.pkLimit && foesAlive().length > 0 && b.turn >= b.pkLimit){ bLog("じかんぎれ…！ 5ターン いない という じょうけんに まにあわなかった。"); b.text = b.log.slice(-6).join("\n"); b.pkLimit = 0; b.busy = false; endBattle("run"); return; }
        _rd();
    };
})();

// ---------------------------------------------------------------- 強くてニューゲーム
function pkNgPreview(){ const S = G.S; return {name:S.name, lv:S.lv, spells:pkSpellsKnown().length, skills:pkSkillsKnown().length, ngp:pkS().ngp}; }
function pkNgStart(slot){
    const S = G.S; if(!pkOpen()) return {ok:false, msg:"本編を クリアすると えらべます。"};
    if(!(slot >= 1 && slot <= TQ_SLOTS)) return {ok:false, msg:"枠を えらんでね。"};
    if(slot === G.slot) return {ok:false, msg:"いま あそんでいる 冒険の書には 上書きできません。（元の データを まもるため）"};
    tqAutoSave();
    const prof = JSON.parse(JSON.stringify(S.prof || {name:S.name, sex:S.sex}));
    const n = tqNewState(prof); n.lv = S.lv; n.exp = 0;
    n.pk = {ver:1, ngp:(S.pk.ngp || 0) + 1, carry:{lv:S.lv, spells:pkSpellsKnown().map((x) => x.id), skills:pkSkillsKnown().map((x) => x.id)}};
    const keepS = G.S, keepSlot = G.slot, keepName = G.saveName;
    G.S = n; pkS(); tqClamp(); tqHealAll();
    const r = tqSaveTo(slot, S.name + "の強くてニューゲーム");
    G.S = keepS; G.slot = keepSlot; G.saveName = keepName;
    return r.ok ? {ok:true, msg:"冒険の書 " + slot + " に 強くてニューゲームを つくった！ Lv" + n.lv + " からスタート。元の データは そのままです。", slot} : r;
}
function pkNgEnter(slot){ const r = tqLoadFrom(slot); if(!r.ok) return r; enterGame("強くてニューゲーム！ Lv" + G.S.lv + " から はじまる。"); return r; }

// ---------------------------------------------------------------- プレゼントコード（本体は pack-codes.js に「指紋」だけ）
const PK_CODE_REWARDS = {
    g01:{coins:1000}, g02:{gold:50000}, g03:{it:{ITM006:3, ITM004:3}}, g04:{it:{ITM024:3}}, g05:{it:{ITM025:5}}, g06:{coins:5000},
    g07:{title:"はじまりの仲間"}, g08:{it:{ITM027:3}}, g09:{it:{ITM016:5}}, g10:{gold:200000}
};
function pkCodeTry(raw){
    if(!pkOk()) return {ok:false, msg:"データが まだ よみこまれていません。"};
    const n = tqNorm(raw); if(!n) return {ok:false, msg:"コードを いれてね。"};
    const h = tqStretch("gift|" + n), e = (typeof PK_CODES !== "undefined" ? PK_CODES : []).find((x) => x[0] === h);
    if(!e) return {ok:false, msg:"そんな コードは みつかりません。"};
    const p = pkS(); if(p.codes[e[1]]) return {ok:false, msg:"この コードは もう つかっています。"};
    const lines = pkDlcGiveRew(PK_CODE_REWARDS[e[1]] || {}); p.codes[e[1]] = 1; pkAchCheck();
    return {ok:true, msg:"プレゼントを うけとった！ " + lines.join("・")};
}

// ---------------------------------------------------------------- バックアップ（文字列でコピー／貼りつけ）
function pkBackupExport(){
    const o = {tq:1, at:tqNow(), slots:{}};
    for(let i = 1; i <= TQ_SLOTS; i++){ const r = tqReadSlot(i); if(r && !r.corrupted) o.slots[i] = r; }
    return "TQBK1:" + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}
function pkBackupImport(text, onlySlot){
    const t = String(text || "").trim(); if(!t.startsWith("TQBK1:")) return {ok:false, msg:"バックアップの 文字列では ありません。"};
    let o; try{ o = JSON.parse(decodeURIComponent(escape(atob(t.slice(6))))); }catch(_e){ return {ok:false, msg:"よみこめませんでした。（こわれています）"}; }
    if(!o || o.tq !== 1 || !o.slots) return {ok:false, msg:"バックアップの かたちが ちがいます。"};
    let n = 0;
    for(const k of Object.keys(o.slots)){
        const i = Number(k), r = o.slots[k]; if(!(i >= 1 && i <= TQ_SLOTS) || (onlySlot && Number(onlySlot) !== i)) continue;
        if(!r || !r.data || r.data.v !== 3 || !RPG_MAPS[r.data.map]) return {ok:false, msg:"枠 " + i + " の データが ただしくありません。ひとつも 書きかえて いません。"};
    }
    for(const k of Object.keys(o.slots)){ const i = Number(k); if(onlySlot && Number(onlySlot) !== i) continue; if(tqWriteSlot(i, o.slots[k])) n++; }
    return n ? {ok:true, msg:n + "つの 冒険の書を ふっかつ しました。"} : {ok:false, msg:"ふっかつ できる データが ありません。"};
}

// ---------------------------------------------------------------- 追加チート（オフライン専用。指紋は pack-codes.js）
(function(){
    const _ac = tqApplyCheat;
    tqApplyCheat = function(raw){
        const f = tqFindCheat(raw);
        if(!f || !/^pk_/.test(f.id) || !G.S) return _ac(raw);
        if(!PK.ready) return {ok:false, msg:"追加パックの データを よみこみ中です。すこし まって もう一度！"};
        const S = G.S, p = pkS(); let msg = "";
        switch(f.id){
            case "pk_open": S.f.e_future = 1; S.f.xr_open = 1; msg = "クリア後の せかいが ひらいた！（追加コンテンツ）"; break;
            case "pk_coins": if(!(f.nums[0] > 0)) return {ok:false, msg:"まいすうを 指定してください。"}; pkAddCoins(f.nums[0]); msg = "🪙 " + f.nums[0] + " コインを てにいれた！"; break;
            case "pk_items": PK.L.items.forEach((it) => { p.it[it.id] = 99; p.itEver[it.id] = 1; }); msg = "パックの どうぐが ぜんぶ 99こ に なった！"; break;
            case "pk_equip": PK.L.equipment.forEach((e) => { p.eqOwn[e.id] = 1; }); msg = "パックの そうび100しゅを ぜんぶ てにいれた！"; break;
            case "pk_dex": PK.L.monsters.forEach((m) => { p.seen[m.id] = 1; }); msg = "モンスターずかんが ぜんぶ うまった！"; break;
            case "pk_mons": { let n = 0; for(const m of PK.L.monsters.filter((x) => pkScoutable(x.id)).slice(0, 30)){ if(n >= 10) break; if(pkAddMonster(m.id, 10, "cheat").ok) n++; } msg = n + "たいの モンスターが ぼくじょうに きた！"; break; }
            case "pk_quest": PK.L.quests.concat(PK.L.pgquests).forEach((q) => { if(!p.q[q.id] || p.q[q.id].st !== "claimed") p.q[q.id] = {st:"done", base:0, times:(p.q[q.id] && p.q[q.id].times) || 0}; }); msg = "ぜんぶの クエストが たっせい じょうたいに なった！（クエストで うけとろう）"; break;
            case "pk_magic": p.flags.magicAll = 1; msg = "クリア後の じゅもん・とくぎも かいほうされた！"; break;
            default: return _ac(raw);
        }
        pkAchCheck(); tqAutoSave(); return {ok:true, msg};
    };
})();
