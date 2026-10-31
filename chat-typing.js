"use strict";
// ===== 入力中の表示（Realtime のプライベートチャンネル。保存はしません） =====

feat.typing = {channel:null,roomId:null,last:0,own:0,who:new Map(),timer:null,retry:0};

function initTyping(){
    addRoomHook((room) => { teardownTyping(); if(room && !room.suspended_at) setupTyping(room.id); });
    el.messageInput.addEventListener("input",() => { feat.typing.own = el.messageInput.value.trim() ? Date.now() : 0; paintTyping(); sendTyping(); });
    el.messageInput.addEventListener("blur",() => { feat.typing.own = 0; paintTyping(); });
}

function teardownTyping(){
    const t = feat.typing;
    if(t.channel){ try{ state.client.removeChannel(t.channel); }catch(_e){ /* 何もしない */ } }
    t.channel = null; t.roomId = null; t.who = new Map();
    clearInterval(t.timer); t.timer = null;
    paintTyping();
}

async function setupTyping(roomId){
    const t = feat.typing;
    t.roomId = roomId;
    try{ if(state.client.realtime && state.client.realtime.setAuth) await state.client.realtime.setAuth(); }catch(_e){ /* 続行 */ }
    if(t.roomId !== roomId) return;
    t.channel = state.client.channel("typing:" + roomId,{config:{private:true,broadcast:{self:false}}})
        .on("broadcast",{event:"typing"},(message) => {
            const data = message && message.payload;
            if(!data || data.uid === state.user.id) return;
            t.who.set(String(data.uid),{name:String(data.name || "相手").slice(0,30),until:Date.now() + 4000});
            paintTyping();
        })
        .subscribe((status) => {
            // つながらなかった とき：少し待って やりなおす（3回まで）
            if((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && t.roomId === roomId && t.retry < 3){
                t.retry++; console.warn("[ARE typing]",status,"retry",t.retry);
                setTimeout(() => { if(t.roomId === roomId){ const room = state.currentRoom; teardownTyping(); if(room) setupTyping(room.id); } },2000 * t.retry);
            }
            if(status === "SUBSCRIBED") t.retry = 0;
        });
    t.timer = setInterval(paintTyping,500);
}

function sendTyping(){
    const t = feat.typing;
    if(!t.channel || t.channel.state !== "joined") return;
    if(!el.messageInput.value.trim() || Date.now() - t.last < 2500) return;
    t.last = Date.now();
    t.channel.send({type:"broadcast",event:"typing",payload:{uid:state.user.id,name:profileDisplayName(state.profile)}});
}

// 「自分が入力中」の文字（chat-nick.js からも使う）
function typingOwnPart(){
    const t = feat.typing;
    return (t && t.own && Date.now() - t.own < 3000 && el.messageInput.value.trim()) ? "✍ 自分が入力中…" : "";
}

function paintTyping(){
    const line = document.getElementById("typingLine");
    if(!line) return;
    const now = Date.now(), names = [];
    feat.typing.who.forEach((entry,uid) => { if(entry.until > now) names.push(entry.name); else feat.typing.who.delete(uid); });
    const parts = [];
    const own = typingOwnPart(); if(own) parts.push(own);
    if(names.length) parts.push("✍ " + names.slice(0,3).join("、") + " さんが入力中…");
    line.textContent = parts.join("　");
}
