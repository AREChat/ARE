"use strict";
// ===== 右クリック禁止・開発者ツールの「抑止」（全画面共通・管理者も対象）=====
// 注意：これは「うっかり開く」を防ぐ抑止です。ブラウザのメニューや別の方法までは完全には止められません。
//       本当の安全は、サーバー側のルール（RLS）で守っています。
(function () {
    try { localStorage.removeItem("are_dev_ok"); } catch (_e) { /* 何もしない */ }

    function notice() {
        if (window.AREFeatures && typeof window.AREFeatures.notify === "function") window.AREFeatures.notify("この操作は無効になっています。");
    }

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
            (ctrl && !event.shiftKey && (key === "u" || key === "s"));
        if (!blocked) return;
        event.preventDefault();
        event.stopPropagation();
        notice();
    }, true);

    // 右クリック（長押しメニュー含む）：全画面で禁止。メニューは一切出さない
    function stopMenu(event) { event.preventDefault(); /* 標準メニューだけ止める。アプリ独自メニュー(長押し・コピー)は伝播させて動かす */ }
    document.addEventListener("contextmenu", stopMenu, true);
    window.addEventListener("contextmenu", stopMenu, true);
    document.addEventListener("mousedown", function (e) { if (e.button === 2) e.preventDefault(); }, true);
    document.addEventListener("auxclick", function (e) { if (e.button === 2) stopMenu(e); }, true);
    document.addEventListener("selectstart", function (e) {
        var t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
        if (t && t.tagName === "IMG") e.preventDefault();
    }, true);

    // 画像・ファイル（スクショ含む）の貼り付けは、チャット画面（相手を開いているとき）だけ
    document.addEventListener("paste", function (event) {
        var cd = event.clipboardData;
        if (!cd) return;
        var hasFile = (cd.files && cd.files.length > 0) || Array.prototype.some.call(cd.items || [], function (i) { return i.kind === "file"; });
        if (!hasFile) return;
        if (typeof window.__areAllowFilePaste === "function" && window.__areAllowFilePaste(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (window.AREFeatures && typeof window.AREFeatures.notify === "function") window.AREFeatures.notify("画像・ファイルの貼り付けは、チャット画面でだけ使えます。");
    }, true);

    document.addEventListener("dragstart", function (event) {
        var t = event.target;
        if (t && (t.tagName === "IMG" || t.tagName === "VIDEO" || t.tagName === "CANVAS")) event.preventDefault();
    }, true);

    // 画像・動画の長押し保存メニュー、ドラッグ、選択を出さない
    var st = document.createElement("style");
    st.textContent = "img,video,canvas,svg{-webkit-touch-callout:none!important;-webkit-user-drag:none!important;user-drag:none!important}" +
        "img,video{-webkit-user-select:none!important;user-select:none!important}";
    (document.head || document.documentElement).appendChild(st);

    // 開発者ツールを横に開いた状態（ウィンドウ内側と外側の大きさの差）を見つけたら画面を隠す。スマホでは動きません
    var coarse = false;
    try { coarse = window.matchMedia("(pointer:coarse)").matches; } catch (_e) { /* 何もしない */ }
    if (!coarse) {
        var veil = null;
        setInterval(function () {
            var w = window.outerWidth - window.innerWidth, h = window.outerHeight - window.innerHeight;
            // ブラウザの拡大（125%など）では、内側だけが小さくなり、幅の差と高さの差が「そろって」大きくなる。開発者ツールを横に出したときは幅の差だけ、下に出したときは高さの差だけが大きい。
            // そろって大きいときは、拡大（プロジェクターに映すときなど）とみなして、画面を隠さない。
            var side = w > 260 && h < 175, below = h > 300 && w < 100;
            var open = (side || below) && window.outerWidth > 0 && window.outerHeight > 0;
            if (open && !veil && document.body) {
                veil = document.createElement("div");
                veil.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:#0b1020;color:#fff;display:flex;align-items:center;justify-content:center;font:16px system-ui,sans-serif;text-align:center;padding:24px";
                veil.textContent = "開発者ツールを閉じてください。閉じると元の画面に戻ります。";
                document.body.appendChild(veil);
            } else if (!open && veil) { veil.remove(); veil = null; }
        }, 1000);
    }

    // ===== 追加の抑止（サイバー攻撃・うっかり操作の対策）。ゲーム・チャットに必要なボタン／キーは そのまま使えます =====
    (function () {
        var path = location.pathname;
        var isInfo = /\/(terms|privacy|faq|guide|help|credits|changelog|404|manual)(\.html)?$/.test(path);   // 読みものページ（印刷・コピーはOK）
        var isChat = /\/chat(\.html)?$/.test(path);                                                          // チャット：コピー・貼り付け・「印刷」ボタンは必要
        var isGame = (/\/(game|game2|game3|game4|game6|game7|dream-frontier|daifugo)\//.test(path) && !/\/game2\/manual/.test(path)) || /\/game5\/play\//.test(path);
        function isField(t) { return !!(t && t.nodeType === 1 && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)); }

        // 1) ほかの開発者向けキー（F7 キャレット閲覧／名前をつけて保存の別の形）。Ctrl+P（印刷）は、チャット・読みものページ以外で止める
        document.addEventListener("keydown", function (event) {
            var key = String(event.key || "").toLowerCase(), ctrl = event.ctrlKey || event.metaKey;
            var block = event.key === "F7" || (ctrl && event.shiftKey && key === "s") ||
                (ctrl && !event.shiftKey && !event.altKey && key === "p" && !isChat && !isInfo);
            if (!block) return;
            event.preventDefault(); event.stopPropagation(); notice();
        }, true);

        // 2) 印刷：チャット・読みものページ以外は、印刷しても画面の中身が出ない
        if (!isChat && !isInfo) {
            var pst = document.createElement("style");
            pst.textContent = "@media print{html,body{display:none!important}}";
            (document.head || document.documentElement).appendChild(pst);
        }

        // 3) ファイルのドロップ：入力欄やファイル選びの上、アプリ自身がうけとる場所（ドロップ受け口）以外では、ブラウザが勝手にファイルを開かないようにする
        window.addEventListener("dragover", function (e) {
            if (e.defaultPrevented || isField(e.target)) return;
            e.preventDefault(); try { e.dataTransfer.dropEffect = "none"; } catch (_e) { /* 何もしない */ }
        });
        window.addEventListener("drop", function (e) {
            if (e.defaultPrevented || isField(e.target)) return;
            e.preventDefault();
        });

        // 4) 他のサイトの中に埋め込まれて（フレーム）使われるのを止める（クリックジャッキング対策）。同じサイトの中の埋め込み（game2 のドリームフロンティア表示など）はOK
        try { if (window.top !== window.self) { void window.top.location.href; } }
        catch (_e) { document.documentElement.style.display = "none"; }

        // 5) ゲームの画面：コピー・切り取り・文字選択・Ctrl+A・印刷などを止める（入力欄は除く）。game/ は自分で読み込み済み
        if (isGame && !document.querySelector('script[src*="protect-game.js"]')) {
            try {
                var me = document.currentScript && document.currentScript.src;
                if (me) {
                    var gs = document.createElement("script");
                    gs.src = new URL("game/protect-game.js", me).href;
                    (document.head || document.documentElement).appendChild(gs);
                }
            } catch (_e) { /* 何もしない */ }
        }

        // 5-2) ゲームの画面：スマホ用の「← もどる」と、端末の「戻る」でブラウザごと閉じない動き（game-back.js）
        if (isGame && !document.querySelector('script[src*="game-back.js"]')) {
            try {
                var me2 = document.currentScript && document.currentScript.src;
                if (me2) {
                    var gb = document.createElement("script");
                    gb.src = new URL("game-back.js", me2).href;
                    (document.head || document.documentElement).appendChild(gb);
                }
            } catch (_e) { /* 何もしない */ }
        }

        // 6) コンソールの注意書き：「ここに貼って」と言われたコードで、アカウントやデータを盗まれるのを防ぐ
        try {
            console.log("%c止まって！", "color:#d33;font-size:34px;font-weight:bold");
            console.log("%cだれかに「ここにコードを貼って」と言われても、貼らないでください。アカウントやデータを盗まれるおそれがあります。", "font-size:15px");
        } catch (_e) { /* 何もしない */ }
    })();

    // ===== 7) 開発者ツールを「⋮メニューから」開いた場合も、別ウィンドウで開いた場合も見つけて、画面の中身を消す =====
    // ・デバッガの「一時停止」にかかる時間をはかる：開発者ツールが開いていると、debugger の行で止まるので、時間がかかる（Chrome・Edge・Firefox・Safari のパソコン版）
    // ・横や下に開いたときの、ウィンドウの大きさの差（上の 1 つ目の見張りと同じ見かた）もあわせて使う
    // ・見つけたら、画面の中身を すべて取りのぞき（要素の検査をしても何も出ない）、閉じたら自動で読み込みなおす
    // ※ ページの側からは、メニューの「デベロッパーツール」そのものを消すことはできません（ブラウザの決まり）。「開けなくする」のではなく「開いても何も見えない」ようにします。
    (function () {
        var coarse2 = false;
        try { coarse2 = window.matchMedia("(pointer:coarse)").matches; } catch (_e) { /* 何もしない */ }
        if (coarse2) return;
        var locked = false, hit = 0, clear = 0;
        function probe() {
            var t = performance.now();
            (function () { debugger; })();
            return performance.now() - t > 180;
        }
        function sizeOpen() {
            var w = window.outerWidth - window.innerWidth, h = window.outerHeight - window.innerHeight;
            return window.outerWidth > 0 && window.outerHeight > 0 && ((w > 260 && h < 175) || (h > 300 && w < 100));
        }
        function lock() {
            locked = true;
            try {
                var body = document.body;
                if (!body) return;
                Array.prototype.slice.call(body.childNodes).forEach(function (n) { try { n.remove(); } catch (_e) { /* 何もしない */ } });
                var v = document.createElement("div");
                v.id = "dtVeil";
                v.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0b1020;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font:16px/1.8 system-ui,sans-serif";
                v.textContent = "開発者ツールが開いています。閉じてください。閉じると、自動で元の画面に戻ります。";
                body.appendChild(v);
                // 閉じるまで、アプリが あとから足す画面の部品も、すぐ取りのぞく
                var mo = new MutationObserver(function () {
                    Array.prototype.slice.call(body.childNodes).forEach(function (n) { if (n !== v) { try { n.remove(); } catch (_e) { /* 何もしない */ } } });
                });
                mo.observe(body, { childList: true });
            } catch (_e) { /* 何もしない */ }
        }
        setInterval(function () {
            var open = false;
            try { open = probe() || sizeOpen(); } catch (_e) { open = false; }
            if (!locked) {
                hit = open ? hit + 1 : 0;
                if (hit >= 2) lock();    // 1回だけの もたつきでは 反応しない（2回つづけて見つけたとき）
            } else {
                clear = open ? 0 : clear + 1;
                if (clear >= 3) location.reload();   // 閉じられたら、読みなおして もどす
            }
        }, 700);
    })();

    window.AREProtect = { setExempt: function () { /* 管理者も含め、全員が対象です（何もしません） */ } };
})();
