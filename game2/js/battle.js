"use strict";
// ===== ターン制バトル（3D表示：後ろ姿のパーティ＋3Dモンスター。DQ5ふうの コマンドと演出）=====
import {M4, Geo} from "./gl.js";
import {charMeshes, drawChar} from "./chars.js";
import {monsterModel, drawMonster, specOf} from "./mon3d.js";
import {Fx} from "./fx.js";
import {buildBackdrop} from "./world.js";
import {statsOf, gainExp, gainJobExp, damage, foeScale, monStat, abilitiesOf, G, RANKS} from "./rules.js";

// モンスターの種類ごとの こうげき演出（kind → ことば・エフェクト・動き）
const BASIC = {
    slime: {text: "の たいあたり！", fx: "hit", lunge: 1}, bat: {text: "の かみつき！", fx: "bite", lunge: 1}, mushroom: {text: "の ずつき！", fx: "hit", lunge: 1},
    ghost: {text: "は のろいの かげを はなった！", fx: "dark", cast: 1}, golem: {text: "は こぶしを たたきつけた！", fx: "quake", lunge: 1, mul: 1.1},
    dragon: {text: "の かみつき！", fx: "bite", lunge: 1, mul: 1.1}, fish: {text: "の たいあたり！", fx: "water", lunge: 1}, flower: {text: "の つるの いちげき！", fx: "slash", lunge: 1},
    robot: {text: "の ロケットパンチ！", fx: "hit", lunge: 1}, food: {text: "の ひっさつ たいあたり！", fx: "hit", lunge: 1}, armor: {text: "の はげしい きりつけ！", fx: "slash", lunge: 1, mul: 1.05},
    star: {text: "の きらきらアタック！", fx: "beam", cast: 1}, pad: {text: "は でんげきを はなった！", fx: "bolt", cast: 1}
};
// とくぎを もたない ものの とっておき（story のモンスター用）
const SPECIAL = {
    mushroom: {text: "は しびれる ほうしを ふりまいた！", fx: "petal", cast: 1, mul: .8, all: true}, ghost: {text: "は のろいの かげを はなった！", fx: "dark", cast: 1, mul: 1.0},
    golem: {text: "は ちめんを たたきつけた！", fx: "quake", lunge: 1, mul: 1.1, all: true}, dragon: {text: "は はげしい ほのおを はいた！", fx: "fire", breath: 1, mul: .8, all: true}
};
const BREATH = new Set(["fire", "ice", "beam", "bolt", "blast"]);
// 武器の3Dモデル（先が +Y 向き、にぎりが原点）
function makeWeapons(R){
    const W = {}; const mk = (fn) => { const g = new Geo(); fn(g); return R.mesh(g); };
    W.sword = mk((g) => { g.box(.14, 1.25, .05, "#e6eef8", M4.T(0, .28, 0)); g.box(.05, 1.0, .06, "#ffffff", M4.T(0, .34, .005)); g.box(.5, .1, .12, "#d8a838", M4.T(0, .2, 0)); g.cyl(.05, .05, .32, 6, "#6a3a1a", M4.T(0, -.1, 0)); g.sphere(.07, 6, 4, "#d8a838", M4.T(0, -.14, 0)); });
    W.spear = mk((g) => { g.cyl(.04, .04, 1.9, 6, "#8a5a2a", M4.T(0, -.5, 0)); g.cyl(0, .11, .5, 4, "#dfe6f0", M4.T(0, 1.4, 0), true); g.box(.2, .06, .08, "#d8a838", M4.T(0, 1.3, 0)); });
    W.axe = mk((g) => { g.cyl(.05, .05, 1.3, 6, "#7a4a1a", M4.T(0, -.25, 0)); g.box(.55, .5, .08, "#c8d0dc", M4.T(.25, .8, 0)); g.box(.2, .34, .1, "#8a98a8", M4.T(.04, .85, 0)); });
    W.wand = mk((g) => { g.cyl(.04, .05, 1.0, 6, "#a06ad8", M4.T(0, -.2, 0)); g.sphere(.17, 8, 6, "#ffd0f0", M4.T(0, .92, 0)); g.sphere(.1, 6, 4, "#ffffff", M4.T(0, .95, .05)); });
    W.fan = mk((g) => { g.cyl(.04, .04, .8, 6, "#8a5a2a", M4.T(0, -.2, 0)); g.sphere(.3, 8, 6, "#ff8a60", M4.T(0, .7, 0)); });
    return W;
}
const ease = (k) => k * k * (3 - 2 * k);
const lerpN = (a, b, k) => a + (b - a) * k;
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const newS = () => ({a: 0, d: 0, s: 0, da: 0, dd: 0, stun: 0, sleep: 0, guard: false, taunt: 0, ctr: 0, chg: 0, sum: null});

