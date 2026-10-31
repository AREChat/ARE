"use strict";
// ===== 追加パック：モンスター（探索・戦闘・ドロップ・スカウト・牧場・配合・転生・格闘場・相棒）=====
const PK_STABLE_MAX = 30;
// スカウトできる モンスターは 60体（No.001〜060）。No.008〜010「あまりくん」は 配合でだけ 生まれる
const PK_POOL_N = 60;
function pkInPool(id){ const n = Number(String(id).slice(3)); return n >= 1 && n <= PK_POOL_N; }
function pkScoutable(id){ const n = Number(String(id).slice(3)); return n >= 1 && n <= PK_POOL_N && !(n >= 8 && n <= 10); }
const PK_SCOUT = {G:0.5, F:0.42, E:0.34, D:0.27, C:0.2, B:0.14, A:0.1, S:0.06};

function pkStableSlots(){ const p = pkS(); return p.stable.reduce((a, s) => a + (PK.MON[s.id] && PK.MON[s.id].party_slots || 1), 0); }
function pkFindMon(uid){ return pkS().stable.find((s) => s.u === uid) || null; }
function pkAddMonster(monId, lv, how){
    const p = pkS(), m = PK.MON[monId]; if(!m) return {ok:false, msg:"そんな モンスターは いない。"};
    if(pkStableSlots() + (m.party_slots || 1) > PK_STABLE_MAX) return {ok:false, msg:"ぼくじょうが いっぱいです！（" + PK_STABLE_MAX + "わく）"};
    const s = {u:p.uid++, id:monId, lv:Math.max(1, Math.min(PK_MAXLV, lv || 1)), exp:0, plus:0, sk:(m.skills || []).slice(0, 2), from:how || ""};
    p.stable.push(s); p.seen[monId] = 1; p.scout[monId] = (p.scout[monId] || 0) + (how === "scout" ? 1 : 0);
    return {ok:true, msg:m.name + " Lv" + s.lv + " が なかまに なった！", mon:s};
}
// なかまの モンスターの つよさ（プラス値で さいだい +99%）
function pkInstStat(s){ const m = PK.MON[s.id], st = pkMonStat(m, s.lv), k = 1 + (s.plus || 0) / 100; st.hp = Math.round(st.hp * k); st.atk = Math.round(st.atk * k); st.def = Math.round(st.def * k); return st; }
function pkMonNeed(lv){ return Math.max(8, Math.round(tqNeed(Math.min(lv, 99)) / 5)); }
function pkMonGain(s, exp){
    let ups = 0; if(s.lv >= PK_MAXLV){ s.exp = 0; return 0; }
    s.exp += Math.max(0, Math.round(exp));
    while(s.lv < PK_MAXLV && s.exp >= pkMonNeed(s.lv)){ s.exp -= pkMonNeed(s.lv); s.lv++; ups++; if(s.lv % 5 === 0) s.plus = Math.min(99, (s.plus || 0) + 1); }
    if(s.lv >= PK_MAXLV) s.exp = 0;
    return ups;
}

// ---------------------------------------------------------------- 探索（パックのモンスターと戦う）
function pkExplorePool(rank, onlyScout){
    const p = pkS();
    return (PK.byRank[rank] || []).filter((m) => {
        if(onlyScout) return pkScoutable(m.id);
        if(m.type === "通常モンスター") return true;
        const n = Number(m.id.slice(3)) - 500; const base = "MON" + String(n).padStart(3, "0");
        return (p.kill[base] || 0) >= 1;                        // 転生モンスターは、元のモンスターを倒した人の前に姿をあらわす
    });
}
function pkExplore(rank, onlyScout){
    if(!pkOk() || !pkGate(3)) return {ok:false, msg:"地図3（運命開発ビル）を クリアすると ひらきます。"};
    const p = pkS(), pool = pkExplorePool(rank, onlyScout); if(!pool.length) return {ok:false, msg:"この ランクには まだ 出会える モンスターが いない。"};
    const pickM = () => { const w = pool.map((m) => (m.type === "転生モンスター" ? 0.25 : 1)), tot = w.reduce((a, c) => a + c, 0); let r = G.rnd() * tot; for(let i = 0; i < pool.length; i++){ r -= w[i]; if(r <= 0) return pool[i]; } return pool[0]; };
    const chosen = []; let slots = 0;
    const want = 1 + (G.rnd() < 0.55 ? 1 : 0) + (G.rnd() < 0.25 ? 1 : 0);
    for(let i = 0; i < want; i++){ const m = pickM(); if(slots + (m.party_slots || 1) > 3) break; chosen.push(m); slots += m.party_slots || 1; }
    const base = pkLv() + Math.floor(G.rnd() * 7) - 3;
    if(!onlyScout && G.rnd() < 0.06 && !chosen.some((m) => m.id >= "MON011" && m.id <= "MON013")){ const bx = PK.MON["MON01" + (1 + Math.floor(G.rnd() * 3))]; chosen.length = 0; chosen.push(bx); }   // たまに 宝箱ふうの モンスター
    const ids = chosen.map((m) => pkRegFoe(m.id, pkMonLv(m, base)));
    p.cnt.explore++;
    G.pk = G.pk || {}; G.pk.ret = true;
    battleStart(ids, null);
    return {ok:true, msg:""};
}

