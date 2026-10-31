// ===== そうさ：キーボード・マウス・タッチ =====
export class Controls{
    constructor(canvas, root){
        this.k = {}; this.pressed = {}; this.lx = 0; this.ly = 0; this.canvas = canvas; this.locked = false; this.drag = null; this.stick = {x: 0, y: 0, id: null}; this.touchLook = null; this.touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0; this.sens = 1;
        addEventListener("keydown", (e) => { if(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const c = e.code; if(!this.k[c]) this.pressed[c] = true; this.k[c] = true; if(/^(Arrow|Space|Tab)/.test(c)) e.preventDefault(); });
        addEventListener("keyup", (e) => { this.k[e.code] = false; });
        addEventListener("blur", () => { this.k = {}; });
        const lockOk = !!canvas.requestPointerLock;
        canvas.addEventListener("mousedown", (e) => { if(e.button !== 0) return; this.fireDown = true; this.pressed.Click = true; if(lockOk && !this.touchOnly && !("ontouchstart" in window && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)){ try{ canvas.requestPointerLock(); }catch(_e){} } this.drag = {x: e.clientX, y: e.clientY}; });
        addEventListener("mouseup", () => { this.drag = null; this.fireDown = false; });
        document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === canvas; });
        addEventListener("mousemove", (e) => { const s = .0024 * this.sens; if(this.locked){ this.lx += e.movementX * s; this.ly += e.movementY * s; } else if(this.drag){ this.lx += (e.clientX - this.drag.x) * s * 1.2; this.ly += (e.clientY - this.drag.y) * s * 1.2; this.drag = {x: e.clientX, y: e.clientY}; } });
        // タッチ
        const stickEl = root.querySelector("#stick"), knob = root.querySelector("#knob");
        const onT = (e) => { for(const t of e.changedTouches){ if(t.target === stickEl || (stickEl && stickEl.contains(t.target))){ if(e.type === "touchstart") this.stick.id = t.identifier; } } };
        stickEl && stickEl.addEventListener("touchstart", (e) => { e.preventDefault(); for(const t of e.changedTouches){ this.stick.id = t.identifier; this.stickMove(t, stickEl, knob); } }, {passive: false});
        addEventListener("touchmove", (e) => { for(const t of e.changedTouches){ if(t.identifier === this.stick.id) this.stickMove(t, stickEl, knob); else if(this.touchLook && t.identifier === this.touchLook.id){ this.lx += (t.clientX - this.touchLook.x) * .006 * this.sens; this.ly += (t.clientY - this.touchLook.y) * .006 * this.sens; this.touchLook.x = t.clientX; this.touchLook.y = t.clientY; } } if(this.stick.id !== null || this.touchLook) e.preventDefault(); }, {passive: false});
        addEventListener("touchend", (e) => { for(const t of e.changedTouches){ if(t.identifier === this.stick.id){ this.stick = {x: 0, y: 0, id: null}; if(knob) knob.style.transform = "translate(0,0)"; } if(this.touchLook && t.identifier === this.touchLook.id) this.touchLook = null; } });
        canvas.addEventListener("touchstart", (e) => { for(const t of e.changedTouches){ if(!this.touchLook){ this.touchLook = {id: t.identifier, x: t.clientX, y: t.clientY}; } } }, {passive: true});
        for(const b of root.querySelectorAll("[data-btn]")){ const n = b.dataset.btn; const dn = (e) => { e.preventDefault(); this.pressed[n] = true; this.k[n] = true; }, up = (e) => { e.preventDefault(); this.k[n] = false; }; b.addEventListener("touchstart", dn, {passive: false}); b.addEventListener("touchend", up, {passive: false}); b.addEventListener("mousedown", dn); b.addEventListener("mouseup", up); }
    }
    stickMove(t, el, knob){ const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (t.clientX - cx) / (r.width / 2), dy = (t.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if(l > 1){ dx /= l; dy /= l; } this.stick.x = dx; this.stick.y = dy; if(knob) knob.style.transform = "translate(" + dx * r.width * .3 + "px," + dy * r.height * .3 + "px)"; }
    read(){
        const k = this.k, P = this.pressed; const dz = (v) => Math.abs(v) < .15 ? 0 : v;
        let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + dz(this.stick.x), my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - dz(this.stick.y);
        const turn = ((k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0)) * .035;
        const o = {mx: Math.max(-1, Math.min(1, mx)), my: Math.max(-1, Math.min(1, my)), lx: this.lx + turn, ly: this.ly, run: !!(k.ShiftLeft || k.ShiftRight || k.run), act: !!(P.KeyE || P.Space || P.Enter || P.act || (P.Click && this.wantClickAct)), act2: !!(P.KeyQ || P.KeyX || P.exit), esc: !!(P.Escape || P.KeyM || P.menu), looking: !!(this.locked || this.drag || this.touchLook), anyDown: !!(k.KeyE || k.Space || k.Enter || k.act || this.fireDown)};
        this.lx = 0; this.ly = 0; this.pressed = {}; return o;
    }
}
