"use strict";
// ===== 成長・ダメージ・職業・おぼえるわざの計算（データ駆動）=====
export const G = {eq: {}, jobs: {}, ab: {}};   // 装備ボーナス・職業データ・わざデータ（main.js が読みこんだものを入れる）
export const setGameData = (data) => { G.jobs = {}; for(const j of data.jobs || []) G.jobs[j.id] = j; G.ab = data.abilities || {}; G.items = data.items || {}; };
export const setEquip = (S) => { const o = {}; for(const k of Object.keys(S.equip || {})){ const it = G.items && G.items[k]; if(it && it.bonus) for(const [a, v] of Object.entries(it.bonus)) o[a] = (o[a] || 0) + v; } G.eq = o; };
export const JOB_MAX = 30, JOB_MIN_LV = 10;
export const stat = (def, key, lv) => Math.round(def[key][0] + def[key][1] * (lv - 1));
export const expNeed = (lv) => Math.round(lv * lv * 9 + 20);
export const jobNeed = (l) => Math.round(8 + l * l * 0.85);
const PG0 = () => ({hp: 0, mp: 0, atk: 0, def: 0, spd: 0});
export function newMember(id, defs, lv){
    const d = defs[id]; const L = lv || 1;
    const m = {id, lv: L, exp: 0, hp: stat(d, "hp", L), mp: 0, job: null, jobs: {}, pg: PG0(), learned: [], mast: []};
    m.mp = statsOf(m, defs).maxmp; m.hp = statsOf(m, defs).maxhp; learnCheck(m, defs); return m;
}
// 古いセーブの なかまを 新しい形に そろえる
export function fixMember(m, defs){
    if(!m.pg) m.pg = PG0(); if(!m.jobs) m.jobs = {}; if(!m.learned) m.learned = []; if(!m.mast) m.mast = []; if(m.job === undefined) m.job = null;
    if(m.mp === undefined) m.mp = statsOf(m, defs).maxmp; learnCheck(m, defs); return m;
}
export function statsOf(m, defs){
    const d = defs[m.id]; const pg = m.pg || PG0(); const e = G.eq; const k = 1 + (m.mast ? m.mast.length : 0) * 0.015;
    const mp = d.mp ? d.mp[0] + d.mp[1] * (m.lv - 1) : 0;
    return {maxhp: Math.round((stat(d, "hp", m.lv) + pg.hp + (e.hp || 0)) * k), maxmp: Math.round((mp + pg.mp) * k), atk: Math.round((stat(d, "atk", m.lv) + pg.atk + (e.atk || 0)) * k),
            def: Math.round((stat(d, "def", m.lv) + pg.def + (e.def || 0)) * k), spd: Math.round((stat(d, "spd", m.lv) + pg.spd + (e.spd || 0)) * k)};
}
// 経験値を足して、上がったレベルの一覧を返す（職業ごとに ぐんと のびるところが ちがう）
export function gainExp(m, defs, exp){
    const ups = []; m.exp += exp;
    while(m.exp >= expNeed(m.lv) && m.lv < 99){
        m.exp -= expNeed(m.lv); const before = statsOf(m, defs); m.lv++;
        const j = m.job && G.jobs[m.job]; if(j){ m.pg.hp += j.prof.hp * 6; m.pg.mp += j.prof.mp * 3.2; m.pg.atk += j.prof.atk * 1.5; m.pg.def += j.prof.def * 1.3; m.pg.spd += j.prof.agi * 1.0; }
        const after = statsOf(m, defs); m.hp = Math.min(after.maxhp, m.hp + (after.maxhp - before.maxhp)); m.mp = Math.min(after.maxmp, (m.mp || 0) + Math.max(0, after.maxmp - before.maxmp));
        ups.push({lv: m.lv, hp: after.maxhp - before.maxhp, mp: after.maxmp - before.maxmp, atk: after.atk - before.atk, def: after.def - before.def, learned: learnCheck(m, defs)});
    }
    return ups;
}
// ---- じゅもん・とくぎ：レベルで おぼえる（タイプが あう もの）
export const learnLv = (a) => a.t === "spell" ? Math.max(1, Math.round(a.lv * 0.5)) : Math.max(1, Math.ceil(a.lv * 0.45));
export function learnCheck(m, defs){
    const d = defs[m.id]; const cls = d.cls || ""; const out = [];
    for(const a of Object.values(G.ab)){
        if(a.job || m.learned.includes(a.id)) continue;
        if(a.t === "skill" && !a.pl) continue;
        if(!a.cls || !cls.includes(a.cls)) continue;
        if(learnLv(a) <= m.lv){ m.learned.push(a.id); out.push(a.id); }
    }
    return out;
}
// 職業の経験（けんち）。職業レベルが あがると じょうずな わざを おぼえる
export function gainJobExp(m, exp){
    const out = {ups: [], learned: [], mastered: false}; if(!m.job) return out;
    const j = G.jobs[m.job]; const st = m.jobs[m.job] || (m.jobs[m.job] = {lv: 1, exp: 0}); if(st.lv >= JOB_MAX) return out;
    st.exp += Math.round(exp);
    while(st.lv < JOB_MAX && st.exp >= jobNeed(st.lv)){
        st.exp -= jobNeed(st.lv); st.lv++; out.ups.push(st.lv);
        for(const id of j.ab){ const a = G.ab[id]; if(a.jlv <= st.lv && !m.learned.includes(id)){ m.learned.push(id); out.learned.push(id); } }
        if(st.lv >= JOB_MAX){ st.exp = 0; if(!m.mast.includes(m.job)){ m.mast.push(m.job); out.mastered = true; } }
    }
    return out;
}
export function canJob(m, id, party){
    const j = G.jobs[id]; if(!j) return {ok: false, why: "？"};
    if(m.lv < JOB_MIN_LV) return {ok: false, why: "レベル" + JOB_MIN_LV + " から てんしょく できます。"};
    if(j.need && j.need.mast && m.mast.length < j.need.mast) return {ok: false, why: j.n + "は 職業を " + j.need.mast + "つ マスターすると なれます。（いま " + m.mast.length + "/" + j.need.mast + "）"};
    return {ok: true};
}
export function changeJob(m, id){ m.pg.hp *= .5; m.pg.mp *= .5; m.pg.atk *= .5; m.pg.def *= .5; m.pg.spd *= .5; m.job = id; if(!m.jobs[id]) m.jobs[id] = {lv: 1, exp: 0}; const j = G.jobs[id]; for(const a of j.ab){ if(G.ab[a].jlv <= m.jobs[id].lv && !m.learned.includes(a)) m.learned.push(a); } }
export const abilitiesOf = (m, type) => m.learned.map((id) => G.ab[id]).filter((a) => a && a.t === type).sort((a, b) => (a.job ? 1000 : 0) + a.lv - ((b.job ? 1000 : 0) + b.lv) || a.id.localeCompare(b.id));
// ---- ダメージ
export function damage(atk, def, rnd, opt){
    const o = opt || {}; let d = atk * (0.85 + rnd() * 0.3) - def * 0.5; d = Math.max(1, Math.floor(d));
    const crit = o.forceCrit || rnd() < (o.critRate || 0.0625); if(crit) d = Math.max(d, Math.floor(atk * 1.6 + 1));
    if(o.guard) d = Math.max(1, Math.floor(d / 2));
    return {d, crit};
}
export const foeScale = (chapter) => 0.9 + chapter * 0.04;
// モンスター（なかま）の つよさ：ランクと レベルで きまる
export const RANKS = "GFEDCBAS";
export function monStat(m, lv){
    const k = (0.5 + lv * 0.05); const hk = (0.45 + lv * 0.075);
    return {maxhp: Math.round(m.hp * hk), atk: Math.round(m.atk * k), def: Math.round(m.def * k), spd: Math.round(m.spd * (0.7 + lv * 0.03)), maxmp: 99};
}
export const monNeed = (lv) => Math.max(8, Math.round(expNeed(Math.min(lv, 99)) / 5));
