/* 3回以上まちがえたときの「内カメラ記録」（ぜんぶ この端末の中だけ）
 * ・オフ が初期状態。持ち主が「記録する」をオンにして、ブラウザの カメラ許可が すでに あるときだけ 動く（ここから許可を求めない）
 * ・写真は この端末の IndexedDB に 最大5枚まで。7日で 自動で消える。サーバーには 送らない。持ち主が いつでも 見る・消す ことが できる
 * ・使い方: window.areIntruder.miss("pin")  … まちがえるたびに呼ぶ（3回目から 撮る）
 */
(function(){
  "use strict";
  var KEY = "are-intruder-on", DB = "are-intruder", ST = "shots", MAX = 5, DAYS = 7, counts = {};
  function ls(k, v){ try{ if(v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(_e){} return null; }
  function db(){ return new Promise(function(ok, ng){ try{ var r = indexedDB.open(DB, 1); r.onupgradeneeded = function(){ r.result.createObjectStore(ST, {keyPath: "t"}); }; r.onsuccess = function(){ ok(r.result); }; r.onerror = function(){ ng(r.error); }; }catch(e){ ng(e); } }); }
  function tx(mode, fn){ return db().then(function(d){ return new Promise(function(ok, ng){ var t = d.transaction(ST, mode), s = t.objectStore(ST), out = fn(s); t.oncomplete = function(){ d.close(); ok(out && out.result !== undefined ? out.result : undefined); }; t.onerror = function(){ ng(t.error); }; }); }); }
  function list(){ return tx("readonly", function(s){ return s.getAll(); }).then(function(a){ return (a || []).sort(function(x, y){ return y.t - x.t; }); }); }
  function prune(){ return list().then(function(a){ var old = a.filter(function(x, i){ return i >= MAX || Date.now() - x.t > DAYS * 86400000; }); if(!old.length) return; return tx("readwrite", function(s){ old.forEach(function(x){ s.delete(x.t); }); }); }); }
  function clear(){ return tx("readwrite", function(s){ s.clear(); }); }
  function enabled(){ return ls(KEY) === "1"; }
  function set(on){ ls(KEY, on ? "1" : "0"); }
  async function granted(){
    try{ if(!navigator.permissions || !navigator.permissions.query) return false; var p = await navigator.permissions.query({name: "camera"}); return p.state === "granted"; }catch(_e){ return false; }
  }
  var busy = false;
  async function shoot(why){
    if(busy || !enabled() || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !(await granted())) return false;
    busy = true; var stream = null;
    try{
      stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "user", width: {ideal: 480}}, audio: false});
      var v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
      await new Promise(function(r){ setTimeout(r, 600); });   // 明るさが 安定するまで ちょっと まつ
      var c = document.createElement("canvas"); c.width = v.videoWidth || 480; c.height = v.videoHeight || 360; c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      var url = c.toDataURL("image/jpeg", 0.7);
      await tx("readwrite", function(s){ s.put({t: Date.now(), why: String(why || ""), img: url}); });
      await prune(); return true;
    }catch(_e){ return false; }
    finally{ try{ stream && stream.getTracks().forEach(function(t){ t.stop(); }); }catch(_e){} busy = false; }
  }
  function miss(why){ var k = String(why || "x"); counts[k] = (counts[k] || 0) + 1; if(counts[k] >= 3) return shoot(k); return Promise.resolve(false); }
  function ok(why){ counts[String(why || "x")] = 0; }
  window.areIntruder = {miss: miss, ok: ok, shoot: shoot, enabled: enabled, set: set, list: list, clear: clear, granted: granted};
})();