// ---------------------------------------------------------------- 戦闘のあと
(function(){
    const _start = battleStart;
    battleStart = function(ids, after){
        _start(ids, after);
        try{ if(G.b && PK.ready){ const p = pkS(); G.b.foes.forEach((f) => { if(f.pk) p.seen[f.pk] = 1; }); } }catch(_e){}
    };
    const _end = endBattle;                                   // pack.js が かぶせた ものの さらに外側
    endBattle = function(res){
        _end(res);
        try{
            if(G.pk && G.pk.ret && G.mode === "map" && !G.scripts.length && !G.b){
                G.pk.ret = false; G.pk.msg = (G.info || "").trim(); G.pk.open = true; G.mode = "pack"; render();
            }
        }catch(_e){}
    };
})();
function pkBattleEnd(res, b){
    if(res !== "win") return;
    const S = G.S, p = pkS(); let scouted = false;
    const add = (t) => { b.log.push(t); };
    b.foes.forEach((f) => {
        p.cnt.kill++;
        if(f.sureDrop && !f.pk){ S.items.special = Math.min(99, (S.items.special || 0) + 1); add(f.label + "は とくべつな どうぐを おとした！"); }
        if(!f.pk) return;
        const m = PK.MON[f.pk]; if(!m) return;
        p.kill[f.pk] = (p.kill[f.pk] || 0) + 1; p.seen[f.pk] = 1;
        if(f.stone){ pkGive("ITM007", f.stone); p.cnt.drop += f.stone; p.drops.ITM007 = (p.drops.ITM007 || 0) + f.stone; add(f.label + "は 大切な石碑を " + f.stone + "こ おとした！"); }
        // ドロップ
        if(m.drop_items && m.drop_items.length && (f.sureDrop || G.rnd() < (m.rank === "S" ? 0.42 : 0.3))){
            const iid = m.drop_items[Math.floor(G.rnd() * m.drop_items.length)];
            if(PK.I[iid]){ pkGive(iid, 1); p.cnt.drop++; p.drops[iid] = (p.drops[iid] || 0) + 1; add(f.label + "は " + PK.I[iid].name + " を おとした！"); }
        }
        // 装備ドロップ
        const ri = PK_RANKS.indexOf(m.rank);
        if(G.rnd() < 0.03 + 0.012 * ri){
            const cand = PK.L.equipment.filter((e) => !e.casino_prize && e.level_required <= pkLv() + 5 && !p.eqOwn[e.id] && (!e.cursed || G.rnd() < 0.15));
            if(cand.length){ const e = cand[Math.floor(G.rnd() * cand.length)]; pkGiveEquip(e.id); add(f.label + "は " + e.name + " を おとした！"); }
        }
        // スカウト（1回の戦闘で1回だけ）
        if(!scouted && pkGate(3) && pkScoutable(m.id) && !f.fled){
            scouted = true; let ch = PK_SCOUT[m.rank] || 0.2, flute = false;
            if((p.it.ITM025 || 0) > 0){ ch += 0.25; flute = true; }
            if(G.rnd() < ch || S.cx.gscout || f.sureScout){
                if(flute) pkTake("ITM025", 1);
                const r = pkAddMonster(m.id, f.plv || 1, "scout");
                if(r.ok){ p.cnt.scout++; add(f.label + "は なかまに なりたそうに こちらを みている！"); add(r.msg); } else add(f.label + "は なかまに なりたそうだが… " + r.msg);
            }
        }
    });
    // 相棒に経験値
    const comp = p.comp && pkFindMon(p.comp);
    if(comp){ let tot = 0; b.foes.forEach((f) => { tot += f.exp; }); const u = pkMonGain(comp, tot * 0.6); if(u) add(PK.MON[comp.id].name + "は Lv" + comp.lv + " に あがった！"); }
    pkQuestTick();
    pkAchCheck();
}

