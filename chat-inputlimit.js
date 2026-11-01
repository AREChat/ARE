"use strict";
// ===== チャットの入力欄：4,000文字（絵文字も1文字）を超えて、入力・貼り付け・音声入力・プログラムからの書きこみでも「入らない」ようにする =====
// ・キーボードで打つ／貼り付ける／ドラッグして入れる：入れられる分だけ入って、あふれた分は入りません（注意が出ます）。
// ・日本語の変換中（IME）にあふれたときは、確定した時点で、4,000文字までに切ります。
// ・音声入力・下書きのもどしなど、プログラムが入力欄に文字を書きこむときも、4,000文字までに切ります。
// ・すでに送ったメッセージを直す欄（編集ボックス）も、同じです。
(function(){
    var LIMIT = 4000;
    var warnedAt = 0;
    function cp(s){ return Array.from(String(s == null ? "" : s)).length; }
    function clip(s){ var a = Array.from(String(s == null ? "" : s)); return a.length > LIMIT ? a.slice(0, LIMIT).join("") : String(s == null ? "" : s); }
    function warn(){
        var now = Date.now();
        if(now - warnedAt < 1500) return;
        warnedAt = now;
        try{ if(typeof showToast === "function") showToast("メッセージは4,000文字までです。それ以上は入力できません。"); }catch(_e){}
    }
    var desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    function isTarget(t){ return !!(t && t.tagName === "TEXTAREA" && (t.id === "messageInput" || (t.classList && t.classList.contains("edit-box")))); }
    function getV(el){ return desc.get.call(el); }
    function setV(el, v){ desc.set.call(el, v); }

    // 1) プログラムからの書きこみ（音声入力・下書き・おまかせ入力など）も、4,000文字までに切る
    function guardValue(el){
        if(!el || el.__areLimitValue) return;
        el.__areLimitValue = true;
        Object.defineProperty(el, "value", {
            configurable: true,
            get: function(){ return desc.get.call(this); },
            set: function(v){ var s = String(v == null ? "" : v), c = clip(s); if(c !== s) warn(); desc.set.call(this, c); }
        });
    }

    // 2) 入力の直前：入れられる文字数を数えて、あふれる分は入れない
    document.addEventListener("beforeinput", function(e){
        var el = e.target;
        if(!isTarget(el) || e.isComposing || !e.inputType || e.inputType.indexOf("insert") !== 0) return;
        var data = e.data;
        if(data == null && e.dataTransfer){ try{ data = e.dataTransfer.getData("text/plain"); }catch(_e){ data = ""; } }
        if(e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") data = "\n";
        if(!data) return;
        var v = getV(el), s = el.selectionStart, t = el.selectionEnd;
        var room = LIMIT - cp(v.slice(0, s)) - cp(v.slice(t));
        if(cp(data) <= room) return;
        e.preventDefault();
        warn();
        if(room > 0){
            el.setRangeText(Array.from(data).slice(0, room).join(""), s, t, "end");
            el.dispatchEvent(new Event("input", {bubbles: true}));
        }
    }, true);

    // 3) 変換中（IME）や、ほかの経路で入ってしまったら、すぐ4,000文字までに切る
    function trim(el){
        var v = getV(el);
        if(cp(v) <= LIMIT) return;
        var pos = el.selectionStart;
        setV(el, clip(v));
        try{ var n = Math.min(pos, getV(el).length); el.setSelectionRange(n, n); }catch(_e){}
        warn();
        try{ el.dispatchEvent(new Event("input", {bubbles: true})); }catch(_e){}
    }
    document.addEventListener("input", function(e){ if(isTarget(e.target) && !e.isComposing) trim(e.target); }, true);
    document.addEventListener("compositionend", function(e){ if(isTarget(e.target)) trim(e.target); }, true);

    function init(){
        var box = document.getElementById("messageInput");
        if(box){ guardValue(box); box.setAttribute("maxlength", "8000"); if(cp(getV(box)) > LIMIT) trim(box); }
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
    window.AREInputLimit = {limit: LIMIT, clip: clip, count: cp};
})();
