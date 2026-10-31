"use strict";
// ===== セーブ（この端末のlocalStorage）。自動セーブ＋3スロット。データ形式にバージョンを付けて将来の変更に備える =====
const KEY = "areq3_save_";
export const SAVE_VERSION = 1;
export const Save = {
    slots: ["auto", "1", "2", "3"],
    read(slot){
        try{ const raw = localStorage.getItem(KEY + slot); if(!raw) return null; const d = JSON.parse(raw); return this.migrate(d); }catch(_e){ return null; }
    },
    write(slot, state){
        try{ const d = Object.assign({}, state, {v:SAVE_VERSION, ts:Date.now()}); localStorage.setItem(KEY + slot, JSON.stringify(d)); return true; }catch(_e){ return false; }
    },
    remove(slot){ try{ localStorage.removeItem(KEY + slot); }catch(_e){} },
    migrate(d){ if(!d || typeof d !== "object") return null; if(!d.v) d.v = 1; if(!d.flags) d.flags = {}; if(!d.inv) d.inv = {}; return d; },
    label(d){
        if(!d) return "（からっぽ）";
        const t = new Date(d.ts || 0); const p = (n) => String(n).padStart(2, "0");
        return "第" + d.chapter + "話　" + (d.name || "") + "　Lv" + ((d.party && d.party[0] && d.party[0].lv) || 1) + "　" + p(t.getMonth() + 1) + "/" + p(t.getDate()) + " " + p(t.getHours()) + ":" + p(t.getMinutes());
    }
};
