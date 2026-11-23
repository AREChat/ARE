"use strict";
// ===== メッセージの転送（会話・人のどちらも複数選んで、まとめて転送できます） =====
feat.fwRoomSel = new Set();

function initForward(){
    if(!window.AREFeatures.ok("msgmenu")) throw new Error("メッセージ操作メニューが起動していません。");
    addMsgTool({id:"forward",icon:"↪",label:"転送",when:(message,item) => item.type !== "poll",run:(message,item) => openForward(message,item)});
    el.profileModal.addEventListener("click",onForwardClick);
    el.profileModal.addEventListener("change",onForwardChange);
}

function fwRoomRowHtml(room){
    const on = feat.fwRoomSel.has(room.id);
    return '<label class="pk-row' + (on ? ' on' : '') + '"><input type="checkbox" data-fw-room="' + escapeHtml(room.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="pk-name">' + escapeHtml(roomTitle(room)) + (room.is_group ? ' <span class="pk-tag">グループ</span>' : '') + '</span></label>';
}

function openForward(message,item){
    feat.forwardItem = item;
    feat.fwRoomSel = new Set();
    const rooms = state.rooms.filter((room) => !room.suspended_at);
    const directPartnerIds = rooms.filter((room) => !room.is_group && room.partnerId).map((room) => room.partnerId);
    openSheet('<h3 style="margin:0">転送先を選んでください</h3><div class="meta">' + escapeHtml(messageSummary(item).slice(0,80)) + '</div>' +
        (rooms.length
            ? '<div class="grp-step"><label><b>会話から選ぶ</b><span>複数選べます</span></label><div class="pick" id="fwRooms">' + rooms.map(fwRoomRowHtml).join("") + '</div></div>'
            : '') +
        '<div class="grp-step"><label><b>人を選んで新しく送る</b><span>まだ会話がない人にも送れます・複数選べます</span></label>' + pickList(directPartnerIds) + '</div>' +
        '<div class="sheet-actions"><div class="grp-msg" id="fwMsg" role="alert" hidden></div><div class="row"><button type="button" class="button-secondary" data-pm="close">やめる</button><button type="button" class="button" id="fwSend" data-fw="send" disabled>転送</button></div></div>');
    pickInit();
    updateForwardButton();
}

function updateForwardButton(){
    const btn = document.getElementById("fwSend");
    if(!btn) return;
    const n = feat.fwRoomSel.size + (feat.pickSel ? feat.pickSel.size : 0);
    btn.disabled = n === 0;
    btn.textContent = n ? "選択した" + n + "件に転送" : "転送";
}

function onForwardChange(event){
    const box = event.target.closest("[data-fw-room]");
    if(box){
        if(box.checked) feat.fwRoomSel.add(box.dataset.fwRoom); else feat.fwRoomSel.delete(box.dataset.fwRoom);
        const row = box.closest(".pk-row");
        if(row) row.classList.toggle("on",box.checked);
    }
    updateForwardButton();
}

async function onForwardClick(event){
    const button = event.target.closest('[data-fw="send"]');
    if(!button || !feat.forwardItem) return;
    const roomIds = new Set(feat.fwRoomSel);
    const partnerIds = pickedIds();
    if(!roomIds.size && !partnerIds.length) return;
    button.disabled = true;
    const msgBox = document.getElementById("fwMsg");
    if(msgBox) msgBox.hidden = true;
    const payload = Object.assign({},feat.forwardItem,{forwarded:true});
    delete payload.replyTo;
    const client = requireClient();
    let okCount = 0, failCount = 0, madeNewRoom = false;
    for(const partnerId of partnerIds){
        try{
            const rpcResult = await client.rpc("create_or_get_direct_room",{p_partner_id:partnerId});
            if(rpcResult.error) throw rpcResult.error;
            if(!roomIds.has(rpcResult.data)) madeNewRoom = true;
            roomIds.add(rpcResult.data);
        }catch(_e){ failCount++; }
    }
    for(const roomId of roomIds){
        try{
            const result = await client.rpc("send_message",{p_room_id:roomId,p_content:JSON.stringify(payload)});
            if(result.error) throw result.error;
            okCount++;
        }catch(_e){ failCount++; }
    }
    feat.forwardItem = null;
    closeSheet();
    if(madeNewRoom){ try{ await loadRooms(); }catch(_e){ /* 一覧の更新に失敗しても転送自体は完了済み */ } }
    if(state.currentRoom && roomIds.has(state.currentRoom.id)) await loadMessages(false,true);
    if(okCount && !failCount) showToast(okCount + "件に転送しました。");
    else if(okCount) showToast(okCount + "件に転送しました（" + failCount + "件は失敗しました）。");
    else showToast("転送に失敗しました。");
}
