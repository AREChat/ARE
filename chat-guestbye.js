"use strict";
// ===== お試しアカウント：タブを閉じる・ページを離れるときに、その場でアカウントを削除する =====
// ・ログアウトボタン／「登録する」を押したときの削除（system.js の logout()）とは別に、
//   「閉じる」「再読み込み」「別ページへ移動」などページを離れる一瞬に向けて削除の合図を送る。
// ・合図は navigator.sendBeacon で、サーバーの関数（guest-bye）へ「ログイン用の札」だけを text/plain で送る。
//   特別なヘッダーを付けない「単純な送信」なので、ブラウザの事前確認（preflight）が要らず、ページが閉じる途中でも
//   最後まで送れる（以前の fetch＋認証ヘッダー方式は事前確認が必要で、タブを閉じると途中で打ち切られて消えなかった）。
// ・お試しかどうかは、札（JWT）の中の user_metadata.guest で その場で判定する（通信待ちの間に閉じられても間に合う）。
//   サーバー側でも「お試しアカウントか」を確かめてから消すので、ふつうのユーザー・管理者は消えない。
// ・注意：ブラウザの仕組み上「タブを閉じる」と「再読み込み（F5）」「サイト内の別ページへ移動」は
//   完全には区別できない。ご指示により、そのどれでも削除される挙動にしている。
// ・合図が届かなかったとき（電波が切れた・ブラウザが落ちた等）の保険として、サーバー側の pg_cron が
//   5 分ごとに「10 分以上 音沙汰のないお試し」を消す（sql/guest_close_delete_v1.sql）。さらに 2 日放置の自動削除もある。

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

// 札（JWT）の中身だけを読んで、お試しアカウントか調べる（通信しない）
function gbTokenIsGuest(token){
    try{
        const part = String(token || "").split(".")[1];
        if(!part) return false;
        const json = decodeURIComponent(Array.prototype.map.call(atob(part.replace(/-/g,"+").replace(/_/g,"/")),(c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
        const claims = JSON.parse(json);
        return !!(claims && claims.user_metadata && claims.user_metadata.guest === true);
    }catch(_e){ return false; }
}

function gbFireDelete(){
    if(gbFired) return;
    const token = gbAuthToken();
    const config = window.ARE_CONFIG;
    if(!token || !config || !config.supabaseUrl) return;
    if(!gbIsGuest && !gbTokenIsGuest(token)) return;
    gbFired = true;
    const url = config.supabaseUrl + "/functions/v1/guest-bye";
    const body = JSON.stringify({t:token});
    let sent = false;
    try{
        if(navigator.sendBeacon) sent = navigator.sendBeacon(url,new Blob([body],{type:"text/plain;charset=UTF-8"}));
    }catch(_e){ sent = false; }
    if(!sent){
        try{ fetch(url,{method:"POST",mode:"no-cors",keepalive:true,headers:{"Content-Type":"text/plain;charset=UTF-8"},body:body}).catch(() => {}); }
        catch(_e){ /* 消せなくても、サーバー側の保険（10分で自動削除）・2日放置の自動削除で、いずれ片付く */ }
    }
}

function initGuestBye(){
    gbRefreshFlag();
    window.addEventListener("pagehide",gbFireDelete);
}
