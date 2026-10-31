"use strict";
// ===== ARE QUEST 3 サウンドエンジン（WebAudio合成・音声ファイル不要・完全オリジナル）=====
// 多重パッド / ベース / アルペジオ / リード / ドラム / ディレイ / リバーブ(自動生成インパルス) / コンプレッサー
// 旋律は「曲名×小節」で決まる乱数から作るので、毎回同じ曲になり、8小節ごとに繰り返す。
const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11]
};
// 曲の設計図: bpm / root(MIDI) / scale / prog(コード根音の度数、1小節ずつ) / 各パートの有無
const THEMES = {
    opening:    {bpm: 92,  root: 57, sc: "major",    prog: [0, 5, 3, 4, 0, 5, 1, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 1, dens: .75, oct: 1},
    field:      {bpm: 108, root: 62, sc: "major",    prog: [0, 3, 4, 0, 5, 3, 1, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 1, dens: .7, oct: 1},
    town:       {bpm: 96,  root: 60, sc: "lydian",   prog: [0, 4, 3, 0, 1, 4, 5, 0], pad: 1, bass: 1, arp: 1, lead: 1, drum: 0, dens: .65, oct: 1},
    sea:        {bpm: 84,  root: 59, sc: "lydian",   prog: [0, 1, 0, 4, 0, 1, 5, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 0, dens: .5, oct: 1, wave: 1},
    cave:       {bpm: 66,  root: 52, sc: "minor",    prog: [0, 0, 5, 5, 3, 3, 4, 4], pad: 1, bass: 1, arp: 1, lead: 0, drum: 0, dens: .4, oct: 0, drone: 1},
    castle:     {bpm: 82,  root: 55, sc: "dorian",   prog: [0, 3, 0, 4, 5, 3, 1, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 1, dens: .55, oct: 1, slow: 1},
    demoncastle:{bpm: 70,  root: 50, sc: "phrygian", prog: [0, 1, 0, 5, 0, 1, 3, 1], pad: 1, bass: 1, arp: 0, lead: 1, drum: 1, dens: .45, oct: 0, drone: 1},
    mainbattle: {bpm: 152, root: 57, sc: "minor",    prog: [0, 5, 3, 4, 0, 5, 6, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 2, dens: .85, oct: 1},
    midboss:    {bpm: 164, root: 55, sc: "harm",     prog: [0, 6, 5, 4, 0, 3, 1, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 2, dens: .9, oct: 1},
    lastboss:   {bpm: 172, root: 52, sc: "harm",     prog: [0, 5, 6, 4, 0, 1, 5, 4], pad: 1, bass: 1, arp: 1, lead: 1, drum: 3, dens: .95, oct: 1},
    secretboss: {bpm: 180, root: 50, sc: "phrygian", prog: [0, 1, 5, 1, 0, 6, 5, 1], pad: 1, bass: 1, arp: 1, lead: 1, drum: 3, dens: 1, oct: 1},
    ending:     {bpm: 78,  root: 60, sc: "major",    prog: [0, 4, 5, 3, 0, 4, 1, 0], pad: 1, bass: 1, arp: 1, lead: 1, drum: 0, dens: .6, oct: 1}
};
const ONESHOT = {ending: 8};          // 小節数で終わる曲
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// 文字列→乱数
function rng(seed){ let h = 2166136261; for(const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); let s = h >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export const Synth = {
    ac: null, bus: null, key: "", th: null, bar: 0, nextT: 0, timer: 0, vol: .5, live: false, voices: 0, maxVoices: 96, _nb: null,
    // ---------- 初期化（AudioContext を渡す。オフライン描画にも使える）----------
    attach(ac, dest){
        this.ac = ac; const d = dest || ac.destination;
        const master = ac.createGain(); master.gain.value = this.vol * .8;
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
        master.connect(comp); comp.connect(d);
        // リバーブ: 指数減衰するステレオノイズをインパルスにする
        const len = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
        for(let c = 0; c < 2; c++){ const ch = ir.getChannelData(c); let lp = 0; for(let i = 0; i < len; i++){ const k = i / len; lp += ((Math.random() * 2 - 1) - lp) * (.55 - k * .4); ch[i] = lp * Math.pow(1 - k, 2.6) * 1.6; } }
        const conv = ac.createConvolver(); conv.buffer = ir; const rv = ac.createGain(); rv.gain.value = .34; conv.connect(rv); rv.connect(master);
        // ピンポンディレイ
        const dl = ac.createDelay(1.5), dr = ac.createDelay(1.5), fb = ac.createGain(), dg = ac.createGain(); fb.gain.value = .32; dg.gain.value = .22;
        const mrg = ac.createChannelMerger(2); dl.connect(fb); fb.connect(dr); dr.connect(dl); dl.connect(mrg, 0, 0); dr.connect(mrg, 0, 1); mrg.connect(dg); dg.connect(master);
        const dry = ac.createGain(); dry.connect(master); dry.connect(conv);
        const echo = ac.createGain(); echo.connect(dl); echo.connect(conv);
        // ノイズ素材
        const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0); for(let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this._nb = nb;
        this.bus = {master, dry, echo, conv, dl, dr, rv};
    },
    setVol(v){ this.vol = v; if(this.bus) this.bus.master.gain.value = v * .8; },
    // ---------- 発音の部品 ----------
    _v(){ return this.voices < this.maxVoices; },
    tone(t, f, d, o){
        const ac = this.ac, B = this.bus; if(!this._v()) return; o = o || {}; this.voices++;
        const g = ac.createGain(), flt = ac.createBiquadFilter(); flt.type = o.ft || "lowpass"; flt.frequency.setValueAtTime(o.cut || 6000, t); if(o.cut2) flt.frequency.exponentialRampToValueAtTime(o.cut2, t + d); flt.Q.value = o.q || .7;
        const a = o.a || .005, r = o.r || .08, v = (o.v || .2);
        g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + a); if(o.sus != null){ g.gain.linearRampToValueAtTime(v * o.sus, t + Math.min(d, a + (o.dec || .15))); } g.gain.setValueAtTime(v * (o.sus != null ? o.sus : 1), t + d); g.gain.exponentialRampToValueAtTime(.0001, t + d + r);
        const dets = o.det || [0]; const oscs = [];
        for(const dt of dets){ const os = ac.createOscillator(); os.type = o.w || "sawtooth"; os.frequency.setValueAtTime(f, t); os.detune.value = dt; if(o.vib){ const lf = ac.createOscillator(), lg = ac.createGain(); lf.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + .35); lf.connect(lg); lg.connect(os.detune); lf.start(t); lf.stop(t + d + r + .05); } os.connect(flt); os.start(t); os.stop(t + d + r + .05); oscs.push(os); }
        flt.connect(g); const pan = ac.createStereoPanner ? ac.createStereoPanner() : null; if(pan){ pan.pan.value = o.pan || 0; g.connect(pan); pan.connect(B.dry); if(o.echo){ const e = ac.createGain(); e.gain.value = o.echo; pan.connect(e); e.connect(B.echo); } } else { g.connect(B.dry); }
        oscs[0].onended = () => { this.voices = Math.max(0, this.voices - 1); };
    },
    noise(t, d, o){
        const ac = this.ac, B = this.bus; if(!this._v()) return; o = o || {}; this.voices++;
        const s = ac.createBufferSource(); s.buffer = this._nb; s.loop = true; const f = ac.createBiquadFilter(); f.type = o.ft || "highpass"; f.frequency.setValueAtTime(o.f || 7000, t); if(o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + d); f.Q.value = o.q || .8;
        const g = ac.createGain(); g.gain.setValueAtTime(o.v || .1, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); s.connect(f); f.connect(g); g.connect(o.dry ? B.master : B.dry); s.start(t); s.stop(t + d + .02); s.onended = () => { this.voices = Math.max(0, this.voices - 1); };
    },
    kick(t, v){ const ac = this.ac, B = this.bus; const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .13); g.gain.setValueAtTime(v || .5, t); g.gain.exponentialRampToValueAtTime(.0001, t + .28); o.connect(g); g.connect(B.master); o.start(t); o.stop(t + .3); this.noise(t, .02, {f: 2500, v: .08, dry: 1}); },
    snare(t, v){ this.noise(t, .17, {ft: "bandpass", f: 1900, q: .7, v: v || .22}); this.tone(t, 190, .09, {w: "triangle", v: (v || .22) * .7, cut: 1500, r: .05}); },
    hat(t, v, open){ this.noise(t, open ? .13 : .035, {f: 8500, v: v || .07}); },
    // ---------- 曲の進行 ----------
    play(ac, key, vol){
        if(this.key === key && this.live && this.ac === ac) { if(vol != null) this.setVol(vol); return; }
        const th = THEMES[key] || THEMES.field; if(vol != null) this.vol = vol;
        if(!this.bus || this.ac !== ac){ this.attach(ac); }
        this.stop(true); this.done = ""; this.key = key; this.th = th; this.bar = 0; this.live = true; this.nextT = ac.currentTime + .08; this.endBar = ONESHOT[key] || 0;
        this.bus.master.gain.cancelScheduledValues(ac.currentTime); this.bus.master.gain.setValueAtTime(.0001, ac.currentTime); this.bus.master.gain.linearRampToValueAtTime(this.vol * .8, ac.currentTime + 1.1);
        this.timer = setInterval(() => { try{ this.pump(); }catch(_e){ this.stop(); } }, 90);
    },
    stop(quick){
        this.live = false; clearInterval(this.timer); this.timer = 0; this.key = "";
        if(this.bus && this.ac){ try{ const t = this.ac.currentTime, g = this.bus.master.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(.0001, t + (quick ? .05 : .5)); }catch(_e){} }
    },
    pump(){ const ac = this.ac; if(!this.live || !ac) return; const barLen = 4 * 60 / this.th.bpm; let n = 0; while(this.nextT < ac.currentTime + .6 && n++ < 3){ this.scheduleBar(this.nextT, this.bar); this.nextT += barLen; this.bar++; if(this.endBar && this.bar >= this.endBar){ this.live = false; clearInterval(this.timer); this.done = this.key; setTimeout(() => this.stop(), barLen * 1000 + 1500); return; } } },
    // 1小節ぶんを時刻 t0 に予約する
    scheduleBar(t0, bar){
        const th = this.th, sc = SCALES[th.sc], q = 60 / th.bpm, s16 = q / 4, bi = bar % th.prog.length;
        const deg = (d, oct) => { const n = sc.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return th.root + sc[i] + (o + (oct || 0)) * 12; };
        const root = th.prog[bi], chord = [root, root + 2, root + 4];
        const R = rng(this.key + ":" + (bar % 8) + (bar % 16 >= 8 ? "b" : "a"));
        const last = bar === (this.endBar ? this.endBar - 1 : -1);
        // パッド（デチューンした鋸波を三声）
        if(th.pad){ const cut = 900 + (th.drone ? 0 : 500) + Math.sin(bar * .7) * 300; chord.forEach((d, i) => this.tone(t0, mtof(deg(d, 0)), q * 4 - .05, {w: "sawtooth", det: [-9, 0, 8], a: .5, r: 1.1, v: .045, cut, cut2: cut * 1.8, pan: (i - 1) * .4, echo: .1})); }
        if(th.drone) this.tone(t0, mtof(th.root - 12), q * 4, {w: "sine", a: .8, r: 1.4, v: .12, cut: 300});
        // ベース
        if(th.bass){ const pat = th.drum >= 2 ? [0, 0, 4, 0, 0, 0, 4, 0] : [0, null, 4, null, 0, null, 2, null]; pat.forEach((p, i) => { if(p == null) return; const f = mtof(deg(root + p, -1)); this.tone(t0 + i * q / 2, f, q / 2 * .9, {w: "sawtooth", v: .13, cut: 520, cut2: 200, a: .004, r: .06, sus: .6, dec: .12}); this.tone(t0 + i * q / 2, f, q / 2 * .9, {w: "sine", v: .15, cut: 400, a: .004, r: .06}); }); }
        // アルペジオ（16分で和音を駆け上がる）
        if(th.arp){ const order = bar % 2 ? [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1] : [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 1]; const aq = th.slow ? 2 : 1;
            for(let i = 0; i < 16; i += aq){ if(R() > th.dens + .2) continue; const ci = order[i], d = chord[ci % 3] + (ci >= 3 ? 7 : 0); this.tone(t0 + i * s16, mtof(deg(d, 1)), s16 * 1.8 * aq, {w: "triangle", v: .05 + (i % 4 === 0 ? .015 : 0), cut: 4200, a: .003, r: .1, pan: Math.sin(i * .9) * .5, echo: .22}); } }
        // リード（コードトーンを強拍に、弱拍は音階で動く。休符も入れて歌わせる）
        if(th.lead){ let cur = chord[(R() * 3) | 0] + 7, t = 0; const rhy = th.drum >= 2 ? [2, 2, 2, 2, 4, 4] : [4, 2, 2, 4, 4, 8, 8];
            while(t < 16){ const L = rhy[(R() * rhy.length) | 0], len = Math.min(L, 16 - t); const strong = t % 4 === 0; if(R() < th.dens + .1){ if(strong) cur = chord[(R() * 3) | 0] + (R() < .5 ? 7 : 14); else cur += R() < .5 ? -1 : 1; cur = Math.max(2, Math.min(18, cur)); if(last && t === 0) cur = root + 7;
                    this.tone(t0 + t * s16, mtof(deg(cur, 0) + 12 * (th.oct ? 0 : -1)), len * s16 * .92, {w: "square", det: [-6, 6], v: .06, cut: 3200, q: 1.2, a: .012, r: .18, vib: 14, echo: .35, pan: .15, sus: .7, dec: .1}); }
                t += len; } }
        // ドラム
        const D = th.drum; if(D){
            for(let i = 0; i < 16; i++){ const t = t0 + i * s16;
                if(D === 1){ if(i % 8 === 0) this.kick(t, .38); if(i % 8 === 4) this.snare(t, .1); if(i % 2 === 0) this.hat(t, .035); }
                else { const k = [0, 6, 8, 10].includes(i) || (D === 3 && [3, 14].includes(i)); if(k) this.kick(t, .5); if(i === 4 || i === 12) this.snare(t, .26); this.hat(t, i % 2 ? .035 : .075, i === 14); }
            } }
        // 波の音（海の曲）
        if(th.wave) this.noise(t0 + q, q * 3, {ft: "bandpass", f: 500, f2: 1400, q: .5, v: .05});
        if(last) chord.forEach((d, i) => this.tone(t0 + q * 3, mtof(deg(d, 1)), q * 2, {w: "triangle", v: .08, a: .02, r: 1.5, echo: .3}));
    },
    // ---------- 効果音（リバーブつき・ノイズ混ぜ）----------
    se(ac, name, vol){
        if(!this.bus || this.ac !== ac) this.attach(ac); const t = ac.currentTime + .005, V = (vol == null ? .6 : vol);
        const T = (f, d, o, dt) => this.tone(t + (dt || 0), f, d, Object.assign({v: .16 * V * 1.6}, o));
        const S = {
            ok: () => { T(880, .07, {w: "triangle", r: .1, echo: .2}); T(1320, .1, {w: "triangle", r: .14, echo: .3}, .06); },
            cancel: () => { T(520, .08, {w: "triangle", r: .1}); T(370, .1, {w: "triangle", r: .12}, .07); },
            move: () => T(1000, .03, {w: "triangle", v: .07 * V, r: .04}), talk: () => T(700 + Math.random() * 120, .04, {w: "triangle", v: .06 * V, r: .05}),
            hit: () => { this.noise(t, .12, {ft: "bandpass", f: 1800, f2: 400, v: .22 * V}); T(150, .1, {w: "sawtooth", cut: 700, cut2: 120, r: .1}); },
            crit: () => { this.noise(t, .25, {ft: "bandpass", f: 3200, f2: 300, v: .3 * V}); T(110, .25, {w: "sawtooth", cut: 900, cut2: 80, r: .2}); T(1568, .12, {w: "square", cut: 4000, echo: .4}, .02); T(2093, .2, {w: "square", cut: 4000, echo: .4}, .07); },
            heal: () => [659, 880, 1109, 1318].forEach((f, i) => T(f, .16, {w: "triangle", r: .3, echo: .5, v: .12 * V}, i * .08)),
            levelup: () => [523, 659, 784, 1047, 1319].forEach((f, i) => { T(f, .2, {w: "square", cut: 3000, r: .3, echo: .4, v: .09 * V}, i * .1); T(f / 2, .2, {w: "sine", r: .2, v: .1 * V}, i * .1); }),
            warp: () => { T(200, .5, {w: "sawtooth", cut: 300, cut2: 5000, r: .3, echo: .5, v: .1 * V}); this.noise(t, .6, {ft: "bandpass", f: 300, f2: 6000, v: .12 * V}); },
            win: () => [[523, 0], [523, .12], [523, .24], [784, .4], [659, .56], [784, .68], [1047, .84]].forEach(([f, d]) => { T(f, .18, {w: "square", cut: 3500, echo: .35, r: .25, v: .09 * V}, d); T(f / 2, .18, {w: "triangle", r: .2, v: .1 * V}, d); }),
            lose: () => [392, 349, 311, 262, 196].forEach((f, i) => T(f, .3, {w: "sawtooth", cut: 800, r: .5, echo: .5, v: .08 * V}, i * .22)),
            encounter: () => { this.noise(t, .5, {ft: "bandpass", f: 200, f2: 4000, v: .2 * V}); T(180, .4, {w: "sawtooth", cut: 500, cut2: 3000, r: .2, v: .13 * V}); T(135, .4, {w: "sawtooth", cut: 500, cut2: 2500, r: .2, v: .13 * V}, .08); }
        };
        if(S[name]){ S[name](); return true; } return false;
    },
    // ---------- 検証用: 曲を OfflineAudioContext に描画 ----------
    async render(key, bars, rate){
        const sr = rate || 22050, len = Math.floor(sr * (bars * 4 * 60 / (THEMES[key] || THEMES.field).bpm + 2)); const oc = new OfflineAudioContext(2, len, sr);
        const keep = {ac: this.ac, bus: this.bus, mv: this.maxVoices}; this.maxVoices = 1e9; this.ac = oc; this.vol = .6; this.attach(oc); this.key = key; this.th = THEMES[key] || THEMES.field; this.endBar = 0;
        for(let b = 0; b < bars; b++) this.scheduleBar(b * 4 * 60 / this.th.bpm + .05, b);
        const buf = await oc.startRendering(); this.ac = keep.ac; this.bus = keep.bus; this.maxVoices = keep.mv; this.key = ""; this.voices = 0; return buf;
    }
};
export const THEME_KEYS = Object.keys(THEMES);
