// ===== 友達・社員グループのおすすめ表示（ランダム） =====
// ・同じグループの人のうち、「フォローしていない人」または「まだチャットしていない（未登録）人」から10人をランダムに表示
// ・上の人数表示も、3パターンからランダム（未登録/登録済み ／ フォロー中・フォローしていない・フォロワー ／ 5つ全部）
// ・登録済み＝1対1のチャットがある人。更新するたびに選び直します
const rcSt = { plan:null, peers:[], sig:"", count:10, custom:false };
function rcKey(){ return "are_reco_n_" + (state.user && state.user.id || ""); }
function rcLoadCount(){
    try{ const v = localStorage.getItem(rcKey()); if(v === null) return; const n = parseInt(v, 10); if(n >= 0){ rcSt.count = n; rcSt.custom = ![0, 10, 20].includes(n); } }catch(_e){ /* 保存できなくても使えます */ }
}
function rcSetCount(n, custom){
    rcSt.count = n; rcSt.custom = !!custom;
    try{ localStorage.setItem(rcKey(), String(n)); }catch(_e){ /* 何もしない */ }
    if(typeof renderRecommendations === "function") renderRecommendations();
}
/** 表示人数の選択（10人・20人・全員・人数指定） */
function rcPaintCount(){
    const box = document.getElementById("rcCount"); if(!box) return;
    if(!state.recommendedMode || (el.userSearch && el.userSearch.value.trim()) || state.showHidden){ box.style.display = "none"; return; }
    box.style.display = "";
    const typing = document.activeElement && document.activeElement.id === "rcCustomN";
    if(typing) return;
    const b = (label, n, on) => '<button type="button" class="fl-chip" data-rcn="' + n + '" style="' + (on ? "border-color:var(--accent,#6aa0ff);font-weight:700" : "") + '">' + label + '</button>';
    const c = rcSt.count;
    box.innerHTML = '<span class="meta">表示人数</span> ' + b("10人", 10, !rcSt.custom && c === 10) + b("20人", 20, !rcSt.custom && c === 20) + b("全員", 0, !rcSt.custom && c === 0) +
        b("人数指定", "custom", rcSt.custom) +
        (rcSt.custom ? ' <input type="number" id="rcCustomN" min="1" max="300" value="' + (c > 0 ? c : 10) + '" style="width:72px;padding:6px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--text)"> 人 <button type="button" class="button-secondary qk-mini" data-rcset="1">決定</button>' : "");
}

