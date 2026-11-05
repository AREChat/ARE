"use strict";

// ===== グループチャット（名称・注意事項・リンク・アンケート） =====
feat.pickSel = new Map();
feat.pickExclude = [];
feat.pickDefaults = [];
feat.pickTags = new Map();
feat.pickToken = 0;
feat.groupInviteLink = "";

/** 人を選ぶ部品の見た目（文字だけの案内つき）。候補を最初から出したい画面は、シートを開いたあとに pickInit() を呼ぶ */
function pickList(excludeIds){
    feat.pickSel = new Map();
    feat.pickExclude = excludeIds || [];
    feat.pickDefaults = [];
    feat.pickTags = new Map();
    return '<div class="pk-sel" id="pkSel" aria-live="polite"><span class="meta">選んだ人：まだいません</span></div>' +
        '<input id="pkQ" class="pk-search" type="search" placeholder="🔍 名前で探す" autocomplete="off" enterkeyhint="search" aria-label="名前で探す">' +
        '<div class="pick" id="pkRes"><div class="meta">名前を入力すると候補が表示されます。</div></div>';
}
function pickedIds(){ return [...feat.pickSel.keys()]; }

/** 選んだ人を「名前 ✕」のボタンで並べる（押すと外せる） */
function showPickSel(){
    const box = document.getElementById("pkSel");
    if(box){
        box.innerHTML = feat.pickSel.size
            ? '<div class="meta">選んだ人：' + feat.pickSel.size + '人（押すと外せます）</div><div class="pk-chips">' +
              [...feat.pickSel.entries()].map(([id,name]) => '<button type="button" class="pk-chip" data-g="unpick" data-id="' + escapeHtml(id) + '" aria-label="' + escapeHtml(name) + 'を外す">' + escapeHtml(name) + ' ✕</button>').join("") + '</div>'
            : '<span class="meta">選んだ人：まだいません</span>';
    }
    const create = document.getElementById("gCreate");
    if(create) create.textContent = feat.pickSel.size ? "作成する（" + (feat.pickSel.size + 1) + "人）" : "作成";
}

function pickInitial(profile){
    return Array.from(String(profileDisplayName(profile) || "?"))[0] || "?";
}

/** 候補の1行（大きく押せる）。選んだ人にはチェックが付く */
function pickRowHtml(p){
    const name = profileDisplayName(p), url = safeHttpUrl(p.avatar_url || "");
    const tag = feat.pickTags.get(p.id) || "";
    const on = feat.pickSel.has(p.id);
    return '<label class="pk-row' + (on ? ' on' : '') + '"><input type="checkbox" data-pick="' + escapeHtml(p.id) + '" data-name="' + escapeHtml(name) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="pk-av">' + (url ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy">' : escapeHtml(pickInitial(p))) + '</span>' +
        '<span class="pk-name">' + escapeHtml(name) + '</span>' + (tag ? '<span class="pk-tag">' + escapeHtml(tag) + '</span>' : '') + '</label>';
}

function showPickDefaults(){
    const box = document.getElementById("pkRes");
    if(!box) return;
    box.innerHTML = feat.pickDefaults.length
        ? feat.pickDefaults.map(pickRowHtml).join("")
        : '<div class="meta">名前を入力すると候補が表示されます。</div>';
}

