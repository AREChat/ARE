"use strict";
// ===== お試しアカウント：タブを閉じる・ページを離れるときに、その場でアカウントを削除する =====
// ・ログアウトボタンを押したときの削除（system.js の logout()）とは別に、
//   「閉じる」「再読み込み」「別ページへ移動」などページを離れる一瞬に向けて削除リクエストを送る。
// ・ページが閉じられている途中でも送信が完了するよう、fetch(..., {keepalive:true}) を使う
//   （navigator.sendBeacon は独自ヘッダー（ログインの認証情報）を付けられないため使えない）。
// ・注意：ブラウザの仕組み上「タブを閉じる」と「再読み込み（F5）」「サイト内の別ページへ移動」は
//   完全には区別できない。今回はご指示により、そのどれでも削除される挙動にしている。
// ・通信に失敗しても、ここでは何もしない（既存の「ログアウト時に削除」「2日間放置で自動削除」の
//   仕組みがあるので、それ以外のケースで消えなくても最終的には片付く）。

let gbIsGuest = false;
let gbFired = false;

async function gbRefreshFlag(){
    try{
        const r = await requireClient().rpc("guest_status_me");
        gbIsGuest = !!(r.data && r.data.guest);
    }catch(_e){ gbIsGuest = false; }
}

function gbAuthToken(){
    try{
        const key = Object.keys(localStorage).find((k) => k.indexOf("sb-") === 0 && k.indexOf("-auth-token") === k.length - "-auth-token".length);
        if(!key) return null;
        const raw = JSON.parse(localStorage.getItem(key) || "null");
        return raw && raw.access_token ? raw.access_token : null;
    }catch(_e){ return null; }
}

function gbFireDelete(){
    if(gbFired || !gbIsGuest) return;
    const token = gbAuthToken();
    const config = window.ARE_CONFIG;
    if(!token || !config || !config.supabaseUrl || !config.supabasePublishableKey) return;
    gbFired = true;
    try{
        fetch(config.supabaseUrl + "/rest/v1/rpc/guest_delete_me_v1",{
            method:"POST",
            keepalive:true,
            headers:{
                "Content-Type":"application/json",
                "apikey":config.supabasePublishableKey,
                "Authorization":"Bearer " + token
            },
            body:"{}"
        }).catch(() => {});
    }catch(_e){ /* 消せなくても、ログアウト時の削除・2日間放置での自動削除で、いずれ片付く */ }
}

function initGuestBye(){
    gbRefreshFlag();
    window.addEventListener("pagehide",gbFireDelete);
    window.addEventListener("beforeunload",gbFireDelete);
}
