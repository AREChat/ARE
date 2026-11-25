"use strict";
// ===== 通話の録音・録画（自動・止められない／止められるのは管理者だけ）と、ドライブへの自動保存 =====
// ・通話がつながった時点で、自動で録音・録画をはじめる（既定オン）。相手にも「録音・録画中」と見える（着信の画面・通話中の表示）。
// ・自分では止められない。管理者だけが「止める／再開する」ができる（管理者が止めると、相手の端末も止まる）。
// ・声（自分＋相手）と映像（相手・自分・画面共有）を1本の動画にして、この端末に少しずつ保存する（IndexedDB。途中でとじても、そこまでは残る）。
// ・保存先：「ファイル保存」と同じ GAS・同じフォルダ（月ごとのフォルダ 2026-11 など）へ、通話が終わったら自動で送る。
//     ※「リンクを知っている全員が見られる」にはしません（GAS の finish は呼びません）。フォルダの持ち主だけが見られます。
//     ※送れなかったとき（オフラインなど）は、この端末に残して、あとで自動で送りなおします。
// ・両方の端末が、それぞれ自分の分を送ります（片方が失敗しても、もう片方に残るように）。
// ・この端末の「通話の記録」画面で、見る・保存・（この端末の分の）削除ができます。ドライブに送ったものは、削除しても消えません。

const TELX_DB = "are_call_rec";
const telxRecs = {db:null, q:Promise.resolve(), up:{running:false, timer:null, fails:0}, viewer:null};

function telxH(tag, props){
    const e = document.createElement(tag);
    if(props) Object.keys(props).forEach((k) => {
        const v = props[k];
        if(k === "class") e.className = v;
        else if(k === "text") e.textContent = v;
        else if(k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
        else if(v === true) e.setAttribute(k, "");
        else if(v !== false && v != null) e.setAttribute(k, v);
    });
    for(let i = 2; i < arguments.length; i++){
        const c = arguments[i];
        if(c == null || c === false) continue;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
}
function telxPad(n){ return String(n).padStart(2, "0"); }
function telxDur(sec){ sec = Math.max(0, Math.round(Number(sec) || 0)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + ":" + telxPad(m) + ":" + telxPad(s) : m + ":" + telxPad(s); }
function telxSize(b){ b = Number(b) || 0; return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
/** 日本時間の日時（parts は 年月日時分秒の文字） */
function telxJst(ms){
    const q = {};
    new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false}).formatToParts(new Date(ms)).forEach((x) => { q[x.type] = x.value; });
    q.hour = telxPad(parseInt(q.hour, 10) % 24);
    return q;
}
function telxStamp(ms){ const q = telxJst(ms); return q.year + q.month + q.day + "-" + q.hour + q.minute + q.second; }
function telxDateText(ms){ const q = telxJst(ms); return q.year + "-" + q.month + "-" + q.day + " " + q.hour + ":" + q.minute + ":" + q.second; }

// ===== 端末の中の保存場所（IndexedDB）=====
function telxSupported(){
    try{ return !!(window.MediaRecorder && window.HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream && (window.AudioContext || window.webkitAudioContext) && window.indexedDB); }catch(_e){ return false; }
}
function telxDb(){
    if(telxRecs.db) return telxRecs.db;
    telxRecs.db = new Promise((resolve, reject) => {
        let r; try{ r = indexedDB.open(TELX_DB, 1); }catch(e){ telxRecs.db = null; reject(e); return; }
        r.onupgradeneeded = () => {
            const d = r.result;
            if(!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", {keyPath:"id"});
            if(!d.objectStoreNames.contains("chunk")) d.createObjectStore("chunk", {keyPath:["id", "seq"]});
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => { telxRecs.db = null; reject(r.error); };
    });
    return telxRecs.db;
}
function telxReq(stores, mode, fn){
    return telxDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode); const r = fn(tx);
        tx.oncomplete = () => resolve(r && r.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
    }));
}
function telxPutMeta(m){ return telxReq("meta", "readwrite", (tx) => tx.objectStore("meta").put(m)); }
function telxAllMeta(){ return telxReq("meta", "readonly", (tx) => tx.objectStore("meta").getAll()); }
function telxGetMeta(id){ return telxReq("meta", "readonly", (tx) => tx.objectStore("meta").get(id)); }
function telxPutChunk(id, seq, blob){ return telxReq("chunk", "readwrite", (tx) => tx.objectStore("chunk").put({id, seq, blob})); }
function telxChunks(id){ return telxReq("chunk", "readonly", (tx) => tx.objectStore("chunk").getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]))); }
function telxDelete(id){
    return telxReq(["meta", "chunk"], "readwrite", (tx) => { tx.objectStore("chunk").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])); return tx.objectStore("meta").delete(id); });
}
async function telxBlobOf(m){
    if(m.type === "minutes") return new Blob([m.text || ""], {type:"text/markdown"});
    const cs = await telxChunks(m.id);
    return new Blob(cs.map((c) => c.blob), {type:String(m.mime || "video/webm").split(";")[0]});
}

