/* ARE ゲームパッド（Switch Proコン ほか）で メニューを そうさする ぶひん（クラシックscript）
   十字キー／左スティック：ボタンを えらぶ（画面の外に つづくときは じどうで スクロール）　右スティック：スクロール
   A(Switch は 右)：おす　B：もどる（Esc）　+：メニュー（Esc）　ZL／ZR：1画面ぶん 上／下へ スクロール　−：いちばん上へ
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
    /* 画面の外に つづく ばあいの スクロール（いま えらんでいる ボタンの まわりの スクロール場所 → なければ ページぜんたい） */
    function scroller(dy){
        for(var n = cur && cur.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement){
            var o = getComputedStyle(n).overflowY;
            if((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 2 && (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0)) return n;
        }
        var d = document.scrollingElement || document.documentElement;
        return (dy > 0 ? d.scrollTop + innerHeight < d.scrollHeight - 1 : d.scrollTop > 0) ? d : null;
    }
    function scrollBy(s, px){
        var y0 = s.scrollTop;
        try{ s.scrollBy({top: px, behavior: "instant"}); }catch(_e){ s.scrollTop = y0 + px; }
        return s.scrollTop !== y0;
    }
    function scrollMove(dy){
        var s = scroller(dy); if(!s) return false;
        var h = (s === document.scrollingElement || s === document.documentElement) ? innerHeight : s.clientHeight;
        return scrollBy(s, dy * Math.max(80, Math.round(h * 0.7)));
    }
    function pick(L, dx, dy){
        var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, best = null, bs = 1e12;
        L.forEach(function(e){ if(e === cur) return; var r = e.getBoundingClientRect(), x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
            var along = dx ? x * dx : y * dy, across = dx ? Math.abs(y) : Math.abs(x); if(along <= 4) return; var sc = along + across * 2.2; if(sc < bs){ bs = sc; best = e; } });
        return best;
    }
    function move(dx, dy){
        var L = list();
        if(!L.length){   // 画面に押せるものが ひとつも ない（ボタンが 下のほうに ある ページ）→ スクロールして さがす
            var d0 = dy || dx;   // 左右キーでも 同じ（右＝下へ、左＝上へ スクロール）
            if(d0 && scrollMove(d0)){ L = list(); if(L.length) setCur(d0 > 0 ? L[0] : L[L.length - 1]); }
            return;
        }
        if(!cur || !document.contains(cur)){ setCur(L[0]); return; }
        if(L.indexOf(cur) < 0){   // えらんでいた ボタンが 画面の外に でた → その方向の いちばん ちかい ボタンへ
            setCur(pick(L, dx, dy) || (dy < 0 ? L[L.length - 1] : L[0])); return;
        }
        var best = pick(L, dx, dy);
        if(best){ setCur(best); return; }
        if(dy && scrollMove(dy)){   // この先は 画面の外 → スクロールして、見えてきた ボタンを えらぶ
            L = list(); best = L.length ? pick(L, dx, dy) : null; if(best) setCur(best);
        }
    }
    function reselect(dir){ var L = list(); if(L.length && L.indexOf(cur) < 0) setCur(dir > 0 ? L[0] : L[L.length - 1]); }
    function pageMove(dir){ if(scrollMove(dir)) reselect(dir); }
    function toTop(){ var s, n = 0, moved = false; while(n++ < 5 && (s = scroller(-1))){ s.scrollTop = 0; moved = true; } if(moved) reselect(1); }   // いちばん上へ行ったので、えらぶのも いちばん上の ボタン（下のほうを えらぶと、画面が少し下へ ずれてしまう）
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
        if(edge("a", !!(b[1] && b[1].pressed) || !!(b[0] && b[0].pressed && false))){
            var L2 = list(), pick1 = false;
            // えらんだ ボタンが 画面の外（スクロールで はなれた など）のときは、おさずに「えらびなおす」だけ（まちがっておさない）
            if(!cur || L2.indexOf(cur) < 0){ pick1 = true; if(L2.length) setCur(L2[0]); else if(cur && document.contains(cur)) setCur(cur); else setCur(null); }
            if(cur && !pick1){ try{ cur.click(); }catch(_e){} }
        }
        var sy = ax[3] || 0; if(Math.abs(sy) > .5){ var sc2 = scroller(sy > 0 ? 1 : -1); if(sc2) scrollBy(sc2, sy * 16); }   // 右スティック：スクロール
        if(edge("zl", !!(b[6] && b[6].pressed))) pageMove(-1);   // ZL：1画面ぶん上へ
        if(edge("zr", !!(b[7] && b[7].pressed))) pageMove(1);    // ZR：1画面ぶん下へ
        if(edge("minus", !!(b[8] && b[8].pressed))) toTop();     // −：いちばん上へ
        if(edge("b", !!(b[0] && b[0].pressed))) key("Escape");
        if(edge("plus", !!(b[9] && b[9].pressed))) key("Escape");
    }
    addEventListener("gamepadconnected", function(){ var L = list(); if(!cur && L.length) setCur(L[0]); });
    requestAnimationFrame(poll);
})();
