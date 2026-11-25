"use strict";
// ===== 動画のリンクの「プレビュー」自動再生 =====
// ・メッセージの中の「動画のリンク」を、その場で見られるプレビュー（小さな動画）にします。
//     ① 大きい動画をドライブに置いて送ったときの「🎬 動画のリンク」（Google ドライブ）
//     ② YouTube のリンク（youtube.com／youtu.be／shorts）
//     ③ 動画ファイルそのもののリンク（.mp4 .webm .mov .m4v .ogv）。ただし、画面が読みこめる場所（このアプリの保存先・Google ドライブ）のものだけ
// ・はじめから「オン」です。画面に見えているあいだだけ、音つきで自動再生します（見えなくなると止まります）。
//   ただし、ブラウザの決まりで「まだ一度も画面を押していない」ときは音つきで始められないので、いったん音なしで始め、最初に画面を押した（触った）瞬間に音を出します。
//   動画は同時に 1 つだけ再生します（新しく始まると、ほかは止まります）。
// ・「🧰 その他」→「▶ 動画リンクの自動再生」でオフにできます（オフでも、プレビューは出ます。押して再生します。いやな人はここでオフに）。
// ・通信量をおさえる設定（データセーバー）のときは、自動では再生しません。
// ・ドライブの動画が直接読みこめないとき（大きすぎるなど）は、ドライブの再生画面（プレビュー）に切りかえます。

const LKV_KEY = "are_lv_auto";
const LKV_VIDEO_RE = /\.(mp4|m4v|webm|mov|ogv)(?:[?#].*)?$/i;
const LKV_AUDIO_RE = /\.(mp3|m4a|wav|ogg|oga|aac|flac)$/i;
const LKV_FILE_KEY = "are_lv_file";
const LKV_DRIVE_RE = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,100})\/(?:view|preview)/;
const LKV_ALLOWED_FILE_HOSTS = /^(?:[a-z0-9-]+\.supabase\.co|drive\.google\.com|[a-z0-9.-]+\.googleusercontent\.com)$/i;
const lkv = {obs:null, mo:null, timer:null, mem:new Map()};   // mem：メッセージ一覧が作り直されても、続きから再生できるように、動画ごとの位置と「自分で止めた」を覚えておく

function lkvAutoOn(){
    try{ if(localStorage.getItem(LKV_KEY) === "0") return false; }catch(_e){}
    try{ if(navigator.connection && navigator.connection.saveData) return false; }catch(_e){}
    return true;
}
function lkvFileOn(){ try{ return localStorage.getItem(LKV_FILE_KEY) !== "0"; }catch(_e){ return true; } }
function lkvAutoSetting(){ try{ return localStorage.getItem(LKV_KEY) !== "0"; }catch(_e){ return true; } }

/** リンク先が動画かどうか。動画なら {k:"yt"|"drive"|"file", id|url}、ちがえば null */
function lkvKind(href, bubbleText){
    let u; try{ u = new URL(href); }catch(_e){ return null; }
    if(u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if(h === "youtu.be"){ const id = u.pathname.slice(1).split("/")[0]; return /^[A-Za-z0-9_-]{11}$/.test(id) ? {k:"yt", id} : null; }
    if(h === "youtube.com" || h === "www.youtube.com" || h === "m.youtube.com" || h === "music.youtube.com"){
        let id = u.searchParams.get("v") || "";
        const m = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u.pathname); if(m) id = m[1];
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? {k:"yt", id} : null;
    }
    const d = LKV_DRIVE_RE.exec(u.href);
    if(d){
        if(/動画のリンク/.test(bubbleText)) return {k:"drive", id:d[1]};
        if(/ファイルのリンク/.test(bubbleText)) return lkvFileOn() ? {k:"dfile", id:d[1]} : null;   // 書類・PDF・写真など：ドライブの見る画面（プレビュー）
        return null;
    }
    if(LKV_AUDIO_RE.test(u.pathname) && LKV_ALLOWED_FILE_HOSTS.test(h)) return lkvFileOn() ? {k:"audio", url:u.href} : null;   // ドライブのリンクは、「🎬 動画のリンク」のメッセージだけ（書類・画像は対象外）
    if(LKV_VIDEO_RE.test(u.pathname + u.search) && LKV_ALLOWED_FILE_HOSTS.test(h)) return {k:"file", url:u.href};
    return null;
}

