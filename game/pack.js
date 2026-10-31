"use strict";
// ===== ARE QUEST 追加コンテンツパック（クリア後の世界）=====
// 1) データ読み込み（game/pack/*.json）  2) 状態 S.pk  3) 装備・どうぐ・じゅもん・とくぎ  4) 戦闘へのつなぎ
// ※ 本編ストーリーは変えない。クリア後（S.f.e_future）に解放される。最大レベルは 99。
const PK = {ready:false, err:"", loading:null, L:{}, I:{}, SP:{}, SK:{}, EQ:{}, MON:{}, Q:{}, PQ:{}, PR:{}, GM:{}, DLC:{}, rate:5, byRank:{}, byCat:{}};
const PK_SRC = [["items", "items.json", 100, "items"], ["spells", "spells.json", 100, "spells"], ["skills", "skills.json", 100, "skills"], ["equipment", "equipment.json", 100, "equipment"],
    ["monsters", "monsters.json", 550, "monsters"], ["quests", "quests.json", 100, "quests"], ["pgquests", "pgquests.json", 100, "quests"], ["games", "casino.json", 4, "games"],
    ["prizes", "prizes.json", 15, "prizes"], ["dlc", "dlc.json", 5, "contents"], ["systems", "systems.json", 9, "systems"]];
const PK_SLOTS = ["武器", "鎧", "盾", "兜", "腕輪"];
const PK_RANKS = ["G", "F", "E", "D", "C", "B", "A", "S"];
const PK_TIER = {G:0.7, F:0.9, E:1.15, D:1.45, C:1.85, B:2.4, A:3.1, S:4.0};
const PK_MAXLV = 99;

// ---------------------------------------------------------------- 読み込み
function pkLoad(base){
    if(PK.loading) return PK.loading;
    const dir = base || "./pack/";
    PK.loading = Promise.all(PK_SRC.map((s) => fetch(dir + s[1], {cache:"no-cache"}).then((r) => { if(!r.ok) throw new Error(s[1] + " を読めません(" + r.status + ")"); return r.json(); }).then((j) => {
        const arr = j[s[3]];
        if(!Array.isArray(arr) || arr.length !== s[2]) throw new Error(s[1] + "：件数が " + s[2] + " ではありません(" + (arr ? arr.length : "データなし") + ")");
        PK.L[s[0]] = arr;
        if(s[0] === "games" && j.exchange_rate && j.exchange_rate.gold_per_coin) PK.rate = j.exchange_rate.gold_per_coin;
    }))).then(() => { pkIndex(); PK.ready = true; PK.err = ""; }).catch((e) => { PK.ready = false; PK.err = String(e && e.message || e); });
    return PK.loading;
}
// Node／テスト用：JSONを直接わたす
function pkLoadFrom(obj){
    PK_SRC.forEach((s) => { const arr = obj[s[0]]; if(!Array.isArray(arr) || arr.length !== s[2]) throw new Error(s[0] + " の件数が違います"); PK.L[s[0]] = arr; });
    pkIndex(); PK.ready = true; PK.err = "";
}
function pkCounts(){ const o = {}; PK_SRC.forEach((s) => { o[s[0]] = (PK.L[s[0]] || []).length; }); return o; }

const PK_EMO = {"食べ物系":["🍙", "🍕", "🍔", "🍩", "🍰", "🍜", "🍣", "🥐", "🍎", "🍓", "🌽", "🧁"], "魚系":["🐟", "🐠", "🐡", "🦈", "🐙", "🦑", "🦀", "🐬", "🐳", "🦐"], "花系":["🌸", "🌻", "🌷", "🌹", "🌼", "🍀", "🌺", "🪻", "🌿"],
    "装備系":["🛡️", "⚔️", "🪖", "👑", "🥋", "🧤", "🏹", "🔱"], "ARE系":["💾", "📱", "💻", "🖥️", "📡", "🔌", "🕹️", "⌨️"], "ARE軍隊系":["🪖", "🎖️", "🚩", "🛰️", "🛠️", "⚙️", "🚀"], "ボス系":["👹", "🐲", "🦖", "🦅", "👾", "🐉", "🦁"], "転生系":["✨", "🌟", "💫", "🔮", "🌈", "🪄", "☄️"]};
function pkHash(s){ let h = 11; for(const c of String(s)) h = (h * 33 + c.codePointAt(0)) % 1000003; return h; }

function pkIndex(){
    const L = PK.L;
    PK.I = {}; PK.SP = {}; PK.SK = {}; PK.EQ = {}; PK.MON = {}; PK.Q = {}; PK.PQ = {}; PK.PR = {}; PK.GM = {}; PK.DLC = {}; PK.byRank = {}; PK.byCat = {};
    L.items.forEach((x) => { PK.I[x.id] = x; });
    L.spells.forEach((x) => { x._k = pkSpellKind(x); PK.SP[x.id] = x; });
    L.skills.forEach((x) => { x._k = pkSkillKind(x); PK.SK[x.id] = x; });
    L.equipment.forEach((x) => { x._st = pkEquipCalc(x); PK.EQ[x.id] = x; });
    L.monsters.forEach((x) => {
        x._e = (PK_EMO[x.category] || PK_EMO["食べ物系"])[pkHash(x.id) % (PK_EMO[x.category] || PK_EMO["食べ物系"]).length];
        PK.MON[x.id] = x; (PK.byRank[x.rank] = PK.byRank[x.rank] || []).push(x); (PK.byCat[x.category] = PK.byCat[x.category] || []).push(x);
    });
    L.quests.forEach((x) => { PK.Q[x.id] = x; }); L.pgquests.forEach((x) => { PK.PQ[x.id] = x; });
    L.games.forEach((x) => { PK.GM[x.id] = x; }); L.dlc.forEach((x) => { PK.DLC[x.id] = x; });
    // 景品の item_id は名前とズレているものがある → 名前が合う道具を優先して引き当てる
    const byName = {}; L.items.forEach((x) => { if(!(x.name in byName)) byName[x.name] = x.id; });
    L.prizes.forEach((x) => {
        let iid = x.item_id; const it = iid && (PK.I[iid] || PK.EQ[iid]);
        if(!it || (it.name !== x.name && x.category !== "装備" && byName[x.name])) iid = byName[x.name] || iid;
        x._iid = iid; PK.PR[x.id] = x;
    });
}

