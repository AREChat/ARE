"use strict";
// ===== 入力中の表示（Realtime のプライベートチャンネル。保存はしません） =====
// ・開いているチャット：画面の上と、入力欄の上に「入力中」を出します（自分の入力中は、この画面にだけ出ます）。
// ・左の一覧：相手が入力中のチャットは、相手の名前の下に「✏️ 入力中…」を出します（自分の入力中は、一覧には出しません）。
//   開いていないチャットの入力中も出せるよう、参加している部屋ごとに 1 本ずつ チャンネルをつないでおきます（最大 40 本）。
//   同じ部屋に 2 本つながないよう、開いている部屋のチャンネルも この一覧（t.ch）の中の 1 本です。

feat.typing = {channel:null,roomId:null,last:0,own:0,who:new Map(),timer:null,retry:0,ch:new Map(),by:new Map(),fail:new Map(),syncing:false,dirty:false};
const TYPING_MAX_CHANNELS = 40;

function initTyping(){
    const t = feat.typing;
    addRoomHook((room) => {
        t.roomId = (room && !room.suspended_at) ? room.id : null;
        t.retry = 0;
        typingBindCurrent();
        typingSync();
        paintTyping();
    });
    // 一覧を作り直したとき（新しいチャットが増えた・減った）にも、つなぎ直す／消す
    const origRender = renderRooms;
    renderRooms = function(){
        origRender.apply(this, arguments);
        try{ typingSync(); paintTyping(); }catch(_e){ /* 一覧の表示は止めない */ }
    };
    el.messageInput.addEventListener("input",() => { t.own = el.messageInput.value.trim() ? Date.now() : 0; paintTyping(); sendTyping(); });
    el.messageInput.addEventListener("blur",() => { t.own = 0; paintTyping(); });
    t.timer = setInterval(() => paintTyping(),500);   // 毎回 いまの paintTyping（chat-nick.js が包んだもの）を呼ぶ
}

// いま開いている部屋の（つないである）チャンネルと、入力中の人の一覧を 結びなおす
function typingBindCurrent(){
    const t = feat.typing;
    t.channel = t.roomId ? (t.ch.get(t.roomId) || null) : null;
    if(t.roomId){
        let m = t.by.get(t.roomId);
        if(!m){ m = new Map(); t.by.set(t.roomId,m); }
        t.who = m;
    }else t.who = new Map();
}

// 非公開チャンネルなので、ログイン中の鍵（アクセストークン）を必ず渡す。
// 鍵なしの setAuth() は、この版の supabase-js では鍵を消してしまい、つながらなくなる（Unauthorized）。
async function typingAuth(){
    try{
        if(state.client && state.client.realtime && state.client.realtime.setAuth){
            const sess = await state.client.auth.getSession();
            const tk = sess && sess.data && sess.data.session && sess.data.session.access_token;
            if(tk) await state.client.realtime.setAuth(tk);
        }
    }catch(_e){ /* 続行 */ }
}

function typingWantedRooms(){
    if(!state.user) return [];
    const out = [], seen = new Set();
    const add = (room) => { if(room && room.id && !seen.has(room.id) && !room.orphan && !room.suspended_at){ seen.add(room.id); out.push(room.id); } };
    add(state.currentRoom);                                              // 開いている部屋は、いつも先頭
    (state.rooms || []).filter((r) => !r.is_group).forEach(add);          // 1対1を先に、
    (state.rooms || []).forEach(add);                                    // そのあとグループ
    return out.slice(0,TYPING_MAX_CHANNELS);
}