/** 最初から候補を出す：やりとりしている人 → フォロー中の人 → ほかの人（名前順）。名前を打たなくても選べる */
async function pickInit(){
    const token = ++feat.pickToken;
    const box = document.getElementById("pkRes");
    if(!box) return;
    box.innerHTML = '<div class="meta">候補を読み込んでいます...</div>';
    try{
        const client = requireClient(), me = state.user.id;
        const [fol,prof] = await Promise.all([
            client.from("follows").select("followee_id").eq("follower_id",me),
            client.from(TABLES.profiles).select("id,display_name,avatar_url").neq("id",me).order("display_name").limit(60)]);
        if(token !== feat.pickToken || !document.getElementById("pkRes")) return;
        if(prof.error) throw prof.error;
        const talked = (state.rooms || []).filter((r) => !r.is_group && r.partnerId).map((r) => r.partnerId);
        const followed = new Set((fol.data || []).map((r) => r.followee_id));
        const rank = (id) => { const i = talked.indexOf(id); return i >= 0 ? i : (followed.has(id) ? 1000 : 2000); };
        const rows = (prof.data || []).filter((p) => !feat.pickExclude.includes(p.id));
        rows.forEach((p) => feat.pickTags.set(p.id,talked.includes(p.id) ? "チャット中" : (followed.has(p.id) ? "フォロー中" : "")));
        feat.pickDefaults = rows.map((p,i) => ({p,i})).sort((a,b) => rank(a.p.id) - rank(b.p.id) || a.i - b.i).map((x) => x.p);
        const q = document.getElementById("pkQ");
        if(q && q.value.trim()) q.dispatchEvent(new Event("input",{bubbles:true})); else showPickDefaults();
    }catch(error){
        if(token !== feat.pickToken) return;
        const b = document.getElementById("pkRes");
        if(b) b.innerHTML = '<div class="meta">候補を読み込めませんでした。名前を入力して探してください。（' + escapeHtml(featError(error)) + '）</div>';
    }
}

let pickTimer = null;
function onPickInput(event){
    if(event.target.id === "gName"){
        const count = document.getElementById("gNameCount");
        if(count) count.textContent = Array.from(event.target.value).length + "/40";
        groupMessage("");
        return;
    }
    if(event.target.id !== "pkQ") return;
    clearTimeout(pickTimer);
    pickTimer = setTimeout(async () => {
        const box = document.getElementById("pkRes");
        if(!box) return;
        const text = event.target.value.trim();
        if(!text){ showPickDefaults(); return; }
        const result = await requireClient().from(TABLES.profiles).select("id,display_name,avatar_url").ilike("display_name","%" + escLike(text) + "%").neq("id",state.user.id).limit(20);
        if(!document.getElementById("pkRes")) return;
        if(result.error){ box.innerHTML = '<div class="meta">' + escapeHtml(featError(result.error)) + '</div>'; return; }
        const rows = (result.data || []).filter((p) => !feat.pickExclude.includes(p.id));
        box.innerHTML = rows.length ? rows.map(pickRowHtml).join("") : '<div class="meta">見つかりません。別の言葉で探してみてください。</div>';
    },250);
}
function onPickChange(event){
    const box = event.target.closest("[data-pick]");
    if(!box) return;
    if(box.checked) feat.pickSel.set(box.dataset.pick,box.dataset.name); else feat.pickSel.delete(box.dataset.pick);
    const row = box.closest(".pk-row");
    if(row) row.classList.toggle("on",box.checked);
    showPickSel();
    groupMessage("");
}

/** グループ作成画面の、赤いお知らせ欄。focusId を渡すと、その入力欄へ移動する */
function groupMessage(text,focusId){
    const box = document.getElementById("gMsg");
    if(box){ box.textContent = text || ""; box.hidden = !text; }
    if(text && focusId){
        const target = document.getElementById(focusId);
        if(target){ target.focus(); if(target.scrollIntoView) target.scrollIntoView({block:"center",behavior:"smooth"}); }
    }
}

/** 名前の入力欄で Enter を押したら、メンバー探しへ進む（うっかり作成されない） */
function onGroupKey(event){
    if(event.key !== "Enter" || event.isComposing) return;
    if(event.target.id === "gName"){ event.preventDefault(); const q = document.getElementById("pkQ"); if(q) q.focus(); }
    else if(event.target.id === "pkQ"){ event.preventDefault(); }
}

