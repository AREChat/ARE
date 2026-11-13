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

const schedState = {onDone: null, kind: ""};

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
    openSheet(toolHead("📋 予約中の投稿・ストーリー", "時間になると自動で公開されます。取り消すと、アップロード済みの写真・動画も削除されます。") +
        '<div id="schedBox"><div class="empty-list">読み込み中...</div></div>' + toolClose());
    return loadSchedList();
}

async function loadSchedList(){
    const box = document.getElementById("schedBox"); if(!box) return;
    try{
        const client = requireClient();
        const [posts, stories] = await Promise.all([
            client.from("scheduled_posts").select("id,body,image_path,visibility,send_at,status,error").in("status", ["pending", "failed"]).order("send_at", {ascending: true}).limit(60),
            client.from("scheduled_stories").select("id,body,image_path,send_at,status,error").in("status", ["pending", "failed"]).order("send_at", {ascending: true}).limit(60)
        ]);
        if(posts.error) throw posts.error;
        if(stories.error) throw stories.error;
        const rows = [].concat((posts.data || []).map((r) => Object.assign({kind: "post"}, r)), (stories.data || []).map((r) => Object.assign({kind: "story"}, r)))
            .sort((a, b) => new Date(a.send_at) - new Date(b.send_at));
        if(!document.getElementById("schedBox")) return;
        box.innerHTML = rows.length ? rows.map((r) =>
            '<div class="sched-item"><span>' + (r.kind === "story" ? "📖 ストーリー" : "📷 投稿") + '　' + escapeHtml(formatDateTime(r.send_at)) + '<br>' + schedSummary(r) +
            (r.status === "failed" ? '<br><b style="color:#ffb4a8">⚠ 投稿できませんでした：' + escapeHtml(String(r.error || "").slice(0, 80)) + '</b>' : "") + '</span>' +
            '<button type="button" class="button-secondary" data-t="sched:cancel" data-kind="' + r.kind + '" data-id="' + escapeHtml(r.id) + '">' + (r.status === "failed" ? "消す" : "取消") + '</button></div>').join("")
            : '<div class="empty-list">予約中のものはありません。</div>';
    }catch(error){ box.innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

async function cancelSched(node){
    if(!window.confirm("この予約を取り消しますか？")) return;
    node.disabled = true;
    try{
        const client = requireClient();
        const result = await client.rpc(node.dataset.kind === "story" ? "cancel_scheduled_story" : "cancel_scheduled_post", {p_id: node.dataset.id});
        if(result.error) throw result.error;
        if(result.data) client.storage.from("post-images").remove([result.data]);
        showToast("予約を取り消しました。");
        await loadSchedList();
    }catch(error){ showToast(featError(error)); node.disabled = false; }
}

function onSchedAction(action, node){
    if(action === "quick"){ const i = document.getElementById("schedAt"); if(i) i.value = node.dataset.at; return; }
    if(action === "list") return openSchedList();
    if(action === "cancel") return cancelSched(node);
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
