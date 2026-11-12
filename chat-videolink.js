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
    // Googleドライブへの自動アップロード（GAS）が設定されていれば、まずそれで順番に送る。だめなときだけ、リンクを貼る画面にする。
    if(driveUploadUrl()) runDriveQueue(); else showVideoLinkStep();
}

function showVideoLinkStep(failNote){
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
        (failNote ? '<div class="meta" style="color:#ffb4a8">' + escapeHtml(failNote) + '</div>' : "") +
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
    if(action === "cancel"){ dq.cancel = true; vl.queue = []; vl.index = 0; closeSheet(); return; }
    if(action === "skip"){ vl.index++; continueVideoQueue(); return; }
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
    continueVideoQueue();   // 次の動画があれば、続けて出す
}

function continueVideoQueue(){
    if(vl.index >= vl.queue.length){ vl.queue = []; vl.index = 0; return; }
    if(driveUploadUrl()) runDriveQueue(); else showVideoLinkStep();
}

/** 秒を「約45秒」「約2分10秒」の形にする */
function videoWaitLabel(sec){
    const s = Math.max(1, Math.round(sec));
    if(s < 60) return "約" + s + "秒";
    return "約" + Math.floor(s / 60) + "分" + (s % 60 ? (s % 60) + "秒" : "");
}

/** 動画をアップロードする。進み具合（％）と、のこり時間の目安を onText(文字) で知らせる。
 *  成功は {error:null}、失敗は {error:{message,statusCode}}（supabase-js の upload と同じ形）で返す。 */
