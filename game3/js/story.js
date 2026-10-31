"use strict";
// ===== 30話の管理：話ごとの読み込み・フラグ・台本（JSON）の実行 =====
import {newMember} from "./rules.js";

export class Abort extends Error {}
export const TOTAL = 10;   // 本編の話数（前日譚・後日譚は chapters.json の order で つなぐ）

export class Story{
    constructor(ctx){ this.c = ctx; this.cache = {}; this.def = null; this.log = []; }
    get S(){ return this.c.S; }
    meta(n){ return this.c.data.chapters.chapters[n - 1]; }
    // 話の順番：前日譚(31〜) → 本編(1〜30) → 後日譚(39〜)。order が無ければ 1〜30
    order(){ const o = this.c.data.chapters.order; return Array.isArray(o) && o.length ? o : Array.from({length: TOTAL}, (_, i) => i + 1); }
    nextOf(n){ const o = this.order(), i = o.indexOf(n); return i >= 0 ? o[i + 1] : undefined; }
    label(n){ const m = this.meta(n) || {}; return m.lbl || ("第" + n + "話"); }
    async load(n){
        if(!this.cache[n]) this.cache[n] = await this.c.jget("data/" + this.meta(n).file);
        return this.cache[n];
    }
    tx(s){ return String(s == null ? "" : s).replace(/\{name\}/g, this.S.name || "主人公"); }
    flag(k){ return !!this.S.flags[k]; }
    // 現在の話の、この場所にいる人（!マークの有無つき）
    npcsOn(mapId){ return this.def ? this.def.npcs.filter((n) => n.map === mapId) : []; }
    hasMark(npc){
        const d = this.def; if(!d || this.flag(d.done)) return false;
        if(npc.mark) return (npc.needs && !this.flag(npc.needs)) ? false : !this.flag(npc.mark);
        if(npc.needs) return this.flag(npc.needs);
        return false;
    }
    hud(){ const d = this.def; this.c.UI.setHud(d ? this.label(d.n) + "　" + d.title : "", this.S.obj, this.S.gold); }
    // 話の開始。intro=false なら、ロード時（演出なしで状態だけ整える）
    async begin(n, intro){
        const {S, UI} = this.c;
        S.chapter = n; this.def = await this.load(n); S.obj = this.def.goal; this.hud(); try{ const tm = this.c.data.maps && this.c.data.maps.town; if(tm) tm.name = this.def.town || "みなと野"; }catch(_e){}
        if(intro === false){ this.c.refreshNpcs(); return; }
        UI.pic && UI.pic(""); await UI.card(this.label(n), this.def.title, 1800);
        if(this.def.start && this.def.start.map && this.def.start.map !== S.map) await this.c.warpMap(this.def.start.map);
        this.c.refreshNpcs(); this.hud();
        await this.runTop(this.def.onStart || []);
    }
    async runTop(ops){
        try{ await this.run(ops); }
        catch(e){ if(!(e instanceof Abort)) throw e; }
        this.hud();
    }
    async run(ops){
        const {S, UI, data} = this.c;
        for(const op of ops){
            const k = op[0];
            if(k === "say") await UI.say(this.tx(op[1]), this.tx(op[2]));
            else if(k === "set"){ S.flags[op[1]] = 1; }
            else if(k === "if"){ await this.run(this.flag(op[1]) ? (op[2] || []) : (op[3] || [])); }
            else if(k === "objective"){ S.obj = this.tx(op[1]); this.hud(); UI.toast("もくてき：" + S.obj, 2600); }
            else if(k === "gold"){ S.gold += op[1]; UI.toast(op[1] + "G を てにいれた！"); this.hud(); }
            else if(k === "item"){ const n = op[2] || 1; S.inv[op[1]] = (S.inv[op[1]] || 0) + n; UI.toast(data.items[op[1]].name + " を " + n + "こ てにいれた！"); }
            else if(k === "join"){
                if(!S.party.some((m) => m.id === op[1])){
                    const lead = S.party[0] ? S.party[0].lv : 1; S.party.push(newMember(op[1], data.members, Math.max(1, lead - 1)));
                    UI.toast(this.tx(data.members[op[1]].name) + " が なかまに なった！", 2800);
                }
            }
            else if(k === "shop"){ await this.c.shop(op[1]); }
            else if(k === "rest"){ await this.c.rest(); }
            else if(k === "heal"){ this.c.healAll(); UI.toast("HPが ぜんかいふくした！"); }
            else if(k === "pic"){ UI.pic && UI.pic(op[1] || ""); }
            else if(k === "title"){ S.titles = S.titles || []; if(!S.titles.includes(op[1])){ S.titles.push(op[1]); UI.toast("称号『" + op[1] + "』を てにいれた！", 3200); } }
            else if(k === "card"){ await UI.card(this.tx(op[1]), this.tx(op[2] || ""), op[3]); }
            else if(k === "warp"){ await this.c.warpMap(op[1], op[2], op[3]); }
            else if(k === "save"){ this.c.autosave(); UI.toast("オートセーブしました"); }
            else if(k === "choice"){
                const r = await UI.menu(this.tx(op[3] || ""), op[1].map((l) => ({label: this.tx(l)})), {cancel: false, hint: ""});
                await this.run(op[2][Math.max(0, r)] || []);
            }
            else if(k === "battle"){
                const res = await this.c.fight(op[1], op[2] || {});
                if(res !== "win") throw new Abort();
            }
            else if(k === "done"){ await this.finish(); }
            else if(k === "end"){ throw new Abort(); }
        }
    }
    async finish(){
        const {S, UI} = this.c; const d = this.def;
        S.flags[d.done] = 1; this.log.push(d.n);
        const nx = this.nextOf(d.n);
        if(nx === undefined){ S.cleared = 1; S.ending = 1; UI.pic && UI.pic(""); this.c.autosave(); await UI.card("ＦＩＮ", "ARE QUEST 3 〜月影のあしあと〜　" + (d.endCard ? d.endCard : "") + (d.final ? "" : "　（つづく）"), 3600); this.hud(); UI.toast("🔥 おまけ：原っぱに 5体の ボスが 待っている！（赤い⚔の 目じるし）", 6500); return; }
        UI.pic && UI.pic("");
        if(d.endCard) await UI.card("第" + (d.endCard.match(/^第(\d+)章/) || [0, ""])[1] + "章　クリア！", d.endCard, 2600);
        else await UI.card(this.label(d.n) + "　クリア！", d.title, 1700);
        this.c.autosave();
        await this.begin(nx, true);
        this.c.autosave();
        throw new Abort();   // 新しい話が始まったので、前の台本の続きは実行しない
    }
}
