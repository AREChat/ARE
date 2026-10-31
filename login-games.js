"use strict";
// ログイン画面の ゲーム一覧を カード型に（けんさく・おきにいり★）(T024)
(function(){
  const first = document.getElementById("openRpg"); if(!first) return;
  const row = first.parentElement; if(!row) return;
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(_e){ return d; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(_e){} };
  let fav = []; try{ fav = JSON.parse(lsGet("are_fav_games", "[]")); }catch(_e){}
  const items = Array.from(row.querySelectorAll("a[id^=open]")).filter((a) => a.id !== "openGame5").map((a, i) => ({a, i, id:a.id, text:a.textContent.replace(/\s+/g, " ").trim()}));
  items.forEach((it) => { const a = it.a; a.style.cssText = ""; a.classList.add("gameCard"); });
  const st = document.createElement("style");
  st.textContent = "#gameGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-top:8px}.gameWrap{position:relative}.gameWrap a.gameCard{display:block;box-sizing:border-box;min-height:64px;padding:12px 38px 12px 12px;text-align:left;text-decoration:none;border-radius:12px}.gameFav{position:absolute;right:6px;top:6px;width:32px;height:32px;border:0;background:transparent;font-size:20px;cursor:pointer;color:#ffd86b}#gameSearch{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;margin-top:6px}";
  document.head.appendChild(st);
  const search = document.createElement("input"); search.id = "gameSearch"; search.type = "search"; search.placeholder = "ゲームを さがす（れい：カード）"; search.setAttribute("aria-label", "ゲームをさがす");
  const grid = document.createElement("div"); grid.id = "gameGrid";
  row.innerHTML = ""; row.appendChild(search); row.appendChild(grid);
  function paint(){
    const q = search.value.trim().toLowerCase();
    grid.innerHTML = "";
    items.slice().sort((x, y) => (fav.includes(y.id) - fav.includes(x.id)) || (x.i - y.i)).forEach((it) => {
      if(q && it.text.toLowerCase().indexOf(q) < 0) return;
      const w = document.createElement("div"); w.className = "gameWrap"; w.appendChild(it.a);
      const b = document.createElement("button"); b.type = "button"; b.className = "gameFav"; const on = fav.includes(it.id);
      b.textContent = on ? "★" : "☆"; b.setAttribute("aria-label", it.text + " を おきにいり" + (on ? "から はずす" : "に する"));
      b.addEventListener("click", () => { fav = on ? fav.filter((x) => x !== it.id) : fav.concat(it.id); lsSet("are_fav_games", JSON.stringify(fav)); paint(); });
      w.appendChild(b); grid.appendChild(w);
    });
    if(!grid.children.length) grid.textContent = "みつかりませんでした。";
    if(!document.getElementById("achLink")){ const a = document.createElement("a"); a.id = "achLink"; a.href = "./achievements.html"; a.textContent = "🏅 実績・称号を見る"; a.style.cssText = "display:block;margin-top:8px"; row.appendChild(a); }
  }
  search.addEventListener("input", paint); paint();
})();
