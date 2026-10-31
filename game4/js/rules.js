"use strict";
// ===== ARE CARD 〜そういうときは、AREだ！〜 盤面ルール（描画に依存しない純粋なロジック）=====
// 完全オリジナルの規則。1ゲームは必ず終わるように、ターン数と行動数に上限を置く（フリーズ防止）。
export const LIMITS = {baseHp: 20, deck: 30, hand: 9, slots: 5, maxLamps: 10, startHand: 4, maxTurns: 80, maxActionsPerTurn: 60, areHp: 10};

export function makeRng(seed){ let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const shuffle = (a, rnd) => { for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Game{
    // db: {id: カード}, decks: [{list:[id], are:id, name}, ...], opt: {seed, emit(ev)->Promise|void, askARE(player, ctx)->Promise<boolean>, first}
    constructor(db, decks, opt){
        this.db = db; this.opt = opt || {}; this.rnd = makeRng(this.opt.seed || 1); this.emitFn = this.opt.emit || null; this.askARE = this.opt.askARE || null;
        this.uid = 1; this.turnNo = 0; this.over = null; this.log = []; this.actions = 0;
        this.p = decks.map((d, i) => ({id: i, name: d.name || (i ? "CPU" : "あなた"), base: {hp: LIMITS.baseHp, max: LIMITS.baseHp}, lamps: 0, maxLamps: 0, bonus: 0,
            deck: shuffle(d.list.slice(), this.rnd), hand: [], board: Array(LIMITS.slots).fill(null), are: d.are || null, areUsed: false, fatigue: 0}));
        this.turn = this.opt.first === undefined ? (this.rnd() < .5 ? 0 : 1) : this.opt.first;
    }
    async emit(ev){ this.log.push(ev); if(this.log.length > 400) this.log.shift(); if(this.emitFn){ try{ await this.emitFn(ev); }catch(_e){} } }
    me(){ return this.p[this.turn]; }
    foe(){ return this.p[1 - this.turn]; }
    card(id){ return this.db[id]; }
    unitAt(pi, slot){ return this.p[pi].board[slot]; }
    guards(pi){ return this.p[pi].board.map((u, i) => (u && u.guard ? i : -1)).filter((i) => i >= 0); }
    // ---------- 開始 ----------
    async start(){
        for(const pl of this.p){ for(let i = 0; i < LIMITS.startHand; i++) await this.draw(pl, true); }
        await this.emit({type: "start", first: this.turn});
        await this.beginTurn();
    }
    async draw(pl, quiet){
        if(!pl.deck.length){ pl.fatigue++; await this.hitBase(pl, pl.fatigue, null, "fatigue"); return null; }
        const id = pl.deck.pop();
        if(pl.hand.length >= LIMITS.hand){ await this.emit({type: "burn", p: pl.id, id}); return null; }
        pl.hand.push(id); if(!quiet) await this.emit({type: "draw", p: pl.id, id}); return id;
    }
    async beginTurn(){
        const pl = this.me(); this.turnNo++; this.actions = 0;
        pl.maxLamps = Math.min(LIMITS.maxLamps, pl.maxLamps + 1); pl.lamps = pl.maxLamps + pl.bonus; pl.bonus = 0;
        for(const u of pl.board) if(u){ u.sick = false; u.acted = false; }
        await this.emit({type: "turn", p: pl.id, n: this.turnNo});
        await this.draw(pl);
        if(this.turnNo > LIMITS.maxTurns * 2 && !this.over) await this.finishByLimit();
    }
    async finishByLimit(){ const a = this.p[0].base.hp, b = this.p[1].base.hp; this.over = {winner: a === b ? (this.rnd() < .5 ? 0 : 1) : (a > b ? 0 : 1), why: "limit"}; await this.emit({type: "over", ...this.over}); }
    async endTurn(){
        if(this.over) return false;
        await this.emit({type: "end", p: this.turn});
        this.turn = 1 - this.turn; await this.beginTurn(); return true;
    }
    // ---------- 判定 ----------
    canPlay(pi, handIdx){
        const pl = this.p[pi]; const id = pl.hand[handIdx]; if(!id) return {ok: false, why: "カードがない"};
        const c = this.db[id]; if(pi !== this.turn || this.over) return {ok: false, why: "自分のターンではない"};
        if(c.cost > pl.lamps) return {ok: false, why: "灯が たりない"};
        if(c.t === "unit" && pl.board.every((u) => u)) return {ok: false, why: "場がいっぱい"};
        return {ok: true, c};
    }
    // 呪文の対象の種類: enemy(敵ユニット) / any(敵ユニットか敵本拠地) / ally(味方ユニット) / null
    targetsOf(pi, c){
        const foe = this.p[1 - pi], me = this.p[pi]; const out = [];
        const eu = () => foe.board.forEach((u, i) => { if(u) out.push({t: "unit", side: 1 - pi, slot: i}); });
        if(c.tg === "enemy") eu();
        else if(c.tg === "any"){ eu(); out.push({t: "base", side: 1 - pi}); }
        else if(c.tg === "ally") me.board.forEach((u, i) => { if(u) out.push({t: "unit", side: pi, slot: i}); });
        return out;
    }
    async playUnit(pi, handIdx, slot){
        const ck = this.canPlay(pi, handIdx); if(!ck.ok || ck.c.t !== "unit") return false;
        const pl = this.p[pi]; if(slot === undefined || slot < 0 || slot >= LIMITS.slots || pl.board[slot]) slot = pl.board.findIndex((u) => !u);
        if(slot < 0) return false; if(!this.tick()) return false;
        const c = ck.c; pl.hand.splice(handIdx, 1); pl.lamps -= c.cost;
        const u = {uid: this.uid++, id: c.id, atk: c.atk, hp: c.hp, max: c.hp, guard: c.kw.includes("guard"), haste: c.kw.includes("haste"), sick: !c.kw.includes("haste"), acted: false};
        pl.board[slot] = u; await this.emit({type: "summon", p: pi, slot, id: c.id, uid: u.uid});
        for(const f of c.fx) if(f.on === "play") await this.runFx(pi, f, {slot});
        await this.sweep(); return true;
    }
    async playSpell(pi, handIdx, target){
        const ck = this.canPlay(pi, handIdx); if(!ck.ok || ck.c.t !== "spell") return false;
        const c = ck.c; const tl = this.targetsOf(pi, c);
        const needs = c.tg === "enemy" || c.tg === "any" || c.tg === "ally"; if(needs && !tl.some((x) => target && x.t === target.t && x.side === target.side && x.slot === target.slot)) return false; if(!target) target = {t: "none"};
        if(!this.tick()) return false;
        const pl = this.p[pi]; pl.hand.splice(handIdx, 1); pl.lamps -= c.cost;
        await this.emit({type: "spell", p: pi, id: c.id, target});
        await this.spellEffect(pi, c, target); await this.sweep(); return true;
    }
    tick(){ if(++this.actions > LIMITS.maxActionsPerTurn){ return false; } return true; }
    async spellEffect(pi, c, tg){
        const me = this.p[pi], foe = this.p[1 - pi]; const v = c.v;
        const hitT = async () => { if(tg.t === "base") await this.hitBase(foe, v, null, "spell"); else { const u = foe.board[tg.slot]; if(u) await this.hurtUnit(1 - pi, tg.slot, v, "spell"); } };
        switch(c.op){
            case "dmg": if(c.tg === "allEnemy"){ for(let i = 0; i < LIMITS.slots; i++) if(foe.board[i]) await this.hurtUnit(1 - pi, i, v, "spell"); } else { await hitT(); if(c.n === "一閃") await this.draw(me); } break;
            case "draw": for(let i = 0; i < v; i++) await this.draw(me); break;
            case "heal": await this.healBase(me, v); break;
            case "buff": { const u = me.board[tg.slot]; if(u){ u.atk += v; u.hp += v; u.max += v; await this.emit({type: "buff", p: pi, slot: tg.slot}); } break; }
            case "haste": { const u = me.board[tg.slot]; if(u){ u.atk += v; u.haste = true; u.sick = false; await this.emit({type: "buff", p: pi, slot: tg.slot}); } break; }
            case "lamp": me.lamps = Math.min(LIMITS.maxLamps + 3, me.lamps + v); await this.emit({type: "lamp", p: pi}); break;
            case "destroy": { const u = foe.board[tg.slot]; if(u && u.hp <= v) await this.hurtUnit(1 - pi, tg.slot, 999, "spell"); break; }
            case "healdraw": await this.healBase(me, v); await this.draw(me); break;
            case "bigl": for(let i = 0; i < LIMITS.slots; i++) if(foe.board[i]) await this.hurtUnit(1 - pi, i, v, "spell"); await this.healBase(me, v); break;
            case "healAlly": for(let i = 0; i < LIMITS.slots; i++){ const u = me.board[i]; if(u){ u.hp = Math.min(u.max, u.hp + v); } } await this.emit({type: "heal", p: pi, all: 1}); break;
            case "stormDraw": for(let i = 0; i < v; i++) await this.draw(me); me.lamps = Math.min(LIMITS.maxLamps + 3, me.lamps + 1); break;
            default: break;
        }
    }
    // 登場時の効果
    async runFx(pi, f, ctx){
        const me = this.p[pi], foe = this.p[1 - pi];
        if(f.op === "draw") for(let i = 0; i < f.n; i++) await this.draw(me);
        else if(f.op === "heal") await this.healBase(me, f.n);
        else if(f.op === "dmg" && f.t === "allEnemy"){ for(let i = 0; i < LIMITS.slots; i++) if(foe.board[i]) await this.hurtUnit(1 - pi, i, f.n, "fx"); }
        else if(f.op === "dmg" && f.t === "randUnit"){ const cand = foe.board.map((u, i) => (u ? i : -1)).filter((i) => i >= 0); if(cand.length) await this.hurtUnit(1 - pi, cand[Math.floor(this.rnd() * cand.length)], f.n, "fx"); }
    }
    async healBase(pl, n){ const b = pl.base; const g = Math.min(n, b.max - b.hp); b.hp += g; await this.emit({type: "healBase", p: pl.id, n: g}); }
    async hurtUnit(pi, slot, n, src){
        const u = this.p[pi].board[slot]; if(!u) return; u.hp -= n; await this.emit({type: "hurt", p: pi, slot, n, src});
    }
    async hitBase(pl, n, attacker, src){
        if(this.over) return; pl.base.hp -= n; await this.emit({type: "hitBase", p: pl.id, n, src});
        if(pl.base.hp <= 0){ pl.base.hp = 0; this.over = {winner: 1 - pl.id, why: "base"}; await this.emit({type: "over", ...this.over}); }
    }
    async sweep(){
        for(let pi = 0; pi < 2; pi++) for(let i = 0; i < LIMITS.slots; i++){ const u = this.p[pi].board[i]; if(u && u.hp <= 0){ this.p[pi].board[i] = null; await this.emit({type: "die", p: pi, slot: i, id: u.id, uid: u.uid}); } }
    }
    // ---------- 攻撃 ----------
    canAttack(pi, slot, tg){
        if(this.over || pi !== this.turn) return false; const u = this.p[pi].board[slot]; if(!u || u.sick || u.acted || u.atk <= 0) return false;
        const g = this.guards(1 - pi);
        if(tg.t === "base") return g.length === 0;
        const t = this.p[1 - pi].board[tg.slot]; if(!t) return false; return g.length === 0 || t.guard;
    }
    async attack(pi, slot, tg){
        if(!this.canAttack(pi, slot, tg) || !this.tick()) return false;
        const me = this.p[pi], foe = this.p[1 - pi]; const u = me.board[slot]; u.acted = true;
        await this.emit({type: "attack", p: pi, slot, target: tg});
        if(tg.t === "base"){
            let cancelled = false;
            if(this.canARE(foe)){ const ans = this.askARE ? await this.askARE(foe, {attacker: u, slot, from: pi}) : false; if(ans) cancelled = await this.useARE(foe.id, pi, slot); }
            if(!cancelled && !this.over && me.board[slot]) await this.hitBase(foe, u.atk, u, "attack");
        } else {
            const t = foe.board[tg.slot]; const dmgIn = u.atk, dmgBack = t.atk;
            await this.hurtUnit(1 - pi, tg.slot, dmgIn, "attack"); await this.hurtUnit(pi, slot, dmgBack, "counter");
        }
        await this.sweep(); return true;
    }
    canARE(pl){ return !!pl.are && !pl.areUsed && pl.base.hp <= LIMITS.areHp && !this.over; }
    // 守る側（pl）が「AREだ！」。返り値: 攻撃を無効にしたか
    async useARE(defId, atkPi, atkSlot){
        const pl = this.p[defId], foe = this.p[atkPi]; const c = this.db[pl.are]; pl.areUsed = true;
        await this.emit({type: "are", p: defId, id: c.id});
        let cancel = true;
        if(c.op === "guard") await this.healBase(pl, 5);
        else if(c.op === "counter"){ const u = foe.board[atkSlot]; if(u) await this.hurtUnit(atkPi, atkSlot, 999, "are"); await this.hitBase(foe, 3, null, "are"); }
        else if(c.op === "draw3"){ for(let i = 0; i < 3; i++) await this.draw(pl); }
        else if(c.op === "turn"){ for(let i = 0; i < LIMITS.slots; i++) if(foe.board[i]) await this.hurtUnit(atkPi, i, 4, "are"); pl.bonus += 2; }
        await this.sweep(); return cancel;
    }
    // ---------- 行動の一覧（CPU用）----------
    legal(pi){
        const out = []; if(this.over || pi !== this.turn) return out; const pl = this.p[pi], foe = this.p[1 - pi];
        pl.hand.forEach((id, hi) => {
            const ck = this.canPlay(pi, hi); if(!ck.ok) return; const c = ck.c;
            if(c.t === "unit") out.push({k: "unit", hi, c});
            else if(c.t === "spell"){ if(!(c.tg === "enemy" || c.tg === "any" || c.tg === "ally")) out.push({k: "spell", hi, c, target: {t: "none"}}); else for(const t of this.targetsOf(pi, c)) out.push({k: "spell", hi, c, target: t}); }
        });
        pl.board.forEach((u, s) => {
            if(!u) return; foe.board.forEach((t, ts) => { if(t && this.canAttack(pi, s, {t: "unit", slot: ts})) out.push({k: "attack", slot: s, target: {t: "unit", side: 1 - pi, slot: ts}}); });
            if(this.canAttack(pi, s, {t: "base"})) out.push({k: "attack", slot: s, target: {t: "base", side: 1 - pi}});
        });
        return out;
    }
    async doAction(pi, a){
        if(a.k === "unit") return this.playUnit(pi, a.hi);
        if(a.k === "spell") return this.playSpell(pi, a.hi, a.target);
        if(a.k === "attack") return this.attack(pi, a.slot, a.target);
        return false;
    }
}
