"use strict";
import {openDreamFrontier} from "./dfembed.js";
// ===== まちの しせつ（職業所・ぼくじょう・格闘場・カジノ）と、メニューの つよさ／じゅもん／ずかん =====
import {statsOf, expNeed, G, abilitiesOf, canJob, changeJob, JOB_MAX, JOB_MIN_LV, RANKS, monNeed} from "./rules.js";
import {playGame} from "./casino.js";

const RK = {G: "G", F: "F", E: "E", D: "D", C: "C", B: "B", A: "A", S: "S"};
export class Places{
    constructor(ctx){ this.c = ctx; }
    get UI(){ return this.c.UI; } get S(){ return this.c.S; } get D(){ return this.c.data; }
    nm(m){ return this.D.members[m.id].name.replace("{name}", this.S.name); }
    async facility(n){
        const f = n.fac; if(f === "job") return this.jobHall(); if(f === "ranch") return this.ranchMenu(); if(f === "arena") return this.arenaMenu();
        if(f === "park"){ this.c.UI.hideDlg(); return openDreamFrontier(this.c).then((r) => r === null ? this.c.park.enter() : r); } if(f === "coin") return this.coinExchange(); if(f === "prize") return this.prizeCounter(); if(f.startsWith("game:")) return this.gameDesk(f.slice(5));
    }
    // ---------- つよさ ----------
    async status(){
        const {UI, S, D} = this; let idx = 0;
        for(;;){
            const r = await UI.menu("つよさ", S.party.map((m) => { const st = statsOf(m, D.members); const j = m.job && G.jobs[m.job]; return {label: this.nm(m) + "　Lv" + m.lv, meta: "HP " + m.hp + "/" + st.maxhp + "　MP " + (m.mp || 0) + "/" + st.maxmp + "　" + (j ? j.e + j.n : "ぼうけんしゃ")}; }), {cancel: true, index: idx, hint: "けってい：くわしく　B：もどる"});
            if(r < 0) return; idx = r; const m = S.party[r]; const st = statsOf(m, D.members); const j = m.job && G.jobs[m.job]; const js = j && m.jobs[m.job];
            await UI.menu(this.nm(m) + "　Lv" + m.lv, [
                {label: "HP", meta: m.hp + " / " + st.maxhp}, {label: "MP", meta: (m.mp || 0) + " / " + st.maxmp}, {label: "ちから", meta: st.atk}, {label: "まもり", meta: st.def}, {label: "すばやさ", meta: st.spd},
                {label: "けいけんち", meta: m.exp + " / " + expNeed(m.lv)}, {label: "職業", meta: j ? j.e + j.n + "　Lv" + js.lv + "/" + JOB_MAX : "ぼうけんしゃ（Lv" + JOB_MIN_LV + "から てんしょく）"},
                {label: "マスターした 職業", meta: m.mast.length ? m.mast.map((i) => G.jobs[i].n).join("・") : "なし"},
                {label: "おぼえた じゅもん", meta: abilitiesOf(m, "spell").length + "こ"}, {label: "おぼえた とくぎ", meta: abilitiesOf(m, "skill").length + "こ"}
            ], {cancel: true, hint: "B：もどる"});
        }
    }
    // ---------- じゅもん（メニューから：かいふく系だけ）----------
    async fieldSpells(){
        const {UI, S, D} = this; const H = ["heal", "healN", "healAll", "healAllN", "revive", "reviveAll", "mpRes", "cleanse", "warp"];
        for(;;){
            const w = await UI.menu("だれが つかう？", S.party.map((m) => ({label: this.nm(m), meta: "MP " + (m.mp || 0) + "/" + statsOf(m, D.members).maxmp})), {cancel: true}); if(w < 0) return;
            const m = S.party[w]; const list = abilitiesOf(m, "spell").concat(abilitiesOf(m, "skill")).filter((a) => a.ef.some((e) => H.includes(e[0])));
            if(!list.length){ UI.toast("つかえる じゅもんが ない"); continue; }
            for(;;){
                const r = await UI.menu(this.nm(m) + "　MP " + (m.mp || 0), list.map((a) => ({label: a.n, meta: "MP " + a.mp + "　" + a.d, disabled: (m.mp || 0) < a.mp})), {cancel: true}); if(r < 0) break;
                const a = list[r]; if(a.ef.some((e) => e[0] === "warp")){ const ok = await UI.menu("ワープしますか？（AREタウンへ）", [{label: "はい"}, {label: "いいえ"}], {cancel: true}); if(ok === 0){ m.mp -= a.mp; this.c.A.se("warp"); await this.c.warpMap("town"); return "warp"; } continue; }
                let targets;
                if(a.tg === "party") targets = S.party; else if(a.tg === "self") targets = [m];
                else { const rev = a.ef.some((e) => e[0] === "revive"); const t = await UI.menu("だれに つかう？", S.party.map((p) => ({label: this.nm(p), meta: "HP " + p.hp + "/" + statsOf(p, D.members).maxhp + "　MP " + (p.mp || 0), disabled: rev ? p.hp > 0 : p.hp <= 0})), {cancel: true}); if(t < 0) continue; targets = [S.party[t]]; }
                m.mp -= a.mp; this.c.A.se("heal"); let any = false;
                for(const t of targets){ const st = statsOf(t, D.members);
                    for(const e of a.ef){
                        if(e[0] === "heal" || e[0] === "healAll"){ if(t.hp > 0){ const b = t.hp; t.hp = Math.min(st.maxhp, t.hp + Math.round(st.maxhp * e[1])); any = any || t.hp > b; } }
                        else if(e[0] === "healN" || e[0] === "healAllN"){ if(t.hp > 0){ const b = t.hp; t.hp = Math.min(st.maxhp, t.hp + Math.round(e[1] * (1 + m.lv / 60))); any = any || t.hp > b; } }
                        else if(e[0] === "revive" || e[0] === "reviveAll"){ if(t.hp <= 0){ t.hp = Math.max(1, Math.round(st.maxhp * e[1])); any = true; } }
                        else if(e[0] === "mpRes"){ const b = t.mp || 0; t.mp = Math.min(st.maxmp, b + Math.round(st.maxmp * e[1])); any = any || t.mp > b; }
                    } }
                UI.toast(any ? a.n + "！" : "こうかが なかった…"); this.c.story && this.c.story.hud && this.c.story.hud();
            }
        }
    }
    // ---------- ずかん ----------
    async zukan(){
        const {UI, S, D} = this; const R = this.c.ranch.st(); const all = Object.values(D.mons).filter((m) => !m.casino || R.seen[m.id]);
        const seen = all.filter((m) => R.seen[m.id]).length;
        const list = all.sort((a, b) => a.id.localeCompare(b.id));
        let idx = 0;
        for(;;){
            const r = await UI.menu("モンスターずかん　" + seen + " / " + all.length, list.map((m) => ({label: m.id.slice(3) + " " + (R.seen[m.id] ? m.n : "？？？？"), meta: R.seen[m.id] ? m.rank + "ランク　" + m.cat + "　たおした " + (R.kill[m.id] || 0) : ""})), {cancel: true, index: idx, hint: "B：もどる"});
            if(r < 0) return; idx = r; const m = list[r]; if(!R.seen[m.id]) continue;
            await UI.menu(m.n, [{label: "ランク", meta: m.rank}, {label: "ぞく", meta: m.cat}, {label: "おおきさ", meta: m.sz === "L" ? "大（2わく）" : "小（1わく）"}, {label: "つよさ", meta: "HP" + m.hp + " ちから" + m.atk + " まもり" + m.def}, {label: "とくぎ", meta: m.sk.map((i) => G.ab[i].n).join("・")},
                {label: "スカウト", meta: m.scout ? "できる" : m.breedOnly ? "はいごうだけ" : "できない"}, {label: "たおした かず", meta: R.kill[m.id] || 0}].concat(m.reincTo ? [{label: "てんせい さき", meta: D.mons[m.reincTo].n}] : []), {cancel: true, hint: "B：もどる"});
        }
    }
    // ---------- 職業所 ----------
    async jobHall(){
        const {UI, S, D} = this;
        for(;;){
            const w = await UI.menu("だれが てんしょく する？", S.party.map((m) => { const j = m.job && G.jobs[m.job]; return {label: this.nm(m) + "　Lv" + m.lv, meta: j ? j.e + j.n + " Lv" + m.jobs[m.job].lv : "ぼうけんしゃ"}; }).concat([{label: "やめる"}]), {cancel: true});
            if(w < 0 || w >= S.party.length) break; const m = S.party[w];
            let idx = 0;
            for(;;){
                const jobs = D.jobs; const items = jobs.map((j) => {
                    const ok = canJob(m, j.id); const st = m.jobs[j.id]; const mast = m.mast.includes(j.id);
                    return {label: j.e + " " + j.n + (j.src === "new" ? " ★" : ""), meta: m.job === j.id ? "いま この職業 Lv" + st.lv : mast ? "マスター！" : st ? "Lv" + st.lv : (ok.ok ? "" : "？"), disabled: false};
                });
                const r = await UI.menu(this.nm(m) + "の 職業（★は あたらしい 職業）", items, {cancel: true, index: idx, hint: "けってい：くわしく／てんしょく　B：もどる"}); if(r < 0) break; idx = r;
                const j = jobs[r]; const st = m.jobs[j.id]; const pf = j.prof;
                const info = [j.d, "のびかた：HP " + Math.round(pf.hp * 100) + " MP " + Math.round(pf.mp * 100) + " ちから " + Math.round(pf.atk * 100) + " まもり " + Math.round(pf.def * 100) + " すばやさ " + Math.round(pf.agi * 100)];
                for(const id of j.ab){ const a = G.ab[id]; info.push((m.learned.includes(id) ? "◎ " : "・") + a.n + "（職業Lv" + a.jlv + "）　" + a.d); }
                for(const line of info.slice(0, 2)) await UI.say(j.n, line);
                const cmd = await UI.menu(j.n, [{label: "てんしょく する", disabled: m.job === j.id}, {label: "おぼえる わざを みる"}, {label: "やめる"}], {cancel: true}); if(cmd < 0 || cmd === 2) continue;
                if(cmd === 1){ await UI.menu(j.n + "の わざ", j.ab.map((id) => { const a = G.ab[id]; return {label: (m.learned.includes(id) ? "◎ " : "　") + a.n, meta: (a.t === "spell" ? "じゅもん" : "とくぎ") + " MP" + a.mp + "　職業Lv" + a.jlv}; }), {cancel: true, hint: "B：もどる"}); continue; }
                const ok = canJob(m, j.id, S.party); if(!ok.ok){ await UI.say("職業案内人", ok.why); continue; }
                const sure = await UI.menu(this.nm(m) + " を " + j.n + " に てんしょく しますか？（せいちょうの 半分が のこります）", [{label: "はい"}, {label: "いいえ"}], {cancel: true}); if(sure !== 0) continue;
                changeJob(m, j.id); const stt = statsOf(m, D.members); m.hp = Math.min(m.hp, stt.maxhp); m.mp = Math.min(m.mp || 0, stt.maxmp); this.c.A.jingle && this.c.A.se("levelup");
                await UI.say("職業案内人", this.nm(m) + "は " + j.n + " に てんしょく した！");
            }
        }
        await UI.say("職業案内人", "また いつでも どうぞ。");
    }
    // ---------- ぼくじょう ----------
    monLine(s){ const m = this.D.mons[s.id]; return m.n + (s.nick ? "" : "") + "　Lv" + s.lv; }
    async pickMon(title, filter){
        const R = this.c.ranch, st = R.st(); const list = st.stable.filter(filter || (() => true)); if(!list.length){ this.UI.toast("モンスターが いない"); return null; }
        const r = await this.UI.menu(title + "　（" + R.slots() + "/30わく）", list.map((s) => { const m = this.D.mons[s.id]; return {label: (st.comp === s.u ? "★ " : "") + this.monLine(s), meta: m.rank + "ランク　+" + (s.plus || 0)}; }), {cancel: true, hint: "けってい：えらぶ　B：もどる"});
        return r < 0 ? null : list[r];
    }
    async ranchMenu(){
        const {UI, S, D} = this; const R = this.c.ranch;
        for(;;){
            const st = R.st(); const r = await UI.menu("ぼくじょう　あずかり " + R.slots() + "/30わく　あいぼう：" + (R.companion() ? D.mons[R.companion().id].n : "なし"), [{label: "あいぼうを きめる"}, {label: "モンスターを みる"}, {label: "はいごう", meta: "しずく×" + (S.inv.shizuku || 0)}, {label: "てんせい"}, {label: "ぼくじょうから にがす"}, {label: "モンスターずかん"}, {label: "でる"}], {cancel: true});
            if(r < 0 || r === 6) break;
            if(r === 0){ const s = await this.pickMon("あいぼうに する モンスター"); if(s){ UI.toast(R.setComp(s.u).msg); } else if(st.comp){ const o = await UI.menu("あいぼうを やすませますか？", [{label: "やすませる"}, {label: "そのまま"}], {cancel: true}); if(o === 0) UI.toast(R.setComp(null).msg); } }
            else if(r === 1){ const s = await this.pickMon("みる"); if(s){ const m = D.mons[s.id], t = R.stat(s); await UI.menu(this.monLine(s), [{label: "ランク／ぞく", meta: m.rank + "／" + m.cat}, {label: "HP", meta: t.maxhp}, {label: "ちから", meta: t.atk}, {label: "まもり", meta: t.def}, {label: "すばやさ", meta: t.spd}, {label: "プラス", meta: "+" + (s.plus || 0) + "%"}, {label: "けいけんち", meta: s.exp + " / " + monNeed(s.lv)}, {label: "とくぎ", meta: (s.sk || []).map((i) => G.ab[i].n).join("・") || "なし"}, {label: "でどころ", meta: ({scout: "スカウト", breed: "はいごう", reinc: "てんせい", casino: "カジノ"})[s.from] || ""}], {cancel: true, hint: "B：もどる"}); } }
            else if(r === 2){ await this.breedUI(); }
            else if(r === 3){ await this.reincUI(); }
            else if(r === 4){ const s = await this.pickMon("にがす モンスター"); if(s){ const o = await UI.menu(D.mons[s.id].n + " を にがしますか？（もどりません）", [{label: "にがす"}, {label: "やめる"}], {cancel: true}); if(o === 0){ R.release(s.u); UI.toast("バイバイ…！"); } } }
            else if(r === 5) await this.zukan();
        }
        await UI.say("牧場主", "また おいでよ。");
    }
    async breedUI(){
        const {UI, S, D} = this; const R = this.c.ranch;
        await UI.say("牧場主", "はいごうは 2ひきを あわせて あたらしい モンスターを うむんだ。『はいごうの しずく』が 1こ いるよ。（レベルは ひくくなるけど プラスが たまる！）");
        const a = await this.pickMon("ひとりめ", (s) => !D.mons[s.id].reinc && !D.mons[s.id].casino); if(!a) return;
        const b = await this.pickMon("ふたりめ", (s) => s !== a && !D.mons[s.id].reinc && !D.mons[s.id].casino); if(!b) return;
        const pat = R.breedPatterns(a, b);
        const o = await UI.menu(D.mons[a.id].n + " ＋ " + D.mons[b.id].n + "　→　" + pat.list.map((m) => m.n).join(" か ") + "（どちらか）", [{label: "はいごう する（しずく×1）"}, {label: "やめる"}], {cancel: true}); if(o !== 0) return;
        const r = R.breed(a.u, b.u); this.c.A.se(r.ok ? "levelup" : "cancel"); for(const line of r.msg.split("\n")) await UI.say("牧場主", line);
    }
    async reincUI(){
        const {UI, D} = this; const R = this.c.ranch; const st = R.st();
        await UI.say("牧場主", "もとの モンスターを 5かい たおした ことが あれば、てんせいで ひかりの すがたに かわれるよ。（レベルは はんぶん）");
        const s = await this.pickMon("てんせい させる モンスター", (x) => !!D.mons[x.id].reincTo); if(!s) return;
        const t = D.mons[D.mons[s.id].reincTo]; const kills = st.kill[s.id] || 0;
        const o = await UI.menu(D.mons[s.id].n + " → " + t.n + "　（たおした かず " + kills + "/5）", [{label: "てんせい させる", disabled: kills < 5}, {label: "やめる"}], {cancel: true}); if(o !== 0) return;
        const r = R.reinc(s.u); this.c.A.se(r.ok ? "levelup" : "cancel"); this.c.UI.flash(); for(const line of r.msg.split("\n")) await UI.say("牧場主", line);
    }
    // ---------- 格闘場 ----------
    async arenaMenu(){
        const {UI, S, D} = this; const R = this.c.ranch;
        for(;;){
            const st = R.st(); const r = await UI.menu("格闘場　ゆうしょう " + Object.values(st.arena).reduce((a, b) => a + b, 0) + "かい", [{label: "しあいに でる"}, {label: "せんせきを みる"}, {label: "でる"}], {cancel: true}); if(r < 0 || r === 2) break;
            if(r === 1){ await UI.menu("せんせき", RANKS.split("").map((k) => ({label: k + "ランク", meta: "ゆうしょう " + (st.arena[k] || 0) + "かい"})).concat([{label: "さんかして かった しあい", meta: st.cnt.arena + "しょう"}]), {cancel: true}); continue; }
            const s = await this.pickMon("さんかする モンスター"); if(!s) continue; const m = D.mons[s.id];
            const ranks = RANKS.split("").filter((k) => RANKS.indexOf(k) <= RANKS.indexOf(m.rank));
            const rk = await UI.menu("どの ランクに ちょうせん する？（" + m.n + "は " + m.rank + "ランク）", ranks.map((k) => ({label: k + "ランク", meta: "ゆうしょう " + (st.arena[k] || 0) + "かい"})), {cancel: true, index: ranks.length - 1}); if(rk < 0) continue;
            const res = R.arena(s.u, ranks[rk]); if(!res.ok){ UI.toast(res.msg); continue; }
            await UI.say("アナウンス", m.n + " Lv" + s.lv + " の ちょうせん！ " + ranks[rk] + "ランク 3れんせん スタート！");
            let i = 1; for(const ro of res.rounds){ this.c.A.se(ro.win ? "hit" : "lose"); await UI.say("だい" + i + "しあい", ro.foe + " Lv" + ro.lv + "\n" + ro.log + (ro.win ? "　しょうり！" : "　まけた…")); i++; }
            this.c.A.jingle && (res.champion ? this.c.A.se("win") : 0);
            await UI.say("アナウンス", res.msg + "\n" + res.gold + "G と コイン" + res.coins + "まい と けいけんち" + res.exp + "を てにいれた！" + (res.ups ? "\nレベルが " + res.ups + " あがった！" : ""));
            this.c.story && this.c.story.hud && this.c.story.hud();
        }
        await UI.say("格闘場の受付", "またの ちょうせんを まってるよ！");
    }
    // ---------- カジノ ----------
    async coinExchange(){
        const {UI, S, D} = this; const rate = D.casino.rate;
        for(;;){
            const r = await UI.menu("コインこうかん　コイン " + (S.coins || 0) + "まい　" + S.gold + "G　（1まい = " + rate + "G）", [10, 50, 100, 500].map((n) => ({label: "コイン " + n + "まい", meta: n * rate + "G", disabled: S.gold < n * rate})).concat([{label: "やめる"}]), {cancel: true}); if(r < 0 || r === 4) break;
            const n = [10, 50, 100, 500][r]; S.gold -= n * rate; S.coins = (S.coins || 0) + n; this.c.A.se("ok"); UI.toast("コインを " + n + "まい てにいれた！");
            this.c.story && this.c.story.hud && this.c.story.hud();
        }
    }
    async prizeCounter(){
        const {UI, S, D} = this; S.got = S.got || {};
        for(;;){
            const list = D.casino.prizes; const r = await UI.menu("けいひん　コイン " + (S.coins || 0) + "まい", list.map((p) => ({label: p.n, meta: p.cost + "まい" + (p.once && S.got[p.id] ? "　（こうかんずみ）" : ""), disabled: (p.once && S.got[p.id]) || (S.coins || 0) < p.cost})).concat([{label: "やめる"}]), {cancel: true}); if(r < 0 || r >= list.length) break;
            const p = list[r]; const o = await UI.menu(p.n + " を " + p.cost + "まいで こうかん しますか？", [{label: "こうかん する"}, {label: "やめる"}], {cancel: true}); if(o !== 0) continue;
            if(p.monster){ const g = this.c.ranch.add(p.monster, 10, "casino"); if(!g.ok){ UI.toast(g.msg); continue; } UI.toast(g.msg); }
            else if(p.title){ (S.titles = S.titles || []); if(!S.titles.includes(p.title)) S.titles.push(p.title); UI.toast("称号『" + p.title + "』を てにいれた！"); }
            else if(p.item){ const it = D.items[p.item]; if(it.kind === "equip"){ S.equip = S.equip || {}; S.equip[p.item] = 1; const {setEquip} = await import("./rules.js"); setEquip(S); for(const m of S.party){ const st = statsOf(m, D.members); m.hp = Math.min(Math.max(m.hp, 1), st.maxhp); } UI.toast(it.name + " を そうびした！（" + it.desc + "）"); } else { S.inv[p.item] = (S.inv[p.item] || 0) + 1; UI.toast(it.name + " を てにいれた！"); } }
            S.coins -= p.cost; if(p.once) S.got[p.id] = 1; this.c.A.se("levelup");
        }
    }
    async gameDesk(gid){
        const {UI, S, D} = this; const g = D.casino.games.find((x) => x.id === gid); if(!g) return;
        for(;;){
            const r = await UI.menu(g.n + "　コイン " + (S.coins || 0) + "まい", [{label: "あそぶ", meta: ""}, {label: "あそびかた"}, {label: "やめる"}], {cancel: true}); if(r < 0 || r === 2) return;
            if(r === 1){ await UI.say(g.n, g.d); continue; }
            let lv = g.lv[0]; if(g.lv.length > 1){ const l = await UI.menu("むずかしさ", g.lv.map((x) => ({label: x.n, meta: typeof x.coin === "number" ? "ごほうび 〜" + x.coin + "まい" : ""})), {cancel: true}); if(l < 0) continue; lv = g.lv[l]; }
            this.c.UI.hideDlg(); const res = await playGame(this.c, g, lv);
            if(res){ S.coins = (S.coins || 0) + (res.coins || 0); const items = res.items || []; for(const id of items){ S.inv[id] = (S.inv[id] || 0) + 1; }
                await UI.say(g.n, (res.title ? res.title + "\n" : "") + (res.text || "") + "\nコイン " + (res.coins || 0) + "まい ゲット！" + (items.length ? "\n" + items.map((i) => D.items[i].name).join("・") + " も てにいれた！" : "")); }
        }
    }
}
