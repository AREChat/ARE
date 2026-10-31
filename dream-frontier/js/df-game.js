// ===== ゲームロジック（描画エンジンに よらない）=====
import {DF} from "./config.js";
import {ZONES, AREA_NAMES, zoneAt, ATTRACTIONS, STAMPS, byId, QUARTET, BOAT_PTS} from "./df-data.js";
import {yawOf, pitchOf} from "./df-path.js";
import {pathOf} from "./df-world.js";

const lerpv = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
const CODE = "427";
const DEF = () => ({stamps: {}, coins: 30, clues: {}, safeOpen: false, shoot: 0, played: 0, wish: 0, done: false, pos: [0, 24], yaw: Math.PI});
export class Game{
    constructor(world, ui, hooks){
        this.world = world; this.ui = ui; this.hooks = hooks || {};
        this.sv = this.load(); this.t = 0; this.mode = "walk"; this.x = this.sv.pos[0]; this.z = this.sv.pos[1]; this.yaw = this.sv.yaw; this.pitch = 0; this.fov = 70;
        this.eyeH = 1.65; this.bob = 0; this.ride = null; this.lookYaw = 0; this.lookPitch = 0; this.near = null; this.watch = 0; this.paths = {}; this.msgT = 0; this.shake = 0; this.fx = [];
        for(const a of ATTRACTIONS) if(a.kind === "track") { const p = pathOf(a); let pk = 0, py = -1; for(let i = 0; i < p.pts.length; i++) if(p.pts[i][1] > py){ py = p.pts[i][1]; pk = i; } p.peak = p.len[pk]; this.paths[a.id] = p; }
        this.guests = Array.from({length: 6}, (_, i) => ({m: "guest" + i, r: 6 + i * 2.6, a: i * 1.1, w: (i % 2 ? 1 : -1) * (.07 + i * .01), y: 0}));
        this.cut = null;
    }
    load(){ try{ const j = JSON.parse(localStorage.getItem(DF.saveKey) || "null"); if(j && j.stamps) return Object.assign(DEF(), j); }catch(e){} return DEF(); }
    save(){ this.sv.pos = [this.x, this.z]; this.sv.yaw = this.yaw; try{ localStorage.setItem(DF.saveKey, JSON.stringify(this.sv)); }catch(e){} }
    reset(){ this.sv = DEF(); this.x = this.sv.pos[0]; this.z = this.sv.pos[1]; this.yaw = this.sv.yaw; this.save(); }
    count(){ return STAMPS.filter((s) => this.sv.stamps[s]).length; }
    emit(ev, d){ try{ this.hooks.emit && this.hooks.emit(ev, d); }catch(e){} }

    // ---- 目標（ナビ）----
    objective(){
        const left = ATTRACTIONS.filter((a) => !this.sv.stamps[a.id]);
        if(!left.length) return {text: "全制覇！ ふんすいの まえで 証明書を もらおう", at: [0, 0]};
        if(!this.sv.clues.clock && !this.sv.stamps.puzzle && this.count() >= 3) { const p = left.find((a) => a.id === "puzzle"); if(p) return {text: "ミステリー・マナーで てがかりを さがそう（とけい・え・ほんだな）", at: [79, 14]}; }
        let best = null, bd = 1e9; for(const a of left){ const pos = this.posOf(a); const d = Math.hypot(pos[0] - this.x, pos[1] - this.z); if(d < bd){ bd = d; best = {text: AREA_NAMES[a.area] + "の「" + a.n + "」に のろう", at: pos}; } } return best;
    }
    posOf(a){ if(a.board) return [a.board.x, a.board.z]; if(a.id === "parade") return [0, 17]; if(a.id === "puzzle") return [91, 36]; return [0, 0]; }
    paradeState(){ const c = this.t - 35; if(c < 0) return {on: false, next: 35 - this.t}; const per = 150, k = c % per; return k < 70 ? {on: true, k, left: 70 - k} : {on: false, next: per - k}; }

    // ---- 近くの もの ----
    scan(){
        let best = null, bd = 1e9; const cand = (id, label, x, z, r, kind, extra) => { const d = Math.hypot(x - this.x, z - this.z); if(d < r && d < bd){ bd = d; best = Object.assign({id, label, x, z, kind}, extra); } };
        for(const a of ATTRACTIONS) if(a.board) cand(a.id, (this.sv.stamps[a.id] ? "✓ " : "") + a.n + " に のる", a.board.x, a.board.z, a.board.r + .6, "ride", {a});
        for(const q of QUARTET){ const p = this.npcPos(q); cand(q.id, q.name + " と はなす", p[0], p[1], 2.6, "npc", {q}); }
        cand("info", "インフォメーション（スタンプちょう）", 0, -12, 5.2, "info");
        cand("fountain", "ふんすいに コインを なげる", 0, 0, 5.2, "fountain");
        cand("clock", "おおきな とけいを しらべる", 66.8, 22, 2.8, "clue"); cand("picture", "かべの えを しらべる", 91.6, 28, 3.0, "clue"); cand("books", "ほんだなを しらべる", 70, 38.3, 3.4, "clue"); cand("safe", "きんこを しらべる", 91, 38, 3.0, "safe");
        const ps = this.paradeState(); if(ps.on){ const a = Math.atan2(this.x, this.z), r = Math.hypot(this.x, this.z); if(Math.abs(r - 17) < 9) { /* パレードを 見ている */ } }
        this.near = best;
    }
    npcPos(q){ return q.at; }

