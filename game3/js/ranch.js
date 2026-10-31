"use strict";
// ===== ぼくじょう：スカウトしたモンスターの あずかり・あいぼう・はいごう・てんせい・格闘場 =====
import {monStat, monNeed, RANKS} from "./rules.js";

export const STABLE_MAX = 30, MON_MAXLV = 99;
const GLD = [4, 7, 12, 20, 32, 50, 78, 120], EXP = [5, 9, 16, 28, 46, 72, 110, 170];
const hash = (s) => { let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function makeRanch(ctx){
    const D = () => ctx.data.mons, rnd = () => ctx.rnd();
    const st = () => { const S = ctx.S; if(!S.ranch) S.ranch = {stable: [], uid: 1, comp: null, seen: {}, kill: {}, cnt: {scout: 0, breed: 0, reinc: 0, arena: 0}, arena: {}}; return S.ranch; };
    const R = {
        st,
        find(u){ return st().stable.find((s) => s.u === u) || null; },
        slots(){ return st().stable.reduce((a, s) => a + (D()[s.id] ? D()[s.id].slots : 1), 0); },
        companion(){ const r = st(); return r.comp ? R.find(r.comp) : null; },
        setComp(u){ const r = st(); if(u && !R.find(u)) return {ok: false, msg: "？"}; r.comp = u || null; return {ok: true, msg: u ? D()[R.find(u).id].n + " を あいぼうに した！" : "あいぼうを やすませた。"}; },
        noteKill(id){ const r = st(); r.kill[id] = (r.kill[id] || 0) + 1; r.seen[id] = 1; },
        noteSeen(id){ st().seen[id] = 1; },
        add(id, lv, how){
            const r = st(), m = D()[id]; if(!m) return {ok: false, msg: "そんな モンスターは いない。"};
            if(R.slots() + m.slots > STABLE_MAX) return {ok: false, msg: "ぼくじょうが いっぱいです！（" + STABLE_MAX + "わく）"};
            const s = {u: r.uid++, id, lv: Math.max(1, Math.min(MON_MAXLV, lv || 1)), exp: 0, plus: 0, sk: (m.sk || []).slice(0, 2), from: how || ""};
            r.stable.push(s); r.seen[id] = 1; if(how === "scout") r.cnt.scout++; if(!r.comp) r.comp = s.u;
            return {ok: true, msg: m.n + " Lv" + s.lv + " が なかまに なった！" + (r.comp === s.u ? "（あいぼうに なった）" : "（ぼくじょうに あずけた）"), mon: s};
        },
        stat(s){ const m = D()[s.id], t = monStat(m, s.lv), k = 1 + (s.plus || 0) / 100; return {maxhp: Math.round(t.maxhp * k), atk: Math.round(t.atk * k), def: Math.round(t.def * k), spd: t.spd}; },
        gain(s, exp){
            let ups = 0; if(s.lv >= MON_MAXLV){ s.exp = 0; return 0; } s.exp += Math.max(0, Math.round(exp));
            while(s.lv < MON_MAXLV && s.exp >= monNeed(s.lv)){ s.exp -= monNeed(s.lv); s.lv++; ups++; if(s.lv % 5 === 0) s.plus = Math.min(99, (s.plus || 0) + 1); }
            if(s.lv >= MON_MAXLV) s.exp = 0; return ups;
        },
        release(u){ const r = st(); r.stable = r.stable.filter((s) => s.u !== u); if(r.comp === u) r.comp = null; },
        // ---- はいごう：2ひきから、かならず おなじ 2パターンが きまる
        breedPatterns(a, b){
            const A = D()[a.id], B = D()[b.id], key = [a.id, b.id].sort().join("+"); const ia = RANKS.indexOf(A.rank), ib = RANKS.indexOf(B.rank);
            const plusAvg = ((a.plus || 0) + (b.plus || 0)) / 2; const target = Math.min(7, Math.max(ia, ib) + Math.floor(plusAvg / 25));
            const cand = Object.values(D()).filter((m) => !m.reinc && !m.breedOnly && !m.casino && m.scout).map((m) => ({m, d: Math.abs(RANKS.indexOf(m.rank) - target), h: hash(key + m.id)}));
            cand.sort((x, y) => x.d - y.d || x.h - y.h); return {list: [cand[0].m, cand[1].m], target, key};
        },
        breed(ua, ub){
            const r = st(), a = R.find(ua), b = R.find(ub);
            if(!a || !b || a === b) return {ok: false, msg: "べつの 2ひきを えらんでね。"};
            if(!(ctx.S.inv.shizuku > 0)) return {ok: false, msg: "『はいごうの しずく』が ひつよう です。（カジノの けいひんと こうかん）"};
            const A = D()[a.id], B = D()[b.id]; if(A.reinc || B.reinc || A.casino || B.casino) return {ok: false, msg: "この モンスターは はいごう できない。"};
            const pat = R.breedPatterns(a, b); const child = pat.list[rnd() < .65 ? 0 : 1];
            const U = []; (a.sk || []).concat(b.sk || []).forEach((x) => { if(!U.includes(x)) U.push(x); });
            for(let i = U.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [U[i], U[j]] = [U[j], U[i]]; }
            const plusAvg = ((a.plus || 0) + (b.plus || 0)) / 2; const keep = plusAvg < 10 && rnd() < .3 ? 0 : (plusAvg >= 30 ? 2 : 1); const kept = U.slice(0, keep), extra = U.slice(keep);
            const plus = Math.min(99, Math.floor(((a.plus || 0) + (b.plus || 0)) * .6) + 1 + Math.floor(rnd() * 3));
            ctx.S.inv.shizuku--; const oldS = r.stable.slice(), oldC = r.comp;
            r.stable = r.stable.filter((s) => s !== a && s !== b); if(r.comp === a.u || r.comp === b.u) r.comp = null;
            const res = R.add(child.id, Math.floor((a.lv + b.lv) / 4) + 1, "breed");
            if(!res.ok){ r.stable = oldS; r.comp = oldC; ctx.S.inv.shizuku++; return res; }
            res.mon.plus = plus; res.mon.sk = kept.length ? kept : (child.sk || []).slice(0, 1);
            let msg = A.n + " と " + B.n + " を はいごう…！\n" + res.msg + "（" + child.rank + "ランク・プラス+" + plus + "）";
            if(extra.length >= 2){ const id = extra.length >= 4 ? "MON010" : extra.length === 3 ? "MON009" : "MON008"; const am = R.add(id, 1, "breed"); if(am.ok){ am.mon.sk = extra.slice(); am.mon.plus = 0; msg += "\nあまった とくぎから「" + D()[id].n + "」が うまれた！"; } }
            r.cnt.breed++; return {ok: true, msg, child: res.mon};
        },
        // ---- てんせい
        reincTarget(s){ return D()[s.id].reincTo || null; },
        reinc(u){
            const r = st(), s = R.find(u); if(!s) return {ok: false, msg: "？"}; const t = R.reincTarget(s);
            if(!t) return {ok: false, msg: "この モンスターは てんせい できない。"};
            if((r.kill[s.id] || 0) < 5) return {ok: false, msg: "もとの モンスターを 5かい たおすと てんせい できる。（いま " + (r.kill[s.id] || 0) + "かい）"};
            const nm = D()[s.id].n; r.stable = r.stable.filter((x) => x !== s); const wasComp = r.comp === s.u; if(wasComp) r.comp = null;
            const res = R.add(t, Math.max(1, Math.floor(s.lv / 2)), "reinc"); if(!res.ok){ r.stable.push(s); if(wasComp) r.comp = s.u; return res; }
            res.mon.plus = s.plus || 0; res.mon.sk = (s.sk || []).slice(0, 2); if(wasComp) r.comp = res.mon.u; r.cnt.reinc++;
            return {ok: true, msg: nm + " は まばゆい ひかりに つつまれた…！\n" + res.msg, mon: res.mon};
        },
        // ---- 格闘場（じどうで たたかう 3かいせん）
        duel(sa, sb, na, nb){
            let ha = sa.maxhp, hb = sb.maxhp, turn = 0;
            while(ha > 0 && hb > 0 && turn < 60){ turn++; const a1 = rnd() * 6 + sa.agi >= rnd() * 6 + sb.agi;
                const hit = (x, y) => Math.max(1, Math.round((x.atk - y.def / 2) * (.88 + rnd() * .24) * (rnd() < .0625 ? 1.7 : 1)));
                if(a1){ hb -= hit(sa, sb); if(hb > 0) ha -= hit(sb, sa); } else { ha -= hit(sb, sa); if(ha > 0) hb -= hit(sa, sb); } }
            return {win: ha > hb, log: na + " " + Math.max(0, ha) + " ー " + Math.max(0, hb) + " " + nb + "（" + turn + "ターン）"};
        },
        arena(u, rank){
            const r = st(), s = R.find(u); if(!s) return {ok: false, msg: "ぼくじょうから えらんでね。"}; const m = D()[s.id]; rank = rank || m.rank;
            const pool = Object.values(D()).filter((x) => x.rank === rank && !x.reinc && !x.casino && x.id !== s.id); if(pool.length < 3) return {ok: false, msg: "あいてが いない"};
            const A = R.stat(s); A.agi = 8 + s.lv * .6; const rounds = []; let wins = 0;
            for(let i = 0; i < 3; i++){
                const f = pool[Math.floor(rnd() * pool.length)], lv = Math.max(1, Math.min(MON_MAXLV, s.lv + Math.floor(rnd() * 5) - 2)); const t = monStat(f, lv); const B = {maxhp: t.maxhp, atk: t.atk, def: t.def, agi: 8 + lv * .6};
                const d = R.duel(A, B, m.n, f.n); rounds.push({foe: f.n, lv, win: d.win, log: d.log}); if(d.win) wins++; else break;
            }
            const ri = RANKS.indexOf(rank), champ = wins === 3;
            const gold = Math.round(GLD[ri] * (1 + s.lv / 10) * (champ ? 12 : wins * 3)), coins = Math.round((champ ? 40 : wins * 8) * (1 + ri * .6)), exp = Math.round(EXP[ri] * (1 + s.lv / 8) * (champ ? 3 : wins));
            ctx.S.gold += gold; ctx.S.coins = (ctx.S.coins || 0) + coins; const ups = R.gain(s, exp); r.cnt.arena += wins; if(champ){ r.arena[rank] = (r.arena[rank] || 0) + 1; if(rank === "S"){ const T = ctx.S.titles || (ctx.S.titles = []); if(!T.includes("格闘場の頂点")) T.push("格闘場の頂点"); } }
            return {ok: true, rounds, wins, champion: champ, gold, coins, exp, ups, msg: champ ? "ゆうしょう！ " + rank + "ランクの 王者に なった！" : wins + "しょう で やぶれた…"};
        }
    };
    return R;
}
