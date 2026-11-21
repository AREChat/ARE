"use strict";
// ===== 大きすぎて送れない動画を、リンクにして送る =====
// ・動画が 50MB をこえる／5分をこえる／アップロードが容量でことわられたとき、動画そのものは送らずに、
//   「ほかの場所（YouTube の限定公開・Google ドライブ・OneDrive など）に置いた動画のリンク」を貼って送れる画面を出します。
// ・リンクは https:// だけ受けつけます。メッセージには、動画の名前・大きさ・リンクが文字で入り、リンクは押して開けます（link-copy.js が自動でリンクにします）。
const vl = {name:"", size:0, reason:"", kind:"video", queue:[], index:0};   // queue: まだリンクにしていない大きい動画（順番に1本ずつ出す）

// 大きいファイル（動画いがい）も、動画と同じように ドライブに置いて リンクで送る。言葉と絵文字だけ入れかえる
const vlWord = (cur) => cur && cur.kind === "file" ? "ファイル" : "動画";
const vlIcon = (cur) => cur && cur.kind === "file" ? "📎" : "🎬";

function initVideoLink(){
    registerTool("vlink", onVideoLinkAction);
}

/** reason: "size"（50MB超）｜"long"（5分超）｜"upload"（アップロードで容量エラー）。
 *  items を渡すと、複数本を順番に出す（[{file, reason}, …]）。1本だけのときは (file, reason) でも呼べる。 */
function openVideoLinkSheet(file, reason, items){
    const add = (Array.isArray(items) && items.length) ? items.slice() : (file ? [{file, reason}] : null);
    if(add){
        // いま ドライブに1本ずつ置いている最中に、次の大きい動画が来たとき（📎でまぜて選んだとき）は、あとにつけたす。
        // （入れかえると、2本目以降が消えてしまうため。1本ずつ順番に、それぞれリンクにする）
        if(dq.running && !dq.cancel && vl.index < vl.queue.length){ vl.queue = vl.queue.concat(add); return; }
        vl.queue = add; vl.index = 0;
    }
    // Googleドライブへの自動アップロード（GAS）が設定されていれば、まずそれで順番に送る。だめなときだけ、リンクを貼る画面にする。
    if(driveUploadUrl()) runDriveQueue(); else showVideoLinkStep();
}

