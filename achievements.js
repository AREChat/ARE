"use strict";
// 全ゲーム共通の 実績ページ(T036)。game1 は 称号一覧(ヒントつき)、game2/3 は 取得した称号を表示。
(function(){
  const root = document.getElementById("root"), esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
  const rd = (k) => { try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch(_e){ return null; } };
  // game1 の称号の名前表を、titles.js から 取り出す（計算部分は 呼ばないので ダミーで 足りる）
  window.G = {S:{f:{}, party:[], cx:{}, kills:0, lv:1}}; window.tqJ = () => ({mast:[], tried:[], learned:{}}); window.tqMemCount = () => 0; window.tqAutoSave = () => {}; window.ACT = {}; window.render = () => {};
  const s = document.createElement("script"); s.src = "./game/titles.js";
  function done(){
    let h = "";
    // ---- game1 ----
    const got = {}; let any = false;
    [1, 2, 3].forEach((i) => { const r = rd("tq_save_" + i); const ti = r && r.data && r.data.cx && r.data.cx.ti; if(ti && ti.got){ any = true; Object.keys(ti.got).forEach((k) => { got[k] = 1; }); } });
    const T = (typeof TQ_TITLES !== "undefined" ? TQ_TITLES : []), n = T.filter((t) => got[t.id]).length;
    h += "<h2>ARE QUEST（game1）</h2>" + (any || T.length ? "<p>" + n + " / " + T.length + "</p><div class='bar'><i style='width:" + (T.length ? Math.round(100 * n / T.length) : 0) + "%'></i></div><div class='g' style='margin-top:8px'>" +
      T.map((t) => got[t.id] ? "<div class='c on'>🏅 <b>" + esc(t.n) + "</b><small>" + esc(t.d) + "</small></div>" : "<div class='c'>❔ ？？？<small>ヒント：" + esc(t.d) + "</small></div>").join("") + "</div>" : "<p>セーブデータが ありません。</p>");
    // ---- game2 / game3 ----
    [["areq2_save_", "ARE QUEST 2（game2）"], ["areq3_save_", "ARE QUEST 3（game3）"]].forEach((g) => {
      const set = {};
      ["auto", "1", "2", "3"].forEach((s) => { const r = rd(g[0] + s); if(r && Array.isArray(r.titles)) r.titles.forEach((t) => { set[t] = 1; }); });
      const L = Object.keys(set);
      h += "<h2>" + g[1] + "</h2>" + (L.length ? "<div class='g'>" + L.map((t) => "<div class='c on'>🏅 <b>" + esc(t) + "</b></div>").join("") + "</div>" : "<p>まだ 称号が ありません。</p>");
    });
    root.innerHTML = h;
  }
  s.onload = done; s.onerror = done; document.head.appendChild(s);
})();
