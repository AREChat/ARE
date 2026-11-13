"use strict";
// ===== 投稿・ストーリーの予約投稿 =====
// ・投稿の入力欄の「🕒 予約」／ストーリー投稿画面の「🕒 予約」で、日時を決めて予約できます。
// ・写真や動画は、予約した時点で保存場所にアップロードしておき、時間になるとサーバーが自動で投稿します（端末を閉じていてもOK）。
// ・大きすぎる動画は、いつもどおり「リンクで投稿」の画面になり、そのリンクを入れた文章を予約します。
// ・予約中の一覧（取り消しもここから）は「📋 予約中」から開けます。失敗した予約もここに残ります。

function initSchedContent(){
    registerTool("sched", onSchedAction);
    const submit = el.postSubmit;
    if(submit && submit.parentNode && !document.getElementById("postSchedule")){
        const b1 = document.createElement("button");
        b1.type = "button"; b1.className = "button-secondary"; b1.id = "postSchedule"; b1.setAttribute("data-feature", "posts"); b1.textContent = "🕒 予約";
        const b2 = document.createElement("button");
        b2.type = "button"; b2.className = "button-secondary"; b2.id = "postScheduledList"; b2.setAttribute("data-feature", "posts"); b2.textContent = "📋 予約中";
        submit.parentNode.insertBefore(b1, submit);
        submit.parentNode.insertBefore(b2, submit);
        b1.addEventListener("click", startSchedulePost);
        b2.addEventListener("click", () => openSchedList());
    }
}

function schedLocalInput(date){
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
}

function schedAt(days, hour, minute){
    const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, minute || 0, 0, 0); return d;
}

