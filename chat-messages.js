"use strict";

async function onMessageAction(event){
    const pollBtn = event.target.closest("[data-openpoll]");
    if(pollBtn){ openGroupInfo(pollBtn.dataset.openpoll); return; }
    const button = event.target.closest("[data-act]");
    if(!button) return;
    const id = button.dataset.id, act = button.dataset.act;
    const message = state.messages.find((m) => m.id === id);
    if(!message) return;

    if(act === "admin-del"){
        if(!feat.isAdmin) return;
        const reason = window.prompt("管理者としてメッセージを削除します。理由を入力してください（監査ログに記録されます）。","");
        if(reason === null) return;
        if(!reason.trim() || Array.from(reason).length > 500){ showToast("削除理由を1〜500文字で入力してください。"); return; }
        button.disabled = true;
        try{
            const result = await requireClient().functions.invoke("admin-api",{body:{action:"delete-message",messageId:id,reason:reason.trim()}});
            if(result.error) throw new Error(result.data?.error || result.error.message);
            await loadMessages(true,true);
            showToast("管理者としてメッセージを削除し、操作記録を保存しました。");
        }catch(error){ button.disabled = false; setStatus(featError(error),"error"); }
        return;
    }
    if(message.sender_id !== state.user.id) return;

    if(act === "edit"){
        feat.editingId = id; renderMessages(false);
        const box = el.messages.querySelector("textarea.edit-box");
        if(box){ box.focus(); box.setSelectionRange(box.value.length,box.value.length); }
    }else if(act === "cancel-edit"){
        feat.editingId = null; renderMessages(false);
    }else if(act === "save-edit"){
        const box = el.messages.querySelector("textarea.edit-box");
        const text = box ? box.value : "";
        if(!text.trim()){ showToast("メッセージを入力してください。"); return; }
        if(Array.from(text).length > MAX_TEXT_LENGTH){ showToast("メッセージは4,000文字以内で入力してください。"); return; }
        button.disabled = true;
        try{
            const keep = Object.assign({},parseMessageContent(message.content),{type:"text",text});
            delete keep.stamp;
            const result = await requireClient().rpc("edit_message",{p_message_id:id,p_content:JSON.stringify(keep)});
            if(result.error) throw result.error;
            feat.editingId = null;
            await loadMessages(false,true);
            showToast("編集しました。");
        }catch(error){ button.disabled = false; setStatus(featError(error),"error"); }
    }else if(act === "del"){
        if(feat.pending.has(id)) return;
        const reason = window.prompt("このメッセージの削除を管理者に申請します。\n理由（任意・500文字以内）を入力してください。","");
        if(reason === null) return;
        try{
            const result = await requireClient().rpc("request_message_delete",{p_message_id:id,p_reason:reason.slice(0,500)});
            if(result.error) throw result.error;
            feat.pending.add(id); renderMessages(false);
            showToast("削除を申請しました。管理者が承認すると削除されます。");
        }catch(error){ setStatus(featError(error),"error"); }
    }
}

function localInput(date){
    const p = (n) => String(n).padStart(2,"0");
    return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate()) + "T" + p(date.getHours()) + ":" + p(date.getMinutes());
}

function toggleSchedule(){
    if(el.scheduleButton.disabled) return;
    el.schedulePanel.hidden = !el.schedulePanel.hidden;
    if(!el.schedulePanel.hidden){
        el.scheduleAt.min = localInput(new Date(Date.now() + 60000));
        if(!el.scheduleAt.value) el.scheduleAt.value = localInput(new Date(Date.now() + 10 * 60000));
        loadScheduled();
    }
    updateCharCount();   // 上限の表示を更新する
}

// 📎・📷・🎬で選んだ写真・動画・ファイルも予約できるようにする：
// 予約パネルが開いていて、日時がちゃんと選べているときだけ、有効な日時を返す（それ以外は null＝今までどおり すぐ送信）。
function schedulePickedWhen(){
    if(!el.schedulePanel || el.schedulePanel.hidden) return null;
    const when = new Date(el.scheduleAt.value);
    if(isNaN(when.getTime()) || when.getTime() < Date.now() + 45000) return null;
    return when;
}

