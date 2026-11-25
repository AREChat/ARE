"use strict";

function relativeAgo(ms){
    const minutes = Math.floor(ms / 60000);
    if(minutes < 1) return "1分未満前";
    if(minutes < 60) return minutes + "分前";
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? hours + "時間前" : Math.floor(hours / 24) + "日前";
}

// オフライン時の表記：「最終2時間前（26年11/17 14:16）」（日本時間）
function presenceDateText(ms){
    const q = {};
    new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Tokyo",year:"2-digit",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit",hour12:false}).formatToParts(new Date(ms)).forEach((x) => { q[x.type] = x.value; });
    return q.year + "年" + q.month + "/" + q.day + " " + (parseInt(q.hour,10) % 24) + ":" + q.minute;
}
function offlineText(seen){
    return seen ? "最終" + relativeAgo(Date.now() - seen) + "（" + presenceDateText(seen) + "）" : "オフライン";
}

// 管理者だけ（日本時間・平日＝月〜金）：
//   1:00〜3:00  → いつもオンライン表示
//   8:00〜20:00 → いつもオフライン表示（最後にオンラインだったのは、その日の3:00ということにする）
//   それ以外・土日 → ふつうの表示。ほかのユーザーは時間に関係なく ふつうの表示
const ADMIN_PRES_ID = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";
function adminPresence(){
    const p = {};
    new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Tokyo",weekday:"short",hour:"2-digit",hour12:false,year:"numeric",month:"2-digit",day:"2-digit"})
        .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    const hour = parseInt(p.hour,10) % 24;
    if(["Sat","Sun"].indexOf(p.weekday) >= 0) return null;
    if(hour >= 1 && hour < 3) return {cls:"online",text:STATUS_LABELS.online || "オンライン"};
    if(hour >= 8 && hour < 20){
        const three = new Date(p.year + "-" + p.month + "-" + p.day + "T03:00:00+09:00").getTime();
        return {cls:"offline",text:offlineText(three)};
    }
    return null;
}

function presenceOf(profile){
    if(profile && profile.id === ADMIN_PRES_ID){
        const o = adminPresence();
        if(o) return o;
    }
    const seen = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
    const age = Date.now() - seen;
    const status = profile?.presence_status;
    if(!seen || age > ONLINE_WINDOW_MS || !STATUS_LABELS[status]){
        return {cls:"offline",text:offlineText(seen)};
    }
    return {cls:status,text:STATUS_LABELS[status]};
}

function presenceHtml(profile){
    const p = presenceOf(profile);
    return '<span class="dot ' + p.cls + '"></span>' + escapeHtml(p.text);
}

// 上の名前の下：オンライン・退席中・取り込み中のときだけ文字を出す（オフラインの「最終…前」は出さない）。
// 状態は、アイコンの右下のマーク（Teams・Slack のような丸）で見せる
function headerPresenceHtml(profile){
    const p = presenceOf(profile);
    return p.cls === "offline" ? "" : '<span class="dot ' + p.cls + '"></span>' + escapeHtml(p.text);
}
// アイコンの右下のマーク用：data-pres に online / away / busy / offline を入れる（グループは外す）
function paintPresenceBadge(node, profile){
    if(!node) return;
    if(!profile){ node.removeAttribute("data-pres"); return; }
    node.setAttribute("data-pres", presenceOf(profile).cls);
}
function updateHeaderPresence(){
    if(state.currentRoom && !state.currentRoom.suspended_at){
        const group = !!state.currentRoom.is_group;
        el.chatSubtitle.innerHTML = group
            ? 'メンバー ' + (state.currentRoom.memberIds || []).length + '人 ・ タップでグループ情報'
            : headerPresenceHtml(state.currentPartner);
        paintPresenceBadge(el.chatAvatar, group ? null : state.currentPartner);
    }else if(el.chatAvatar){ paintPresenceBadge(el.chatAvatar, null); }
}

async function sendPresence(){
    let status = feat.manual;
    if(status === "online" && Date.now() - feat.lastActivity > IDLE_MS) status = "away";
    try{
        const result = await requireClient().rpc("set_my_presence",{p_status:status});
        if(result.error) throw result.error;
    }catch(error){ console.warn("Presence update failed:",error); }
}

async function refreshPresence(){
    const ids = [...new Set([...state.rooms.map((room) => room.partnerId),...state.recommendations.map((p) => p.id)].filter(Boolean))].slice(0,150);
    if(!ids.length) return;
    const result = await requireClient().from(TABLES.profiles).select("id,presence_status,last_seen_at,status_message,avatar_url").in("id",ids);
    if(result.error) return;
    const map = new Map((result.data || []).map((p) => [p.id,p]));
    const apply = (p) => { const n = p && map.get(p.id); if(n){ p.presence_status = n.presence_status; p.last_seen_at = n.last_seen_at; p.status_message = n.status_message; p.avatar_url = n.avatar_url; } };
    state.rooms.forEach((room) => apply(room.partner));
    state.recommendations.forEach(apply);
    apply(state.currentPartner);
    renderRooms(); renderRecommendations(); updateHeaderPresence();
}

function onActivity(){
    const wasIdle = Date.now() - feat.lastActivity > IDLE_MS;
    feat.lastActivity = Date.now();
    if(wasIdle) sendPresence();
}

const markReadCleared = {};   // room_id -> 最後に「他の端末の通知を消して」と頼んだ時刻（連打防止）
async function markRead(){
    if(!state.currentRoom || document.hidden) return;
    const roomId = state.currentRoom.id;
    try{ await requireClient().rpc("mark_room_read",{p_room_id:roomId}); }catch(_e){ return; }
    try{ pushCloseRoomNotifications(roomId); }catch(_e){}
    const now = Date.now();
    if(now - (markReadCleared[roomId] || 0) > 8000){
        markReadCleared[roomId] = now;
        pushClearRoomOnOtherDevices(roomId);
    }
}

async function loadPartnerRead(){
    if(!state.currentRoom) return;
    const roomId = state.currentRoom.id;
    const result = await requireClient().rpc("get_room_reads",{p_room_id:roomId});
    if(result.error || state.currentRoom?.id !== roomId) return;
    const times = (result.data || []).map((row) => new Date(row.last_read_at).getTime()).filter(Number.isFinite).sort();
    const key = times.join(",");
    if(key !== feat.readKey){ feat.readKey = key; feat.readTimes = times; if(feat.editingId === null) renderMessages(false); }
}

async function ensureMemberProfiles(room){
    const ids = (room.memberIds || []).filter((id) => id !== state.user.id && !feat.known.has(id));
    if(!ids.length) return;
    const result = await requireClient().from(TABLES.profiles).select("*").in("id",ids);
    (result.data || []).forEach((p) => feat.known.set(p.id,p));
}

async function loadPending(roomId){
    const result = await requireClient().from("message_delete_requests").select("message_id").eq("room_id",roomId).eq("requester_id",state.user.id).eq("status","pending");
    if(!result.error && state.currentRoom?.id === roomId) feat.pending = new Set((result.data || []).map((row) => row.message_id));
}

async function pollRoom(){
    if(!state.currentRoom || document.hidden) return;
    if(feat.editingId === null) await loadMessages(false,true);
    await Promise.all([loadPartnerRead(),loadScheduled()]);
    markRead();
}
