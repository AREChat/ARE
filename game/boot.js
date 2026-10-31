"use strict";
try{ if(location.search){ if(new URLSearchParams(location.search).has("name")){ try{ localStorage.setItem("tq_suggest_name", String(new URLSearchParams(location.search).get("name")).slice(0, 10)); }catch(_e){} history.replaceState(null, "", location.pathname); } } }catch(_e){}
// ===== 起動 =====
(function(){
    tqSettingsLoad();
    // 画面の向き：スマホの たてむき だと「よこむき すいしょう」を出す
    try{ if(window.matchMedia("(orientation: portrait)").matches && window.innerWidth < 900) document.body.classList.add("needrot"); }catch(_e){}
    try{ if(window.matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch"); }catch(_e){}
    G.mode = "title"; render();
    // インストール（アプリ化）：このゲーム専用の sw.js（スコープ＝このフォルダ）。失敗してもゲームは ふつうに あそべる
    try{ if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(() => {}); }catch(_e){}
    window.addEventListener("beforeunload", () => { try{ tqAutoSave(); }catch(_e){} });
    document.addEventListener("visibilitychange", () => { if(document.hidden){ try{ tqAutoSave(); }catch(_e){} } });
})();
