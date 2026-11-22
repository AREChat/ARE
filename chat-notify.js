"use strict";
// ===== 未読バッジ・新着ポップアップ =====
// ・チャット一覧に未読件数（赤い丸の数字）、左のタブにも合計、ブラウザのタブ名にも「(3)」と表示します。
// ・新しいメッセージが来たら画面の上にポップアップ（押すとそのチャットが開く）。ブラウザの通知を許可すれば、別のタブを見ていても通知されます。
// ・「どこまで読んだか」は、この端末のブラウザに保存するほか、サーバー（chat_room_members.last_read_at）にも記録されます。
//   別の端末（PC とスマホなど）で そのチャットを読むと、この端末の未読バッジ・ポップアップも自動で消えます
//   （サーバーの変更通知 ＋ 20 秒ごと／画面に戻ったときの確認。sql/read_sync_v1.sql）。
// ・ARE のページを開いている間だけ動きます（アプリを閉じている間のプッシュ通知は、無料の範囲ではできません）。

feat.unread = {};
const nf = {seen:{}, key:"", baseTitle:"", rooms:"", pop:null, timer:null, syncBusy:false, syncTimer:null, readTimer:null, readsChannel:null};

function nfLoad(){
    nf.key = "are_seen_" + state.user.id;
    try{ nf.seen = JSON.parse(localStorage.getItem(nf.key) || "{}") || {}; }catch(_e){ nf.seen = {}; }
}
function nfSave(){ try{ localStorage.setItem(nf.key, JSON.stringify(nf.seen)); }catch(_e){ /* 保存できなくても続ける */ } }

nf.liveNotif = {};   // room_id -> いま出しているブラウザ通知（Notification）。既読になったら閉じる
function nfMarkSeen(roomId, iso){
    if(!roomId) return;
    const now = new Date().toISOString();
    nf.seen[roomId] = iso && iso > now ? iso : now;
    nfSave();
    if(feat.unread[roomId]){ feat.unread[roomId] = 0; nfPaint(); }
    if(nf.liveNotif[roomId]){ try{ nf.liveNotif[roomId].close(); }catch(_e){} delete nf.liveNotif[roomId]; }
    try{ pushCloseRoomNotifications(roomId); }catch(_e){}
}

/** サーバーに記録された「どこまで読んだか」（自分の分だけ）。取れなければ null */
async function nfFetchReads(){
    try{
        const r = await requireClient().rpc("get_my_reads");
        if(r.error || !Array.isArray(r.data)) return null;
        const map = {};
        r.data.forEach((row) => {
            if(!row || !row.room_id || !row.last_read_at) return;
            const d = new Date(row.last_read_at);
            if(!isNaN(d.getTime())) map[row.room_id] = d.toISOString();
        });
        return map;
    }catch(_e){ return null; }
}

/** 別の端末で読んだ時刻（サーバーの時刻）を取り込む。この端末の「既読の位置」より進んでいれば更新して true を返す。
    （別の端末が読んだ位置が、この端末より古いときは何もしない） */
function nfApplyRead(roomId, iso){
    if(!roomId || !iso) return false;
    const d = new Date(iso);
    if(isNaN(d.getTime())) return false;
    const v = d.toISOString();
    if(v <= (nf.seen[roomId] || "")) return false;
    nf.seen[roomId] = v;
    nfSave();
    if(feat.unread[roomId]){
        // 別の端末で読まれた → この端末に出ている通知（ポップアップ・ブラウザ通知）も片づける
        if(nf.liveNotif[roomId]){ try{ nf.liveNotif[roomId].close(); }catch(_e){} delete nf.liveNotif[roomId]; }
        try{ pushCloseRoomNotifications(roomId); }catch(_e){}
    }
    return true;
}

/** 別の端末での既読を確認して、未読バッジを合わせる（20 秒ごと・画面に戻ったとき・通信が戻ったとき） */
async function nfSyncReads(){
    if(nf.syncBusy || !state.user || !(state.rooms || []).length) return;
    nf.syncBusy = true;
    try{
        const reads = await nfFetchReads();
        if(!reads) return;
        let needRecount = false;
        Object.keys(reads).forEach((id) => {
            const had = feat.unread[id] > 0;
            if(nfApplyRead(id, reads[id]) && had) needRecount = true;
        });
        if(needRecount) await nfRecount(true);
    }finally{ nf.syncBusy = false; }
}

