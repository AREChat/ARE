"use strict";
// ===== セーブ（この端末のlocalStorage）。自動セーブ＋3スロット。データ形式にバージョンを付けて将来の変更に備える =====
const KEY = "areq2_save_";
export const SAVE_VERSION = 1;
export const Save = {
    slots: ["auto", "1", "2", "3"],
    ns: "",   // "" = 本編 / "sub" = サブストーリー（保存場所を分けて、本編のセーブを守る）
    k(slot){ return KEY + (this.ns ? this.ns + "_" : "") + slot; },
    // 統合まえの game3 のサブストーリーのセーブを、こちらへ引きつぐ（古いほうは消さない）
    adopt(slot){ try{ if(this.ns !== "sub") return; const nk = this.k(slot); if(localStorage.getItem(nk)) return; const old = localStorage.getItem("areq3_save_sub_" + slot); if(old) localStorage.setItem(nk, old); }catch(_e){} },
    read(slot){
        this.adopt(slot);
        try{ const raw = localStorage.getItem(this.k(slot)); if(!raw) return null; const d = JSON.parse(raw); return this.migrate(d); }catch(_e){ return null; }
    },
    write(slot, state){
        try{ const d = Object.assign({}, state, {v:SAVE_VERSION, ts:Date.now()}); localStorage.setItem(this.k(slot), JSON.stringify(d)); return true; }catch(_e){ return false; }
    },
    remove(slot){ try{ localStorage.removeItem(this.k(slot)); }catch(_e){} },
    migrate(d){ if(!d || typeof d !== "object") return null; if(!d.v) d.v = 1; if(!d.flags) d.flags = {}; if(!d.inv) d.inv = {}; return d; },
    label(d){
        if(!d) return "（からっぽ）";
        const t = new Date(d.ts || 0); const p = (n) => String(n).padStart(2, "0");
        return (d.chapter > 130 ? "サブ第" + (d.chapter - 130) + "話" : "第" + d.chapter + "話") + "　" + (d.name || "") + "　Lv" + ((d.party && d.party[0] && d.party[0].lv) || 1) + "　" + p(t.getMonth() + 1) + "/" + p(t.getDate()) + " " + p(t.getHours()) + ":" + p(t.getMinutes());
    }
};
