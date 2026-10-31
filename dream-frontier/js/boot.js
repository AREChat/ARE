/* ===== ガード＆起動診断（クラシックscript：ES Modules が読めなくても動く）=====
   1) F12・右クリック・Ctrl+Shift+I/J/C・Ctrl+U を ふさぐ（かんたんな ぼうしだけ。完全には ふせげません）
      開発するときは URL に ?dev=1 を つける（localhost は じどうで ゆるす）
   2) 8びょう たっても ゲームが 始まらなければ「なにが 読めていないか」を 画面に だす */
(function(){
    var q = location.search, host = location.hostname;
    var dev = /[?&]dev=1/.test(q) || host === "localhost" || host === "127.0.0.1" || host === "";
    window.__dfDev = dev;
    if(!dev){
        addEventListener("contextmenu", function(e){ e.preventDefault(); }, true);
        addEventListener("keydown", function(e){ var k = e.key, c = e.ctrlKey || e.metaKey; if(k === "F12" || (c && e.shiftKey && /^[ijcIJC]$/.test(k)) || (c && /^[uU]$/.test(k))){ e.preventDefault(); e.stopPropagation(); } }, true);
    }
    var errs = []; window.__bootErrors = errs;
    addEventListener("error", function(e){ var t = e.target; if(t && t !== window && (t.src || t.href)) errs.push("読みこみ失敗: " + (t.src || t.href)); else errs.push((e.message || "error") + "  @" + String(e.filename || "").split("/").slice(-2).join("/") + ":" + (e.lineno || "")); }, true);
    addEventListener("unhandledrejection", function(e){ errs.push("promise: " + ((e.reason && e.reason.message) || e.reason)); });
    var FILES = ["js/main.js", "js/config.js", "js/engine.js", "js/gl.js", "js/textures.js", "js/backend-gl2.js", "js/backend-three.js", "js/df-data.js", "js/df-path.js", "js/df-world.js", "js/df-game.js", "js/ui.js", "js/controls.js", "js/audio.js", "css/style.css", "vendor/three/MANIFEST.json", "vendor/three/build/three.module.js"];
    window.__dfDiagFiles = FILES;
    function show(extra){
        if(window.__dfStarted && !extra) return; var old = document.getElementById("bootDiag"); if(old) old.remove();
        var d = document.createElement("div"); d.id = "bootDiag";
        d.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(5,8,40,.97);color:#fff;font:14px/1.6 sans-serif;padding:16px;overflow:auto";
        var gl2 = false; try{ gl2 = !!document.createElement("canvas").getContext("webgl2"); }catch(_e){}
        d.innerHTML = "<h2 style='margin:0 0 8px'>診断（ドリーム・フロンティア）</h2><p>この画面を スクショ または 「コピー」で 送ってください。</p><pre id='bootLog' style='white-space:pre-wrap;background:#000;padding:10px;border-radius:8px'></pre><button id='bootCopy' style='font:inherit;padding:6px 14px'>診断をコピー</button> <button onclick='location.reload()' style='font:inherit;padding:6px 14px'>再読み込み</button> <button id='bootClose' style='font:inherit;padding:6px 14px'>とじる</button>";
        document.body.appendChild(d);
        var info = window.__dfInfo || {};
        var lines = ["URL: " + location.href, "WebGL2: " + (gl2 ? "OK" : "NG（この ブラウザ／端末では 3D が 使えません）"), "file:// で開いている: " + (location.protocol === "file:" ? "はい → NG（ローカルサーバーか GitHub Pages で 開いてください）" : "いいえ"),
            "描画エンジン: " + (info.backend || "（まだ 決まっていません）"), "Three.js: " + (info.threeStatus || "（未確認）"), "ブラウザ: " + navigator.userAgent, "", "【Three.js を 読みこむ 試み】"].concat(info.tried && info.tried.length ? info.tried.map(function(t){ return (t.ok ? "OK  " : "NG  ") + t.label + "  " + t.url + (t.error ? "\n      → " + t.error : ""); }) : ["（記録なし）"]).concat(["", "【コンソールの エラー】"]).concat(errs.length ? errs : ["（なし）"]).concat(["", "【ファイルの 確認】"]);
        var log = document.getElementById("bootLog"); log.textContent = lines.join("\n");
        document.getElementById("bootCopy").onclick = function(){ try{ navigator.clipboard.writeText(log.textContent); }catch(_e){} };
        document.getElementById("bootClose").onclick = function(){ d.remove(); };
        var base = location.href.replace(/[#?].*$/, "").replace(/[^\/]*$/, "");
        FILES.forEach(function(f){ fetch(base + f, {cache: "no-store"}).then(function(r){ lines.push((r.ok ? "OK  " : "NG  ") + r.status + "  " + f + (!r.ok && /three\.module|MANIFEST|backend-three/.test(f) ? "   ← Three.js 版の ファイル（無くても WebGL2 版で あそべます）" : "")); log.textContent = lines.join("\n"); }).catch(function(){ lines.push("NG  通信エラー  " + f); log.textContent = lines.join("\n"); }); });
    }
    // 「あそぶ！」を まだ 押していないだけの人（じゅんび かんりょう の タイトル画面）には 出さない。読みこみが おわっていない／失敗した ときだけ 出す
    setTimeout(function(){ if(window.__dfBoot === "ready") return; show(false); }, 8000);
    window.__showDiag = function(){ show(true); };
    if(/[?&]diag=1/.test(q)) addEventListener("load", function(){ setTimeout(function(){ show(true); }, 600); });
})();
