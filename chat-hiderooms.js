"use strict";
// ===== チャットの非表示（メッセージは消さずに、一覧から隠す）。個人チャットもグループも同じ =====
// ・チャット一覧の「⋯」→「🙈 このチャットを非表示にする」。メッセージも履歴も そのまま残ります
// ・戻すとき／開くとき／まとめて隠すとき：ユーザータブの「🙈 非表示のチャット」ボタン。ユーザータブが無い人は、トークタブ（チャット一覧）に出ます
//   （チェックを入れて、まとめて「非表示にする」「表示に戻す」。「開く」は一覧に戻してから開きます）
// ・隠したチャットに「新しいメッセージ（通知）」が来たとき、または通知から そのチャットを開いたときは、自動で一覧に戻します（見逃さないため）
// ・この端末にすぐ反映するため、まずはブラウザ（localStorage）に保存しますが、サーバー（chat_room_members.hidden）にも記録して、
//   別の端末（PC とスマホなど）にも同じ「隠す・戻す」を伝えます（未読の同期と同じやり方：サーバーの変更通知＋定期確認。sql/hidden_rooms_sync_v1.sql）。
//   どちらの端末で変えても、あとから変えたほう（いちばん新しい時刻）に両方が揃います。

const hr = { ids:new Set(), changed:{}, syncBusy:false };
function hrKey(){ return "are_hidden_rooms_" + (state.user ? state.user.id : "x"); }
function hrLoad(){
    try{
        const raw = JSON.parse(localStorage.getItem(hrKey()) || "null");
        if(Array.isArray(raw)){ hr.ids = new Set(raw); hr.changed = {}; }   // 旧い保存形式（配列だけ）からの移行
        else if(raw && typeof raw === "object"){ hr.ids = new Set(raw.ids || []); hr.changed = (raw.changed && typeof raw.changed === "object") ? raw.changed : {}; }
        else { hr.ids = new Set(); hr.changed = {}; }
    }catch(_e){ hr.ids = new Set(); hr.changed = {}; }
}
function hrSave(){ try{ localStorage.setItem(hrKey(), JSON.stringify({ids:[...hr.ids], changed:hr.changed})); }catch(_e){ showToast("この端末に保存できませんでした。"); } }
function hrIsAdmin(){ return !!(typeof feat !== "undefined" && feat.isAdmin) || !!(typeof segSt !== "undefined" && segSt.flags && segSt.flags.is_admin); }
function hrExists(id){ return (state.rooms || []).some((r) => r.id === id); }
function hrName(id){ return typeof roomNameById === "function" ? roomNameById(id) : "チャット"; }

/** この端末で「隠す／戻す」を変えたことを記録する（サーバーとの新旧比較に使う時刻つき） */
function hrSetLocal(id, hidden, iso){
    const at = iso || new Date().toISOString();
    if(hidden) hr.ids.add(id); else hr.ids.delete(id);
    hr.changed[id] = at;
}

/** サーバー側（他の端末も含む）の「隠す／戻す」を、この端末にも反映する。
    この端末のほうが新しく変えていれば、サーバーの古い値では上書きしない（あとから変えたほうが勝つ） */
function hrApplyServerRow(row){
    if(!row || !row.room_id) return false;
    const iso = row.hidden_changed_at || row.hiddenChangedAt;
    if(!iso) return false;
    const d = new Date(iso);
    if(isNaN(d.getTime())) return false;
    const v = d.toISOString();
    if(v <= (hr.changed[row.room_id] || "")) return false;
    hrSetLocal(row.room_id, Boolean(row.hidden), v);
    return true;
}

/** 他の端末での「隠す／戻す」を確認して、この端末にも揃える（20 秒ごと・画面に戻ったとき・通信が戻ったとき） */
async function hrSyncServer(){
    if(hr.syncBusy || !state.user) return;
    hr.syncBusy = true;
    try{
        const r = await requireClient().rpc("get_my_hidden_rooms");
        if(r.error || !Array.isArray(r.data)) return;
        let changed = false;
        r.data.forEach((row) => { if(hrApplyServerRow(row)) changed = true; });
        if(changed){ hrSave(); hrPaint(); }
    }catch(_e){ /* サーバーの関数が無い版でも、この端末だけの非表示として動く */ }
    finally{ hr.syncBusy = false; }
}

/** サーバーからの変更通知（自分の chat_room_members の行が変わった）を受けたとき */
function hrOnServerChange(row){
    if(!row || row.user_id !== state.user.id || !row.room_id) return;
    if(hrApplyServerRow(row)){ hrSave(); hrPaint(); }
}

