"use strict";
// ===== 保存先（Supabase Storage）のファイルを「新しいタブ」で開くときは、専用ページ（fileview.html）で開く =====
// ・ブラウザ標準の表示だと、右クリック・F12 などを止める protect.js が効かない（このアプリのページではないため）。
//   また、文字のファイルは、ブラウザが文字コードを読み違えて文字化けすることがある。
// ・画像・動画・音声・文字のファイル・PDF が対象。docx や zip など「開かずにダウンロードされる」ものは、今までどおり。
// ・チャット・投稿・アルバム・管理画面など、どこの「リンク」でも、ここ 1 か所で受け止める（個別の直しは不要）。
(function () {
    var last = { href: "", time: 0 };

    function storageUrl(a) {
        try {
            var u = new URL(a.href, location.href), base = new URL(window.ARE_CONFIG.supabaseUrl);
            if (u.origin === base.origin && u.pathname.indexOf("/storage/v1/object/") === 0) return u;
        } catch (_e) { /* 保存先のリンクではない */ }
        return null;
    }

    function nameOf(a, u) {
        var n = a.getAttribute("download");
        if (n) return n;
        var b = a.querySelector("b");
        if (b && b.textContent.trim()) return b.textContent.trim();
        var img = a.querySelector("img");
        if (img && img.alt && img.alt !== "投稿画像") return img.alt;
        var t = (a.textContent || "").trim();
        if (t && t.length <= 120 && !/^https?:/i.test(t)) return t;
        try { return decodeURIComponent(u.pathname.split("/").pop() || ""); } catch (_e) { return ""; }
    }

    function extOf(u) {
        var s = u.pathname;
        try { s = decodeURIComponent(s); } catch (_e) { /* そのまま */ }
        var m = /\.([A-Za-z0-9]+)$/.exec(s);
        return m ? m[1].toLowerCase() : "";
    }

    function viewerHref(u, name) {
        // 長い URL は、サーバーに送られない「#」のうしろに入れる
        return new URL("./fileview.html", location.href).href + "#u=" + encodeURIComponent(u.href) + (name ? "&n=" + encodeURIComponent(name) : "");
    }

    function openNewTab(href) {
        try {
            var t = document.createElement("a");
            t.href = href; t.target = "_blank"; t.rel = "noopener noreferrer"; t.style.display = "none";
            t.dataset.lcDone = "1"; t.__lcSkip = true;     // link-copy.js には さわらせない
            document.body.appendChild(t); t.click(); t.remove();
        } catch (_e) { location.href = href; }
    }

    // 添付のURL（メッセージに保存されているもの）は7日で切れる。data-path があれば、開く直前に
    // 新しい（切れていない）リンクを取り直してから開く（取り直せなかったときは、元のリンクのまま開く）。
    function freshUrl(u, path) {
        if (!path || typeof requireClient !== "function" || typeof STORAGE_BUCKET === "undefined") return Promise.resolve(u);
        return requireClient().storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600).then(function (r) {
            if (r && r.data && r.data.signedUrl) { try { var nu = new URL(r.data.signedUrl, location.href); if (nu.protocol === "https:" || nu.protocol === "http:") return nu; } catch (_e) { /* そのまま */ } }   // http(s) 以外（data: など）は、取り直しの答えとして使わない
            return u;
        }).catch(function () { return u; });
    }

    function handle(e) {
        if (e.type === "auxclick" ? e.button !== 1 : e.button > 0) return;
        var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        var u = storageUrl(a);
        if (!u) return;
        var kind = fileViewKind(extOf(u)) || (a.querySelector("img") ? "image" : "");
        if (!kind) return;
        e.preventDefault();
        var now = Date.now();
        if (last.href === u.href && now - last.time < 600) return;   // 同じ操作を link-copy.js がやり直した分は、もう一度開かない
        last = { href: u.href, time: now };
        var name = nameOf(a, u);
        var newTab = a.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || e.type === "auxclick";
        freshUrl(u, a.dataset.path).then(function (fresh) {
            var href = viewerHref(fresh, name);
            if (newTab) openNewTab(href);
            else location.href = href;
        });
    }

    window.addEventListener("click", handle, true);      // window の捕まえ段階 ＝ ほかのどの処理より先
    window.addEventListener("auxclick", handle, true);   // 中ボタン（ホイール）クリック

    // スマホの長押しメニュー（「新しいタブで開く」など）を出さない
    var st = document.createElement("style");
    st.textContent = 'a[href*="/storage/v1/object/"]{-webkit-touch-callout:none}';
    (document.head || document.documentElement).appendChild(st);
})();