function lkvBox(a, bubble, kind){
    const box = document.createElement("div");
    box.className = "lv-box"; box.dataset.lv = JSON.stringify(kind);
    box.innerHTML = '<div class="lv-ph">🎬 動画のプレビュー（見える位置にくると読みこみます）</div>';
    let grid = bubble.querySelector(".lv-grid");
    if(!grid){ grid = document.createElement("div"); grid.className = "lv-grid"; bubble.appendChild(grid); }
    grid.appendChild(box);
    grid.dataset.n = String(grid.children.length);   // 2 つ以上あるときは、まとめて 2 列に並べる
    lkv.obs.observe(box);
}

function lkvDecorate(){
    const root = document.getElementById("messages"); if(!root) return;
    root.querySelectorAll(".bubble a.msg-link").forEach((a) => {
        if(a.dataset.lkvDone) return;
        a.dataset.lkvDone = "1";
        const bubble = a.closest(".bubble"); if(!bubble) return;
        const kind = lkvKind(a.href, bubble.textContent || "");
        if(!kind) return;
        const key = JSON.stringify(kind);   // 同じリンクが 2 回あっても 1 つだけ
        if([...bubble.querySelectorAll(".lv-box")].some((b) => b.dataset.lv === key)) return;
        lkvBox(a, bubble, kind);
    });
}

function lkvVideoEl(src, auto){
    const v = document.createElement("video");
    v.controls = true; v.playsInline = true; v.muted = true; v.defaultMuted = true; v.preload = auto ? "auto" : "metadata";
    v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.setAttribute("referrerpolicy", "no-referrer");
    v.setAttribute("controlslist", "nodownload"); v.className = "lv-video";
    v.addEventListener("loadedmetadata", () => {
        if(v.duration && v.duration <= 30) v.loop = true;
        const m = lkv.mem.get(src); if(m && m.t > 0 && m.t < (v.duration || 1e9) - 0.5){ try{ v.currentTime = m.t; }catch(_e){} }
    });
    v.addEventListener("timeupdate", () => { const m = lkv.mem.get(src) || {}; m.t = v.currentTime; lkv.mem.set(src, m); });
    { const m = lkv.mem.get(src); if(m && m.up) v.dataset.userPaused = "1"; }
    v.src = src;
    return v;
}
function lkvFrameEl(src){
    const f = document.createElement("iframe");
    f.className = "lv-frame"; f.src = src; f.loading = "lazy"; f.allowFullscreen = true;
    f.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    f.title = "動画のプレビュー";
    return f;
}
function lkvYtPost(box, fn){
    const f = box.querySelector("iframe"); if(!f || !f.contentWindow) return;
    try{ f.contentWindow.postMessage(JSON.stringify({event:"command", func:fn, args:[]}), "https://www.youtube-nocookie.com"); }catch(_e){}
}

