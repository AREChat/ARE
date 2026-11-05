"use strict";
// ===== ゲーム画面の「もどる」ボタン ＋ 端末の「戻る」（Android の三角・iPhone の画面ふちスワイプ）=====
// ・スマホ・タブレットでは、画面の左上に小さな「← もどる」を出します（キーボードのないスマホでも、ゲームから出られるように）。
// ・Android の「戻る」を押しても、ブラウザごと閉じません。まず「いま上に開いている画面（閉じる／キャンセルなど）」を1つ閉じ、
//   何も開いていなければ、1回目は「もう一度おすとチャットにもどる」と知らせ、2秒ちょっとのうちにもう一度おしたときだけ、チャットにもどります。
// ・iPhone には「戻る」ボタンがありませんが、画面のふちのスワイプ戻りも同じ動きにそろえます（同じ処理が動きます）。
// ・ゲームが自分で「もどる／おわる」ボタンを いつも出しているときは、ボタンが2つにならないよう、この「← もどる」はかくします。
// ・ゲーム側で特別な「戻る」の動きが要るときは、window.AREGameBack = function(){ …押した扱いにしたら true を返す… } を置いてください。
(function(){
    if(window.__areGameBack) return;
    window.__areGameBack = true;
    var me = (document.currentScript && document.currentScript.src) || "";
    var chatUrl = "../chat.html";
    try{ if(me) chatUrl = new URL("chat.html", me).href; }catch(_e){}
    var armedAt = 0, leaving = false, btn = null, toastEl = null, toastTimer = 0;
    var CLOSE_RE = /^(閉じる|とじる|キャンセル|やめる|✕|✖ ?閉じる|×)$/;
    var OWN_BACK_RE = /(おわる|もどる|戻る|チャットへ|ホームへ)/;

    function vis(e){
        if(!e || !e.getBoundingClientRect) return false;
        var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        if(!(r.width > 0 && r.height > 0) || cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
        return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    }
    function textOf(e){ return String((e.textContent || e.value || "")).replace(/\s+/g, " ").trim(); }
    function toast(t){
        try{
            if(!toastEl){
                toastEl = document.createElement("div");
                toastEl.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:88vw;padding:9px 14px;border-radius:12px;background:rgba(0,0,0,.82);color:#fff;font:600 14px/1.4 system-ui,sans-serif;z-index:2147483600;pointer-events:none;text-align:center;display:none";
                (document.body || document.documentElement).appendChild(toastEl);
            }
            toastEl.textContent = t; toastEl.style.display = "block";
            clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toastEl.style.display = "none"; }, 2600);
        }catch(_e){}
    }
    function isMine(e){ return e === btn || (btn && btn.contains(e)); }

    // いま上に出ている「閉じる／キャンセル」を1つ探して押す（いちばん手前＝あとから出たもの）
    function closeTopLayer(){
        var list = [].slice.call(document.querySelectorAll('button,a,[role="button"],.btn,.opt,.close'));
        var best = null;
        for(var i = 0; i < list.length; i++){
            var e = list[i];
            if(isMine(e) || e.disabled || !vis(e)) continue;
            if(CLOSE_RE.test(textOf(e)) || (e.getAttribute && /^(閉じる|close)$/i.test(e.getAttribute("aria-label") || ""))) best = e;
        }
        if(best){ try{ best.click(); }catch(_e){} return true; }
        return false;
    }
    function leave(){
        if(leaving) return;
        leaving = true;
        try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_e){}
        try{ if(window.tqAutoSave) window.tqAutoSave(); }catch(_e){}
        try{ location.replace(chatUrl); }catch(_e){ location.href = chatUrl; }
    }
    // 「もどる」の本体：1) ゲーム独自の動き 2) 上に開いている画面を閉じる 3) チャットにもどる（2回おし）
    function go(){
        try{ if(typeof window.AREGameBack === "function" && window.AREGameBack() === true) return true; }catch(_e){}
        if(closeTopLayer()) return true;
        var now = Date.now();
        if(now - armedAt < 2600){ armedAt = 0; leave(); return false; }
        armedAt = now;
        toast("もう一度「もどる」をおすと、ゲームをおわって チャットにもどります");
        return true;
    }
    window.AREGameBackNow = go;

    // ---- 端末の「戻る」：ブラウザごと閉じないように、ダミーの履歴を1つ積んでおく ----
    function pushDummy(){ try{ history.pushState({areGame:1}, "", location.href); }catch(_e){} }
    function initHistory(){
        try{ history.replaceState({areGame:0}, "", location.href); }catch(_e){}
        pushDummy();
        window.addEventListener("popstate", function(){
            if(leaving) return;
            go();
            if(!leaving) pushDummy();
        });
    }

    // ---- 画面の左上の「← もどる」 ----
    function coarse(){ try{ return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches; }catch(_e){ return false; } }
    function makeBtn(){
        if(btn || !document.body) return;
        btn = document.createElement("button");
        btn.type = "button"; btn.id = "areGameBackBtn"; btn.textContent = "← もどる";
        btn.setAttribute("aria-label", "もどる");
        btn.style.cssText = "position:fixed;left:6px;top:6px;z-index:2147483500;min-width:72px;height:38px;padding:0 12px;border-radius:19px;border:1px solid rgba(255,255,255,.55);background:rgba(10,10,20,.62);color:#fff;font:700 14px/1 system-ui,sans-serif;display:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
        btn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); go(); });
        document.body.appendChild(btn);
    }
    function ownBackVisible(){
        var list = document.querySelectorAll('button,a,[role="button"],.btn,.opt');
        for(var i = 0; i < list.length; i++){
            var e = list[i];
            if(isMine(e) || !vis(e)) continue;
            var t = textOf(e);
            if(t.length <= 14 && OWN_BACK_RE.test(t)) return true;
        }
        return false;
    }
    function refresh(){
        if(!btn) return;
        var show = coarse() && !ownBackVisible();
        btn.style.display = show ? "block" : "none";
    }
    function init(){
        initHistory();
        makeBtn();
        refresh();
        setInterval(refresh, 1000);
        window.addEventListener("resize", refresh);
        window.addEventListener("orientationchange", refresh);
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