    interact(){
        const n = this.near; if(!n || this.mode !== "walk") return;
        if(n.kind === "ride") return this.board(n.a);
        if(n.kind === "npc") return this.talk(n.q);
        if(n.kind === "info") return this.ui.showStamps(this);
        if(n.kind === "fountain"){ if(this.sv.coins <= 0) return this.ui.toast("コインが ないよ…"); this.sv.coins--; this.sv.wish++; this.ui.toast(["コインを ちゃぽん。 ねがいごと、ひとつ。", "きらきらっ！ ふんすいが すこし ひかった。", "ふんすいが 「A R E」と ささやいた きがする…"][this.sv.wish % 3]); this.fx.push({t: 0, x: 0, z: 0}); this.sfx("coin"); this.save(); return; }
        if(n.kind === "clue"){ const T = {clock: ["おおきな とけいだ。 はりは 「4」じを さしている。 うらに「4」と きざまれている。", 4], picture: ["えの なかで ふたごの ほしが 「2」つ かがやいている。 わくに「2」の もよう。", 2], books: ["ほんだなの ほんが なんさつか ならんでいる。 せびょうしに かかれた かず「7」。", 7]}[n.id]; this.sv.clues[n.id] = true; this.ui.say("てがかり", [T[0], "（メモ：" + ["とけい", "え", "ほん"].filter((_, i) => this.sv.clues[["clock", "picture", "books"][i]]).join("・") + " を しらべた）"]); this.sfx("clue"); this.save(); return; }
        if(n.kind === "safe"){
            if(this.sv.safeOpen) return this.ui.toast("きんこは もう あいている。 なかは からっぽだ。");
            const have = Object.keys(this.sv.clues).length;
            if(have < 3) return this.ui.say("きんこ", ["3けたの ばんごうで ひらくようだ。", "てがかりは やかたの なかに あるらしい。（とけい・え・ほんだな）"]);
            return this.ui.keypad((v) => { if(v === CODE){ this.sv.safeOpen = true; this.ui.say("きんこ", ["カチリ…！ きんこが ひらいた！", "なかには「ふしぎな ほしの かけら」が はいっていた。"]); this.stamp("puzzle"); this.sfx("ok"); } else { this.ui.toast("ブブー。 ばんごうが ちがうみたい。"); this.sfx("ng"); } return v === CODE; });
        }
    }
    talk(q){ const L = q.lines; const i = (this.sv["tk_" + q.id] || 0); this.sv["tk_" + q.id] = i + 1; this.ui.say(q.name, [L[i % L.length]]); const ps = this.paradeState(); }

    // ---- スタンプ ----
    stamp(id){
        if(this.sv.stamps[id]) return false; this.sv.stamps[id] = true; const a = byId(id); const c = this.count(); const coin = (a && a.coin) || 20; this.sv.coins += coin;
        this.ui.toast("🏅 スタンプ ゲット！「" + (a ? a.n : id) + "」  (" + c + "/" + STAMPS.length + ")  +" + coin + "コイン"); this.sfx("stamp"); this.emit("stamp", {id, count: c, coins: this.sv.coins});
        if(c >= STAMPS.length && !this.sv.done){ this.sv.done = true; setTimeout(() => { this.ui.cert(this); this.emit("complete", {count: c}); }, 1200); }
        this.save(); return true;
    }