async function typingSync(){
    const t = feat.typing;
    if(t.syncing){ t.dirty = true; return; }
    t.syncing = true;
    try{
        do{
            t.dirty = false;
            const want = typingWantedRooms(), wantSet = new Set(want);
            // いらなくなった部屋は閉じる
            for(const [rid,channel] of Array.from(t.ch.entries())){
                if(wantSet.has(rid)) continue;
                t.ch.delete(rid); t.by.delete(rid);
                try{ await state.client.removeChannel(channel); }catch(_e){ /* 何もしない */ }
            }
            typingBindCurrent();
            // 足りない部屋は つなぐ（少しずつ）
            const missing = want.filter((rid) => !t.ch.has(rid) && Date.now() - (t.fail.get(rid) || 0) > 60000);
            if(missing.length){
                await typingAuth();
                for(const rid of missing){
                    if(!state.user || t.ch.has(rid)) continue;
                    typingJoin(rid);
                    typingBindCurrent();
                    if(missing.length > 3) await new Promise((r) => setTimeout(r,120));
                    if(t.dirty) break;
                }
            }
        }while(t.dirty);
    }catch(error){ console.warn("[ARE typing] sync",error); }
    t.syncing = false;
}

function typingJoin(roomId){
    const t = feat.typing;
    const channel = state.client.channel("typing:" + roomId,{config:{private:true,broadcast:{self:false}}});
    t.ch.set(roomId,channel);
    channel
        .on("broadcast",{event:"typing"},(message) => {
            const data = message && message.payload;
            if(!data || !state.user || data.uid === state.user.id) return;     // 自分の入力は 受けない
            let m = t.by.get(roomId);
            if(!m){ m = new Map(); t.by.set(roomId,m); }
            m.set(String(data.uid),{name:String(data.name || "相手").slice(0,30),until:Date.now() + 4000});
            if(roomId === t.roomId) t.who = m;
            paintTyping();
        })
        .subscribe((status) => {
            if(status === "SUBSCRIBED"){ if(roomId === t.roomId) t.retry = 0; return; }
            if(status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
            console.warn("[ARE typing]",status,roomId === t.roomId ? "(開いている部屋)" : "(一覧用)");
            if(t.ch.get(roomId) !== channel) return;
            // つながらなかった とき：その部屋は いったん閉じて、少し待って やりなおす
            t.ch.delete(roomId);
            try{ state.client.removeChannel(channel); }catch(_e){ /* 何もしない */ }
            if(roomId === t.roomId && t.retry < 3){
                t.retry++;
                setTimeout(() => { typingBindCurrent(); typingSync(); },2000 * t.retry);
            }else{
                t.fail.set(roomId,Date.now());                               // 一覧用は 1 分あけて やりなおす
                setTimeout(() => { typingSync(); },61000);
            }
            typingBindCurrent();
        });
}

function sendTyping(){
    const t = feat.typing;
    if(!t.channel || t.channel.state !== "joined") return;
    if(!el.messageInput.value.trim() || Date.now() - t.last < 2500) return;
    t.last = Date.now();
    t.channel.send({type:"broadcast",event:"typing",payload:{uid:state.user.id,name:profileDisplayName(state.profile)}});
}

// 「自分が入力中」の文字（chat-nick.js からも使う。開いているチャットの画面にだけ出す）
function typingOwnPart(){
    const t = feat.typing;
    return (t && t.own && Date.now() - t.own < 3000 && el.messageInput.value.trim()) ? "✍ 自分が入力中…" : "";
}

// 部屋ごとの「いま入力中の人の名前」（時間が切れた人は消す）。相手だけ。自分は入っていません。
function typingNamesByRoom(){
    const now = Date.now(), out = new Map();
    feat.typing.by.forEach((m,rid) => {
        const names = [];
        m.forEach((entry,uid) => { if(entry.until > now) names.push({uid,name:entry.name}); else m.delete(uid); });
        if(names.length) out.set(rid,names);
    });
    return out;
}

function paintTyping(){
    const line = document.getElementById("typingLine");
    if(!line) return;
    const names = (feat.typing.roomId && typingNamesByRoom().get(feat.typing.roomId) || []).map((w) => w.name);
    const parts = [];
    const own = typingOwnPart(); if(own) parts.push(own);
    if(names.length) parts.push("✍ " + names.slice(0,3).join("、") + " さんが入力中…");
    line.textContent = parts.join("　");
}
