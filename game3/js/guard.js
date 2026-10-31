/* ===== ガード＆起動診断（クラシックscript：モジュールが読めなくても動く）=====
   1) F12・右クリック・Ctrl+Shift+I/J/C・Ctrl+U を ふさぐ（※かんたんな ぼうしだけ。完全には ふせげません）
      開発するときは URL のおわりに ?dev=1 を つける（localhost は じどうで ゆるす）
   2) 6びょう たっても タイトルが でなければ「なにが 読めていないか」を 画面に だす */
(function(){
    var q = location.search, host = location.hostname;
    var dev = /[?&]dev=1/.test(q) || host === "localhost" || host === "127.0.0.1" || host === "";
    if(!dev){
        addEventListener("contextmenu", function(e){ e.preventDefault(); }, true);
        addEventListener("keydown", function(e){
            var k = e.key, c = e.ctrlKey || e.metaKey;
            if(k === "F12" || (c && e.shiftKey && /^[ijcIJC]$/.test(k)) || (c && /^[uU]$/.test(k))){ e.preventDefault(); e.stopPropagation(); }
        }, true);
    }
    var errs = []; window.__bootErrors = errs;
    addEventListener("error", function(e){ var t = e.target; if(t && t !== window && (t.src || t.href)) errs.push("読みこみ失敗: " + (t.src || t.href)); else errs.push((e.message || "error") + "  @" + String(e.filename || "").split("/").slice(-2).join("/") + ":" + (e.lineno || "")); }, true);
    addEventListener("unhandledrejection", function(e){ errs.push("promise: " + ((e.reason && e.reason.message) || e.reason)); });
    var FILES = ["js/main.js", "js/audio.js", "js/battle.js", "js/casino.js", "js/chars.js", "js/fx.js", "js/gl.js", "js/input.js", "js/mon3d.js", "js/park.js", "js/places.js", "js/ranch.js", "js/rules.js", "js/save.js", "js/story.js", "js/ui.js", "js/world.js",
        "data/maps.json", "data/monsters.json", "data/items.json", "data/members.json", "data/chapters.json", "data/abilities.json", "data/jobs.json", "data/mons.json", "data/casino.json", "data/encpool.json", "data/ch/ch01.json", "data/ch/ch31.json", "data/ch/ch39.json"];
    function show(){
        if(window.__bootDone || document.getElementById("bootDiag")) return;
        var d = document.createElement("div"); d.id = "bootDiag";
        d.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(5,8,40,.96);color:#fff;font:14px/1.6 sans-serif;padding:16px;overflow:auto";
        var gl2 = false; try{ gl2 = !!document.createElement("canvas").getContext("webgl2"); }catch(_e){}
        var h = "<h2 style='margin:0 0 8px'>ゲームが 起動しませんでした（診断）</h2><p>この画面を スクショ または 下の「コピー」で 送ってください。</p><pre id='bootLog' style='white-space:pre-wrap;background:#000;padding:10px;border-radius:8px'></pre><button id='bootCopy' style='font:inherit;padding:6px 14px'>診断をコピー</button> <button onclick='location.reload()' style='font:inherit;padding:6px 14px'>再読み込み</button>";
        d.innerHTML = h; document.body.appendChild(d);
        var lines = ["URL: " + location.href, "WebGL2: " + (gl2 ? "OK" : "NG（このブラウザ／端末では 動きません）"), "file:// で開いている: " + (location.protocol === "file:" ? "はい → NG（ローカルサーバーか GitHub Pages で 開いてください）" : "いいえ"), "ブラウザ: " + navigator.userAgent, "", "【コンソールの エラー】"].concat(errs.length ? errs : ["（なし）"]).concat(["", "【ファイルの 確認】"]);
        var log = document.getElementById("bootLog"); log.textContent = lines.join("\n");
        document.getElementById("bootCopy").onclick = function(){ try{ navigator.clipboard.writeText(log.textContent); }catch(_e){} };
        var base = location.href.replace(/[#?].*$/, "").replace(/[^\/]*$/, "");
        FILES.forEach(function(f){ fetch(base + f, {cache: "no-store"}).then(function(r){ lines.push((r.ok ? "OK  " : "NG  ") + r.status + "  " + f); log.textContent = lines.join("\n"); }).catch(function(x){ lines.push("NG  通信エラー  " + f); log.textContent = lines.join("\n"); }); });
        lines.push("（NG の ファイルが アップロードされていない／名前が ちがう 可能性）");
    }
    setTimeout(show, 7000);
    window.__showBootDiag = show;
})();
