"use strict";
// ===== チャットの添付ファイルを「新しいタブ」で開く専用ページ =====
// ・保存先（Supabase Storage）の中身を、ブラウザ標準の表示ではなく、このページの中で表示する。
//   （標準の表示だと、右クリックや F12 を止める protect.js が効かず、文字コードの推測で文字化けもするため）
// ・文字のファイルは、文字コードを自分で判定して、正しく表示する（Shift_JIS・EUC-JP・JIS・UTF-16 も読める）。
// ・開けるのは「このアプリの保存先（ARE_CONFIG.supabaseUrl）」のファイルだけ。ほかの URL は開かない。
(function () {
    var MAX_TEXT_BYTES = 5 * 1024 * 1024;   // 文字のファイルは、5MB まで表示（それより大きいときはダウンロードだけ）
    var $ = function (id) { return document.getElementById(id); };
    var main = $("fvMain"), nameEl = $("fvName"), metaEl = $("fvMeta"), copyBtn = $("fvCopy"), saveBtn = $("fvSave");
    var downloadParts = null, downloadMime = "application/octet-stream", downloadName = "file", copyText = "";

    function readHash() {
        var out = {};
        String(location.hash || "").replace(/^#/, "").split("&").forEach(function (pair) {
            var i = pair.indexOf("=");
            if (i < 1) return;
            try { out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); } catch (_e) { /* 読めない部分は無視 */ }
        });
        return out;
    }

    // このアプリの保存先のファイルだけを開く
    function checkUrl(raw) {
        try {
            var u = new URL(raw), base = new URL(window.ARE_CONFIG.supabaseUrl);
            if (u.protocol === "https:" && u.origin === base.origin && u.pathname.indexOf("/storage/v1/object/") === 0) return u;
        } catch (_e) { /* だめな URL */ }
        return null;
    }

    function note(html) {
        main.textContent = "";
        var d = document.createElement("div");
        d.className = "note";
        d.innerHTML = html;
        main.appendChild(d);
    }

    function fail(message) {
        nameEl.textContent = "ファイルを開けません";
        note(message + '<br><br><button type="button" id="fvBack" class="main">チャットにもどる</button>');
        var b = $("fvBack");
        if (b) b.addEventListener("click", function () { location.href = "./chat.html"; });
    }

    function extOf(pathname, name) {
        var s = "";
        try { s = decodeURIComponent(pathname); } catch (_e) { s = pathname; }
        var m = /\.([A-Za-z0-9]+)$/.exec(s) || /\.([A-Za-z0-9]+)$/.exec(name || "");
        return m ? m[1].toLowerCase() : "";
    }

    function showSave(parts, mime) {
        downloadParts = parts; downloadMime = mime || "application/octet-stream";
        saveBtn.hidden = false;
    }

    // 画像・動画・音声・PDF などは、ダウンロードのときだけ中身を取ってくる
    function fetchAndSave(url) {
        var old = saveBtn.textContent;
        saveBtn.disabled = true; saveBtn.textContent = "準備中…";
        return fetch(url, { credentials: "omit" }).then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            return r.blob();
        }).then(function (blob) {
            triggerDownload(blob);
        }).catch(function () {
            metaEl.textContent = "ダウンロードの準備に失敗しました。もう一度お試しください。";
        }).then(function () { saveBtn.disabled = false; saveBtn.textContent = old; });
    }

    function triggerDownload(blobOrParts) {
        var blob = blobOrParts instanceof Blob ? blobOrParts : new Blob(blobOrParts, { type: downloadMime });
        var href = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = href; a.download = downloadName; a.style.display = "none";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(href); }, 30000);
    }

    function showText(url, ext) {
        return fetch(url.href, { credentials: "omit", cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var bytes = new Uint8Array(buf);
            if (bytes.length > MAX_TEXT_BYTES) {
                note("このファイルは大きい（" + Math.round(bytes.length / 1048576) + "MB）ため、ここでは表示しません。<br><b>ダウンロード</b>して開いてください。");
                showSave([bytes], "application/octet-stream");
                return;
            }
            var found = detectTextEncoding(bytes), text = null, label = "";
            if (found.enc === "utf-8" || found.enc === "utf-8-bom") {
                text = new TextDecoder("utf-8").decode(bytes);
                label = "UTF-8";
                showSave([bytes], "text/plain;charset=utf-8");
            } else if (typeof found.text === "string") {
                text = found.text;
                label = (TEXT_ENCODING_LABEL[found.enc] || found.enc) + " → UTF-8 に直して表示";
                showSave([encodeUtf8Text(text, TEXT_FIX_BOM_EXT.has(ext))], "text/plain;charset=utf-8");   // ダウンロードも、直した（文字化けしない）ほうを渡す
            }
            if (text === null) {
                note("このファイルは、文字として読めませんでした（文字コードを判定できません）。<br><b>ダウンロード</b>して開いてください。");
                showSave([bytes], "application/octet-stream");
                return;
            }
            copyText = text;
            copyBtn.hidden = false;
            metaEl.textContent = "文字コード：" + label + " ・ " + text.length.toLocaleString() + " 文字";
            main.textContent = "";
            var pre = document.createElement("pre");
            pre.textContent = text;       // 文字としてだけ表示する（HTML や Markdown としては解釈しない）
            main.appendChild(pre);
        });
    }

    function init() {
        var p = readHash();
        var url = checkUrl(p.u || "");
        if (!url) { fail("リンクが正しくないため、開けません。"); return; }
        var ext = extOf(url.pathname, p.n);
        downloadName = String(p.n || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || ("file" + (ext ? "." + ext : ""));
        if (ext && !/\.[A-Za-z0-9]{1,8}$/.test(downloadName)) downloadName += "." + ext;   // 名前に拡張子がなければ、保存先の拡張子を付ける
        nameEl.textContent = downloadName;
        document.title = downloadName + " | ARE";
        var kind = fileViewKind(ext);
        // 画像・動画・音声：保存先の URL をそのまま、このページの中の表示（img / video / audio）に渡す
        if (kind === "image") {
            var img = document.createElement("img");
            img.className = "view"; img.alt = downloadName; img.draggable = false; img.src = url.href;
            img.addEventListener("click", function () { img.classList.toggle("zoom"); });
            img.addEventListener("error", function () { fail("画像を読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。"); });
            main.textContent = ""; main.appendChild(img);
            saveBtn.hidden = false;
            saveBtn.addEventListener("click", function () { fetchAndSave(url.href); });
            return;
        }
        if (kind === "video" || kind === "audio") {
            var m = document.createElement(kind);
            m.controls = true; m.preload = "metadata"; m.src = url.href;
            m.setAttribute("controlsList", "nodownload noremoteplayback");
            if (kind === "video") { m.setAttribute("playsinline", ""); m.setAttribute("disablePictureInPicture", ""); }
            m.addEventListener("error", function () { fail("ファイルを読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。"); });
            main.textContent = ""; main.appendChild(m);
            saveBtn.hidden = false;
            saveBtn.addEventListener("click", function () { fetchAndSave(url.href); });
            return;
        }
        if (kind === "text") {
            showText(url, ext).catch(function () {
                fail("ファイルを読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。");
            });
            return;
        }
        // PDF・そのほか：ブラウザ標準の表示（右クリックや F12 を止められない）は使わず、ダウンロードだけにする
        note((kind === "pdf" ? "PDF" : "このファイル") + "は、この画面では表示しません。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
        saveBtn.hidden = false;
        saveBtn.addEventListener("click", function () { fetchAndSave(url.href); });
    }

    saveBtn.addEventListener("click", function () { if (downloadParts) triggerDownload(downloadParts); });
    copyBtn.addEventListener("click", function () {
        var done = function () { var o = copyBtn.textContent; copyBtn.textContent = "✓ コピーしました"; setTimeout(function () { copyBtn.textContent = o; }, 1800); };
        try { navigator.clipboard.writeText(copyText).then(done, function () { metaEl.textContent = "コピーできませんでした。"; }); }
        catch (_e) { metaEl.textContent = "コピーできませんでした。"; }
    });
    $("fvClose").addEventListener("click", function () {
        try { window.close(); } catch (_e) { /* 何もしない */ }
        setTimeout(function () { location.href = "./chat.html"; }, 300);   // 閉じられなかったとき（直接開いたときなど）は、チャットへ
    });
    window.addEventListener("hashchange", function () { location.reload(); });
    init();
})();
