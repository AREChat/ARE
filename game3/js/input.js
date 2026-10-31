"use strict";
// ===== 入力：キーボード / コントローラー / タッチ（仮想スティック＋ボタン）をまとめる =====
// 毎フレーム Input.poll() を呼ぶと、移動ベクトル(mx,my)と「押した瞬間」のボタン(edge)が更新される。
export const Input = {
    mx: 0, my: 0,          // 移動（x:右+  y:奥+  ＝画面で上に倒すと +）
    cam: 0,                // カメラ回転（-1〜1）
    camDrag: 0,            // ドラッグによるカメラ回転量（フレームで消費）
    edge: {},              // 押した瞬間 {ok,cancel,menu,auto,up,down,left,right,camL,camR}
    held: {},
    touch: false,
    padSeen: false,
    _keys: {}, _hit: {}, _prev: {}, _rep: {}, _touchBtn: {}, _stick: {x:0, y:0}, _fake: {},
    // テスト用：ボタンを1回押したことにする
    press(name){ this._fake[name] = true; },
    init(root){
        const kd = (e) => {
            if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            const k = e.key;
            if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Tab"].includes(k)) e.preventDefault();
            const kk = k.length === 1 ? k.toLowerCase() : k; this._keys[kk] = true; this._hit[kk] = true;
        };
        const ku = (e) => { this._keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; };
        window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
        window.addEventListener("blur", () => { this._keys = {}; this._touchBtn = {}; this._stick = {x:0, y:0}; });
        this.touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
        if(root) this._initTouch(root);
        window.addEventListener("gamepadconnected", () => { this.padSeen = true; });
    },
    _initTouch(root){
        const stickZone = root.querySelector("#stick"), knob = root.querySelector("#knob");
        let sid = null, ox = 0, oy = 0; const R = 56;
        if(stickZone){
            const upd = (e) => { let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy); if(l > R){ dx *= R / l; dy *= R / l; } this._stick = {x:dx / R, y:-dy / R}; if(knob) knob.style.transform = "translate(" + dx + "px," + dy + "px)"; };
            stickZone.addEventListener("pointerdown", (e) => { sid = e.pointerId; stickZone.setPointerCapture(sid); const r = stickZone.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; upd(e); e.preventDefault(); });
            stickZone.addEventListener("pointermove", (e) => { if(e.pointerId === sid) upd(e); });
            const end = (e) => { if(e.pointerId !== sid) return; sid = null; this._stick = {x:0, y:0}; if(knob) knob.style.transform = ""; };
            stickZone.addEventListener("pointerup", end); stickZone.addEventListener("pointercancel", end);
        }
        root.querySelectorAll("[data-btn]").forEach((b) => {
            const n = b.dataset.btn;
            b.addEventListener("pointerdown", (e) => { this._touchBtn[n] = true; this._fake[n] = true; b.classList.add("on"); e.preventDefault(); });
            const up = () => { this._touchBtn[n] = false; b.classList.remove("on"); };
            b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
            b.addEventListener("contextmenu", (e) => e.preventDefault());
        });
        // 画面のドラッグでカメラを回す（スティック・ボタン・UI以外）
        const cv = root.querySelector("#gl"); let did = null, lx = 0;
        if(cv){
            cv.addEventListener("pointerdown", (e) => { if(e.button !== 0 && e.pointerType === "mouse") return; did = e.pointerId; lx = e.clientX; });
            cv.addEventListener("pointermove", (e) => { if(e.pointerId !== did) return; this.camDrag += (e.clientX - lx) * 0.006; lx = e.clientX; });
            const end = (e) => { if(e.pointerId === did) did = null; };
            cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
        }
    },
    poll(){
        const K = Object.assign({}, this._keys, this._hit); this._hit = {}; const h = {};
        let mx = 0, my = 0;
        if(K.ArrowLeft || K.a) mx -= 1; if(K.ArrowRight || K.d) mx += 1; if(K.ArrowUp || K.w) my += 1; if(K.ArrowDown || K.s) my -= 1;
        mx += this._stick.x; my += this._stick.y;
        h.up = !!(K.ArrowUp || K.w); h.down = !!(K.ArrowDown || K.s); h.left = !!(K.ArrowLeft || K.a); h.right = !!(K.ArrowRight || K.d);
        if(this._stick.y > .6) h.up = true; if(this._stick.y < -.6) h.down = true; if(this._stick.x < -.6) h.left = true; if(this._stick.x > .6) h.right = true;
        // 一般的なPCゲームの配置：移動=WASD/矢印  決定・話す=Space/Enter/F  キャンセル・スキップ=X/Backspace/Esc  メニュー=Esc/Tab/M/I  オート=V  ダッシュ=Shift  カメラ=Q/E
        h.ok = !!(K.Enter || K.f || K.z || K[" "] || this._touchBtn.ok);
        h.cancel = !!(K.Escape || K.x || K.Backspace || this._touchBtn.cancel);
        h.menu = !!(K.Escape || K.Tab || K.m || K.i || this._touchBtn.menu);
        h.auto = !!(K.v || K.t || this._touchBtn.auto);
        h.dash = !!(K.Shift || this._touchBtn.dash);
        h.camL = !!(K.q || K["["] || this._touchBtn.camL); h.camR = !!(K.e || K["]"] || this._touchBtn.camR);
        let cam = (h.camR ? 1 : 0) - (h.camL ? 1 : 0);
        // コントローラー（標準配置: 0=下 1=右(Switch A) 2=左 3=上(X) 4=L 5=R 8=− 9=＋ 12-15=十字）
        let pads = []; try{ pads = (navigator.getGamepads && navigator.getGamepads()) || []; }catch(_e){}
        for(const gp of pads){
            if(!gp || !gp.connected) continue; this.padSeen = true;
            const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed); const ax = gp.axes || [];
            // Nintendo(Switch Proコン)：右=A(決定) 下=B(キャンセル)。Xbox/PS系は 下=決定 右=キャンセル
            const nin = /057e|nintendo|pro controller|switch/i.test(gp.id || ""); const OK = nin ? 1 : 0, NO = nin ? 0 : 1; this.padKind = nin ? "Nintendo" : "Xbox/PS";
            const lx = Math.abs(ax[0] || 0) > .18 ? ax[0] : 0, ly = Math.abs(ax[1] || 0) > .18 ? ax[1] : 0, rx = Math.abs(ax[2] || 0) > .25 ? ax[2] : 0;
            mx += lx; my -= ly; cam += rx;
            if(b(12) || ly < -.6) h.up = true; if(b(13) || ly > .6) h.down = true; if(b(14) || lx < -.6) h.left = true; if(b(15) || lx > .6) h.right = true;
            if(b(12)) my += 1; if(b(13)) my -= 1; if(b(14)) mx -= 1; if(b(15)) mx += 1;
            if(b(OK)) h.ok = true; if(b(NO)) h.cancel = true; if(b(NO)) h.dash = true; if(b(9) || b(3)) h.menu = true; if(b(2) || b(8)) h.auto = true; if(b(10)) h.dash = true;
            if(b(4) || b(6)) cam -= 1; if(b(5) || b(7)) cam += 1;
        }
        const l = Math.hypot(mx, my); if(l > 1){ mx /= l; my /= l; }
        this.mx = mx; this.my = my; this.cam = Math.max(-1, Math.min(1, cam));
        // 押した瞬間（＋方向キーはリピート）
        const e = {}; const now = performance.now();
        for(const k of Object.keys(h)){
            const nav = k === "up" || k === "down" || k === "left" || k === "right";
            if(h[k]){ if(!this._prev[k]){ e[k] = true; this._rep[k] = now + 380; } else if(nav && now >= (this._rep[k] || 0)){ e[k] = true; this._rep[k] = now + 130; } }
        }
        for(const k of Object.keys(this._fake)) if(this._fake[k]) e[k] = true;
        this._fake = {}; this._prev = h; this.held = h; this.edge = e;
        const d = this.camDrag; this.camDrag = 0; this.dragRot = d;
    }
};
