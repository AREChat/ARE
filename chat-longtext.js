"use strict";
// ===== チャットの長い文章：100文字をこえたら「すべて見る」で折りたたむ／500文字をこえたら新しいタブで「すべて表示」 =====
// ・100文字（絵文字も1文字）をこえる文字のメッセージは、最初の100文字だけ見せて、あとは「すべて見る」にします（長文が目立たない）。
// ・「すべて見る」を押すと全文が出ます（最大4,000文字。入力欄の上限と同じ）。「閉じる」でもどせます。
// ・500文字をこえるメッセージは（リンクが入っていても）、画面の中で広げず「すべて表示」ボタンから新しいタブ（fulltext.html）で見る。
//   新しいタブは、コピーのしかたを決められた場所（リンクの📋ボタン・「/c」のコピーボタン）にしぼり、右クリックや文字をなぞってのコピーはできない。
// ・全文は、文字をなぞって選べます（コピーできます）。「コピー」ボタンで全部をまとめてコピーもできます。
(function(){
    var LIM = 100, MAX = 4000, BIG = 500;
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
    // 添付（画像・動画・音声・ファイルなど）や編集中の入力欄は、文章の折りたたみ・全文表示の対象にしない
    function isMedia(b){
        return b.classList.contains("edit") || b.classList.contains("itn-cd") ||
            !!b.querySelector("textarea,input,audio,video,img,.attachment,iframe,canvas");
    }
    // まだ <a> になっていない、生の文字のままの URL が残っていないか（別の画面の後処理でリンク化されるより前に
    // ここで文字を切ってしまうと、途中までの URL で壊れたリンクができてしまうため、そのときは手を出さない）
    function rawHasUnlinkedUrl(b){
        return /https?:\/\//.test(b.textContent) && !b.querySelector("a[href]");
    }
    function hasLinkOrBlock(b){ return !!b.querySelector("a[href],.cb-block"); }
    function bar(label, kind, extraClass){
        return '<div class="lt-row"><button type="button" class="lt-btn' + (extraClass ? " " + extraClass : "") + '" data-lt="' + kind + '">' + label + '</button>' +
            (kind === "close" ? '<button type="button" class="lt-btn lt-copy" data-lt="copy">コピー</button>' : '') + '</div>';
    }
    function mid(b){ var row = b.closest("[data-mid]"); return row ? row.getAttribute("data-mid") : ""; }

    function apply(b){
        if(b.getAttribute("data-lt")) return;
        if(isMedia(b)){ b.setAttribute("data-lt", "x"); return; }
        if(rawHasUnlinkedUrl(b)){ b.setAttribute("data-lt", "x"); return; }
        var full = document.createElement("div"); full.innerHTML = b.innerHTML;
        var len = plain({textContent: full.textContent});
        // 500文字をこえるメッセージは、リンクや「/c」コピー枠が入っていても、新しいタブの「すべて表示」にする
        if(len > BIG){
            b.__ltFull = full;
            b.setAttribute("data-lt", "b");
            showBig(b, len);
            return;
        }
        if(hasLinkOrBlock(b)){ b.setAttribute("data-lt", "x"); return; }
        if(len <= LIM){ b.setAttribute("data-lt", "x"); return; }
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
    function showBig(b, len){
        var d = b.__ltFull.cloneNode(true);
        trim(d, LIM);
        b.innerHTML = '<div class="lt-text">' + d.innerHTML + '…</div>' + bar("📄 すべて表示（" + len + "文字）", "big", "lt-big");
        b.setAttribute("data-lt", "b");
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

    // 新しいタブ（fulltext.html）に全文を渡す。同じオリジンへ window.open（noopener を付けない）で開くと、
    // sessionStorage がそのまま引き継がれるので、それを使って本文（すでにリンク化・/c処理ずみのHTML）を渡す。
    function openBig(b){
        try{
            var id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ("ft" + Date.now() + Math.random().toString(36).slice(2));
            sessionStorage.setItem("areFulltext:" + id, JSON.stringify({html: b.__ltFull.innerHTML, ts: Date.now()}));
            window.open("fulltext.html?id=" + encodeURIComponent(id), "_blank");
        }catch(_e){ try{ if(typeof showToast === "function") showToast("すべて表示を開けませんでした。"); }catch(_e2){} }
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
            else if(kind === "big"){ openBig(b); }
        }, true);
        scan();
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
