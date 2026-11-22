"use strict";
// ===== チャットの添付ファイルを「新しいタブ」で開く専用ページ =====
// ・保存先（Supabase Storage）の中身を、ブラウザ標準の表示ではなく、このページの中で表示する。
//   （標準の表示だと、右クリックや F12 を止める protect.js が効かず、文字コードの推測で文字化けもするため）
// ・文字のファイルは、文字コードを自分で判定して、正しく表示する（Shift_JIS・EUC-JP・JIS・UTF-16 も読める）。
// ・pptx（PowerPoint）は、fileview-pptx.js で、スライドを描いて、スライドショーにする。
// ・PDF は、ブラウザ標準の表示（右クリックや F12 を止められない）は使わず、pdf.js（vendor/lazy）で、このページの canvas に描く。
// ・開けるのは「このアプリの保存先（ARE_CONFIG.supabaseUrl）」のファイルだけ。ほかの URL は開かない。
(function () {
    var MAX_TEXT_BYTES = 5 * 1024 * 1024;   // 文字のファイルは、5MB まで表示（それより大きいときはダウンロードだけ）
    var MAX_PDF_BYTES = 80 * 1024 * 1024;   // PDF は、80MB まで表示（チャットで送れるのは 50MB まで）
    var MAX_PPTX_BYTES = 80 * 1024 * 1024;  // pptx も、80MB まで表示
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

    // 画像・動画・音声が出せなかったとき：リンクの期限切れのほか、ブラウザが対応していない形式のこともある。ダウンロードのボタンは残す
    function mediaFail() {
        note("このファイルは、ここでは開けませんでした。<br>リンクの期限が切れたか、ブラウザで表示・再生できない形式かもしれません。<br><b>ダウンロード</b>して開くか、チャットを開き直してもう一度お試しください。");
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

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement("script");
            el.src = src; el.onload = resolve; el.onerror = function () { reject(new Error("script")); };
            document.head.appendChild(el);
        });
    }

    // PDF：1ページずつ canvas に描く（見える付近のページだけ描き、遠くなったページは捨てて、メモリを使いすぎない）
    function drawPdf(pdf) {
        var total = pdf.numPages, wrap = document.createElement("div"), pages = [], queue = Promise.resolve();
        wrap.className = "pdf";
        metaEl.textContent = "PDF ・ " + total + " ページ";
        main.textContent = "";
        main.appendChild(wrap);
        function release(st) {
            st.want = false;
            if (st.task) { try { st.task.cancel(); } catch (_e) { /* 何もしない */ } st.task = null; }
            if (st.done) { st.holder.textContent = ""; st.done = false; }
        }
        function draw(st) {
            if (st.done || st.busy) return;
            st.busy = true;
            queue = queue.then(function () {
                if (!st.want) { st.busy = false; return null; }      // 見えなくなったので、描かない
                return pdf.getPage(st.n).then(function (page) {
                    var base = page.getViewport({ scale: 1 });
                    var cssW = Math.min(980, Math.max(240, main.clientWidth - 28));
                    var scale = (cssW / base.width) * Math.min(window.devicePixelRatio || 1, 2);
                    var px = base.width * scale * base.height * scale;
                    if (px > 16000000) scale *= Math.sqrt(16000000 / px);      // 大きすぎる紙は、少し粗くして描く
                    var vp = page.getViewport({ scale: scale });
                    var canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
                    canvas.draggable = false;
                    st.holder.style.aspectRatio = base.width + " / " + base.height;
                    st.task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
                    return st.task.promise.then(function () {
                        st.task = null; st.busy = false;
                        if (st.want) { st.holder.textContent = ""; st.holder.appendChild(canvas); st.done = true; }
                        try { page.cleanup(); } catch (_e) { /* 何もしない */ }
                    });
                }).catch(function (err) {
                    st.task = null; st.busy = false;
                    if (err && err.name === "RenderingCancelledException") return;
                    st.holder.textContent = "このページは表示できませんでした";
                });
            });
        }
        return pdf.getPage(1).then(function (first) {
            var v = first.getViewport({ scale: 1 });
            for (var i = 1; i <= total; i++) {
                var holder = document.createElement("div");
                holder.className = "pg"; holder.dataset.n = String(i);
                holder.style.aspectRatio = v.width + " / " + v.height;
                wrap.appendChild(holder);
                pages.push({ n: i, holder: holder, want: false, busy: false, done: false, task: null });
            }
            var byHolder = new Map(pages.map(function (st) { return [st.holder, st]; }));
            var near = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) { var st = byHolder.get(e.target); if (st && e.isIntersecting) { st.want = true; draw(st); } });
            }, { root: main, rootMargin: "900px 0px", threshold: 0 });
            var far = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) { var st = byHolder.get(e.target); if (st && !e.isIntersecting) release(st); });
            }, { root: main, rootMargin: "3500px 0px", threshold: 0 });
            pages.forEach(function (st) { near.observe(st.holder); far.observe(st.holder); });
        });
    }

    function showPdf(url) {
        return fetch(url.href, { credentials: "omit", cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var bytes = new Uint8Array(buf);
            showSave([bytes], "application/pdf");
            if (bytes.length > MAX_PDF_BYTES) {
                note("このPDFは大きい（" + Math.round(bytes.length / 1048576) + "MB）ため、ここでは表示しません。<br><b>ダウンロード</b>して開いてください。");
                return null;
            }
            return loadScript("./vendor/lazy/pdf.min.js").then(function () {
                var lib = window.pdfjsLib;
                if (!lib) throw new Error("pdfjs");
                lib.GlobalWorkerOptions.workerSrc = "./vendor/lazy/pdf.worker.min.js";
                return lib.getDocument({
                    data: bytes.slice(0),               // 渡すと中身が空になるので、ダウンロード用に残す分は別に持つ
                    isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true,
                    cMapUrl: "./vendor/lazy/cmaps/", cMapPacked: true, useSystemFonts: true
                }).promise;
            }).then(drawPdf).catch(function (err) {
                if (err && err.name === "PasswordException") note("パスワードつきのPDFは、この画面では開けません。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
                else note("このPDFは、この画面では表示できませんでした（壊れているか、特殊な形式です）。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
            });
        });
    }

    // pptx：スライドを描いて、スライドショーにする（fileview-pptx.js）。読めなかったときは、ダウンロードだけにする
    // 大きいファイルは、どれだけ読めたかを画面に出す（止まっているように見えないように）
    function fetchWithProgress(href, label) {
        return fetch(href, { credentials: "omit", cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            var total = Number(r.headers.get("content-length")) || 0;
            if (!r.body || !r.body.getReader || total < 2 * 1048576) return r.arrayBuffer();
            var reader = r.body.getReader(), chunks = [], got = 0, shown = 0;
            function mb(n) { return (n / 1048576).toFixed(1); }
            function pump() {
                return reader.read().then(function (x) {
                    if (x.done) {
                        var out = new Uint8Array(got), o = 0;
                        chunks.forEach(function (c) { out.set(c, o); o += c.length; });
                        return out.buffer;
                    }
                    chunks.push(x.value); got += x.value.length;
                    var now = Date.now();
                    if (now - shown > 250) { shown = now; metaEl.textContent = label + " " + mb(got) + " / " + mb(total) + " MB"; }
                    return pump();
                });
            }
            return pump();
        });
    }

    function showPptx(url) {
        return fetchWithProgress(url.href, "読み込み中…").then(function (buf) {
            var bytes = new Uint8Array(buf);
            showSave([bytes], "application/vnd.openxmlformats-officedocument.presentationml.presentation");
            if (bytes.length > MAX_PPTX_BYTES) {
                note("このファイルは大きい（" + Math.round(bytes.length / 1048576) + "MB）ため、ここでは表示しません。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
                return null;
            }
            return loadScript("./fileview-pptx.js").then(function () {
                return window.AREPptx.open({ bytes: bytes, main: main, meta: metaEl, note: note, showBtn: $("fvShow"), hereBtn: $("fvShowHere") });
            }).catch(function (err) {
                var m = String(err && err.message || "");
                $("fvShow").hidden = true; $("fvShowHere").hidden = true;
                if (m === "nostream") note("お使いのブラウザでは、スライドを表示できません（新しい Chrome・Safari・Edge・Firefox でお試しください）。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
                else note("このファイルは、この画面では表示できませんでした（壊れているか、特殊な形式です）。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
            });
        });
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

    // ---- HTML：ページの画面として表示する（安全な枠＝sandbox の中。コードは画面に出さない・コピーもさせない）----
    var MAX_HTML_BYTES = 5 * 1024 * 1024;

    // 送られてきた HTML の先頭に、外への通信を止める決まり（CSP）を付ける。DOCTYPE があれば、その直後（前に置くと表示のしかたが変わるため）
    function guardHtml(text, run, net) {
        var ext = net ? " https:" : "";
        var csp = "default-src 'none'; script-src " + (run ? "'unsafe-inline' 'unsafe-eval'" : "'none'") + "; style-src 'unsafe-inline'" + ext +
            "; img-src data: blob:" + ext + "; font-src data:" + ext + "; media-src data: blob:" + ext +
            "; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
        var meta = '<meta http-equiv="Content-Security-Policy" content="' + csp + '"><meta name="referrer" content="no-referrer">';
        var m = /^(?:\uFEFF)?\s*<!doctype[^>]*>/i.exec(text);
        return m ? text.slice(0, m[0].length) + meta + text.slice(m[0].length) : meta + text;
    }

    function makeFrame(text, run, net) {
        var guarded = guardHtml(text, run, net);
        var f = document.createElement("iframe");
        f.className = "hf"; f.title = "ページの表示"; f.referrerPolicy = "no-referrer";
        f.setAttribute("allow", "");                       // カメラ・マイク・位置情報などは 許可しない
        if (run) {
            f.setAttribute("sandbox", "allow-scripts");    // 同じ場所のもの（ログイン情報など）には さわれない。ポップアップ・フォーム・ページの乗っ取りも できない
            f.src = "./htmlframe.html";
            var sent = false;
            var onMsg = function (e) {
                if (e.source !== f.contentWindow) return;
                if (!f.isConnected) { window.removeEventListener("message", onMsg); return; }
                if (e.data && e.data.ready && !sent) { sent = true; f.contentWindow.postMessage({ html: guarded }, "*"); }
            };
            window.addEventListener("message", onMsg);
        } else {
            f.setAttribute("sandbox", "");                 // プログラムは いっさい動かさない
            f.srcdoc = guarded;
        }
        return f;
    }

    function showHtml(url, ext) {
        var runBtn = $("fvRun"), netBtn = $("fvNet");
        return fetch(url.href, { credentials: "omit", cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var bytes = new Uint8Array(buf);
            if (bytes.length > MAX_HTML_BYTES) {
                note("このファイルは大きい（" + Math.round(bytes.length / 1048576) + "MB）ため、ここでは表示しません。<br><b>ダウンロード</b>して開いてください。");
                showSave([bytes], "text/html;charset=utf-8");
                return;
            }
            var found = detectTextEncoding(bytes), text = null, label = "";
            if (found.enc === "utf-8" || found.enc === "utf-8-bom") {
                text = new TextDecoder("utf-8").decode(bytes); label = "UTF-8";
                showSave([bytes], "text/html;charset=utf-8");
            } else if (typeof found.text === "string") {
                text = found.text; label = (TEXT_ENCODING_LABEL[found.enc] || found.enc) + " → UTF-8 に直して表示";
                showSave([encodeUtf8Text(text, false)], "text/html;charset=utf-8");
            }
            if (text === null) {
                note("このファイルは、文字として読めませんでした（文字コードを判定できません）。<br><b>ダウンロード</b>して開いてください。");
                showSave([bytes], "application/octet-stream");
                return;
            }
            var st = { run: true, net: false };
            function draw() {
                main.textContent = "";
                runBtn.hidden = false; netBtn.hidden = !st.run;   // 外の画像は、プログラムを動かすときだけ 選べる（止めるときは、いつも読まない）
                runBtn.textContent = st.run ? "🛡 プログラムを止める" : "▶ プログラムを動かす";
                netBtn.textContent = st.net ? "🔒 外の画像を読まない" : "🌐 外の画像も読む";
                var tip = document.createElement("div");
                tip.className = "hnote";
                tip.textContent = "🛡 安全な枠の中で表示しています（ログイン情報には さわれません・外へのデータ送信は止めています）。" + (st.run ? "" : "プログラム（スクリプト）は 止めています。") + (st.run && st.net ? "" : "ほかのファイル・外の画像やデザインは 読みません。");
                main.appendChild(tip);
                main.appendChild(makeFrame(text, st.run, st.net));
                metaEl.textContent = "HTML のページ ・ 文字コード：" + label;
            }
            runBtn.onclick = function () { st.run = !st.run; draw(); };
            netBtn.onclick = function () { st.net = !st.net; draw(); };
            draw();
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
            img.addEventListener("error", mediaFail);
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
            m.addEventListener("error", mediaFail);
            main.textContent = ""; main.appendChild(m);
            saveBtn.hidden = false;
            saveBtn.addEventListener("click", function () { fetchAndSave(url.href); });
            return;
        }
        if (kind === "html") {
            showHtml(url, ext).catch(function () {
                fail("ファイルを読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。");
            });
            return;
        }
        if (kind === "text") {
            showText(url, ext).catch(function () {
                fail("ファイルを読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。");
            });
            return;
        }
        if (kind === "pptx") {
            showPptx(url).catch(function () {
                fail("ファイルを読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。");
            });
            return;
        }
        if (kind === "pdf") {
            showPdf(url).catch(function () {
                fail("ファイルを読み込めませんでした（リンクの期限が切れた可能性があります）。チャットを開き直して、もう一度お試しください。");
            });
            return;
        }
        // そのほか（docx・zip など）：ブラウザ標準の表示（右クリックや F12 を止められない）は使わず、ダウンロードだけにする
        note("このファイルは、この画面では表示しません。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。");
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