    // ---- のりもの ----
    board(a){
        if(a.kind === "quest") return this.ui.toast("ここは「やかた」の きんこの なぞ。 やかたの なかの てがかりを さがそう！");
        if(a.kind === "show"){ const ps = this.paradeState(); return this.ui.say("ドリーム・パレード", [ps.on ? "いま パレードの まっさいちゅう！ ひろばの ちかくで 4びょう みていよう。" : "つぎの パレードまで あと " + Math.ceil(ps.next) + "びょう。 ひろばで まっていよう！", "（ひろばの ふんすいの まわりを パレードが とおるよ）"]); }
        if(this.sv.coins < (a.coin || 0) && a.coin) { return this.ui.toast("コインが たりない… (" + a.coin + "コイン ひつよう)"); }
        const R = {a, t: 0, s: 0, lap: 0, text: null, texts: {}, alt: .3, spd: 1, hits: 0, targets: [], fire: 0, spawn: 0, done: false, fade: 1};
        if(a.coin){ this.sv.coins -= a.coin; }
        this.sv.played++; this.ride = R; this.mode = "ride"; this.lookYaw = 0; this.lookPitch = 0; this.pitch = 0; this.sfx("start");
        this.ui.rideStart(a); this.emit("ride", {id: a.id});
        if(a.kind === "shoot"){ this.yaw = 0; this.pitch = 0; }
        if(a.kind === "wheel") this.yaw = -Math.PI / 4;
    }
    endRide(ok){
        const R = this.ride; if(!R) return; const a = R.a; this.ride = null; this.mode = "walk"; this.ui.rideEnd();
        const b = a.board; if(a.kind === "drop"){ this.x = a.board.x; this.z = a.board.z; } else { this.x = b.x; this.z = b.z; }
        this.yaw = Math.atan2(this.x - (a.c ? a.c[0] : this.x), this.z - (a.c ? a.c[1] : this.z)) || Math.PI; this.yaw = Math.PI; this.pitch = 0; this.lookYaw = this.lookPitch = 0;
        if(ok){
            if(a.kind === "shoot"){ this.sv.shoot = Math.max(this.sv.shoot, R.hits); if(R.hits >= 8){ this.ui.toast("ヒット " + R.hits + "こ！ すごい うで まえ！"); this.stamp(a.id); if(R.hits >= 14){ this.sv.coins += 50; this.ui.toast("ぜんぶ ちかく あてた！ ボーナス +50コイン"); } } else this.ui.toast("ヒット " + R.hits + "こ…（8こ いじょうで スタンプ）"); }
            else this.stamp(a.id);
        } else this.ui.toast("のりものから おりた。");
        this.save();
    }

    // ---- いちフレーム ----
    update(dt, inp){
        dt = Math.min(dt, .05); this.t += dt; this.scan();
        for(const g of this.guests) g.a += g.w * dt;
        for(const f of this.fx) f.t += dt; this.fx = this.fx.filter((f) => f.t < 2.5);
        if(this.mode === "walk" || this.mode === "talk"){
            this.yaw -= inp.lx; this.pitch = clamp(this.pitch - inp.ly, -1.2, 1.2);
            if(this.mode === "walk" && !this.ui.busy()){
                const sp = (inp.run ? 8.2 : 5.2) * dt, fw = [Math.sin(this.yaw), Math.cos(this.yaw)], rt = [-Math.cos(this.yaw), Math.sin(this.yaw)];
                let mx = (fw[0] * inp.my + rt[0] * inp.mx), mz = (fw[1] * inp.my + rt[1] * inp.mx); const l = Math.hypot(mx, mz); if(l > 1){ mx /= l; mz /= l; }
                this.move(mx * sp, mz * sp); if(l > .1) this.bob += dt * (inp.run ? 11 : 8); 
                if(inp.act) this.interact();
            }
            // パレードを 見る
            const ps = this.paradeState();
            if(ps.on && !this.sv.stamps.parade){ const r = Math.hypot(this.x, this.z); if(r > 8 && r < 26){ this.watch += dt; if(this.watch > 4) this.stamp("parade"); } } else if(!ps.on) this.watch = 0;
            if(ps.on && !this._pshow){ this._pshow = true; this.ui.toast("🎉 ドリーム・パレードが はじまったよ！ ひろばに あつまれ！"); this.sfx("fan"); } if(!ps.on) this._pshow = false;
            if(this.t - (this._sv || 0) > 10){ this._sv = this.t; this.save(); }
        } else if(this.mode === "ride") this.updateRide(dt, inp);
        const z = zoneAt(this.x, this.z); if(z !== this.zone){ this.zone = z; this.ui.area(AREA_NAMES[z]); this.hooks.zone && this.hooks.zone(z); }
    }
    move(dx, dz){
        const W = this.world, r = .38; let x = this.x + dx, z = this.z + dz;
        for(let k = 0; k < 2; k++) for(const s of W.solids){ const ex = x - s.x, ez = z - s.z, d = Math.hypot(ex, ez), m = s.r + r; if(d < m && d > .0001){ x = s.x + ex / d * m; z = s.z + ez / d * m; } }
        if(x > -28 && x < 36 && z > 62.5 && z < 96){ if(this.x > -28 && this.x < 36 && this.z <= 62.5) z = 62.5; else if(this.z >= 96) z = 96; else { x = this.x; z = this.z; } } // みずうみ
        const b = W.bounds; x = clamp(x, b.x0, b.x1); z = clamp(z, b.z0, b.z1); this.x = x; this.z = z;
    }

