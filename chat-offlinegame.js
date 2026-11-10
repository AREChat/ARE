"use strict";
// ===== 電波がないとき・とても弱いとき：暇つぶしゲーム（OFFLINE PARADISE）への案内 =====
// ・ネットが切れた／2G なみに遅いとき、画面の下に「🎰 暇つぶしゲーム」のボタンを出します（✕で閉じられます）。
// ・ネットが戻ったら、自動で消えます。ゲームは AREChat/game の game7（電波がなくても遊べます）。
(function(){
    var URL = "https://arechat.github.io/game/game7/index.html";
    var el = null, closed = false;
    function weak(){
        if(navigator.onLine === false) return "off";
        try{ var c = navigator.connection; if(c && /(^|-)2g$/.test(c.effectiveType || "")) return "slow"; }catch(_e){}
        return "";
    }
    function paint(){
        var w = weak();
        if(!w){ closed = false; if(el){ el.remove(); el = null; } return; }
        if(closed || el || !document.body) return;
        el = document.createElement("div"); el.id = "areOfflineGame";
        el.setAttribute("role", "status");
        el.innerHTML = '<span>' + (w === "off" ? "✈ 電波がないみたい…" : "📶 電波が弱いみたい…") + '</span><a href="' + URL + '" target="_blank" rel="noopener">🎰 暇つぶしゲームで待つ</a><button type="button" aria-label="閉じる">✕</button>';
        el.querySelector("button").onclick = function(){ closed = true; if(el){ el.remove(); el = null; } };
        document.body.appendChild(el);
    }
    window.addEventListener("offline", paint); window.addEventListener("online", paint);
    try{ if(navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", paint); }catch(_e){}
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
})();
