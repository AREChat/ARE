"use strict";
// ===== 一瞬で開く工夫（スマホの回線だけでも速く）=====
// 1) sw.js が chat.html を「控え先」で すぐ出し、裏で最新を確かめて、変わっていたら「are-html-updated」を送ってきます。
//    ・まだ何も触っていない（入力なし・タップなし・開いて10秒いない）なら、自動で 1 回だけ開き直して 最新にします。
//    ・触っている最中は、開き直さず お知らせだけ出します（入力が消えないように）。
// 2) チャット一覧は、前回のものを この端末に保存しておき、次に開いたとき すぐ出します（通信は あとから 静かに更新）。
//    保存先は アカウントごとの localStorage だけ（ほかの人の情報は 入らない／端末の外へは 出ない）。

const FB_ROOMS_MAX = 120;
const fbBoot = {t0:Date.now(), touched:false, notified:false};

function fbRoomsKey(){ return "are_rooms_cache_v1_" + (state.user ? state.user.id : "x"); }

/** 前回の一覧を読む（なければ null） */
function fbLoadRooms(){
    try{
        const raw = localStorage.getItem(fbRoomsKey()); if(!raw) return null;
        const o = JSON.parse(raw);
        if(!o || !Array.isArray(o.rooms) || !o.rooms.length) return null;
        return o.rooms.filter((r) => r && typeof r.id === "string");
    }catch(_e){ return null; }
}
/** 最新の一覧を保存する */
function fbSaveRooms(rooms){
    try{
        if(!Array.isArray(rooms) || !rooms.length){ localStorage.removeItem(fbRoomsKey()); return; }
        localStorage.setItem(fbRoomsKey(), JSON.stringify({savedAt:Date.now(), rooms:rooms.slice(0, FB_ROOMS_MAX)}));
    }catch(_e){ /* 容量いっぱいなどは、あきらめて 通常どおり */ }
}
function fbClearRooms(){ try{ localStorage.removeItem(fbRoomsKey()); }catch(_e){} }

// 画面の読み込み中に届いたお知らせを取りこぼさないよう、ファイルを読んだ時点で すぐ受け付けを始める
function fbListen(){
    ["pointerdown", "keydown", "input", "touchstart"].forEach((t) => window.addEventListener(t, () => { fbBoot.touched = true; }, {capture:true, passive:true}));
    if(!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("message", (event) => {
        if(!event.data || event.data.type !== "are-html-updated" || fbBoot.notified) return;
        fbBoot.notified = true;
        const idle = !fbBoot.touched && Date.now() - fbBoot.t0 < 10000;
        let recent = false;
        try{ const last = Number(sessionStorage.getItem("are_fast_reload") || 0); recent = Date.now() - last < 60000; if(idle && !recent) sessionStorage.setItem("are_fast_reload", String(Date.now())); }catch(_e){}
        if(idle && !recent){ location.reload(); return; }
        try{ showToast("新しい版が入りました。次に開き直すと切り替わります。"); }catch(_e){}
    });
}

fbListen();
function initFastBoot(){ /* 受け付けは ファイルを読んだ時点で 開始ずみ */ }