// ---------------------------------------------------------------- 状態 S.pk
function pkS(){
    const S = G.S; if(!S) return null;
    const p = S.pk = S.pk || {};
    const D = {ver:1, coins:0, it:{}, itEver:{}, eqOwn:{}, eqSet:{}, seen:{}, kill:{}, drops:{}, scout:{}, stable:[], uid:1, comp:null, q:{}, pq:{}, ev:{}, ach:{}, titles:[], title:"", cas:{}, bought:{}, codes:{}, ngp:0,
        dlc:{}, buff:{exp:0, atk:0, def:0}, lastTown:null, cnt:{kill:0, collect:0, scout:0, breed:0, explore:0, arena:0, reinc:0, drop:0, casino:0, event:0, music:0}, arena:{}, flags:{}, carry:null, medals:0, parkCoin:0, mats:0};
    Object.keys(D).forEach((k) => { if(p[k] === undefined) p[k] = D[k]; });
    Object.keys(D.cnt).forEach((k) => { if(typeof p.cnt[k] !== "number") p.cnt[k] = 0; });
    Object.keys(D.buff).forEach((k) => { if(typeof p.buff[k] !== "number") p.buff[k] = 0; });
    if(!p.lastTown && PK_TOWNS[S.map]) p.lastTown = {map:S.map, x:S.x, y:S.y};
    return p;
}
function pkOpen(){ const S = G.S; return !!(S && S.f && S.f.e_future); }
// ===== 段階ごとの かいほう（マップを クリアするたびに ひらく） =====
// 0=はじめから／1=地図1(ホシミ台)クリア／2=地図2(アカリ市)クリア／3=地図3(運命開発ビル)クリア／4=地図4(まっしろルーム)クリア／5=ほんぺん クリア
const PK_STAGE_NAME = ["", "地図1（ホシミ台）", "地図2（アカリ市）", "地図3（運命開発ビル）", "地図4（まっしろルーム）", "本編"];
function pkStage(){
    const S = G.S; if(!S || !S.f) return 0; const f = S.f;
    if(f.e_future) return 5;
    if(f.e_labn || f.e_xmas || f.e_white || f.e_n8 || f.e_n9 || f.e_n10 || f.e_n11 || f.e_xr) return 4;
    if(S.pk && S.pk.ngp > 0) return 4;                                   // 強くてニューゲームの 周回は ひらいたまま
    if(f.e_tokyo || f.tw_done) return 3;
    if(f.ap_done) return 2;
    if(f.e_sendai || f.sn_done) return 1;
    return 0;
}
function pkGate(n){ return n <= 0 || pkStage() >= n; }
function pkGateMsg(n){ return "🔒 " + (PK_STAGE_NAME[n] || "本編") + " を クリアすると ひらきます。"; }
// 呪文・とくぎ：本編の時点で 90こ（SPL001〜090 / SKL001〜090）、のこり10こ（091〜100）は クリア後（強くてニューゲームの引きつぎも クリア後あつかい）
function pkAvail(){ return !!(PK.ready && G.S); }
const PK_STORY_MAGIC = 90;
function pkMagicOpen(d){ const n = Number(d.id.slice(3)); if(n <= PK_STORY_MAGIC) return true; const S = G.S; return !!(S && ((S.f && S.f.e_future) || (S.pk && (S.pk.carry || (S.pk.flags && S.pk.flags.magicAll))))); }
function pkOk(){ return !!(PK.ready && G.S); }
function pkLv(){ return Math.min(PK_MAXLV, G.S.lv); }

// ---------------------------------------------------------------- 町・城の記録（瞬間移動の行き先）
const PK_TOWNS = {lab:"ARE かいはつラボ", sendai:"ホシミ台の街", tokyo:"夜のアカリ市", aprt:"蒼太の部屋", xmas:"クリスマスのアカリ市", base:"紘の秘密基地", n10:"サーバー城", future:"ARE タワー"};
(function(){
    const _goto = gotoMap;
    gotoMap = function(map, x, y){ _goto(map, x, y); try{ if(PK_TOWNS[map] && G.S){ pkS().lastTown = {map, x, y}; } }catch(_e){} };
})();
function pkWarpTown(){
    const S = G.S, p = pkS(), t = p.lastTown;
    if(!t || !RPG_MAPS[t.map]) return {ok:false, msg:"まだ きろくした 町や 城が ない。瞬間移動は つかえない！"};
    return {ok:true, t};
}
function pkDoWarp(){
    const r = pkWarpTown(); if(!r.ok) return r;
    G.scripts.length = 0; G.pk && (G.pk.open = false);
    gotoMap(r.t.map, r.t.x, r.t.y);
    G.mode = "map"; G.bg = "";
    if(G.scripts.length){ G.mode = "script"; pump(); } else render();
    return {ok:true, msg:PK_TOWNS[r.t.map] + " へ 瞬間移動した！"};
}

