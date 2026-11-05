/* ARE ゲームパッド（Switch Proコン ほか）で メニューを そうさする ぶひん（クラシックscript）
   十字キー／左スティック：ボタンを えらぶ　A(Switch は 右)：おす　B：もどる（Esc）　+：メニュー（Esc）
   ※ゲームが じぶんで パッドに たいおうしている ばあいは window.ARE_PAD_OFF = true で オフにできます。 */
(function(){
    if(window.__arePad || !navigator.getGamepads) return; window.__arePad = 1;
    var SEL = "button, a[href], select, input[type=checkbox], input[type=range], [role=button], [data-move], summary";
    var st = {}, cur = null, last = 0, hold = {};
    var css = document.createElement("style"); css.textContent = ".are-pad-focus{outline:4px solid #ffd86b !important;outline-offset:2px !important;box-shadow:0 0 14px #ffd86b !important}";
    (document.head || document.documentElement).appendChild(css);
    function vis(e){ if(e.disabled || e.hidden) return false; var r = e.getBoundingClientRect(); if(r.width < 6 || r.height < 6) return false;
        if(r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        var cs = getComputedStyle(e); if(cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return false;
        var m = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !!m && (m === e || e.contains(m) || m.contains(e)); }
    function list(){ return Array.prototype.filter.call(document.querySelectorAll(SEL), vis); }
    function setCur(e){ if(cur) cur.classList.remove("are-pad-focus"); cur = e; if(e){ e.classList.add("are-pad-focus"); try{ e.scrollIntoView({block: "nearest", inline: "nearest"}); }catch(_e){} } }
    function move(dx, dy){
        var L = list(); if(!L.length) return; if(!cur || L.indexOf(cur) < 0){ setCur(L[0]); return; }
        var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, best = null, bs = 1e12;
        L.forEach(function(e){ if(e === cur) return; var r = e.getBoundingClientRect(), x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
            var along = dx ? x * dx : y * dy, across = dx ? Math.abs(y) : Math.abs(x); if(along <= 4) return; var sc = along + across * 2.2; if(sc < bs){ bs = sc; best = e; } });
        if(best) setCur(best);
    }
    function key(k){ ["keydown", "keyup"].forEach(function(t){ var ev = new KeyboardEvent(t, {key: k, code: k, bubbles: true}); (document.activeElement || document).dispatchEvent(ev); window.dispatchEvent(ev); }); }
    function edge(id, on){ var was = hold[id]; hold[id] = on; return on && !was; }
    function poll(){
        requestAnimationFrame(poll);
        if(window.ARE_PAD_OFF && window.ARE_PAD_OFF()) return;
        var pads = navigator.getGamepads(), p = null; for(var i = 0; i < pads.length; i++) if(pads[i] && pads[i].connected){ p = pads[i]; break; } if(!p) return;
        var b = p.buttons, ax = p.axes || [], now = performance.now();
        var L = (b[14] && b[14].pressed) || ax[0] < -.6, R = (b[15] && b[15].pressed) || ax[0] > .6, U = (b[12] && b[12].pressed) || ax[1] < -.6, D = (b[13] && b[13].pressed) || ax[1] > .6;
        var dir = L ? "l" : R ? "r" : U ? "u" : D ? "d" : "";
        if(dir){ if(!hold.dir || hold.dir !== dir || now - last > (hold.rep ? 130 : 380)){ hold.rep = hold.dir === dir; hold.dir = dir; last = now; move(dir === "l" ? -1 : dir === "r" ? 1 : 0, dir === "u" ? -1 : dir === "d" ? 1 : 0); } } else { hold.dir = ""; hold.rep = false; }
        if(edge("a", !!(b[1] && b[1].pressed) || !!(b[0] && b[0].pressed && false))){ var L2 = list(); if(!cur || L2.indexOf(cur) < 0) setCur(L2[0] || null); if(cur){ try{ cur.click(); }catch(_e){} } }
        if(edge("b", !!(b[0] && b[0].pressed))) key("Escape");
        if(edge("plus", !!(b[9] && b[9].pressed))) key("Escape");
    }
    addEventListener("gamepadconnected", function(){ var L = list(); if(!cur && L.length) setCur(L[0]); });
    requestAnimationFrame(poll);
})();
