"use strict";
// ===== タイムカプセル／合言葉の秘密の部屋 =====
// ・タイムカプセル：メッセージに「封」をして、1時間後〜約3年後の好きな日に、このチャットへ自動でとどけます（サーバーの予約送信を使います。schedule_capsule）。
// ・合言葉の部屋：グループをつくった人が「部屋コード＋合言葉」をつけると、その2つを知っている人だけが、参加できます（secret_room_*）。
//   合言葉は、サーバーに「元に戻せない形」でしか保存しません（つくった人にも見えません。忘れたら、変更して設定しなおします）。

const cp = {rows:[], sec:null, secRoom:null, lastPhrase:"", lastCode:""};
const CP_MAX_DAYS = 1090;   // サーバーの上限は 1095 日。少し余裕をもたせる

function initCapsule(){
    registerTool("cp", onCapsuleAction);
    registerTool("sr", onSecretAction);
    extraBubbles.capsule = (item) => {
        const when = item.sealed ? formatDateTime(item.sealed) : "";
        return '<div class="bubble cp-bubble">💌 <b>タイムカプセル</b>' + (item.from ? '<span class="meta">　' + escapeHtml(String(item.from).slice(0, 30)) + 'より</span>' : "") +
            '<div style="white-space:pre-wrap;word-break:break-word;margin:6px 0">' + escapeHtml(String(item.text || "").slice(0, 4000)) + '</div>' +
            (when ? '<span class="meta">' + escapeHtml(when) + ' に封をして、いま とどきました</span>' : "") + '</div>';
    };
}

// ---------- タイムカプセル ----------
function cpAfter(days){ const d = new Date(Date.now() + days * 86400000); d.setSeconds(0, 0); return d; }
function cpMinInput(){ return msLocalInput(new Date(Date.now() + 2 * 3600000)); }
function cpMaxInput(){ return msLocalInput(cpAfter(CP_MAX_DAYS)); }

async function openCapsule(){
    const room = state.currentRoom;
    if(!room){ showToast("先にチャットを開いてください（そのチャットに、とどきます）。"); return; }
    cp.room = room.id;
    openSheet(toolHead("💌 タイムカプセル", "メッセージに封をして、未来の日に、このチャットへ自動でとどけます（1時間後〜約3年後）") +
        '<label for="cpText">未来へのメッセージ（2000文字まで）</label><textarea id="cpText" rows="5" maxlength="2000" placeholder="例：1年後のみんなへ。元気にしていますか？"></textarea>' +
        '<label>いつ とどける？</label><div class="row" style="flex-wrap:wrap;justify-content:flex-start">' +
        [["1か月後", 30], ["半年後", 182], ["1年後", 365], ["2年後", 730], ["3年後", CP_MAX_DAYS]].map((x) => '<button type="button" class="button-secondary" data-t="cp:preset" data-d="' + x[1] + '">' + x[0] + '</button>').join("") + '</div>' +
        '<input id="cpAt" type="datetime-local" min="' + cpMinInput() + '" max="' + cpMaxInput() + '" value="' + msLocalInput(cpAfter(365)) + '">' +
        '<div class="meta" id="cpHint"></div>' +
        '<div class="row"><button type="button" class="button" data-t="cp:seal">🔒 封をして予約する</button></div>' +
        '<div class="meta">・「あなたが送ったメッセージ」として、そのチャットにとどきます。<br>・そのチャットから抜けたり、アカウントがなくなったりすると、とどきません。<br>・封をしたあとは、下の一覧から、とりやめ（取り消し）ができます。</div>' +
        '<hr class="sep"><b>このチャットで封をしたカプセル</b><div id="cpList"><div class="empty-list">読み込み中...</div></div>' + toolClose());
    cpHint();
    await cpLoad();
}
function cpHint(){
    const n = $("cpAt"), h = $("cpHint"); if(!n || !h) return;
    const d = new Date(n.value);
    h.textContent = isNaN(d.getTime()) ? "" : "とどく日時：" + formatDateTime(d.toISOString());
}
async function cpLoad(){
    const room = cp.room; if(!room) return;
    const r = await requireClient().from("scheduled_messages").select("id,content,send_at,status").eq("room_id", room).eq("status", "pending").ilike("content", "%\"type\":\"capsule\"%").order("send_at", {ascending:true}).limit(50);
    if(!$("cpList") || cp.room !== room) return;
    if(r.error){ $("cpList").innerHTML = '<div class="empty-list">' + escapeHtml(featError(r.error)) + '</div>'; return; }
    cp.rows = r.data || [];
    $("cpList").innerHTML = cp.rows.length ? cp.rows.map((x) => {
        const p = parseMessageContent(x.content) || {};
        return '<div class="admin-card"><b>🔒 ' + escapeHtml(formatDateTime(x.send_at)) + ' にとどきます</b><details><summary class="meta">中身を見る</summary><div style="white-space:pre-wrap">' + escapeHtml(String(p.text || "").slice(0, 2000)) + '</div></details>' +
            '<div class="row"><button type="button" class="button-danger" data-t="cp:cancel" data-id="' + escapeHtml(x.id) + '">とりやめる</button></div></div>';
    }).join("") : '<div class="empty-list">まだありません。</div>';
}
async function onCapsuleAction(action, node){
    if(action === "preset"){ $("cpAt").value = msLocalInput(cpAfter(Number(node.dataset.d))); cpHint(); return; }
    if(action === "seal"){
        const text = ($("cpText").value || "").trim(), at = new Date($("cpAt").value || "");
        if(!text){ showToast("メッセージを入れてください。"); return; }
        if(isNaN(at.getTime())){ showToast("とどく日時を決めてください。"); return; }
        if(at.getTime() < Date.now() + 3600000 + 30000){ showToast("1時間より先の日時にしてください。"); return; }
        if(at.getTime() > Date.now() + CP_MAX_DAYS * 86400000){ showToast("約3年（" + CP_MAX_DAYS + "日）より先は、えらべません。"); return; }
        const btn = node; btn.disabled = true;
        try{
            const payload = {type:"capsule", text, from:profileDisplayName(state.profile || {}), sealed:new Date().toISOString()};
            const r = await requireClient().rpc("schedule_capsule", {p_room_id:cp.room, p_content:JSON.stringify(payload), p_send_at:at.toISOString()});
            if(r.error) throw r.error;
            $("cpText").value = "";
            showToast("封をしました。" + formatDateTime(at.toISOString()) + " にとどきます。");
            await cpLoad();
        }catch(e){
            const m = String((e && e.message) || "");
            showToast(m.includes("too_many_capsules") ? "封をしたまま たまっているカプセルが多すぎます（10個まで）。先に とりやめてください。" : m.includes("send_at_out_of_range") ? "日時は、1時間後〜約3年後にしてください。" : featError(e));
        }finally{ btn.disabled = false; }
        return;
    }
    if(action === "cancel"){
        if(!confirm("このカプセルを とりやめます（もとには戻せません）。よろしいですか？")) return;
        try{
            const r = await requireClient().rpc("cancel_scheduled_message", {p_id:node.dataset.id});
            if(r.error) throw r.error;
            await cpLoad();
        }catch(e){ showToast(featError(e)); }
    }
}
document.addEventListener("input", (e) => { if(e.target && e.target.id === "cpAt") cpHint(); });
document.addEventListener("change", (e) => { if(e.target && e.target.id === "cpAt") cpHint(); });

