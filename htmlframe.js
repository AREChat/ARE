"use strict";
// ===== 送られてきた HTML を表示する「枠の中」の下地 =====
// ・この枠は sandbox（allow-scripts だけ）で開かれる。同じ場所のものを読み書きできない（ログイン情報・保存データには さわれない）。
// ・親（fileview.js）から届いた HTML を、そのまま 書き込んで表示するだけ。外への通信は、HTML の先頭に付ける CSP で止める。
(function () {
    // 右クリック・F12 などの「抑止」（protect.js と同じ決まり。この枠は別の場所の扱いなので、枠の中にも付ける）。
    // document.open() で、付けた決まりが消えるため、読み込んだとき と HTML を書き込んだあと の両方で付ける。
    function guard() {
        function stopMenu(event) { event.preventDefault(); }   // 標準メニューだけ止める（ページ独自のメニューは動く）
        document.addEventListener("keydown", function (event) {
            var key = String(event.key || "").toLowerCase();
            var ctrl = event.ctrlKey || event.metaKey;
            var blocked =
                event.key === "F12" ||
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10") ||
                (ctrl && event.shiftKey && (key === "i" || key === "j" || key === "c" || key === "k" || key === "e" || key === "m")) ||
                (ctrl && event.altKey && (key === "i" || key === "j" || key === "c" || key === "u")) ||
                (event.metaKey && event.altKey && (key === "i" || key === "j" || key === "c" || key === "u")) ||
                (ctrl && !event.shiftKey && (key === "u" || key === "s")) ||
                event.key === "F7" ||                                                       // キャレット閲覧
                (ctrl && event.shiftKey && key === "s") ||                                  // 名前をつけて保存の別の形
                (ctrl && !event.shiftKey && !event.altKey && key === "p");                  // 印刷（protect.js と同じ：チャット・読みもの以外では止める）
            if (!blocked) return;
            event.preventDefault();
            event.stopPropagation();
        }, true);
        document.addEventListener("contextmenu", stopMenu, true);
        window.addEventListener("contextmenu", stopMenu, true);
        document.addEventListener("mousedown", function (e) { if (e.button === 2) e.preventDefault(); }, true);
        document.addEventListener("auxclick", function (e) { if (e.button === 2) stopMenu(e); }, true);
        // ファイルのドロップ：入力欄の上以外では、ブラウザが勝手にファイルを開かないように止める（protect.js と同じ）
        function isField(t) { return !!(t && t.closest && t.closest("input,textarea,select,[contenteditable=''],[contenteditable='true']")); }
        window.addEventListener("dragover", function (e) { if (e.defaultPrevented || isField(e.target)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = "none"; } catch (_e) { /* 何もしない */ } });
        window.addEventListener("drop", function (e) { if (e.defaultPrevented || isField(e.target)) return; e.preventDefault(); });
        // 印刷しても、画面の中身が出ない（protect.js と同じ）
        var pst = document.createElement("style"); pst.textContent = "@media print{html,body{display:none!important}}";
        (document.head || document.documentElement).appendChild(pst);
    }
    guard();
    var done = false;
    window.addEventListener("message", function (e) {
        if (done || e.source !== window.parent) return;
        var d = e.data;
        if (!d || typeof d.html !== "string" || d.html.length > 6 * 1024 * 1024) return;
        done = true;
        document.open();
        document.write(d.html);
        document.close();
        guard();
    });
    try { window.parent.postMessage({ ready: 1 }, "*"); } catch (_e) { /* 親がいないとき（直接開いたとき）は何もしない */ }
})();