/** サーバーからの変更通知（自分の last_read_at が変わった）を受けたとき */
function nfOnReadChange(row){
    if(!row || row.user_id !== state.user.id || !row.room_id || !row.last_read_at) return;
    const had = feat.unread[row.room_id] > 0;
    if(nfApplyRead(row.room_id, row.last_read_at) && had){
        clearTimeout(nf.readTimer);
        nf.readTimer = setTimeout(() => { nfRecount(true); }, 300);
    }
}

/** 一覧にある部屋の未読数を数え直す（部屋の一覧が変わったとき・戻ってきたとき）。
    「どこまで読んだか」は、サーバーに記録がある部屋はその時刻まで進める（別の端末で読んだ分）。
    この端末で初めて見る部屋は、サーバーの記録があればその続きから、なければ「いま」から数える */
async function nfRecount(skipReads){
    const rooms = state.rooms || [];
    if(!rooms.length) return;
    const reads = skipReads === true ? null : await nfFetchReads();
    const now = new Date().toISOString();
    let changed = false;
    rooms.forEach((r) => {
        const sv = reads && reads[r.id];
        if(!nf.seen[r.id]){ nf.seen[r.id] = sv && sv < now ? sv : now; changed = true; }
        else if(sv && sv > nf.seen[r.id]){ nf.seen[r.id] = sv; changed = true; }
    });
    if(changed) nfSave();
    const since = rooms.map((r) => nf.seen[r.id]).sort()[0];
    try{
        const res = await requireClient().from(TABLES.messages).select("room_id,created_at,sender_id").in("room_id", rooms.map((r) => r.id)).neq("sender_id", state.user.id).gt("created_at", since).order("created_at", {ascending:false}).limit(1000);
        if(res.error) return;
        const counts = {};
        (res.data || []).forEach((m) => { if(m.created_at > (nf.seen[m.room_id] || "")) counts[m.room_id] = (counts[m.room_id] || 0) + 1; });
        const cur = state.currentRoom && !document.hidden ? state.currentRoom.id : null;
        feat.unread = {};
        Object.keys(counts).forEach((id) => { if(id !== cur) feat.unread[id] = counts[id]; });
        if(cur) nfMarkSeen(cur);
        nfPaint();
    }catch(_e){ /* 取れなければそのまま */ }
}

function nfLabel(n){ return n > 99 ? "99+" : String(n); }

function nfTotal(){ return Object.values(feat.unread).reduce((a, b) => a + b, 0); }

/** 一覧・左タブ・タブ名に反映 */
function nfPaint(){
    document.querySelectorAll("#roomList [data-room-id]").forEach((b) => {
        const n = feat.unread[b.dataset.roomId] || 0;
        let badge = b.querySelector(".nf-badge");
        if(!n){ if(badge) badge.remove(); b.classList.remove("has-unread"); return; }
        if(!badge){ badge = document.createElement("span"); badge.className = "nf-badge"; b.appendChild(badge); }
        badge.textContent = nfLabel(n); badge.setAttribute("aria-label", "未読" + n + "件");
        b.classList.add("has-unread");
    });
    const total = nfTotal(), rail = document.querySelector('.rail-btn[data-tab="chats"]');
    if(rail){
        let badge = rail.querySelector(".nf-badge");
        if(!total){ if(badge) badge.remove(); }
        else{ if(!badge){ badge = document.createElement("span"); badge.className = "nf-badge nf-rail"; rail.appendChild(badge); } badge.textContent = nfLabel(total); }
    }
    document.title = (total ? "(" + total + ") " : "") + nf.baseTitle;
    try{ if(typeof cfPaintRooms === "function") cfPaintRooms(); }catch(_e){}
}

function nfNotifyBanner(){
    const list = el.roomList;
    if(!list || list.querySelector(".nf-ask") || !("Notification" in window) || Notification.permission !== "default") return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "nf-ask button-secondary";
    b.textContent = "🔔 新着をブラウザの通知でも受け取る";
    b.addEventListener("click", async () => {
        try{ const p = await Notification.requestPermission(); showToast(p === "granted" ? "通知をオンにしました。" : "通知は許可されませんでした。"); }catch(_e){ /* 無視 */ }
        b.remove();
    });
    list.prepend(b);
}

function nfOpenRoom(roomId){
    const room = (state.rooms || []).find((r) => r.id === roomId);
    if(room) selectRoom(room, room.partner);
}

