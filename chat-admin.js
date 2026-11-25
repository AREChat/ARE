"use strict";

// 管理者が削除したあと、Supabase のストレージに残った添付ファイルを すぐ消す（Supabase の削除トリガー ＋ Edge Function purge-storage）。
// ・待たない／失敗しても何も起きない（5分ごとの自動掃除が やり直す）。メッセージの管理者削除（admin-api）は 自分でこれを行う。
function purgeStorageSoon(){
    try{ const p = requireClient().functions.invoke("purge-storage",{body:{action:"drain"}}); if(p && p.catch) p.catch(() => {}); }catch(_e){}
}

function attachmentText(content){
    const item = parseMessageContent(content);
    if(item.type === "text") return escapeHtml(item.text || "");
    const url = safeHttpUrl(item.url);
    const label = "[" + escapeHtml(item.type) + "] " + escapeHtml(item.name || "添付");
    return url ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : label;
}

async function checkAdmin(){
    try{ const result = await requireClient().rpc("is_current_user_admin"); feat.isAdmin = result.data === true; }
    catch(_e){ feat.isAdmin = false; }
    try{ localStorage.setItem("are_is_admin_ui", feat.isAdmin ? "1" : "0"); }catch(_e){ /* 操作ガイドの表示用。保存できなくても問題なし */ }
    if(typeof emgPaint === "function") emgPaint();
    el.adminTabButton.hidden = !feat.isAdmin;
    // 管理者は、いつでも「取り込み中」：自分のステータスの選択を「取り込み中」にして変えられなくする（保存はしない＝管理者でなくなったら、前の選択にもどる）
    try{
        if(el.myStatus){
            if(feat.isAdmin){ el.myStatus.value = "busy"; el.myStatus.disabled = true; }
            else if(el.myStatus.disabled){ el.myStatus.disabled = false; el.myStatus.value = feat.manual; }
        }
        if(feat.isAdmin) sendPresence();
    }catch(_e){ /* 表示だけ。続ける */ }
    { const rr = el.readReceiptToggle && el.readReceiptToggle.closest("label"); if(rr) rr.style.display = feat.isAdmin ? "none" : ""; }   // 管理者は「既読を相手に表示する」設定なし：管理者の既読は 相手に出ず（送信済みのまま）、管理者には 常に既読が見える
    try{ if(state.allRooms){ state.rooms = state.allRooms.filter((room) => !room.orphan || feat.isAdmin); renderRooms(); } }catch(_e){}   // 管理者かどうかが分かったら、一覧を作り直す（削除ずみユーザーのチャットの 表示・非表示）
    // 管理者アカウントなのに TOTP（追加認証）がまだ → 管理者機能は ふさがれている。案内を出して 認証の画面へ つなぐ
    if(!feat.isAdmin){
        try{
            const role = await requireClient().rpc("current_user_is_admin");
            if(role.data === true){
                if(el.securityBanner){
                    el.securityBanner.innerHTML = '🛡️ 管理者アカウントです。管理者機能を使うには、認証アプリの確認（TOTP）が必要です。 <button type="button" class="button-secondary" id="adminMfaOpen">認証する</button>';
                    el.securityBanner.hidden = false;
                    const open = document.getElementById("adminMfaOpen");
                    if(open) open.addEventListener("click",() => { if(typeof openAdminSecurity === "function") openAdminSecurity(); });
                }
                if(!feat.adminMfaPrompted && typeof openAdminSecurity === "function"){ feat.adminMfaPrompted = true; setTimeout(() => { try{ openAdminSecurity(); }catch(_e){} },600); }
            }
        }catch(_e){}
    }else if(el.securityBanner && document.getElementById("adminMfaOpen")){ el.securityBanner.hidden = true; el.securityBanner.textContent = ""; }
    if(window.AREProtect) window.AREProtect.setExempt(feat.isAdmin);
    if(feat.isAdmin) el.delCard.hidden = true;
    if(feat.isAdmin && state.currentRoom && state.messages.length) renderMessages(false);
    if(feat.posts && feat.posts.length) renderPosts();
    if(feat.isAdmin){ refreshAdminBadge(); feat.timers.push(setInterval(refreshAdminBadge,30000)); }
}

async function refreshAdminBadge(){
    const result = await requireClient().rpc("admin_list_delete_requests",{p_status:"pending"});
    const acct = await requireClient().rpc("admin_list_account_deletion_requests");
    const total = (result.error ? 0 : result.data.length) + (acct.error ? 0 : acct.data.length);
    el.adminBadge.textContent = total ? String(total) : "";
}

