"use strict";
// 「3回まちがえたら 内カメラで 記録」の 設定画面（login.html）。しくみは shared/are-intruder.js
(function(){
  var on = document.getElementById("intruderOn"), msg = document.getElementById("intruderMsg"), list = document.getElementById("intruderList");
  if(!on || !window.areIntruder) return;
  var A = window.areIntruder;
  on.checked = A.enabled();
  async function note(){
    var g = await A.granted();
    msg.textContent = A.enabled() ? (g ? "オン（カメラ許可あり）" : "オン。ただし このブラウザは カメラ許可が まだ ないので、許可するまで 撮りません。") : "オフ";
  }
  on.addEventListener("change", async function(){
    A.set(on.checked);
    if(on.checked && !(await A.granted()) && navigator.mediaDevices){
      try{ var s = await navigator.mediaDevices.getUserMedia({video: {facingMode: "user"}}); s.getTracks().forEach(function(t){ t.stop(); }); }catch(_e){}   // ここで はじめて 持ち主に 許可を たずねる
    }
    note();
  });
  document.getElementById("intruderView").addEventListener("click", async function(){
    list.textContent = ""; var a = await A.list();
    if(!a.length){ list.textContent = "記録は ありません。"; return; }
    a.forEach(function(x){ var f = document.createElement("figure"); f.style.margin = "0"; var im = new Image(); im.src = x.img; im.alt = "記録"; im.style.cssText = "width:96px;border-radius:8px"; var c = document.createElement("figcaption"); c.style.fontSize = "10px"; c.textContent = new Date(x.t).toLocaleString("ja-JP"); f.append(im, c); list.appendChild(f); });
  });
  document.getElementById("intruderClear").addEventListener("click", async function(){ if(confirm("記録を ぜんぶ 消しますか？")){ await A.clear(); list.textContent = "消しました。"; } });
  note();
})();
