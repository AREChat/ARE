"use strict";
// ===== 画面の文字まわり（会話・メニュー・トースト・カード・ダメージ表示） =====
const $ = (id) => document.getElementById(id);
export const UI = {
    $, fast: false, skipping: false, autoTalk: false, textSpeed: 2,
    _dlg: null, _menu: null, _typeT: 0, _autoT: 0, _toastT: 0,
    init(){
        const dlg = $("dlg");
        dlg.addEventListener("pointerdown", (e) => { if(e.target.closest("button")) return; this.advance(); e.preventDefault(); });
        $("autoBtn").addEventListener("click", () => this.toggleAuto());
        $("skipBtn").addEventListener("click", () => this.skip());
        $("card").addEventListener("pointerdown", () => { if(this._card) this._card(); });
        $("rotX").addEventListener("click", () => { $("rot").hidden = true; this._rotHidden = true; });
    },
    // ---------- 立ち絵（story の ["pic", "img/xxx.webp"] / ["pic", ""]）----------
    pic(src){ let e = document.getElementById("storyPic"); if(!src){ if(e) e.hidden = true; return; } if(!e){ e = document.createElement("img"); e.id = "storyPic"; e.alt = ""; e.draggable = false; document.body.appendChild(e); } e.onerror = () => { e.hidden = true; }; e.src = src; e.hidden = false; },
    // ---------- 会話 ----------
    say(who, text){
        return new Promise((resolve) => {
            const dlg = $("dlg"); this._clearTimers();
            if(this.fast){ resolve(); return; }
            dlg.hidden = false; $("dlgWho").hidden = !who; $("dlgWho").textContent = who || ""; $("dlgText").textContent = "";
            const full = String(text); let i = 0;
            this._dlg = {resolve, full, typing: true};
            if(this.skipping){ this._finishNow(); return; }
            this._typeT = setInterval(() => { i += this.textSpeed; $("dlgText").textContent = full.slice(0, i); if(this.blip && (this._bc = (this._bc || 0) + 1) % 2 === 0){ try{ this.blip(); }catch(_e){} } if(i >= full.length){ this._typed(); } }, 28);
        });
    },
    _typed(){ clearInterval(this._typeT); const d = this._dlg; if(!d) return; d.typing = false; $("dlgText").textContent = d.full; if(this.autoTalk) this._armAuto(); },
    _armAuto(){
        clearTimeout(this._autoT); const d = this._dlg; if(!d || d.typing) return;
        const ms = 900 + Array.from(d.full).length * 70; const bar = $("dlgBar"); if(bar){ bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "dlgbar " + ms + "ms linear forwards"; }
        this._autoT = setTimeout(() => { if(this._dlg === d && this.autoTalk) this._resolveDlg(); }, ms);
    },
    _finishNow(){ if(this._dlg){ $("dlgText").textContent = this._dlg.full; this._dlg.typing = false; } setTimeout(() => this._resolveDlg(), 0); },
    _resolveDlg(){ const d = this._dlg; if(!d) return; this._dlg = null; this._clearTimers(); d.resolve(); },
    advance(){ const d = this._dlg; if(!d) return false; if(d.typing){ this._typed(); return true; } this._resolveDlg(); return true; },
    toggleAuto(){ this.autoTalk = !this.autoTalk; const b = $("autoBtn"); b.classList.toggle("on", this.autoTalk); b.textContent = this.autoTalk ? "■ オート停止" : "▶ オート"; $("dlg").classList.toggle("auto", this.autoTalk); $("autoBadge").hidden = !this.autoTalk; clearTimeout(this._autoT); const bar = $("dlgBar"); if(bar) bar.style.animation = "none"; if(this.autoTalk) this._armAuto(); this.toast(this.autoTalk ? "オート会話：ON（自動で読み進めます）" : "オート会話：OFF（手動）", 1600); if(this.onAuto) this.onAuto(this.autoTalk); },
    skip(){ this.skipping = true; this.advance(); if(this._dlg) this._finishNow(); },
    stopSkip(){ this.skipping = false; },
    hideDlg(){ this._clearTimers(); this._dlg = null; $("dlg").hidden = true; },
    dlgOpen(){ return !!this._dlg; },
    _clearTimers(){ clearInterval(this._typeT); clearTimeout(this._autoT); },
    // ---------- メニュー（上下＋決定／タップ）----------
    // items: [{label, meta, disabled}]  → Promise<index | -1(キャンセル)>
    menu(title, items, opt){
        const o = opt || {};
        return this.list($("menuList"), items, Object.assign({}, o, {panel: $("menu"), title, titleEl: $("menuTitle"), hintEl: $("menuHint"), hint: o.hint === undefined ? "↑↓：えらぶ　Space/Enter/タップ：けってい　X/Esc：もどる" : o.hint}));
    },
    list(container, items, o){
        return new Promise((resolve) => {
            if(this.fast){ const k = items.findIndex((x) => !x.disabled); resolve(o.cancelFirst ? -1 : k); return; }
            if(o.panel){ o.panel.hidden = false; }
            if(o.titleEl) o.titleEl.textContent = o.title || "";
            if(o.hintEl) o.hintEl.textContent = o.hint || "";
            container.innerHTML = "";
            let sel = Math.max(0, Math.min(items.length - 1, o.index || 0)); while(items[sel] && items[sel].disabled && sel < items.length - 1) sel++;
            const btns = items.map((it, i) => {
                const b = document.createElement("button"); b.type = "button"; b.disabled = !!it.disabled;
                const l = document.createElement("span"); l.textContent = it.label; b.appendChild(l);
                if(it.meta){ const m = document.createElement("span"); m.className = "meta"; m.textContent = it.meta; b.appendChild(m); }
                b.addEventListener("click", () => { if(!b.disabled) done(i); });
                container.appendChild(b); return b;
            });
            const paint = () => btns.forEach((b, i) => b.classList.toggle("sel", i === sel));
            const done = (i) => { if(this._menu !== ctl) return; this._menu = null; container.innerHTML = ""; if(o.panel) o.panel.hidden = true; resolve(i); };
            const ctl = {
                key: (e) => {
                    if(e.up || e.down){ const d = e.up ? -1 : 1; let n = sel; for(let k = 0; k < items.length; k++){ n = (n + d + items.length) % items.length; if(!items[n].disabled) break; } sel = n; paint(); if(btns[sel]) btns[sel].scrollIntoView({block:"nearest"}); }
                    else if(e.ok){ if(!items[sel].disabled) done(sel); }
                    else if(e.cancel && o.cancel !== false){ done(-1); }
                },
                cancel: () => done(-1), select: (i) => { sel = i; paint(); }, get sel(){ return sel; }
            };
            this._menu = ctl; paint();
        });
    },
    menuOpen(){ return !!this._menu; },
    // 毎フレーム：入力エッジを会話／メニューに配る。何か処理したら true
    route(e){
        if(this._menu){ if(e.auto && this.onAuto) this.toggleAuto(); this._menu.key(e); return true; }
        if(this._dlg){ if(e.ok) this.advance(); else if(e.cancel) this.skip(); if(e.auto) this.toggleAuto(); return true; }
        if(this._card && e.ok){ this._card(); return true; }
        return false;
    },
    // ---------- 小物 ----------
    toast(text, ms){ const t = $("toast"); t.textContent = text; t.hidden = false; clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.hidden = true; }, ms || 2200); },
    card(title, sub, ms){
        return new Promise((resolve) => {
            if(this.fast){ resolve(); return; }
            const c = $("card"); $("cardT").textContent = title; $("cardS").textContent = sub || ""; c.hidden = false;
            const end = () => { clearTimeout(tm); this._card = null; c.hidden = true; resolve(); };
            const tm = setTimeout(end, ms || 2400); this._card = end;
        });
    },
    // 戦闘にはいる演出：フラッシュ→画面がうずを巻いて暗くなる（close）／戦闘が始まると円形にひらく（open）
    async encounterClose(){
        if(this.fast) return; const w = $("wipe"); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        // 「！」が とびだして 画面が ゆれる（敵に きづかれた！）
        { const b = document.createElement("div"); b.id = "bangMark"; b.textContent = "！"; document.body.appendChild(b); document.body.classList.add("bangshake"); await sleep(620); document.body.classList.remove("bangshake"); b.remove(); }
        document.body.classList.add("encounter"); w.hidden = false; w.style.background = "transparent";
        for(let i = 0; i < 2; i++){ this.flash(); await sleep(150); }
        const t0 = performance.now(), D = 560;
        await new Promise((res) => { const f = (now) => { const k = Math.min(1, (now - t0) / D); const r = (1 - k * k) * 75; const a = k * 540;
            w.style.background = "conic-gradient(from " + a + "deg at 50% 50%, #000 0 12.5%, transparent 12.5% 25%, #000 25% 37.5%, transparent 37.5% 50%, #000 50% 62.5%, transparent 62.5% 75%, #000 75% 87.5%, transparent 87.5% 100%)";
            w.style.webkitMaskImage = w.style.maskImage = "radial-gradient(circle at 50% 50%, transparent " + Math.max(0, r - 12) + "%, #000 " + Math.max(1, r) + "%)";
            if(k < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        w.style.maskImage = w.style.webkitMaskImage = "none"; w.style.background = "#000"; document.body.classList.remove("encounter");
    },
    async encounterOpen(){
        const w = $("wipe"); if(this.fast){ w.hidden = true; return; } const t0 = performance.now(), D = 650;
        await new Promise((res) => { const f = (now) => { const k = Math.min(1, (now - t0) / D); const r = k * 80;
            w.style.background = "#000"; w.style.webkitMaskImage = w.style.maskImage = "radial-gradient(circle at 50% 50%, transparent " + r + "%, #000 " + (r + 8) + "%)";
            if(k < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        w.hidden = true; w.style.maskImage = w.style.webkitMaskImage = "none";
    },
    flash(){ const f = $("flash"); f.classList.add("on"); setTimeout(() => f.classList.remove("on"), 90); },
    floater(text, x, y, color){ const d = document.createElement("div"); d.className = "fl"; d.textContent = text; d.style.left = x + "px"; d.style.top = y + "px"; d.style.color = color || "#fff"; $("floaters").appendChild(d); setTimeout(() => d.remove(), 1000); },
    setHud(ch, obj, gold){ $("hudCh").textContent = ch || ""; $("hudObj").textContent = obj ? "▶ " + obj : ""; $("hudGold").textContent = gold !== undefined ? gold + " G" : ""; },
    anyOpen(){ return this.dlgOpen() || this.menuOpen() || !!this._card; }
};