async function scheduleSend(){
    if(!state.currentRoom) return;
    const text = el.messageInput.value;
    if(!text.trim()){ showToast("予約するメッセージを入力欄に入力してください。"); return; }
    if(Array.from(text).length > SCHEDULE_MAX_TEXT){ showToast("予約送信は4,000文字までです（いま " + Array.from(text).length + " 文字）。短くしてください。"); return; }
    const when = new Date(el.scheduleAt.value);
    if(isNaN(when.getTime()) || when.getTime() < Date.now() + 45000){ showToast("送信日時は1分以上先を指定してください。"); return; }
    el.scheduleSubmit.disabled = true;
    try{
        const result = await requireClient().rpc("schedule_message",{p_room_id:state.currentRoom.id,p_content:JSON.stringify({type:"text",text}),p_send_at:when.toISOString()});
        if(result.error) throw result.error;
        el.messageInput.value = ""; updateCharCount();
        showToast(formatDate(when.toISOString()) + " に送信を予約しました。");
        await loadScheduled();
    }catch(error){ setStatus(featError(error),"error"); }
    finally{ el.scheduleSubmit.disabled = false; updateCharCount(); }
}

// アップロード済みの添付（写真・動画・ファイル・ボイス等）を、選んでおいた日時に予約する。
// アップロード自体は、いつもどおり すぐ行う（アップロードが終わってから、予約した時間に送られる）。
async function scheduleAttachmentPayload(payload,when){
    try{
        const result = await requireClient().rpc("schedule_message",{p_room_id:state.currentRoom.id,p_content:JSON.stringify(payload),p_send_at:when.toISOString()});
        if(result.error) throw result.error;
        showToast(formatDate(when.toISOString()) + " に送信を予約しました。");
        await loadScheduled();
        return true;
    }catch(error){ setStatus(featError(error),"error"); return false; }
}