// ---------------------------------------------------------------- 相棒（牧場のモンスターを1匹つれていく）
function pkCompActive(){ if(!pkOk() || !pkAvail()) return false; const p = pkS(); return !!(p.comp && pkFindMon(p.comp)); }
function pkSetComp(uid){ const p = pkS(); if(uid && !pkFindMon(uid)) return {ok:false, msg:"？"}; p.comp = uid || null; return {ok:true, msg:uid ? PK.MON[pkFindMon(uid).id].name + " を あいぼうに した！" : "あいぼうを やすませた。"}; }
function pkCompAct(){
    const b = G.b, S = G.S, p = pkS(), s = pkFindMon(p.comp); if(!s) return;
    const m = PK.MON[s.id], st = pkInstStat(s), nm = m.name, fa = foesAlive(); if(!fa.length) return;
    const sks = s.sk && s.sk.length ? s.sk : (m.skills || []);
    const sk = sks.length ? PK.SK[sks[Math.floor(G.rnd() * sks.length)]] : null;
    if(sk && G.rnd() < 0.35){
        const k = sk._k;
        if(k.k === "healAll"){ bLog(nm + "の " + sk.name + "！"); S.party.forEach((c) => { if(bAlive(c)){ const mm = S.m[c], bf = mm.hp; mm.hp = Math.min(tqStat(c).maxhp, bf + Math.round(k.amt * 0.7)); bLog(tqName(c) + "の HPが " + (mm.hp - bf) + " かいふく！"); } }); return; }
        if(k.k === "healOne"){ const w = weakestAlly(); if(w){ const mm = S.m[w.id], bf = mm.hp; mm.hp = Math.min(tqStat(w.id).maxhp, bf + Math.round(tqStat(w.id).maxhp * 0.25)); bLog(nm + "の " + sk.name + "！ " + tqName(w.id) + "の HPが " + (mm.hp - bf) + " かいふく！"); return; } }
        if(k.k === "stun"){ const t = fa[Math.floor(G.rnd() * fa.length)]; bLog(nm + "の " + sk.name + "！"); if(!t.boss || G.rnd() < 0.3){ t.stun = 2; bLog(t.label + "は うごけなくなった！"); } else bLog(t.label + "には きかなかった！"); return; }
        if(["dmg", "crit", "ratio", "team"].includes(k.k)){ const t = fa[Math.floor(G.rnd() * fa.length)], r = bDmg(st.atk * 0.55, t.def, 1.6), d = bFoeHurt(t, r.d); bHit(b.foes.indexOf(t)); bLog(nm + "の " + sk.name + "！ " + t.label + "に " + d + "のダメージ！"); return; }
    }
    const t = fa[Math.floor(G.rnd() * fa.length)], r = bDmg(st.atk * 0.5, t.def, 1), d = bFoeHurt(t, r.d); bHit(b.foes.indexOf(t));
    bLog(nm + "の こうげき！ " + t.label + "に " + d + "のダメージ！");
}

