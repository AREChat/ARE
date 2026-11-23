"use strict";
// ===== 管理者だけ：ユーザータブで、グループ（家庭/友達/社員/その他/全員）を選んで一覧できる =====
// ・admin_browse_users_v1.sql の実行が必要です（未実行でも、今まで通りの「おすすめ」表示のままです）
const ABS_SEGS = [["all", "全員"], ["home", "🏠 家庭"], ["friend", "🧑‍🤝‍🧑 友達"], ["work", "💼 社員"], ["other", "🙂 その他"]];
const absSt = {seg: null};

function absActive(){ return feat.isAdmin === true && !!absSt.seg; }
async function absFetch(client){
    const r = await client.rpc("admin_browse_users_v1", {p_segment: absSt.seg === "all" ? null : absSt.seg});
    if(r.error) throw r.error;
    return r.data || [];
}
function absLabel(seg){ return (ABS_SEGS.find((s) => s[0] === seg) || [, seg])[1]; }
function absHeadHtml(n){ return '<div class="meta" style="margin:4px 2px">🧭 ' + escapeHtml(absLabel(absSt.seg)) + '（' + n + '人）</div>'; }

function absPaintBar(){
    const pane = document.querySelector(".pane-users"), ru = document.getElementById("recommendedUsers");
    if(!pane || !ru) return;
    let bar = document.getElementById("absBar");
    if(!feat.isAdmin){ if(bar) bar.remove(); return; }
    if(!bar){
        bar = document.createElement("div"); bar.id = "absBar"; bar.className = "row"; bar.style.cssText = "flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0";
        const rc = document.getElementById("rcCount");
        (rc || ru).parentNode.insertBefore(bar, rc || ru);
        bar.addEventListener("click", (e) => {
            const b = e.target.closest("[data-abs]"); if(!b) return;
            const v = b.dataset.abs;
            absSt.seg = absSt.seg === v ? null : v;
            // 検索ボックスの文字や「非表示を表示」が残っていると、選んだグループより そちらが優先されてしまうため、クリア
            if(absSt.seg){ if(el.userSearch) el.userSearch.value = ""; state.showHidden = false; }
            if(typeof loadRecommendations === "function") loadRecommendations();
        });
    }
    bar.innerHTML = ABS_SEGS.map((s) => '<button type="button" class="fl-chip" data-abs="' + s[0] + '" style="' + (absSt.seg === s[0] ? "border-color:var(--accent,#6aa0ff);font-weight:700" : "") + '">' + s[1] + '</button>').join("") +
        (absSt.seg ? '<button type="button" class="fl-chip" data-abs="' + absSt.seg + '">✕ やめる</button>' : "");
}
function initAdminUsersBar(){
    if(typeof refreshAdminBadge === "function"){
        const orig = refreshAdminBadge;
        refreshAdminBadge = async function(){ const r = await orig.apply(this, arguments); try{ absPaintBar(); }catch(_e){ /* 一覧の表示だけの話 */ } return r; };
    }
    absPaintBar();
}
