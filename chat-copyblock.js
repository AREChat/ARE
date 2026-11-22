"use strict";
// ===== 「/c」コピー専用メッセージ =====
// ・「/c」の使いかたは3とおり（cpExtractBody が判定）：
//   ① 1行目に「/c あああ」のように、半角/全角スペースをはさんで文章を続ける → そのあとぜんぶをコピー対象にする
//   ② 「/c」だけの行を文章の先頭につける → その行より下をぜんぶコピー対象にする
//   ③ 「/c」だけの行を文章の最後につける → その行より上をぜんぶコピー対象にする
//   ④ 「/c」だけの行を2つ（はさむように）置く → 2つの「/c」行のあいだだけをコピー対象にする
//   そのコピー対象だけを「コピー用の枠」＋「📋コピー」ボタンで表示する（「/c」の行自体は表示されない）。
// ・右クリック／長押しメニューを止めている画面でも、ボタン1つで確実にコピーできるようにするための機能。
// ・メンション（@名前）やリンク化（link-copy.js）はしない。コピーしたときに、余計な印がつかないようにするため。

// 「/c」だけの行かどうか（前後の半角・全角スペースは無視する）
function cpIsMarkerLine(line){ return String(line).replace(/^[ 　]+|[ 　]+$/g,"") === "/c"; }

// 送られた文章から、コピーしたい本文だけを取り出す。対象が無ければ null
function cpExtractBody(raw){
    raw = String(raw || "");
    var lines = raw.split(/\r?\n/);
    var markers = [];
    for(var i = 0; i < lines.length; i++) if(cpIsMarkerLine(lines[i])) markers.push(i);

    var body = null;
    if(markers.length >= 2){
        var first = markers[0], last = markers[markers.length - 1];
        body = lines.slice(first + 1, last).join("\n");
    }else if(markers.length === 1){
        var idx = markers[0];
        if(idx === lines.length - 1) body = lines.slice(0, idx).join("\n");   // 最後の行 →「ここより上」
        else body = lines.slice(idx + 1).join("\n");                          // 先頭・途中の行 →「ここより下」
    }else{
        // 独立した「/c」行が無いときは、1行目の「/c 文章」（同じ行にスペースをはさんで続ける書きかた）を見る
        var m = /^\/c[ 　]+/.exec(raw);
        if(m) body = raw.slice(m[0].length);
    }
    if(body === null) return null;
    body = body.replace(/^\n+/,"").replace(/\n+$/,"");   // 前後の空行だけ整える（打ちまちがいの余分な改行を減らす）
    return body || null;
}

(function () {

    function toast(msg) {
        try { if (typeof window.showToast === "function") { window.showToast(msg); return; } } catch (_e) { /* 続行 */ }
        try { if (window.AREFeatures && typeof window.AREFeatures.notify === "function") { window.AREFeatures.notify(msg); return; } } catch (_e) { /* 続行 */ }
    }

    function fallbackCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        var ok = false; try { ok = document.execCommand("copy"); } catch (_e) { ok = false; }
        ta.remove(); return ok;
    }

    function copyText(text) {
        function done(ok) { toast(ok ? "コピーしました 📋" : "コピーできませんでした。文字をなぞって、コピーしてください。"); }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
        } else { done(fallbackCopy(text)); }
    }

    function render(body) {
        return '<div class="cb-block"><pre class="cb-text">' + escapeHtml(body) + '</pre>' +
            '<button type="button" class="cb-copy" data-cb="' + encodeURIComponent(body) + '">📋 コピー</button></div>';
    }

    function hookText() {
        if (!window.AREText || window.AREText.__copyBlock) return !!(window.AREText && window.AREText.__copyBlock);
        var prev = window.AREText.format;
        window.AREText.format = function (escaped, item) {
            var raw = item && typeof item.text === "string" ? item.text : "";
            var body = cpExtractBody(raw);
            if (body) return render(body);
            return typeof prev === "function" ? prev.call(this, escaped, item) : escaped;
        };
        window.AREText.__copyBlock = true;
        return true;
    }

    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".cb-copy");
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        copyText(decodeURIComponent(b.getAttribute("data-cb") || ""));
    }, true);

    var css = document.createElement("style");
    css.textContent =
        ".cb-block{margin:2px 0}" +
        ".cb-text{margin:0 0 6px;padding:8px 10px;border-radius:10px;background:rgba(127,127,127,.14);" +
        "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;" +
        "white-space:pre-wrap;word-break:break-all;-webkit-user-select:text;user-select:text}" +
        ".cb-copy{padding:4px 12px;font-size:12px;border:1px solid currentColor;border-radius:999px;" +
        "background:transparent;color:inherit;cursor:pointer;opacity:.85}" +
        ".cb-copy:hover{opacity:1}";
    document.head.appendChild(css);

    // chat-mention.js（@名前）・link-copy.js（URLのリンク化）が先に format を用意し終えるのを待ってから、
    // いちばん外側でラップする（/c のメッセージは、あとの2つの処理をスキップするため）
    var tries = 0;
    (function wait() {
        if (window.AREText && (window.AREText.__linkCopy || tries > 50)) { hookText(); return; }
        tries++; setTimeout(wait, 200);
    })();
})();