// ---------------------------------------------------------------- 配合（60体のなかで そだてる／1くみ あわせにつき さいだい 2パターン）
function pkBreedPatterns(a, b){
    // 親ふたり（順番に かんけいない）から かならず 同じ 2パターンが きまる
    const A = PK.MON[a.id], B = PK.MON[b.id], key = [a.id, b.id].sort().join("+");
    const ia = PK_RANKS.indexOf(A.rank), ib = PK_RANKS.indexOf(B.rank), plusAvg = ((a.plus || 0) + (b.plus || 0)) / 2;
    const target = Math.min(7, Math.max(ia, ib) + Math.floor(plusAvg / 25));      // プラス値が高いほど ランクが 高い
    const cand = PK.L.monsters.filter((m) => pkScoutable(m.id) && m.type === "通常モンスター").map((m) => ({m, d:Math.abs(PK_RANKS.indexOf(m.rank) - target), h:pkHash(key + m.id)}));
    cand.sort((x, y) => x.d - y.d || x.h - y.h);
    return {list:[cand[0].m, cand[1].m], target, key};
}
function pkBreed(ua, ub){
    const p = pkS(), a = pkFindMon(ua), b = pkFindMon(ub);
    if(!a || !b || a === b) return {ok:false, msg:"べつの 2ひきを えらんでね。"};
    if(!(p.it.ITM024 > 0)) return {ok:false, msg:"『配合の雫』が ひつよう です。（カジノ景品で こうかん できる）"};
    if(!pkInPool(a.id) || !pkInPool(b.id)) return {ok:false, msg:"配合できるのは No.001〜060 の モンスター だけ です。"};
    const A = PK.MON[a.id], B = PK.MON[b.id], pat = pkBreedPatterns(a, b);
    const child = pat.list[G.rnd() < 0.65 ? 0 : 1];
    // スキルの引きつぎ
    const U = []; (a.sk || []).concat(b.sk || []).forEach((x) => { if(!U.includes(x)) U.push(x); });
    for(let i = U.length - 1; i > 0; i--){ const j = Math.floor(G.rnd() * (i + 1)); [U[i], U[j]] = [U[j], U[i]]; }
    const plusAvg = ((a.plus || 0) + (b.plus || 0)) / 2;
    const keep = plusAvg < 10 && G.rnd() < 0.3 ? 0 : (plusAvg >= 30 ? 2 : 1), kept = U.slice(0, keep), extra = U.slice(keep);
    const plus = Math.min(99, Math.floor(((a.plus || 0) + (b.plus || 0)) * 0.6) + 1 + Math.floor(G.rnd() * 3));
    pkTake("ITM024", 1);
    const oldStable = p.stable.slice(), oldComp = p.comp;
    p.stable = p.stable.filter((s) => s !== a && s !== b); if(p.comp === a.u || p.comp === b.u) p.comp = null;
    const r = pkAddMonster(child.id, Math.floor((a.lv + b.lv) / 4) + 1, "breed");
    if(!r.ok){ p.stable = oldStable; p.comp = oldComp; pkGive("ITM024", 1); return r; }
    r.mon.plus = plus; r.mon.sk = kept.length ? kept : (child.skills || []).slice(0, 1);
    let msg = A.name + " と " + B.name + " を 配合…！\n" + r.msg + "（" + child.rank + "ランク・プラス+" + plus + "）";
    // あまったスキル → 小あまりくん(2) / あまりくん(3) / 大あまりくん(4)
    if(extra.length >= 2){
        const id = extra.length >= 4 ? "MON010" : extra.length === 3 ? "MON009" : "MON008", am = pkAddMonster(id, 1, "breed");
        if(am.ok){ am.mon.sk = extra.slice(); am.mon.plus = 0; msg += "\nあまった スキルから「" + PK.MON[id].name + "」が うまれた！（スキル" + extra.length + "つ）"; }
        else msg += "\n（ぼくじょうが いっぱいで あまりくんは うまれなかった…）";
    }
    p.cnt.breed++; pkQuestTick(); pkAchCheck();
    return {ok:true, msg, child:r.mon, patterns:pat.list.map((m) => m.id)};
}
// ---------------------------------------------------------------- 転生
function pkReincTarget(monId){ const n = Number(String(monId).slice(3)); return n >= 1 && n <= 50 ? "MON" + String(500 + n) : null; }
function pkReinc(uid){
    const p = pkS(), s = pkFindMon(uid); if(!s) return {ok:false, msg:"？"};
    const t = pkReincTarget(s.id); if(!t) return {ok:false, msg:"この モンスターは 転生できない。（No.1〜50 だけ）"};
    if((p.kill[s.id] || 0) < 5) return {ok:false, msg:"元の モンスターを 5回 たおすと 転生できる。（いま " + (p.kill[s.id] || 0) + "回）"};
    const tm = PK.MON[t], nm = PK.MON[s.id].name;
    p.stable = p.stable.filter((x) => x !== s); if(p.comp === s.u) p.comp = null;
    const r = pkAddMonster(t, Math.max(tm.level_min, Math.floor(s.lv / 2)), "reinc");
    if(!r.ok){ p.stable.push(s); return r; }
    r.mon.plus = s.plus || 0; r.mon.sk = (s.sk || []).slice(0, 2);
    p.cnt.reinc++; pkQuestTick(); pkAchCheck();
    return {ok:true, msg:nm + " は まばゆい ひかりに つつまれた…！\n" + r.msg, mon:r.mon};
}
// ---------------------------------------------------------------- 格闘場（自動で戦う 3回戦）
function pkDuel(sa, sb, nameA, nameB){
    let ha = sa.hp, hb = sb.hp, log = [], turn = 0;
    while(ha > 0 && hb > 0 && turn < 60){
        turn++;
        const a1 = G.rnd() * 6 + (sa.agi || 0) >= G.rnd() * 6 + (sb.agi || 0);
        const hit = (x, y) => Math.max(1, Math.round((x.atk - y.def / 2) * (0.88 + G.rnd() * 0.24) * (G.rnd() < 0.0625 ? 1.7 : 1)));
        if(a1){ hb -= hit(sa, sb); if(hb > 0) ha -= hit(sb, sa); } else { ha -= hit(sb, sa); if(ha > 0) hb -= hit(sa, sb); }
    }
    const win = ha > hb; log.push(nameA + " " + Math.max(0, ha) + " ー " + Math.max(0, hb) + " " + nameB + "（" + turn + "ターン）");
    return {win, log: log.join("")};
}
function pkArena(uid, rank){
    const p = pkS(), s = pkFindMon(uid); if(!s) return {ok:false, msg:"ぼくじょうから えらんでね。"};
    const m = PK.MON[s.id]; rank = rank || m.rank;
    if(PK_RANKS.indexOf(m.rank) < PK_RANKS.indexOf(rank) - 0 && false) return {ok:false, msg:"？"};
    const pool = (PK.byRank[rank] || []).filter((x) => x.id !== s.id); if(pool.length < 3) return {ok:false, msg:"あいてが いない"};
    const stA = pkInstStat(s); stA.agi = 8 + s.lv * 0.6;
    const rounds = []; let wins = 0;
    for(let i = 0; i < 3; i++){
        const f = pool[Math.floor(G.rnd() * pool.length)], lv = Math.max(1, Math.min(PK_MAXLV, s.lv + Math.floor(G.rnd() * 5) - 2)), stB = pkMonStat(f, lv); stB.agi = 8 + lv * 0.6;
        const d = pkDuel(stA, stB, m.name, f.name); rounds.push({foe:f.name, lv, win:d.win, log:d.log}); if(d.win) wins++; else break;
    }
    const champion = wins === 3, tier = PK_TIER[rank], base = tqFoeStat(Math.max(1, s.lv), tier, false);
    const gold = Math.round(base.g * (champion ? 18 : wins * 4)), coins = Math.round((champion ? 40 : wins * 8) * (1 + PK_RANKS.indexOf(rank) * 0.6)), exp = Math.round(base.exp * (champion ? 3 : wins));
    S_gold(gold); pkAddCoins(coins); const ups = pkMonGain(s, exp);
    p.cnt.arena += wins; if(champion){ p.arena[rank] = (p.arena[rank] || 0) + 1; if(rank === "S" && !p.titles.includes("格闘場の頂点")) p.titles.push("格闘場の頂点"); }
    pkQuestTick(); pkAchCheck();
    return {ok:true, rounds, wins, champion, gold, coins, exp, ups, msg:champion ? "ゆうしょう！ " + rank + "ランクの 王者に なった！" : wins + "しょう で やぶれた…"};
}
function S_gold(n){ G.S.gold = Math.min(TQ_MAX_GOLD, G.S.gold + Math.max(0, Math.floor(n))); }

// ---------------------------------------------------------------- 性格診断のモンスター（性格ごとに 1体、さいしょから なかま）
const PK_STARTER = {"仲間思いの行動派":"MON001", "独立心のある挑戦者":"MON002", "支える努力家":"MON003", "好奇心旺盛":"MON004", "気配り上手":"MON005", "慎重な堅実派":"MON006"};
function pkGiveStarter(){
    const S = G.S, p = pkS(); if(p.flags.starter || !PK.ready) return null;
    const pn = S.prof && S.prof.pers && S.prof.pers.name, id = PK_STARTER[pn] || "MON001";
    p.flags.starter = id; const r = pkAddMonster(id, 1, "starter"); if(r.ok && !p.comp) p.comp = r.mon.u; return r;
}