function showVideoLinkStep(failNote){
    const cur = vl.queue[vl.index];
    if(!cur){ vl.queue = []; vl.index = 0; return; }
    const file = cur.file, total = vl.queue.length, nth = vl.index + 1;
    const W = vlWord(cur);
    vl.name = String((file && file.name) || W).slice(0, 100);
    vl.kind = cur.kind === "file" ? "file" : "video";
    vl.size = Number(file && file.size) || 0;
    vl.reason = cur.reason || "size";
    const why = vl.reason === "long" ? "5分をこえているため"
        : vl.reason === "upload" ? "容量がいっぱいで、アップロードできなかったため"
        : "50MBをこえているため";
    openSheet(toolHead(vlIcon(cur) + " " + W + "をリンクで送る" + (total > 1 ? "（" + nth + " / " + total + " 本目）" : ""), escapeHtml(vl.name) + (vl.size ? "（" + formatAttachmentSize(vl.size) + "）" : "") + " は、" + why + "そのままでは送れません。") +
        (failNote ? '<div class="meta" style="color:#ffb4a8">' + escapeHtml(failNote) + '</div>' : "") +
        '<div class="meta">YouTube（限定公開）・Googleドライブ・OneDrive などに' + W + 'を置いて、その <b>https:// のリンク</b> を貼ってください。リンクを知っている人だけ見られる設定にすると安心です。</div>' +
        (total > 1 ? '<div class="meta">大きい' + W + 'が全部で ' + total + ' 本あります。1本ずつ順番にリンクを入れてください（残り ' + (total - nth) + ' 本）。</div>' : "") +
        '<label for="vlUrl">' + W + 'のリンク（https://）</label><input id="vlUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://…">' +
        '<label for="vlNote">ひとこと（なくてもOK・100文字まで）</label><input id="vlNote" type="text" maxlength="100" placeholder="' + (cur.kind === "file" ? "例：資料です" : "例：旅行の動画です") + '">' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">やめる</button>' + (total > 1 && nth < total ? '<button type="button" class="button-secondary" data-t="vlink:skip">この' + W + 'はとばす</button>' : "") + '<button type="button" class="button" data-t="vlink:send">' + (total > 1 && nth < total ? "送って次へ" : "リンクで送る") + '</button></div>');
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
    if(!raw){ showToast((vl.kind === "file" ? "ファイル" : "動画") + "のリンクを貼ってください。"); return; }
    if(!url || !/^https:\/\//i.test(raw)){ showToast("https:// で始まるリンクを入れてください。"); return; }
    if(!state.currentRoom){ showToast("先にチャット相手を選択してください。"); return; }
    const lines = [(vl.kind === "file" ? "📎 ファイルのリンク" : "🎬 動画のリンク"), vl.name + (vl.size ? "（" + formatAttachmentSize(vl.size) + "）" : ""), url];
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
                const token = await freshAccessToken(client);
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

// ===== 中断しても最初からやり直さない（再開できるアップロード） =====
// ・ブラウザを閉じた／PCの電源を落とした／通信が切れた、などでアップロードが途中で止まっても、
//   もう一度「同じファイル」を選べば、途中から続きを送れるようにする（ゼロからやり直さない）。
// ・Googleドライブの「アップロード口（セッションURL）」は、作ってから何日か使えるので、
//   そのURLと「どこまで送ったか」をこの端末に覚えておき、続きから PUT するだけでよい。
// ・「同じファイル」かどうかは、名前・大きさ・最終更新日時で見分ける（ブラウザは、閉じたあとの
//   ファイルそのものを覚えていられないため、もう一度同じファイルを選び直してもらう必要がある）。
const RESUME_PREFIX = "are_resume_";
const RESUME_MAX_AGE = 6 * 24 * 3600 * 1000;   // 6日（ドライブのアップロード口は だいたい1週間もつので、それより少し短く）

function resumeKey(file, kind){
    return RESUME_PREFIX + [file.name || "", file.size || 0, file.lastModified || 0, kind].join("|");
}
function loadResume(file, kind){
    try{
        const raw = localStorage.getItem(resumeKey(file, kind));
        if(!raw) return null;
        const s = JSON.parse(raw);
        if(!s || !s.sessionUrl || !s.total || s.total !== file.size) return null;
        if(Date.now() - (s.createdAt || 0) > RESUME_MAX_AGE) return null;
        return s;
    }catch(_e){ return null; }
}
function saveResume(file, kind, sessionUrl){
    try{ localStorage.setItem(resumeKey(file, kind), JSON.stringify({sessionUrl, total:file.size, createdAt:Date.now()})); }catch(_e){ /* 保存できなくても、最初から送るだけなので続行 */ }
}
function clearResume(file, kind){
    try{ localStorage.removeItem(resumeKey(file, kind)); }catch(_e){}
}

/** ドライブの「アップロード口」に、いま どこまで届いているかを聞く（本体は送らない）。
 *  すでに完成していたら {done:true, id}、続きがあれば {offset}、口が無効・期限切れなら null。 */
function driveQueryOffset(sessionUrl, total){
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sessionUrl);
        xhr.setRequestHeader("Content-Range", "bytes */" + total);
        xhr.onload = () => {
            if(xhr.status === 308){
                const range = xhr.getResponseHeader("Range") || "";
                const m = /bytes=0-(\d+)/.exec(range);
                resolve({offset: m ? Number(m[1]) + 1 : 0});
            }else if(xhr.status === 200 || xhr.status === 201){
                let id = ""; try{ id = JSON.parse(xhr.responseText).id || ""; }catch(_e){}
                resolve(id ? {done:true, id} : null);
            }else{
                resolve(null);   // 404・410 など → 期限切れ・無効。最初からやり直す
            }
        };
        xhr.onerror = () => resolve(null);
        xhr.ontimeout = () => resolve(null);
        xhr.send();
    });
}

/** ログインの「合いかぎ（トークン）」を返す。期限（1時間）が5分以内に近いとき、または force のときは、先に更新する。
 *  大きい動画は、アップロード中に期限が切れて、最後の「リンクを作る」が「ログインが確認できません」と断られることがあったため。 */
async function freshAccessToken(client, force){
    let s = null;
    try{ const r = await client.auth.getSession(); s = r && r.data && r.data.session; }catch(_e){}
    const left = s && s.expires_at ? s.expires_at * 1000 - Date.now() : Infinity;
    if(force || !s || left < 5 * 60 * 1000){
        try{ const r = await client.auth.refreshSession(); if(r && r.data && r.data.session) s = r.data.session; }catch(_e){ /* 更新できなくても、いまのものを使ってみる */ }
    }
    return (s && s.access_token) || "";
}

async function gasCall(body, retried){
    const token = await freshAccessToken(requireClient(), !!retried);
    if(!token) throw new Error("ログインが確認できませんでした。いちどログアウトして、ログインし直してください。");
    // text/plain にすると、事前確認（プリフライト）なしで送れる（GASの決まり）
    const res = await fetch(driveUploadUrl(), {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(Object.assign({token}, body)), redirect:"follow"});
    let j = null;
    try{ j = await res.json(); }catch(_e){}
    if(!j || !j.ok){
        // 「ログインが確認できません」と返ってきたときは、ログインを更新して、1回だけやり直す（端末の時計がずれていても、これで直る）
        if(!retried && j && /ログイン/.test(String(j.message || ""))) return gasCall(body, true);
        throw new Error((j && j.message) || "動画の置き場所と通信できませんでした。");
    }
    return j;
}