/** サーバーに「隠す／戻す」を伝える（失敗しても、この端末の表示はそのまま進める） */
function hrPushServer(id, hidden){
    try{ Promise.resolve(requireClient().rpc("set_room_hidden", {p_room_id:id, p_hidden:hidden})).catch(() => {}); }catch(_e){ /* ほかの端末への同期ができなくても続ける */ }
}

function hrPaint(){
    const list = el && el.roomList; if(!list) return;
    list.querySelectorAll("[data-room-id]").forEach((b) => b.classList.toggle("hr-hide", hr.ids.has(b.dataset.roomId)));
    const n = [...hr.ids].filter(hrExists).length;
    document.querySelectorAll(".hr-btn").forEach((b) => { b.textContent = "🙈 非表示のチャット（" + n + "）"; });
}

function hrHide(id){
    hrSetLocal(id, true); hrSave();
    // 隠す前までの未読は「読んだ」ことにする（隠した直後に、古い未読で すぐ戻ってしまわないように）
    try{ if(typeof nfMarkSeen === "function") nfMarkSeen(id); }catch(_e){ /* 続行 */ }
    try{ Promise.resolve(requireClient().rpc("mark_room_read",{p_room_id:id})).catch(() => {}); }catch(_e){ /* ほかの端末への同期ができなくても続ける */ }
    hrPushServer(id, true);
    hrPaint(); closeSheet();
    showToast("非表示にしました（メッセージは消えていません）。戻すときは「🙈 非表示のチャット」から。");
}
function hrShow(id){ hrSetLocal(id, false); hrSave(); hrPushServer(id, false); hrPaint(); }

/** まとめて隠す／戻す（ids は配列）。隠す前までの未読は「読んだ」ことにして、すぐ戻らないようにする */
function hrHideMany(ids){
    ids.forEach((id) => { hrSetLocal(id, true); try{ if(typeof nfMarkSeen === "function") nfMarkSeen(id); }catch(_e){ /* 続行 */ } hrPushServer(id, true); });
    hrSave(); hrPaint();
}
function hrShowMany(ids){ ids.forEach((id) => { hrSetLocal(id, false); hrPushServer(id, false); }); hrSave(); hrPaint(); }

/** 「非表示のチャット」の画面：表示中・非表示のチャットを ぜんぶ並べて、チェックしてまとめて 隠す／戻す ができる */
function hrOpenList(keepScroll){
    const all = (state.rooms || []);
    const hidden = all.filter((r) => hr.ids.has(r.id));
    const shown = all.filter((r) => !hr.ids.has(r.id));
    const row = (r, mode) => '<label class="admin-card hr-row" style="display:flex;align-items:center;gap:10px;margin:6px 0;cursor:pointer"><input type="checkbox" class="hr-chk" data-hrid="' + escapeHtml(r.id) + '" data-hrmode="' + mode + '" style="width:22px;height:22px;flex:none">' +
        '<span style="flex:1;min-width:0"><b>' + escapeHtml(hrName(r.id)) + '</b><span class="meta"> ' + (r.is_group ? "グループ" : "個人チャット") + '</span></span>' +
        (mode === "hidden" ? '<button type="button" class="button" data-hropen="' + escapeHtml(r.id) + '" style="min-height:40px">開く</button>' : '') + '</label>';
    const sec = (title, list, mode, act, actLabel, allLabel) => '<h4 style="margin:14px 0 4px">' + title + '（' + list.length + '）</h4>' +
        (list.length ? '<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="button-secondary" data-hrall="' + mode + '" style="min-height:40px">' + allLabel + '</button>' +
            '<button type="button" class="button" data-hract="' + act + '" style="min-height:40px">' + actLabel + '</button></div>' + list.map((r) => row(r, mode)).join("")
            : '<div class="empty-list">' + (mode === "hidden" ? "非表示のチャットはありません。" : "表示中のチャットはありません。") + '</div>');
    openSheet('<h3 style="margin:0">🙈 チャットの表示・非表示</h3><div class="meta">チェックを入れて、まとめて「非表示にする」「表示に戻す」ができます。メッセージは消えません。「開く」を押すと、一覧に戻してチャットを開きます。</div>' +
        sec("非表示のチャット", hidden, "hidden", "show", "選んだチャットを表示に戻す", "ぜんぶ選ぶ／外す") +
        sec("表示中のチャット", shown, "shown", "hide", "選んだチャットを非表示にする", "ぜんぶ選ぶ／外す") +
        '<div class="row" style="margin-top:12px"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    const checked = (mode) => [...document.querySelectorAll('.hr-chk[data-hrmode="' + mode + '"]:checked')].map((c) => c.dataset.hrid);
    document.querySelectorAll("[data-hropen]").forEach((b) => b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const id = b.dataset.hropen; const room = state.rooms.find((r) => r.id === id);
        hrShow(id);                                     // 「開く」＝ チャット一覧に戻して、そのチャットを開く
        closeSheet(); if(room) selectRoom(room, room.partner);
        showToast("一覧に戻しました。");
    }));
    document.querySelectorAll("[data-hrall]").forEach((b) => b.addEventListener("click", () => {
        const boxes = [...document.querySelectorAll('.hr-chk[data-hrmode="' + b.dataset.hrall + '"]')];
        const on = boxes.some((c) => !c.checked); boxes.forEach((c) => { c.checked = on; });
    }));
    document.querySelectorAll("[data-hract]").forEach((b) => b.addEventListener("click", () => {
        const act = b.dataset.hract; const ids = checked(act === "show" ? "hidden" : "shown");
        if(!ids.length){ showToast("先に、チャットにチェックを入れてください。"); return; }
        if(act === "show"){ hrShowMany(ids); showToast(ids.length + "件を、一覧に戻しました。"); }
        else { hrHideMany(ids); showToast(ids.length + "件を、非表示にしました。（メッセージは消えていません）"); }
        hrOpenList();
    }));
}

