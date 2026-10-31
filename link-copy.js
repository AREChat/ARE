"use strict";
// ===== リンクのコピー（パソコン・スマホ共通）=====
// 右クリック／長押しメニューを止めている画面でも、リンクをコピーできるように
//  ① メッセージの中の URL を リンクにして、となりに「📋コピー」ボタンを出す
//  ② ほかの画面のリンクにも「📋」ボタンをつける
//  ③ リンクの文字は 選べる（長押し・ドラッグ）ようにしておく
(function () {
    var URL_RE = /(https?:\/\/[^\s<>"'）)」』、。]+)/g;

    function toast(msg) {
        try {
            if (typeof window.showToast === "function") { window.showToast(msg); return; }
            if (window.AREFeatures && typeof window.AREFeatures.notify === "function") { window.AREFeatures.notify(msg); return; }
        } catch (_e) { /* 続行 */ }
        var box = document.getElementById("linkCopyToast");
        if (!box) {
            box = document.createElement("div"); box.id = "linkCopyToast"; box.setAttribute("role", "status");
            box.style.cssText = "position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#222;color:#fff;padding:8px 14px;border-radius:999px;font-size:14px;z-index:9999";
            document.body.appendChild(box);
        }
        box.textContent = msg; box.hidden = false; clearTimeout(box._t); box._t = setTimeout(function () { box.hidden = true; }, 2200);
    }

    function fallbackCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        var ok = false; try { ok = document.execCommand("copy"); } catch (_e) { ok = false; }
        ta.remove(); return ok;
    }

    function copyText(text) {
        function done(ok) { toast(ok ? "リンクをコピーしました 📋" : "コピーできませんでした。リンクの文字を選んでコピーしてください。"); }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
        } else { done(fallbackCopy(text)); }
    }

    function btn(url) {
        return '<button type="button" class="link-copy" data-copy="' + url.replace(/"/g, "&quot;") + '" aria-label="リンクをコピー" title="リンクをコピー">📋コピー</button>';
    }

    // ① メッセージ本文（エスケープ済みの文字列）の URL をリンクにする。タグの中は さわらない
    function linkify(escaped) {
        return String(escaped).split(/(<[^>]*>)/).map(function (part, i) {
            if (i % 2 === 1) return part;
            return part.replace(URL_RE, function (m) {
                var raw = m.replace(/&amp;/g, "&");
                if (/&(lt|gt|quot|#39);/.test(raw)) return m;
                var href = raw.replace(/"/g, "%22");
                return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="msg-link">' + m + '</a>' + btn(raw);
            });
        }).join("");
    }

    function hookText() {
        if (!window.AREText || window.AREText.__linkCopy) return !!(window.AREText && window.AREText.__linkCopy);
        var prev = window.AREText.format;
        window.AREText.format = function (escaped, item) {
            var out = typeof prev === "function" ? prev.call(this, escaped, item) : escaped;
            try { return linkify(out); } catch (_e) { return out; }
        };
        window.AREText.__linkCopy = true;
        return true;
    }

    // ② ほかの画面の リンクにも ボタンを つける
    function decorate(root) {
        var list = (root.querySelectorAll ? root.querySelectorAll('a[href^="http"]') : []);
        Array.prototype.forEach.call(list, function (a) {
            if (a.dataset.lcDone) return;
            a.dataset.lcDone = "1";
            if (a.querySelector("img,video") || a.hasAttribute("download") || a.classList.contains("file-card")) return;
            var n = a.nextElementSibling;
            if (n && n.classList && n.classList.contains("link-copy")) return;
            var url = a.href; if (!/^https?:/i.test(url)) return;
            a.insertAdjacentHTML("afterend", btn(url));
        });
    }

    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".link-copy");
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        copyText(b.getAttribute("data-copy") || "");
    }, true);

    // ④ リンクを クリック／タッチ したら、そのリンクを コピーして、同時に ひらく
    document.addEventListener("click", function (e) {
        if (e.button > 0) return;
        if (e.target && e.target.__lcSkip) return;
        var a = e.target.closest && e.target.closest("a[href]");
        if (!a || a.hasAttribute("download") || a.classList.contains("file-card") || a.closest(".link-copy")) return;
        var url = a.href; if (!/^https?:/i.test(url)) return;
        copyText(url);
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;   // 特別な押し方は ブラウザに まかせる
        e.preventDefault(); e.stopPropagation();
        try { var t = document.createElement("a"); t.href = url; t.target = "_blank"; t.rel = "noopener noreferrer"; t.style.display = "none"; t.dataset.lcDone = "1"; document.body.appendChild(t); t.__lcSkip = true; t.click(); t.remove(); }
        catch (_e) { try { window.open(url, "_blank"); } catch (_e2) { /* 何もしない */ } }
    }, true);

    // ⑤ 入力欄ではなく「メッセージの文字」の中の URL を、あとから リンクに かえる（ほかの機能が 表示を つくりなおしても だいじょうぶ）
    function linkifyDom(root) {
        var bubbles = root.querySelectorAll ? root.querySelectorAll(".bubble, .msg-text, .post-text, .board-text") : [];
        Array.prototype.forEach.call(bubbles, function (b) {
            var walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, {
                acceptNode: function (n) {
                    if (!n.nodeValue || n.nodeValue.indexOf("http") < 0) return NodeFilter.FILTER_REJECT;
                    var par = n.parentNode; if (par && par.closest && par.closest("a,button,textarea,script,style")) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(function (n) {
                var text = n.nodeValue; URL_RE.lastIndex = 0; if (!URL_RE.test(text)) return; URL_RE.lastIndex = 0;
                var frag = document.createDocumentFragment(), last = 0, m;
                while ((m = URL_RE.exec(text))) {
                    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                    var a = document.createElement("a"); a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer"; a.className = "msg-link"; a.textContent = m[0];
                    frag.appendChild(a);
                    var tmp = document.createElement("span"); tmp.innerHTML = btn(m[0]); frag.appendChild(tmp.firstChild);
                    last = m.index + m[0].length;
                }
                if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
                n.parentNode.replaceChild(frag, n);
            });
        });
    }

    var css = document.createElement("style");
    css.textContent = ".link-copy{margin-left:6px;padding:2px 8px;font-size:12px;line-height:1.4;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;cursor:pointer;vertical-align:baseline;opacity:.85}" +
        ".link-copy:hover{opacity:1}.msg-link,.bubble a{word-break:break-all;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;text-decoration:underline}.bubble{-webkit-user-select:text;user-select:text}";
    document.head.appendChild(css);

    var tries = 0;
    (function waitText() { if (hookText() || ++tries > 50) return; setTimeout(waitText, 200); })();

    var pending = false;
    new MutationObserver(function () {
        if (pending) return; pending = true;
        setTimeout(function () { pending = false; try { linkifyDom(document.body); } catch (_e) { /* 続行 */ } decorate(document.body); }, 120);
    }).observe(document.documentElement, {childList: true, subtree: true});
    try { linkifyDom(document.body || document.documentElement); } catch (_e) { /* 続行 */ }
    decorate(document.body || document.documentElement);
    window.AREFeaturesLinkCopy = {copy: copyText, linkify: linkify};
})();