// ---------------------------------------------------------------- 装備
function pkEquipCalc(e){
    // ムテキ（主人公の最強装備）は 攻撃力200。ダルい（ハルキ専用の呪い装備）は それにつぐ つよさ
    const fixed = {EQP001:[200, 0], EQP002:[0, 150], EQP003:[0, 125], EQP004:[0, 100], EQP005:[0, 90], EQP006:[180, 0], EQP007:[0, 130], EQP008:[0, 108], EQP009:[0, 88], EQP010:[0, 78]};
    if(fixed[e.id]) return {atk:fixed[e.id][0], def:fixed[e.id][1]};
    const lv = Math.max(1, Math.min(99, e.level_required || 1)), v2 = /・\d+$/.test(e.name) ? 1.15 : 1;
    if(e.slot === "武器") return {atk:Math.round((6 + lv * 2.6) * v2), def:0};
    const mul = {鎧:1, 盾:0.8, 兜:0.6, 腕輪:0.5}[e.slot] || 0.5;
    return {atk:0, def:Math.round((3 + lv * 1.3) * mul * v2)};
}
function pkEqOf(id){ const p = pkS(); return (p.eqSet[id] = p.eqSet[id] || {}); }
function pkEqCursed(e, charId){ return !!(e && e.cursed && e.curse_immune_character && !(e.curse_immune_character === "ハルト" && charId === "haruki") && e.curse_immune_character !== (charId === "hero" ? G.S.name : tqName(charId))); }
function pkEquipBonus(id){
    const S = G.S; if(!S || !S.pk || !PK.ready) return {atk:0, def:0, curse:false};
    const set = (S.pk.eqSet || {})[id] || {}; let atk = 0, def = 0, curse = false;
    PK_SLOTS.forEach((sl) => { const e = PK.EQ[set[sl]]; if(!e) return; if(pkEqCursed(e, id)) curse = true; else { atk += e._st.atk; def += e._st.def; } });
    return {atk, def, curse};
}
function pkCanEquip(e, charId){
    if(!e) return "そうびが ありません。";
    if(G.S.lv < (e.level_required || 1)) return "レベル" + e.level_required + " から そうびできる。";
    return "";
}
function pkEquip(charId, eqId){
    const p = pkS(), e = PK.EQ[eqId]; if(!e || !p.eqOwn[eqId]) return {ok:false, msg:"もっていない そうびです。"};
    const err = pkCanEquip(e, charId); if(err) return {ok:false, msg:err};
    const set = pkEqOf(charId), cur = PK.EQ[set[e.slot]];
    if(cur && cur.cursed && pkEqCursed(cur, charId) && cur.id !== eqId) return {ok:false, msg:"のろいで " + cur.name + " が はずれない！（かいじゅふだ が ひつよう）"};
    // 同じ装備を別のキャラが着ていたら、そちらから外す
    p.eqOwn[eqId] = 1;
    Object.keys(p.eqSet).forEach((cid) => { if(cid !== charId && p.eqSet[cid][e.slot] === eqId) delete p.eqSet[cid][e.slot]; });
    set[e.slot] = eqId; tqClamp();
    return {ok:true, msg:e.name + " を そうびした！" + (pkEqCursed(e, charId) ? "…のろわれて しまった！（のうりょくが さがる）" : "")};
}
function pkUnequip(charId, slot){
    const set = pkEqOf(charId), e = PK.EQ[set[slot]]; if(!e) return {ok:false, msg:"なにも そうびしていない。"};
    if(pkEqCursed(e, charId)){
        const cure = pkCureId();
        if(!cure) return {ok:false, msg:"のろいで はずれない！（休憩所で " + pkRestCost().toLocaleString() + "G、または かいじゅふだ）"};
        pkTake(cure, 1);
    }
    delete set[slot]; tqClamp(); return {ok:true, msg:e.name + " を はずした。"};
}
function pkCureId(){ const p = pkS(); const id = ["ITM020", "ITM050", "ITM080"].find((x) => (p.it[x] || 0) > 0); return id || ""; }
function pkGiveEquip(eqId){
    const p = pkS(), e = PK.EQ[eqId]; if(!e) return false;
    if(p.eqOwn[eqId]){ const g = Math.floor(5 * Math.max(10, e.level_required * 20)); G.S.gold = Math.min(TQ_MAX_GOLD, G.S.gold + g); return "dup:" + g; }
    p.eqOwn[eqId] = 1; return true;
}