// ===== 録画の中身（画面を1枚にまとめて描く）=====
function telxMime(){
    const list = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"];
    try{ for(const t of list) if(MediaRecorder.isTypeSupported(t)) return t; }catch(_e){}
    return "";
}
function telxFit(g, v, x, y, w, h, cover){
    const vw = v.videoWidth, vh = v.videoHeight; if(!vw || !vh) return;
    const s = cover ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh), dw = vw * s, dh = vh * s;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
}
function telxDraw(call, r){
    const g = r.g, cv = r.cv, W = cv.width, H = cv.height, u = tel.ui;
    g.fillStyle = "#05070d"; g.fillRect(0, 0, W, H);
    const rv = u && u.remote, lv = u && u.local;
    const hasRemote = !!(call.peerCam || call.peerScr) && rv && rv.readyState >= 2 && rv.videoWidth > 0;
    if(hasRemote) telxFit(g, rv, 0, 0, W, H, !call.peerScr);
    else{
        const nm = telNameOf(call.room) || "?";
        g.fillStyle = "#1b253a"; g.beginPath(); g.arc(W / 2, H / 2 - 20, 70, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#fff"; g.font = "bold 64px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(Array.from(nm)[0] || "?", W / 2, H / 2 - 18);
        g.font = "bold 26px sans-serif"; g.fillText(nm.slice(0, 24), W / 2, H / 2 + 90);
    }
    if((call.camOn || call.scrOn) && lv && lv.readyState >= 2 && lv.videoWidth > 0){
        g.save(); g.strokeStyle = "#2b3851"; g.lineWidth = 2; telxFit(g, lv, W - 262, H - 202, 250, 190, !call.scrOn); g.strokeRect(W - 262, H - 202, 250, 190); g.restore();
    }
    const el = Math.max(0, Math.floor((Date.now() - r.meta.startedAt) / 1000));
    g.textBaseline = "top"; g.textAlign = "right"; g.font = "bold 24px sans-serif";
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(W - 210, 8, 202, 36);
    g.fillStyle = "#ff4d4d"; g.beginPath(); g.arc(W - 192, 26, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.fillText("REC " + telxDur(el), W - 18, 13);
    g.textAlign = "left"; g.font = "20px sans-serif"; g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(8, H - 40, 250, 32);
    g.fillStyle = "#fff"; g.fillText(telxDateText(Date.now()), 16, H - 34);
}

// ===== はじめる・止める =====
function telxRecOn(call){ return !!(call && call.x && call.x.recOn); }
/** 止められるのは管理者だけ */
function telxCanStopRec(){ return typeof feat !== "undefined" && feat.isAdmin === true; }
function telxLog(call, k, extra){ if(call && call.x) call.x.log.push(Object.assign({at:call.startAt ? Math.max(0, Math.round((Date.now() - call.startAt) / 1000)) : 0, k}, extra || {})); }

function telxRecStart(call, why){
    const x = call && call.x;
    if(!x || x.rec || x.recBusy || call.ended) return false;
    if(!telxSupported()){ x.recErr = "unsupported"; telxLog(call, "rec_unsupported"); telxPaintRec(call); telSendState(call); return false; }
    try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!tel.ac) tel.ac = new AC();
        const ac = tel.ac; if(ac.state === "suspended") ac.resume().catch(() => {});
        const dest = ac.createMediaStreamDestination(), nodes = [dest];
        const addTrack = (t) => { try{ if(!t || t.kind !== "audio") return; const s = ac.createMediaStreamSource(new MediaStream([t])); s.connect(dest); nodes.push(s); }catch(_e){} };
        (call.stream ? call.stream.getAudioTracks() : []).forEach(addTrack);
        (call.remote ? call.remote.getAudioTracks() : []).forEach(addTrack);
        const onAdd = (ev) => addTrack(ev.track);
        try{ call.remote && call.remote.addEventListener("addtrack", onAdd); }catch(_e){}
        const cv = document.createElement("canvas"); cv.width = 960; cv.height = 540;
        const g = cv.getContext("2d");
        const part = ++x.parts;
        const meta = {id:call.id + "-" + part, type:"rec", callId:call.id, part, roomId:call.room ? call.room.id : "", partnerName:telNameOf(call.room), partnerId:(telPartnerOf(call.room) || {}).id || "",
            uid:(state.user && state.user.id) || "", role:call.role, kind:call.kind, startedAt:Date.now(), mime:"", bytes:0, sec:0, done:false, uploaded:false, tries:0, why:why || ""};
        const vs = cv.captureStream(10);
        const ms = new MediaStream(vs.getVideoTracks().concat(dest.stream.getAudioTracks()));
        const mime = telxMime(); meta.mime = mime;
        const mr = new MediaRecorder(ms, mime ? {mimeType:mime, videoBitsPerSecond:700000, audioBitsPerSecond:64000} : undefined);
        if(!meta.mime) meta.mime = mr.mimeType || "video/webm";
        const r = {mr, meta, cv, g, vs, nodes, onAdd, seq:0, bytes:0, iv:0, lost:false};
        r.iv = setInterval(() => { try{ telxDraw(call, r); }catch(_e){} }, 100);
        telxDraw(call, r);
        mr.ondataavailable = (ev) => {
            if(!ev.data || !ev.data.size) return;
            r.bytes += ev.data.size; meta.bytes = r.bytes; meta.sec = Math.round((Date.now() - meta.startedAt) / 1000);
            const seq = r.seq++;
            telxRecs.q = telxRecs.q.then(() => telxPutChunk(meta.id, seq, ev.data).then(() => telxPutMeta(meta))).catch(() => { r.lost = true; meta.lost = true; x.saveErr = true; telxPaintRec(call); });
        };
        mr.onstop = () => { telxFinalize(call, r); };
        mr.onerror = () => { try{ if(mr.state !== "inactive") mr.stop(); }catch(_e){} };
        x.rec = r; x.recOn = true; x.recStopped = ""; x.recErr = "";
        telxRecs.q = telxRecs.q.then(() => telxPutMeta(meta)).catch(() => { r.lost = true; });
        mr.start(4000);
        telxLog(call, why === "resume" || why === "admin-remote" ? "rec_resume" : "rec_start");
        telxPaintRec(call); telSendState(call);
        try{ navigator.storage && navigator.storage.estimate && navigator.storage.estimate().then((e) => { if(e && e.quota && e.quota - e.usage < 150 * 1048576) showToast("この端末の空き容量が少ないため、録画が途中までになるかもしれません。"); }); }catch(_e){}
        return true;
    }catch(e){
        x.recErr = "failed"; x.recOn = false; telxLog(call, "rec_failed"); telxPaintRec(call); telSendState(call);
        return false;
    }
}
function telxRecStop(call, why){
    const x = call && call.x; if(!x || !x.rec) return false;
    x.recOn = false; x.recStopped = why || "stop"; x.recBusy = true;
    const r = x.rec;
    try{ if(r.mr.state !== "inactive") r.mr.stop(); else telxFinalize(call, r); }catch(_e){ telxFinalize(call, r); }
    telxPaintRec(call); telSendState(call);
    return true;
}
async function telxFinalize(call, r){
    if(r.finalized) return; r.finalized = true;
    clearInterval(r.iv);
    try{ call.remote && call.remote.removeEventListener("addtrack", r.onAdd); }catch(_e){}
    try{ r.nodes.forEach((n) => { try{ n.disconnect(); }catch(_e){} }); }catch(_e){}
    try{ r.vs.getTracks().forEach((t) => t.stop()); }catch(_e){}
    try{ await telxRecs.q; }catch(_e){}
    const m = r.meta;
    m.done = true; m.bytes = r.bytes; m.endedAt = Date.now(); m.sec = Math.round((m.endedAt - m.startedAt) / 1000);
    if(r.bytes <= 0 || r.lost && r.seq === 0){ try{ await telxDelete(m.id); }catch(_e){} }
    else{ try{ await telxPutMeta(m); }catch(_e){} }
    if(call.x){ if(call.x.rec === r) call.x.rec = null; call.x.recBusy = false; call.x.done.push(m.id); }
    try{ telxPaintRec(call); }catch(_e){}
    if(call.ended && typeof telxMinutesSave === "function"){ try{ await telxMinutesSave(call); }catch(_e){} }
    telxQueueUpload(2500);
    if(call.x && call.x.onFinal){ try{ call.x.onFinal(); }catch(_e){} }
}
/** 管理者だけ：止める */
function telxAdminStop(call){
    if(!telxCanStopRec()){ showToast("録音・録画を止められるのは、管理者だけです。"); return false; }
    if(!telxRecStop(call, "admin")) return false;
    telxSendRec(call, false); telxLog(call, "rec_stop_admin"); showToast("録音・録画を止めました。");
    return true;
}
/** 管理者だけ：もう一度はじめる */
function telxAdminResume(call){
    if(!telxCanStopRec()){ showToast("録音・録画を再開できるのは、管理者だけです。"); return false; }
    const ok = telxRecStart(call, "resume");
    if(ok){ telxSendRec(call, true); showToast("録音・録画を再開しました。"); }
    return ok;
}
function telxSendRec(call, on){ try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"rec", on:!!on})); }catch(_e){} }
/** 相手が管理者か（管理者の ID は、この端末にも書いてあります＝chat-presence.js） */
function telxPartnerIsAdmin(call){
    try{ const p = telPartnerOf(call.room); return !!(p && typeof ADMIN_PRES_ID !== "undefined" && p.id === ADMIN_PRES_ID); }catch(_e){ return false; }
}
/** 相手（管理者）が止めた・再開したとき：こちらも同じにする。管理者でない相手からの「止めて」は聞かない */
function telxRecMsg(call, m){
    if(!telxPartnerIsAdmin(call)) return;
    if(m.on === false){ if(telxRecStop(call, "admin-remote")){ telxLog(call, "rec_stop_admin"); showToast("管理者が、録音・録画を止めました。"); } }
    else if(m.on === true){ if(telxRecStart(call, "admin-remote")){ showToast("管理者が、録音・録画を再開しました。"); } }
}

