"use strict";
// 新しいバージョンが入ったときに「更新があります」を出す（T017）
(function(){
  if(!("serviceWorker" in navigator)) return;
  function banner(reg){
    if(document.getElementById("swUpdBar")) return;
    const d = document.createElement("div"); d.id = "swUpdBar";
    d.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;background:#1a2fa8;color:#fff;padding:10px 16px;border-radius:12px;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)";
    d.innerHTML = "新しい版があります　<button type='button' style='margin-left:8px;padding:4px 12px;border-radius:8px;border:0'>更新する</button>";
    d.querySelector("button").onclick = () => { try{ reg.waiting && reg.waiting.postMessage({type:"SKIP_WAITING"}); }catch(_e){} location.reload(); };
    document.body.appendChild(d);
  }
  navigator.serviceWorker.getRegistration().then((reg) => {
    if(!reg) return;
    if(reg.waiting) banner(reg);
    reg.addEventListener("updatefound", () => { const w = reg.installing; if(w) w.addEventListener("statechange", () => { if(w.state === "installed" && navigator.serviceWorker.controller) banner(reg); }); });
  }).catch(() => {});
})();
