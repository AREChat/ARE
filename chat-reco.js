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
/** 表示人数の選択（10人・20人・全員・人数指定）：見ればわかるので、選ぶUIは出さない（既定のまま使う） */
function rcPaintCount(){
    const box = document.getElementById("rcCount"); if(box) box.style.display = "none";
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
// 統計チップは、チャットタブ・その他タブと同じく「1つのボタンで切り替え」形式にする
let rcStatCycleItems = [], rcStatCycleIdx = 0;
function rcStatsHtml(){
    if(!state.recommendedMode || !rcSt.plan || !rcSt.peers.length) return "";
    const g = rcGroups(rcSt.peers), c = (typeof qkCounts !== "undefined" && qkCounts) || null;
    const fw = {n: c ? c.followers : "–", label: "フォロワー", fl: "followers"};
    const fg = {n: c ? c.following : "–", label: "フォロー中", fl: "following"};
    const nf = {n: g.notFollowed.length, label: "未フォロー"};
    const rg = {n: g.reg, label: "登録済み"}, ur = {n: g.unreg.length, label: "未登録"};
    const v = rcSt.plan.stats;
    rcStatCycleItems = v === 0 ? [ur, rg] : v === 1 ? [fg, nf, fw] : [ur, rg, fg, nf, fw];
    if(rcStatCycleIdx >= rcStatCycleItems.length) rcStatCycleIdx = 0;
    const cur = rcStatCycleItems[rcStatCycleIdx];
    return '<button type="button" class="fl-chip" data-keep="1" data-rc-stat-cyc="1"><b>' + cur.n + '</b> ' + cur.label + ' 🔁</button>';
}
/** 統計チップが押されたとき：フォロー中／フォロワーなら一覧を開き、どれでも次の表示へ進める */
function rcStatCycleClick(){
    const item = rcStatCycleItems[rcStatCycleIdx];
    rcStatCycleIdx = rcStatCycleItems.length ? (rcStatCycleIdx + 1) % rcStatCycleItems.length : 0;
    if(item && item.fl) runTool(() => openFollowList(item.fl));
    if(typeof qkPaintFollowCounts === "function") qkPaintFollowCounts();
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
