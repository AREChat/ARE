"use strict";
// ===== 端末の「戻る」ボタン（Androidの三角など）で、ブラウザごと閉じないようにする =====
// 戻るを押すと「いま開いている一番上の画面」を1つ閉じます。何も開いていなければ、
// 1回目は「もう一度押すと終了」と知らせ、2秒以内にもう一度押したときだけ本当に戻ります。
(function(){
    var armedAt = 0;
    function qs(s){ return document.querySelector(s); }
    function visible(e){ return !!(e && !e.hidden && e.getClientRects().length > 0); }
    function push(){ try{ history.pushState({are:1}, "", location.href); }catch(_e){} }
    function toast(t){ try{ if(typeof showToast === "function") showToast(t); }catch(_e){} }
    function closeTop(){
        var m = qs("#profileModal");
        if(visible(m)){
            var c = m.querySelector('[data-pm="close"],[data-t$=":close"],.close-btn');
            if(typeof closeSheet === "function") closeSheet(); else if(c) c.click(); else m.hidden = true;
            return true;
        }
        var panels = ["#extraPanel", "#adminPanel", "#schedulePanel", "#delCard"];
        for(var i = 0; i < panels.length; i++){
            var p = qs(panels[i]);
            if(visible(p)){
                var b = p.querySelector("#extraBack,#adminClose,#scheduleClose,button");
                if(b) b.click(); else p.hidden = true;
                return true;
            }
        }
        var ov = document.querySelectorAll('[role="dialog"],.overlay,.lk-ov,.modal');
        for(var j = 0; j < ov.length; j++){
            if(visible(ov[j]) && ov[j].id !== "profileModal"){
                var cb = ov[j].querySelector('[data-close],.close,button[aria-label*="閉じる"],button');
                if(cb){ cb.click(); return true; }
            }
        }
        var app = qs("#app") || qs(".app");
        if(app && app.classList.contains("chat-open")){ app.classList.remove("chat-open"); return true; }
        var active = qs(".rail-btn.active");
        if(active && active.getAttribute("data-tab") !== "chats"){
            var home = qs('.rail-btn[data-tab="chats"]');
            if(home){ home.click(); return true; }
        }
        return false;
    }

    // シートの中身が書き換わっても、✕と「閉じる」が消えないようにする
    function guardClose(){
        var sh = qs("#profileSheet");
        if(!sh || sh.__areClose) return;
        sh.__areClose = true;
        var busy = false;
        new MutationObserver(function(){
            if(busy || !sh.firstChild) return;
            busy = true;
            if(!sh.querySelector(".sheet-x")) sh.insertAdjacentHTML("afterbegin", '<button type="button" class="sheet-x" data-pm="close" aria-label="閉じる">✕</button>');
            if(!sh.querySelector('.row [data-pm="close"]')) sh.insertAdjacentHTML("beforeend", '<div class="row sheet-auto-close"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
            setTimeout(function(){ busy = false; }, 0);
        }).observe(sh, {childList:true});
    }
    function init(){
        guardClose();
        try{ history.replaceState({are:0}, "", location.href); }catch(_e){}
        push();
        window.addEventListener("popstate", function(){
            if(closeTop()){ push(); return; }
            var now = Date.now();
            if(now - armedAt < 2000){ armedAt = 0; history.back(); return; }
            armedAt = now;
            toast("もう一度「戻る」を押すと、アプリを閉じます。");
            push();
        });
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
