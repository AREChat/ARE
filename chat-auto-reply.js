"use strict";

const AUTO_REPLY_DAYS = [[0,"日"],[1,"月"],[2,"火"],[3,"水"],[4,"木"],[5,"金"],[6,"土"]];

function initAutoReply(){
    if(el.profileSheet.dataset.autoReplyBound) return;
    el.profileSheet.dataset.autoReplyBound = "true";
    el.profileSheet.addEventListener("click",onAutoReplyAction);
}

function autoReplyKindFields(kind,rule){
    const keyword = kind === "keyword";
    const selectedDays = rule?.days || [0,1,2,3,4,5,6];
    return '<div id="arKeywordFields"' + (keyword ? "" : " hidden") + '><label for="arKeyword">反応する言葉</label><input id="arKeyword" maxlength="80" value="' + escapeHtml(rule?.keyword || "") + '" placeholder="例：おはよう"><label for="arMatchType">判定方法</label><select id="arMatchType"><option value="contains"' + (!rule || rule.match_type === "contains" ? " selected" : "") + '>文章に含まれたら</option><option value="exact"' + (rule?.match_type === "exact" ? " selected" : "") + '>メッセージ全体が一致したら</option></select></div>' +
        '<div id="arScheduleFields"' + (keyword ? " hidden" : "") + '><div class="row"><label>開始 <input id="arStart" type="time" value="' + escapeHtml(rule?.start_time || "22:00") + '"></label><label>終了 <input id="arEnd" type="time" value="' + escapeHtml(rule?.end_time || "08:00") + '"></label></div><div class="ar-days">' + AUTO_REPLY_DAYS.map(([day,label]) => '<label><input type="checkbox" data-ar-day="' + day + '"' + (selectedDays.includes(day) ? " checked" : "") + '> ' + label + '</label>').join("") + '</div><label for="arTimezone">タイムゾーン</label><input id="arTimezone" maxlength="80" value="' + escapeHtml(rule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo") + '" placeholder="Asia/Tokyo"></div>';
}

function openAutoReplyForm(rule){
    const kind = rule?.kind || "keyword";
    openSheet('<div class="auto-reply-sheet"><h3>' + (rule ? "自動応答を編集" : "自動応答を追加") + '</h3><label for="arName">ルール名</label><input id="arName" maxlength="50" value="' + escapeHtml(rule?.name || "") + '" placeholder="例：就寝中"><label for="arKind">種類</label><select id="arKind"><option value="keyword"' + (kind === "keyword" ? " selected" : "") + '>指定した言葉</option><option value="schedule"' + (kind === "schedule" ? " selected" : "") + '>曜日・時間帯</option></select>' + autoReplyKindFields(kind,rule) + '<label for="arResponse">自動で返すメッセージ</label><textarea id="arResponse" rows="4" maxlength="500" placeholder="自分で決めた文章をそのまま返します">' + escapeHtml(rule?.response || "") + '</textarea><label for="arCooldown">同じ相手への返信間隔</label><select id="arCooldown"><option value="0"' + (!rule || rule.cooldown_minutes === 0 ? " selected" : "") + '>毎回返信する</option><option value="5"' + (rule?.cooldown_minutes === 5 ? " selected" : "") + '>5分に1回</option><option value="30"' + (rule?.cooldown_minutes === 30 ? " selected" : "") + '>30分に1回</option><option value="60"' + (rule?.cooldown_minutes === 60 ? " selected" : "") + '>1時間に1回</option><option value="1440"' + (rule?.cooldown_minutes === 1440 ? " selected" : "") + '>1日に1回</option></select><div class="meta">指定時間帯に届いた1対1チャットへ返信します。グループチャットは対象外です。</div><div class="row"><button type="button" class="button-secondary" data-pm="close">キャンセル</button><button type="button" class="button" id="arSave">保存</button></div></div>');
    const kindInput = document.getElementById("arKind");
    kindInput.addEventListener("change",() => { const next = kindInput.value; document.getElementById("arKeywordFields").hidden = next !== "keyword"; document.getElementById("arScheduleFields").hidden = next !== "schedule"; });
    document.getElementById("arSave").addEventListener("click",() => saveAutoReply(rule || null));
}

function autoReplyDescription(rule){
    if(rule.kind === "keyword") return (rule.match_type === "exact" ? "完全一致「" : "含む「") + rule.keyword + "」";
    const days = (rule.days || []).map((day) => AUTO_REPLY_DAYS.find((item) => item[0] === day)?.[1] || "").join("・");
    return days + " " + String(rule.start_time).slice(0,5) + "〜" + String(rule.end_time).slice(0,5) + "（" + rule.timezone + "）";
}

async function openAutoReply(){
    try{
        const result = await requireClient().from("auto_reply_rules").select("*").order("created_at",{ascending:false});
        if(result.error) throw result.error;
        const rows = result.data || [];
        openSheet(toolHead("🤖 自動応答","言葉や曜日・時間帯に応じて、設定した文章をそのまま返します。") + '<div class="row"><button type="button" class="button" id="arNew"' + (rows.length >= 20 ? " disabled" : "") + '>＋ ルールを追加</button></div>' + (rows.length ? '<div class="auto-reply-list">' + rows.map((rule) => '<article class="auto-reply-card"><div class="auto-reply-title"><b>' + escapeHtml(rule.name) + '</b><span>' + (rule.enabled ? "有効" : "停止中") + '</span></div><div class="meta">' + escapeHtml(autoReplyDescription(rule)) + '</div><div class="auto-reply-response">' + escapeHtml(rule.response) + '</div><div class="row"><button type="button" class="button-secondary" data-ar-action="edit" data-ar-id="' + escapeHtml(rule.id) + '">編集</button><button type="button" class="button-secondary" data-ar-action="toggle" data-ar-id="' + escapeHtml(rule.id) + '">' + (rule.enabled ? "停止" : "有効化") + '</button><button type="button" class="button-secondary" data-ar-action="delete" data-ar-id="' + escapeHtml(rule.id) + '">削除</button></div></article>').join("") + '</div>' : '<div class="empty-list">自動応答ルールはまだありません。</div>') + '<div class="meta">最大20件まで設定できます。キーワードの返信間隔を「毎回」にすると、該当するメッセージごとに固定文を返信します。</div>' + toolClose());
        document.getElementById("arNew")?.addEventListener("click",() => openAutoReplyForm(null));
    }catch(error){ openSheet(toolHead("🤖 自動応答","") + '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>' + toolClose()); }
}

async function saveAutoReply(rule){
    const id = rule?.id || "";
    const button = document.getElementById("arSave"), kind = document.getElementById("arKind").value;
    const name = document.getElementById("arName").value.trim(), response = document.getElementById("arResponse").value.trim();
    if(!name || !response){ showToast("ルール名と返信文を入力してください。"); return; }
    const values = {name,kind,response,cooldown_minutes:Number(document.getElementById("arCooldown").value),enabled:rule ? rule.enabled : true,priority:rule?.priority || 50};
    if(kind === "keyword"){
        values.keyword = document.getElementById("arKeyword").value.trim(); values.match_type = document.getElementById("arMatchType").value; values.start_time = null; values.end_time = null; values.days = null; values.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
        if(!values.keyword){ showToast("反応する言葉を入力してください。"); return; }
    }else{
        values.keyword = null; values.match_type = "contains"; values.start_time = document.getElementById("arStart").value; values.end_time = document.getElementById("arEnd").value; values.days = [...el.profileSheet.querySelectorAll("[data-ar-day]:checked")].map((node) => Number(node.dataset.arDay)); values.timezone = document.getElementById("arTimezone").value.trim();
        if(!values.start_time || !values.end_time || values.start_time === values.end_time || !values.days.length){ showToast("開始・終了時刻と曜日を確認してください。"); return; }
        try{ new Intl.DateTimeFormat("ja-JP",{timeZone:values.timezone}).format(); }catch(_error){ showToast("タイムゾーンを確認してください（例：Asia/Tokyo）。"); return; }
    }
    button.disabled = true;
    try{
        const query = requireClient().from("auto_reply_rules");
        const result = id ? await query.update(values).eq("id",id).eq("user_id",state.user.id) : await query.insert(Object.assign({user_id:state.user.id},values));
        if(result.error) throw result.error;
        showToast(id ? "自動応答を更新しました。" : "自動応答を追加しました。");
        await openAutoReply();
    }catch(error){ showToast(featError(error)); button.disabled = false; }
}

async function onAutoReplyAction(event){
    const button = event.target.closest("[data-ar-action]");
    if(!button) return;
    const action = button.dataset.arAction, id = button.dataset.arId;
    try{
        const result = await requireClient().from("auto_reply_rules").select("*").eq("id",id).maybeSingle();
        if(result.error) throw result.error;
        const rule = result.data;
        if(!rule) throw new Error("ルールが見つかりません。");
        if(action === "edit") openAutoReplyForm(rule);
        else if(action === "toggle"){
            const updated = await requireClient().from("auto_reply_rules").update({enabled:!rule.enabled}).eq("id",id).eq("user_id",state.user.id);
            if(updated.error) throw updated.error;
            await openAutoReply();
        }else if(action === "delete"){
            if(!confirm("この自動応答ルールを削除しますか？")) return;
            const removed = await requireClient().from("auto_reply_rules").delete().eq("id",id).eq("user_id",state.user.id);
            if(removed.error) throw removed.error;
            await openAutoReply();
        }
    }catch(error){ showToast(featError(error)); }
}