/** 見える位置にきたとき、はじめて動画を読みこむ（見えないあいだは通信しない） */
function lkvActivate(box){
    if(box.dataset.on === "1") return;
    let kind; try{ kind = JSON.parse(box.dataset.lv); }catch(_e){ return; }
    const auto = lkvAutoOn();
    box.dataset.on = "1"; box.textContent = "";
    if(kind.k === "yt"){
        let active = false; try{ active = !!(navigator.userActivation && navigator.userActivation.hasBeenActive); }catch(_e){}
        const q = "enablejsapi=1&playsinline=1&rel=0&modestbranding=1" + (auto ? "&autoplay=1" + (active ? "" : "&mute=1") : "");
        if(auto && !active) box.dataset.ytMuted = "1";
        box.appendChild(lkvFrameEl("https://www.youtube-nocookie.com/embed/" + kind.id + "?" + q));
        return;
    }
    if(kind.k === "dfile"){ box.appendChild(lkvFrameEl("https://drive.google.com/file/d/" + kind.id + "/preview")); box.classList.add("lv-doc"); return; }
    if(kind.k === "audio"){
        const a = document.createElement("audio"); a.controls = true; a.preload = "metadata"; a.src = kind.url; a.className = "lv-audio";
        a.addEventListener("error", () => box.remove()); box.appendChild(a); return;
    }
    const src = kind.k === "drive" ? "https://drive.google.com/uc?export=download&id=" + kind.id : kind.url;
    const v = lkvVideoEl(src, auto);
    v.addEventListener("error", () => {
        if(kind.k === "drive" && !box.dataset.fb){   // 大きすぎるなどで読みこめない → ドライブの再生画面に切りかえる
            box.dataset.fb = "1"; box.textContent = ""; box.appendChild(lkvFrameEl("https://drive.google.com/file/d/" + kind.id + "/preview"));
        }else{ box.remove(); }                    // それ以外は、プレビューをやめる（リンクはそのまま残る）
    });
    box.appendChild(v);
    if(auto && !v.dataset.userPaused) lkvPlay(v);
}
function lkvSet(v, muted){ v.__self = true; v.muted = muted; v.__self = false; }
function lkvPlay(v){
    try{
        document.querySelectorAll(".lv-video").forEach((o) => { if(o !== v) lkvSysPause(o); });   // 同時に 1 つだけ
        lkvSet(v, false);
        const p = v.play();
        if(p && p.catch) p.catch(() => {   // 音つきを止められた → 音なしで始めて、最初に触られたときに音を出す
            lkvSet(v, true); v.__needUnmute = true;
            try{ const q = v.play(); if(q && q.catch) q.catch(() => {}); }catch(_e){}
        });
    }catch(_e){}
}
function lkvUnmuteAll(){
    document.querySelectorAll(".lv-video").forEach((v) => { if(v.__needUnmute){ v.__needUnmute = false; if(!v.paused) lkvSet(v, false); } });
    document.querySelectorAll(".lv-box").forEach((b) => { if(b.dataset.ytMuted === "1"){ b.dataset.ytMuted = "0"; lkvYtPost(b, "unMute"); } });
}

function lkvSysPause(v){ if(v && !v.paused){ v.__byView = true; v.pause(); } }
function lkvIsYt(box){ const f = box.querySelector("iframe"); return !!f && /youtube-nocookie/.test(f.src); }
function lkvOnView(entries){
    for(const e of entries){
        const box = e.target;
        if(!box.isConnected){ lkv.obs.unobserve(box); continue; }
        if(e.isIntersecting && e.intersectionRatio >= 0.5){
            const first = box.dataset.on !== "1";
            lkvActivate(box);
            const v = box.querySelector("video");
            if(v && lkvAutoOn() && v.paused && !v.ended && !v.dataset.userPaused) lkvPlay(v);
            if(!first && lkvIsYt(box) && lkvAutoOn()) lkvYtPost(box, "playVideo");
        }else if(!e.isIntersecting || e.intersectionRatio < 0.2){
            lkvSysPause(box.querySelector("video"));
            if(lkvIsYt(box)) lkvYtPost(box, "pauseVideo");
        }
    }
}

function lkvPaintFile(){
    const b = document.getElementById("lkvFileItem"); if(!b) return;
    const on = lkvFileOn();
    b.firstChild.textContent = on ? "📄 ファイルのプレビュー：ON" : "📄 ファイルのプレビュー：OFF";
    b.querySelector("small").textContent = on ? "ドライブに置いた書類・PDF・音声を、その場で見られます（いやな人は、ここを押すとオフに）" : "プレビューは出ません。リンクだけです（ここを押すとオンに）";
}
function lkvPaintSetting(){
    const b = document.getElementById("lkvSetItem"); if(!b) return;
    const on = lkvAutoSetting();
    b.firstChild.textContent = on ? "▶ 動画リンクの自動再生：ON" : "⏸ 動画リンクの自動再生：OFF";
    b.querySelector("small").textContent = on ? "動画のリンクを、音つきで自動再生します（見えている間だけ。いやな人は、ここを押すとオフに）" : "プレビューは出ますが、押して再生します（ここを押すとオンに）";
}

