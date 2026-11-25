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

// 管理者は、いつでも「取り込み中」に見せる（日本時間・曜日・時刻に関係なく／オフラインのときも）。ほかのユーザーはふつうの表示。
//   ※「取り込み中」は表示だけのもの。通知（プッシュ・ポップアップ・着信）は、在席の状態をいっさい見ずに届ける
//     （tools/check-busy-notify.js が、通知まわりのファイルが在席の状態を読んでいないことを毎回たしかめる）
const ADMIN_PRES_ID = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";
function adminPresence(){
    return {cls:"busy",text:STATUS_LABELS.busy || "取り込み中"};
}

function presenceOf(profile){
    if(profile && profile.id === ADMIN_PRES_ID) return adminPresence();
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

// ===== 在席の状態は、すべて自動（自分では変えられません） =====
//   アプリを開いている → オンライン（緑）／5分以上さわっていない → 待機中（黄）／通話中 → 取り込み中（赤）／アプリを閉じた → オフライン
//   管理者は、いつでも 取り込み中（赤）。サーバーの set_my_presence も同じ（sql/admin_busy_v1.sql）
function autoStatus(){
    if(feat.isAdmin) return "busy";
    const t = window.AREtel && window.AREtel.state;
    if(t && t.call) return "busy";                                   // 電話中（かけている最中・つながったあと）
    if(Date.now() - feat.lastActivity > IDLE_MS) return "away";      // 5分以上、さわっていない
    return "online";
}
// 自分の「ステータス」の欄：いまの状態を見せるだけ（さわれない）
function paintMyStatus(status){
    try{
        if(!el.myStatus) return;
        el.myStatus.disabled = true;
        if(el.myStatus.value !== status) el.myStatus.value = status;
    }catch(_e){}
}

// 開いているタブの印（同じ人が ARE を複数のタブで開いているとき、1つ閉じただけでオフラインにしないため）
const PRES_TABS_KEY = "are_pres_tabs", PRES_TAB_ID = Math.random().toString(36).slice(2, 10);
function presTabsTouch(remove){
    try{
        const o = JSON.parse(localStorage.getItem(PRES_TABS_KEY) || "{}"), now = Date.now();
        Object.keys(o).forEach((k) => { if(!(now - o[k] < 90000)) delete o[k]; });
        if(remove) delete o[PRES_TAB_ID]; else o[PRES_TAB_ID] = now;
        localStorage.setItem(PRES_TABS_KEY, JSON.stringify(o));
        return Object.keys(o).filter((k) => k !== PRES_TAB_ID).length;
    }catch(_e){ return 0; }
}
async function sendPresence(){
    const status = autoStatus();
    paintMyStatus(status);
    feat.wentOffline = false;
    presTabsTouch(false);
    try{
        const client = requireClient();
        const result = await client.rpc("set_my_presence",{p_status:status});
        if(result.error) throw result.error;
        try{ const r = await client.auth.getSession(); feat.pTok = (r && r.data && r.data.session && r.data.session.access_token) || feat.pTok || ""; }catch(_e){}   // 閉じるときに使う（通信はしません）
    }catch(error){ console.warn("Presence update failed:",error); }
}
// アプリを閉じた（タブを閉じる・ページを離れる）ときは、すぐ「オフライン」にする。ほかのタブで開いているときは、しない。
// 送れなかったときも、30秒ごとの更新が止まるので、2分でオフライン表示になります（ONLINE_WINDOW_MS）
function presenceGoOffline(){
    const others = presTabsTouch(true);
    if(others > 0) return false;
    try{
        const c = window.ARE_CONFIG || {};
        if(!feat.pTok || !c.supabaseUrl) return false;
        feat.wentOffline = true;
        fetch(c.supabaseUrl + "/rest/v1/rpc/set_my_presence",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json",apikey:c.supabasePublishableKey || "",Authorization:"Bearer " + feat.pTok},body:JSON.stringify({p_status:"offline"})}).catch(() => {});
        return true;
    }catch(_e){ return false; }
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