    updateRide(dt, inp){
        const R = this.ride, a = R.a; R.t += dt; this.ui.rideSet && this.ui.rideSet(R, a);
        this.lookYaw = clamp(this.lookYaw - inp.lx, -1.5, 1.5); this.lookPitch = clamp(this.lookPitch - inp.ly, -.9, .9);
        if(inp.esc || inp.act2){ return this.endRide(false); }
        const free = (R.a.kind === "shoot");
        if(!free && !inp.looking){ this.lookYaw *= Math.pow(.4, dt); this.lookPitch *= Math.pow(.4, dt); }
        const ev = (list, frac) => { for(const e of list || []){ if(!R.texts[e.s] && frac >= e.s){ R.texts[e.s] = 1; this.ui.toast(e.text, 3200); if(e.ev === "drop") this.shake = .6; if(e.ev === "splash"){ this.shake = 1; this.fxSplash = this.t; } if(e.ev === "climb" || e.ev === "drop" || e.ev === "splash") this.sfx(e.ev); } } };
        if(a.kind === "track"){
            const p = this.paths[a.id], tot = p.total; let v;
            const y0 = p.at(R.s)[1], sp = a.speed;
            if(sp.type === "const") v = sp.v; else { v = R.s < p.peak && R.lap === 0 || R.s < p.peak && R.lap > 0 ? 6.5 : Math.max(sp.vmin, Math.sqrt(2 * sp.g * Math.max(0, sp.h0 - y0))); }
            if(a.manual){ if(inp.my > .3) R.spd = Math.min(1.35, R.spd + dt * .6); else if(inp.my < -.3) R.spd = Math.max(.45, R.spd - dt * 1.2); else R.spd += (1 - R.spd) * dt * .8; v *= R.spd; }
            R.v = v; R.s += v * dt; const lapTot = a.closed ? tot : tot; let frac = (R.s + R.lap * tot) / (tot * a.laps);
            if(R.s >= tot){ if(a.closed && R.lap + 1 < a.laps){ R.lap++; R.s -= tot; R.texts = {}; } else { R.s = tot; R.done = true; } }
            frac = clamp((R.s + R.lap * tot) / (tot * a.laps), 0, 1);
            ev(a.events, frac); if(a.scares) for(const sc of a.scares){ if(!R.texts[sc.s] && frac >= sc.s - .02){ R.texts[sc.s] = 1; this.ui.toast(sc.text, 2600); this.sfx("boo"); } }
            R.frac = frac; if(R.done || (a.closed && R.lap + 1 >= a.laps && R.s >= tot - .1)){ if(!R.fin){ R.fin = this.t; this.ui.toast("おつかれさま！ ぶじ とうちゃく！"); } if(this.t - R.fin > 1.2) this.endRide(true); }
        } else if(a.kind === "orbit"){ R.frac = R.t / a.dur; if(a.mode === "cup"){ R.spinV = lerpv(R.spinV === undefined ? 1 : R.spinV, 1.0 - inp.mx * 2.8, 1 - Math.pow(.15, dt)); R.spin = (R.spin || 0) + R.spinV * dt; } if(a.mode === "balloon"){ R.alt = clamp(R.alt + (inp.my > .3 ? 1 : inp.my < -.3 ? -1 : 0) * dt * .25, 0, 1); } if(R.t >= a.dur) this.endRide(true); }
        else if(a.kind === "wheel"){ R.frac = R.t / a.dur; if(R.t > a.dur) this.endRide(true); }
        else if(a.kind === "sim"){ R.frac = R.t / a.dur; ev(a.events, R.frac); if(!R.texts.w && R.frac > .7){ R.texts.w = 1; this.ui.fade(); this.sfx("fan"); } if(!R.texts.s && R.frac > .34){ R.texts.s = 1; this.sfx("drop"); } this.shake = (R.frac > .34 && R.frac < .52) ? .5 : (R.frac > .7 && R.frac < .86 ? .3 : .08); if(R.t > a.dur) this.endRide(true); }
        else if(a.kind === "drop"){ if(R.t > 16.2) this.endRide(true); else if(R.t > 9 && !R.texts[1]){ R.texts[1] = 1; this.ui.toast("てっぺんだ…！ いくよ…！", 2000); } else if(R.t > 11.6 && !R.texts[2]){ R.texts[2] = 1; this.shake = .7; this.sfx("drop"); } }
        else if(a.kind === "shoot"){
            R.fire = Math.max(0, R.fire - dt); R.spawn -= dt;
            if(R.spawn <= 0 && R.targets.length < 5){ R.spawn = .8 + Math.random() * .6; const dir = Math.random() < .5 ? -1 : 1; R.targets.push({x: (Math.random() - .5) * 28 + 18, y: .8 + Math.random() * 3, z: 68 + Math.random() * 24, vx: dir * (1 + Math.random() * 1.8), life: 7, hit: 0, a: Math.random() * 6}); }
            for(const tg of R.targets){ tg.life -= dt; tg.x += tg.vx * dt; if(tg.hit) tg.hit += dt; } R.targets = R.targets.filter((tg) => tg.life > 0 && tg.hit < .5);
            if(inp.act && R.fire <= 0){ R.fire = .28; this.sfx("shot"); const cy = this.yaw + this.lookYaw, cp = this.pitch + this.lookPitch; const dx = Math.sin(cy) * Math.cos(cp), dy = Math.sin(cp), dz = Math.cos(cy) * Math.cos(cp); const ex = a.board.x, ey = 1.7, ez = a.board.z + 1.4;
                let bestT = null, bt = 1e9; for(const tg of R.targets){ if(tg.hit) continue; const wx = tg.x - ex, wy = tg.y - ey, wz = tg.z - ez; const tt = wx * dx + wy * dy + wz * dz; if(tt < 0) continue; const px = wx - dx * tt, py = wy - dy * tt, pz = wz - dz * tt; if(Math.hypot(px, py, pz) < 1.0 && tt < bt){ bt = tt; bestT = tg; } }
                if(bestT){ bestT.hit = .001; R.hits++; this.sfx("hit"); } }
            if(R.t >= a.dur) this.endRide(true);
        }
        this.shake = Math.max(0, this.shake - dt * .9);
    }