// ---------- 合言葉の秘密の部屋 ----------
function srMsg(e){
    const m = String((e && e.message) || "");
    if(m.includes("secret_wrong")) return "部屋コードか合言葉が ちがいます。";
    if(m.includes("rate_limited")) return "まちがいが続いたので、10分ほど あけてから、もういちど ためしてください。";
    if(m.includes("room_full")) return "この部屋は、いっぱいで入れません。";
    if(m.includes("segment_blocked")) return "この部屋には、入れません。";
    if(m.includes("secret_phrase_invalid")) return "合言葉は 4〜30文字で入れてください。";
    if(m.includes("not_allowed")) return "この操作は、グループをつくった人だけができます。";
    return featError(e);
}
async function openSecretRoom(){
    const room = state.currentRoom;
    cp.secRoom = room && room.is_group && room.created_by === state.user.id ? room.id : null;
    cp.sec = null; cp.lastPhrase = ""; cp.lastCode = "";
    openSheet(toolHead("🔑 合言葉の秘密の部屋", "「部屋コード」と「合言葉」を知っている人だけが入れるグループです") +
        '<div class="admin-card"><b>合言葉で入る</b><label for="srCode">部屋コード（8文字）</label><input id="srCode" type="text" maxlength="14" autocapitalize="characters" autocomplete="off" placeholder="例：K7M2QX9A" style="text-transform:uppercase">' +
        '<label for="srPhrase">合言葉</label><input id="srPhrase" type="text" maxlength="30" autocomplete="off" placeholder="教えてもらった合言葉">' +
        '<div class="row"><button type="button" class="button" data-t="sr:join">入る</button></div>' +
        '<div class="meta">まちがいが5回続くと、10分ほど入れなくなります。</div></div>' +
        '<div id="srOwn"></div>' + toolClose());
    await srPaintOwn();
}
async function srPaintOwn(){
    const box = $("srOwn"); if(!box) return;
    const room = state.currentRoom;
    if(!room){ box.innerHTML = '<div class="meta">合言葉をつけたいグループを開いてから、もういちど このボタンを押してください。</div>'; return; }
    if(!room.is_group){ box.innerHTML = '<div class="meta">いま開いているのは 1対1のチャットです。合言葉は、グループにだけつけられます。</div>'; return; }
    if(room.created_by !== state.user.id){ box.innerHTML = '<div class="meta">このグループの合言葉は、グループをつくった人だけが設定できます。</div>'; return; }
    box.innerHTML = '<div class="empty-list">読み込み中...</div>';
    try{
        const r = await requireClient().rpc("secret_room_status", {p_room:room.id});
        if(r.error) throw r.error;
        cp.sec = r.data || {on:false};
    }catch(e){ box.innerHTML = '<div class="empty-list">' + escapeHtml(srMsg(e)) + '</div>'; return; }
    const on = !!cp.sec.on;
    box.innerHTML = '<div class="admin-card"><b>「' + escapeHtml(room.name || "このグループ") + '」の合言葉</b>' +
        (on ? '<div style="margin:6px 0">部屋コード：<b style="font-size:1.2em;letter-spacing:.1em">' + escapeHtml(cp.sec.code || cp.lastCode || "") + '</b> <button type="button" class="button-secondary" data-t="sr:copycode">コピー</button></div>' +
            '<div class="meta">合言葉は、安全のため、サーバーには「元に戻せない形」でしか入っていません。忘れたときは、下で新しく決めなおしてください。</div>' : '<div class="meta">まだ合言葉はありません。つけると、部屋コードができます。</div>') +
        '<label for="srNew">' + (on ? "新しい合言葉に変える" : "合言葉を決める") + '（4〜30文字）</label><input id="srNew" type="text" maxlength="30" autocomplete="off" placeholder="例：ひまわり2026">' +
        '<div class="row" style="flex-wrap:wrap"><button type="button" class="button" data-t="sr:set">' + (on ? "変える" : "合言葉をつける") + '</button>' + (on ? '<button type="button" class="button-danger" data-t="sr:clear">合言葉を やめる</button>' : "") + '</div>' +
        '<div id="srShare"></div></div>';
}
async function onSecretAction(action, node){
    if(action === "join"){
        const code = ($("srCode").value || "").replace(/\s+/g, "").toUpperCase(), phrase = ($("srPhrase").value || "").trim();
        if(code.length !== 8 || !phrase){ showToast("部屋コード（8文字）と合言葉を入れてください。"); return; }
        node.disabled = true;
        try{
            const r = await requireClient().rpc("secret_room_join", {p_code:code, p_phrase:phrase});
            if(r.error) throw r.error;
            const id = r.data;
            closeSheet();
            showToast("グループに入りました。");
            // 一覧の読み込み中だと、新しい部屋がまだ入っていないことがあるので、見えるまで数回やりなおす
            for(let i = 0; i < 8; i++){
                await loadRooms();
                if((state.rooms || []).some((x) => x.id === id)){ nfOpenRoom(id); break; }
                await new Promise((res) => setTimeout(res, 700));
            }
        }catch(e){ showToast(srMsg(e)); }
        finally{ node.disabled = false; }
        return;
    }
    if(action === "set"){
        const ph = ($("srNew").value || "").trim(), room = state.currentRoom;
        if(!room || Array.from(ph).length < 4 || Array.from(ph).length > 30){ showToast("合言葉は 4〜30文字で入れてください。"); return; }
        node.disabled = true;
        try{
            const r = await requireClient().rpc("secret_room_set", {p_room:room.id, p_phrase:ph});
            if(r.error) throw r.error;
            cp.lastPhrase = ph; cp.lastCode = r.data;
            await srPaintOwn();
            const share = $("srShare");
            if(share){
                const text = "「" + (room.name || "グループ") + "」に入るには、ARE の「🔑 合言葉の秘密の部屋」で、\n部屋コード：" + cp.lastCode + "\n合言葉：" + cp.lastPhrase + "\nを入れてください。";
                share.innerHTML = '<div class="meta" style="margin-top:6px">いま決めた合言葉です（この画面を閉じると、もう見られません）。友だちに、チャット以外の方法で、そっと伝えるのがおすすめです。</div><pre class="meta" style="white-space:pre-wrap;user-select:all">' + escapeHtml(text) + '</pre><div class="row"><button type="button" class="button-secondary" data-t="sr:copyinv">案内文をコピー</button></div>';
                share.dataset.text = text;
            }
        }catch(e){ showToast(srMsg(e)); }
        finally{ node.disabled = false; }
        return;
    }
    if(action === "clear"){
        if(!confirm("合言葉をやめます。部屋コードも使えなくなります（いまのメンバーは、そのままです）。よろしいですか？")) return;
        try{
            const r = await requireClient().rpc("secret_room_clear", {p_room:state.currentRoom.id});
            if(r.error) throw r.error;
            cp.lastPhrase = ""; cp.lastCode = "";
            await srPaintOwn();
        }catch(e){ showToast(srMsg(e)); }
        return;
    }
    if(action === "copycode" || action === "copyinv"){
        const text = action === "copycode" ? String((cp.sec && cp.sec.code) || cp.lastCode || "") : String(($("srShare") || {}).dataset ? $("srShare").dataset.text || "" : "");
        try{ await navigator.clipboard.writeText(text); showToast("コピーしました。"); }catch(_e){ showToast("コピーできませんでした。"); }
    }
}
