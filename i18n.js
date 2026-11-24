"use strict";
// ===== ARE 多言語エンジン（日本語 / English / 中文（简体）/ 한국어）。既定は日本語 =====
// ・全ページの最初に読み込む（<script src="i18n.js"></script>）。日本語のときは何もしない（辞書も読まない）。
// ・画面に出た日本語の文字（文・ボタン・placeholder・title・aria-label・alt・<title>）を、辞書で置き換える。
//   アプリ側のコードはそのまま。あとから画面に足された文字も、MutationObserver で拾って置き換える。
// ・辞書は lazy/i18n-<言語>.js に分けてあり、その言語を選んだときだけ読みこむ（AREI18N.add で登録される）。
// ・辞書のキー＝日本語の文（空白をつぶして比べる）。{n} のような {名前} を含むキーは「型」：数字や名前の部分を取り出して差し込む。
// ・先頭や末尾の絵文字・記号はそのまま残して、中身だけを辞書で引く（例：「💬 チャット」→「💬 Chats」）。
// ・ユーザーが書いた文章（メッセージ・名前・投稿）は置き換えない：.messages / [data-i18n-skip] / 入力欄は対象外。
// ・日付・数字の書き方（toLocaleString("ja-JP") など）も、選んだ言語に合わせる。
// ・辞書のつくり方：tools/build-i18n.js（i18n-src/*.tsv → lazy/i18n-*.js）。足りない文字は tools/i18n-scan.js で洗い出せる。