function openGroupCreator(){
    openSheet('<h3 style="margin:0">👥 グループを作成</h3>' +
        '<div class="grp-step"><label for="gName"><b>① グループ名</b>　<span id="gNameCount">0/40</span></label><input id="gName" type="text" maxlength="40" placeholder="例：週末ゲーム部" autocomplete="off" enterkeyhint="next"></div>' +
        '<div class="grp-step"><label><b>② メンバーを選ぶ</b><span>1人以上・あなたは自動で入ります</span></label>' + pickList([]) + '</div>' +
        '<details class="grp-more"><summary>③ 📌 注意事項を書く（任意）</summary><textarea id="gNotice" rows="3" maxlength="500" placeholder="例：みんなで仲良く使いましょう（500文字まで）"></textarea></details>' +
        '<div class="sheet-actions"><div class="grp-msg" id="gMsg" role="alert" hidden></div><div class="row"><button type="button" class="button-secondary" data-pm="close">キャンセル</button><button type="button" class="button" id="gCreate" data-g="create">作成</button></div></div>');
    pickInit();
    const name = document.getElementById("gName");
    if(name) setTimeout(() => { try{ name.focus({preventScroll:true}); }catch(_e){ /* フォーカスできなくても続ける */ } },60);
}

async function openGroupInfo(focusPollId){
    const room = state.currentRoom;
    if(!room || !room.is_group) return;
    openSheet('<div class="empty-list">読み込み中...</div>');
    await renderGroupInfo(room.id,focusPollId);
}