/** 日時を選ぶ画面。kind: "post" | "story"。選んだら onDone(Date) を呼ぶ。 */
function openSchedPicker(kind, onDone){
    schedState.onDone = onDone; schedState.kind = kind;
    const now = new Date();
    const quick = [["1時間後", new Date(now.getTime() + 3600000)], ["今日 21:00", schedAt(0, 21)], ["明日 7:00", schedAt(1, 7)], ["明日 12:00", schedAt(1, 12)], ["明日 20:00", schedAt(1, 20)]]
        .filter(([, d]) => d.getTime() > now.getTime() + 90000);
    const first = quick.length ? quick[0][1] : new Date(now.getTime() + 600000);
    openSheet(toolHead("🕒 " + (kind === "story" ? "ストーリー" : "投稿") + "を予約", "決めた日時に自動で" + (kind === "story" ? "ストーリーが公開されます（公開から24時間見られます）。" : "投稿されます。") + "1分以上先〜30日以内で指定できます。") +
        '<label for="schedAt">投稿する日時</label><input id="schedAt" type="datetime-local" min="' + schedLocalInput(new Date(now.getTime() + 60000)) + '" value="' + schedLocalInput(first) + '">' +
        (quick.length ? '<div class="row" style="justify-content:flex-start;flex-wrap:wrap">' + quick.map(([label, d]) => '<button type="button" class="button-secondary" data-t="sched:quick" data-at="' + schedLocalInput(d) + '">' + label + '</button>').join("") + '</div>' : "") +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">やめる</button><button type="button" class="button" data-t="sched:go">この日時に予約する</button></div>');
}

const schedState = {onDone: null, kind: "", rows: new Map()};

function startSchedulePost(){
    const hasBody = !!el.postBody.value.trim();
    if(!hasBody && !feat.postImageFile && !feat.postVideoFile){ showToast("予約する内容（文章か写真・動画）を入力してください。"); return; }
    if(Array.from(el.postBody.value).length > 500){ showToast("投稿は500文字以内で入力してください。"); return; }
    openSchedPicker("post", (when) => submitPost(undefined, when));
}

function schedSummary(row){
    const text = String(row.body || "").replace(/\s+/g, " ").slice(0, 30);
    const media = row.image_path ? (isPostVideoPath(row.image_path) ? "🎬 " : isPostPdfPath(row.image_path) ? "📄 " : "📷 ") : "";
    return media + (text ? escapeHtml(text) : (row.image_path ? "（写真・動画のみ）" : "（空）"));
}

async function openSchedList(){
    openSheet(toolHead("📋 予約中の投稿・ストーリー", "時間になると自動で公開されます。「編集」で日時や文章を直せます。「削除」すると、アップロード済みの写真・動画も消えます。") +
        '<div id="schedBox"><div class="empty-list">読み込み中...</div></div>' + toolClose());
    return loadSchedList();
}

async function loadSchedList(){
    const box = document.getElementById("schedBox"); if(!box) return;
    try{
        const client = requireClient();
        const [posts, stories] = await Promise.all([
            client.from("scheduled_posts").select("id,body,image_path,visibility,send_at,status,error").in("status", ["pending", "failed"]).order("send_at", {ascending: true}).limit(60),
            client.from("scheduled_stories").select("id,body,image_path,bg,send_at,status,error").in("status", ["pending", "failed"]).order("send_at", {ascending: true}).limit(60)
        ]);
        if(posts.error) throw posts.error;
        if(stories.error) throw stories.error;
        const rows = [].concat((posts.data || []).map((r) => Object.assign({kind: "post"}, r)), (stories.data || []).map((r) => Object.assign({kind: "story"}, r)))
            .sort((a, b) => new Date(a.send_at) - new Date(b.send_at));
        if(!document.getElementById("schedBox")) return;
        schedState.rows = new Map(rows.map((r) => [r.kind + ":" + r.id, r]));
        box.innerHTML = rows.length ? rows.map((r) =>
            '<div class="sched-item"><span>' + (r.kind === "story" ? "📖 ストーリー" : "📷 投稿") + '　' + escapeHtml(formatDateTime(r.send_at)) + '<br>' + schedSummary(r) +
            (r.status === "failed" ? '<br><b style="color:#ffb4a8">⚠ 投稿できませんでした：' + escapeHtml(String(r.error || "").slice(0, 80)) + '</b>' : "") + '</span>' +
            '<span style="display:flex;gap:6px;flex-shrink:0"><button type="button" class="button-secondary" data-t="sched:edit" data-kind="' + r.kind + '" data-id="' + escapeHtml(r.id) + '">' + (r.status === "failed" ? "直す" : "編集") + '</button>' +
            '<button type="button" class="button-secondary" data-t="sched:cancel" data-kind="' + r.kind + '" data-id="' + escapeHtml(r.id) + '">削除</button></span></div>').join("")
            : '<div class="empty-list">予約中のものはありません。</div>';
    }catch(error){ box.innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

function openSchedEdit(kind, id){
    const r = schedState.rows.get(kind + ":" + id);
    if(!r){ showToast("予約が見つかりません。一覧を開き直してください。"); return; }
    const max = kind === "story" ? 200 : 500;
    const vis = kind === "post"
        ? '<label for="seVis">公開範囲</label><select id="seVis">' + [["public", "全員"], ["followers", "フォロワーのみ"], ["private", "自分のみ"]].map(([v, t]) => '<option value="' + v + '"' + (r.visibility === v ? " selected" : "") + '>' + t + '</option>').join("") + '</select>'
        : '<label for="seBg">背景の色</label><select id="seBg">' + [["blue", "青"], ["pink", "ピンク"], ["green", "緑"], ["orange", "オレンジ"], ["purple", "紫"]].map(([v, t]) => '<option value="' + v + '"' + (r.bg === v ? " selected" : "") + '>' + t + '</option>').join("") + '</select>';
    openSheet(toolHead("✏ 予約を編集", (kind === "story" ? "ストーリー" : "投稿") + "の文章と日時を直せます。" + (r.image_path ? "（写真・動画は変えられません。変えたいときは削除して予約し直してください）" : "")) +
        '<label for="seBody">文章（' + max + '文字まで）</label><textarea id="seBody" rows="4" maxlength="' + max + '">' + escapeHtml(r.body || "") + '</textarea>' + vis +
        '<label for="seAt">投稿する日時</label><input id="seAt" type="datetime-local" min="' + schedLocalInput(new Date(Date.now() + 60000)) + '" value="' + schedLocalInput(new Date(Math.max(new Date(r.send_at).getTime(), Date.now() + 120000))) + '">' +
        (r.status === "failed" ? '<div class="meta">前回は投稿できませんでした。直して保存すると、もう一度予約されます。</div>' : "") +
        '<div class="row"><button type="button" class="button-secondary" data-t="sched:list">もどる</button><button type="button" class="button" data-t="sched:save" data-kind="' + kind + '" data-id="' + escapeHtml(id) + '">保存する</button></div>');
}

async function saveSchedEdit(node){
    const kind = node.dataset.kind, id = node.dataset.id;
    const body = (document.getElementById("seBody") || {}).value || "";
    const when = new Date((document.getElementById("seAt") || {}).value || "");
    if(isNaN(when.getTime()) || when.getTime() < Date.now() + 60000){ showToast("日時は1分以上先を指定してください。"); return; }
    if(when.getTime() > Date.now() + 30 * 86400000){ showToast("予約は30日先までです。"); return; }
    node.disabled = true;
    try{
        const client = requireClient();
        const result = kind === "story"
            ? await client.rpc("update_scheduled_story", {p_id: id, p_body: body, p_bg: (document.getElementById("seBg") || {}).value || "blue", p_send_at: when.toISOString()})
            : await client.rpc("update_scheduled_post", {p_id: id, p_body: body, p_visibility: (document.getElementById("seVis") || {}).value || "public", p_send_at: when.toISOString()});
        if(result.error) throw result.error;
        showToast("予約を直しました。");
        await openSchedList();
    }catch(error){ showToast(featError(error)); node.disabled = false; }
}

async function cancelSched(node){
    if(!window.confirm("この予約を削除しますか？（写真・動画も消えます）")) return;
    node.disabled = true;
    try{
        const client = requireClient();
        const result = await client.rpc(node.dataset.kind === "story" ? "cancel_scheduled_story" : "cancel_scheduled_post", {p_id: node.dataset.id});
        if(result.error) throw result.error;
        if(result.data) client.storage.from("post-images").remove([result.data]);
        showToast("予約を削除しました。");
        await loadSchedList();
    }catch(error){ showToast(featError(error)); node.disabled = false; }
}

function onSchedAction(action, node){
    if(action === "quick"){ const i = document.getElementById("schedAt"); if(i) i.value = node.dataset.at; return; }
    if(action === "list") return openSchedList();
    if(action === "cancel") return cancelSched(node);
    if(action === "edit") return openSchedEdit(node.dataset.kind, node.dataset.id);
    if(action === "save") return saveSchedEdit(node);
    if(action === "go"){
        const i = document.getElementById("schedAt");
        const when = new Date(i ? i.value : "");
        if(isNaN(when.getTime()) || when.getTime() < Date.now() + 60000){ showToast("日時は1分以上先を指定してください。"); return; }
        if(when.getTime() > Date.now() + 30 * 86400000){ showToast("予約は30日先までです。"); return; }
        const fn = schedState.onDone; schedState.onDone = null;
        closeSheet();
        if(fn) fn(when);
    }
}
