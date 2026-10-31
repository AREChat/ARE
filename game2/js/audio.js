"use strict";
// ===== 音：BGM（AREQUESTの13曲をそのまま使用）＋ 効果音（WebAudioで合成。音声ファイル不要）=====
export const BGM = {
    opening: "オープニング（タイトル）", ending: "エンディング（最終話クリア・1回）", save: "セーブ音（1回）",
    field: "フィールド", town: "街", sea: "海", cave: "洞窟・店内", castle: "城・塔", demoncastle: "魔王城",
    mainbattle: "通常戦闘", midboss: "ボス戦", lastboss: "ラスボス戦", secretboss: "裏ボス戦"
};
const ONESHOT = {ending: 1, save: 1};
export const Audio2 = {
    vol: 0.5, seVol: 0.6, on: true, cur: "", map: {}, one: null, fade: null, ac: null, unlocked: false, bad: {},
    // 音が出ない理由を、画面に ひとこと 出す（ブラウザの制限か、ファイルか、設定か を見分けるため）
    hint(msg){
        try{
            if(this._hint === msg) return; this._hint = msg; console.warn("[audio]", msg);
            let d = document.getElementById("audioHint"); if(!d){ d = document.createElement("div"); d.id = "audioHint"; d.style.cssText = "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:200;background:rgba(10,10,40,.92);color:#fff;border:2px solid #ffd24a;border-radius:10px;padding:8px 14px;font-size:14px;max-width:90vw;text-align:center;pointer-events:none"; document.body.appendChild(d); }
            d.textContent = "🔇 " + msg; d.style.display = "block"; clearTimeout(this._ht); this._ht = setTimeout(() => { d.style.display = "none"; this._hint = ""; }, 7000);
        }catch(_e){}
    },
    status(){ return {on: this.on, unlocked: this.unlocked, ac: this.ac && this.ac.state, want: this.want, cur: this.cur, vol: this.vol, bad: Object.keys(this.bad), playing: Object.entries(this.map).filter(([k, a]) => !a.paused).map(([k]) => k)}; },
    init(cfg){
        this.on = cfg.sound !== false; this.vol = cfg.bgmVol == null ? .5 : cfg.bgmVol; this.seVol = cfg.seVol == null ? .6 : cfg.seVol;
        const unlock = () => { this.unlocked = true; try{ const A = window.AudioContext || window.webkitAudioContext; if(A && !this.ac) this.ac = new A(); if(this.ac && this.ac.state === "suspended") this.ac.resume(); }catch(_e){} this.sync(); };
        ["pointerdown", "keydown", "touchend", "click"].forEach((ev) => addEventListener(ev, unlock, {passive: true}));
        document.addEventListener("visibilitychange", () => this.sync());
        setInterval(() => this.sync(), 700);
    },
    el(key){
        if(this.bad[key] && Date.now() - this.bad[key] < 20000) return null;
        let a = this.map[key];
        if(!a){ a = new Audio(new URL("../bgm/" + key + ".mp3", import.meta.url).href); a.loop = !ONESHOT[key]; a.preload = "auto"; a.addEventListener("error", () => { this.bad[key] = Date.now(); delete this.map[key]; this.hint("BGMファイル（" + key + ".mp3）を 読み込めません。ファイルが 見つからないか、こわれています"); }); this.map[key] = a; }
        return a;
    },
    // 鳴らしたい曲を指定（同じ曲なら何もしない）
    play(key){ this.want = key; this.sync(); },
    stopAll(){ for(const k in this.map){ try{ this.map[k].pause(); }catch(_e){} } this.cur = ""; },
    sync(){
        try{
            if(this.unlocked && this.ac && this.ac.state === "suspended"){ try{ this.ac.resume(); }catch(_e){} }
            if(this.on && !this.unlocked && this.want && !document.hidden) this.hint("音を出すには、画面を 1回 クリック／タップしてください");
            if(!this.on || document.hidden || !this.want){ if(this.cur) this.stopAll(); return; }
            const key = this.want;
            if(key !== this.cur){
                const old = this.cur ? this.map[this.cur] : null; this.cur = key; this.ended = false;
                if(old) this._fadeOut(old);
                const n = this.el(key); if(n && ONESHOT[key]){ try{ n.currentTime = 0; }catch(_e){} }
            }
            if(ONESHOT[key] && this.map[key] && this.map[key].ended) return;
            const a = this.el(key); if(!a) return;
            if(a.paused && this.unlocked){ a.volume = 0; const p = a.play(); if(p && p.catch) p.catch((e) => { if(e && e.name === "NotAllowedError") this.hint("ブラウザが 自動再生を とめています。画面を 1回 クリック／タップしてください"); else if(e && e.name !== "AbortError") this.hint("BGMを 再生できません（" + e.name + "）"); }); this._fadeIn(a); }
            else if(!a.paused && !a._fi) a.volume = this.vol;
        }catch(_e){}
    },
    _fadeIn(a){ if(a._fi) return; a._fi = true; const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / 700); try{ a.volume = this.vol * k; }catch(_e){} if(k < 1 && !a.paused) requestAnimationFrame(f); else a._fi = false; }; f(); },
    _fadeOut(a){ const v0 = a.volume, t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / 500); try{ a.volume = v0 * (1 - k); }catch(_e){} if(k < 1) setTimeout(f, 40); else { try{ a.pause(); a._fi = false; }catch(_e){} } }; f(); },
    setVol(v){ this.vol = v; const a = this.map[this.cur]; if(a) try{ a.volume = v; }catch(_e){} },
    // 1回だけ鳴る曲（セーブ音）：BGMは止めない。5秒で消える
    jingle(key){
        try{
            if(!this.on || !this.unlocked) return; if(this.one){ try{ this.one.pause(); }catch(_e){} }
            const a = new Audio(new URL("../bgm/" + key + ".mp3", import.meta.url).href); a.volume = Math.min(1, this.vol + .2); this.one = a; const p = a.play(); if(p && p.catch) p.catch(() => {});
            const t0 = Date.now(); const tick = () => { if(this.one !== a) return; const left = 5000 - (Date.now() - t0); if(left <= 0 || a.ended){ try{ a.pause(); }catch(_e){} this.one = null; return; } if(left < 1200) try{ a.volume *= .9; }catch(_e){} setTimeout(tick, 100); }; tick();
        }catch(_e){}
    },
    // 効果音：name = ok cancel move hit crit heal levelup warp talk win lose
    se(name){
        try{
            if(!this.on || !this.ac || this.ac.state !== "running") return;
            const ac = this.ac, now = ac.currentTime; const V = this.seVol * .22;
            const note = (f, t0, d, type, v, f2) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type || "square"; o.frequency.setValueAtTime(f, now + t0); if(f2) o.frequency.exponentialRampToValueAtTime(f2, now + t0 + d); g.gain.setValueAtTime(V * (v || 1), now + t0); g.gain.exponentialRampToValueAtTime(.0001, now + t0 + d); o.connect(g); g.connect(ac.destination); o.start(now + t0); o.stop(now + t0 + d + .02); };
            const S = {
                ok: () => { note(880, 0, .07); note(1320, .06, .09); }, cancel: () => note(440, 0, .09, "square", .8, 300), move: () => note(660, 0, .04, "triangle", .6),
                talk: () => note(520, 0, .05, "triangle", .5), hit: () => { note(180, 0, .14, "sawtooth", 1.2, 60); note(900, 0, .05, "square", .5, 300); },
                crit: () => { note(120, 0, .22, "sawtooth", 1.4, 40); note(1500, 0, .12, "square", .7, 400); note(1800, .08, .1, "square", .5); },
                heal: () => { [660, 880, 1100].forEach((f, i) => note(f, i * .08, .14, "triangle", 1)); },
                levelup: () => { [523, 659, 784, 1047].forEach((f, i) => note(f, i * .11, .2, "square", .9)); },
                warp: () => note(300, 0, .3, "triangle", 1, 1200), win: () => { [523, 523, 523, 784].forEach((f, i) => note(f, i * .13, .18, "square", .9)); },
                lose: () => { [392, 330, 262, 196].forEach((f, i) => note(f, i * .2, .28, "triangle", 1)); }, encounter: () => { note(200, 0, .25, "sawtooth", 1, 900); note(150, .1, .25, "sawtooth", 1, 700); }
            };
            if(S[name]) S[name]();
        }catch(_e){}
    }
};