function initLkVideo(){
    if(!("IntersectionObserver" in window)) return;
    lkv.obs = new IntersectionObserver(lkvOnView, {threshold:[0, 0.2, 0.5, 0.8]});
    const css = document.createElement("style");
    css.textContent = ".lv-box{margin-top:8px;border-radius:12px;overflow:hidden;background:#000;max-width:min(100%,420px)}.lv-box .lv-ph{padding:18px 12px;text-align:center;color:#9aa8c2;font-size:13px;background:#0b1020}" +
        ".lv-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px}.lv-grid[data-n]:not([data-n=\"1\"]){grid-template-columns:repeat(2,minmax(0,1fr));max-width:min(100%,640px)}.lv-grid .lv-box{margin-top:0;max-width:none}.lv-grid[data-n=\"1\"] .lv-box{max-width:min(100%,420px)}.lv-doc .lv-frame{aspect-ratio:3/4;max-height:60vh}.lv-audio{display:block;width:100%;background:#0b1020}" +
        ".lv-video{display:block;width:100%;max-height:60vh;background:#000}.lv-frame{display:block;width:100%;aspect-ratio:16/9;border:0;background:#000}";
    document.head.appendChild(css);
    const root = document.getElementById("messages");
    if(root){
        lkv.mo = new MutationObserver(() => { clearTimeout(lkv.timer); lkv.timer = setTimeout(lkvDecorate, 250); });
        lkv.mo.observe(root, {childList:true, subtree:true});
    }
    document.addEventListener("pause", (e) => { const v = e.target; if(!v || !v.classList || !v.classList.contains("lv-video")) return; if(v.__byView){ v.__byView = false; return; } if(!v.ended){ v.dataset.userPaused = "1"; const m = lkv.mem.get(v.currentSrc || v.src) || {}; m.up = true; lkv.mem.set(v.currentSrc || v.src, m); } }, true);
    document.addEventListener("volumechange", (e) => { const v = e.target; if(v && v.classList && v.classList.contains("lv-video") && !v.__self) v.__needUnmute = false; }, true);
    ["pointerdown", "touchend", "keydown", "click"].forEach((t) => document.addEventListener(t, lkvUnmuteAll, {capture:true, passive:true}));
    document.addEventListener("play", (e) => { const v = e.target; if(v && v.classList && v.classList.contains("lv-video")) { delete v.dataset.userPaused; const m = lkv.mem.get(v.currentSrc || v.src); if(m) m.up = false; } }, true);
    document.addEventListener("visibilitychange", () => {
        if(document.hidden) document.querySelectorAll(".lv-video").forEach(lkvSysPause);
    });
    const set = document.getElementById("lkvSetItem");
    if(set){
        set.addEventListener("click", () => {
            try{ localStorage.setItem(LKV_KEY, lkvAutoSetting() ? "0" : "1"); }catch(_e){}
            lkvPaintSetting();
            if(!lkvAutoSetting()) document.querySelectorAll(".lv-video").forEach(lkvSysPause);
        });
        lkvPaintSetting();
    }
    const fset = document.getElementById("lkvFileItem");
    if(fset){ fset.addEventListener("click", () => { try{ localStorage.setItem(LKV_FILE_KEY, lkvFileOn() ? "0" : "1"); }catch(_e){} lkvPaintFile(); }); lkvPaintFile(); }
    window.ARElkv = {kind:lkvKind, decorate:lkvDecorate, auto:lkvAutoOn, mem:lkv.mem};
    lkvDecorate();
}