// ---------------------------------------------------------------- どうぐ
const PK_BUFFS = {ITM001:["exp", 30, "けいけんち 2倍"], ITM002:["atk", 30, "こうげき 2倍"], ITM003:["def", 30, "ぼうぎょ 2倍"]};
function pkGive(id, n){
    const p = pkS(); const it = PK.I[id]; if(!it) return 0; n = n || 1;
    p.it[id] = Math.min(it.stack_limit || 99, (p.it[id] || 0) + n); p.itEver[id] = 1;
    if(it.category === "収集") p.cnt.collect += n;
    return n;
}
function pkTake(id, n){ const p = pkS(); n = n || 1; if((p.it[id] || 0) < n) return false; p.it[id] -= n; if(p.it[id] <= 0) delete p.it[id]; return true; }
function pkItemKind(it){
    if(PK_BUFFS[it.id]) return {k:"buff", w:PK_BUFFS[it.id][0], n:PK_BUFFS[it.id][1]};
    if(it.id === "ITM004") return {k:"revive"};
    if(it.id === "ITM005") return {k:"healAliveAll"};
    if(it.id === "ITM006") return {k:"healAllRevive"};
    if(it.category === "回復") return {k:"heal", amt:Math.round(30 + it.sell_price * 0.5)};
    if(it.category === "強化") return {k:"buff2", n:10};
    return {k:"none"};
}
function pkItemUsable(it, inBattle){ const k = pkItemKind(it).k; if(k === "none") return false; return inBattle ? !!it.usable_in_battle : !!it.usable_outside_battle; }
// どうぐを つかう（to = 対象キャラID）。結果の文を返す
function pkUseItem(id, to, inBattle){
    const S = G.S, p = pkS(), it = PK.I[id]; if(!it || !(p.it[id] > 0)) return {ok:false, msg:"もっていない！"};
    if(!pkItemUsable(it, inBattle)) return {ok:false, msg:it.name + " は ここでは つかえない。"};
    const k = pkItemKind(it), party = S.party, mmax = (cid) => tqStat(cid);
    if(k.k === "buff"){ if(p.buff[k.w] > 0){ return {ok:false, msg:"もう こうかが ついている！"}; } pkTake(id); p.buff[k.w] = k.n; return {ok:true, msg:it.name + "を つかった！ " + k.n + "回の たたかいの あいだ " + PK_BUFFS[id][2] + "！"}; }
    if(k.k === "buff2"){ if(p.buff.atk > 0 && p.buff.def > 0) return {ok:false, msg:"もう こうかが ついている！"}; pkTake(id); p.buff.atk = Math.max(p.buff.atk, k.n); p.buff.def = Math.max(p.buff.def, k.n); return {ok:true, msg:it.name + "を つかった！ " + k.n + "回の たたかいの あいだ ちからが わく！"}; }
    if(k.k === "revive"){ const cid = to; if(!S.m[cid] || S.m[cid].hp > 0) return {ok:false, msg:"たおれて いない！"}; pkTake(id); S.m[cid].hp = mmax(cid).maxhp; S.m[cid].mp = Math.max(S.m[cid].mp, 0); return {ok:true, msg:tqName(cid) + "は ぜんかいふくで ふっかつした！"}; }
    if(k.k === "healAliveAll"){ const al = party.filter((c) => S.m[c].hp > 0); if(!al.length || al.every((c) => S.m[c].hp >= mmax(c).maxhp && S.m[c].mp >= mmax(c).maxmp)) return {ok:false, msg:"かいふくの ひつようが ない！"}; pkTake(id); al.forEach((c) => { S.m[c].hp = mmax(c).maxhp; S.m[c].mp = mmax(c).maxmp; }); return {ok:true, msg:"いきている みんなの HPと MPが ぜんかいふく！"}; }
    if(k.k === "healAllRevive"){ pkTake(id); party.forEach((c) => { S.m[c].hp = mmax(c).maxhp; S.m[c].mp = mmax(c).maxmp; }); return {ok:true, msg:"みんなが ぜんかいふくして ふっかつした！"}; }
    if(k.k === "heal"){ const cid = to || "hero"; if(!S.m[cid] || S.m[cid].hp <= 0) return {ok:false, msg:"たおれていて つかえない！"}; const mx = mmax(cid); if(S.m[cid].hp >= mx.maxhp) return {ok:false, msg:"HPは まんたん だ！"}; pkTake(id); const b = S.m[cid].hp; S.m[cid].hp = Math.min(mx.maxhp, b + k.amt); return {ok:true, msg:tqName(cid) + "の HPが " + (S.m[cid].hp - b) + " かいふく！"}; }
    return {ok:false, msg:"つかえない"};
}
function pkSell(id, n){
    const p = pkS(), it = PK.I[id]; if(!it) return {ok:false, msg:"？"}; n = Math.min(n || 1, p.it[id] || 0); if(n <= 0) return {ok:false, msg:"もっていない！"};
    if(it.category === "キーアイテム" && false) return {ok:false, msg:"うれない"};
    pkTake(id, n); const g = it.sell_price * n; G.S.gold = Math.min(TQ_MAX_GOLD, G.S.gold + g); return {ok:true, msg:it.name + " ×" + n + " を " + g.toLocaleString() + "G で うった。"};
}

// ---------------------------------------------------------------- コイン
function pkGoldToCoin(coins){ coins = Math.floor(coins); const p = pkS(), cost = coins * PK.rate; if(coins <= 0) return {ok:false, msg:"1以上を いれてね。"}; if(G.S.gold < cost) return {ok:false, msg:"ゴールドが たりない！（" + cost.toLocaleString() + "G ひつよう）"}; G.S.gold -= cost; p.coins += coins; return {ok:true, msg:cost.toLocaleString() + "G を " + coins.toLocaleString() + " コインに かえた！"}; }
function pkCoinToGold(coins){ coins = Math.floor(coins); const p = pkS(); if(coins <= 0) return {ok:false, msg:"1以上を いれてね。"}; if(p.coins < coins) return {ok:false, msg:"コインが たりない！"}; const g = coins * PK.rate; if(G.S.gold + g > TQ_MAX_GOLD) return {ok:false, msg:"ゴールドが いっぱいになる！"}; p.coins -= coins; G.S.gold += g; return {ok:true, msg:coins.toLocaleString() + " コインを " + g.toLocaleString() + "G に かえた！"}; }
function pkAddCoins(n){ const p = pkS(); n = Math.max(0, Math.floor(n)); p.coins = Math.min(99999999, p.coins + n); return n; }
// 景品交換
function pkPrizeState(pr){
    const p = pkS(); if(pr.limit === "1回" && p.bought[pr.id]) return "こうかんずみ";
    if(p.coins < pr.coin_cost) return "コインが たりない"; return "";
}
const PK_MATS = ["薬草", "守りの種", "毒消し", "花の蜜", "回復ゼリー"];
function pkBuyPrize(prId){
    const p = pkS(), pr = PK.PR[prId]; if(!pr) return {ok:false, msg:"？"};
    const st = pkPrizeState(pr); if(st) return {ok:false, msg:st === "こうかんずみ" ? "この 景品は 1回だけ です。" : "コインが たりない！（" + pr.coin_cost.toLocaleString() + "コイン）"};
    let msg = "";
    if(pr.category === "装備"){ const r = pkGiveEquip(pr._iid); msg = (PK.EQ[pr._iid] || {name:pr.name}).name + " を てにいれた！"; if(typeof r === "string") msg = "もう もっているので " + r.slice(4) + "G に なった。"; }
    else if(pr.category === "称号"){ if(!p.titles.includes("カジノ王")) p.titles.push("カジノ王"); msg = "称号『カジノ王』を てにいれた！"; }
    else if(pr.category === "モンスター"){ const r = window.pkAddMonster ? pkAddMonster(pkContractMonster(), 20, "contract") : null; if(!r || !r.ok) return {ok:false, msg:(r && r.msg) || "けいやくできない"}; msg = r.msg; }
    else if(pr._iid && PK.I[pr._iid]){ pkGive(pr._iid, 1); msg = PK.I[pr._iid].name + " を てにいれた！"; }
    else if(pr.id === "PRZ015"){ const names = []; for(let i = 0; i < 3; i++){ const m = PK.L.items.filter((x) => x.category === "素材"); const it = m[Math.floor(G.rnd() * m.length)]; pkGive(it.id, 1); names.push(it.name); } msg = "強化装備素材セット：" + names.join("・") + " を てにいれた！"; }
    else return {ok:false, msg:"この景品は まだ よういできない"};
    p.coins -= pr.coin_cost; p.bought[pr.id] = (p.bought[pr.id] || 0) + 1; p.cnt.casino = p.cnt.casino; return {ok:true, msg};
}
function pkContractMonster(){ const l = (PK.byCat["ボス系"] || []).filter((m) => m.rank === "S"); return (l[0] || PK.L.monsters[0]).id; }