function nfPopup(room, m){
    const group = Boolean(room.is_group);
    const roomName = group ? (room.name || "グループ") : profileDisplayName(room.partner);
    const who = group ? profileDisplayName(feat.known.get(m.sender_id)) + "（" + roomName + "）" : roomName;
    let body = "";
    try{ body = contentLine(m.content); }catch(_e){ body = "新しいメッセージ"; }
    body = String(body || "").replace(/\s+/g, " ").slice(0, 80);
    if(nf.pop) nf.pop.remove();
    const pop = document.createElement("button");
    pop.type = "button"; pop.className = "nf-pop";
    pop.innerHTML = '<strong>💬 ' + escapeHtml(who) + '</strong><span>' + escapeHtml(body) + '</span>';
    pop.addEventListener("click", () => { pop.remove(); nfOpenRoom(room.id); });
    document.body.appendChild(pop); nf.pop = pop;
    clearTimeout(nf.timer);
    nf.timer = setTimeout(() => { pop.remove(); if(nf.pop === pop) nf.pop = null; }, 6000);
    if("Notification" in window && Notification.permission === "granted" && document.hidden){
        try{
            const n = new Notification("ARE：" + who, {body, tag:room.id});
            n.onclick = () => { window.focus(); nfOpenRoom(room.id); n.close(); };
            nf.liveNotif[room.id] = n;
        }catch(_e){ /* 通知できない端末 */ }
    }
}

function nfOnInsert(m){
    if(m && m.room_id){ try{ if(typeof cfTouch === "function") cfTouch(m.room_id, m.created_at || new Date().toISOString()); }catch(_e){} }
    if(!m || m.sender_id === state.user.id) return;
    const room = (state.rooms || []).find((r) => r.id === m.room_id);
    if(!room){ if(typeof loadRooms === "function") setTimeout(loadRooms, 500); return; }
    if(state.currentRoom && state.currentRoom.id === m.room_id && !document.hidden){
        nfMarkSeen(m.room_id, m.created_at);
        try{ markRead(); }catch(_e){ /* 8 秒ごとの確認でも記録される */ }   // すぐサーバーに記録 → ほかの端末の未読も すぐ消える
        return;
    }
    feat.unread[m.room_id] = (feat.unread[m.room_id] || 0) + 1;
    try{ if(typeof cfTouch === "function") cfTouch(m.room_id, m.created_at); }catch(_e){}
    nfPaint();
    nfPopup(room, m);
}

function initNotify(){
    nfLoad();
    nf.baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    // 一覧を描き直すたびにバッジをつけ直す
    const orig = renderRooms;
    renderRooms = function(){
        orig.apply(this, arguments);
        nfPaint(); nfNotifyBanner();
        const ids = (state.rooms || []).map((r) => r.id).join(",");
        if(ids !== nf.rooms){ nf.rooms = ids; nfRecount(); }
    };
    addRoomHook((room) => { if(room) nfMarkSeen(room.id); });
    document.addEventListener("visibilitychange", () => {
        if(document.hidden) return;
        if(state.currentRoom) nfMarkSeen(state.currentRoom.id);
        nfRecount();
    });
    requireClient().channel("are-inbox").on("postgres_changes", {event:"INSERT", schema:"public", table:TABLES.messages}, (payload) => nfOnInsert(payload.new)).subscribe();
    feat.timers.push(setInterval(() => { if(!document.hidden) nfRecount(); }, 60000));   // 取りこぼし対策
    // ===== 未読の同期：ほかの端末で読んだら、この端末の未読も消える =====
    // ① サーバーの変更通知：自分の last_read_at が変わったら すぐ反映（sql/read_sync_v1.sql で通知を有効にしてある）
    try{
        nf.readsChannel = requireClient().channel("are-reads").on("postgres_changes", {event:"UPDATE", schema:"public", table:TABLES.members, filter:"user_id=eq." + state.user.id}, (payload) => nfOnReadChange(payload.new)).subscribe();
    }catch(_e){ /* 通知が使えなくても、下の ② ③ で同期される */ }
    // ② 20 秒ごとの確認（通知の取りこぼし対策・画面が見えているときだけ）
    feat.timers.push(setInterval(() => { if(!document.hidden) nfSyncReads(); }, 20000));
    // ③ 画面に戻ったとき・ウィンドウが選ばれたとき・通信が戻ったとき
    window.addEventListener("focus", () => { nfSyncReads(); });
    window.addEventListener("online", () => { nfSyncReads(); });
    if(state.rooms && state.rooms.length){ nf.rooms = state.rooms.map((r) => r.id).join(","); nfRecount(); nfNotifyBanner(); }
}