// ===== 記録の「表示」（通話画面の上のバッジ）=====
function telxPaintRec(call){
    try{
        const b = document.getElementById("telxRec"); if(!b) return;
        const x = call && call.x; if(!x || call.ended){ b.hidden = true; return; }   // 通話が終わったあとは 出さない
        const on = !!x.recOn;
        b.hidden = !(on || x.recStopped || x.recErr);
        b.classList.toggle("off", !on);
        const tx = document.getElementById("telxRecTx");
        if(tx) tx.textContent = on ? "録音・録画中" : x.recErr ? "この端末では録音・録画できません" : "録音・録画は止まっています";
        const t = document.getElementById("telxRecT"); if(t) t.hidden = !on;
        const w = document.getElementById("telxRecW"); if(w){ w.hidden = !x.saveErr; }
        const pr = document.getElementById("telxRecPeer"); if(pr){ pr.hidden = !(call.startAt && on && call.peerRec === false); }
    }catch(_e){}
}

// ===== ドライブへ自動で送る =====
function telxFileName(m){
    const ext = m.type === "minutes" ? "md" : (/mp4/.test(m.mime || "") ? "mp4" : "webm");
    const who = String(m.partnerName || "").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 16);
    return "call_" + telxStamp(m.startedAt) + "_" + String(m.callId || "").slice(0, 8) + "_" + (m.role || "x") + "_" + String(m.uid || "").slice(0, 6) + (who ? "_with-" + who : "") + (m.type === "minutes" ? "_minutes" : "_p" + m.part) + "." + ext;
}
function telxQueueUpload(ms){
    clearTimeout(telxRecs.up.timer);
    telxRecs.up.timer = setTimeout(telxUploadLoop, ms == null ? 3000 : ms);
}
function telxUpUrl(){ try{ return typeof driveUploadUrl === "function" ? driveUploadUrl() : ""; }catch(_e){ return ""; } }
async function telxUploadLoop(){
    const up = telxRecs.up; if(up.running) return;
    if(tel.call || tel.incoming){ telxQueueUpload(15000); return; }
    if(!state.user || !telxUpUrl() || typeof gasCall !== "function") return;
    if(navigator.onLine === false) return;
    up.running = true;
    try{
        const metas = (await telxAllMeta()).filter((m) => m.done && !m.uploaded && m.uid === state.user.id && (m.tries || 0) < 8).sort((a, b) => a.startedAt - b.startedAt);
        for(const m of metas){
            if(tel.call || tel.incoming) break;
            try{ await telxUploadOne(m); up.fails = 0; }
            catch(e){
                if(e && e.paused) break;   // 通話中だったので、ここまで。失敗ではないので、回数は増やさない（続きは、あとで）
                m.tries = (m.tries || 0) + 1; m.lastErr = String(e && e.message || e).slice(0, 120);
                try{ await telxPutMeta(m); }catch(_e){}
                up.fails++; if(up.fails >= 3) break;
            }
        }
    }catch(_e){}
    up.running = false;
    try{
        const left = (await telxAllMeta()).some((m) => m.done && !m.uploaded && (m.tries || 0) < 8 && state.user && m.uid === state.user.id);
        if(left) telxQueueUpload(Math.min(300000, 20000 * (up.fails + 1)));
    }catch(_e){}
    if(telxRecs.viewer) telxViewerRender();
}
const TELX_CHUNK = 8 * 256 * 1024;   // 2MB（Googleの決まりで 256KB の倍数）。小さく区切ると、通話がはじまったときに すぐ譲れる・失敗したときのやり直しも少ない
function telxQueryOffset(sessionUrl, total){
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sessionUrl);
        xhr.setRequestHeader("Content-Range", "bytes */" + total);
        xhr.onload = () => {
            if(xhr.status === 308){ const mm = /bytes=0-(\d+)/.exec(xhr.getResponseHeader("Range") || ""); resolve({offset:mm ? Number(mm[1]) + 1 : 0}); }
            else if(xhr.status === 200 || xhr.status === 201){ let id = ""; try{ id = JSON.parse(xhr.responseText).id || ""; }catch(_e){} resolve(id ? {done:true, id} : null); }
            else resolve(null);
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
    });
}
function telxPutRange(sessionUrl, blob, start, end){
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sessionUrl);
        xhr.setRequestHeader("Content-Range", "bytes " + start + "-" + (end - 1) + "/" + blob.size);
        xhr.onload = () => resolve({status:xhr.status, text:xhr.responseText});
        xhr.onerror = () => reject(new Error("通信が切れました。"));
        xhr.ontimeout = () => reject(new Error("通信に時間がかかりすぎました。"));
        xhr.send(blob.slice(start, end));
    });
}
async function telxUploadBlob(sessionUrl, blob, startAt){
    let start = Number(startAt) > 0 ? Number(startAt) : 0;
    while(start < blob.size){
        if(tel.call || tel.incoming){ const pe = new Error("通話がはじまったので、送るのを一時ストップしました。"); pe.paused = true; throw pe; }   // 通話の邪魔にならないよう、区切りごとに確かめる（続きは、あとで）
        const end = Math.min(blob.size, start + TELX_CHUNK);
        let r = null, lastErr = null;
        for(let t = 0; t < 4; t++){
            try{ r = await telxPutRange(sessionUrl, blob, start, end); lastErr = null; if(r.status < 500) break; lastErr = new Error("サーバーが混んでいます（" + r.status + "）。"); }
            catch(e){ lastErr = e; }
            await new Promise((ok) => setTimeout(ok, 1000 * (t + 1)));
        }
        if(lastErr) throw lastErr;
        if(r.status === 200 || r.status === 201){ let id = ""; try{ id = JSON.parse(r.text).id || ""; }catch(_e){} if(!id) throw new Error("ドライブから番号を受け取れませんでした。"); return id; }
        if(r.status !== 308) throw new Error("ドライブが受けつけませんでした（" + r.status + "）。");
        start = end;
    }
    throw new Error("アップロードが最後まで終わりませんでした。");
}
async function telxUploadOne(m){
    const blob = await telxBlobOf(m);
    if(!blob.size){ await telxDelete(m.id); return; }
    const isMin = m.type === "minutes";
    const kind = isMin ? "file" : "video", mime = isMin ? "text/markdown" : String(m.mime || "video/webm").split(";")[0];
    let sess = m.sessionUrl || "", offset = 0;
    if(sess){
        const q = await telxQueryOffset(sess, blob.size);
        if(q && q.done){ m.uploaded = true; m.driveId = q.id; m.uploadedAt = Date.now(); m.sessionUrl = ""; await telxPutMeta(m); return; }
        if(q) offset = q.offset; else sess = "";
    }
    if(!sess){
        const s = await gasCall({action:"start", name:telxFileName(m), size:blob.size, mime, kind});
        sess = s.sessionUrl; m.sessionUrl = sess; await telxPutMeta(m);
    }
    const id = await telxUploadBlob(sess, blob, offset);
    m.uploaded = true; m.driveId = id; m.uploadedAt = Date.now(); m.sessionUrl = ""; m.lastErr = "";
    await telxPutMeta(m);
    // GAS の finish は呼ばない＝「リンクを知っている全員が見られる」にはしない（録音・録画は、フォルダの持ち主だけが見られる）
}
/** 前回、通話の途中でページが閉じられた記録を「できたもの」にして、送る */
async function telxRecover(){
    try{
        const all = await telxAllMeta();
        for(const m of all){
            if(m.done) continue;
            const cs = await telxChunks(m.id);
            m.done = true; m.recovered = true; m.bytes = cs.reduce((a, c) => a + (c.blob ? c.blob.size : 0), 0);
            m.sec = m.sec || Math.round(((m.endedAt || Date.now()) - m.startedAt) / 1000);
            if(m.bytes > 0) await telxPutMeta(m); else await telxDelete(m.id);
        }
    }catch(_e){}
    telxQueueUpload(6000);
}

