"use strict";
// ===== お試しアカウント：管理者とのチャットを一覧の一番上に固定する =====
// ・お試しは「ユーザー」タブを隠しているため、管理者以外を自分から探すことができません。
//   管理者への連絡手段を見失わないよう、管理者との会話だけは常に一番上に表示します（非表示にもできません）。
const GP_ADMIN_ID = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";
let gpIsGuest = false;
async function gpRefreshFlag(){
    try{ const r = await requireClient().rpc("guest_status_me"); gpIsGuest = !!(r.data && r.data.guest); }catch(_e){ gpIsGuest = false; }
}
function gpPaint(){
    if(!gpIsGuest || !el.roomList) return;
    const btn = el.roomList.querySelector('[data-room-id][data-partner="' + GP_ADMIN_ID + '"]');
    if(!btn) return;
    if(!btn.querySelector(".gp-pin")){
        const s = document.createElement("span"); s.className = "gp-pin"; s.setAttribute("aria-hidden", "1"); s.style.cssText = "margin-right:4px"; s.textContent = "📌";
        const name = btn.querySelector("strong"); if(name) name.insertAdjacentElement("afterbegin", s);
    }
    if(el.roomList.firstElementChild !== btn) el.roomList.insertAdjacentElement("afterbegin", btn);
}
function initGuestPin(){
    gpRefreshFlag();
    if(typeof renderRooms === "function"){
        const orig = renderRooms;
        renderRooms = function(){
            const r = orig.apply(this, arguments);
            try{
                if(gpIsGuest && el.roomList){
                    el.roomList.querySelectorAll("[data-room-id]").forEach((btn) => {
                        const room = (state.rooms || []).find((x) => x.id === btn.dataset.roomId);
                        if(room && room.partnerId) btn.setAttribute("data-partner", room.partnerId);
                    });
                }
                gpPaint();
            }catch(_e){ /* 固定表示だけの話。失敗しても普通に使える */ }
            return r;
        };
    }
}