// ---------------------------------------------------------------- じゅもん・とくぎ（効果は effect の説明文から決める）
function pkSpellKind(s){
    const t = s.effect || "";
    if(s.category === "移動" || /移動する/.test(t)) return {k:"warp"};
    let m;
    if(/HP全回復/.test(t)) return {k:"heal", full:true, all:/味方全員/.test(t)};
    if((m = t.match(/HPを?約?(\d+)回復/))) return {k:"heal", amt:Number(m[1]), all:/味方全員/.test(t)};
    if(/味方全体を補助/.test(t)) return {k:"buff", all:true, who:"party"};
    if(/味方単体を補助|味方の能力を上げる/.test(t)) return {k:"buff", all:false, who:"party"};
    if(/敵の能力を下げる/.test(t)) return {k:"debuff"};
    if(/敵全体に.*ダメージ/.test(t)) return {k:"dmg", all:true};
    if(/敵単体に.*ダメージ/.test(t)) return {k:"dmg", all:false};
    return {k:"dmg", all:false};
}
function pkSkillKind(s){
    const t = s.effect || "";
    if(/行動不能/.test(t)) return {k:"stun"};
    if(/盗む/.test(t)) return {k:"steal"};
    if(/現在HPを基準/.test(t)) return {k:"ratio"};
    if(/会心/.test(t)) return {k:"crit"};
    let m;
    if((m = t.match(/味方全員のHPを(\d+)回復/))) return {k:"healAll", amt:Number(m[1])};
    if(/ランダムに1つ発動/.test(t)) return {k:"random"};
    if(/仲間全員で/.test(t)) return {k:"team"};
    if(/味方を回復/.test(t)) return {k:"healOne"};
    if(/妨害/.test(t)) return {k:"stun"};
    if(/状況に応じた/.test(t)) return {k:"situ"};
    if(/能力を上げる/.test(t)) return {k:"buff"};
    if(/敵単体にダメージ/.test(t)) return {k:"dmg"};
    return {k:"dmg"};
}
function pkSpellsKnown(){ if(!pkAvail()) return []; const lv = pkLv(), cr = G.S.pk && G.S.pk.carry; return PK.L.spells.filter((s) => pkMagicOpen(s) && (s.level_required <= lv || (cr && cr.spells.includes(s.id)))); }
function pkSkillsKnown(){ if(!pkAvail()) return []; const lv = pkLv(), cr = G.S.pk && G.S.pk.carry; return PK.L.skills.filter((s) => pkMagicOpen(s) && (s.level_required <= lv || (cr && cr.skills.includes(s.id)))); }

// ---- ダメージ・回復の共通部品（戦闘中と戦闘外で同じ式）
function pkMagicMult(mp){ return Math.min(4.5, 1.0 + mp * 0.05); }
function pkHealAmt(k, cid){ const mx = tqStat(cid).maxhp; return k.full ? mx : k.amt; }
// 戦闘外で じゅもんを つかう（回復・移動のみ）
function pkCastField(spId, to){
    const S = G.S, sp = PK.SP[spId]; if(!sp) return {ok:false, msg:"？"};
    if(!pkSpellsKnown().includes(sp)) return {ok:false, msg:"まだ おぼえていない。"};
    if(!sp.usable_outside_battle) return {ok:false, msg:"ここでは つかえない。"};
    const m = S.m.hero; if(m.mp < sp.mp_cost && !S.cx.infmp) return {ok:false, msg:"MPが たりない！"};
    const k = sp._k;
    if(k.k === "warp"){ const r = pkWarpTown(); if(!r.ok) return r; return {ok:true, warp:true, msg:""}; }
    if(k.k !== "heal") return {ok:false, msg:"たたかいの ときに つかう じゅもん です。"};
    const tgts = k.all ? S.party.filter((c) => S.m[c].hp > 0) : [to || "hero"];
    if(!k.all && (!S.m[tgts[0]] || S.m[tgts[0]].hp <= 0)) return {ok:false, msg:"たおれていて きかない！"};
    if(tgts.every((c) => S.m[c].hp >= tqStat(c).maxhp)) return {ok:false, msg:"HPは まんたん だ！"};
    if(!S.cx.infmp) m.mp -= sp.mp_cost;
    let tot = 0; tgts.forEach((c) => { const b = S.m[c].hp; S.m[c].hp = Math.min(tqStat(c).maxhp, b + pkHealAmt(k, c)); tot += S.m[c].hp - b; });
    return {ok:true, msg:sp.name + "！ " + (k.all ? "みんなの" : tqName(tgts[0]) + "の") + " HPが 合計 " + tot + " かいふく！"};
}

