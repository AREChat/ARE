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

    // ===== 7) 開発者ツールを「⋮メニューから」開いた場合も、別ウィンドウで開いた場合も、見つけて、画面の中身を消す =====
    // 見つけかた（どれか1つでも当たれば、見つけたことにする）
    //   a) デバッガの「一時停止」にかかる時間をはかる（debugger の行で止まる）
    //   b) コンソールに「おとり」を出す：開発者ツールが開いていると、おとりの中身を読みに来るので、わかる
    //      （「ブレークポイントを無効にする」をされても、これは見つけられる）
    //   c) 横や下に開いたときの、ウィンドウの大きさの差（パソコンだけ）
    //   d) この見張りの関数が、開発者ツールの「ソース」で書きかえられていないか（書きかえを見つけたら すぐ）
    //   e) 見張りの時計が止められていないか（clearInterval などで止める手口）
    // 見つけたら：画面の中身を すべて取りのぞく／消した画面を、元に戻そうとしても すぐ消しなおす／閉じられたら、読みこみなおして、書きかえを すべて捨てる
    // ※ ページの側からは、メニューの「デベロッパーツール」そのものを消すことはできません（ブラウザの決まり）。「開けなくする」のではなく「開いても何も見えない」ようにします。
    (function () {
        var coarse2 = false;
        try { coarse2 = window.matchMedia("(pointer:coarse)").matches; } catch (_e) { /* 何もしない */ }
        var cdebug = console.debug, fts = Function.prototype.toString;   // 最初に手に入れた本物を使う（あとから差しかえられても影響なし）
        var nowFn = Date.now;
        var locked = false, hit = 0, clear = 0, lastTick = nowFn.call(Date), gHit = false, veil = null, mo = null, wipeBusy = false;
        var VEIL_CSS = "position:fixed!important;inset:0!important;z-index:2147483647!important;background:#0b1020!important;color:#fff!important;display:flex!important;visibility:visible!important;opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important;pointer-events:auto!important;align-items:center;justify-content:center;text-align:center;padding:24px;font:16px/1.8 system-ui,sans-serif;margin:0!important;width:auto!important;height:auto!important";
        var VEIL_TEXT = "開発者ツールが開いています。閉じてください。閉じると、自動で元の画面に戻ります。";

        // おとり：中身を読みに来たら gHit が立つ
        var baitErr = new Error(""), baitEl = null;
        try { Object.defineProperty(baitErr, "stack", { get: function () { gHit = true; return ""; } }); } catch (_e) { /* 何もしない */ }
        try { baitEl = document.createElement("div"); Object.defineProperty(baitEl, "id", { get: function () { gHit = true; return ""; } }); } catch (_e) { /* 何もしない */ }

        function probe() {   // a)
            var t = performance.now();
            (function () { debugger; })();
            return performance.now() - t > 150;
        }
        function bait() {    // b)  前回から今回までの間に読まれた分（あとから画面側が読みに来る分）も、数える
            var was = gHit;
            gHit = false;
            try { if (typeof cdebug === "function") cdebug.call(console, baitErr, baitEl); } catch (_e) { /* 何もしない */ }
            return was || gHit;
        }
        function sizeOpen() {   // c)
            var w = window.outerWidth - window.innerWidth, h = window.outerHeight - window.innerHeight;
            return window.outerWidth > 0 && window.outerHeight > 0 && ((w > 260 && h < 175) || (h > 300 && w < 100));
        }
        function sig(f) {
            var s = fts.call(f), h = 7, i;
            for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return h;
        }
        var guards = [];
        var sigs = [];
        function tampered() {   // d)
            for (var i = 0; i < guards.length; i++) { if (sig(guards[i]) !== sigs[i]) return true; }
            return false;
        }

        function wipe() {
            if (wipeBusy) return;
            wipeBusy = true;
            try {
                var root = document.documentElement;
                if (!root) return;
                Array.prototype.slice.call(root.childNodes).forEach(function (n) {
                    if (n === veil || n === document.head) return;
                    if (n === document.body) { Array.prototype.slice.call(n.childNodes).forEach(function (c) { try { c.remove(); } catch (_e) { /* 何もしない */ } }); return; }
                    try { n.remove(); } catch (_e) { /* 何もしない */ }
                });
                if (veil.parentNode !== root) root.appendChild(veil);
                if (veil.getAttribute("style") !== VEIL_CSS) veil.setAttribute("style", VEIL_CSS);
                if (veil.textContent !== VEIL_TEXT) veil.textContent = VEIL_TEXT;
                ["class", "hidden", "id"].forEach(function (a) { if (a !== "id" && veil.hasAttribute(a)) veil.removeAttribute(a); });
                if (veil.id !== "dtVeil") veil.id = "dtVeil";
                if (root.getAttribute("style")) root.removeAttribute("style");
                if (root.className) root.className = "";
                if (document.body && document.body.getAttribute("style")) document.body.removeAttribute("style");
            } catch (_e) { /* 何もしない */ } finally { wipeBusy = false; }
        }
        function lock() {
            if (locked) return;
            locked = true;
            try {
                veil = document.createElement("div");
                veil.id = "dtVeil";
                veil.setAttribute("style", VEIL_CSS);
                veil.textContent = VEIL_TEXT;
                (document.documentElement || document).appendChild(veil);
                wipe();
                // 消した画面を、開発者ツールで元に戻そうとしても（要素の削除・属性の書きかえ・あとから足される部品も）、すぐ消しなおす
                mo = new MutationObserver(function () { wipe(); });
                mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
            } catch (_e) { /* 何もしない */ }
        }
        function tick() {
            lastTick = nowFn.call(Date);
            var open = false, strong = false;
            try { strong = tampered(); } catch (_e) { strong = false; }
            try { if (probe()) open = true; } catch (_e) { /* 何もしない */ }
            try { if (bait()) open = true; } catch (_e) { /* 何もしない */ }
            if (!coarse2) { try { if (sizeOpen()) open = true; } catch (_e) { /* 何もしない */ } }
            if (!locked) {
                hit = open ? hit + 1 : 0;
                if (strong || hit >= 2) lock();   // 1回だけの もたつきでは 反応しない（2回つづけて見つけたとき）。書きかえは すぐ
            } else {
                clear = (open || strong) ? 0 : clear + 1;
                if (clear >= 4) location.reload();   // 閉じられたら、読みなおして、書きかえを すべて捨てる
                else wipe();
            }
        }
        guards = [probe, bait, sizeOpen, sig, tampered, wipe, lock, tick];
        sigs = guards.map(sig);

        // 最初の1回は、いますぐ見る（開いたままページを開いたとき、画面を見せる前に消せる）
        try { var first = probe() || bait(); if (first) { hit = 1; } } catch (_e) { /* 何もしない */ }
        setInterval(tick, 350);
        // e) 見張りの時計が止められたら（clearInterval などで止める手口）、べつの時計や、画面への操作が気づいて、時計を作りなおして画面を消す
        function dogCheck() {
            try {
                if (document.visibilityState === "visible" && nowFn.call(Date) - lastTick > 3000) {
                    lastTick = nowFn.call(Date);
                    setInterval(tick, 350);
                    lock();
                }
            } catch (_e) { /* 何もしない */ }
        }
        guards.push(dogCheck); sigs.push(sig(dogCheck));
        (function dog() { setTimeout(function () { dogCheck(); dog(); }, 1000); })();
        ["pointermove", "pointerdown", "keydown", "scroll", "focus", "touchstart"].forEach(function (n) {
            window.addEventListener(n, dogCheck, { capture: true, passive: true });
        });
        document.addEventListener("visibilitychange", function () { lastTick = nowFn.call(Date); });   // 別のタブにいた間の「止まり」を、止められたと誤解しない
        // チャットの本体などから、見張りが生きているかを たしかめる（見張りの js ごと消されたら、本体の側で気づく）
        window.AREProtectAlive = function () { return locked ? 2 : 1; };
        try { Object.defineProperty(window, "AREProtectAlive", { writable: false, configurable: false }); } catch (_e) { /* 何もしない */ }
    })();

    // ===== 8) 全画面（初期設定でオン）：最初のタップ・キー操作で、全画面にする（ブラウザのタブ・⋮メニューが見えなくなる）=====
    // ・ブラウザの決まりで、ユーザーの操作なしには、全画面にできません。なので「最初の1回の操作」で入ります。
    // ・Esc でやめたら、そのタブでは、もう自動では入りません。チャットの「全画面にする」ツールで、もう一度オン／オフを選べます。
    // ・ゲームの画面は、ゲーム側の全画面と ぶつからないよう、対象外です。アプリ（Android）・ホーム画面に追加した状態では、もともと全画面なので何もしません。
    (function () {
        var path = location.pathname;
        var isGame2 = (/\/(game|game2|game3|game4|game6|game7|dream-frontier|daifugo)\//.test(path) && !/\/game2\/manual/.test(path)) || /\/game5\/play\//.test(path);
        if (isGame2 || window.AREAndroid) return;
        try { if (window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches) return; } catch (_e) { /* 何もしない */ }
        var d = document.documentElement;
        var req = d.requestFullscreen || d.webkitRequestFullscreen;
        if (!req) return;
        function active() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
        function wantOn() { try { return localStorage.getItem("are_fs_off") !== "1"; } catch (_e) { return true; } }
        function leftByUser() { try { return sessionStorage.getItem("are_fs_left") === "1"; } catch (_e) { return false; } }
        var leaving = false, entered = false;
        window.addEventListener("pagehide", function () { leaving = true; });
        window.addEventListener("beforeunload", function () { leaving = true; });
        function onChange() {
            if (active()) { entered = true; try { sessionStorage.removeItem("are_fs_left"); } catch (_e) { /* 何もしない */ } stop(); }
            else if (entered && !leaving) { entered = false; try { sessionStorage.setItem("are_fs_left", "1"); } catch (_e) { /* 何もしない */ } }
        }
        document.addEventListener("fullscreenchange", onChange);
        document.addEventListener("webkitfullscreenchange", onChange);
        function go(e) {
            if (e && e.type === "keydown" && (e.key === "Escape" || e.key === "F11" || e.key === "F12")) return;
            if (active() || !wantOn() || leftByUser()) return;
            try {
                var p = req.call(d, { navigationUI: "hide" });
                if (p && typeof p.catch === "function") p.catch(function () { /* もう一度の操作で、またためす */ });
            } catch (_e) { /* 何もしない */ }
        }
        var evs = ["pointerup", "touchend", "click", "keydown"];
        function stop() { evs.forEach(function (n) { document.removeEventListener(n, go, true); }); }
        evs.forEach(function (n) { document.addEventListener(n, go, true); });
    })();

    window.AREProtect = { setExempt: function () { /* 管理者も含め、全員が対象です（何もしません） */ } };
})();
