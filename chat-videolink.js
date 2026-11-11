"use strict";
// ===== 大きすぎて送れない動画を、リンクにして送る =====
// ・動画が 50MB をこえる／5分をこえる／アップロードが容量でことわられたとき、動画そのものは送らずに、
//   「ほかの場所（YouTube の限定公開・Google ドライブ・OneDrive など）に置いた動画のリンク」を貼って送れる画面を出します。
// ・リンクは https:// だけ受けつけます。メッセージには、動画の名前・大きさ・リンクが文字で入り、リンクは押して開けます（link-copy.js が自動でリンクにします）。
const vl = {name:"", size:0, reason:"", queue:[], index:0};   // queue: まだリンクにしていない大きい動画（順番に1本ずつ出す）

function initVideoLink(){
    registerTool("vlink", onVideoLinkAction);
}

/** reason: "size"（50MB超）｜"long"（5分超）｜"upload"（アップロードで容量エラー）。
 *  items を渡すと、複数本を順番に出す（[{file, reason}, …]）。1本だけのときは (file, reason) でも呼べる。 */
function openVideoLinkSheet(file, reason, items){
    if(Array.isArray(items) && items.length){ vl.queue = items.slice(); vl.index = 0; }
    else if(file){ vl.queue = [{file, reason}]; vl.index = 0; }
    showVideoLinkStep();
}

function showVideoLinkStep(){
    const cur = vl.queue[vl.index];
    if(!cur){ vl.queue = []; vl.index = 0; return; }
    const file = cur.file, total = vl.queue.length, nth = vl.index + 1;
    vl.name = String((file && file.name) || "動画").slice(0, 100);
    vl.size = Number(file && file.size) || 0;
    vl.reason = cur.reason || "size";
    const why = vl.reason === "long" ? "5分をこえているため"
        : vl.reason === "upload" ? "容量がいっぱいで、アップロードできなかったため"
        : "50MBをこえているため";
    openSheet(toolHead("🎬 動画をリンクで送る" + (total > 1 ? "（" + nth + " / " + total + " 本目）" : ""), escapeHtml(vl.name) + (vl.size ? "（" + formatAttachmentSize(vl.size) + "）" : "") + " は、" + why + "そのままでは送れません。") +
        '<div class="meta">YouTube（限定公開）・Googleドライブ・OneDrive などに動画を置いて、その <b>https:// のリンク</b> を貼ってください。リンクを知っている人だけ見られる設定にすると安心です。</div>' +
        (total > 1 ? '<div class="meta">大きい動画が全部で ' + total + ' 本あります。1本ずつ順番にリンクを入れてください（残り ' + (total - nth) + ' 本）。</div>' : "") +
        '<label for="vlUrl">動画のリンク（https://）</label><input id="vlUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://…">' +
        '<label for="vlNote">ひとこと（なくてもOK・100文字まで）</label><input id="vlNote" type="text" maxlength="100" placeholder="例：旅行の動画です">' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">やめる</button>' + (total > 1 && nth < total ? '<button type="button" class="button-secondary" data-t="vlink:skip">この動画はとばす</button>' : "") + '<button type="button" class="button" data-t="vlink:send">' + (total > 1 && nth < total ? "送って次へ" : "リンクで送る") + '</button></div>');
    setTimeout(() => { const i = document.getElementById("vlUrl"); if(i) i.focus(); }, 50);
}

function videoLinkErrorIsSize(error){
    const msg = String((error && (error.message || error.error || error.statusCode)) || error || "");
    const code = String((error && (error.statusCode || error.status)) || "");
    return code === "413" || /maximum allowed size|payload too large|too large|exceeded|entity too large|quota/i.test(msg);
}

async function onVideoLinkAction(action){
    if(action === "skip"){ vl.index++; showVideoLinkStep(); return; }
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
    vl.index++;
    if(vl.index < vl.queue.length) showVideoLinkStep(); else { vl.queue = []; vl.index = 0; }   // 次の動画があれば、続けて出す
}

/** 秒を「約45秒」「約2分10秒」の形にする */
function videoWaitLabel(sec){
    const s = Math.max(1, Math.round(sec));
    if(s < 60) return "約" + s + "秒";
    return "約" + Math.floor(s / 60) + "分" + (s % 60 ? (s % 60) + "秒" : "");
}

/** 動画をアップロードする。進み具合（％）と、のこり時間の目安を onText(文字) で知らせる。
 *  成功は {error:null}、失敗は {error:{message,statusCode}}（supabase-js の upload と同じ形）で返す。 */
function uploadVideoWithProgress(client, path, file, mime, onText){
    return new Promise((resolve) => {
        (async () => {
            try{
                const sess = await client.auth.getSession();
                const token = sess && sess.data && sess.data.session && sess.data.session.access_token;
                const cfg = window.ARE_CONFIG || {};
                if(!token || !cfg.supabaseUrl) throw new Error("ログインの確認ができませんでした。");
                const url = cfg.supabaseUrl + "/storage/v1/object/" + STORAGE_BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/");
                const xhr = new XMLHttpRequest();
                const t0 = Date.now();
                xhr.open("POST", url);
                xhr.setRequestHeader("Authorization", "Bearer " + token);
                xhr.setRequestHeader("apikey", cfg.supabasePublishableKey || "");
                xhr.setRequestHeader("x-upsert", "false");
                xhr.setRequestHeader("cache-control", "max-age=3600");
                xhr.setRequestHeader("Content-Type", mime);
                xhr.upload.onprogress = (e) => {
                    if(!e.lengthComputable || !onText) return;
                    const pct = Math.min(99, Math.floor(e.loaded / e.total * 100));
                    const secs = (Date.now() - t0) / 1000;
                    // 1秒以上たち、1%以上進んだら、いまの速さからのこり時間を出す（目安）
                    const left = secs >= 1 && e.loaded > 0 ? (e.total - e.loaded) / (e.loaded / secs) : 0;
                    onText("アップロード中 " + pct + "%" + (left ? " ・ のこり" + videoWaitLabel(left) + "（目安）" : " ・ 時間を計測中…"));
                };
                xhr.onload = () => {
                    if(xhr.status >= 200 && xhr.status < 300){ resolve({data:{path}, error:null}); return; }
                    let msg = "アップロードに失敗しました（" + xhr.status + "）";
                    try{ const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; }catch(_e){}
                    resolve({data:null, error:{message:String(msg), statusCode:String(xhr.status)}});
                };
                xhr.onerror = () => resolve({data:null, error:{message:"通信が切れたため、アップロードできませんでした。"}});
                xhr.ontimeout = () => resolve({data:null, error:{message:"時間がかかりすぎたため、アップロードできませんでした。"}});
                xhr.send(file);
            }catch(error){
                resolve({data:null, error});
            }
        })();
    });
}