// ===== 「通話の記録」の画面（この端末に残っている記録）=====
function telxViewerClose(){
    const v = telxRecs.viewer; if(!v) return;
    try{ v.player && v.player.pause(); }catch(_e){}
    if(v.url){ try{ URL.revokeObjectURL(v.url); }catch(_e){} }
    v.box.remove(); telxRecs.viewer = null;
    document.removeEventListener("keydown", telxViewerKey, true);
}
function telxViewerKey(ev){ if(ev.key === "Escape" && telxRecs.viewer){ ev.stopPropagation(); telxViewerClose(); } }
function telxOpenViewer(){
    if(telxRecs.viewer) return;
    telxCss();
    const box = telxH("div", {class:"telx-viewer", role:"dialog", "aria-label":"通話の記録"});
    const win = telxH("div", {class:"telx-vwin"});
    const head = telxH("div", {class:"telx-vhead"}, telxH("b", {text:"通話の記録"}), telxH("button", {type:"button", class:"telx-x", "aria-label":"閉じる", text:"✕", onclick:telxViewerClose}));
    const note = telxH("p", {class:"telx-vnote", text:"通話の録音・録画は、この端末に残し、ドライブ（ファイル保存と同じフォルダ）へ自動で送ります。ここで削除しても、ドライブに送ったものは消えません。"});
    const list = telxH("div", {class:"telx-vlist"});
    const play = telxH("div", {class:"telx-vplay", hidden:true});
    win.appendChild(head); win.appendChild(note); win.appendChild(play); win.appendChild(list); box.appendChild(win);
    box.addEventListener("click", (ev) => { if(ev.target === box) telxViewerClose(); });
    document.body.appendChild(box);
    document.addEventListener("keydown", telxViewerKey, true);
    telxRecs.viewer = {box, list, play, url:"", player:null, arm:""};
    telxViewerRender();
    try{ box.querySelector(".telx-x").focus(); }catch(_e){}
}
async function telxViewerRender(){
    const v = telxRecs.viewer; if(!v) return;
    let metas = [];
    try{ metas = (await telxAllMeta()).filter((m) => m.uid === ((state.user && state.user.id) || "")).sort((a, b) => b.startedAt - a.startedAt); }catch(_e){}
    if(!telxRecs.viewer) return;
    v.list.textContent = "";
    if(!metas.length){ v.list.appendChild(telxH("p", {class:"telx-empty", text:"まだ記録はありません。"})); return; }
    metas.forEach((m) => {
        const st = m.uploaded ? "☁ ドライブに保存ずみ" : (m.done ? (m.tries >= 8 ? "⚠ 送れませんでした" : "⏳ ドライブへ送る順番待ち") : "● 記録中");
        const row = telxH("div", {class:"telx-vrow"});
        const icon = m.type === "minutes" ? "📝 " : (m.kind === "video" ? "🎥 " : "📞 ");
        row.appendChild(telxH("div", {class:"telx-vt"}, telxH("b", null, icon, m.type === "minutes" ? telxH("span", {text:"議事録"}) : null, " " + (m.partnerName || "")), telxH("small", {text:telxDateText(m.startedAt) + (m.type === "minutes" ? "" : "　" + telxDur(m.sec) + "　" + telxSize(m.bytes) + (m.part > 1 ? "　(" + m.part + ")" : ""))}), telxH("small", {class:"telx-vs", text:st})));
        const acts = telxH("div", {class:"telx-vact"});
        if(m.type === "minutes"){
            acts.appendChild(telxH("button", {type:"button", text:"見る", onclick:() => telxViewerShowText(m)}));
        }else{
            acts.appendChild(telxH("button", {type:"button", text:"▶ 再生", onclick:() => telxViewerPlay(m)}));
        }
        acts.appendChild(telxH("button", {type:"button", text:"保存", onclick:() => telxViewerSave(m)}));
        if(m.done && !m.uploaded) acts.appendChild(telxH("button", {type:"button", text:"今すぐ送る", onclick:() => { m.tries = 0; telxPutMeta(m).then(() => { telxQueueUpload(200); showToast("ドライブへ送ります。"); }); }}));
        const armed = v.arm === m.id;
        acts.appendChild(telxH("button", {type:"button", class:"telx-del" + (armed ? " arm" : ""), text:armed ? "もう一度で削除" : "削除", onclick:() => {
            if(v.arm !== m.id){ v.arm = m.id; telxViewerRender(); setTimeout(() => { if(telxRecs.viewer && v.arm === m.id){ v.arm = ""; telxViewerRender(); } }, 4000); return; }
            v.arm = ""; telxDelete(m.id).then(() => { showToast("この端末の記録を削除しました。"); telxViewerRender(); });
        }}));
        row.appendChild(acts); v.list.appendChild(row);
    });
}
async function telxViewerPlay(m){
    const v = telxRecs.viewer; if(!v) return;
    try{
        const blob = await telxBlobOf(m);
        if(v.url) URL.revokeObjectURL(v.url);
        v.url = URL.createObjectURL(blob);
        v.play.hidden = false; v.play.textContent = "";
        v.player = telxH("video", {controls:true, playsinline:true, autoplay:true, src:v.url, class:"telx-video"});
        v.play.appendChild(v.player);
    }catch(_e){ showToast("再生できませんでした。"); }
}
async function telxViewerShowText(m){
    const v = telxRecs.viewer; if(!v) return;
    v.play.hidden = false; v.play.textContent = "";
    v.play.appendChild(telxH("pre", {class:"telx-pre", text:m.text || ""}));
}
async function telxViewerSave(m){
    try{
        const blob = await telxBlobOf(m);
        const a = telxH("a", {href:URL.createObjectURL(blob), download:telxFileName(m)});
        document.body.appendChild(a); a.click(); setTimeout(() => { try{ URL.revokeObjectURL(a.href); a.remove(); }catch(_e){} }, 4000);
    }catch(_e){ showToast("保存できませんでした。"); }
}