(function(){
    if(window.AREI18N) return;
    var LANGS = {
        ja: { name: "日本語", tag: "ja-JP", html: "ja" },
        en: { name: "English", tag: "en-US", html: "en" },
        zh: { name: "中文（简体）", tag: "zh-CN", html: "zh-CN" },
        ko: { name: "한국어", tag: "ko-KR", html: "ko" }
    };
    var DICT = { en: Object.create(null), zh: Object.create(null), ko: Object.create(null) };
    var PATS = { en: [], zh: [], ko: [] };
    var lang = readLang();
    var listeners = [];

    function readLang(){
        try{ var l = localStorage.getItem("are_lang"); if(l && LANGS[l]) return l; }catch(_e){}
        return "ja";
    }
    function norm(s){ return String(s).replace(/\s+/g, " ").trim(); }

    // ---- 辞書の登録（lazy/i18n-xx.js から呼ばれる） ----
    function add(code, map){
        if(!DICT[code]) return;
        var d = DICT[code], keys = Object.keys(map);
        for(var i = 0; i < keys.length; i++){
            var k = keys[i], v = map[k];
            if(/\{\w+\}/.test(k)){ PATS[code].push(compilePat(k, v)); }
            else d[unesc(norm(k))] = unesc(v);
        }
        if(code === lang) refresh();
    }
    function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    // 辞書の中で「そのままの { }」を書きたいときは \{ \}（build-i18n.js が U+E000 / U+E001 に直す）
    function unesc(s){ return s.replace(/\uE000/g, "{").replace(/\uE001/g, "}"); }
    function compilePat(key, val){
        var names = [], parts = norm(key).split(/(\{\w+\})/), rx = "^";
        for(var i = 0; i < parts.length; i++){
            var p = parts[i], m = /^\{(\w+)\}$/.exec(p);
            if(m){
                // {n} {n2} {y} {m} {d} {h} {s} は 数字だけ、{t} は 時刻（12:34）、それ以外（{name} {list} など）は 何でも
                names.push(m[1]);
                rx += /^(n\d*|y|m|d|h|s)$/.test(m[1]) ? "([\\d,.]+)" : m[1] === "t" ? "([\\d:]+)" : "(.+?)";
            } else rx += esc(unesc(p));
        }
        return { rx: new RegExp(rx + "$"), names: names, out: val, len: key.length };
    }

    // ---- 翻訳 ----
    // 先頭・末尾の「記号・絵文字・空白」と、中身に分ける
    var HEAD_ITEM = "[\\s\\u200b-\\u200f\\uFE0F\\u20E3・●○◎◆◇■□▶▷▼▲►◀☆★✓✔✕✖✗×＋+＊*\\-–—−|｜\\/／\\\\\\[\\]【】()（）「」『』<>〈〉《》～~…·•→←↑↓⇒＞>＜<※@#＃&＆%％$＄\\u2190-\\u21FF\\u2300-\\u23FF\\u2460-\\u27BF\\u2900-\\u2BFF\\u3000\\u{1F000}-\\u{1FAFF}\\u{E0020}-\\u{E007F}]";
    var TAIL_ITEM = "[\\s\\u200b-\\u200f\\uFE0F:：.。!！?？…・、,，;；\\-–—~～→←＞>）)\\]】」』\\u2190-\\u21FF\\u2300-\\u23FF\\u2460-\\u27BF\\u2900-\\u2BFF\\u3000\\u{1F000}-\\u{1FAFF}]";
    var EDGE = new RegExp("^(" + HEAD_ITEM + "*)([\\s\\S]*?)(" + TAIL_ITEM + "*)$", "u");
    var HAS_JA = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;

    function lookup(code, core){
        var d = DICT[code], v = d[core];
        if(v !== undefined) return v;
        var ps = PATS[code];
        for(var i = 0; i < ps.length; i++){
            var m = ps[ps.length - 1 - i].rx.exec(core);   // あとから足した型を先に試す
            if(m){
                var p = ps[ps.length - 1 - i], out = p.out;
                for(var j = 0; j < p.names.length; j++){
                    var cap = m[j + 1];
                    if(HAS_JA.test(cap)) cap = tr(cap, code);   // 差しこむ部分に日本語が残っていれば、それも訳す
                    out = out.split("{" + p.names[j] + "}").join(cap);
                }
                return unesc(out);
            }
        }
        return undefined;
    }
    function mapTail(tail, code){
        // 日本語の全角の区切りを、言語に合わせる（zh はそのまま）
        if(code === "zh") return tail;
        return tail.replace(/：/g, ":").replace(/。/g, ".").replace(/！/g, "!").replace(/？/g, "?").replace(/、/g, ",").replace(/，/g, ",").replace(/；/g, ";");
    }
    function tr(text, code){
        code = code || lang;
        if(code === "ja" || !text || !HAS_JA.test(text)) return text;
        var full = norm(text), hit = lookup(code, full);
        if(hit !== undefined) return keepSpace(text, hit);
        var m = EDGE.exec(text);
        if(m){
            var head = m[1] || "", core = m[2] || "", tail = m[3] || "";
            // 先頭の絵文字・記号だけを外した形（うしろの「）」などは残す）でも 引く：「📝 自分専用メモ（Keep）」
            if(head){
                var rest = text.slice(head.length), hr = lookup(code, norm(rest));
                if(hr !== undefined) return head + hr;
            }
            // うしろの記号は 1 文字ずつの集まりなので、正規表現が最短一致で食べ切れないことがある → 手でも削る
            if(core){
                var core2 = norm(core), h2 = lookup(code, core2);
                if(h2 !== undefined) return head + h2 + mapTail(tail, code);
                var t = /[：:。.!！?？…、,]+$/.exec(core2);
                if(t){ var h3 = lookup(code, core2.slice(0, t.index)); if(h3 !== undefined) return head + h3 + mapTail(t[0] + tail, code); }
            }
        }
        // 複数行：1 行ずつ
        if(text.indexOf("\n") >= 0){
            var lines = text.split("\n"), changed = false;
            var out = lines.map(function(l){ var r = tr(l, code); if(r !== l) changed = true; return r; });
            if(changed) return out.join("\n");
        }
        return text;
    }
    function keepSpace(orig, out){
        var a = /^\s*/.exec(orig)[0], b = /\s*$/.exec(orig)[0];
        return a + out + b;
    }
    function t(text, vars){
        var out = tr(text, lang);
        if(vars) Object.keys(vars).forEach(function(k){ out = out.split("{" + k + "}").join(vars[k]); });
        return out;
    }

    // ---- 画面の置き換え ----
    // 翻訳しない場所：ユーザーが書いた文章（data-i18n-skip を付けた場所）・コード・入力中の文字
    var SKIP_TEXT = "script,style,noscript,textarea,code,pre,[data-i18n-skip],.i18n-skip,[contenteditable=true],[contenteditable='']";
    var SKIP_ATTR = "[data-i18n-skip],.i18n-skip";
    var ATTRS = ["placeholder", "title", "aria-label", "alt", "aria-description", "data-title"];
    var nodeRec = new WeakMap(), attrRec = new WeakMap();
    var observer = null, timer = 0, busy = false, pending = new Set();

    function skippedText(el){
        try{ return !!(el && el.closest && el.closest(SKIP_TEXT)); }catch(_e){ return false; }
    }
    function skippedAttr(el){
        try{ return !!(el && el.closest && el.closest(SKIP_ATTR)); }catch(_e){ return false; }
    }
    function doText(node){
        var p = node.parentElement; if(!p || skippedText(p)) return;
        var rec = nodeRec.get(node), cur = node.nodeValue, orig = (rec && cur === rec.out) ? rec.orig : cur;
        var out = lang === "ja" ? orig : tr(orig, lang);
        if(out !== cur){ nodeRec.set(node, { orig: orig, out: out }); node.nodeValue = out; }
        else if(rec && lang === "ja"){ nodeRec.delete(node); }
        else if(!rec && HAS_JA.test(cur) && lang !== "ja"){ nodeRec.set(node, { orig: cur, out: cur }); }
    }
    function doAttrs(el){
        if(skippedAttr(el)) return;
        var rec = attrRec.get(el);
        for(var i = 0; i < ATTRS.length; i++){
            var a = ATTRS[i], cur = el.getAttribute(a); if(cur == null) continue;
            var r = rec && rec[a], orig = (r && cur === r.out) ? r.orig : cur;
            var out = lang === "ja" ? orig : tr(orig, lang);
            if(out !== cur){ if(!rec){ rec = {}; attrRec.set(el, rec); } rec[a] = { orig: orig, out: out }; el.setAttribute(a, out); }
        }
        // ボタンの value（type=button/submit/reset だけ。入力欄の value はユーザーのもの）
        if(el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type || "")){
            var v = el.getAttribute("value"); if(v != null){
                var r2 = rec && rec.value, o2 = (r2 && v === r2.out) ? r2.orig : v, out2 = lang === "ja" ? o2 : tr(o2, lang);
                if(out2 !== v){ if(!rec){ rec = {}; attrRec.set(el, rec); } rec.value = { orig: o2, out: out2 }; el.setAttribute("value", out2); }
            }
        }
    }
    // 文が タグ（<br> <b> など）で ぶつ切りになっている場所は、data-i18n-html を付けると「中身の html ぜんたい」を 1 つの文として 引く
    // （辞書の 日本語側にも、同じ html を 書く）。辞書に なければ、ふつうに 1 つずつの文字を 訳す。
    var htmlRec = new WeakMap();
    function doHtml(el){
        var rec = htmlRec.get(el), cur = el.innerHTML, orig = (rec && cur === rec.out) ? rec.orig : cur;
        if(lang === "ja"){ if(orig !== cur){ el.innerHTML = orig; } htmlRec.delete(el); return false; }
        var hit = lookup(lang, norm(orig));
        if(hit === undefined){ if(rec && orig !== cur){ el.innerHTML = orig; htmlRec.delete(el); } return false; }
        if(hit !== cur){ el.innerHTML = hit; }
        htmlRec.set(el, { orig: orig, out: hit });
        return true;
    }
    function walk(root){
        if(!root) return;
        if(root.nodeType === 3){ doText(root); return; }
        if(root.nodeType !== 1 && root.nodeType !== 11) return;
        if(root.nodeType === 1){ if(skippedText(root)) return; doAttrs(root); if(root.hasAttribute("data-i18n-html") && doHtml(root)) return; }
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode: function(n){
                if(n.nodeType === 1){ var tg = n.tagName; if(tg === "SCRIPT" || tg === "STYLE" || tg === "NOSCRIPT" || tg === "TEXTAREA" || tg === "CODE" || tg === "PRE" || n.hasAttribute("data-i18n-skip") || n.classList.contains("i18n-skip")) return NodeFilter.FILTER_REJECT; if(n.hasAttribute("data-i18n-html") && doHtml(n)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_SKIP; }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        // 要素の属性は FILTER_SKIP で見られないので、別に集める
        var els = (root.nodeType === 1 || root.nodeType === 11) ? root.querySelectorAll("[placeholder],[title],[aria-label],[alt],[aria-description],[data-title],input[type=button],input[type=submit],input[type=reset]") : [];
        var n; while((n = w.nextNode())) doText(n);
        for(var i = 0; i < els.length; i++) doAttrs(els[i]);
    }
    function doTitle(){
        try{
            var tt = document.querySelector("title"); if(tt && tt.firstChild){
                var rec = nodeRec.get(tt.firstChild), cur = tt.firstChild.nodeValue, orig = (rec && cur === rec.out) ? rec.orig : cur;
                var out = lang === "ja" ? orig : tr(orig, lang);
                if(out !== cur){ nodeRec.set(tt.firstChild, { orig: orig, out: out }); tt.firstChild.nodeValue = out; }
            }
        }catch(_e){}
    }
    function flush(){
        timer = 0; if(busy) return; busy = true;
        if(observer) observer.disconnect();
        try{
            var list = Array.from(pending); pending.clear();
            for(var i = 0; i < list.length; i++){ var n = list[i]; if(n.isConnected !== false) walk(n); }
        }catch(e){ try{ console.error("[AREI18N]", e); }catch(_e){} }
        if(observer) observe();
        busy = false;
        if(pending.size) schedule();
    }
    function schedule(){ if(!timer) timer = setTimeout(flush, 60); }
    function observe(){
        if(!observer || !document.documentElement) return;
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["value"]) });
    }
    function startObserver(){
        if(observer || lang === "ja") return;
        observer = new MutationObserver(function(muts){
            for(var i = 0; i < muts.length; i++){
                var m = muts[i];
                if(m.type === "childList"){ for(var j = 0; j < m.addedNodes.length; j++) pending.add(m.addedNodes[j]); }
                else if(m.type === "characterData"){ pending.add(m.target); }
                else if(m.type === "attributes"){ pending.add(m.target); }
            }
            schedule();
        });
        observe();
    }
    function refresh(){
        if(!document.documentElement) return;
        document.documentElement.setAttribute("lang", LANGS[lang].html);
        document.documentElement.setAttribute("data-lang", lang);
        if(lang === "ja"){
            walkAllOnce();   // 訳していた文字を、もとの日本語にもどす
            if(observer){ observer.disconnect(); observer = null; }
            return;
        }
        startObserver();
        walkAllOnce();
    }
    function walkAllOnce(){
        if(observer) observer.disconnect();
        try{ doTitle(); walk(document.body || document.documentElement); }catch(e){ try{ console.error("[AREI18N]", e); }catch(_e){} }
        if(observer) observe();
    }

    // ---- 辞書の読みこみ ----
    var loaded = {}, loading = {};
    var BASE = "./";
    try{ if(document.currentScript && document.currentScript.src) BASE = document.currentScript.src.replace(/[^\/]*$/, ""); }catch(_e){}
    function scriptUrl(code){ return BASE + "lazy/i18n-" + code + ".js"; }
    function load(code, cb){
        if(code === "ja" || loaded[code]){ cb && cb(); return; }
        if(loading[code]){ loading[code].push(cb); return; }
        loading[code] = [cb];
        var s = document.createElement("script"); s.src = scriptUrl(code); s.async = true;
        s.onload = s.onerror = function(){ loaded[code] = true; var cbs = loading[code] || []; delete loading[code]; cbs.forEach(function(f){ try{ f && f(); }catch(_e){} }); };
        (document.head || document.documentElement).appendChild(s);
    }

    // ---- 日付・数字の書き方を言語に合わせる ----
    function patchLocale(){
        var wrap = function(proto, name){
            var orig = proto[name]; if(typeof orig !== "function" || orig.__are) return;
            var f = function(loc){
                if(lang !== "ja" && (loc === "ja-JP" || loc === "ja")){ var a = Array.prototype.slice.call(arguments); a[0] = LANGS[lang].tag; return orig.apply(this, a); }
                return orig.apply(this, arguments);
            };
            f.__are = true; proto[name] = f;
        };
        ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].forEach(function(n){ wrap(Date.prototype, n); });
        wrap(Number.prototype, "toLocaleString");
    }

    // ---- 言語の切りかえ ----
    function set(code, opts){
        if(!LANGS[code]) code = "ja";
        var changed = code !== lang;
        lang = code;
        try{ if(typeof prefSet === "function") prefSet("are_lang", code); else localStorage.setItem("are_lang", code); }catch(_e){}
        load(code, function(){
            refresh();
            if(changed) listeners.forEach(function(f){ try{ f(code); }catch(_e){} });
            var sel = document.getElementById("areLangPick"); if(sel) sel.value = code;
        });
    }

    // ---- どのページにも出す、小さな言語えらび（チャット画面は設定の中にあるので出さない） ----
    function mountPicker(){
        if(document.getElementById("areLangPick") || !document.body) return;
        if(document.documentElement.hasAttribute("data-i18n-nopicker")) return;
        var wrap = document.createElement("div"); wrap.id = "areLangWrap"; wrap.setAttribute("data-i18n-skip", "");
        wrap.style.cssText = "position:fixed;bottom:calc(10px + env(safe-area-inset-bottom,0px));right:10px;z-index:2147483000;display:flex;align-items:center;gap:4px;background:rgba(20,20,30,.72);color:#fff;border-radius:999px;padding:4px 8px 4px 10px;font:600 13px system-ui,sans-serif;backdrop-filter:blur(6px)";
        var ic = document.createElement("span"); ic.textContent = "🌐"; ic.setAttribute("aria-hidden", "true");
        var sel = document.createElement("select"); sel.id = "areLangPick"; sel.setAttribute("aria-label", "Language / 言語 / 语言 / 언어");
        sel.style.cssText = "background:transparent;color:#fff;border:0;font:inherit;max-width:9em;cursor:pointer";
        Object.keys(LANGS).forEach(function(k){ var o = document.createElement("option"); o.value = k; o.textContent = LANGS[k].name; o.style.color = "#000"; if(k === lang) o.selected = true; sel.appendChild(o); });
        sel.addEventListener("change", function(){ set(sel.value); });
        wrap.appendChild(ic); wrap.appendChild(sel); document.body.appendChild(wrap);
    }

    // ---- alert / confirm / prompt の文も訳す ----
    function patchDialogs(){
        ["alert", "confirm", "prompt"].forEach(function(n){
            var o = window[n]; if(typeof o !== "function" || o.__are) return;
            var f = function(msg){ var a = Array.prototype.slice.call(arguments); if(lang !== "ja" && typeof a[0] === "string") a[0] = tr(a[0], lang); return o.apply(window, a); };
            f.__are = true; window[n] = f;
        });
    }

    // ---- 起動 ----
    function boot(){
        patchLocale(); patchDialogs();
        if(lang === "ja"){ document.documentElement.setAttribute("lang", "ja"); document.documentElement.setAttribute("data-lang", "ja"); }
        else{
            load(lang, function(){ refresh(); });
            // 日本語のまま見えてしまう時間をへらすため、読みこみ前でも lang 属性は先に切りかえる
            document.documentElement.setAttribute("lang", LANGS[lang].html); document.documentElement.setAttribute("data-lang", lang);
        }
        var go = function(){ mountPicker(); if(lang !== "ja") { startObserver(); } };
        if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
    }

    window.AREI18N = {
        LANGS: LANGS,
        get lang(){ return lang; },
        get tag(){ return LANGS[lang].tag; },
        t: t, tr: tr, add: add, set: set, load: load, refresh: refresh, mountPicker: mountPicker,
        onChange: function(f){ listeners.push(f); },
        _dict: DICT, _pats: PATS
    };
    boot();
})();