/** ドライブの「アップロード口」へ、16MBずつ送る。onProgress(送った量) を呼ぶ。返り値：できあがった動画の番号（fileId）。
 *  startAt を渡すと、そこから続きを送る（再開）。 */
function driveUploadChunks(sessionUrl, file, onProgress, startAt){
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
        let start = Number(startAt) > 0 ? Number(startAt) : 0;
        if(start > 0) onProgress(start);
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

function driveProgressSheet(nth, total, name, size, cur){
    openSheet(toolHead(vlIcon(cur) + " " + vlWord(cur) + "をドライブに置いています" + (total > 1 ? "（" + nth + " / " + total + " 本目）" : ""), escapeHtml(name) + "（" + formatAttachmentSize(size) + "）") +
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
            driveProgressSheet(nth, total, file.name || vlWord(cur), file.size, cur);
            const setText = (t) => { const e = document.getElementById("dqText"); if(e) e.textContent = t; };
            const setBar = (pct) => { const e = document.getElementById("dqBar"); if(e) e.value = pct; };
            let link = null, retention = 14;
            const kind = cur.kind === "file" ? "file" : "video";
            try{
                let sessionUrl = null, id = null, resumedFrom = 0;
                const saved = loadResume(file, kind);
                if(saved){
                    setText("前回の続きから再開できるか確認しています…");
                    const q = await driveQueryOffset(saved.sessionUrl, file.size);
                    if(q && q.done){ id = q.id; }
                    else if(q){ sessionUrl = saved.sessionUrl; resumedFrom = q.offset || 0; }
                    else { clearResume(file, kind); }   // 期限切れ・無効 → 最初からやり直す
                }
                if(!id && !sessionUrl){
                    setText("ドライブに置く準備をしています…");
                    const s = await gasCall({action:"start", name:file.name || (kind === "file" ? "file" : "video"), size:file.size, mime:file.type || (kind === "file" ? "application/octet-stream" : "video/mp4"), kind});
                    retention = s.retentionDays || retention;
                    sessionUrl = s.sessionUrl;
                    saveResume(file, kind, sessionUrl);   // ここで覚えておけば、この先 途中で止まっても再開できる
                }
                if(!id){
                    if(resumedFrom > 0) setText("前回の続き（" + formatAttachmentSize(resumedFrom) + " 分）から再開します…");
                    const t0 = Date.now();
                    const sentBase = resumedFrom;
                    id = await driveUploadChunks(sessionUrl, file, (sent) => {
                        const pct = Math.min(99, Math.floor(sent / file.size * 100));
                        const secs = (Date.now() - t0) / 1000;
                        const newlySent = Math.max(0, sent - sentBase);
                        const left = secs >= 1 && newlySent > 0 ? (file.size - sent) / (newlySent / secs) : 0;
                        setBar(pct);
                        setText("アップロード中 " + pct + "%（" + formatAttachmentSize(sent) + " / " + formatAttachmentSize(file.size) + "）" + (left ? " ・ のこり" + videoWaitLabel(left) + "（目安）" : " ・ 時間を計測中…"));
                    }, resumedFrom);
                }
                if(dq.cancel) throw new Error("やめました。");
                setBar(100); setText("リンクを作っています…");
                const f = await gasCall({action:"finish", fileId:id});
                link = f.link; retention = f.retentionDays || retention;
                clearResume(file, kind);   // 最後までできたので、再開用の記録は消す
            }catch(error){
                if(dq.cancel) break;
                console.error("[ARE drive upload]", error);
                // この1本は自動で置けなかった → リンクを貼る画面に切りかえる（送ったら、つづきの動画へ）
                // ※再開用の記録は消さない。もう一度同じファイルを選べば、途中から続きを送れる。
                dq.running = false;
                showVideoLinkStep("自動でドライブに置けませんでした：" + (error && error.message ? error.message : "原因不明") + " 　お手数ですが、リンクを貼って送ってください（もう一度同じファイルを選べば、途中からの続きになります）。");
                return;
            }
            const sizeText = "（" + formatAttachmentSize(file.size) + "）";
            const text = [vlIcon(cur) + " " + vlWord(cur) + "のリンク", String(file.name || vlWord(cur)).slice(0, 100) + sizeText, link, "※" + retention + "日たつと自動で消えます。"].join("\n");
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