async function renderGroupInfo(roomId,focusPollId){
    const client = requireClient();
    const room = state.rooms.find((r) => r.id === roomId);
    if(!room) return;
    const owner = room.created_by === state.user.id;
    const [links,polls,invites] = await Promise.all([
        client.from("room_links").select("id,title,url").eq("room_id",roomId).order("created_at"),
        client.from("polls").select("id,question,created_by,closed_at").eq("room_id",roomId).order("created_at",{ascending:false}).limit(10),
        owner ? client.rpc("list_room_invites",{p_room_id:roomId}) : Promise.resolve({data:[],error:null})]);
    if(links.error) throw links.error;
    if(polls.error) throw polls.error;
    if(focusPollId && !(polls.data || []).some((x) => x.id === focusPollId)){
        const one = await client.from("polls").select("id,question,created_by,closed_at").eq("id",focusPollId).eq("room_id",roomId).maybeSingle();
        if(one.data) polls.data = [one.data, ...(polls.data || [])];
    }
    if(invites.error) throw invites.error;
    await ensureMemberProfiles(room);
    const pollHtml = [];
    for(const poll of (polls.data || [])){
        const res = await client.rpc("get_poll_results",{p_poll_id:poll.id});
        const rows = res.data || [];
        if(res.error){ pollHtml.push('<div class="admin-card" id="poll-' + escapeHtml(poll.id) + '"><b>' + escapeHtml(poll.question) + '</b><div class="meta">結果を読み込めませんでした。もう一度ひらいてください。</div></div>'); continue; }
        const total = rows.reduce((s,r) => s + Number(r.votes),0);
        const mine = rows.find((r) => r.mine);
        pollHtml.push('<div class="admin-card" id="poll-' + escapeHtml(poll.id) + '"' + (poll.id === focusPollId ? ' style="border-color:var(--accent)"' : '') + '><b>' + escapeHtml(poll.question) + '</b>' + (poll.closed_at ? ' <span class="meta">（締切済み）</span>' : '') +
            rows.map((r) => '<div class="grp-opt"><button type="button" class="' + (r.mine ? 'button' : 'button-secondary') + '" ' + (poll.closed_at ? 'disabled' : 'data-g="vote" data-poll="' + escapeHtml(poll.id) + '" data-opt="' + escapeHtml(r.option_id) + '"') + '>' + escapeHtml(r.label) + (r.mine ? ' ✓' : '') + '　' + r.votes + '票（' + (total ? Math.round(Number(r.votes) / total * 100) : 0) + '%）</button><div class="grp-bar"><i style="width:' + (total ? Math.round(Number(r.votes) / total * 100) : 0) + '%"></i></div></div>').join("") +
            '<div class="meta">' + total + '票' + (mine ? ' ・ あなたの回答：' + escapeHtml(mine.label) : '') + '</div>' +
            ((!poll.closed_at && (owner || poll.created_by === state.user.id)) ? '<button type="button" class="button-secondary" data-g="closepoll" data-poll="' + escapeHtml(poll.id) + '">締め切る</button>' : '') + '</div>');
    }
    const members = (room.memberIds || []).map((id) => id === state.user.id ? "あなた" : profileDisplayName(feat.known.get(id))).join("、");
    const inviteRows = invites.data || [];
    const inviteLink = feat.groupInviteLink ? '<div class="admin-card"><div class="meta">作成した招待リンク（一度だけ利用できます。コピーして共有してください）</div><input id="gInviteLink" readonly value="' + escapeHtml(feat.groupInviteLink) + '"><button type="button" class="button-secondary" data-g="copyinvite">リンクをコピー</button></div>' : '';
    const inviteList = inviteRows.length ? inviteRows.map((item) => '<div class="grp-item"><span>' + escapeHtml(new Date(item.expires_at).toLocaleString()) + (item.used_at ? ' ・使用済み' : item.revoked_at ? ' ・取り消し済み' : ' ・未使用') + '</span>' + (!item.used_at && !item.revoked_at ? '<button type="button" class="hide-btn" data-g="revokeinvite" data-id="' + escapeHtml(item.id) + '">取り消す</button>' : '') + '</div>').join("") : '<div class="meta">有効な招待リンクはありません。</div>';
    openSheet('<h3 style="margin:0">👥 ' + escapeHtml(room.name || "グループ") + '</h3><div class="meta">メンバー ' + (room.memberIds || []).length + '人' + (owner ? ' ・ あなたが管理者です' : '') + '</div>' +
        '<div class="grp-sec"><h4>📌 注意事項</h4>' + (owner
            ? '<input id="gEditName" type="text" maxlength="40" value="' + escapeHtml(room.name || "") + '"><textarea id="gEditNotice" rows="3" maxlength="500">' + escapeHtml(room.notice || "") + '</textarea><button type="button" class="button" data-g="saveinfo">名前と注意事項を保存</button>'
            : '<div style="white-space:pre-wrap;overflow-wrap:anywhere">' + (room.notice ? escapeHtml(room.notice) : '<span class="meta">注意事項はありません。</span>') + '</div>') + '</div>' +
        '<div class="grp-sec"><h4>🔗 参考資料</h4>' + ((links.data || []).length ? links.data.map((l) => { const u = safeHttpUrl(l.url); return '<div class="grp-item"><span>' + (u ? '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.title) + '</a>' : escapeHtml(l.title)) + '</span>' + (owner ? '<button type="button" class="hide-btn" data-g="rmlink" data-id="' + escapeHtml(l.id) + '">削除</button>' : '') + '</div>'; }).join("") : '<div class="meta">リンクはありません。</div>') +
            (owner ? '<input id="gLinkTitle" type="text" maxlength="60" placeholder="リンクの名前"><input id="gLinkUrl" type="text" maxlength="500" placeholder="https://..."><button type="button" class="button-secondary" data-g="addlink">リンクを追加</button>' : '') + '</div>' +
        '<div class="grp-sec"><h4>📊 アンケート</h4>' + (pollHtml.join("") || '<div class="meta">アンケートはありません。</div>') +
            '<input id="gPollQ" type="text" maxlength="100" placeholder="質問（例：集合はいつ？）"><textarea id="gPollOpts" rows="3" placeholder="選択肢を1行に1つ（2〜6個）"></textarea><button type="button" class="button-secondary" data-g="newpoll">アンケートを作成してチャットに投稿</button></div>' +
        '<div class="grp-sec"><h4>👤 メンバー</h4><div style="overflow-wrap:anywhere">' + escapeHtml(members) + '</div>' +
            (owner ? '<label>メンバーを追加</label>' + pickList(room.memberIds || []) + '<button type="button" class="button-secondary" data-g="addmembers">選んだ人を追加</button>' : '') + '</div>' +
        (owner ? '<div class="grp-sec"><h4>🔐 期限付き招待リンク</h4><div class="row"><label for="gInviteHours">有効期限</label><select id="gInviteHours"><option value="1">1時間</option><option value="24" selected>24時間</option><option value="72">3日</option><option value="168">7日</option></select><button type="button" class="button-secondary" data-g="createinvite">一回限りリンクを作る</button></div>' + inviteLink + inviteList + '</div>' : '') +
        '<div class="row"><button type="button" class="button-danger" data-g="leave">グループを退出</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    if(owner) pickInit();
    if(focusPollId){ const target = document.getElementById("poll-" + focusPollId); if(target) target.scrollIntoView({block:"center"}); }
}

async function hashInviteToken(token){
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
    return Array.from(bytes).map((value) => value.toString(16).padStart(2,"0")).join("");
}

function createInviteToken(){
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function acceptGroupInviteFromUrl(){
    const params = new URLSearchParams(location.search), token = params.get("invite");
    if(!token) return;
    if(!/^[A-Za-z0-9_-]{40,50}$/.test(token)){ showToast("招待リンクの形式が正しくありません。"); return; }
    try{
        const result = await requireClient().rpc("accept_room_invite",{p_token_hash:await hashInviteToken(token)});
        if(result.error) throw result.error;
        params.delete("invite");
        const query = params.toString();
        history.replaceState(null,"",location.pathname + (query ? "?" + query : "") + location.hash);
        await loadRooms();
        const room = state.rooms.find((item) => item.id === result.data);
        if(room) await selectRoom(room,room.partner);
        showToast("グループに参加しました。");
    }catch(error){ showToast(featError(error)); }
}

const GROUP_ACTS = new Set(["unpick","create","createinvite","copyinvite","revokeinvite","saveinfo","addlink","rmlink","newpoll","vote","closepoll","addmembers","leave"]);
async function onGroupAction(event){
    const b = event.target.closest("[data-g]");
    if(!b) return;
    const act = b.dataset.g;
    // data-g は ゲーム画面などでも つかわれる。グループ用の操作だけ 受けもつ（そうしないと ゲームを押すと アンケート画面に なってしまう）
    if(!GROUP_ACTS.has(act)) return;
    const client = requireClient(), room = state.currentRoom;
    const val = (id) => (document.getElementById(id)?.value || "");
    if(act === "unpick"){
        feat.pickSel.delete(b.dataset.id);
        const box = [...document.querySelectorAll("input[data-pick]")].find((x) => x.dataset.pick === b.dataset.id);
        if(box){ box.checked = false; const row = box.closest(".pk-row"); if(row) row.classList.remove("on"); }
        showPickSel();
        return;
    }
    if(act === "create"){
        if(b.dataset.busy) return;
        const name = val("gName").trim();
        if(!name){ groupMessage("① グループ名を入力してください。","gName"); return; }
        if(Array.from(name).length > 40){ groupMessage("グループ名は40文字までです。","gName"); return; }
        if(!pickedIds().length){ groupMessage("② メンバーを1人以上選んでください。下の一覧から選べます。","pkQ"); return; }
        groupMessage("");
        b.dataset.busy = "1"; b.disabled = true;
        try{
            const r = await client.rpc("create_group",{p_name:name,p_member_ids:pickedIds(),p_notice:val("gNotice")});
            if(r.error) throw r.error;
            closeSheet();
            await loadRooms();
            const created = state.rooms.find((x) => x.id === r.data);
            if(created) await selectRoom(created,null);
            showToast("グループを作成しました。");
        }catch(error){
            delete b.dataset.busy; b.disabled = false;
            const text = String(error?.message || "");
            groupMessage(text.includes("rate_limited") ? "グループを作りすぎです（1時間に10個まで）。しばらくしてからお試しください。" : featError(error));
        }
        return;
    }
    b.disabled = true;
    try{
        if(!room) return;
        if(act === "createinvite"){
            const token = createInviteToken(), tokenHash = await hashInviteToken(token), hours = Math.min(168,Math.max(1,Number(val("gInviteHours")) || 24));
            const result = await client.rpc("create_room_invite",{p_room_id:room.id,p_token_hash:tokenHash,p_expires_in_hours:hours});
            if(result.error) throw result.error;
            const link = new URL("./chat.html",location.href); link.searchParams.set("invite",token); feat.groupInviteLink = link.toString();
            await renderGroupInfo(room.id);
            showToast("一度だけ使える招待リンクを作成しました。");
        }else if(act === "copyinvite"){
            await navigator.clipboard.writeText(document.getElementById("gInviteLink").value);
            showToast("招待リンクをコピーしました。");
        }else if(act === "revokeinvite"){
            const result = await client.rpc("revoke_room_invite",{p_invite_id:b.dataset.id});
            if(result.error) throw result.error;
            feat.groupInviteLink = "";
            await renderGroupInfo(room.id);
            showToast("招待リンクを取り消しました。");
        }else if(act === "saveinfo"){
            const r = await client.rpc("update_group_info",{p_room_id:room.id,p_name:val("gEditName"),p_notice:val("gEditNotice")});
            if(r.error) throw r.error;
            await loadRooms();
            const fresh = state.rooms.find((x) => x.id === room.id);
            if(fresh){ state.currentRoom = fresh; el.chatTitle.textContent = fresh.name; }
            showToast("保存しました。");
        }else if(act === "addlink"){
            const r = await client.rpc("add_room_link",{p_room_id:room.id,p_title:val("gLinkTitle"),p_url:val("gLinkUrl")});
            if(r.error) throw r.error;
        }else if(act === "rmlink"){
            const r = await client.rpc("remove_room_link",{p_link_id:b.dataset.id});
            if(r.error) throw r.error;
        }else if(act === "newpoll"){
            const options = val("gPollOpts").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
            const r = await client.rpc("create_poll",{p_room_id:room.id,p_question:val("gPollQ"),p_options:options});
            if(r.error) throw r.error;
            await sendMessagePayload({type:"poll",pollId:r.data,question:val("gPollQ").trim()});
        }else if(act === "vote"){
            const r = await client.rpc("vote_poll",{p_poll_id:b.dataset.poll,p_option_id:b.dataset.opt});
            if(r.error) throw r.error;
        }else if(act === "closepoll"){
            const r = await client.rpc("close_poll",{p_poll_id:b.dataset.poll});
            if(r.error) throw r.error;
        }else if(act === "addmembers"){
            const ids = pickedIds();
            if(!ids.length){ showToast("追加する人を選んでください。"); b.disabled = false; return; }
            const r = await client.rpc("add_group_members",{p_room_id:room.id,p_member_ids:ids});
            if(r.error) throw r.error;
            await loadRooms();
            const fresh = state.rooms.find((x) => x.id === room.id);
            if(fresh) state.currentRoom = fresh;
            updateHeaderPresence();
        }else if(act === "leave"){
            if(!window.confirm("このグループを退出しますか？")){ b.disabled = false; return; }
            const r = await client.rpc("leave_group",{p_room_id:room.id});
            if(r.error) throw r.error;
            closeSheet();
            cleanupSubscription();
            state.currentRoom = null;
            state.currentPartner = null;
            el.app.classList.remove("chat-open");
            setChatEnabled(false);
            await loadRooms();
            showToast("グループを退出しました。");
            return;
        }
        await renderGroupInfo(room.id);
    }catch(error){ b.disabled = false; showToast(featError(error)); }
}
