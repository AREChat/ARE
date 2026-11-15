"use strict";
// ===== チャットの非表示（メッセージは消さずに、一覧から隠す）。個人チャットもグループも同じ =====
// ・チャット一覧の「⋯」→「🙈 このチャットを非表示にする」。メッセージも履歴も そのまま残ります
// ・戻すとき／開くとき：ユーザータブの「🙈 非表示のチャット」ボタン。ユーザータブが無い人は、トークタブ（チャット一覧）に出ます
// ・この端末だけに保存します（フォルダ分け・固定と同じ）。依頼確認チャットは隠せません

const hr = { ids:new Set() };
function hrKey(){ return "are_hidden_rooms_" + (state.user ? state.user.id : "x"); }
function hrLoad(){ try{ hr.ids = new Set(JSON.parse(localStorage.getItem(hrKey())) || []); }catch(_e){ hr.ids = new Set(); } }
function hrSave(){ try{ localStorage.setItem(hrKey(), JSON.stringify([...hr.ids])); }catch(_e){ showToast("この端末に保存できませんでした。"); } }
function hrExists(id){ return (state.rooms || []).some((r) => r.id === id); }
function hrName(id){ return typeof roomNameById === "function" ? roomNameById(id) : "チャット"; }

function hrPaint(){
    const list = el && el.roomList; if(!list) return;
    list.querySelectorAll("[data-room-id]").forEach((b) => b.classList.toggle("hr-hide", hr.ids.has(b.dataset.roomId)));
    const n = [...hr.ids].filter(hrExists).length;
    document.querySelectorAll(".hr-btn").forEach((b) => { b.textContent = "🙈 非表示のチャット（" + n + "）"; });
}

function hrHide(id){
    if(typeof isFixReqRoom === "function" && isFixReqRoom(id)){ showToast("この部屋は非表示にできません。"); return; }
    hr.ids.add(id); hrSave(); hrPaint(); closeSheet();
    showToast("非表示にしました（メッセージは消えていません）。戻すときは「🙈 非表示のチャット」から。");
}
function hrShow(id){ hr.ids.delete(id); hrSave(); hrPaint(); }

function hrOpenList(){
    const rooms = (state.rooms || []).filter((r) => hr.ids.has(r.id));
    openSheet('<h3 style="margin:0">🙈 非表示のチャット</h3><div class="meta">メッセージは消えていません。「開く」で読めます。「表示に戻す」で一覧に戻ります。</div>' +
        (rooms.length ? rooms.map((r) =>
            '<div class="admin-card"><b>' + escapeHtml(r.is_group ? (r.name || "グループ") : profileDisplayName(r.partner)) + '</b><span class="meta"> ' + (r.is_group ? "グループ" : "個人チャット") + '</span>' +
            '<div class="row"><button type="button" class="button" data-hropen="' + escapeHtml(r.id) + '">開く</button>' +
            '<button type="button" class="button-secondary" data-hrshow="' + escapeHtml(r.id) + '">表示に戻す</button></div></div>').join("")
            : '<div class="empty-list">非表示のチャットはありません。</div>') +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    const root = document.getElementById("sheet") || document;
    document.querySelectorAll("[data-hropen]").forEach((b) => b.addEventListener("click", () => {
        const room = state.rooms.find((r) => r.id === b.dataset.hropen); closeSheet(); if(room) selectRoom(room, room.partner);
    }));
    document.querySelectorAll("[data-hrshow]").forEach((b) => b.addEventListener("click", () => {
        hrShow(b.dataset.hrshow); showToast("一覧に戻しました。"); hrOpenList();
    }));
    void root;
}

function hrAddButtons(){
    const css = document.createElement("style");
    css.textContent = ".room-item.hr-hide{display:none!important}.hr-btn{width:100%;min-height:44px;margin:6px 0}body:not(.seg-no-users) #hrBtnChats{display:none}";
    document.head.appendChild(css);
    const mk = (id) => { const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "button-secondary hr-btn"; b.textContent = "🙈 非表示のチャット（0）"; b.addEventListener("click", hrOpenList); return b; };
    const u = document.querySelector(".pane-users #userSearch"); if(u) u.insertAdjacentElement("beforebegin", mk("hrBtnUsers"));
    const c = document.getElementById("roomList"); if(c) c.insertAdjacentElement("beforebegin", mk("hrBtnChats"));
}

function initHideRooms(){
    hrLoad(); hrAddButtons();
    const orig = renderRooms;
    renderRooms = function(){ orig.apply(this, arguments); try{ hrPaint(); }catch(e){ console.error("[ARE hide]", e); } };
    if(state.rooms && state.rooms.length) hrPaint();
}