// ---------------------------------------------------------------- パックのモンスター → 戦闘用データ
function pkMonLv(m, base){
    let lv = Math.max(1, Math.min(PK_MAXLV, base == null ? pkLv() + Math.floor(G.rnd() * 7) - 3 : base));
    lv = Math.max(m.level_min || 1, Math.min(m.level_max || PK_MAXLV, lv)); return Math.max(1, Math.min(PK_MAXLV, lv));
}
function pkMonStat(m, lv){
    const tier = PK_TIER[m.rank] || 1, s = tqFoeStat(lv, tier, false);
    if(m.size === "L"){ s.hp = Math.round(s.hp * 1.3); s.exp = Math.round(s.exp * 1.2); s.g = Math.round(s.g * 1.2); }
    return s;
}
function pkRegFoe(monId, lv){
    const m = PK.MON[monId], key = "pk:" + monId + ":" + lv;
    if(!RPG_FOES[key]){
        const s = pkMonStat(m, lv);
        const n = Number(monId.slice(3)), f = {n:m.name, e:m._e, hp:s.hp, atk:s.atk, def:s.def, exp:s.exp, g:s.g, acts:tqActs(m.name, false), pk:monId, plv:lv};
        if(n >= 14 && n <= 16){ f.hp = Math.max(8, Math.round(f.hp * 0.4)); f.def = Math.round(f.def * 3); f.atk = Math.round(f.atk * 0.55); f.exp = Math.round(f.exp * 14); f.flee = 0.25; }   // ニゲルコイツ・ハヤイコイツ・シュンソクコイツ：経験値がたっぷり
        else if(n >= 17 && n <= 19){ f.hp = Math.max(8, Math.round(f.hp * 0.4)); f.def = Math.round(f.def * 3); f.atk = Math.round(f.atk * 0.55); f.g = Math.round(f.g * 22); f.flee = 0.25; }   // ドウカイ・ギンカイ・キンカイ：ゴールドがたっぷり
        else if(n >= 11 && n <= 13){ f.stone = 5; }   // びっくりばこ・いかりばこ・おおばこ：かならず 大切な石碑を 5こ おとす
        RPG_FOES[key] = f;
    }
    return key;
}

