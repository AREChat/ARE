"use strict";
// ===== 「その他」の整理：カテゴリで絞る／★お気に入り／最近使った順 =====
// ・検索バーの下に、カテゴリのボタンを並べます（すべて・★お気に入り・🕘最近・ファイル・くらし…）。
// ・各カードの右上の ☆ を押すと お気に入り（★）。お気に入りは、「すべて」でも 上にならびます。
// ・「🕘最近」は、最近ひらいた機能を 新しい順に出します。
// ・お気に入りと最近は、この端末に保存し、さらにクラウド（user_prefs）にも保存します。スマホとパソコンで 同じになります。
// ・クラウドの表が まだ無い／オフラインのときは、端末だけで ふつうに動きます。

const MO_CATS = [
    ["file", "📁 ファイル", ["zip", "imgc", "img2pdf", "pdftool", "exifclean", "hashtool", "renametool", "textfix", "csvtool", "vframe", "splittool", "ocr"]],
    ["life", "🏠 くらし", ["diary", "habit", "budget", "timer", "calc", "shop", "split", "health", "co2", "memo", "planner", "sched", "geo", "board", "weather", "transit", "run:shop"]],
    ["make", "🎨 つくる", ["story", "album", "imgedit", "draw", "mystamp", "avatar", "profile3d", "aistudio", "archive"]],
    ["play", "🎮 あそぶ", ["games", "cards", "bj", "fun", "rpg", "game2", "game4", "game5", "game7", "daifugo", "dream"]],
    ["smart", "🧠 かしこい・学習", ["chatbot", "myai", "ai", "work", "autoreply", "study124"]],
    ["chat", "💬 チャット・設定", ["phrases", "folders", "stars", "location", "live", "share", "contact", "push", "comfort", "mood", "prefs", "lock", "announce", "security", "storage", "run:follow"]]
];
const MO_RECENT_MAX = 8;
const mo = {cat: "all", favs: [], recent: [], applying: false, timer: 0};

const moKey = (n) => "are_more_" + n + "_" + (state && state.user ? state.user.id : "guest");
function moLoad(){
    try{ mo.favs = JSON.parse(localStorage.getItem(moKey("fav")) || "[]"); }catch(_e){ mo.favs = []; }
    try{ mo.recent = JSON.parse(localStorage.getItem(moKey("recent")) || "[]"); }catch(_e){ mo.recent = []; }
    if(!Array.isArray(mo.favs)) mo.favs = []; if(!Array.isArray(mo.recent)) mo.recent = [];
}
function moSave(){
    mo.t = Date.now();
    try{ localStorage.setItem(moKey("fav"), JSON.stringify(mo.favs)); localStorage.setItem(moKey("recent"), JSON.stringify(mo.recent)); localStorage.setItem(moKey("t"), String(mo.t)); }catch(_e){ /* 保存できなくても使える */ }
    moCloudPush();
}
// ---- クラウド同期（新しく書いた方が勝つ） ----
let moPushTimer = 0, moCloudOff = false;
function moCloudPush(){
    if(moCloudOff || !state || !state.user) return;
    clearTimeout(moPushTimer);
    moPushTimer = setTimeout(async () => {
        try{
            const r = await requireClient().from("user_prefs").upsert({user_id: state.user.id, key: "more", value: {favs: mo.favs, recent: mo.recent, t: mo.t || Date.now()}, updated_at: new Date().toISOString()}, {onConflict: "user_id,key"});
            if(r.error) moCloudOff = true;
        }catch(_e){ /* オフラインなど。次の保存でまた試す */ }
    }, 800);
}
async function moCloudPull(){
    if(moCloudOff || !state || !state.user) return;
    try{
        const r = await requireClient().from("user_prefs").select("value").eq("user_id", state.user.id).eq("key", "more").maybeSingle();
        if(r.error){ moCloudOff = true; return; }
        const v = r.data && r.data.value;
        let localT = 0; try{ localT = Number(localStorage.getItem(moKey("t")) || 0); }catch(_e){}
        if(v && Array.isArray(v.favs) && Number(v.t || 0) > localT){
            mo.favs = v.favs.filter((x) => typeof x === "string").slice(0, 200);
            mo.recent = (Array.isArray(v.recent) ? v.recent : []).filter((x) => typeof x === "string").slice(0, MO_RECENT_MAX);
            mo.t = Number(v.t);
            try{ localStorage.setItem(moKey("fav"), JSON.stringify(mo.favs)); localStorage.setItem(moKey("recent"), JSON.stringify(mo.recent)); localStorage.setItem(moKey("t"), String(mo.t)); }catch(_e){}
            moApply();
        }else if(!v && (mo.favs.length || mo.recent.length)){ mo.t = localT || Date.now(); moCloudPush(); }
        else if(v && localT > Number(v.t || 0)){ mo.t = localT; moCloudPush(); }
    }catch(_e){ /* 同期できなくても使える */ }
}
const moId = (item) => item.dataset.tool || (item.dataset.qk ? item.dataset.qk.replace(/^run:/, "run:") : "") || (item.getAttribute("href") ? "help" : "");
const moCatOf = (id) => { for(const c of MO_CATS) if(c[2].includes(id)) return c[0]; return "other"; };