function uploadVideoWithProgress(client, path, file, mime, onText, bucket){
    return new Promise((resolve) => {
        (async () => {
            try{
                const sess = await client.auth.getSession();
                const token = sess && sess.data && sess.data.session && sess.data.session.access_token;
                const cfg = window.ARE_CONFIG || {};
                if(!token || !cfg.supabaseUrl) throw new Error("ログインの確認ができませんでした。");
                const url = cfg.supabaseUrl + "/storage/v1/object/" + (bucket || STORAGE_BUCKET) + "/" + path.split("/").map(encodeURIComponent).join("/");
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

// ===================== Googleドライブへ自動で置いて、リンクにして送る（GAS） =====================
// ・window.ARE_CONFIG.videoUploadUrl（GASのウェブアプリのURL）が入っているときだけ使います。
// ・start（ログイン確認＋アップロード口の発行）→ ブラウザからドライブへ直接アップロード（16MBずつ・失敗したらやり直し）→ finish（全員が見られる設定＋リンク）。
// ・進み具合（％）と、のこり時間の目安を出しながら、動画を1本ずつ順番に処理します。うまくいかない動画は、リンクを貼る画面に切りかえます。
const dq = {cancel:false, running:false, again:false};
const DRIVE_CHUNK = 64 * 256 * 1024;   // 16MB（Googleの決まりで 256KB の倍数）

function driveUploadUrl(){
    const u = String((window.ARE_CONFIG || {}).videoUploadUrl || "").trim();
    return /^https:\/\//i.test(u) ? u : "";
}

async function gasCall(body){
    const sess = await requireClient().auth.getSession();
    const token = sess && sess.data && sess.data.session && sess.data.session.access_token;
    if(!token) throw new Error("ログインが確認できませんでした。");
    // text/plain にすると、事前確認（プリフライト）なしで送れる（GASの決まり）
    const res = await fetch(driveUploadUrl(), {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(Object.assign({token}, body)), redirect:"follow"});
    let j = null;
    try{ j = await res.json(); }catch(_e){}
    if(!j || !j.ok) throw new Error((j && j.message) || "動画の置き場所と通信できませんでした。");
    return j;
}

/** ドライブの「アップロード口」へ、16MBずつ送る。onProgress(送った量) を呼ぶ。返り値：できあがった動画の番号（fileId）。 */
function driveUploadChunks(sessionUrl, file, onProgress){
    const total = file.size;
    function putChunk(start, end){
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", sessionUrl);
            xhr.setRequestHeader("Content-Range", "bytes " + start + "-" + (end - 1) + "/" + total);
            xhr.upload.onprogress = (e) => { if(e.lengthComputable) onProgress(start + e.loaded); };
            xhr.onload = () => resolve({status:xhr.status, text:xhr.responseText});
            xhr.onerror = () => reject(new Error("通信が切れました。"));
            xhr.ontimeout = () => reject(new Error("通信に時間がかかりすぎました。"));
            xhr.send(file.slice(start, end));
        });
    }
    return (async () => {
        let start = 0;
        while(start < total){
            if(dq.cancel) throw new Error("やめました。");
            const end = Math.min(total, start + DRIVE_CHUNK);
            let r = null, lastErr = null;
            for(let t = 0; t < 4; t++){   // 切れたら、同じ部分をやり直す（最大4回）
                try{ r = await putChunk(start, end); lastErr = null; if(r.status < 500) break; lastErr = new Error("サーバーが混んでいます（" + r.status + "）。"); }
                catch(e){ lastErr = e; }
                await new Promise((ok) => setTimeout(ok, 1000 * (t + 1)));
            }
            if(lastErr) throw lastErr;
            if(r.status === 200 || r.status === 201){
                let id = ""; try{ id = JSON.parse(r.text).id || ""; }catch(_e){}
                if(!id) throw new Error("ドライブから動画の番号を受け取れませんでした。");
                onProgress(total);
                return id;
            }
            if(r.status !== 308) throw new Error("ドライブがアップロードを受けつけませんでした（" + r.status + "）。");
            start = end;   // 308 ＝「ここまで受け取った。つづきをどうぞ」
        }
        throw new Error("アップロードが最後まで終わりませんでした。");
    })();
}

function driveProgressSheet(nth, total, name, size){
    openSheet(toolHead("🎬 動画をドライブに置いています" + (total > 1 ? "（" + nth + " / " + total + " 本目）" : ""), escapeHtml(name) + "（" + formatAttachmentSize(size) + "）") +
        '<div class="meta" id="dqText">準備しています…</div>' +
        '<progress id="dqBar" max="100" value="0" style="width:100%"></progress>' +
        '<div class="meta">このまま少しお待ちください。やめるときは「やめる」を押してください。' + (total > 1 ? "（残り " + (total - nth) + " 本）" : "") + '</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="vlink:cancel">やめる</button></div>');
}

async function runDriveQueue(){
    // 「やめる」を押した直後は、前の1本がまだ後始末中のことがある。そのとき新しく選んだ動画が消えないよう、終わりしだい続けて始める
    if(dq.running){ dq.again = true; return; }
    dq.running = true; dq.cancel = false; dq.again = false;
    try{
        while(vl.index < vl.queue.length && !dq.cancel){
            const cur = vl.queue[vl.index], file = cur.file, total = vl.queue.length, nth = vl.index + 1;
            driveProgressSheet(nth, total, file.name || "動画", file.size);
            const setText = (t) => { const e = document.getElementById("dqText"); if(e) e.textContent = t; };
            const setBar = (pct) => { const e = document.getElementById("dqBar"); if(e) e.value = pct; };
            let link = null, retention = 14;
            try{
                setText("ドライブに置く準備をしています…");
                const s = await gasCall({action:"start", name:file.name || "video", size:file.size, mime:file.type || "video/mp4"});
                retention = s.retentionDays || retention;
                const t0 = Date.now();
                const id = await driveUploadChunks(s.sessionUrl, file, (sent) => {
                    const pct = Math.min(99, Math.floor(sent / file.size * 100));
                    const secs = (Date.now() - t0) / 1000;
                    const left = secs >= 1 && sent > 0 ? (file.size - sent) / (sent / secs) : 0;
                    setBar(pct);
                    setText("アップロード中 " + pct + "%（" + formatAttachmentSize(sent) + " / " + formatAttachmentSize(file.size) + "）" + (left ? " ・ のこり" + videoWaitLabel(left) + "（目安）" : " ・ 時間を計測中…"));
                });
                if(dq.cancel) throw new Error("やめました。");
                setBar(100); setText("リンクを作っています…");
                const f = await gasCall({action:"finish", fileId:id});
                link = f.link; retention = f.retentionDays || retention;
            }catch(error){
                if(dq.cancel) break;
                console.error("[ARE drive upload]", error);
                // この1本は自動で置けなかった → リンクを貼る画面に切りかえる（送ったら、つづきの動画へ）
                dq.running = false;
                showVideoLinkStep("自動でドライブに置けませんでした：" + (error && error.message ? error.message : "原因不明") + " 　お手数ですが、リンクを貼って送ってください。");
                return;
            }
            const sizeText = "（" + formatAttachmentSize(file.size) + "）";
            const text = ["🎬 動画のリンク", String(file.name || "動画").slice(0, 100) + sizeText, link, "※" + retention + "日たつと自動で消えます。"].join("\n");
            closeSheet();
            await sendMessagePayload(buildTextPayload(text), {keepInput:true});
            vl.index++;
        }
    }finally{
        dq.running = false;
    }
    if(dq.again){ dq.again = false; if(vl.queue.length && vl.index < vl.queue.length){ runDriveQueue(); return; } }
    if(vl.index >= vl.queue.length){ vl.queue = []; vl.index = 0; }
}