    // ---- カメラ・せかい ----
    sfx(n){ this.hooks.sfx && this.hooks.sfx(n); }
    camera(){
        const R = this.ride; let cam = {eye: [this.x, this.eyeH + Math.sin(this.bob) * .035, this.z], yaw: this.yaw, pitch: this.pitch, fov: this.fov};
        if(this.mode !== "ride" || !R) return cam; const a = R.a, t = R.t;
        const shake = this.shake ? (Math.random() - .5) * this.shake * .12 : 0;
        if(a.kind === "track"){ const p = this.paths[a.id], P = p.at(R.s), Q = p.at(R.s + 1.8), P2 = p.at(R.s + 5); const yw = yawOf(P, Q), pt = pitchOf(P, P2) * .8; cam = {eye: [P[0], P[1] + a.eye, P[2]], yaw: yw + this.lookYaw, pitch: pt + this.lookPitch + shake, fov: 72 + (R.v || 0) * .5}; if(a.id === "boat" || a.id === "safari" || a.id === "splash") cam.eye[1] += Math.sin(t * 1.7) * .03; }
        else if(a.kind === "sim"){ const f = R.frac, z = this.cosmoZ(t, a), sh = this.shake; const sw = Math.sin(t * .6) * .06; cam = {eye: [Math.sin(t * .9) * .6 + (Math.random() - .5) * sh * .5, 400 + Math.sin(t * 1.1) * .5 + (Math.random() - .5) * sh * .5, z], yaw: sw + this.lookYaw + (f > .15 && f < .3 ? .22 : 0), pitch: this.lookPitch + (Math.random() - .5) * sh * .06 + Math.sin(t * .5) * .03, fov: 70 + (f > .7 && f < .88 ? 30 * Math.sin((f - .7) / .18 * Math.PI) : 0)}; }
        else if(a.kind === "orbit"){ const k = a.mode, w = a.w; if(k === "cup"){ const ph = t * w, [cx, cz] = a.c; cam = {eye: [cx + Math.sin(ph) * a.r, 2.3, cz + Math.cos(ph) * a.r], yaw: (R.spin || 0) + this.lookYaw, pitch: this.lookPitch - .06, fov: 78}; } else if(k === "horse"){ const ph = t * w; const [cx, cz] = a.c; cam = {eye: [cx + Math.sin(ph) * a.r, a.h0 + a.bob * Math.sin(t * 2.4) + 1.35, cz + Math.cos(ph) * a.r], yaw: ph + Math.PI / 2 + this.lookYaw, pitch: this.lookPitch - .05, fov: 72}; }
            else if(k === "balloon"){ const ph = t * w, h = lerp(a.h0, a.h1, R.alt); const [cx, cz] = a.c; cam = {eye: [cx + Math.sin(ph) * a.r, h + 1.6, cz + Math.cos(ph) * a.r], yaw: ph + Math.PI / 2 + this.lookYaw, pitch: this.lookPitch - .12, fov: 74}; }
            else { const f = t / a.dur, rise = ease(clamp(f / .25, 0, 1)) * (1 - ease(clamp((f - .85) / .15, 0, 1))); const r = lerp(a.r, a.r1, rise), w2 = lerp(a.w, a.w1, rise), ph = (this._sw = (this._sw || 0)), h = lerp(a.h0, a.h1, rise); this._sw = (t < .05 ? 0 : this._sw) + w2 * (1 / 60); const [cx, cz] = a.c; const phi = this.swPhase(t, a); cam = {eye: [cx + Math.sin(phi) * r, h - 3.2 + 1.2, cz + Math.cos(phi) * r], yaw: phi + Math.PI / 2 + this.lookYaw, pitch: this.lookPitch - .05 - rise * .1, fov: 76}; } }
        else if(a.kind === "wheel"){ const ang = this.wheelAng(t, a); const R0 = a.R; const gy = a.cy + Math.cos(ang) * R0, gz = a.c[1] + Math.sin(ang) * R0; cam = {eye: [a.c[0], gy - .7, gz], yaw: this.yaw + this.lookYaw, pitch: this.lookPitch - .08, fov: 72}; }
        else if(a.kind === "drop"){ const y = this.dropY(t, a); cam = {eye: [a.c[0] + 2.5, y + 1.3, a.c[1]], yaw: Math.PI / 2 + this.lookYaw, pitch: this.lookPitch - .05, fov: 76 + (t > 11.6 && t < 13.2 ? 10 : 0)}; cam.eye[1] += shake; }
        else if(a.kind === "shoot"){ cam = {eye: [a.board.x, 1.7, a.board.z + 1.4], yaw: this.yaw + this.lookYaw, pitch: this.pitch + this.lookPitch, fov: 62}; }
        return cam;
    }
    swPhase(t, a){ // ぐるぐるの かく度（角速度が なめらかに かわるので 積分）
        let ph = 0, step = .05; for(let u = 0; u < t; u += step){ const f = u / a.dur, rise = ease(clamp(f / .25, 0, 1)) * (1 - ease(clamp((f - .85) / .15, 0, 1))); ph += lerp(a.w, a.w1, rise) * Math.min(step, t - u); } return ph;
    }
    wheelAng(t, a){ return Math.PI + t / a.dur * TAU; }
    dropY(t, a){ const H = a.H, y0 = a.y0; if(t < 2) return y0; if(t < 9) return lerp(y0, H, ease((t - 2) / 7)); if(t < 11.6) return H; const F = 1.6, hF = H - 6 - y0, g = 2 * hF / (F * F); if(t < 11.6 + F){ const u = t - 11.6; return H - .5 * g * u * u; } if(t < 14.4) return lerp(y0 + 6, y0, 1 - Math.pow(1 - (t - 11.6 - F) / 1.2, 2)); return y0; }
    cosmoZ(t, a){ const T1 = a.dur * .7, T2 = a.dur * .86; const v = (u) => u < T1 ? 14 : u < T2 ? 14 + 56 * ease((u - T1) / (T2 - T1)) : 14 + 56 * (1 - ease((u - T2) / (a.dur - T2))); let z = 0; for(let u = 0; u < t; u += .1) z += v(u) * Math.min(.1, t - u); return z; }
    env(){ let z = this.zone || "center"; if(this.mode === "ride" && this.ride.a.env) z = this.ride.a.env; return ZONES[z] || ZONES.center; }
    bgmKey(){ if(this.mode === "ride"){ const e = this.ride.a.env; if(e === "ghost") return "demoncastle"; if(e === "dark") return "town"; if(e === "night") return "sea"; if(e === "space") return "field"; } return ({center: "town", grove: "cave", sky: "field", manor: "demoncastle", lagoon: "sea"})[this.zone || "center"]; }