function moApply(){
    const pane = document.querySelector(".pane-more"); if(!pane) return;
    mo.applying = true;
    const items = Array.from(pane.querySelectorAll(":scope > .more-item"));
    const seen = new Set();
    items.forEach((item, i) => {
        const id = moId(item) || ("i" + i); item.dataset.moId = id;
        if(!item.querySelector(".mo-star")){
            const s = document.createElement("span"); s.className = "mo-star"; s.setAttribute("role", "button"); s.tabIndex = 0; item.appendChild(s);
        }
        const fav = mo.favs.includes(id), star = item.querySelector(".mo-star");
        star.textContent = fav ? "★" : "☆"; star.setAttribute("aria-label", fav ? "お気に入りからはずす" : "お気に入りに入れる"); star.setAttribute("aria-pressed", fav ? "true" : "false"); star.classList.toggle("on", fav);
        const cat = moCatOf(id), ri = mo.recent.indexOf(id);
        let show = mo.cat === "all" || (mo.cat === "fav" && fav) || (mo.cat === "recent" && ri >= 0) || mo.cat === cat;
        item.classList.toggle("mo-hide", !show);
        // 並び順：お気に入りが上（「すべて」でも）。「最近」は新しい順。
        item.style.order = mo.cat === "recent" ? String(ri >= 0 ? ri : 999) : fav ? String(-500 + mo.favs.indexOf(id)) : String(10 + i);
        seen.add(id);
    });
    // 「ツール」の見出しは、絞っているあいだは かくす
    pane.querySelectorAll(".section-heading").forEach((h, i) => { h.classList.toggle("mo-hide", i > 0 && mo.cat !== "all"); h.style.order = i === 0 ? "-2000" : "9"; });
    const ms = pane.querySelector(".more-search"); if(ms) ms.style.order = "-1900";
    const empty = pane.querySelector("#moreEmpty"); if(empty) empty.style.order = "-1800";
    // ボタンの行
    const bar = pane.querySelector("#moChips");
    if(bar){
        const count = (cat) => items.filter((it) => { const id = it.dataset.moId; return cat === "fav" ? mo.favs.includes(id) : cat === "recent" ? mo.recent.includes(id) : moCatOf(id) === cat; }).length;
        const chips = [["all", "すべて", items.length], ["fav", "★ お気に入り", count("fav")], ["recent", "🕘 最近", count("recent")]].concat(MO_CATS.map((c) => [c[0], c[1], count(c[0])]));
        bar.innerHTML = chips.map((c) => '<button type="button" class="mo-chip' + (mo.cat === c[0] ? " on" : "") + '" data-mo-cat="' + c[0] + '" aria-pressed="' + (mo.cat === c[0] ? "true" : "false") + '">' + c[1] + ' <small>' + c[2] + '</small></button>').join("");
    }
    const none = pane.querySelector("#moNone");
    if(none){ const shown = items.filter((it) => !it.classList.contains("mo-hide")).length; none.hidden = shown > 0 || mo.cat === "all"; none.textContent = mo.cat === "fav" ? "お気に入りはまだありません。カードの右上の ☆ を押すと ここに集まります。" : mo.cat === "recent" ? "まだ開いた機能がありません。" : "この分類の機能はありません。"; none.style.order = "-1700"; }
    mo.applying = false;
}
function moSchedule(){ if(mo.timer) return; mo.timer = setTimeout(() => { mo.timer = 0; moApply(); }, 30); }

function initMoreOrg(){
    const pane = document.querySelector(".pane-more"); if(!pane || pane.querySelector("#moChips")) return;
    moLoad(); pane.classList.add("mo-on");
    const ms = pane.querySelector(".more-search");
    const holder = ms || pane.querySelector(".section-heading");
    const html = '<div class="mo-chips" id="moChips" role="toolbar" aria-label="分類で絞る"></div>';
    if(ms) ms.insertAdjacentHTML("beforeend", html); else if(holder) holder.insertAdjacentHTML("afterend", '<div class="more-search">' + html + '</div>');
    pane.insertAdjacentHTML("beforeend", '<div class="empty-list" id="moNone" hidden></div>');
    pane.addEventListener("click", (e) => {
        const star = e.target.closest(".mo-star");
        if(star){ e.preventDefault(); e.stopPropagation(); const id = star.closest(".more-item").dataset.moId; const at = mo.favs.indexOf(id); if(at >= 0) mo.favs.splice(at, 1); else mo.favs.unshift(id); moSave(); moApply(); return; }
        const chip = e.target.closest("[data-mo-cat]");
        if(chip){ mo.cat = chip.dataset.moCat; moApply(); return; }
        const item = e.target.closest(".more-item");
        if(item && item.dataset.moId){ const id = item.dataset.moId; mo.recent = [id].concat(mo.recent.filter((x) => x !== id)).slice(0, MO_RECENT_MAX); moSave(); moSchedule(); }
    }, true);
    pane.addEventListener("keydown", (e) => { if((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("mo-star")){ e.preventDefault(); e.target.click(); } });
    // 検索のことばを入れたら、分類は「すべて」に戻す（分類の中だけで探すと 見つからなくて 迷うため）
    const inp = document.getElementById("moreSearch");
    if(inp) inp.addEventListener("input", () => { if(inp.value.trim() && mo.cat !== "all"){ mo.cat = "all"; moApply(); } });
    try{ new MutationObserver(() => { if(!mo.applying) moSchedule(); }).observe(pane, {childList: true}); }catch(_e){ /* 何もしない */ }
    moApply();
    moCloudPull();
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") moCloudPull(); });
}
