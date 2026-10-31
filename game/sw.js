"use strict";
// ===== ARE QUEST 専用 サービスワーカー（チャットの sw.js とは べつもの）=====
// ・このゲームの フォルダ（/ARE/game/）の中だけを 担当する。チャット側の控え（キャッシュ）とは まざらない。
// ・GET 以外／ほかのサイト／Range（音楽のとちゅう再生）／mp3 などの 大きな音声は さわらない → 止まったり 古いままに ならない。
// ・自分のファイルは「ネット優先」。つながらない ときだけ 控えを つかう。新しい版が 入ったら 古い控えは すべて 消す。
const CACHE = "tq-game-v18-20261031";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.indexOf("tq-game-") === 0 && k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});
self.addEventListener("fetch", (event) => {
    const request = event.request;
    if(request.method !== "GET" || request.headers.has("range")) return;
    let url; try{ url = new URL(request.url); }catch(_e){ return; }
    if(url.origin !== self.location.origin) return;
    if(url.pathname.indexOf(new URL("./", self.location.href).pathname) !== 0) return;       // ゲームの フォルダの そと（チャットなど）は さわらない
    if(/\.(mp3|mp4|wav|ogg|m4a)$/i.test(url.pathname)) return;                             // 音楽・動画は ブラウザに おまかせ
    event.respondWith((async () => {
        try{
            const res = await fetch(request, {cache:"no-cache"});
            if(res && res.status === 200 && res.type === "basic"){ const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {}); }
            return res;
        }catch(err){
            const hit = await caches.match(request);
            if(hit) return hit;
            if(request.mode === "navigate"){ const home = await caches.match("./index.html"); if(home) return home; }
            throw err;
        }
    })());
});
