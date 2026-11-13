"use strict";
// ===== 修正依頼：全員がいっしょに見られる共通の部屋「修正依頼」（左の一覧の いちばん上に 自動で固定） =====
// ・部屋と「修正依頼」アカウントは sql/fix_request_account_v1.sql で作ります（番号は固定）。既存のユーザー・お試しアカウント・これから作るアカウントは、全員が自動で参加します。
// ・だれが送った依頼も、ほかの参加者が読めます。送ると、自動で「◯◯さん、貴重なご意見ありがとうございました。すぐに対応いたします！」と返ります。
// ・この部屋は、一覧の いちばん上（フォルダの絞り込み・並べ替えより優先）に出します。「退出」はできません。
// ・「その他」→「🛠 修正依頼を送る」から、この部屋を開いて、書きかたの見本を入力欄に入れます。

const FIXREQ_ID = "7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01";     // 「修正依頼」アカウント
const FIXREQ_ROOM = "7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02";   // 共通の部屋
const FIXREQ_TEMPLATE = "【修正依頼】\nどこで（画面・ゲーム名）：\nどうなった：\nどうしてほしい：\n";
const FIXREQ_SUB = "📌 みんなの部屋 ・ 直してほしいところを送れます";

function isFixReqRoom(room){
    const id = (room && typeof room === "object") ? room.id : room;
    return id === FIXREQ_ROOM;
}

/** 左の一覧：この部屋を いちばん上に出す（絞り込み・並べ替えより優先）。ほかのファイルの並べ替えのあとに呼ぶ */
function fixreqPaintRooms(){
    const list = el && el.roomList; if(!list) return;
    const b = list.querySelector('[data-room-id="' + FIXREQ_ROOM + '"]');
    if(!b) return;
    b.hidden = false; b.style.display = "";
    b.classList.add("fixreq-room");
    if(list.firstElementChild !== b) list.insertBefore(b, list.firstElementChild);
    const sm = b.querySelector(".person-text > small:not(.rt-typing)");
    if(sm && sm.textContent !== FIXREQ_SUB) sm.textContent = FIXREQ_SUB;
    const menu = b.querySelector(".cf-menu"); if(menu) menu.style.display = "none";    // 固定・フォルダ分けは できない（いつも いちばん上）
    let m = b.querySelector(".cf-marks");
    if(!m){ m = document.createElement("span"); m.className = "cf-marks"; b.appendChild(m); }
    if(m.textContent.indexOf("📌") < 0) m.textContent = m.textContent + "📌";
}

async function openFixRequest(){
    if(!state.user) return;
    if(state.user.id === FIXREQ_ID){ showToast("これは「修正依頼」の受付用アカウントです。"); return; }
    let room = (state.rooms || []).find((r) => r.id === FIXREQ_ROOM);
    if(!room){ try{ await loadRooms(); }catch(_e){ /* 下で準備中と出す */ } room = (state.rooms || []).find((r) => r.id === FIXREQ_ROOM); }
    if(!room){ showToast("「修正依頼」の部屋は、いま準備中です。少し待ってから、もう一度お試しください。"); return; }
    await selectRoom(room, null);
    if(state.currentRoom && state.currentRoom.id === FIXREQ_ROOM && el.messageInput && !el.messageInput.value.trim()){
        el.messageInput.value = FIXREQ_TEMPLATE;
        try{ el.messageInput.focus(); const at = FIXREQ_TEMPLATE.indexOf("：") + 1; el.messageInput.setSelectionRange(at, at); }catch(_e){ /* 何もしない */ }
        showToast("直してほしいことを書き足して、送信してください。");
    }
}

function initFixReq(){
    const orig = renderRooms;
    renderRooms = function(){ orig.apply(this, arguments); try{ fixreqPaintRooms(); }catch(e){ console.error("[ARE fixreq]", e); } };
    if(state.rooms && state.rooms.length) fixreqPaintRooms();
}
