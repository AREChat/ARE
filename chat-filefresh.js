"use strict";
// ===== ファイルのリンクの期限切れ対策 =====
// 送ったファイル（pptx・PDF・zip など）や、画像・動画のリンクは、7日で切れます。
// 切れたあとに押すと「開けない」になるので、チャットに出ているリンクのうち、期限が近い・切れているものだけ、
// 保存先のパスから、新しいリンクに取り直します（リンクの中に書いてある期限を読んで、決めます。通信は、必要なぶんだけ）。
const ffk = {fresh:new Map(), busy:false, timer:0, retryAt:0};
const FF_MARGIN = 6 * 3600 * 1000;          // 残りが6時間より少ないものを取り直す
const FF_TTL = 7 * 24 * 3600;               // 新しいリンクの有効な長さ（秒）

/** リンクの中の token（JWT）から、期限（ミリ秒）を読む。読めなければ 0 */
function ffExpiry(href){
    try{
        const t = new URL(href, location.href).searchParams.get("token") || "";
        const part = t.split(".")[1];
        if(!part) return 0;
        const b = part.replace(/-/g, "+").replace(/_/g, "/");
        const json = JSON.parse(atob(b + "=".repeat((4 - b.length % 4) % 4)));
        return Number(json.exp) * 1000 || 0;
    }catch(_e){ return 0; }
}
/** 保存先のパス（バケット内）を、リンクから取り出す。このアプリの添付のバケットでなければ "" */
function ffPathOf(href){
    try{
        const u = new URL(href, location.href);
        const m = /\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname);
        return m && m[1] === STORAGE_BUCKET ? decodeURIComponent(m[2]) : "";
    }catch(_e){ return ""; }
}

async function ffScan(){
    if(ffk.busy || Date.now() < ffk.retryAt || !el || !el.messages) return;
    const now = Date.now();
    const anchors = Array.prototype.slice.call(el.messages.querySelectorAll('a[href*="/storage/v1/object/sign/"]'));
    const need = new Map();                                   // パス → [リンク]
    anchors.forEach((a) => {
        const path = ffPathOf(a.getAttribute("href"));
        if(!path) return;
        const known = ffk.fresh.get(path);
        if(known && known.exp > now + FF_MARGIN){             // 取り直しずみ：表示のリンクが古いままなら、さしかえる
            if(a.getAttribute("href") !== known.url) a.setAttribute("href", known.url);
            return;
        }
        const exp = ffExpiry(a.getAttribute("href"));
        if(!exp || exp > now + FF_MARGIN) return;             // 期限が読めない・まだ余裕がある
        if(!need.has(path)) need.set(path, []);
        need.get(path).push(a);
    });
    if(!need.size) return;
    ffk.busy = true;
    try{
        const paths = Array.from(need.keys()).slice(0, 200);
        const client = requireClient();
        for(let i = 0; i < paths.length; i += 100){
            const part = paths.slice(i, i + 100);
            const res = await client.storage.from(STORAGE_BUCKET).createSignedUrls(part, FF_TTL);
            if(res.error) throw res.error;
            (res.data || []).forEach((s) => {
                const url = safeHttpUrl(s && s.signedUrl || "");
                if(!s || !s.path || !url) return;
                ffk.fresh.set(s.path, {url, exp: ffExpiry(url) || (Date.now() + FF_TTL * 1000)});
                (need.get(s.path) || []).forEach((a) => { if(a.isConnected) a.setAttribute("href", url); });
            });
        }
    }catch(_e){
        ffk.retryAt = Date.now() + 60000;                     // うまくいかなかったら、1分は 取り直しにいかない
    }finally{
        ffk.busy = false;
    }
}
function ffSchedule(){
    clearTimeout(ffk.timer);
    ffk.timer = setTimeout(ffScan, 400);
}
function initFileFresh(){
    if(!el || !el.messages || typeof MutationObserver !== "function") return;
    new MutationObserver(ffSchedule).observe(el.messages, {childList:true, subtree:true});
    ffSchedule();
}
