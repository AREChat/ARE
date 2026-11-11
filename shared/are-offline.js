/* ARE オフライン対応: サービスワーカー登録 / 右上の「Wi-Fi必須」表示 / オフライン用ダウンロード */
(function(){
  "use strict";
  var cs = document.currentScript, SRC = cs && cs.src ? cs.src : location.href;
  var ROOT = new URL("../", SRC).href;
  var path = location.pathname, base = path.split("/").pop() || "index.html"; try{ base = decodeURIComponent(base); }catch(_e){}
  // ネットが ないと 動かない ページ（アカウント・チャット・管理・ウイルス図鑑など）
  var NEED = /^(chat|login|register|recovery|admin|virus)\.html$/.test(base) && path.indexOf(ROOT.replace(location.origin, "")) === 0 && path.replace(ROOT.replace(location.origin, ""), "").indexOf("/") < 0;
  var rootPath = ROOT.replace(location.origin, ""), rel = path.indexOf(rootPath) === 0 ? path.slice(rootPath.length) : path.replace(/^\//, "");
  var HUB = rel === "" || rel === "index.html" || rel === "login.html" || /^(game|game2|game3|game4|game5|dream-frontier|daifugo)\/(index\.html)?$/.test(rel);   // 入口・ゲームのタイトルだけ（ブロックなど あそぶ画面には 出さない）
  function ls(k, v){ try{ if(v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(_e){} return null; }

  // ---- サービスワーカー ----
  if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")){
    window.addEventListener("load", function(){ try{ navigator.serviceWorker.register(ROOT + "sw.js", {scope: ROOT}).catch(function(){}); }catch(_e){} });
  }

  // ---- 右上の表示 ----
  var badge = null;
  function paint(){
    if(!document.body) return;
    var off = navigator.onLine === false;
    if(!NEED && !off){ if(badge){ badge.remove(); badge = null; } return; }
    if(!badge){
      badge = document.createElement("div"); badge.id = "areNetBadge"; badge.setAttribute("role", "status"); badge.setAttribute("aria-live", "polite");
      badge.style.cssText = "position:fixed;top:max(6px,env(safe-area-inset-top));right:max(6px,env(safe-area-inset-right));z-index:2147483000;pointer-events:none;font:700 12px/1.3 system-ui,sans-serif;padding:4px 10px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.35);max-width:70vw";
      document.body.appendChild(badge);
    }
    if(NEED){
      var lg = base === "login.html";
      badge.textContent = lg ? (off ? "📶 ログインは Wi-Fi必須（ゲームは このまま OK）" : "📶 ログイン・チャットは Wi-Fi必須") : (off ? "📶 Wi-Fi必須（いま つながっていません）" : "📶 Wi-Fi必須");
      badge.style.background = off ? "#c62828" : "#ffb300"; badge.style.color = off ? "#fff" : "#2b1b00";
      // チャット画面では、つながっているときは数秒で消す（上のボタンと重なるため）。つながらないときは出したままにする
      clearTimeout(badge._t); badge.style.display = "";
      if(base === "chat.html" && !off) badge._t = setTimeout(function(){ if(badge) badge.style.display = "none"; }, 5000);
    }else{
      badge.textContent = "✈ オフライン中（このまま あそべます）";
      badge.style.background = "#455a64"; badge.style.color = "#fff";
    }
  }
  window.addEventListener("online", paint); window.addEventListener("offline", paint);

  // ---- オフライン用ダウンロード ----
  var panel = null, running = false, cancel = false;
  function mb(n){ return Math.round(n / 1048576) + "MB"; }
  async function loadList(){ var r = await fetch(ROOT + "precache.json", {cache: "no-cache"}); if(!r.ok) throw new Error("list"); return r.json(); }
  async function run(kind, out, bar){
    running = true; cancel = false;
    try{
      var data = await loadList();
      var files = data.image.concat(kind === "all" ? data.audio : []);
      var c = await caches.open("are-media"), todo = [];
      for(var i = 0; i < files.length; i++){ var u = new URL(files[i], ROOT).href; if(!(await c.match(u))) todo.push(u); }
      if(!todo.length){ out.textContent = "もう ぜんぶ 保存ずみです。ネットが なくても あそべます。"; ls("are-off-done", data.v + ":" + kind); running = false; return; }
      try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(_e){}
      var done = 0, fail = 0, k = 0;
      async function worker(){
        while(k < todo.length && !cancel){
          var url = todo[k++];
          try{ var res = await fetch(url); if(res && res.status === 200) await c.put(url, res); else fail++; }
          catch(e){ fail++; if(e && e.name === "QuotaExceededError"){ cancel = true; out.textContent = "端末の あき容量が たりません。"; } }
          done++; bar.value = done; bar.max = todo.length; if(!cancel) out.textContent = "保存中… " + done + " / " + todo.length;
        }
      }
      bar.hidden = false; bar.value = 0; bar.max = todo.length;
      await Promise.all([worker(), worker(), worker()]);
      if(cancel){ if(!/容量/.test(out.textContent)) out.textContent = "とちゅうで やめました（つづきは また 押せば 再開）。"; }
      else if(fail){ out.textContent = "保存できなかったものが " + fail + " 件。もう一度 押すと つづきから やります。"; }
      else { out.textContent = "✅ 保存できました！ ネットが なくても あそべます。"; ls("are-off-done", data.v + ":" + kind); }
    }catch(e){ out.textContent = "いま ダウンロードできません（ネットを 確認してね）。"; }
    running = false;
  }
  async function open(){
    if(panel){ panel.remove(); panel = null; return; }
    var sizes = {image: 0, audio: 0}, ok = false;
    try{ var d = await loadList(); sizes.image = d.bytes.image; sizes.audio = d.bytes.audio; ok = true; }catch(_e){}
    panel = document.createElement("div"); panel.id = "areOffPanel";
    panel.style.cssText = "position:fixed;left:50%;bottom:max(46px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483001;width:min(92vw,380px);background:#10162e;color:#fff;border:1px solid #6b7cff;border-radius:14px;padding:14px;font:14px/1.6 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.55)";
    var h = document.createElement("div"); h.style.cssText = "font-weight:800;margin-bottom:6px"; h.textContent = "📥 ネットが ない家でも あそぶ準備";
    var p = document.createElement("div"); p.style.cssText = "font-size:12px;opacity:.9"; p.textContent = "Wi-Fi の あるところで 1回だけ 保存すると、あとは オフラインで あそべます。（チャット・ログインなどは Wi-Fi が 必要です）";
    var out = document.createElement("div"); out.style.cssText = "margin:8px 0;min-height:1.4em;font-size:13px";
    var bar = document.createElement("progress"); bar.hidden = true; bar.style.cssText = "width:100%";
    var b1 = btn("画像だけ（約" + mb(sizes.image) + "）", function(){ if(!running) run("img", out, bar); });
    var b2 = btn("音楽も ぜんぶ（約" + mb(sizes.image + sizes.audio) + "）", function(){ if(!running) run("all", out, bar); });
    var b3 = btn("とじる", function(){ cancel = true; panel.remove(); panel = null; ls("are-off-hide", "1"); var f = document.getElementById("areOffFab"); if(f) f.remove(); });
    b3.style.background = "#37405f";
    if(!ok){ out.textContent = "いまは 一覧を 読めません（ネットを 確認してね）。"; }
    else { var done = ls("are-off-done"); if(done) out.textContent = "前回の 保存: " + (/:all$/.test(done) ? "音楽ふくむ ぜんぶ" : "画像まで") + "（更新が あれば もう一度 押してね）"; }
    panel.append(h, p, out, bar, b1, b2, b3); document.body.appendChild(panel);
  }
  function btn(t, fn){ var b = document.createElement("button"); b.type = "button"; b.textContent = t; b.style.cssText = "display:block;width:100%;margin:6px 0 0;padding:10px;border:0;border-radius:10px;background:#3d5afe;color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer"; b.onclick = fn; return b; }
  function fab(){
    if(!HUB || NEED || document.getElementById("areOffFab") || ls("are-off-hide") === "1" || !("caches" in window)) return;
    var b = document.createElement("button"); b.id = "areOffFab"; b.type = "button"; b.textContent = "📥 オフライン準備";
    b.style.cssText = "position:fixed;left:max(6px,env(safe-area-inset-left));bottom:max(6px,env(safe-area-inset-bottom));z-index:2147483000;padding:6px 12px;border:1px solid #6b7cff;border-radius:999px;background:rgba(16,22,46,.9);color:#fff;font:700 12px system-ui,sans-serif;cursor:pointer";
    b.onclick = open; document.body.appendChild(b);
    // ゲームの ボタン（⚙ 共通せってい・出す・パス など）の上に のらないよう、空いている角へ動かす。4つの角がぜんぶ ふさがっていたら かくす
    // （ふつうの ページでは、スクロールで ずらせる 本文には かまわず、画面に はりついた ボタンだけを よける）
    var CORNERS = [["left", "bottom"], ["right", "bottom"], ["right", "top"], ["left", "top"]], cur = 0, timer = 0;
    function put(c){ b.style.left = b.style.right = b.style.top = b.style.bottom = "auto"; b.style[c[0]] = "max(6px,env(safe-area-inset-" + c[0] + "))"; b.style[c[1]] = "max(6px,env(safe-area-inset-" + c[1] + "))"; }
    function pinned(e){ for(var n = e; n && n.nodeType === 1; n = n.parentElement){ var p = getComputedStyle(n).position; if(p === "fixed" || p === "sticky") return true; } return false; }
    function hits(){
      var r = b.getBoundingClientRect(), scrolls = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 24;
      var list = document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"],#hud,#hudr');
      for(var i = 0; i < list.length; i++){
        var e = list[i]; if(e === b || (panel && panel.contains(e))) continue;
        var q = e.getBoundingClientRect();
        if(q.width < 4 || q.height < 4 || q.left >= r.right - 2 || q.right <= r.left + 2 || q.top >= r.bottom - 2 || q.bottom <= r.top + 2) continue;
        var cs = getComputedStyle(e);
        if(cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        if(cs.pointerEvents === "none" && !/^hud/.test(e.id)) continue;
        if(scrolls && !pinned(e)) continue;
        return true;
      }
      return false;
    }
    function settle(){
      if(!b.isConnected){ clearInterval(timer); return; }
      b.style.display = ""; put(CORNERS[cur]);
      if(!hits()) return;
      for(var k = 1; k < CORNERS.length; k++){ var n = (cur + k) % CORNERS.length; put(CORNERS[n]); if(!hits()){ cur = n; return; } }
      put(CORNERS[cur]); b.style.display = "none";
    }
    setTimeout(settle, 400); timer = setInterval(settle, 1500);
    addEventListener("resize", settle); addEventListener("orientationchange", settle);
  }
  window.areOfflinePanel = open;
  function init(){ paint(); fab(); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
