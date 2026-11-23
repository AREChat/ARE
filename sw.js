"use strict";
// ===== ARE サービスワーカー（速さ重視版）=====
// ・GET 以外（POST/HEAD など）は一切さわらない → 「Cache.put: Request method 'POST' is unsupported」を防ぐ
// ・Supabase など他のサイトへの通信にはさわらない
// ・HTML（画面の骨組み）は「ネット優先」：つながるときは常に最新を取得（オフラインのときだけ控えを使う）
// ・JS / CSS / 画像などは「控え先・裏で更新」：控えがあればすぐ表示し、裏で最新を取り直して次回に備える
//   → 2回目以降の表示が速い。更新したのに古い画面のまま、を防ぐために、更新したら下の CACHE の数字を1つ上げる
//     （数字を上げると古い控えがまとめて消えて、全部が新しく入れ替わる）
// ・chat.bundle.js?v=… のように ?v= が付いたファイルは、中身が変わると URL も変わるので、控えをそのまま使う（再確認しない）
// ・version.json は常にネット優先（更新確認に使うため）
// ・新しい版が入ったら、古い控えをすべて消す

importScripts("precache-manifest.js", "sw-core.js");
const CACHE = "are-v240-20261124";
// オフライン用: 画面の骨組み（html/js/css/json）を 最初に まとめて保存 / 画像・音楽は「オフライン準備」ボタンで are-media に保存（sw-core.js）
const core = self.areCore({shell: CACHE, root: "./", precache: true, fetch: false});
const STATIC_RE = /\.(?:js|css|png|webp|jpe?g|gif|svg|ico|json|webmanifest|txt|woff2?|ttf|mp3|mp4)$/i;

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("message", (event) => {
    if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE && k !== "are-media" && k !== "are-ads" && k !== "are-prefs" && k.indexOf("tq-game-") !== 0).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

// ※ response.clone() は、画面にわたす前（同期的）に行う。あとからだと本文が使用ずみで失敗する
function putCopy(request, response){
    if(response && response.status === 200 && response.type === "basic"){
        let copy;
        try{ copy = response.clone(); }catch(_e){ return Promise.resolve(); }
        return caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return Promise.resolve();
}

// ネット優先（HTML・version.json など）
async function networkFirst(request){
    try{
        const response = await fetch(request, {cache: "no-cache"});
        putCopy(request, response);
        return response;
    }catch(error){
        const cached = await caches.match(request);
        if(cached) return cached;
        if(request.mode === "navigate"){
            const home = await caches.match("./index.html");
            if(home) return home;
        }
        throw error;
    }
}

// 控え先・裏で更新（JS / CSS / 画像など）
async function cacheFirst(event, request, revalidate){
    const cached = await caches.match(request);
    if(cached){
        if(revalidate){
            event.waitUntil(fetch(request, {cache: "no-cache"}).then((response) => putCopy(request, response)).catch(() => {}));
        }
        return cached;
    }
    const response = await fetch(request);
    putCopy(request, response);
    return response;
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if(request.method !== "GET") return;
    let url;
    try{ url = new URL(request.url); }catch(_e){ return; }
    if(url.origin !== self.location.origin) return;
    if(/\/ads\/[^/]+\.mp4$/i.test(url.pathname)) return;   // 広告の映像（100本）は 控えに入れず、そのままネットから
    if(core.isAudio(url.pathname)){ core.audio(event); return; }   // 保存ずみの音楽は オフラインでも 再生できる
    if(request.headers.has("range")) return;
    if(url.pathname.indexOf("/game/") !== -1){ event.respondWith(networkFirst(request)); return; }   // RPG（/game/）は ゲーム専用の sw.js が先に 担当する。まだ 入っていない ときは ここで ネット優先（オフラインは 控え）

    const path = url.pathname;
    const isPage = request.mode === "navigate" || /\.html$/i.test(path) || /\/$/.test(path);
    if(isPage || /\/version\.json$/i.test(path) || !STATIC_RE.test(path)){
        event.respondWith(networkFirst(request));
        return;
    }
    // ?v=… 付きは中身が変わると URL も変わる → 控えをそのまま使う
    event.respondWith(cacheFirst(event, request, !url.searchParams.has("v")));
});

// ===== プッシュ通知（サーバーの send-push 関数から届く）=====
// ・画面を開いて見ている最中は、アプリ内のポップアップがあるので重ねて出さない（iPhone / iPad は「必ず表示」が決まりなので常に出す）
self.addEventListener("push", (event) => {
    let data = {};
    try{ data = event.data ? event.data.json() : {}; }catch(_e){ data = {body: event.data ? event.data.text() : ""}; }
    // 既読になったとき：ポップアップを出さず、他の端末に出ている同じチャットの通知だけ消す
    if(data.type === "clear"){
        const tag = String(data.tag || (data.room ? "room-" + data.room : ""));
        if(tag) event.waitUntil(self.registration.getNotifications({tag}).then((list) => list.forEach((n) => n.close())));
        return;
    }
    const title = String(data.title || "ARE").slice(0, 80);
    const morning = data.type === "morning";
    const options = {
        body: String(data.body || "新しいメッセージがあります").slice(0, 140),
        icon: "icon-192.png", badge: "icon-192.png",
        tag: String(data.tag || "are"), renotify: true,
        data: {room: typeof data.room === "string" ? data.room : ""}
    };
    event.waitUntil((async () => {
        // 管理者・家庭の人は ミュート（音もバイブもなし）。そのほかの人は、アラームのようなバイブ。（画面側が are-prefs に書いている）
        let muted = false;
        try{
            const c = await caches.open("are-prefs"), r = await c.match(new URL("are-prefs.json", self.registration.scope).href);
            if(r){ const j = await r.json(); muted = !!(j && j.muted); }
        }catch(_e){ muted = false; }
        if(muted){ options.silent = true; }
        else{ options.vibrate = morning ? [400, 150, 400, 150, 400, 150, 400] : [200, 100, 200, 100, 200]; }
        if(morning) options.requireInteraction = !muted;
        const list = await self.clients.matchAll({type: "window", includeUncontrolled: true});
        const apple = /iPhone|iPad|iPod|Macintosh/i.test(self.navigator.userAgent || "");
        const seen = list.some((c) => c.visibilityState === "visible" && c.focused);
        // 画面を開いて見ているときは、アプリ内のポップアップ＋アラーム音に任せる（朝の通知は画面側へ知らせる）
        if(seen && morning) list.forEach((c) => { try{ c.postMessage({type: "morning-alarm"}); }catch(_e){} });
        if(!apple && seen) return;
        await self.registration.showNotification(title, options);
    })());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const room = (event.notification.data && event.notification.data.room) || "";
    event.waitUntil((async () => {
        const list = await self.clients.matchAll({type: "window", includeUncontrolled: true});
        for(const c of list){
            if("focus" in c){
                try{ await c.focus(); }catch(_e){}
                if(room) c.postMessage({type: "open-room", room});
                return;
            }
        }
        const base = new URL("chat.html", self.registration.scope);
        if(/^[0-9a-f-]{36}$/i.test(room)) base.searchParams.set("room", room);
        await self.clients.openWindow(base.href);
    })());
});