    dyn(t){
        const D = [], R = this.ride, riding = (id) => R && R.a.id === id; const T = this.t;
        // 風車
        D.push({m: "windmill", x: -14 + 1.1, y: 9, z: -34, rx: T * 1.2});
        // ゲスト
        for(const g of this.guests){ const x = Math.cos(g.a) * g.r * 1.7, z = Math.sin(g.a) * g.r * 1.7 + 2; const dir = g.w > 0 ? 1 : -1; D.push({m: g.m, x, y: 0, z, yaw: Math.atan2(-Math.sin(g.a) * dir, Math.cos(g.a) * dir) + (dir > 0 ? 0 : Math.PI) * 0}); }
        // 4人
        for(const q of QUARTET) D.push({m: "npc_" + q.id, x: q.at[0], y: 0, z: q.at[1], yaw: Math.atan2(this.x - q.at[0], this.z - q.at[1]) });
        // ナビ
        const ob = this.objective(); if(ob && this.mode === "walk"){ const dx = ob.at[0] - this.x, dz = ob.at[1] - this.z, d = Math.hypot(dx, dz) || 1; const nx = this.x + dx / d * 2.4, nz = this.z + dz / d * 2.4; D.push({m: "navi", x: nx, y: 1.9 + Math.sin(T * 3) * .12, z: nz, yaw: T * 2}); }
        // カルーセル
        { const a = byId("carousel"); const ph0 = riding("carousel") ? R.t * a.w : T * a.w * .8; for(let i = 0; i < 8; i++){ const ph = ph0 + i / 8 * TAU; D.push({m: "horse", x: a.c[0] + Math.sin(ph) * a.r, y: a.h0 - .55 + a.bob * Math.sin((riding("carousel") ? R.t : T) * 2.4 + (i % 2) * 3.14), z: a.c[1] + Math.cos(ph) * a.r, yaw: ph + Math.PI / 2}); } if(riding("carousel")) D.splice(D.length - 8, 1); /* 自分の席は かくす */ }
        // かんらんしゃ
        { const a = byId("wheel"); const t0 = riding("wheel") ? R.t : T; const ang = Math.PI + t0 / a.dur * TAU; D.push({m: "wheel", x: a.c[0], y: a.cy, z: a.c[1], rx: ang}); for(let i = 0; i < 12; i++){ const g = ang + i / 12 * TAU; D.push({m: "gondola", x: a.c[0], y: a.cy + Math.cos(g) * a.R, z: a.c[1] + Math.sin(g) * a.R}); } if(riding("wheel")) D.splice(D.length - 12, 1); }
        // バルーン
        { const a = byId("balloon"); const rb = riding("balloon"); for(let i = 0; i < 4; i++){ const ph = (rb ? R.t : T) * a.w + i / 4 * TAU + (rb ? 0 : i), h = rb && i === 0 ? lerp(a.h0, a.h1, R.alt) : lerp(a.h0, a.h1, .5 + .4 * Math.sin(T * .3 + i)); D.push({m: "balloon", x: a.c[0] + Math.sin(ph) * a.r, y: h, z: a.c[1] + Math.cos(ph) * a.r}); } }
        // ウィンド・スイング
        { const a = byId("swing"); const rs = riding("swing"); const t0 = rs ? R.t : (T % a.dur); const f = t0 / a.dur, rise = rs || true ? ease(clamp(f / .25, 0, 1)) * (1 - ease(clamp((f - .85) / .15, 0, 1))) : 0; const r = lerp(a.r, a.r1, rise), h = lerp(a.h0, a.h1, rise); const base = this.swPhase(t0, a); D.push({m: "swingtop", x: a.c[0], y: h, z: a.c[1], yaw: base}); for(let i = 0; i < 6; i++){ const ph = base + i / 6 * TAU; D.push({m: "chair", x: a.c[0] + Math.sin(ph) * r, y: h, z: a.c[1] + Math.cos(ph) * r, yaw: ph + Math.PI / 2}); } if(rs) D.splice(D.length - 6, 1); }
        // スカイ・ドロップ
        { const a = byId("drop"); const t0 = riding("drop") ? R.t : (T % 22); D.push({m: "platform", x: a.c[0], y: this.dropY(t0, a), z: a.c[1]}); }
        // ゴースト
        if(riding("ghost")){ const a = R.a; const frac = R.frac || 0; for(const sc of a.scares) if(Math.abs(frac - sc.s) < .1){ const k = 1 - Math.abs(frac - sc.s) / .1; D.push({m: "ghost", x: sc.ghost[0] + Math.sin(T * 2) * .6, y: .3 + k * .4, z: sc.ghost[1], yaw: Math.atan2(this.camPos()[0] - sc.ghost[0], this.camPos()[2] - sc.ghost[1])}); } }
        else { const a = byId("ghost"); for(let i = 0; i < 2; i++) D.push({m: "ghost", x: 79 + Math.sin(T * .5 + i * 3) * 6, y: 1.6 + Math.sin(T + i) * .4, z: 28 + Math.cos(T * .4 + i * 2) * 6, yaw: T + i}); }
        // サファリ
        { const defs = [["giraffe", 70, 74, 1.2, .0], ["giraffe", 74, 76, 2.6, 0], ["elephant", 90, 84, 3.9, 0], ["fluffy", 60, 76, 1, 0], ["fluffy", 62, 82, 2, 0], ["lion", 52, 94, 0, 0], ["fluffy", 78, 98, 4, 0], ["elephant", 48, 78, 2.4, 0]]; for(const [m, x, z, yw] of defs) D.push({m, x, y: Math.max(0, Math.sin(T * 1.3 + x) * .06), z, yaw: yw + Math.sin(T * .3 + x) * .3}); }
        // パレード
        { const ps = this.paradeState(); if(ps.on){ for(let i = 0; i < 5; i++){ const a = -(ps.k * 1.5 / 17) - i * (TAU / 5); D.push({m: "float" + i, x: Math.cos(a) * 17, y: 0 + Math.sin(T * 3 + i) * .03, z: Math.sin(a) * 17, yaw: Math.atan2(Math.sin(a) * 1, -Math.cos(a)) + Math.PI / 2 * 0 + Math.PI}); for(let k = 0; k < 4; k++){ const aa = a + (k - 1.5) * .06; D.push({s: "star", x: Math.cos(aa) * 17, y: 3 + Math.sin(T * 4 + k + i) * 1.2 + k * .5, z: Math.sin(aa) * 17, w: .8, h: .8, c: [1, .9, .5], a: .9}); } } } }
        // ふんすいの スパークル
        for(let i = 0; i < 10; i++){ const u = (T * .8 + i / 10) % 1; D.push({s: "glow", x: Math.cos(i * 2.4) * u * 2.4, y: 1 + Math.sin(u * 3.14) * 3.4, z: Math.sin(i * 2.4) * u * 2.4, w: .5, h: .5, c: [.6, .85, 1], a: .8}); }
        for(const f of this.fx){ const k = f.t / 2.5; const letters = [["A", -1.4], ["R", 0], ["E", 1.4]]; for(let i = 0; i < 6; i++) D.push({s: "star", x: Math.cos(i + f.t * 3) * (.4 + k * 2), y: 1.5 + k * 4, z: Math.sin(i + f.t * 3) * (.4 + k * 2), w: .5, h: .5, c: [1, .9, .4], a: 1 - k}); }
        if(this.sv.done){ D.push({s: "are", x: 0, y: 6.6 + Math.sin(T) * .2, z: 0, w: 7, h: 2.6, c: [1, .95, .7], a: .95}); }
        // シューティング
        if(riding("shoot")) for(const tg of R.targets){ if(tg.hit) D.push({m: "star", x: tg.x, y: tg.y + tg.hit * 2, z: tg.z, sx: 1 + tg.hit * 4, sy: 1 + tg.hit * 4, sz: 1 + tg.hit * 4}); else D.push({m: "target", x: tg.x, y: tg.y + Math.sin(T * 2 + tg.a) * .2, z: tg.z, yaw: Math.PI}); }
        else { const a = byId("shoot"); for(let i = 0; i < 3; i++) D.push({m: "target", x: a.board.x - 8 + i * 8 + Math.sin(T + i) * 3, y: 1.2 + i * .4, z: 76 + i * 4, yaw: Math.PI}); }
        // おとぎライド：ほしのこ・かげの まじょ
        { const KID = [[-46.4, -14.6], [-47.6, -16.2], [-45.4, -17], [-48.6, -14.6], [-45.8, -13.6], [-61.4, -13.2], [-62.8, -14.8], [-60.2, -15.2]]; KID.forEach(([x, z], i) => D.push({m: "starkid", x, y: Math.abs(Math.sin(T * 2.2 + i)) * .35, z, yaw: Math.atan2((i < 5 ? -50 : -57) - x, -14 - z) + Math.sin(T + i) * .2}));
          D.push({m: "witch", x: -46.2, y: 0, z: -20.9, yaw: -2.2 + Math.sin(T * .8) * .25}); }
        // ムーンシップ（のりば）と 夜空の ほし
        { const rs = riding("ship"); if(!rs) D.push({m: "skyship", x: 44, y: 1.2 + Math.sin(T * 1.2) * .25, z: -19.2, yaw: Math.PI / 2 + Math.sin(T * .5) * .08}); else { for(let i = 0; i < 70; i++){ const a = i * 2.399, r = 40 + (i * 37 % 90); D.push({s: "star", x: Math.cos(a) * r, y: 55 + (i * 53 % 70), z: Math.sin(a) * r * .9, w: 1.1 + Math.sin(T * 3 + i) * .35, h: 1.1 + Math.sin(T * 3 + i) * .35, c: [1, .95, .7], a: .85}); } } }
        // ポップタウン・スピナー
        { const a = byId("spinner"), rs = riding("spinner"); for(let i = 0; i < 6; i++){ const ph = (rs ? R.t : T) * a.w + i / 6 * TAU; D.push({m: "cup", x: a.c[0] + Math.sin(ph) * a.r, y: .5, z: a.c[1] + Math.cos(ph) * a.r, yaw: i === 0 && rs ? (R.spin || 0) : T * (1 + i * .27)}); } }
        // コスモ・クルーズ
        if(riding("cosmo")){ const a = R.a, cz = this.cosmoZ(R.t, a), f = R.frac; const Y = 400, warp = f > .7 && f < .88;
            D.push({m: "planetA", x: -70, y: Y + 6, z: 90, sx: 26, sy: 26, sz: 26}); D.push({m: "planetB", x: 96, y: Y - 18, z: 560, sx: 24, sy: 24, sz: 24, yaw: R.t * .1});
            for(let i = 0; i < 36; i++){ const q = (i * 97 % 100) / 100, q2 = (i * 53 % 100) / 100, q3 = (i * 31 % 100) / 100; D.push({m: "rock", x: (q - .5) * 70, y: Y + (q2 - .5) * 36, z: 250 + q3 * 120, sx: 1.2 + q2 * 2.6, sy: 1.2 + q * 2.6, sz: 1.2 + q3 * 2.6, yaw: R.t * (q - .5), rx: R.t * (q2 - .5)}); }
            for(const gz of [440, 500]) D.push({m: "gate", x: 0, y: Y, z: gz, yaw: 0, rx: 0, sx: 1.2, sy: 1.2, sz: 1.2});
            D.push({m: "station", x: 0, y: Y - 4, z: this.cosmoZ(a.dur, a) + 70, yaw: 0});
            for(const [dx, dy, dz] of [[-6, 3, 40], [8, -2, 70], [-3, 5, 120]]) D.push({m: "drone", x: dx * (1 + Math.sin(R.t) * .2), y: Y + dy, z: cz + dz - (f > .2 && f < .34 ? 10 : 0), yaw: Math.sin(R.t * 2) * .3});
            for(let i = 0; i < 150; i++){ const sx = ((i * 73 % 180) - 90), sy = ((i * 41 % 120) - 60), sz = (i * 29 % 200); const rel = (((sz - cz) % 200) + 200) % 200; D.push({s: "glow", x: sx, y: Y + sy, z: cz + rel, w: .6, h: warp ? .6 + 3 : .6, c: warp ? [.7, .85, 1] : [1, 1, 1], a: .9}); } }
        // 自分のりもの
        if(riding("balloon")){ const a = R.a, ph = R.t * a.w, h = lerp(a.h0, a.h1, R.alt); D.push({m: "balloon", x: a.c[0] + Math.sin(ph) * a.r, y: h, z: a.c[1] + Math.cos(ph) * a.r}); }
        return D;
    }
    camPos(){ return this.camera().eye; }
}
export {CODE};
