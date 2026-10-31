"use strict";
// ===== game4 の音：自作の合成エンジン(synth.js)。audio/ にファイルを置くと そちらを優先 =====
// 置ける名前: title.mp3 menu.mp3 battle.mp3 battle_final.mp3 win.mp3 lose.mp3
import {Synth} from "./synth.js";
const THEME = {title: "opening", menu: "town", battle: "mainbattle", battle_final: "lastboss", win: "ending", lose: "cave"};
export const Snd = {
    on: true, vol: .5, seVol: .6, ac: null, unlocked: false, want: "", cur: "", custom: {}, el: null,
    init(){
        try{ const s = JSON.parse(localStorage.getItem("areq4_snd") || "{}"); if(s.on === false) this.on = false; if(typeof s.vol === "number") this.vol = s.vol; }catch(_e){}
        const unlock = () => { this.unlocked = true; try{ const A = window.AudioContext || window.webkitAudioContext; if(A && !this.ac) this.ac = new A(); if(this.ac && this.ac.state === "suspended") this.ac.resume(); }catch(_e){} this.sync(); };
        ["pointerdown", "keydown", "touchend", "click"].forEach((ev) => addEventListener(ev, unlock, {passive: true}));
        document.addEventListener("visibilitychange", () => this.sync()); setInterval(() => this.sync(), 800);
        for(const k of Object.keys(THEME)){ fetch(new URL("../audio/" + k + ".mp3", import.meta.url).href, {method: "HEAD"}).then((r) => { if(r.ok) this.custom[k] = new URL("../audio/" + k + ".mp3", import.meta.url).href; }).catch(() => {}); }
    },
    save(){ try{ localStorage.setItem("areq4_snd", JSON.stringify({on: this.on, vol: this.vol})); }catch(_e){} },
    toggle(){ this.on = !this.on; this.save(); this.sync(); return this.on; },
    play(key){ this.want = key; this.sync(); },
    stopCustom(){ if(this.el){ try{ this.el.pause(); }catch(_e){} this.el = null; } },
    sync(){
        try{
            if(!this.on || document.hidden || !this.want || !this.unlocked || !this.ac){ if(Synth.live) Synth.stop(); this.stopCustom(); this.cur = ""; return; }
            if(this.ac.state === "suspended"){ try{ this.ac.resume(); }catch(_e){} return; }
            if(this.custom[this.want]){ if(Synth.live) Synth.stop(); if(this.cur !== this.want){ this.stopCustom(); const a = new Audio(this.custom[this.want]); a.loop = !(this.want === "win" || this.want === "lose"); a.volume = this.vol; const p = a.play(); if(p && p.catch) p.catch(() => {}); this.el = a; this.cur = this.want; } else if(this.el) this.el.volume = this.vol; return; }
            this.stopCustom(); const th = THEME[this.want] || "town";
            if(this.cur !== this.want){ this.cur = this.want; Synth.play(this.ac, th, this.vol); } else if(Synth.ac === this.ac) Synth.setVol(this.vol);
        }catch(_e){}
    },
    se(name){ try{ if(!this.on || !this.ac || this.ac.state !== "running") return; Synth.se(this.ac, name, this.seVol); }catch(_e){} }
};
