"use strict";
// ===== ARE 共通のオフライン処理（sw.js と game/sw.js が importScripts で読む）=====
// ・ページの本体（html/js/css/json）: ネット優先（4秒まって だめなら 控え）。成功したら控えを更新 → 更新が 古いままに ならない。
// ・画像・音楽: 保存ずみなら それを使う（オフラインでも あそべる）。音楽の Range（とちゅう再生）にも 対応。
// ・保存の 本体は shared/are-offline.js の「ダウンロード」ボタンが 'are-media' に 入れる。
// ・POST など GET 以外／ほかのサイトには さわらない。
self.areCore = function(opt){
  const SHELL = opt.shell, MEDIA = "are-media", ROOT = new URL(opt.root, self.location.href);
  const isAudio = (p) => /\.(mp3|mp4|wav|ogg|m4a)$/i.test(p);
  const isImg = (p) => /\.(webp|png|jpg|jpeg|gif|svg|ico)$/i.test(p);
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

  async function precache(){
    const list = (self.ARE_MANIFEST && self.ARE_MANIFEST.shell) || [];
    const c = await caches.open(SHELL);
    let i = 0;
    async function worker(){
      while(i < list.length){
        const f = list[i++];
        try{
          const u = new URL(f, ROOT).href;
          const res = await fetch(u, {cache: "no-cache"});
          if(res && res.status === 200 && res.type === "basic") await c.put(u, res);
        }catch(_e){}
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  async function lookup(req, navigate){
    let hit = await caches.match(req);
    if(hit) return hit;
    const u = new URL(req.url);
    if(u.search){ hit = await caches.match(u.origin + u.pathname); if(hit) return hit; }
    if(/\/$/.test(u.pathname)){ hit = await caches.match(u.origin + u.pathname + "index.html"); if(hit) return hit; }
    if(navigate){ hit = await caches.match(new URL("index.html", ROOT).href); if(hit) return hit; }
    return null;
  }

  async function netFirst(req, navigate){
    const cached = await lookup(req, false);
    try{
      const p = fetch(req, {cache: "no-cache"});
      const res = cached ? await Promise.race([p, timeout(4000)]) : await p;
      if(res && res.status === 200 && res.type === "basic"){ const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }catch(err){
      if(cached) return cached;
      const hit = await lookup(req, navigate);
      if(hit) return hit;
      throw err;
    }
  }

  async function slice(hit, req){
    const buf = await hit.arrayBuffer(), size = buf.byteLength;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
    let s = m && m[1] ? +m[1] : 0, e = m && m[2] ? +m[2] : size - 1;
    if(s >= size) return new Response("", {status: 416, headers: {"Content-Range": "bytes */" + size}});
    e = Math.min(e, size - 1);
    return new Response(buf.slice(s, e + 1), {status: 206, headers: {"Content-Type": hit.headers.get("Content-Type") || "audio/mpeg", "Content-Range": "bytes " + s + "-" + e + "/" + size, "Content-Length": String(e - s + 1), "Accept-Ranges": "bytes"}});
  }

  self.addEventListener("install", (event) => { if(opt.precache) event.waitUntil(precache()); });
  function audio(event){
    const req = event.request, url = new URL(req.url);
    event.respondWith((async () => {
      const hit = await caches.match(url.origin + url.pathname);
      if(hit) return req.headers.has("range") ? slice(hit, req) : hit;
      return fetch(req);
    })());
  }
  if(opt.owns){
    self.addEventListener("activate", (event) => {
      event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => opt.owns(k) && k !== SHELL).map((k) => caches.delete(k)));
        await self.clients.claim();
      })());
    });
  }
  self.addEventListener("message", (event) => { if(event.data && event.data.type === "SKIP_WAITING") self.skipWaiting(); });
  if(opt.fetch === false) return {audio, isAudio, lookup};
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if(req.method !== "GET") return;
    let url; try{ url = new URL(req.url); }catch(_e){ return; }
    if(url.origin !== self.location.origin) return;
    const p = url.pathname;
    if(isAudio(p)){ audio(event); return; }
    if(isImg(p)){
      event.respondWith((async () => {
        const hit = await caches.match(req);
        if(hit) return hit;
        const res = await fetch(req);
        return res;
      })());
      return;
    }
    if(req.headers.has("range")) return;
    if(opt.swr && req.mode !== "navigate" && /\.(js|css|json|webmanifest|txt|woff2?|ttf)$/i.test(p)){   // 控え先・裏で更新（2回目から速い）
      event.respondWith((async () => {
        const hit = await lookup(req, false);
        const upd = fetch(req, {cache: "no-cache"}).then((res) => { if(res && res.status === 200 && res.type === "basic"){ const cp = res.clone(); caches.open(SHELL).then((c) => c.put(req, cp)).catch(() => {}); } return res; });
        if(hit){ event.waitUntil(upd.catch(() => {})); return hit; }
        return upd;
      })());
      return;
    }
    event.respondWith(netFirst(req, req.mode === "navigate"));
  });
  return {audio, isAudio, lookup};
};
