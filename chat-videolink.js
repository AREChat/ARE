"use strict";
// ===== 大きすぎて送れない動画を、リンクにして送る =====
// ・動画が 50MB をこえる／5分をこえる／アップロードが容量でことわられたとき、動画そのものは送らずに、
//   「ほかの場所（YouTube の限定公開・Google ドライブ・OneDrive など）に置いた動画のリンク」を貼って送れる画面を出します。
// ・リンクは https:// だけ受けつけます。メッセージには、動画の名前・大きさ・リンクが文字で入り、リンクは押して開けます（link-copy.js が自動でリンクにします）。
const vl = {name:"", size:0, reason:"", more:0};

function initVideoLink(){
    registerTool("vlink", onVideoLinkAction);
}

/** reason: "size"（50MB超）｜"long"（5分超）｜"upload"（アップロードで容量エラー） */
function openVideoLinkSheet(file, reason, moreCount){
    vl.name = String((file && file.name) || "動画").slice(0, 100);
    vl.size = Number(file && file.size) || 0;
    vl.reason = reason || "size";
    vl.more = Number(moreCount) > 1 ? Number(moreCount) - 1 : 0;
    const why = vl.reason === "long" ? "5分をこえているため"
        : vl.reason === "upload" ? "容量がいっぱいで、アップロードできなかったため"
        : "50MBをこえているため";
    openSheet(toolHead("🎬 動画をリンクで送る", escapeHtml(vl.name) + (vl.size ? "（" + formatAttachmentSize(vl.size) + "）" : "") + " は、" + why + "そのままでは送れません。") +
        '<div class="meta">YouTube（限定公開）・Googleドライブ・OneDrive などに動画を置いて、その <b>https:// のリンク</b> を貼ってください。リンクを知っている人だけ見られる設定にすると安心です。</div>' +
        (vl.more ? '<div class="meta">ほかにも大きい動画が ' + vl.more + ' 本ありました。1本ずつ送ってください。</div>' : "") +
        '<label for="vlUrl">動画のリンク（https://）</label><input id="vlUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://…">' +
        '<label for="vlNote">ひとこと（なくてもOK・100文字まで）</label><input id="vlNote" type="text" maxlength="100" placeholder="例：旅行の動画です">' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">キャンセル</button><button type="button" class="button" data-t="vlink:send">リンクで送る</button></div>');
    setTimeout(() => { const i = document.getElementById("vlUrl"); if(i) i.focus(); }, 50);
}

function videoLinkErrorIsSize(error){
    const msg = String((error && (error.message || error.error || error.statusCode)) || error || "");
    const code = String((error && (error.statusCode || error.status)) || "");
    return code === "413" || /maximum allowed size|payload too large|too large|exceeded|entity too large|quota/i.test(msg);
}

async function onVideoLinkAction(action){
    if(action !== "send") return;
    const raw = String((document.getElementById("vlUrl") || {}).value || "").trim();
    const note = Array.from(String((document.getElementById("vlNote") || {}).value || "").trim()).slice(0, 100).join("");
    const url = safeHttpUrl(raw);
    if(!raw){ showToast("動画のリンクを貼ってください。"); return; }
    if(!url || !/^https:\/\//i.test(raw)){ showToast("https:// で始まるリンクを入れてください。"); return; }
    if(!state.currentRoom){ showToast("先にチャット相手を選択してください。"); return; }
    const lines = ["🎬 動画のリンク", vl.name + (vl.size ? "（" + formatAttachmentSize(vl.size) + "）" : ""), url];
    if(note) lines.push(note);
    const text = lines.join("\n");
    if(Array.from(text).length > MAX_TEXT_LENGTH){ showToast("リンクが長すぎます。"); return; }
    closeSheet();
    await sendMessagePayload(buildTextPayload(text), {keepInput:true});
}