// ---------------------------------------------------------------- 戦闘へのつなぎ
// 画面（コマンド）
function pkBattleBtns(){
    if(!pkOk()) return "";
    const p = pkS(); let h = "";
    if(pkSpellsKnown().length) h += '<button class="opt" data-a="bcmd" data-v="pkmenu|spell">📖 じゅもん</button>';
    if(pkSkillsKnown().length) h += '<button class="opt" data-a="bcmd" data-v="pkmenu|skill">🧩 ついかとくぎ</button>';
    if(Object.keys(p.it).some((id) => PK.I[id] && pkItemUsable(PK.I[id], true))) h += '<button class="opt" data-a="bcmd" data-v="pkmenu|item">🎁 パックのどうぐ</button>';
    return h;
}
function pkBattleMenu(menu){
    const S = G.S, p = pkS(), back = '<button class="opt" data-a="bcmd" data-v="back">もどる</button>';
    if(menu === "pkspell"){
        const l = pkSpellsKnown(); return l.map((s) => '<button class="opt" data-a="bcmd" data-v="pkspell|' + s.id + '">' + esc(s.name) + '（MP' + s.mp_cost + '）</button>').join("") + back;
    }
    if(menu === "pkskill"){
        const l = pkSkillsKnown(); return l.map((s) => '<button class="opt" data-a="bcmd" data-v="pkskill|' + s.id + '">' + esc(s.name) + '（MP' + s.mp_cost + '）</button>').join("") + back;
    }
    if(menu === "pkitem"){
        const l = Object.keys(p.it).filter((id) => PK.I[id] && pkItemUsable(PK.I[id], true));
        return (l.length ? l.map((id) => '<button class="opt" data-a="bcmd" data-v="pkitem|' + id + '">' + esc(PK.I[id].name) + '×' + p.it[id] + '</button>').join("") : '<div class="meta">つかえる どうぐが ない</div>') + back;
    }
    return back;
}
// コマンド入力。処理したら true
function pkBcmd(c, arg){
    const b = G.b, S = G.S; if(!b) return false;
    if(c === "pkmenu"){ b.menu = "pk" + arg; render(); return true; }
    if(c === "pkspell"){
        const sp = PK.SP[arg]; if(!sp || !pkSpellsKnown().includes(sp)) return true;
        if(S.m.hero.mp < sp.mp_cost && !S.cx.infmp){ b.text = "MPが たりない！"; b.menu = "top"; render(); return true; }
        const k = sp._k;
        if(k.k === "warp"){ heroTurn({k:"pkspell", id:arg}); return true; }
        if(k.k === "dmg" && !k.all && foesAlive().length > 1){ G.pend = {k:"pkspell", id:arg}; b.menu = "target"; render(); return true; }
        if(k.k === "dmg" && !k.all) { heroTurn({k:"pkspell", id:arg, t:foesAlive()[0]}); return true; }
        if(k.k === "heal" && !k.all){ G.pend = {k:"pkspell", id:arg}; b.menu = "ally"; render(); return true; }
        heroTurn({k:"pkspell", id:arg}); return true;
    }
    if(c === "pkskill"){
        const sk = PK.SK[arg]; if(!sk || !pkSkillsKnown().includes(sk)) return true;
        if(S.m.hero.mp < sk.mp_cost && !S.cx.infmp){ b.text = "MPが たりない！"; b.menu = "top"; render(); return true; }
        const k = sk._k.k;
        if(["stun", "steal", "ratio", "crit", "dmg"].includes(k)){
            if(foesAlive().length > 1){ G.pend = {k:"pkskill", id:arg}; b.menu = "target"; render(); } else heroTurn({k:"pkskill", id:arg, t:foesAlive()[0]});
            return true;
        }
        if(k === "healOne"){ G.pend = {k:"pkskill", id:arg}; b.menu = "ally"; render(); return true; }
        heroTurn({k:"pkskill", id:arg, t:foesAlive()[0]}); return true;
    }
    if(c === "pkitem"){
        const it = PK.I[arg]; if(!it) return true; const kd = pkItemKind(it).k;
        if(kd === "revive" || kd === "heal"){ G.pend = {k:"pkitem", id:arg}; b.menu = "ally"; render(); return true; }
        heroTurn({k:"pkitem", id:arg, to:"hero"}); return true;
    }
    return false;
}
// ヒーローの行動。戦闘が終わったら true
function pkHeroAct(act){
    const b = G.b, S = G.S, hn = S.name, st = tqStat("hero"), atkB = b.buff.atk > 0 ? 1.25 : 1, mHero = S.m.hero;
    if(act.k === "pkitem"){
        const r = pkUseItem(act.id, act.to || "hero", true); bLog(r.msg); return false;
    }
    const isSp = act.k === "pkspell", d = isSp ? PK.SP[act.id] : PK.SK[act.id]; if(!d) return false;
    if(mHero.mp < d.mp_cost && !S.cx.infmp){ bLog("MPが たりない！"); return false; }
    const k = d._k, hit = (t, mult, label) => { const r = bDmg(st.atk * atkB, t.def, mult), dm = bFoeHurt(t, r.d); bHit(b.foes.indexOf(t)); S.gauge = Math.min(100, S.gauge + 8); bLog(t.label + "に " + dm + "のダメージ！" + (r.crit && label !== "crit" ? "（かいしん！）" : "")); return dm; };
    const fa = foesAlive(), pickT = () => { let t = act.t; if(!t || t.cur <= 0) t = fa[0]; return t; };
    if(isSp){
        if(k.k === "warp"){
            if(b.boss){ bLog("この あいてからは にげられない！（ボスせんでは 瞬間移動できない）"); return false; }
            const r = pkWarpTown(); if(!r.ok){ bLog(r.msg); return false; }
            bLog(hn + "は 瞬間移動を となえた！"); G.pk = G.pk || {}; G.pk.warpAfter = true; endBattle("run"); pkDoWarp(); G.pk.warpAfter = false; return true;
        }
        bSpend("hero", d.mp_cost); bLog(hn + "は " + d.name + " を となえた！");
        if(k.k === "heal"){
            const tg = k.all ? S.party.filter((c) => bAlive(c)) : [act.to || "hero"];
            tg.forEach((c) => { if(!bAlive(c)){ bLog(tqName(c) + "は たおれていて きかない！"); return; } const mm = S.m[c], bf = mm.hp; mm.hp = Math.min(tqStat(c).maxhp, bf + pkHealAmt(k, c)); bLog(tqName(c) + "の HPが " + (mm.hp - bf) + " かいふく！"); });
        }else if(k.k === "buff"){ b.buff.atk = Math.max(b.buff.atk, 3); b.buff.def = Math.max(b.buff.def, 3); bLog("みんなの ちからが わいてきた！（こうげき・ぼうぎょ アップ）"); }
        else if(k.k === "debuff"){ fa.forEach((t) => { t.atk = Math.max(1, Math.round(t.atk * 0.8)); t.def = Math.max(1, Math.round(t.def * 0.75)); bLog(t.label + "の ちからが さがった！"); }); }
        else if(k.k === "dmg"){ const mult = pkMagicMult(d.mp_cost); if(k.all) fa.forEach((t) => hit(t, mult * 0.8)); else { const t = pickT(); if(t) hit(t, mult); } }
        return false;
    }
    // とくぎ
    bSpend("hero", d.mp_cost); bLog(hn + "の " + d.name + "！");
    if(G.rnd() * 100 >= (d.success_rate || 100)){ bLog("しかし うまくいかなかった！"); return false; }
    pkSkillEffect(d, k, act, st, atkB, hit, fa, pickT);
    return false;
}
function pkSkillEffect(d, k, act, st, atkB, hit, fa, pickT){
    const b = G.b, S = G.S, kk = k.k;
    const heal1 = (cid, amt) => { if(!bAlive(cid)) return; const mm = S.m[cid], bf = mm.hp; mm.hp = Math.min(tqStat(cid).maxhp, bf + amt); bLog(tqName(cid) + "の HPが " + (mm.hp - bf) + " かいふく！"); };
    const stunT = (t) => { const base = t.boss ? 0.35 : 1; if(t.boss && G.rnd() > base){ bLog(t.label + "には きかなかった！"); return; } t.stun = 2; bLog(t.label + "は うごけなくなった！"); };
    const t = pickT();
    if(kk === "stun"){ if(!t) return; if(d.random_lines && d.random_lines.length) bLog("「" + d.random_lines[Math.floor(G.rnd() * d.random_lines.length)] + "」"); stunT(t); }
    else if(kk === "steal"){
        if(!t) return; const mon = t.pk && PK.MON[t.pk]; const id = mon && mon.drop_items && mon.drop_items[0] || PK.L.items[Math.floor(G.rnd() * 10)].id;
        if(PK.I[id]){ pkGive(id, 1); pkS().cnt.drop++; bLog(t.label + "から " + PK.I[id].name + " を ぬすんだ！"); }
    }
    else if(kk === "ratio"){ if(!t) return; const d0 = t.boss ? Math.max(1, Math.round(t.cur * 0.08)) : Math.max(1, Math.round(t.cur * 0.34)), dm = bFoeHurt(t, d0); bHit(b.foes.indexOf(t)); bLog(t.label + "の ちからを けずった！ " + dm + "のダメージ！"); }
    else if(kk === "crit"){ if(!t) return; const dm = bFoeHurt(t, Math.max(1, Math.round((st.atk * atkB - t.def / 2) * 1.7))); bHit(b.foes.indexOf(t)); bLog("かいしんの いちげき！ " + t.label + "に " + dm + "のダメージ！"); S.gauge = Math.min(100, S.gauge + 10); }
    else if(kk === "healAll"){ S.party.forEach((c) => heal1(c, k.amt)); }
    else if(kk === "healOne"){ heal1(act.to || "hero", Math.round(tqStat(act.to || "hero").maxhp * 0.35)); }
    else if(kk === "team"){ if(!t) return; let sum = 0; S.party.forEach((c) => { if(bAlive(c)) sum += tqStat(c).atk; }); const dm = bFoeHurt(t, Math.max(1, Math.round((sum * 0.9 * atkB - t.def / 2) * (0.9 + G.rnd() * 0.2)))); bHit(b.foes.indexOf(t)); bLog("みんなで ちからを あわせた！ " + t.label + "に " + dm + "のダメージ！"); S.gauge = Math.min(100, S.gauge + 15); }
    else if(kk === "buff"){ b.buff.atk = Math.max(b.buff.atk, 3); bLog("みんなの こうげきが あがった！"); }
    else if(kk === "situ"){ const w = weakestAlly(); if(w && w.r < 0.5){ heal1(w.id, Math.round(tqStat(w.id).maxhp * 0.4)); } else if(G.rnd() < 0.5){ b.buff.def = Math.max(b.buff.def, 3); bLog("まもりの かまえ！ みんなの ぼうぎょが あがった！"); } else if(t) hit(t, 1.4); }
    else if(kk === "random"){
        const n = Math.floor(G.rnd() * 10);
        if(n === 0 && t) hit(t, 0.8); else if(n === 1 && t) hit(t, 2.6); else if(n === 2){ const w = weakestAlly(); if(w) heal1(w.id, 80 + S.lv * 4); } else if(n === 3){ S.party.forEach((c) => heal1(c, 50 + S.lv * 3)); }
        else if(n === 4){ b.buff.atk = Math.max(b.buff.atk, 3); bLog("ちからが わいてきた！") } else if(n === 5){ fa.forEach((x) => { x.def = Math.max(1, Math.round(x.def * 0.8)); }); bLog("てきの ぼうぎょが さがった！"); }
        else if(n === 6 && t) stunT(t); else if(n === 7) bLog("…なにも おこらなかった。"); else if(n === 8){ bLog("みんなの ちょうしが よくなった！"); }
        else if(n === 9){ fa.forEach((x) => hit(x, 0.4)); S.party.forEach((c) => heal1(c, 20 + S.lv)); }
    }
    else { if(t) hit(t, 1.3 + d.mp_cost * 0.05); }
}

