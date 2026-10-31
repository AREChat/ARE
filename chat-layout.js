"use strict";
// ===== チャットの 見やすさ（画面の広さに あわせて じどうで調整＋自分で かえられる）=====
// ・メッセージの はば／左のリストの はば／文字の大きさ を えらべます（このブラウザに 保存）
// ・「じどう」は スマホ・タブレット・パソコンで ちょうどよい 大きさに します
(function () {
    var KEY = "are_layout_v1";
    var DEF = {msg: "auto", side: "auto", font: "auto"};
    var MSG = {auto: "じどう", narrow: "せまい", normal: "ふつう", wide: "ひろい", full: "いっぱい"};
    var SIDE = {auto: "じどう", narrow: "せまい", normal: "ふつう", wide: "ひろい"};
    var FONT = {auto: "じどう", s: "小", m: "中", l: "大", xl: "とても大"};

    function load() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_e) { return Object.assign({}, DEF); } }
    function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_e) { /* 保存できなくても 動く */ } }
    var cfg = load();

    function kind() { var w = window.innerWidth; return w <= 700 ? "phone" : (w < 1100 ? "tablet" : (w < 1600 ? "pc" : "wide")); }

    function msgMax(k) {
        var m = cfg.msg;
        if (m === "narrow") return "min(70%,460px)";
        if (m === "normal") return "min(82%,700px)";
        if (m === "wide") return "min(90%,1000px)";
        if (m === "full") return "96%";
        return {phone: "92%", tablet: "min(84%,680px)", pc: "min(80%,820px)", wide: "min(78%,1000px)"}[k];
    }
    function sideW(k) {
        var s = cfg.side; if (s === "narrow") return "240px"; if (s === "normal") return "320px"; if (s === "wide") return "420px";
        return {phone: "", tablet: "260px", pc: "340px", wide: "400px"}[k];
    }
    function fontScale(k) {
        var f = cfg.font; if (f === "s") return .9; if (f === "m") return 1; if (f === "l") return 1.15; if (f === "xl") return 1.32;
        return {phone: 1.02, tablet: 1.05, pc: 1, wide: 1.1}[k];
    }

    var st = document.createElement("style"); st.id = "areLayoutCss"; document.head.appendChild(st);
    function apply() {
        var k = kind(), css = "";
        css += ".message-row{max-width:" + msgMax(k) + "!important}";
        css += ".bubble,.composer textarea{font-size:calc(1em*" + fontScale(k) + ")!important}";
        var sw = sideW(k);
        if (sw && k !== "phone") {
            var rail = k === "pc" || k === "wide" ? (k === "wide" ? "76px" : "76px") : "64px";
            css += "@media(min-width:701px){.app{grid-template-columns:" + rail + " " + sw + " minmax(0,1fr)!important}}";
        }
        if (k === "wide" || k === "pc") css += ".messages{padding-left:clamp(20px,4vw,72px)!important;padding-right:clamp(20px,4vw,72px)!important}";
        st.textContent = css;
        document.documentElement.setAttribute("data-device", k);
    }

    function sel(id, label, map, cur) {
        return '<label style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px 0">' + label +
            '<select id="' + id + '" class="status-select" style="max-width:none;min-width:120px">' +
            Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + map[k] + "</option>"; }).join("") + "</select></label>";
    }
    function openPanel() {
        var old = document.getElementById("areLayoutPanel"); if (old) { old.remove(); return; }
        var p = document.createElement("div"); p.id = "areLayoutPanel"; p.setAttribute("role", "dialog");
        p.style.cssText = "position:fixed;right:12px;top:70px;z-index:9998;width:min(92vw,330px);background:#17213a;color:#e9edf5;border:1px solid #405b9c;border-radius:14px;padding:14px 16px;box-shadow:0 12px 40px #000a;font-size:14px";
        p.innerHTML = '<b>🖥 画面の見やすさ</b><div style="opacity:.75;font-size:12px;margin:4px 0 6px">いまの画面：' + {phone: "スマホ", tablet: "タブレット", pc: "パソコン", wide: "大きい画面"}[kind()] + '（「じどう」で ちょうどよく なります）</div>' +
            sel("alMsg", "メッセージの はば", MSG, cfg.msg) + sel("alSide", "左の リストの はば", SIDE, cfg.side) + sel("alFont", "文字の 大きさ", FONT, cfg.font) +
            '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button type="button" id="alReset" class="button-secondary">もとに もどす</button><button type="button" id="alClose" class="button">とじる</button></div>';
        document.body.appendChild(p);
        function chg() { cfg = {msg: p.querySelector("#alMsg").value, side: p.querySelector("#alSide").value, font: p.querySelector("#alFont").value}; save(cfg); apply(); }
        ["alMsg", "alSide", "alFont"].forEach(function (id) { p.querySelector("#" + id).addEventListener("change", chg); });
        p.querySelector("#alReset").addEventListener("click", function () { cfg = Object.assign({}, DEF); save(cfg); apply(); p.remove(); openPanel(); });
        p.querySelector("#alClose").addEventListener("click", function () { p.remove(); });
    }
    function addButton() {
        var h = document.querySelector(".chat-header"); if (!h || document.getElementById("layoutBtn")) return !!h;
        var b = document.createElement("button"); b.type = "button"; b.id = "layoutBtn"; b.className = "button-secondary"; b.title = "画面の見やすさ"; b.setAttribute("aria-label", "画面の見やすさ"); b.textContent = "🖥";
        b.addEventListener("click", openPanel);
        var anchor = document.getElementById("searchBtn"); if (anchor) h.insertBefore(b, anchor); else h.appendChild(b);
        return true;
    }
    apply(); addEventListener("resize", apply); addEventListener("orientationchange", function () { setTimeout(apply, 200); });
    var n = 0; (function wait() { if (addButton() || ++n > 40) return; setTimeout(wait, 250); })();
})();