export class Battle{
    constructor(ctx){ this.c = ctx; this.active = false; this.t = 0; this.shake = 0; this.tweens = []; this.sprite = null; this.back = null; this.foes = []; this.party = []; this.lines = []; this.skipWait = false; this.intro = 0; this.passive = {}; }
    get fast(){ return this.c.UI.fast; }
    // ---------- 準備 ----------
    _setup(foeIds, opt){
        const {R, data, S} = this.c; const o = opt || {};
        if(!this.fx){ this.fx = new Fx(R); this.weap = makeWeapons(R); const sg = new Geo(); sg.cyl(.5, .5, .01, 14, [0, 0, 0], M4.T(0, .02, 0)); this.shadow = R.mesh(sg); }
        if(this.back) this.back.dispose(); this.back = buildBackdrop(R, o.ground || "field");
        const k = foeScale(S.chapter);
        this.foes = foeIds.map((id, i) => {
            const d = data.monsters[id]; const model = monsterModel(R, specOf(Object.assign({id}, d))); const sc = d.size / model.h * .9;
            const hp = Math.round(d.hp * k);
            return {kind: "e", id, d, name: d.name, model, sc, hp, maxhp: hp, atk: Math.round(d.atk * k), def: Math.round(d.def * k), spd: d.spd, size: d.size, lv: 1, x: 0, z: -1.2 - (i % 2) * 1.1, flash: 0, alpha: 1, lunge: 0, bob: Math.random() * 6, ko: false, dead: 0, aatk: 0, jaw: 0, sq: 0, s: newS(), sk: d.sk || [], rank: d.rank, stolen: false};
        });
        { const wd = this.foes.map((f) => Math.max(2.4, f.d.size * (f.model.spec.kind === "dragon" ? 1.8 : f.model.spec.kind === "bat" ? 1.5 : 1.0))); const tot = wd.reduce((s, v) => s + v, 0); let cur = -tot / 2; const sc = tot > 12 ? 12 / tot : 1; this.foes.forEach((f, i) => { f.x = (cur + wd[i] / 2) * sc; cur += wd[i]; }); }
        const humans = S.party.map((m) => { const d = data.members[m.id]; const st = statsOf(m, data.members); return {kind: "p", m, d, name: this._pname(m), P: charMeshes(R, d.look), st, flash: 0, guard: false, t: 0, hop: 0, step: 0, ox: 0, wa: .35, wp: d.weapon || "sword", s: newS(), x: 0, z: 3.4}; });
        const comp = this.c.ranch && this.c.ranch.companion ? this.c.ranch.companion() : null;
        if(comp && humans.length < 5){
            const md = data.mons[comp.id]; const ms = monStat(md, comp.lv); const pl = 1 + (comp.plus || 0) / 100;
            const st = {maxhp: Math.round(ms.maxhp * pl), maxmp: 99, atk: Math.round(ms.atk * pl), def: Math.round(ms.def * pl), spd: ms.spd};
            const model = monsterModel(R, specOf(Object.assign({id: comp.id}, {art: md.art}))); const sc = Math.min(1.7, md.size * .62) / model.h;
            humans.push({kind: "p", mon: true, comp, m: {hp: st.maxhp, mp: 99, lv: comp.lv, id: comp.id}, d: md, name: comp.nick || md.n, st, model, sc, flash: 0, guard: false, t: 0, hop: 0, step: 0, ox: 0, lunge: 0, aatk: 0, jaw: 0, sq: 0, dead: 0, s: newS(), x: 0, z: 3.4, sk: comp.sk && comp.sk.length ? comp.sk : md.sk, alpha: 1});
        }
        humans.forEach((p, i, arr) => { p.x = (i - (arr.length - 1) / 2) * 1.9; });
        this.party = humans;
        this.passive = {}; for(const p of this.party) if(!p.mon) for(const id of p.m.learned || []){ const a = G.ab[id]; if(a && a.pass) this.passive[a.pass] = 1; }
        this.fx.clear(); this.lines = []; this.autoAll = false; this.active = true; this.shake = 0; this.tweens = []; this.luck = (S.luckBattles > 0 ? 1.5 : 1); this.expMul = 1; this.flute = false; this.fled = false;
        this.intro = 0; this.c.UI.$("bt").hidden = false; ["hud", "prompt", "autoBadge"].forEach((i) => { const e = this.c.UI.$(i); if(e) e.style.visibility = "hidden"; }); this._panel(); this._logPaint();
    }
    _pname(m){ const d = this.c.data.members[m.id]; return (d.name || "").replace("{name}", this.c.S.name); }
    // ----- 共通のアクセサ（人・なかまモンスター・てき）
    hp(c){ return c.kind === "e" ? c.hp : c.m.hp; }
    setHp(c, v){ const mx = this.maxhp(c); const n = Math.max(0, Math.min(mx, Math.round(v))); if(c.kind === "e") c.hp = n; else c.m.hp = n; }
    maxhp(c){ return c.kind === "e" ? c.maxhp : c.st.maxhp; }
    alive(c){ return c.kind === "e" ? !c.ko && c.hp > 0 : c.m.hp > 0; }
    atkOf(c){ const b = c.kind === "e" ? c.atk : c.st.atk; return b * (c.s.a > 0 ? 1.35 : 1) * (c.s.da > 0 ? .75 : 1); }
    defOf(c){ const b = c.kind === "e" ? c.def : c.st.def; return b * (c.s.d > 0 ? 1.4 : 1) * (c.s.dd > 0 ? .7 : 1); }
    spdOf(c){ const b = c.kind === "e" ? c.spd : c.st.spd; return b * (c.s.s > 0 ? 1.4 : 1); }
    opp(c){ return (c.kind === "e" ? this.party : this.foes).filter((x) => this.alive(x)); }
    ally(c){ return (c.kind === "e" ? this.foes : this.party).filter((x) => this.alive(x)); }
    allyAll(c){ return c.kind === "e" ? this.foes : this.party; }
    pos(c){ return c.kind === "e" ? this._foeC(c) : this._partyC(c); }
    lvOf(c){ return c.kind === "e" ? Math.round(this.c.S.chapter * 1.3 + 1) : c.m.lv; }
    _panel(){
        const el = this.c.UI.$("btParty"); el.innerHTML = this.party.map((p) => {
            const maxhp = p.st.maxhp, hp = Math.max(0, p.m.hp); const low = hp > 0 && hp <= maxhp * .25;
            const mp = (!p.mon && p.st.maxmp) ? '<div class="r"><b>M</b>' + Math.max(0, p.m.mp || 0) + '</div>' : "";
            return '<div class="pb ' + (hp <= 0 ? "ko" : low ? "low" : "") + '"><div class="nm">' + esc(p.name) + '</div><div class="r"><b>H</b>' + hp + '</div>' + mp + '<div class="r"><b>Lv</b>' + p.m.lv + '</div><span class="bar"><i style="width:' + Math.round(100 * hp / maxhp) + '%"></i></span></div>';
        }).join("");
    }
    log(t){ this.lines.push(t); this._logPaint(); }
    _logPaint(){ this.c.UI.$("btLog").textContent = this.lines.slice(-3).join("\n"); }
    // ---------- 時間（アニメ・待ち）----------
    tween(sec, fn){ return new Promise((resolve) => { const d = this.fast ? .01 : sec; this.tweens.push({t: 0, d, fn, resolve}); }); }
    async wait(sec){ if(this.fast) return; let left = sec * 1000; while(left > 0 && this.active){ const step = Math.min(40, left); await sleepReal(step); left -= this.skipWait ? step * 4 : step; } this.skipWait = false; }
    update(dt){
        this.t += dt; this.intro += dt; this.shake = Math.max(0, this.shake - dt * 2.4);
        for(const tw of this.tweens.slice()){ tw.t += dt; const k = Math.min(1, tw.t / tw.d); tw.fn(k); if(k >= 1){ this.tweens.splice(this.tweens.indexOf(tw), 1); tw.resolve(); } }
        for(const f of this.foes){ f.flash = Math.max(0, f.flash - dt * 4); }
        if(this.fx) this.fx.update(dt);
        for(const p of this.party){ p.flash = Math.max(0, p.flash - dt * 4); p.t += dt; }
        if(this.c.Input.edge.ok) this.skipWait = true;
    }
    // ---------- 描画 ----------
    render(){
        const {R} = this.c; if(!this.back) return; const asp = R.w / R.h; const t = this.t;
        const sh = this.shake * .35; const ex = (Math.sin(t * 61) * sh), ey = Math.cos(t * 53) * sh * .6;
        const iv = Math.min(1, this.intro / 1.3), ie = 1 - Math.pow(1 - iv, 3);
        const cam = {eye: [ex + (1 - ie) * -8, 4.3 + ey + (1 - ie) * 3.5, 11 + (1 - ie) * 6], target: [(1 - ie) * -2, .75, 0], fov: asp < 1 ? 1.15 : .88};
        R.begin(cam, this.back.env); this.back.draw(cam);
        for(const f of this.foes){
            if(f.alpha <= 0.01) continue;
            drawMonster(R, f.model, {x: f.x, z: f.z, s: f.sc, t: t + f.bob, ph: f.bob, lunge: f.lunge * 5, flash: f.flash, alpha: f.alpha, sq: f.sq, dead: f.dead, atk: f.aatk, jaw: f.jaw, yaw: 0});
            R.draw(this.shadow, {m: M4.trs(f.x, 0, f.z, 0, f.d.size * .75), mode: 3, tint: [0, 0, 0, .3 * f.alpha], blend: true});
        }
        for(const p of this.party){
            const dead = p.m.hp <= 0;
            if(p.mon){
                drawMonster(R, p.model, {x: p.x + p.ox, z: p.z - p.step, s: p.sc, t: t + p.x, ph: p.x, lunge: -(p.lunge || 0) * 5, flash: p.flash, alpha: dead ? .35 : 1, sq: p.sq, dead: 0, atk: p.aatk, jaw: p.jaw, yaw: Math.PI});
                R.draw(this.shadow, {m: M4.trs(p.x + p.ox, 0, p.z - p.step, 0, p.d.size * .5), mode: 3, tint: [0, 0, 0, .3], blend: true});
                continue;
            }
            const tint = p.flash > 0 ? [1.6, .6, .6, 1] : (dead ? [.5, .5, .55, 1] : null);
            drawChar(R, p.P, {x: p.x + p.ox, z: p.z - p.step, y: 0, yaw: Math.PI, walk: p.step > .05 ? 1 : 0, t: p.t * 1.4, hop: p.hop}, {tint});
            if(!dead && this.weap[p.wp]){ const m = M4.mul(M4.T(p.x + p.ox + .5, 1.2 + p.hop, p.z - p.step - .15), M4.mul(M4.RX(p.wa), M4.RZ(-.15))); R.draw(this.weap[p.wp], {m, tint: tint || undefined, cull: false}); }
        }
        this.fx.draw(); R.flush();
    }
    _foePos(f){ return this.c.R.project([f.x, f.size * .75, f.z], this.c.cssW, this.c.cssH); }
    _partyPos(p){ return this.c.R.project([p.x, 1.6, p.z], this.c.cssW, this.c.cssH); }
    _foeC(f){ const m = f.model.center; return [f.x + m[0] * f.sc, m[1] * f.sc, f.z + m[2] * f.sc + .3]; }
    _foeMouth(f){ const m = f.model.mouth; return [f.x + m[0] * f.sc, m[1] * f.sc, f.z + m[2] * f.sc]; }
    _partyC(p){ return [p.x, 1.2, p.z]; }
    _cpos(c){ return c.kind === "e" ? this._foePos(c) : this._partyPos(c); }
    _num(text, pos, color){ if(this.fast || !pos.visible) return; this.c.UI.floater(text, pos.x, pos.y, color); }
    // ---------- 本編 ----------
    async run(foeIds, opt){
        const o = opt || {}; this._setup(foeIds, o); if(this.c.autoBattle) this.autoAll = true; this.boss = !!o.boss || this.foes.some((f) => f.d.boss); await this.c.UI.encounterOpen(); if(!this.fast) await this.wait(.5);
        const first = this.foes.map((f) => f.name);
        this.log(first.join("、") + "があらわれた！"); await this.wait(.9);
        let result = null;
        while(!result){
            const cmds = this.autoAll ? this._autoCmds() : await this._chooseAll();
            if(!this.active) return "run";
            const acts = [];
            this.party.forEach((p, i) => { if(p.m.hp > 0 && cmds[i]) acts.push({who: p, cmd: cmds[i], sp: this.spdOf(p) * (.8 + this.c.rnd() * .4)}); p.guard = false; p.s.guard = false; });
            this.foes.forEach((f) => { if(!f.ko){ f.s.guard = false; acts.push({who: f, cmd: {type: "foeai"}, sp: this.spdOf(f) * (.8 + this.c.rnd() * .4)}); } });
            acts.sort((a, b) => b.sp - a.sp);
            let runTried = false;
            for(const a of acts){
                if(!this.alive(a.who)) continue;
                if(a.cmd.type === "run"){
                    if(runTried) continue; runTried = true;
                    const ok = (!this.boss || this.passive.gflee) && (this.passive.gflee || this.c.rnd() < .65);
                    this.log(this.party[0].name + "たちは にげだした！"); await this.wait(.6);
                    if(ok){ result = "run"; break; } this.log("しかし まわりこまれてしまった！"); await this.wait(.6); continue;
                }
                await this._perform(a);
                if(this.fled){ result = "run"; break; }
                if(this.foes.every((f) => f.ko)){ result = "win"; break; }
                if(this.party.every((p) => p.m.hp <= 0)){ result = "lose"; break; }
            }
            if(!result) await this._endRound();
            if(this.autoAll && this.c.Input.edge.cancel) this.autoAll = false;
        }
        if(result === "win") await this._win(); else if(result === "lose"){ this.c.A.se("lose"); this.log("{name}たちは ちからつきた…".replace("{name}", this.c.S.name)); await this.wait(1.1); }
        this._finish(); this.result = result;
        return result;
    }
    _finish(){
        const UI = this.c.UI; this.active = false; ["hud", "prompt", "autoBadge"].forEach((i) => { const e = UI.$(i); if(e) e.style.visibility = ""; }); UI.$("bt").hidden = true; UI.$("btCmd").hidden = true; this.tweens = []; this.fx.clear();
        const S = this.c.S; if(S.luckBattles > 0) S.luckBattles--;
    }
    // ラウンドの おわり：ターン数のへらしと なかま（ぬいぐるみ等）の こうげき
    async _endRound(){
        for(const c of this.party.concat(this.foes)){
            const s = c.s; for(const k of ["a", "d", "s", "da", "dd", "taunt", "ctr"]) if(s[k] > 0) s[k]--;
            if(!this.alive(c)) continue;
            if(s.sum && s.sum.t > 0){
                s.sum.t--; const targets = this.opp(c); if(targets.length){
                    const t = targets[Math.floor(this.c.rnd() * targets.length)]; const d = Math.max(1, Math.round(this.atkOf(c) * s.sum.m * .6 * (.9 + this.c.rnd() * .2) - this.defOf(t) * .3));
                    this.log(c.name + "の おともだちが こうげき！"); this.fx.play("hit", this.pos(c), this.pos(t)); await this._hurt(t, d, c, {counterOK: false}); this._hitLog(t, d, false); await this._koCheck(); await this.wait(.4);
                }
                if(s.sum.t <= 0) s.sum = null;
            }
        }
        this._panel();
    }
    // ---------- コマンド（DQ5ふうの ならび）----------
    // 【たたかう／さくせん／にげる／どうぐ】→（たたかう）各キャラ【こうげき／じゅもん／とくぎ／ぼうぎょ／どうぐ】
    async _chooseAll(){
        const UI = this.c.UI, cmdEl = UI.$("btCmd");
        for(;;){
            const any = this._itemList().length > 0;
            cmdEl.hidden = false; cmdEl.innerHTML = '<div id="btCmdList"></div>';
            const r = await UI.list(UI.$("btCmdList"), [{label: "たたかう"}, {label: "さくせん"}, {label: "にげる"}, {label: "どうぐ", disabled: !any}], {cancel: false});
            cmdEl.hidden = true;
            if(r === 1){
                cmdEl.hidden = false; cmdEl.innerHTML = '<div class="who">さくせん</div><div id="btCmdList"></div>';
                const s = await UI.list(UI.$("btCmdList"), [{label: "めいれいさせろ"}, {label: "おまかせ"}], {cancel: true}); cmdEl.hidden = true;
                if(s === 1){ this.autoAll = true; this.log("おまかせ中…（X / Esc / Bボタンで解除）"); return this._autoCmds(); }
                continue;
            }
            if(r === 2){ const cmds = []; this.party.forEach((p, i) => { if(p.m.hp > 0) cmds[i] = {type: "run"}; }); return cmds; }
            const out = await this._chooseEach(r === 3 ? "item" : null); if(out === "back") continue; return out;
        }
    }
    async _chooseEach(first){
        const cmds = []; const idx = this.party.map((p, i) => i).filter((i) => this.party[i].m.hp > 0 && !this.party[i].mon);
        let k = 0, pre = first; while(k < idx.length){
            const c = await this._chooseOne(this.party[idx[k]], k === 0, pre); pre = null;
            if(c === "back"){ if(k > 0) k--; else return "back"; continue; }
            cmds[idx[k]] = c; k++;
        }
        this.party.forEach((p, i) => { if(p.mon && p.m.hp > 0) cmds[i] = {type: "monai"}; });
        return cmds;
    }
    async _chooseOne(p, first, pre){
        const UI = this.c.UI; const cmdEl = UI.$("btCmd");
        for(;;){
            let r;
            if(pre === "item"){ r = 4; pre = null; }
            else {
                const hasSp = abilitiesOf(p.m, "spell").length > 0, hasSk = abilitiesOf(p.m, "skill").length > 0;
                const items = [{label: "こうげき"}, {label: "じゅもん", disabled: !hasSp}, {label: "とくぎ", disabled: !hasSk}, {label: "ぼうぎょ"}, {label: "どうぐ", disabled: !this._itemList().length}];
                cmdEl.hidden = false; cmdEl.innerHTML = '<div class="who">' + esc(p.name) + '</div><div id="btCmdList"></div>';
                r = await UI.list(UI.$("btCmdList"), items, {cancel: true});
                cmdEl.hidden = true;
            }
            if(r === -1) return "back";
            if(r === 0){ const t = await this._pickFoe(); if(t) return {type: "attack", target: t}; continue; }
            if(r === 1 || r === 2){ const a = await this._pickAbility(p, r === 1 ? "spell" : "skill"); if(a) return a; continue; }
            if(r === 3) return {type: "guard"};
            if(r === 4){ const it = await this._pickItem(); if(it) return it; continue; }
        }
    }
    async _pickAbility(p, type){
        const UI = this.c.UI, cmdEl = UI.$("btCmd"); const list = abilitiesOf(p.m, type);
        for(;;){
            cmdEl.hidden = false; cmdEl.innerHTML = '<div class="who">' + (type === "spell" ? "じゅもん" : "とくぎ") + '　MP ' + (p.m.mp || 0) + '</div><div id="btCmdList" class="long"></div>';
            const r = await UI.list(UI.$("btCmdList"), list.map((a) => ({label: a.n, meta: a.mp + "", disabled: (p.m.mp || 0) < a.mp})), {cancel: true}); cmdEl.hidden = true;
            if(r < 0) return null;
            const a = list[r]; const tg = await this._pickTarget(p, a); if(tg === null) continue;
            return {type, ab: a, target: tg};
        }
    }
    // たいしょうの えらびかた（単体のときだけ ひとり えらぶ）
    async _pickTarget(p, a){
        if(a.tg === "foe") return await this._pickFoe() || null;
        if(a.tg === "ally"){ const revive = a.ef.some((e) => e[0] === "revive"); return await this._pickAlly(revive) || null; }
        return "auto";
    }
    async _pickFoe(){
        const alive = this.foes.filter((f) => !f.ko); if(alive.length === 1) return alive[0];
        const cmdEl = this.c.UI.$("btCmd"); cmdEl.hidden = false; cmdEl.innerHTML = '<div class="who">どれを ねらう？</div><div id="btCmdList"></div>';
        const r = await this.c.UI.list(this.c.UI.$("btCmdList"), alive.map((f) => ({label: f.name, meta: f.hp + "/" + f.maxhp})), {cancel: true}); cmdEl.hidden = true;
        return r < 0 ? null : alive[r];
    }
    async _pickAlly(revive){
        const cmdEl = this.c.UI.$("btCmd"); cmdEl.hidden = false; cmdEl.innerHTML = '<div class="who">だれに つかう？</div><div id="btCmdList"></div>';
        const r = await this.c.UI.list(this.c.UI.$("btCmdList"), this.party.map((p) => ({label: p.name, meta: "HP " + Math.max(0, p.m.hp) + "/" + p.st.maxhp, disabled: revive ? p.m.hp > 0 : p.m.hp <= 0})), {cancel: true}); cmdEl.hidden = true;
        return r < 0 ? null : this.party[r];
    }
    _itemList(){ const {S, data} = this.c; return Object.keys(data.items).filter((k) => (S.inv[k] || 0) > 0 && ["hp", "mp", "revive", "flute"].includes(data.items[k].kind)); }
    async _pickItem(){
        const {UI, S, data} = this.c; const list = this._itemList(); if(!list.length) return null;
        const cmdEl = UI.$("btCmd"); cmdEl.hidden = false; cmdEl.innerHTML = '<div class="who">どうぐ</div><div id="btCmdList"></div>';
        let r = await UI.list(UI.$("btCmdList"), list.map((k) => ({label: data.items[k].name, meta: "×" + S.inv[k]})), {cancel: true});
        if(r < 0){ cmdEl.hidden = true; return null; }
        const id = list[r]; const kind = data.items[id].kind; if(kind === "flute"){ cmdEl.hidden = true; return {type: "item", item: id, target: null}; }
        cmdEl.innerHTML = '<div class="who">だれに つかう？</div><div id="btCmdList"></div>';
        r = await UI.list(UI.$("btCmdList"), this.party.map((p) => ({label: p.name, meta: "HP " + Math.max(0, p.m.hp) + "/" + p.st.maxhp, disabled: kind === "revive" ? p.m.hp > 0 : p.m.hp <= 0})), {cancel: true}); cmdEl.hidden = true;
        return r < 0 ? null : {type: "item", item: id, target: this.party[r]};
    }
    // ---- おまかせ
    _autoCmds(){
        const alive = this.foes.filter((f) => !f.ko); const rnd = this.c.rnd;
        return this.party.map((p) => {
            if(p.m.hp <= 0 || !alive.length) return null; if(p.mon) return {type: "monai"};
            const weak = this.party.filter((q) => q.m.hp > 0 && q.m.hp < q.st.maxhp * .45).sort((a, b) => a.m.hp / a.st.maxhp - b.m.hp / b.st.maxhp)[0];
            const all = abilitiesOf(p.m, "spell").concat(abilitiesOf(p.m, "skill")).filter((a) => (p.m.mp || 0) >= a.mp && a.tg !== "ally" || (a.tg === "ally" && (p.m.mp || 0) >= a.mp));
            if(weak){ const h = all.filter((a) => a.ef.some((e) => ["heal", "healN"].includes(e[0])) && a.tg === "ally").sort((a, b) => b.mp - a.mp)[0]; if(h) return {type: h.t, ab: h, target: weak}; }
            if(rnd() < .4){ const d = all.filter((a) => a.ef.some((e) => ["dmg", "dmgAll", "multi", "crit"].includes(e[0])) && (a.tg === "foe" || a.tg === "foes") && a.mp <= (p.m.mp || 0) * .6); if(d.length){ const a = d[Math.floor(rnd() * d.length)]; return {type: a.t, ab: a, target: alive[Math.floor(rnd() * alive.length)]}; } }
            return {type: "attack", target: alive[Math.floor(rnd() * alive.length)]};
        });
    }
    // ---------- こうどう ----------
    async _perform(a){
        const w = a.who, cmd = a.cmd; const rnd = this.c.rnd;
        if(w.s.sleep > 0){ w.s.sleep--; this.log(w.name + "は ぐうぐう ねむっている…"); await this.wait(.5); return; }
        if(w.s.stun > 0){ w.s.stun--; this.log(w.name + "は うごけない！"); await this.wait(.5); return; }
        if(w.kind === "p" && !w.mon){
            if(cmd.type === "guard"){ w.guard = true; w.s.guard = true; this.log(w.name + "は みを まもっている。"); await this.wait(.5); return; }
            if(cmd.type === "item") return await this._useItem(w, cmd);
            if(cmd.type === "spell" || cmd.type === "skill") return await this._cast(w, cmd.ab, cmd.target);
            let tgt = cmd.target; if(!tgt || tgt.ko){ const al = this.foes.filter((f) => !f.ko); tgt = al[Math.floor(rnd() * al.length)]; } if(!tgt) return;
            this.log(w.name + "の こうげき！");
            await this._approach(w, tgt);
            const crit = this.passive.gcrit ? .5 : .0625;
            const dm = damage(this.atkOf(w) * this._takeCharge(w), this.defOf(tgt), rnd, {critRate: crit});
            await this._swing(w, tgt, dm);
            await this._hurt(tgt, dm.d, w, {crit: dm.crit}); this.c.A.se(dm.crit ? "crit" : "hit");
            this.log((dm.crit ? "かいしんの いちげき！ " : "") + tgt.name + "に " + dm.d + "の ダメージ！");
            this._retreat(w); await this._koCheck(); await this.wait(.35); return;
        }
        // 仲間モンスター・てき：じどうで こうどう
        return await this._ai(w);
    }
    _takeCharge(w){ const m = w.s.chg > 0 ? w.s.chg : 1; w.s.chg = 0; return m; }
    async _ai(w){
        const rnd = this.c.rnd; const side = this.opp(w); if(!side.length) return;
        const sks = (w.sk || []).map((id) => G.ab[id]).filter(Boolean);
        const sp = SPECIAL[w.model.spec.kind]; const HEALS = ["heal", "healN", "healAll", "healAllN"];
        if(sks.length && rnd() < (w.kind === "e" ? .5 : .4)){
            let a = sks[Math.floor(rnd() * sks.length)];
            if(a.ef.some((e) => HEALS.includes(e[0]))){ const weak = this.ally(w).filter((x) => this.hp(x) < this.maxhp(x) * .6); if(!weak.length){ const other = sks.filter((s) => !s.ef.some((e) => HEALS.includes(e[0]))); a = other.length ? other[Math.floor(rnd() * other.length)] : null; } }
            if(a){ const tg = a.tg === "foe" ? this._aiPick(w, side) : a.tg === "ally" ? this._weakest(this.ally(w)) : "auto"; return await this._cast(w, a, tg); }
        }
        if(!sks.length && w.kind === "e" && sp && rnd() < .3) return await this._basic(w, sp);
        return await this._basic(w, BASIC[w.model.spec.kind] || BASIC.slime);
    }
    _weakest(list){ return list.slice().sort((a, b) => this.hp(a) / this.maxhp(a) - this.hp(b) / this.maxhp(b))[0]; }
    _aiPick(w, side){
        const t = side.find((x) => x.s.taunt > 0); if(t && this.c.rnd() < .75) return t;
        return side[Math.floor(this.c.rnd() * side.length)];
    }
    // 基本こうげき（てき・仲間モンスター）
    async _basic(w, mv){
        const rnd = this.c.rnd; const side = this.opp(w); const first = this._aiPick(w, side);
        this.log(w.name + mv.text);
        await this._wind(w, mv);
        const targets = mv.all ? side : [first];
        const dur = this.fast ? 0 : this.fx.play(mv.fx, mv.breath ? this._mouth(w) : this.pos(w), mv.all ? this._groupC(side) : this.pos(first));
        if(!this.fast) await this.wait(Math.min(dur * .55, .8));
        this.c.A.se("hit");
        for(const tgt of targets){
            const gd = tgt.s.guard || tgt.guard;
            const d = damage(Math.round(this.atkOf(w) * (mv.mul || 1) * this._takeCharge(w)), this.defOf(tgt), rnd, {guard: gd});
            await this._hurt(tgt, d.d, w, {counterOK: !mv.all});
            this._hitLog(tgt, d.d, gd); if(targets.length > 1 && !this.fast) await this.wait(.3);
        }
        w.jaw = 0; w.sq = 0; this._panel(); await this._koCheck();
        if(!this.fast) await this.wait(Math.max(.4, dur * .4));
    }
    _mouth(w){ return w.kind === "e" ? this._foeMouth(w) : this._partyC(w); }
    _groupC(list){ const n = list.length || 1; let x = 0, z = 0; for(const c of list){ const p = this.pos(c); x += p[0]; z += p[2]; } return [x / n, 1.3, z / n]; }
    _hitLog(t, d, guarded){ this.log(t.kind === "e" ? t.name + "に " + d + "の ダメージ！" : t.name + "は " + d + "の ダメージを うけた！" + (guarded ? "（ぼうぎょ）" : "")); }
    async _wind(w, mv){
        if(w.kind !== "e" && !w.mon) return; const dirn = w.kind === "e" ? 1 : -1;
        if(mv.lunge){ await this.tween(.25, (k) => { w.lunge = dirn * Math.sin(k * Math.PI) * .22; w.sq = Math.sin(k * Math.PI) * .6; }); w.lunge = 0; w.sq = 0; }
        else if(mv.breath){ this.c.A.se("encounter"); await this.tween(.45, (k) => { w.jaw = Math.min(1, k * 1.6); w.sq = -k * .25; }); w.sq = 0; }
        else { await this.tween(.4, (k) => { w.aatk = Math.sin(k * Math.PI); w.sq = -Math.sin(k * Math.PI) * .2; }); w.aatk = 0; w.sq = 0; }
    }
    // ---- ダメージ・たおれる
    async _hurt(t, d, src, o){
        const op = o || {}; const before = this.hp(t); this.setHp(t, before - d); t.flash = 1; this.shake = Math.max(this.shake, t.kind === "e" ? .5 : 1);
        this._num(String(d) + (op.crit ? "!" : ""), this._cpos(t), t.kind === "e" ? (op.crit ? "#ffd24a" : "#fff") : "#ff9a9a");
        if(t.s.sleep > 0 && d > 0 && this.c.rnd() < .6) t.s.sleep = 0;
        if(t.kind === "p") this._panel();
        if(this.alive(t) && t.s.ctr > 0 && src && src !== t && op.counterOK !== false && this.alive(src)){
            const cd = Math.max(1, Math.round(this.atkOf(t) * .9 - this.defOf(src) * .4)); this.log(t.name + "の はんげき！"); this.fx.play("slash", this.pos(t), this.pos(src)); this.setHp(src, this.hp(src) - cd); src.flash = 1; this._num(String(cd), this._cpos(src), "#fff");
        }
    }
    async _koCheck(){
        for(const f of this.foes){ if(!f.ko && f.hp <= 0){ f.hp = 0; f.ko = true; this.log(f.name + "を たおした！"); this.fx.play("death", this._foeC(f), this._foeC(f)); await this.tween(.6, (k) => { f.dead = k; f.alpha = 1 - k * k; }); f.alpha = 0; } }
        for(const p of this.party){ if(p.m.hp <= 0 && !p._down){ p._down = true; this.log(p.name + "は たおれた！"); } if(p.m.hp > 0) p._down = false; }
        this._panel();
    }
    // ---- どうぐ
    async _useItem(w, cmd){
        const {S, data} = this.c; const it = data.items[cmd.item];
        if((S.inv[cmd.item] || 0) <= 0){ this.log("もう もっていない！"); await this.wait(.5); return; }
        S.inv[cmd.item]--; this.log(w.name + "は " + it.name + "を つかった！");
        if(it.kind === "flute"){ this.flute = true; this.c.A.se("heal"); this.log("スカウトぶえの ねいろが ひびく…！"); await this.wait(.7); return; }
        let t = cmd.target; if(!t) return;
        if(it.kind === "hp"){ if(t.m.hp <= 0) t = w; const b = t.m.hp; this.setHp(t, b + it.heal); const g = t.m.hp - b; this.fx.play("heal", this.pos(w), this.pos(t)); this.c.A.se("heal"); this._num("+" + g, this._partyPos(t), "#8f8"); this.log(t.name + "の HPが " + g + " かいふく！"); }
        else if(it.kind === "mp"){ if(t.mon) return; const b = t.m.mp || 0; t.m.mp = Math.min(t.st.maxmp, b + it.mp); this.fx.play("buff", this.pos(w), this.pos(t)); this.c.A.se("heal"); this._num("MP+" + (t.m.mp - b), this._partyPos(t), "#8cf"); this.log(t.name + "の MPが " + (t.m.mp - b) + " かいふく！"); }
        else if(it.kind === "revive"){ if(t.m.hp > 0){ this.log("しかし なにも おこらなかった。"); } else { this.setHp(t, t.st.maxhp * it.revive); this.fx.play("revive", this.pos(w), this.pos(t)); this.c.A.se("levelup"); this.log(t.name + "は ふっかつした！"); } }
        this._panel(); await this.wait(.7);
    }
    // ---------- じゅもん・とくぎ ----------
    async _cast(w, ab, chosen){
        const rnd = this.c.rnd; const isP = w.kind === "p" && !w.mon;
        if(isP){ if((w.m.mp || 0) < ab.mp){ this.log("MPが たりない！"); await this.wait(.5); return; } w.m.mp -= ab.mp; this._panel(); }
        let targets;
        const opp = this.opp(w), all = this.ally(w);
        if(ab.tg === "foe"){ targets = [chosen && chosen !== "auto" && this.alive(chosen) ? chosen : opp[Math.floor(rnd() * opp.length)]].filter(Boolean); }
        else if(ab.tg === "foes") targets = opp;
        else if(ab.tg === "ally"){
            const rev = ab.ef.some((e) => e[0] === "revive");
            if(rev){ const dead = this.allyAll(w).filter((x) => !this.alive(x)); targets = [chosen && chosen !== "auto" && !this.alive(chosen) ? chosen : dead[0]].filter(Boolean); }
            else targets = [chosen && chosen !== "auto" && this.alive(chosen) ? chosen : (this._weakest(all) || w)];
        }
        else if(ab.tg === "party") targets = ab.ef.some((e) => e[0] === "reviveAll") ? this.allyAll(w) : all;
        else targets = [w];
        if(ab.ef[0] && ab.ef[0][0] === "warp"){ this.log("ここでは つかえない！"); if(isP) w.m.mp += ab.mp; this._panel(); await this.wait(.5); return; }
        if(!targets.length){ this.log("しかし なにも おこらなかった！"); await this.wait(.5); return; }
        this.log(ab.t === "spell" ? w.name + "は " + ab.n + "を となえた！" : w.name + "の " + ab.n + "！");
        const breath = w.kind === "e" && BREATH.has(ab.fx) && w.model.spec.kind === "dragon";
        if(w.kind === "e" || w.mon){ await this._wind(w, breath ? {breath: 1} : {cast: 1}); }
        else { await this.tween(.3, (k) => { w.hop = Math.sin(k * Math.PI) * .28; w.wa = lerpN(.35, 1.2, Math.sin(k * Math.PI)); }); w.hop = 0; w.wa = .35; }
        let dur = 0; const from = breath ? this._foeMouth(w) : this.pos(w);
        if(!this.fast){
            if(targets.length > 1 && !["heal", "revive", "buff", "debuff", "sleep"].includes(ab.fx)){ dur = this.fx.play(ab.fx, from, this._groupC(targets)); }
            else targets.forEach((t, i) => { setTimeout(() => this.fx && this.active && this.fx.play(ab.fx, from, this.pos(t)), i * 90); dur = Math.max(dur, .8); });
            this.c.A.se(ab.fx === "heal" || ab.fx === "revive" || ab.fx === "buff" ? "heal" : "hit");
            await this.wait(Math.min(Math.max(dur * .6, .45), .9));
        }
        w.jaw = 0;
        const U = {w, ab, targets, opp, all, rnd, isP}; let ok = false;
        const efs = this._expandRandom(ab, U);
        for(const e of efs){ const r = await this._effect(e, U); ok = ok || r; }
        if(!ok) this.log("しかし なにも おこらなかった！");
        this._panel(); await this._koCheck(); await this.wait(.35);
    }
    _expandRandom(ab, U){
        if(ab.ef[0] && ab.ef[0][0] === "random"){
            const R = [[["dmg", 2.4]], [["dmgAll", 1.3]], [["healAll", .3]], [["buffAD"]], [["stun"]], [["debuff"]], [["crit", 3.0]], [["mpRes", .25]], [["gold", .3]], [["none"]]];
            const pick = R[Math.floor(this.c.rnd() * R.length)]; if(pick[0][0] === "none"){ this.log("…しかし なにも おこらなかった！"); return []; }
            if(["healAll", "buffAD", "mpRes"].includes(pick[0][0])) U.targets = U.all; else if(pick[0][0] === "dmgAll" || pick[0][0] === "debuff") U.targets = U.opp;
            return pick;
        }
        return ab.ef;
    }
    // 1つの こうかを てきよう
    async _effect(e, U){
        const {w, ab, targets, opp, all, rnd} = U; const k = e[0]; const T = targets; const bossy = (t) => t.kind === "e" && t.d && t.d.boss;
        const mag = () => (this.atkOf(w) * .4 + this.lvOf(w) * .6 + 4);
        const selfish = ab.tg === "foe" || ab.tg === "foes";       // ほじょ系の こうかは じぶんに かかる
        const goodT = selfish ? [w] : T;
        const dmgOne = async (t, m, opt) => {
            const o = opt || {}; let d;
            if(ab.t === "spell") d = Math.max(1, Math.round(mag() * m * (.9 + rnd() * .2) - this.defOf(t) * .15));
            else { const r = damage(this.atkOf(w) * m * this._takeCharge(w), this.defOf(t), rnd, {critRate: this.passive.gcrit && w.kind === "p" ? .5 : .0625, forceCrit: o.crit}); d = r.d; if(o.crit) d = Math.max(d, Math.floor(this.atkOf(w) * m * 1.2)); o.isCrit = r.crit; }
            if(t.s.guard || t.guard) d = Math.max(1, Math.floor(d / 2));
            await this._hurt(t, d, w, {crit: o.isCrit, counterOK: false}); this._hitLog(t, d, false); return d;
        };
        switch(k){
        case "dmg": case "crit": { for(const t of T){ if(!this.alive(t)) continue; await dmgOne(t, e[1], {crit: k === "crit"}); } return true; }
        case "dmgAll": { for(const t of T){ if(!this.alive(t)) continue; await dmgOne(t, e[1]); if(T.length > 1 && !this.fast) await this.wait(.18); } return true; }
        case "multi": { const t0 = T[0]; for(let i = 0; i < e[1]; i++){ const t = this.alive(t0) ? t0 : opp.find((x) => this.alive(x)); if(!t) break; await dmgOne(t, e[2]); if(!this.fast) await this.wait(.15); } return true; }
        case "ratio": { for(const t of T){ const d = Math.max(1, Math.round(this.hp(t) * (bossy(t) ? e[1] * .3 : e[1]))); await this._hurt(t, d, w, {counterOK: false}); this._hitLog(t, d, false); } return true; }
        case "revenge": { const r = 1 - this.hp(w) / this.maxhp(w); for(const t of T){ const d = Math.max(1, Math.round(this.atkOf(w) * e[1] * (.5 + r * 1.2) - this.defOf(t) * .4)); await this._hurt(t, d, w, {counterOK: false}); this._hitLog(t, d, false); } return true; }
        case "drain": { for(const t of T){ const d = await dmgOne(t, e[1]); const h = Math.round(d * .5); this.setHp(w, this.hp(w) + h); this._num("+" + h, this._cpos(w), "#8f8"); } return true; }
        case "team": { const t = T[0]; if(!t) return false; let sum = 0; for(const a of all){ sum += Math.max(1, Math.round(this.atkOf(a) * .8 * e[1] - this.defOf(t) * .35)); } this.fx.play("slash", this.pos(w), this.pos(t)); await this._hurt(t, sum, w, {counterOK: false}); this._hitLog(t, sum, false); return true; }
        case "selfdmg": { this.setHp(w, this.hp(w) - Math.round(this.maxhp(w) * e[1])); return true; }
        case "selfko": { this.setHp(w, 0); return true; }
        case "stunC": { for(const t of T){ if(this.alive(t) && !bossy(t) && rnd() < e[1]){ t.s.stun = 2; this.log(t.name + "は うごけなくなった！"); } } return true; }
        case "stun": case "stunAll": { for(const t of T){ if(!this.alive(t)) continue; if((bossy(t) && rnd() > .3) || (ab.rate && ab.rate < 100 && rnd() * 100 > ab.rate && !bossy(t))){ this.log(t.name + "には きかなかった！"); continue; } t.s.stun = 2; this.log(t.name + "は うごけなくなった！"); } return true; }
        case "sleep": case "sleepAll": { for(const t of T){ if(!this.alive(t)) continue; if((bossy(t) && rnd() > .25) || rnd() * 100 > (ab.rate || 85)){ this.log(t.name + "には きかなかった！"); continue; } t.s.sleep = 3; this.log(t.name + "は ねむってしまった！"); } return true; }
        case "timeStop": { for(const t of T){ if(this.alive(t) && !bossy(t)){ t.s.stun = 3; this.log(t.name + "の じかんが とまった！"); } else if(this.alive(t)) this.log(t.name + "には きかなかった！"); } return true; }
        case "bossSkip": { for(const t of T){ if(!this.alive(t)) continue; const d = bossy(t) ? Math.round(t.maxhp * .35) : this.hp(t); await this._hurt(t, d, w, {counterOK: false}); this._hitLog(t, d, false); } return true; }
        case "debuff": { for(const t of T){ if(this.alive(t)){ t.s.da = 4; t.s.dd = 4; } } this.log(T[0].name + (T.length > 1 ? "たちの" : "の") + " こうげき・ぼうぎょが さがった！"); return true; }
        case "debuffA": { for(const t of T){ if(this.alive(t)) t.s.da = 4; } this.log(T[0].name + (T.length > 1 ? "たちの" : "の") + " こうげきが さがった！"); return true; }
        case "debuffD": { for(const t of T){ if(this.alive(t)) t.s.dd = 4; } this.log(T[0].name + (T.length > 1 ? "たちの" : "の") + " ぼうぎょが さがった！"); return true; }
        case "steal": { const t = T[0]; if(!t || w.kind !== "p") return false; if(t.stolen || !t.d.drop || rnd() > .65 || !this.c.data.items[t.d.drop]){ this.log("しかし なにも ぬすめなかった！"); return true; } t.stolen = true; const S = this.c.S; S.inv[t.d.drop] = (S.inv[t.d.drop] || 0) + 1; this.log(this.c.data.items[t.d.drop].name + "を ぬすんだ！"); return true; }
        case "gold": { const t = T[0]; if(!t || w.kind !== "p") return false; const g = Math.round(t.d.gold * e[1] * 10); this.c.S.gold += g; this.log(g + "G うばいとった！"); return true; }
        case "heal": case "healN": case "healAll": case "healAllN": {
            const list = (k === "healAll" || k === "healAllN") ? (selfish ? [w] : T) : goodT; let any = false;
            for(const t of list){ if(!this.alive(t)) continue; const b = this.hp(t); const h = k === "heal" || k === "healAll" ? Math.round(this.maxhp(t) * e[1]) : Math.round(e[1] * (1 + this.lvOf(w) / 60) * (.92 + rnd() * .16)); this.setHp(t, b + h); const g = this.hp(t) - b; any = true; this._num("+" + g, this._cpos(t), "#8f8"); this.log(t.name + "の HPが " + g + " かいふく！"); if(t.kind === "p") this._panel(); }
            return any; }
        case "revive": case "reviveAll": {
            let any = false; for(const t of (k === "reviveAll" ? this.allyAll(w) : T)){ if(this.alive(t)) continue; this.setHp(t, this.maxhp(t) * e[1]); t.ko = false; t.alpha = 1; t.dead = 0; any = true; this.log(t.name + "は ふっかつした！"); this.c.A.se("levelup"); } this._panel(); return any; }
        case "mpRes": { for(const t of goodT){ if(t.kind !== "p" || t.mon || !this.alive(t)) continue; const b = t.m.mp || 0; t.m.mp = Math.min(t.st.maxmp, b + Math.round(t.st.maxmp * e[1])); this._num("MP+" + (t.m.mp - b), this._cpos(t), "#8cf"); this.log(t.name + "の MPが " + (t.m.mp - b) + " かいふく！"); } this._panel(); return true; }
        case "buffA": { for(const t of goodT) if(this.alive(t)) t.s.a = 4; this.log((goodT.length > 1 ? "みんなの" : goodT[0].name + "の") + " こうげきが あがった！"); return true; }
        case "buffD": { for(const t of goodT) if(this.alive(t)) t.s.d = 4; this.log((goodT.length > 1 ? "みんなの" : goodT[0].name + "の") + " ぼうぎょが あがった！"); return true; }
        case "buffAD": { for(const t of goodT) if(this.alive(t)){ t.s.a = 4; t.s.d = 4; } this.log((goodT.length > 1 ? "みんなの" : goodT[0].name + "の") + " こうげき・ぼうぎょが あがった！"); return true; }
        case "buffS": { for(const t of goodT) if(this.alive(t)) t.s.s = 4; this.log((goodT.length > 1 ? "みんなの" : goodT[0].name + "の") + " すばやさが あがった！"); return true; }
        case "guard": { for(const t of (ab.tg === "party" ? all : [w])){ t.s.guard = true; t.guard = true; } this.log((ab.tg === "party" ? "みんなは" : w.name + "は") + " みを まもっている！"); return true; }
        case "taunt": { w.s.taunt = 2; this.log(w.name + "が こうげきを ひきつけている！"); return true; }
        case "counter": { w.s.ctr = 3; this.log(w.name + "は はんげきの たいせい！"); return true; }
        case "charge": { w.s.chg = e[1]; this.log(w.name + "は ちからを ためている…！"); return true; }
        case "cleanse": { for(const t of goodT){ t.s.stun = 0; t.s.sleep = 0; t.s.da = 0; t.s.dd = 0; } this.log("わるい じょうたいが なおった！"); return true; }
        case "summon": { w.s.sum = {t: e[1], m: e[2]}; this.log(w.name + "の なかまが あつまってきた！"); return true; }
        case "luck": { this.luck = Math.max(this.luck, 1.5); this.log("もらえる ゴールドが ふえそう！"); return true; }
        case "exp": { this.expMul = 1.5; this.log("けいけんちが ふえそう！"); return true; }
        case "escape": { if(this.boss && !this.passive.gflee){ this.log("しかし まわりこまれてしまった！"); return true; } this.log("みんなは ひらりと にげだした！"); this.fled = true; return true; }
        case "transform": { w.s.a = 5; w.s.d = 5; w.s.s = 5; w.s.chg = 2; this.log(w.name + "は ひかりに つつまれた！"); return true; }
        default: return false;
        }
    }
    // ---- 近づく／ふりおろす／さがる（武器こうげきの一連の動き）
    async _approach(w, tgt){
        const dx = (tgt.x - w.x) * .75, dz = 3.4 - (tgt.z + 2.4);
        await this.tween(.3, (k) => { const e = ease(k); w.ox = dx * e; w.step = dz * e; w.hop = Math.sin(k * Math.PI * 2) * .1; w.wa = lerpN(.35, .95, e); });
        w.hop = 0;
    }
    async _swing(w, tgt, dm){
        let hit = false; const fxp = this._foeC(tgt);
        await this.tween(.2, (k) => { const e = ease(k); w.wa = lerpN(.95, -2.4, e); if(!hit && k > .55){ hit = true; this.shake = dm.crit ? 1 : .55; this.fx.play(dm.crit ? "crit" : "slash", [w.x, 1.2, w.z], fxp); } });
        this.tween(.34, (k) => { tgt.lunge = -Math.sin(k * Math.PI) * .1; tgt.sq = Math.sin(k * Math.PI * 2) * .35 * (1 - k); });
        await this.wait(.12);
    }
    _retreat(w){
        const o0 = w.ox, s0 = w.step; this.tween(.28, (k) => { const e = ease(k); w.ox = o0 * (1 - e); w.step = s0 * (1 - e); w.wa = lerpN(-2.4, .35, e); }).then(() => { w.ox = 0; w.step = 0; w.wa = .35; });
    }
    // ---------- しょうり ----------
    async _win(){
        const {S, data} = this.c; let exp = 0, gold = 0; this.foes.forEach((f) => { exp += f.d.exp; gold += f.d.gold; });
        exp = Math.round(exp * this.expMul * (this.passive.gexp ? 2 : 1)); gold = Math.round(gold * this.luck * (this.passive.ggold ? 2 : 1));
        this.c.A.se("win"); this.log("たたかいに しょうり！"); await this.wait(.8);
        S.gold += gold; this.log(exp + " ポイントの けいけんちと " + gold + "Gを てにいれた！"); await this.wait(.9);
        for(const p of this.party){
            if(p.mon || p.m.hp <= 0) continue;
            const ups = gainExp(p.m, data.members, exp);
            for(const u of ups){
                this.c.A.se("levelup"); this.log(p.name + "は レベル" + u.lv + "に あがった！（HP+" + u.hp + " ちから+" + u.atk + " まもり+" + u.def + "）"); await this.wait(.9);
                for(const id of u.learned){ this.log(p.name + "は " + G.ab[id].n + "を おぼえた！"); await this.wait(.8); }
            }
            const j = gainJobExp(p.m, exp * 1.2);
            for(const lv of j.ups){ if(lv % 5 === 0 && !j.mastered){ this.log(p.name + "の " + G.jobs[p.m.job].n + "レベルが " + lv + "に あがった！"); await this.wait(.6); } }
            for(const id of j.learned){ this.c.A.se("levelup"); this.log(p.name + "は " + G.ab[id].n + "を おぼえた！"); await this.wait(.9); }
            if(j.mastered){ this.log(p.name + "は " + G.jobs[p.m.job].n + "を マスターした！"); await this.wait(.9); }
            p.st = statsOf(p.m, data.members);
        }
        // 仲間モンスターにも けいけんち
        const R = this.c.ranch; const comp = this.party.find((p) => p.mon);
        if(R && comp && comp.m.hp > 0){ const ups = R.gain(comp.comp, exp * .6); if(ups){ this.log(comp.name + "は レベル" + comp.comp.lv + "に あがった！"); await this.wait(.8); } }
        // ドロップ・図鑑・スカウト
        let scouted = false;
        for(const f of this.foes){
            if(R) R.noteKill(f.id);
            if(f.d.drop && data.items[f.d.drop] && this.c.rnd() < (f.rank === "S" ? .42 : .3)){ S.inv[f.d.drop] = (S.inv[f.d.drop] || 0) + 1; this.log(f.name + "は " + data.items[f.d.drop].name + "を おとした！"); await this.wait(.7); }
            if(R && !scouted && data.mons[f.id] && data.mons[f.id].scout && !f.d.boss){
                const rk = Math.max(0, RANKS.indexOf(f.rank)); let ch = [.5, .42, .34, .27, .2, .14, .1, .06][rk] + (this.flute ? .25 : 0);
                if(this.passive.gscout) ch = 1;
                if(this.c.rnd() < ch){
                    scouted = true; const lv = Math.max(1, Math.round(S.chapter * 1.3 + rk * 1.5));
                    this.log(f.name + "は なかまに なりたそうに こちらを みている！"); await this.wait(.8);
                    const r = R.add(f.id, lv, "scout"); this.log(r.msg); if(r.ok) this.c.A.se("levelup"); await this.wait(1.0);
                }
            }
        }
        this._panel(); this.result = {exp, gold};
    }
    dispose(){ this.active = false; }
}