function rcNewPlan(){
    return { seed:Math.floor(Math.random() * 2147483647) + 1, list:Math.random() < 0.5 ? "follow" : "reg", stats:Math.floor(Math.random() * 3) };
}
function rcShuffle(arr, seed){
    const a = arr.slice(); let x = seed || 1;
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
}
function rcTalkedSet(){
    return new Set((state.rooms || []).filter((r) => !r.is_group && r.partnerId).map((r) => r.partnerId));
}
async function rcPrepare(){
    if(!rcSt.plan) rcSt.plan = rcNewPlan();
    try{ if(typeof qkLoadFollowData === "function" && !qkFl.loaded) await qkLoadFollowData(); }catch(_e){ /* フォロー情報が取れなくても表示は続ける */ }
}
function rcGroups(list){
    const talked = rcTalkedSet(), fol = (typeof qkFl !== "undefined" && qkFl.following) || new Set();
    const ids = list.map((p) => p.id);
    return {
        notFollowed: list.filter((p) => !fol.has(p.id)),
        unreg: list.filter((p) => !talked.has(p.id)),
        reg: ids.filter((id) => talked.has(id)).length,
        following: ids.filter((id) => fol.has(id)).length
    };
}
/** renderRecommendations から呼ばれる。選んだ10人と見出しを返す（該当者がいなければ null＝今までどおり） */
function rcPick(list){
    if(!rcSt.plan) rcSt.plan = rcNewPlan();
    rcPaintCount();
    rcSt.peers = list;
    // 表示人数「全員」が選ばれているときは、フォロー状況・チャット状況で絞り込まず、
    // このグループの全員をそのまま表示する（「全員にしたのに全員表示されない」を防ぐため）
    if(rcSt.count === 0 && !rcSt.custom){
        const all = rcShuffle(list, rcSt.plan.seed);
        return { list:all, title:"⭐ このグループの全員（" + all.length + "人）" };
    }
    const g = rcGroups(list), plan = rcSt.plan;
    let kind = plan.list;
    if(kind === "follow" && !g.notFollowed.length) kind = "reg";
    if(kind === "reg" && !g.unreg.length) kind = "follow";
    const src = kind === "follow" ? g.notFollowed : g.unreg;
    if(!src.length) return null;
    const all = rcShuffle(src, plan.seed), picked = rcSt.count > 0 ? all.slice(0, rcSt.count) : all;
    return { list:picked, title:kind === "follow" ? "⭐ おすすめ：未フォローの人（" + picked.length + "人）" : "⭐ おすすめ：未チャットの人（" + picked.length + "人）" };
}
function rcStatsHtml(){
    if(!state.recommendedMode || !rcSt.plan || !rcSt.peers.length) return "";
    const g = rcGroups(rcSt.peers), c = (typeof qkCounts !== "undefined" && qkCounts) || null;
    const chip = (n, label, fl) => fl
        ? '<button type="button" class="fl-chip" data-keep="1" data-fl="' + fl + '"><b>' + n + '</b> ' + label + '</button>'
        : '<span class="fl-chip"><b>' + n + '</b> ' + label + '</span>';
    const fw = chip(c ? c.followers : "–", "フォロワー", "followers");
    const fg = chip(c ? c.following : "–", "フォロー中", "following");
    const nf = chip(g.notFollowed.length, "未フォロー");
    const rg = chip(g.reg, "登録済み"), ur = chip(g.unreg.length, "未登録");
    const v = rcSt.plan.stats;
    // 「非表示」ボタンと同じ行に並ぶグループ（未登録・登録済み）と、次の行に並ぶグループ（フォロー中・未フォロー・フォロワー）に分ける。
    // どのパターンでも最大2行に収まるよう、呼び出し側（rcPaintStats）で別々の行に描画する
    return { group1:v === 1 ? "" : (ur + rg), group2:v === 0 ? "" : (fg + nf + fw) };
}
/** ユーザー一覧の「非表示」行に統計チップを描く：1行目＝非表示＋未登録/登録済み、2行目＝フォロー中/未フォロー/フォロワー（最大2行） */
function rcPaintStats(row2box){
    const row1 = document.getElementById("flRow1");
    if(!row1) return false;
    const r = rcStatsHtml();
    if(!r) return false;
    row1.querySelectorAll(".fl-chip").forEach((n) => n.remove());
    if(r.group1) row1.insertAdjacentHTML("beforeend", r.group1);
    if(row2box) row2box.innerHTML = r.group2 || "";
    return true;
}
/** チャット一覧が読み込まれて「登録済み」が変わったときだけ、表示を更新する（選び直しはしない） */
function rcOnRooms(){
    if(!state.recommendedMode) return;
    const sig = [...rcTalkedSet()].sort().join(",");
    if(sig === rcSt.sig) return;
    rcSt.sig = sig;
    if(typeof renderRecommendations === "function" && state.recommendations && state.recommendations.length) renderRecommendations();
}
function initReco(){
    rcLoadCount();
    const pane = document.querySelector(".pane-users"), ru = document.getElementById("recommendedUsers");
    if(pane && ru && !document.getElementById("rcCount")){
        const d = document.createElement("div"); d.id = "rcCount"; d.className = "row"; d.style.cssText = "flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0;display:none";
        ru.parentNode.insertBefore(d, ru);
        d.addEventListener("click", (e) => {
            const b = e.target.closest("[data-rcn]"), ok = e.target.closest("[data-rcset]");
            if(b){ const v = b.dataset.rcn; if(v === "custom"){ rcSt.custom = true; rcPaintCount(); const i = document.getElementById("rcCustomN"); if(i) i.focus(); } else rcSetCount(parseInt(v, 10), false); }
            else if(ok){ const i = document.getElementById("rcCustomN"), n = Math.max(1, Math.min(300, parseInt(i && i.value, 10) || 10)); rcSetCount(n, true); }
        });
        d.addEventListener("keydown", (e) => { if(e.key === "Enter" && e.target.id === "rcCustomN"){ e.preventDefault(); const n = Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 10)); e.target.blur(); rcSetCount(n, true); } });
    }
    if(typeof renderRooms === "function"){
        const orig = renderRooms;
        renderRooms = function(){ const r = orig.apply(this, arguments); try{ rcOnRooms(); }catch(_e){ /* 何もしない */ } return r; };
    }
    const btn = document.getElementById("refreshUsersButton");
    if(btn) btn.addEventListener("click", () => { rcSt.plan = rcNewPlan(); }, true);
}