let msEdit = null;   // いま直している予約 {id, textual, text}
function msLocalInput(d){ const p = (n) => String(n).padStart(2,"0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
function msItemHtml(row){
    const parsed = parseMessageContent(row.content);
    const isText = !!parsed && parsed.type === "text";
    const full = isText ? String(parsed.text || "") : messageSummary(parsed);
    const long = Array.from(full).length > 60;
    const head = escapeHtml(formatDate(row.send_at)) + (row.status === "failed" ? ' <b style="color:var(--danger)">（送れませんでした' + (row.error ? "：" + escapeHtml(({blocked_by_filter:"送れない内容が含まれていました", not_member:"この部屋のメンバーではありません", room_suspended:"この部屋は停止中です", guest_limit:"お試しの送信上限です", other_limit_user:"送信上限です", other_limit_admin:"送信上限です"})[row.error] || "うまく送れませんでした") : "") + '）</b>' : "");
    const body = long
        ? '<details class="sched-full"><summary>' + escapeHtml(Array.from(full).slice(0, 60).join("")) + '… <small>（' + Array.from(full).length + '文字・タップで全文）</small></summary><div class="sched-fulltext" style="white-space:pre-wrap;word-break:break-word;margin-top:4px">' + escapeHtml(full) + '</div></details>'
        : '<span style="white-space:pre-wrap;word-break:break-word">' + escapeHtml(full) + '</span>';
    return '<div class="sched-item" data-sid="' + escapeHtml(row.id) + '" style="flex-wrap:wrap"><div style="flex:1;min-width:0"><div class="meta">' + head + '</div>' + body + '</div>' +
        '<span style="display:flex;gap:6px"><button type="button" class="button-secondary" data-edit="' + escapeHtml(row.id) + '">編集</button><button type="button" class="button-danger" data-cancel="' + escapeHtml(row.id) + '">取消</button></span></div>';
}
async function loadScheduled(){
    if(!state.currentRoom) return;
    if(msEdit && document.getElementById("schedEditBox")) return;   // 直している最中は、一覧を書きかえない（入力が消えないように）
    const roomId = state.currentRoom.id;
    const result = await requireClient().from("scheduled_messages").select("id,content,send_at,status,error").eq("room_id",roomId).in("status",["pending","failed"]).order("send_at",{ascending:true});
    if(result.error || state.currentRoom?.id !== roomId) return;
    if(msEdit && document.getElementById("schedEditBox")) return;
    const rows = result.data || [];
    msRows = new Map(rows.map((r) => [r.id, r]));
    el.scheduleList.innerHTML = rows.length ? rows.map(msItemHtml).join("") : '<div class="empty-list">予約中のメッセージはありません。</div>';
}
let msRows = new Map();
function openMsgSchedEdit(id){
    const row = msRows.get(id); if(!row) return;
    const item = el.scheduleList.querySelector('[data-sid="' + CSS.escape(id) + '"]'); if(!item) return;
    const parsed = parseMessageContent(row.content);
    const isText = !!parsed && parsed.type === "text";
    msEdit = {id, isText, content: row.content};
    const min = msLocalInput(new Date(Date.now() + 60000));
    const cur = msLocalInput(new Date(Math.max(new Date(row.send_at).getTime(), Date.now() + 120000)));
    item.innerHTML = '<div id="schedEditBox" style="flex:1 1 100%;display:grid;gap:6px">' +
        (isText ? '<textarea id="schedEditText" rows="6" maxlength="8000" style="width:100%;box-sizing:border-box"></textarea><div class="meta"><span id="schedEditCount">0</span> / 4,000文字</div>'
                : '<div class="meta">この予約は、写真・動画・ファイルなどです。送る日時だけ変えられます。（中身を変えたいときは、取消してから、もう一度予約してください）</div>') +
        '<label>送信日時 <input type="datetime-local" id="schedEditAt" min="' + min + '" value="' + cur + '"></label>' +
        '<div style="display:flex;gap:6px;justify-content:flex-end"><button type="button" class="button-secondary" data-edit-cancel="1">やめる</button><button type="button" class="button" data-edit-save="' + escapeHtml(id) + '">この内容で保存</button></div></div>';
    if(isText){
        const ta = document.getElementById("schedEditText"); ta.value = String(parsed.text || "");
        const cnt = () => { const n = Array.from(ta.value).length; const c = document.getElementById("schedEditCount"); c.textContent = String(n); c.style.color = n > SCHEDULE_MAX_TEXT ? "var(--danger)" : "var(--muted)"; };
        ta.addEventListener("input", cnt); cnt(); ta.focus();
    }
}
async function saveMsgSchedEdit(id){
    if(!msEdit || msEdit.id !== id) return;
    const at = new Date((document.getElementById("schedEditAt") || {}).value || "");
    if(isNaN(at.getTime()) || at.getTime() < Date.now() + 45000){ showToast("送信日時は1分以上先を指定してください。"); return; }
    if(at.getTime() > Date.now() + 30 * 86400000){ showToast("予約は30日先までです。"); return; }
    let content = msEdit.content;
    if(msEdit.isText){
        const text = (document.getElementById("schedEditText") || {}).value || "";
        if(!text.trim()){ showToast("メッセージが空です。"); return; }
        const n = Array.from(text).length;
        if(n > SCHEDULE_MAX_TEXT){ showToast("予約送信は4,000文字までです（いま " + n + " 文字）。"); return; }
        const old = parseMessageContent(msEdit.content) || {};
        content = JSON.stringify(Object.assign({}, old, {type:"text", text}));
    }
    const btn = document.querySelector("[data-edit-save]"); if(btn) btn.disabled = true;
    try{
        const result = await requireClient().rpc("update_scheduled_message",{p_id:id,p_content:content,p_send_at:at.toISOString()});
        if(result.error) throw result.error;
        msEdit = null;
        showToast("予約を直しました（" + formatDate(at.toISOString()) + " に送ります）。");
        await loadScheduled();
    }catch(error){ setStatus(featError(error),"error"); if(btn) btn.disabled = false; }
}
async function onScheduleListClick(event){
    const ed = event.target.closest("[data-edit]");
    if(ed){ if(msEdit && document.getElementById("schedEditBox")){ showToast("いま直している予約を、先に保存するか「やめる」を押してください。"); return; } openMsgSchedEdit(ed.dataset.edit); return; }
    if(event.target.closest("[data-edit-cancel]")){ msEdit = null; await loadScheduled(); return; }
    const sv = event.target.closest("[data-edit-save]");
    if(sv){ await saveMsgSchedEdit(sv.dataset.editSave); return; }
    const button = event.target.closest("[data-cancel]");
    if(!button) return;
    try{
        const result = await requireClient().rpc("cancel_scheduled_message",{p_id:button.dataset.cancel});
        if(result.error) throw result.error;
        if(msEdit && msEdit.id === button.dataset.cancel) msEdit = null;
        await loadScheduled();
    }catch(error){ setStatus(featError(error),"error"); }
}
