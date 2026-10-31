"use strict";
// ===== ARE 共通：設定(T023)・エラーの記録(T028)・アプリとして入れる案内(T033) =====
// すべて この端末の中だけで 動きます（サーバーには何も送りません）。
(function(){
  const KEY = "are_settings", ELOG = "are_errlog";
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(_e){ return d; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(_e){} };
  let cfg = {big:false, calm:false, mute:false, hc:0, saver:false, vib:true};
  try{ Object.assign(cfg, JSON.parse(lsGet(KEY, "{}"))); }catch(_e){}
  const save = () => lsSet(KEY, JSON.stringify(cfg));
  window.AREsettings = {get: () => Object.assign({}, cfg)};

  // ---- 設定を 反映 ----
  const css = document.createElement("style");
  css.textContent =
    "body.are-calm *,body.are-calm *::before,body.are-calm *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}" +
    "body.are-big #msg,body.are-big #dlgText,body.are-big .dialog,body.are-big .card,body.are-big .meta,body.are-big #log,body.are-big .log,body.are-big .modal p{font-size:larger!important}" +
    "body.are-hc1{filter:contrast(1.25) saturate(1.1)}body.are-hc2{filter:contrast(1.35) saturate(1.5) brightness(1.05)}" +
    "#areGear{position:fixed;left:6px;bottom:6px;z-index:2147483000;width:34px;height:34px;border-radius:50%;border:1px solid #8fb4ff;background:rgba(10,18,60,.75);color:#fff;font-size:18px;line-height:1;padding:0;opacity:.55}" +
    "#areGear:hover,#areGear:focus{opacity:1}" +
    "#arePanel{position:fixed;left:6px;bottom:46px;z-index:2147483001;width:min(300px,calc(100vw - 20px));background:#0b1230;color:#eef1ff;border:1px solid #8fb4ff;border-radius:12px;padding:12px;font:14px/1.6 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)}" +
    "#arePanel h3{margin:0 0 6px;font-size:15px;color:#ffd86b}#arePanel button{font:inherit;color:#fff;background:#1a2fa8;border:1px solid #8fb4ff;border-radius:8px;padding:4px 10px;margin:2px 4px 2px 0}" +
    "#arePanel .off{background:#2a3050}#arePanel small{opacity:.75;display:block}";
  document.head.appendChild(css);
  function apply(){
    const b = document.body; if(!b) return;
    b.classList.toggle("are-big", !!cfg.big); b.classList.toggle("are-calm", !!cfg.calm || !!cfg.saver);
    b.classList.remove("are-hc1", "are-hc2"); if(cfg.hc) b.classList.add("are-hc" + cfg.hc);
    document.querySelectorAll("img:not([loading])").forEach((i) => { i.loading = "lazy"; });
    try{ document.querySelectorAll("audio,video").forEach((m) => { m.muted = !!cfg.mute; }); }catch(_e){}
    if(cfg.mute){ try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_e){} }
  }
  // 音を消す：あとから鳴らす音にも 効くように
  try{
    const op = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){ if(cfg.mute) this.muted = true; return op.apply(this, arguments); };
    if(window.speechSynthesis){ const os = window.speechSynthesis.speak.bind(window.speechSynthesis); window.speechSynthesis.speak = (u) => { if(!cfg.mute) os(u); }; }
  }catch(_e){}

  // 音量の 上限（とつぜんの 大音量を ふせぐ）
  try{
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
    if(d && d.set) Object.defineProperty(HTMLMediaElement.prototype, "volume", {get: d.get, set(v){ d.set.call(this, Math.min(Number(v) || 0, 0.85)); }, configurable:true});
  }catch(_e){}
  // ふるえ（バイブ）：ゲームから AREvib(ms) で よぶ。⚙でオフにできる
  window.AREvib = (ms) => { try{ if(cfg.vib && !cfg.saver && navigator.vibrate) navigator.vibrate(ms || 30); }catch(_e){} };
  // ---- 読み込み時間の きろく ----
  window.addEventListener("load", () => { setTimeout(() => { try{ const n = performance.getEntriesByType("navigation")[0]; if(n) lsSet("are_perf", JSON.stringify({p:location.pathname, ms:Math.round(n.loadEventEnd), t:new Date().toISOString().slice(0, 16)})); }catch(_e){} }, 0); });
  // ---- エラーの記録（この端末だけ・1日20件まで）----
  function today(){ return new Date().toISOString().slice(0, 10); }
  function logErr(msg, where){
    try{
      let L = JSON.parse(lsGet(ELOG, "[]")); if(!Array.isArray(L)) L = [];
      const d = today(), n = L.filter((x) => x.d === d).length; if(n >= 20) return;
      const m = String(msg || "").slice(0, 300), w = String(where || "").slice(0, 160);
      if(L.some((x) => x.m === m && x.w === w && x.d === d)) return;
      L.push({d, t:new Date().toISOString(), m, w, u:location.pathname}); lsSet(ELOG, JSON.stringify(L.slice(-50)));
    }catch(_e){}
  }
  window.addEventListener("error", (e) => logErr(e.message, (e.filename || "").split("/").slice(-2).join("/") + ":" + e.lineno));
  window.addEventListener("unhandledrejection", (e) => logErr("promise: " + (e.reason && e.reason.message || e.reason), ""));
  const errText = () => { let L = []; try{ L = JSON.parse(lsGet(ELOG, "[]")); }catch(_e){} return "ARE エラー記録\n端末: " + navigator.userAgent + "\n画面: " + innerWidth + "x" + innerHeight + "\n" + L.map((x) => x.t + " " + x.u + " " + x.m + " (" + x.w + ")").join("\n"); };

  // ---- アプリとして入れる ----
  let dip = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); dip = e; });


  // ---- セーブの 書き出し / 読み込み（ファイル）----
  function savePrefix(){
    const p = location.pathname;
    if(/\/game2\//.test(p)) return ["areq2_"]; if(/\/game3\//.test(p)) return ["areq3_"]; if(/\/game4\//.test(p)) return ["areq4_"]; if(/\/game6\//.test(p)) return ["game6-"]; if(/\/game\//.test(p)) return ["tq_save_", "tq_settings"];
    return [];
  }
  function exportSave(){
    const pre = savePrefix(), items = {};
    try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(pre.some((x) => k.indexOf(x) === 0)) items[k] = localStorage.getItem(k); } }catch(_e){}
    if(!Object.keys(items).length) return false;
    const blob = new Blob([JSON.stringify({app:"ARE-save", ver:1, at:new Date().toISOString(), path:location.pathname, items})], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ARE-save-" + (location.pathname.split("/").filter(Boolean).slice(-2, -1)[0] || "game") + ".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return true;
  }
  function importSave(file, done){
    const pre = savePrefix(), r = new FileReader();
    r.onload = () => {
      try{
        const d = JSON.parse(String(r.result));
        if(!d || d.app !== "ARE-save" || !d.items || typeof d.items !== "object") return done("ARE のセーブファイルでは ありません。");
        const keys = Object.keys(d.items).filter((k) => pre.some((x) => k.indexOf(x) === 0) && typeof d.items[k] === "string");
        if(!keys.length) return done("このゲームの セーブが 入っていません。");
        for(const k of keys){ JSON.parse(d.items[k]); }   // こわれた データを はじく
        if(!confirm("いまの セーブを " + keys.length + "件 上書きします。よろしいですか？")) return done("やめました。");
        keys.forEach((k) => localStorage.setItem(k, d.items[k]));
        done("読み込みました。ページを 更新します…"); setTimeout(() => location.reload(), 800);
      }catch(_e){ done("読み込めませんでした（ファイルが こわれています）。"); }
    };
    r.onerror = () => done("ファイルを 読めませんでした。"); r.readAsText(file);
  }

  const base = () => location.pathname.replace(/\/(game|game2|game3|game4|game6)\/.*$/, "/");
  let VER = ""; try{ fetch(location.pathname.replace(/\/(game|game2|game3|game4|game6)\/.*$/, "/") + "version.json", {cache:"no-cache"}).then((r) => r.ok ? r.json() : null).then((v) => { if(v) VER = v.version; }).catch(() => {}); }catch(_e){}
  // ---- 画面 ----
  function build(){
    if(!document.body || document.getElementById("areGear")) return;
    const g = document.createElement("button"); g.id = "areGear"; g.type = "button"; g.setAttribute("aria-label", "共通せってい"); g.textContent = "⚙"; document.body.appendChild(g);
    let p = null;
    const close = () => { if(p){ p.remove(); p = null; } };
    const paint = () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      let n = 0; try{ n = JSON.parse(lsGet(ELOG, "[]")).length; }catch(_e){}
      p.innerHTML = "<h3>⚙ 共通せってい</h3>" +
        '<button type="button" data-k="big" class="' + (cfg.big ? "" : "off") + '">文字を大きく：' + (cfg.big ? "オン" : "オフ") + "</button>" +
        '<button type="button" data-k="calm" class="' + (cfg.calm ? "" : "off") + '">動きを へらす：' + (cfg.calm ? "オン" : "オフ") + "</button>" +
        '<button type="button" data-k="mute" class="' + (cfg.mute ? "" : "off") + '">音を 消す：' + (cfg.mute ? "オン" : "オフ") + "</button>" +
        '<button type="button" data-k="hc">色の見やすさ：' + ["ふつう", "くっきり", "とてもくっきり"][cfg.hc || 0] + "</button>" +
        '<button type="button" data-k="saver" class="' + (cfg.saver ? "" : "off") + '">省エネ・省データ：' + (cfg.saver ? "オン" : "オフ") + "</button>" +
        '<button type="button" data-k="vib" class="' + (cfg.vib ? "" : "off") + '">ふるえ：' + (cfg.vib ? "オン" : "オフ") + "</button>" +
        "<hr style='border-color:#334'><div><b>アプリとして入れる</b>" + (dip ? '<br><button type="button" data-k="inst">ホームに 追加する</button>' : "<small>" + (ios ? "Safariの「共有」→「ホーム画面に追加」で 入れられます。" : "ブラウザのメニューの「インストール」または「ホーム画面に追加」で 入れられます。") + "</small>") + "</div>" +
        (savePrefix().length ? "<hr style='border-color:#334'><div><b>セーブの お引っこし</b><small>べつの 端末へ うつすときに つかいます。</small><button type=\"button\" data-k=\"exp\">📤 書き出す</button><button type=\"button\" data-k=\"imp\">📥 読み込む</button><small id=\"areSaveMsg\"></small></div>" : "") + "<hr style='border-color:#334'><div><b>うまく動かないとき</b><small><a href=\"" + base() + "guide.html\" style=\"color:#9fd0ff\" target=\"_blank\" rel=\"noopener\">あそびかた</a>　<a href=\"" + base() + "faq.html\" style=\"color:#9fd0ff\" target=\"_blank\" rel=\"noopener\">よくある質問</a>　" + (VER ? "版 " + VER : "") + "</small><small>エラーの記録：" + n + "件（この端末の中だけ）</small>" +
        '<button type="button" data-k="copy">記録を コピー</button><button type="button" data-k="issue">GitHubで 報告</button><button type="button" data-k="clr" class="off">記録を 消す</button></div>' +
        '<div style="text-align:right"><button type="button" data-k="x" class="off">とじる</button></div>';
    };
    g.addEventListener("click", () => { if(p){ close(); return; } p = document.createElement("div"); p.id = "arePanel"; document.body.appendChild(p); paint(); });
    document.addEventListener("click", (e) => {
      const k = e.target && e.target.dataset && e.target.dataset.k; if(!k || !p || !p.contains(e.target)) return;
      if(k === "big" || k === "calm" || k === "mute" || k === "saver" || k === "vib"){ cfg[k] = !cfg[k]; save(); apply(); paint(); }
      else if(k === "hc"){ cfg.hc = ((cfg.hc || 0) + 1) % 3; save(); apply(); paint(); }
      else if(k === "x") close();
      else if(k === "inst" && dip){ dip.prompt(); dip = null; paint(); }
      else if(k === "copy"){ const t = errText(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { e.target.textContent = "コピーしました"; }).catch(() => { e.target.textContent = "コピーできません"; }); }
      else if(k === "issue"){ const t = errText().slice(0, 1500); const a = document.createElement("a"); a.href = "https://github.com/arechat/ARE/issues/new?title=" + encodeURIComponent("不具合の報告 " + location.pathname) + "&body=" + encodeURIComponent(t); a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
      else if(k === "exp"){ const m = document.getElementById("areSaveMsg"); if(m) m.textContent = exportSave() ? "ファイルを 保存しました。" : "書き出せる セーブが ありません。"; }
      else if(k === "imp"){ const f = document.createElement("input"); f.type = "file"; f.accept = "application/json,.json"; f.onchange = () => { if(f.files[0]) importSave(f.files[0], (t) => { const m = document.getElementById("areSaveMsg"); if(m) m.textContent = t; }); }; f.click(); }
      else if(k === "clr"){ lsSet(ELOG, "[]"); paint(); }
    });
    apply();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
  setTimeout(apply, 1500);
})();