// のろわれた キャラは、うごけなくなったり おどったり して まともに こうげきしてくれない
function pkCurseSkip(id){
    if(!pkOk() || !G.S.pk) return false;
    if(!pkEquipBonus(id).curse) return false;
    const r = G.rnd(); if(r > 0.55) return false;
    bLog(tqName(id) + (r < 0.28 ? "は のろいで うごけない！" : "は のろいで かってに おどりだした！")); return true;
}
// 休憩所：のろいを とく／たおれた なかまを ぜんかいふくで ふっかつ（どちらも レベル×10G）
function pkRestCost(){ return G.S.lv * 10; }
function pkRestCure(cid){
    const S = G.S, set = pkEqOf(cid), cost = pkRestCost(); let n = 0;
    PK_SLOTS.forEach((sl) => { const e = PK.EQ[set[sl]]; if(e && pkEqCursed(e, cid)) n++; });
    if(!n) return {ok:false, msg:tqName(cid) + " は のろわれていない。"};
    if(S.gold < cost) return {ok:false, msg:"ゴールドが たりない！（" + cost.toLocaleString() + "G）"};
    S.gold -= cost; PK_SLOTS.forEach((sl) => { const e = PK.EQ[set[sl]]; if(e && pkEqCursed(e, cid)) delete set[sl]; }); tqClamp();
    return {ok:true, msg:tqName(cid) + " の のろいを といた！ のろいの そうびは はずれて カバンに もどった。（" + cost.toLocaleString() + "G）"};
}
function pkRestRevive(cid){
    const S = G.S, cost = pkRestCost(); if(!S.m[cid] || S.m[cid].hp > 0) return {ok:false, msg:tqName(cid) + " は げんきだ。"};
    if(S.gold < cost) return {ok:false, msg:"ゴールドが たりない！（" + cost.toLocaleString() + "G）"};
    S.gold -= cost; const mx = tqStat(cid); S.m[cid] = {hp:mx.maxhp, mp:mx.maxmp};
    return {ok:true, msg:tqName(cid) + " が ぜんかいふくで ふっかつした！（" + cost.toLocaleString() + "G）"};
}

// ---------------------------------------------------------------- tqStat / tqGain / 戦闘終了へのかぶせ
(function(){
    const _stat = tqStat;
    tqStat = function(id){
        const st = _stat(id), S = G.S;
        if(!S || !S.pk || !PK.ready || S.cx.st999) return st;
        const p = S.pk, b = pkEquipBonus(id), k = id === "hero" ? 1 : 0.8;
        st.atk += Math.round(b.atk * k); st.def += Math.round(b.def * k);
        if(b.curse){ st.def = Math.round(st.def * 0.8); st.agi = Math.round(st.agi * 0.8); }
        if(p.buff.atk > 0) st.atk *= 2; if(p.buff.def > 0) st.def *= 2;
        return st;
    };
    const _gain = tqGain;
    tqGain = function(exp){ const p = G.S && G.S.pk; return _gain(p && p.buff && p.buff.exp > 0 ? exp * 2 : exp); };
    const _end = endBattle;
    endBattle = function(res){
        const b = G.b; let hasPk = false;
        if(b && G.S && PK.ready){ try{ pkBattleEnd(res, b); hasPk = true; }catch(e){ if(window.console) console.error("pk", e); } }
        _end(res);
        if(hasPk){ try{ const p = G.S.pk; ["exp", "atk", "def"].forEach((k) => { if(p.buff[k] > 0) p.buff[k]--; }); }catch(_e){} }
    };
})();
