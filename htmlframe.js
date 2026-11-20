"use strict";
// ===== 送られてきた HTML を表示する「枠の中」の下地 =====
// ・この枠は sandbox（allow-scripts だけ）で開かれる。同じ場所のものを読み書きできない（ログイン情報・保存データには さわれない）。
// ・親（fileview.js）から届いた HTML を、そのまま 書き込んで表示するだけ。外への通信は、HTML の先頭に付ける CSP で止める。
(function () {
    var done = false;
    window.addEventListener("message", function (e) {
        if (done || e.source !== window.parent) return;
        var d = e.data;
        if (!d || typeof d.html !== "string" || d.html.length > 6 * 1024 * 1024) return;
        done = true;
        document.open();
        document.write(d.html);
        document.close();
    });
    try { window.parent.postMessage({ ready: 1 }, "*"); } catch (_e) { /* 親がいないとき（直接開いたとき）は何もしない */ }
})();
