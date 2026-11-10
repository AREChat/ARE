"use strict";
// ===== チャットの長い文章：100文字をこえたら「すべて見る」で折りたたむ =====
// ・100文字（絵文字も1文字）をこえる文字のメッセージは、最初の100文字だけ見せて、あとは「すべて見る」にします（長文が目立たない）。
// ・「すべて見る」を押すと全文が出ます（最大4,000文字。入力欄の上限と同じ）。「閉じる」でもどせます。
// ・全文は、文字をなぞって選べます（コピーできます）。「コピー」ボタンで全部をまとめてコピーもできます。
(function(){
    var LIM = 100, MAX = 4000;
    var open = Object.create(null);           // 開いているメッセージ（再描画されても、開いたまま）
    var busy = false;
    function cps(s){ return Array.from(String(s || "")); }

    // 先頭から limit 文字だけ残す（リンクなどの書式はそのまま。あふれた分は消す）
    function trim(node, limit){
        var remaining = limit, cut = false;
        (function walk(el){
            var kids = Array.prototype.slice.call(el.childNodes);
            for(var i = 0; i < kids.length; i++){
                var k = kids[i];
                if(cut){ el.removeChild(k); continue; }
                if(k.nodeType === 3){
                    var a = cps(k.nodeValue);
                    if(a.length <= remaining){ remaining -= a.length; }
                    else { k.nodeValue = a.slice(0, remaining).join(""); remaining = 0; cut = true; }
                    if(remaining === 0) cut = true;
                }else if(k.nodeType === 1){
                    if(/^(BR)$/.test(k.tagName)){ if(remaining <= 0){ el.removeChild(k); cut = true; } else remaining -= 1; continue; }
                    walk(k);
                    if(!k.childNodes.length && !/^(IMG|BR|HR)$/.test(k.tagName)) el.removeChild(k);
                }else{ el.removeChild(k); }
            }
        })(node);
        return cut;
    }

    function plain(b){ return cps(b.textContent).length; }
    function isPlainText(b){
        if(b.classList.contains("edit") || b.querySelector("textarea,input,audio,video,img,.attachment,iframe,canvas")) return false;
        return true;
    }
    function bar(label, kind){
        return '<div class="lt-row"><button type="button" class="lt-btn" data-lt="' + kind + '">' + label + '</button>' +
            (kind === "close" ? '<button type="button" class="lt-btn lt-copy" data-lt="copy">コピー</button>' : '') + '</div>';
    }
    function mid(b){ var row = b.closest("[data-mid]"); return row ? row.getAttribute("data-mid") : ""; }

    function apply(b){
        if(b.getAttribute("data-lt")) return;
        if(!isPlainText(b)) { b.setAttribute("data-lt", "x"); return; }
        if(plain(b) <= LIM){ b.setAttribute("data-lt", "x"); return; }
        var full = document.createElement("div"); full.innerHTML = b.innerHTML;
        b.__ltFull = full;
        var id = mid(b);
        b.setAttribute("data-lt", open[id] ? "o" : "c");
        if(open[id]) showFull(b); else showShort(b);
    }
    function showShort(b){
        var d = b.__ltFull.cloneNode(true);
        trim(d, LIM);
        b.innerHTML = '<div class="lt-text">' + d.innerHTML + '…</div>' + bar("すべて見る（" + cps(b.__ltFull.textContent).length + "文字）", "more");
        b.setAttribute("data-lt", "c");
    }
    function showFull(b){
        var d = b.__ltFull.cloneNode(true), over = plain({textContent: d.textContent}) > MAX;
        if(over) trim(d, MAX);
        b.innerHTML = '<div class="lt-text lt-full">' + d.innerHTML + (over ? "…" : "") + '</div>' + bar("閉じる", "close");
        b.setAttribute("data-lt", "o");
    }
    function copyText(t){
        function fallback(){
            var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
            document.body.appendChild(ta); ta.select(); var ok = false; try{ ok = document.execCommand("copy"); }catch(_e){} ta.remove(); return ok;
        }
        function done(ok){ try{ if(typeof showToast === "function") showToast(ok ? "コピーしました" : "コピーできませんでした。文字をなぞって、コピーしてください。"); }catch(_e){} }
        try{
            if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ done(true); }, function(){ done(fallback()); }); return; }
        }catch(_e){}
        done(fallback());
    }

    function scan(){
        busy = false;
        var box = document.getElementById("messages"); if(!box) return;
        var list = box.querySelectorAll(".bubble:not([data-lt])");
        for(var i = 0; i < list.length; i++) apply(list[i]);
    }
    function schedule(){ if(busy) return; busy = true; (window.requestAnimationFrame || setTimeout)(scan); }

    function init(){
        var box = document.getElementById("messages"); if(!box) return;
        new MutationObserver(schedule).observe(box, {childList: true, subtree: true});
        box.addEventListener("click", function(ev){
            var btn = ev.target.closest && ev.target.closest(".lt-btn"); if(!btn) return;
            ev.preventDefault(); ev.stopPropagation();
            var b = btn.closest(".bubble"); if(!b || !b.__ltFull) return;
            var kind = btn.getAttribute("data-lt"), id = mid(b);
            if(kind === "more"){ open[id] = 1; showFull(b); }
            else if(kind === "close"){ delete open[id]; showShort(b); try{ b.scrollIntoView({block: "nearest"}); }catch(_e){} }
            else if(kind === "copy"){ copyText(cps(b.__ltFull.textContent).slice(0, MAX).join("")); }
        }, true);
        scan();
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