async function renderAdmin(){
    el.adminBody.innerHTML = '<div class="empty-list">読み込み中...</div>';
    document.querySelectorAll("[data-admin-view]").forEach((b) => b.classList.toggle("active",b.dataset.adminView === feat.adminView));
    try{
        const client = requireClient();
        if(feat.adminView === "security"){
            await renderAdminSecurity(client);
        }else if(feat.adminView === "acctdel"){
            await renderAdminAcctDel(client);
        }else if(feat.adminView === "backup"){
            await renderAdminBackup(client);
        }else if(feat.adminView === "users"){
            await renderAdminUsers(client);
        }else if(feat.adminView === "stats"){
            await renderAdminStats(client);
        }else if(feat.adminView === "announce"){
            await renderAdminAnnounce(client);
        }else if(feat.adminView === "shop"){
            await renderAdminShop(client);
        }else if(feat.adminView === "ng"){
            await renderAdminNg(client);
        }else if(feat.adminView === "reports"){
            await renderAdminReports(client);
        }else if(feat.adminView === "requests"){
            const result = await client.rpc("admin_list_delete_requests",{p_status:"pending"});
            if(result.error) throw result.error;
            el.adminBody.innerHTML = result.data.length ? result.data.map((r) =>
                '<div class="admin-card"><div class="meta">' + escapeHtml(r.requester_name || "ユーザー") + ' ・ ' + escapeHtml(formatDate(r.created_at)) + '</div>' +
                '<div>' + attachmentText(r.message_content) + '</div><div class="meta">理由：' + escapeHtml(r.reason || "（なし）") + '</div>' +
                '<div class="row"><button class="button" data-decide="approve" data-id="' + escapeHtml(r.id) + '" type="button">承認して削除</button>' +
                '<button class="button-secondary" data-decide="reject" data-id="' + escapeHtml(r.id) + '" type="button">却下</button>' +
                '<button class="button-secondary" data-admin-room="' + escapeHtml(r.room_id) + '" type="button">会話を見る</button></div></div>').join("")
                : '<div class="empty-list">承認待ちの削除申請はありません。</div>';
        }else{
            const result = await client.rpc("admin_list_rooms",{p_limit:100});
            if(result.error) throw result.error;
            el.adminBody.innerHTML = result.data.length ? result.data.map((r) => {
                const title = (r.members || []).map((m) => m.name || "ユーザー").join(" ⇄ ");
                return '<button class="admin-card" data-admin-room="' + escapeHtml(r.room_id) + '" data-title="' + escapeHtml(title) + '" type="button"><b>' + escapeHtml(title) + '</b>' +
                    (r.suspended_at ? ' <span class="pending">（停止中）</span>' : '') +
                    '<div class="meta">' + escapeHtml(String(r.message_count)) + '件 ・ 最終：' + escapeHtml(r.last_message_at ? formatDate(r.last_message_at) : "なし") + '</div></button>';
            }).join("") : '<div class="empty-list">会話はまだありません。</div>';
        }
    }catch(error){ el.adminBody.innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

async function openAdminRoom(roomId,title){
    el.adminBody.innerHTML = '<div class="empty-list">読み込み中...</div>';
    try{
        const result = await requireClient().rpc("admin_get_room_messages",{p_room_id:roomId,p_limit:300});
        if(result.error) throw result.error;
        const rows = result.data.slice().reverse();
        const readsResult = await requireClient().rpc("admin_get_room_reads",{p_room_id:roomId});
        const reads = readsResult.error ? [] : readsResult.data;
        const readLabel = (m) => {
            const partner = reads.find((x) => x.user_id !== m.sender_id);
            if(!partner) return "";
            const read = partner.last_read_at && new Date(partner.last_read_at).getTime() >= new Date(m.created_at).getTime();
            return read ? " ・既読" + (partner.read_receipts_enabled === false ? "（相手に既読を表示しない設定）" : "") : " ・未読";
        };
        el.adminBody.innerHTML = '<button class="button-secondary" data-back="1" type="button">← 一覧へ戻る</button><b>' + escapeHtml(title || "会話") + '</b>' +
            (rows.length ? rows.map((m) => '<div class="admin-card admin-msg' + (m.deleted_at ? ' deleted' : '') + '"><div class="meta">' + escapeHtml(m.sender_name || "ユーザー") + ' ・ ' + escapeHtml(formatDate(m.created_at)) +
                (m.edited_at ? ' ・編集済み' : '') + (m.deleted_at ? ' ・削除済み' : '') + readLabel(m) + '</div><div>' + attachmentText(m.content) + '</div></div>').join("") : '<div class="empty-list">メッセージはありません。</div>');
    }catch(error){ el.adminBody.innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

const AU_SEG_LABEL = {home:"🏠 家庭", work:"💼 社員", friend:"🧑‍🤝‍🧑 友達", other:"🙂 その他"};
const auSt = {rows:null, seg:"all", sort:"new"};
const AU_SORTS = [["new","新しい順"], ["old","古い順"], ["used","使用頻度：高い順"], ["unused","使用頻度：低い順"], ["name","名前順"]];

function auSortRows(rows, sort){
    const r = rows.slice();
    if(sort === "old") r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if(sort === "used") r.sort((a, b) => (b.msg_count || 0) - (a.msg_count || 0));
    else if(sort === "unused") r.sort((a, b) => (a.msg_count || 0) - (b.msg_count || 0));
    else if(sort === "name") r.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "", "ja"));
    else r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return r;
}
function auFilterBar(){
    const segs = [["all", "全体"], ["home", "🏠 家庭のみ"], ["friend", "🧑‍🤝‍🧑 友達のみ"], ["work", "💼 社員のみ"], ["other", "🙂 その他のみ"]];
    return '<div class="row" style="flex-wrap:wrap">' + segs.map((s) => '<button type="button" class="' + (auSt.seg === s[0] ? "button" : "button-secondary") + '" data-auseg="' + s[0] + '">' + s[1] + '</button>').join("") + '</div>' +
        '<div class="row" style="flex-wrap:wrap;align-items:center"><span class="meta">並び順</span>' + AU_SORTS.map((s) => '<button type="button" class="' + (auSt.sort === s[0] ? "button" : "button-secondary") + '" data-ausort="' + s[0] + '">' + s[1] + '</button>').join("") + '</div>';
}
function auUserCard(u){
    const seg = u.segment ? ('<span class="meta">' + (AU_SEG_LABEL[u.segment] || u.segment) + '</span> ') : "";
    const used = u.msg_count !== undefined ? ' ・送信 ' + u.msg_count + '件' : "";
    return '<div class="admin-card">' + (u.is_admin ? '' : '<label class="row" style="gap:6px;align-items:center"><input type="checkbox" data-selu="' + escapeHtml(u.user_id) + '" data-name="' + escapeHtml(u.display_name || "ユーザー") + '"> <span class="meta">選ぶ（まとめて削除）</span></label>') +
        '<b>' + escapeHtml(u.display_name || "ユーザー") + '</b> ' + seg + '<span class="meta">ID：' + escapeHtml(u.login_id || "-") + (u.last_seen_at ? ' ・最終：' + escapeHtml(presenceDateText(u.last_seen_at)) : '') + escapeHtml(used) + '</span>' +
        '<div class="row"><button class="button-secondary" data-contact="' + escapeHtml(u.user_id) + '" type="button">連絡先を表示（閲覧は記録されます）</button></div>' + (u.is_admin ? '<div class="meta">管理者アカウント（再発行不可）</div>' : '<div class="row"><button class="button-secondary" data-edituser="' + escapeHtml(u.user_id) + '" type="button">編集</button><button class="button-secondary" data-reissue="' + escapeHtml(u.user_id) + '" data-name="' + escapeHtml(u.display_name || "ユーザー") + '" type="button">復旧コードを再発行</button><button class="button-danger" data-deluser="' + escapeHtml(u.user_id) + '" data-name="' + escapeHtml(u.display_name || "ユーザー") + '" type="button">アカウントを削除</button></div>') + '</div>';
}
function auPaintList(){
    const list = el.adminBody.querySelector("#auList"); if(!list || !auSt.rows) return;
    const filtered = auSt.seg === "all" ? auSt.rows : auSt.rows.filter((u) => u.segment === auSt.seg);
    const rows = auSortRows(filtered, auSt.sort);
    list.innerHTML = rows.length ? rows.map(auUserCard).join("") : '<div class="empty-list">このグループのユーザーはいません。</div>';
    const bar = el.adminBody.querySelector("#auBar"); if(bar) bar.innerHTML = auFilterBar();
}
function auGroupCard(r){
    const title = r.group_name || (r.members || []).map((m) => m.name || "ユーザー").join(" / ") || "グループ";
    return '<div class="admin-card"><b>👥 ' + escapeHtml(title) + '</b> <span class="meta">' + escapeHtml(String((r.members || []).length)) + '人 ・ ' + escapeHtml(String(r.message_count || 0)) + '件' +
        (r.last_message_at ? ' ・最終：' + escapeHtml(formatDate(r.last_message_at)) : '') + '</span>' +
        '<div class="row"><button class="button-secondary" data-admin-room="' + escapeHtml(r.room_id) + '" data-title="' + escapeHtml(title) + '" type="button">会話を見る</button>' +
        '<button class="button-danger" data-delgroup="' + escapeHtml(r.room_id) + '" data-gname="' + escapeHtml(title) + '" type="button">グループを削除</button></div></div>';
}
async function renderAdminUsers(client){
    let rows, hasSeg = true;
    const v2 = await client.rpc("admin_list_profiles_v2");
    if(v2.error){
        hasSeg = false;
        const v1 = await client.rpc("admin_list_profiles");
        if(v1.error) throw v1.error;
        rows = v1.data;
    }else{ rows = v2.data; }
    auSt.rows = rows;
    let groupsHtml = "";
    try{
        const rr = await client.rpc("admin_list_rooms",{p_limit:200});
        if(!rr.error){
            const groups = (rr.data || []).filter((r) => r.is_group);
            groupsHtml = '<div class="section-heading"><h2>👥 グループ管理（' + groups.length + '件）</h2></div>' +
                (groups.length ? groups.map(auGroupCard).join("") : '<div class="empty-list">グループはありません。</div>');
        }
    }catch(_e){ /* グループ一覧が取れなくてもユーザー管理は続ける */ }
    el.adminBody.innerHTML = '<div class="row"><button class="button" id="adminCreateUser" type="button">＋ 新規アカウントを作成</button></div><div class="row"><button class="button-secondary" data-bulk="all" type="button">全員を選ぶ／解除</button><button class="button-secondary" data-bulk="noname" type="button">名前なし（「ユーザー」）だけ選ぶ</button><button class="button-secondary" data-bulk="orphan" type="button">削除ずみユーザーの残りチャットを消す</button><button class="button-danger" data-bulk="del" id="adminBulkDel" type="button" disabled>選んだユーザーを削除（0人）</button></div><div class="admin-card meta">復旧コードを失くした利用者に対する再発行です。必ず本人確認を行ってから実行してください。新しいコードは画面に1回だけ表示され、保存されません。旧コードは無効になり、利用者本人にも再発行の通知が表示されます。</div>' +
        (hasSeg ? '<div id="auBar">' + auFilterBar() + '</div>' : '<div class="meta">（グループ・使用頻度の表示には admin_list_profiles_v2.sql の実行が必要です）</div>') +
        '<div id="auList"></div>' + groupsHtml;
    if(hasSeg) auPaintList();
    else el.adminBody.querySelector("#auList").innerHTML = rows.length ? rows.map(auUserCard).join("") : '<div class="empty-list">ユーザーがいません。</div>';
    el.adminBody.onchange = updateBulkCount;
}

function selectedUsers(){
    return Array.from(el.adminBody.querySelectorAll("input[data-selu]:checked")).map((c) => ({uid:c.dataset.selu,name:c.dataset.name}));
}
function updateBulkCount(){
    const b = document.getElementById("adminBulkDel"); if(!b) return;
    const n = selectedUsers().length;
    b.disabled = n === 0; b.textContent = "選んだユーザーを削除（" + n + "人）";
}

async function reissueRecovery(userId,name){
    const note = window.prompt(name + " さんの復旧コードを再発行します。\n本人確認の方法を入力してください（5文字以上・監査ログに記録されます）。\n例：登録電話番号に電話して確認","");
    if(note === null) return;
    if(!window.confirm("本当に再発行しますか？\n・旧い復旧コードは使えなくなります\n・新しいコードは1回しか表示されません")) return;
    try{
        const result = await requireClient().rpc("admin_reissue_recovery_code",{p_user_id:userId,p_verification_note:note});
        if(result.error) throw result.error;
        const code = String(result.data);
        el.adminBody.innerHTML = '<div class="admin-card"><b>' + escapeHtml(name) + ' さんの新しい復旧コード</b><div class="code-box">' + escapeHtml(code) + '</div>' +
            '<div class="meta">この画面を閉じると二度と表示できません。本人確認が済んだ本人にだけ、安全な方法で伝えてください。このコードで対象アカウントのパスワードを変更できます。</div>' +
            '<div class="row"><button class="button" data-copycode="' + escapeHtml(code) + '" type="button">コピー</button><button class="button-secondary" data-codeclose="1" type="button">閉じる（再表示不可）</button></div></div>';
    }catch(error){ showToast(featError(error)); }
}

async function onAdminClick(event){
    const target = event.target.closest("button");
    if(!target) return;
    if(target.dataset.back) return renderAdmin();
    if(target.dataset.auseg){ auSt.seg = target.dataset.auseg; auPaintList(); return; }
    if(target.dataset.ausort){ auSt.sort = target.dataset.ausort; auPaintList(); return; }
    if(target.dataset.adminRoom) return openAdminRoom(target.dataset.adminRoom,target.dataset.title);
    if(target.dataset.contact){
        try{
            const result = await requireClient().rpc("admin_get_user_contact",{p_user_id:target.dataset.contact});
            if(result.error) throw result.error;
            const row = (result.data && result.data[0]) || {};
            const box = document.createElement("div");
            box.className = "meta";
            box.textContent = "電話：" + (row.phone_number || "未登録") + " ／ メール：" + (row.contact_email || "未登録");
            target.replaceWith(box);
        }catch(error){ showToast(featError(error)); }
        return;
    }
    if(target.id === "adminCreateUser") return openCreateUser();
    if(target.dataset.edituser) return openEditUser(target.dataset.edituser);
    if(target.dataset.delgroup){
        feat.delGroupTarget = {id:target.dataset.delgroup, name:target.dataset.gname};
        openSheet('<h3 style="margin:0">⚠️ グループを削除します</h3><div><b>' + escapeHtml(target.dataset.gname) + '</b></div>' +
            '<div class="meta">このグループのメッセージ・参加情報がすべて消えます。元に戻せません。</div>' +
            '<label for="delGroupReason">削除理由（任意・監査ログに記録されます）</label><input id="delGroupReason" type="text" autocomplete="off">' +
            '<div id="bdMsg" class="meta" role="status"></div>' +
            '<div class="row" style="justify-content:stretch"><button type="button" class="button-danger" data-bd="delgroup">はい、削除する</button><button type="button" class="button-secondary" data-pm="close">やめる</button></div>');
        return;
    }
    if(target.dataset.bulk === "all"){
        const boxes = Array.from(el.adminBody.querySelectorAll("input[data-selu]"));
        const on = boxes.some((c) => !c.checked); boxes.forEach((c) => { c.checked = on; }); updateBulkCount(); return;
    }
    if(target.dataset.bulk === "noname"){
        const boxes = Array.from(el.adminBody.querySelectorAll("input[data-selu]"));
        boxes.forEach((c) => { c.checked = c.dataset.name === "ユーザー"; }); updateBulkCount();
        showToast(selectedUsers().length + "人を選びました。内容を確かめてから「選んだユーザーを削除」を押してください。"); return;
    }
    if(target.dataset.bulk === "orphan") return orphanSheet();
    if(target.dataset.bulk === "del"){ const list = selectedUsers(); if(list.length) bulkDeleteSheet(list); return; }
    if(target.dataset.deluser) return deleteAccount(target.dataset.deluser,target.dataset.name);
    if(target.dataset.reissue) return reissueRecovery(target.dataset.reissue,target.dataset.name);
    if(target.dataset.copycode){
        try{ await navigator.clipboard.writeText(target.dataset.copycode); showToast("コピーしました。"); }catch(_e){ showToast("コピーできませんでした。手動で選択してコピーしてください。"); }
        return;
    }
    if(target.dataset.codeclose){ feat.adminView = "users"; return renderAdmin(); }
    if(target.dataset.decide){
        const approve = target.dataset.decide === "approve";
        const note = window.prompt(approve ? "削除の理由メモ（任意）" : "却下の理由（任意）","");
        if(note === null) return;
        target.disabled = true;
        try{
            const result = await requireClient().rpc("admin_decide_delete_request",{p_request_id:target.dataset.id,p_approve:approve,p_note:note});
            if(result.error) throw result.error;
            if(approve) purgeStorageSoon();
            showToast(approve ? "削除しました。" : "却下しました。");
            refreshAdminBadge(); renderAdmin();
        }catch(error){ target.disabled = false; showToast(featError(error)); }
    }
}

// 開いているチャットが「削除ずみユーザーとのチャット」なら、管理者にだけ 🗑 削除 ボタンを出す
function initOrphanButton(){
    const b = document.getElementById("orphanDelBtn");
    if(!b || b.dataset.ready) return; b.dataset.ready = "1";
    addRoomHook((room) => { b.hidden = !(feat.isAdmin && room && room.orphan); });
    b.addEventListener("click",() => {
        const room = state.currentRoom; if(!room || !room.orphan || !feat.isAdmin) return;
        feat.orphanRoom = room.id;
        openSheet('<h3 style="margin:0">⚠️ このチャットを削除します</h3><div>すでにアカウントが無いユーザーとのチャットです。<b>メッセージもすべて</b>消えます。</div>' +
            '<div class="meta">元に戻せません。</div><div id="bdMsg" class="meta" role="status"></div>' +
            '<div class="row" style="justify-content:stretch"><button type="button" class="button-danger" data-bd="orphanroom">はい、削除する</button><button type="button" class="button-secondary" data-pm="close">やめる</button></div>');
    });
}
async function runOrphanRoomDelete(){
    const id = feat.orphanRoom; if(!id) return;
    el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    try{
        const r = await requireClient().rpc("admin_delete_orphan_room",{p_room_id:id});
        if(r.error) throw r.error;
        purgeStorageSoon();
        feat.orphanRoom = null; closeSheet();
        state.rooms = state.rooms.filter((x) => x.id !== id); if(state.allRooms) state.allRooms = state.allRooms.filter((x) => x.id !== id);
        if(state.currentRoom && state.currentRoom.id === id){ try{ el.app.classList.remove("chat-open"); }catch(_e){} state.currentRoom = null; }
        renderRooms(); showToast("チャットを削除しました。");
    }catch(error){
        el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        showToast(featError(error));
    }
}

// ===== メッセージの一括選択・一括「管理者として削除」 =====
// ・ヘッダーの「☑️」ボタンで選択モードに入る（管理者のみ・チャットを開いているときだけ表示）
// ・選択モード中は、メッセージ（相手・自分どちらも）を「タッチするだけ」で 選ぶ／外す。日付（開始日〜終了日）で選ぶこともできる
// ・削除のときの「理由」は入力しない（監査ログには「管理者による一括削除」と自動で記録）
const MSG_BULK_REASON = "管理者による一括削除";
function initMsgBulk(){
    const b = document.getElementById("msgBulkBtn");
    if(!b || b.dataset.ready) return; b.dataset.ready = "1";
    // タッチで選ぶ：ほかの クリック処理（選んでコピー・メニュー・画像を開く など）より先に受けて、選ぶ／外すだけにする
    el.messages.addEventListener("click",(event) => {
        if(!feat.isAdmin || !feat.msgBulkMode) return;
        if(event.target.closest("#msgBulkBar")) return;   // 上のバーのボタン・日付欄は ふつうに動かす
        const row = event.target.closest("article[data-mid]");
        if(!row) return;
        event.preventDefault(); event.stopPropagation();
        const id = row.dataset.mid;
        if(feat.msgSelect.has(id)) feat.msgSelect.delete(id); else feat.msgSelect.add(id);
        msgBulkPaint();
    },true);
    el.messages.addEventListener("click",onMsgBulkClick);
    el.messages.addEventListener("input",(event) => {
        if(event.target.id === "msgBulkFrom") feat.msgBulkFrom = event.target.value;
        else if(event.target.id === "msgBulkTo") feat.msgBulkTo = event.target.value;
    });
    addRoomHook((room) => {
        b.hidden = !(feat.isAdmin && room);
        feat.msgBulkMode = false; feat.msgSelect = new Set(); feat.msgBulkFrom = ""; feat.msgBulkTo = "";
        b.textContent = "☑️"; b.title = "複数のメッセージを選んで、まとめて管理者として削除します"; b.classList.remove("on"); el.messages.classList.remove("msg-bulk-active");
    });
    b.addEventListener("click",() => {
        if(!feat.isAdmin || !state.currentRoom) return;
        feat.msgBulkMode = !feat.msgBulkMode;
        if(feat.msgBulkMode && typeof selcExit === "function") selcExit();   // 「選んでコピー」のモードが残っていると、タッチを横取りされるため
        if(!feat.msgBulkMode) feat.msgSelect = new Set();
        b.textContent = feat.msgBulkMode ? "✖️" : "☑️";
        b.title = feat.msgBulkMode ? "一括選択をやめる" : "複数のメッセージを選んで、まとめて管理者として削除します";
        b.classList.toggle("on", feat.msgBulkMode);
        el.messages.classList.toggle("msg-bulk-active", feat.msgBulkMode);
        renderMessages(false);
    });
}
function msgBulkBarHtml(){
    const count = feat.msgSelect.size;
    return '<div class="msg-bulkbar" id="msgBulkBar">' +
        '<div class="msg-bulkbar-row"><span class="meta">メッセージをタッチすると選べます</span> <b id="msgBulkCount">' + count + '件を選択中</b></div>' +
        '<div class="msg-bulkbar-row"><input type="date" id="msgBulkFrom" value="' + escapeHtml(feat.msgBulkFrom) + '" aria-label="開始日">〜<input type="date" id="msgBulkTo" value="' + escapeHtml(feat.msgBulkTo) + '" aria-label="終了日">' +
        '<button type="button" class="button-secondary" data-msgbulk-range="1">この期間を選択</button>' +
        '<button type="button" class="button-danger" data-msgbulk-range-del="1">この期間を削除</button></div>' +
        '<div class="msg-bulkbar-row">' +
        '<button type="button" class="button-secondary" data-msgbulk-all="1">すべて選択</button>' +
        '<button type="button" class="button-secondary" data-msgbulk-clear="1">選択を解除</button>' +
        '<button type="button" class="button-danger" id="msgBulkDel" data-msgbulk-del="1"' + (count ? "" : " disabled") + '>選択した' + count + '件を削除</button></div></div>';
}
/** 全体を描き直さずに、選んだ状態（色・件数・削除ボタン）だけ更新する */
function msgBulkPaint(){
    el.messages.querySelectorAll("article[data-mid]").forEach((row) => row.classList.toggle("msg-picked", feat.msgSelect.has(row.dataset.mid)));
    const n = feat.msgSelect.size;
    const c = document.getElementById("msgBulkCount"); if(c) c.textContent = n + "件を選択中";
    const d = document.getElementById("msgBulkDel"); if(d){ d.disabled = !n; d.textContent = "選んだ" + n + "件を削除"; }
}
/** 指定した日付の範囲（開始日の0時〜終了日の終わり）の期間を、ミリ秒で返す */
function msgBulkRange(){
    const from = document.getElementById("msgBulkFrom")?.value || feat.msgBulkFrom || "", to = document.getElementById("msgBulkTo")?.value || feat.msgBulkTo || "";
    feat.msgBulkFrom = from; feat.msgBulkTo = to;
    if(!from && !to){ showToast("開始日・終了日のどちらかを入力してください。"); return null; }
    return {fromMs: from ? new Date(from + "T00:00:00").getTime() : -Infinity, toMs: to ? new Date(to + "T23:59:59.999").getTime() : Infinity};
}
/** メッセージを順に管理者削除する（理由は入力させない）。同時に5件ずつ。成功／失敗の件数を返す */
async function msgBulkRun(ids){
    let ok = 0, fail = 0, next = 0;
    const worker = async () => {
        while(next < ids.length){
            const id = ids[next++];
            try{
                const result = await requireClient().functions.invoke("admin-api",{body:{action:"delete-message",messageId:id,reason:MSG_BULK_REASON}});
                if(result.error) throw new Error(result.data?.error || result.error.message);
                ok++;
            }catch(_error){ fail++; }
            if((ok + fail) % 10 === 0) showToast("削除中… " + (ok + fail) + " / " + ids.length);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);
    return {ok, fail};
}
async function msgBulkFinish(r){
    feat.msgSelect.clear();
    await loadMessages(true,true);
    showToast(r.fail ? (r.ok + "件削除しました（" + r.fail + "件は失敗）") : (r.ok + "件を管理者として削除し、操作記録を保存しました。"));
}
async function onMsgBulkClick(event){
    const range = event.target.closest("[data-msgbulk-range]");
    const rangeDel = event.target.closest("[data-msgbulk-range-del]");
    const all = event.target.closest("[data-msgbulk-all]");
    const clear = event.target.closest("[data-msgbulk-clear]");
    const del = event.target.closest("[data-msgbulk-del]");
    if(range){
        const r = msgBulkRange(); if(!r) return;
        let added = 0;
        state.messages.forEach((m) => { const t = new Date(m.created_at).getTime(); if(t >= r.fromMs && t <= r.toMs){ feat.msgSelect.add(m.id); added++; } });
        showToast(added + "件を選択に追加しました。");
        msgBulkPaint();
        return;
    }
    if(rangeDel){
        // 日付だけで直接削除：サーバーから この期間のメッセージを探して（画面に出ていない古い分も含む）、確認のあと まとめて削除
        const r = msgBulkRange(); if(!r || !state.currentRoom) return;
        rangeDel.disabled = true;
        try{
            let q = requireClient().from(TABLES.messages).select("id").eq("room_id",state.currentRoom.id).order("created_at",{ascending:false}).limit(1000);
            if(Number.isFinite(r.fromMs)) q = q.gte("created_at",new Date(r.fromMs).toISOString());
            if(Number.isFinite(r.toMs)) q = q.lte("created_at",new Date(r.toMs).toISOString());
            const found = await q;
            if(found.error) throw found.error;
            const ids = (found.data || []).map((m) => m.id);
            if(!ids.length){ showToast("この期間のメッセージはありません。"); return; }
            if(!window.confirm("この期間のメッセージ " + ids.length + "件を、管理者としてすべて削除します。元に戻せません。よろしいですか？")) return;
            await msgBulkFinish(await msgBulkRun(ids));
        }catch(error){ setStatus(featError(error),"error"); }
        finally{ rangeDel.disabled = false; }
        return;
    }
    if(all){ state.messages.forEach((m) => feat.msgSelect.add(m.id)); msgBulkPaint(); return; }
    if(clear){ feat.msgSelect.clear(); msgBulkPaint(); return; }
    if(del){
        const ids = Array.from(feat.msgSelect);
        if(!ids.length) return;
        if(!window.confirm("選んだ" + ids.length + "件のメッセージを、管理者として削除します。元に戻せません。よろしいですか？")) return;
        del.disabled = true;
        await msgBulkFinish(await msgBulkRun(ids));
    }
}

// すでに消えたユーザーの「チャットだけ残っている」ものを、管理者が消す（確認は「はい」1回）
async function orphanSheet(){
    let n = 0;
    try{
        const r = await requireClient().rpc("admin_orphan_chat_count");
        if(r.error) throw r.error; n = Number(r.data) || 0;
    }catch(error){ showToast("調べられませんでした：" + featError(error)); return; }
    if(n === 0){ showToast("消えたユーザーの残りチャットは ありません。"); return; }
    openSheet('<h3 style="margin:0">⚠️ 削除ずみユーザーの残りチャット</h3><div><b>' + n + '件</b>の部屋（と中のメッセージ）を完全に消します。</div>' +
        '<div class="meta">すでにアカウントが無い人とのチャット、その人のメッセージ・参加情報が対象です。元に戻せません。</div>' +
        '<div id="bdMsg" class="meta" role="status"></div>' +
        '<div class="row" style="justify-content:stretch"><button type="button" class="button-danger" data-bd="orphan">はい、削除する</button><button type="button" class="button-secondary" data-pm="close">やめる</button></div>');
}
async function runOrphanPurge(){
    el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    const msg = document.getElementById("bdMsg"); if(msg) msg.textContent = "削除しています…";
    try{
        const r = await requireClient().rpc("admin_purge_orphan_chat");
        if(r.error) throw r.error;
        const row = (r.data && r.data[0]) || {};
        closeSheet(); showToast("消しました：部屋 " + (row.rooms_deleted || 0) + "件・メッセージ " + (row.messages_deleted || 0) + "件");
        renderAdmin();
    }catch(error){
        el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        showToast(featError(error));
    }
}

function deleteAccount(userId,name){ bulkDeleteSheet([{uid:userId,name:name}]); }

// 管理者が消すとき：確認は「はい」の1回だけ（1人でも、まとめてでも同じ）。本人が自分で消す場合は、これまでの手順（下の onDelSheet）のまま
function bulkDeleteSheet(list){
    feat.bulkList = list;
    const names = list.slice(0, 30).map((u) => escapeHtml(u.name)).join("、") + (list.length > 30 ? " ほか" + (list.length - 30) + "人" : "");
    openSheet('<h3 style="margin:0">⚠️ ' + list.length + '人のアカウントを削除します</h3><div><b>' + names + '</b></div>' +
        '<div class="meta">アカウント、投稿、チャットの履歴・メッセージ、1対1の会話、追跡ログがすべて消えます。元に戻せません。</div>' +
        '<div id="bdMsg" class="meta" role="status"></div>' +
        '<div class="row" style="justify-content:stretch"><button type="button" class="button-danger" data-bd="yes">はい、削除する</button><button type="button" class="button-secondary" data-pm="close">やめる</button></div>');
}

async function runBulkDelete(button){
    const list = feat.bulkList || [], msg = document.getElementById("bdMsg");
    if(!list.length) return;
    el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    let ok = 0; const bad = [];
    for(let i = 0; i < list.length; i++){
        const u = list[i];
        if(msg) msg.textContent = "削除しています… " + (i + 1) + " / " + list.length + "（" + u.name + "）";
        try{
            let reqId = u.reqId, reason = u.reason;
            if(!reqId){
                let q = await requireClient().rpc("admin_list_account_deletion_requests");
                if(q.error) throw q.error;
                let r = (q.data || []).find((x) => x.user_id === u.uid);
                if(!r){
                    const c = await requireClient().rpc("admin_request_account_deletion",{p_user_id:u.uid,p_reason:"管理者による削除"});
                    if(c.error) throw c.error;
                    q = await requireClient().rpc("admin_list_account_deletion_requests");
                    if(q.error) throw q.error;
                    r = (q.data || []).find((x) => x.user_id === u.uid);
                }
                if(!r) throw new Error("削除の手続きを作れませんでした。");
                reqId = r.id; reason = r.reason;
            }
            await window.ARESystem.callAuthenticatedFunction("admin-delete-user",{requestId:reqId,userId:u.uid,confirmName:u.name,reason:(reason && reason.length >= 5) ? reason : "管理者による削除"});
            ok++;
        }catch(error){ bad.push(u.name + "：" + (error?.message || featError(error))); }
    }
    feat.bulkList = null; closeSheet();
    if(ok) purgeStorageSoon();
    showToast(bad.length ? ok + "人を削除しました。削除できなかった人：" + bad.join(" / ") : ok + "人のアカウントを削除しました。");
    renderAdmin(); refreshAdminBadge();
}

async function submitDeleteRequest(button){
    const t = feat.reqTarget, err = document.getElementById("drErr");
    const reason = (document.getElementById("drReason")?.value || "").trim();
    if(!t) return;
    if(reason.length < 2){ err.textContent = "理由を2文字以上で入力してください。"; return; }
    button.disabled = true; err.textContent = "申請を作成しています…";
    try{
        const result = await requireClient().rpc("admin_request_account_deletion",{p_user_id:t.uid,p_reason:reason});
        if(result.error) throw result.error;
        // 本当に保存されたか、一覧を取り直して確認する
        const check = await requireClient().rpc("admin_list_account_deletion_requests");
        if(check.error) throw check.error;
        if(!(check.data || []).some((r) => r.user_id === t.uid)) throw new Error("申請が一覧に反映されませんでした。");
        feat.reqTarget = null; closeSheet();
        feat.adminView = "acctdel"; renderAdmin(); refreshAdminBadge();
        showToast("削除申請を作成しました。内容を確認して「承認して完全削除」を押してください。");
    }catch(error){ button.disabled = false; err.textContent = "申請できませんでした：" + featError(error); }
}

async function renderAdminSecurity(client){
    const result = await client.rpc("admin_list_login_events",{p_limit:100});
    if(result.error) throw result.error;
    el.adminBody.innerHTML = '<div class="admin-card meta">既存のアカウントに対して、ログインに2回以上失敗した記録です（直近90日）。5回ごとに、回数と同じ分数（5回=5分、10回=10分…）だけ、ログインできなくなります。顔写真などは取得していません。入力されたパスワードも記録していません。本人にもマイページで通知されます。</div>' +
        (result.data.length ? result.data.map((r) => '<div class="admin-card"><b>' + escapeHtml(r.display_name || "ユーザー") + '</b> <span class="meta">ID：' + escapeHtml(r.login_id || "-") + ' ・ ' + escapeHtml(formatDate(r.occurred_at)) + '</span><div>' + escapeHtml(String(r.failed_count)) + '回失敗' + (r.lock_minutes > 0 ? '　→　' + escapeHtml(String(r.lock_minutes)) + '分間ログイン不可' : '') + '</div></div>').join("") : '<div class="empty-list">ログイン失敗の記録はありません。</div>');
}

async function renderAdminAcctDel(client){
    const result = await client.rpc("admin_list_account_deletion_requests");
    if(result.error) throw result.error;
    el.adminBody.innerHTML = '<div class="admin-card meta">承認すると、そのアカウントと関連データが完全に削除されます（元に戻せません）。承認前に、追跡ログをZIPで保存するかどうかを必ず確認します。</div>' +
        (result.data.length ? result.data.map((r) =>
            '<div class="admin-card"><b>' + escapeHtml(r.display_name || "ユーザー") + '</b> <span class="meta">ID：' + escapeHtml(r.login_id || "-") + ' ・ ' + (r.requested_by_admin ? '管理者が申請' : '本人が申請') + ' ・ ' + escapeHtml(formatDate(r.created_at)) + '</span>' +
            '<div class="meta">理由：' + escapeHtml(r.reason || "（記載なし）") + '</div><div class="row">' +
            '<button class="button-danger" data-acctdel="approve" data-byadmin="' + (r.requested_by_admin ? "1" : "0") + '" data-id="' + escapeHtml(r.id) + '" data-uid="' + escapeHtml(r.user_id) + '" data-name="' + escapeHtml(r.display_name || "") + '" data-reason="' + escapeHtml(r.reason || "") + '" type="button">承認して完全削除</button>' +
            '<button class="button-secondary" data-acctdel="reject" data-id="' + escapeHtml(r.id) + '" type="button">却下</button></div></div>').join("")
            : '<div class="empty-list">承認待ちのアカウント削除申請はありません。</div>');
}

feat.delTarget = null;
feat.delGroupTarget = null;

async function runGroupDelete(button){
    const t = feat.delGroupTarget; if(!t) return;
    const reason = (document.getElementById("delGroupReason")?.value || "").trim();
    el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    const msg = document.getElementById("bdMsg"); if(msg) msg.textContent = "削除しています…";
    try{
        const r = await requireClient().rpc("admin_delete_group_v1",{p_room_id:t.id, p_reason:reason || null});
        if(r.error) throw r.error;
        purgeStorageSoon();
        feat.delGroupTarget = null; closeSheet();
        showToast(t.name + " を削除しました。");
        renderAdmin();
    }catch(error){
        el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        showToast(featError(error));
    }
}

function onAcctDelClick(event){
    const b = event.target.closest("[data-acctdel]");
    if(!b) return;
    if(b.dataset.acctdel === "reject"){
        const note = window.prompt("却下の理由（任意）","");
        if(note === null) return;
        requireClient().rpc("admin_reject_account_deletion",{p_request_id:b.dataset.id,p_note:note}).then((r) => {
            if(r.error) showToast(featError(r.error)); else { showToast("却下しました。"); renderAdmin(); refreshAdminBadge(); }
        });
        return;
    }
    if(b.dataset.byadmin === "1"){ bulkDeleteSheet([{uid:b.dataset.uid,name:b.dataset.name,reqId:b.dataset.id,reason:b.dataset.reason}]); return; }   // 管理者が出した申請は「はい」1回だけ
    feat.delTarget = {id:b.dataset.id,uid:b.dataset.uid,name:b.dataset.name,reason:b.dataset.reason};
    openSheet('<h3 style="margin:0">⚠️ アカウントの完全削除</h3><div><b>' + escapeHtml(b.dataset.name) + '</b> さんのアカウント、投稿、1対1の会話、添付ファイル、追跡ログを完全に削除します。元に戻せません。</div>' +
        '<label for="delConfirmName">確認のため、表示名「' + escapeHtml(b.dataset.name) + '」をそのまま入力してください</label><input id="delConfirmName" type="text" autocomplete="off">' +
        '<div class="admin-card"><b>追跡ログ（このアカウントに関する操作記録・復旧の試行記録）を、ZIPで保存しますか？</b><div class="meta">削除と同時に、サーバー上の追跡ログも消えます。残したい場合は先にZIPで保存してください。</div></div>' +
        '<div class="row" style="justify-content:stretch"><button type="button" class="button" data-d="zip">ZIPを保存してから削除</button><button type="button" class="button-danger" data-d="nozip">保存せずに削除</button><button type="button" class="button-secondary" data-pm="close">やめる</button></div>');
}

async function onDelSheet(event){
    const bd = event.target.closest("[data-bd]");
    if(bd){
        if(bd.dataset.bd === "orphanroom") return runOrphanRoomDelete();
        if(bd.dataset.bd === "orphan") return runOrphanPurge();
        if(bd.dataset.bd === "delgroup") return runGroupDelete(bd);
        return runBulkDelete(bd);
    }
    const dr = event.target.closest("[data-dr]");
    if(dr) return submitDeleteRequest(dr);
    const b = event.target.closest("[data-d]");
    if(!b || !feat.delTarget) return;
    const t = feat.delTarget, typed = (document.getElementById("delConfirmName")?.value || "");
    if(typed !== t.name){ showToast("表示名が一致しないため、削除を中止しました。"); return; }
    el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    try{
        if(b.dataset.d === "zip"){
            const logs = await requireClient().rpc("admin_get_user_logs",{p_user_id:t.uid});
            if(logs.error) throw logs.error;
            const readme = "削除したアカウント（表示名）：" + t.name + "\nユーザーID：" + t.uid + "\n保存日時：" + new Date().toLocaleString("ja-JP") + "\n\naccount-logs.json に、このアカウントに関する操作記録（監査ログ）と復旧の試行記録を保存しています。\n";
            const enc = new TextEncoder();
            const blob = makeZip([{name:"README.txt",data:enc.encode("\uFEFF" + readme)},{name:"account-logs.json",data:enc.encode(JSON.stringify(logs.data,null,2))}]);
            const url = URL.createObjectURL(blob), a = document.createElement("a");
            a.href = url; a.download = "ARE追跡ログ_" + t.name.replace(/[\\/:*?"<>|]/g,"_") + "_" + new Date().toISOString().slice(0,10) + ".zip"; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url),60000);
        }
        await window.ARESystem.callAuthenticatedFunction("admin-delete-user",{requestId:t.id,userId:t.uid,confirmName:t.name,reason:(t.reason && t.reason.length >= 5) ? t.reason : "利用者本人の申請による削除"});
        purgeStorageSoon();
        closeSheet(); feat.delTarget = null;
        showToast(t.name + " さんのアカウントを完全に削除しました。");
        renderAdmin(); refreshAdminBadge();
    }catch(error){
        el.profileSheet.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        showToast(error?.message || featError(error));
    }
}