function hrAddButtons(){
    const css = document.createElement("style");
    css.textContent = ".room-item.hr-hide{display:none!important}.hr-btn{width:100%;min-height:44px;margin:6px 0}body:not(.seg-no-users) #hrBtnChats{display:none}";
    document.head.appendChild(css);
    const mk = (id) => { const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "button-secondary hr-btn"; b.textContent = "🙈 非表示のチャット（0）"; b.addEventListener("click", hrOpenList); return b; };
    // ユーザータブでは「未登録」の右どなりに、1行表示の小さいボタンとして出す
    const heading = document.getElementById("usersStatsHeading");
    if(heading) heading.appendChild(mk("hrBtnUsers"));
    else{ const u = document.querySelector(".pane-users #recommendedUsers"); if(u) u.insertAdjacentElement("beforebegin", mk("hrBtnUsers")); }
    const c = document.getElementById("roomList"); if(c) c.insertAdjacentElement("beforebegin", mk("hrBtnChats"));
}

function initHideRooms(){
    hrLoad(); hrAddButtons();
    const orig = renderRooms;
    renderRooms = function(){ orig.apply(this, arguments); try{ hrPaint(); }catch(e){ console.error("[ARE hide]", e); } };
    // 隠しているチャットに新着（未読）が来たら、一覧に戻す
    if(typeof nfPaint === "function"){
        const origPaint = nfPaint;
        nfPaint = function(){
            try{
                const back = [...hr.ids].filter((id) => (feat.unread && feat.unread[id] > 0) && hrExists(id));
                if(back.length){
                    back.forEach((id) => { hrSetLocal(id, false); hrPushServer(id, false); }); hrSave(); hrPaint();
                    showToast("非表示にしていたチャット（" + back.map(hrName).join("、") + "）に新着があったので、一覧に戻しました。");
                }
            }catch(e){ console.error("[ARE hide]", e); }
            return origPaint.apply(this, arguments);
        };
    }
    // 非表示のチャットを開いたとき（通知をタップして開いた場合など）も、一覧に戻す
    if(typeof selectRoom === "function"){
        const origSel = selectRoom;
        selectRoom = function(room){
            try{ if(room && room.id && hr.ids.has(room.id)){ hrShow(room.id); } }catch(e){ console.error("[ARE hide]", e); }
            return origSel.apply(this, arguments);
        };
    }
    // ===== 隠す・戻すの同期：ほかの端末で変えたら、この端末も揃える（未読の同期と同じやり方） =====
    // ① サーバーの変更通知：自分の chat_room_members の行が変わったら すぐ反映
    try{
        requireClient().channel("are-hidden").on("postgres_changes", {event:"UPDATE", schema:"public", table:TABLES.members, filter:"user_id=eq." + state.user.id}, (payload) => hrOnServerChange(payload.new)).subscribe();
    }catch(_e){ /* 通知が使えなくても、下の定期確認で同期される */ }
    // ② 20 秒ごとの確認（画面が見えているときだけ）、③ 画面に戻ったとき・通信が戻ったとき
    feat.timers.push(setInterval(() => { if(!document.hidden) hrSyncServer(); }, 20000));
    window.addEventListener("focus", () => { hrSyncServer(); });
    window.addEventListener("online", () => { hrSyncServer(); });
    hrSyncServer();
    if(state.rooms && state.rooms.length) hrPaint();
}
