"use strict";
// ===== メッセージをコピーできる機能 =====
// 「/c 」（半角・全角スペース可）で始まるメッセージは、本文だけを表示し、
// タップ（スマホは長押しでも）するとその本文をコピーできるようにする。
//   例）「/c おはよう」と送る → 吹き出しに「おはよう」と出て、タップでコピー
(function (global) {
    // 「/c 」で始まり、後ろに文字があるものだけが対象
    var CMD = /^\/c[ 　]+([\s\S]*\S[\s\S]*)$/;

    /** "/c おはよう" → "おはよう"。対象外のメッセージは null */
    function parse(raw) {
        var m = CMD.exec(String(raw == null ? "" : raw));
        return m ? m[1].replace(/\s+$/, "") : null;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    /** バブルの中身（HTML文字列）を返す。必ずエスケープする */
    function render(text) {
        return '<span class="copy-text" role="button" tabindex="0" aria-label="タップしてコピー">' +
            escapeHtml(text) + "</span>";
    }

    // ---- コピー本体 ----
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
        }
        return Promise.resolve(legacyCopy(text)); // 非対応・http・権限拒否のときの代替
    }

    function legacyCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", ""); // iOS: キーボードを出さない
        ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;"; // 16px: iOSの自動ズーム防止
        document.body.appendChild(ta);
        try { ta.focus({ preventScroll: true }); } catch (_e) { ta.focus(); }
        ta.select();
        ta.setSelectionRange(0, text.length); // iOS Safari 対策
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (_e) { /* 続行 */ }
        document.body.removeChild(ta);
        return ok;
    }

    // ---- トースト（既存の showToast があればそれを使う）----
    var customToast = null;
    var toastTimer = 0;
    function showToast(msg) {
        if (customToast) return customToast(msg);
        try { if (typeof global.showToast === "function") return global.showToast(msg); } catch (_e) { /* 続行 */ }
        var t = document.getElementById("copyToast");
        if (!t) {
            t = document.createElement("div");
            t.id = "copyToast";
            t.setAttribute("role", "status");
            t.setAttribute("aria-live", "polite");
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1600);
    }

    // ---- タップ・長押しの受け口（メッセージ一覧に1回だけ付ける）----
    var last = 0;
    function onAct(e) {
        var el = e.target && e.target.closest && e.target.closest(".copy-text");
        if (!el) return;
        e.preventDefault(); // 長押しメニューや文字選択を出さない
        e.stopPropagation(); // メッセージメニューなどと二重に動かない
        var now = Date.now();
        if (now - last < 500) return; // click と contextmenu の二重発火を防ぐ
        last = now;
        copyText(el.textContent).then(function (ok) {
            el.classList.add("copied");
            setTimeout(function () { el.classList.remove("copied"); }, 250);
            showToast(ok ? "コピーしました" : "コピーできませんでした");
        });
    }

    function bind(root) {
        if (!root || root.__areCopyBound) return;
        root.__areCopyBound = true;
        root.addEventListener("click", onAct);       // タップ（iOSの長押し後の離しも含む）
        root.addEventListener("contextmenu", onAct); // Androidの長押し
        root.addEventListener("keydown", function (e) { // キーボード操作
            if (e.key === "Enter" || e.key === " ") onAct(e);
        });
    }

    global.AREChatCopy = { parse: parse, render: render, bind: bind, copyText: copyText, setToast: function (f) { customToast = f; } };

    function init() { bind(document.getElementById("messages")); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})(window);
