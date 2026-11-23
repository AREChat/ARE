"use strict";
// ===== 通知の音（アラーム音）・毎朝7時のアラーム・未読のお知らせ =====
// ・通知の音は「アラーム音」（ピピピッ）。音量は小さめ（近所迷惑にならない程度）。スマホのマナーモード・音量ゼロのときは、もちろん鳴りません。
// ・管理者と「家庭」の人は、通知は ミュート（音なし・ポップアップだけ）。毎朝7時のアラームも 鳴らしません。
// ・毎朝7時：ARE を開いている間は、画面のポップアップ＋アラーム音。閉じている間は、サーバーからの通知（プッシュ）で知らせます
//   （サーバー側：cron「morning-alarm-push」＋ Edge Function「morning-push」。sql/morning_alarm_push_v1.sql）。
// ・未読があるとき：ARE を開いたとき／しばらくぶりに画面に戻ったとき、「未読が◯件あります」のポップアップを出します。
// ・ブラウザやOSの仕様で、閉じている間のプッシュ通知の「音」だけは、端末のふつうの通知音になります（Webアプリでは音を選べないため）。
//   そのかわり、ミュートの人には音もバイブも出さない通知（silent）にしています（sw.js）。

const al = {ctx:null, unreadAt:0, firstDone:false, backFlag:false, hiddenAt:0, timer:0, prefTimer:0};

/** 通知をミュートにする人か（管理者・家庭） */
function alMuted(){
    try{
        if(typeof feat !== "undefined" && feat.isAdmin) return true;
        const f = typeof segSt !== "undefined" && segSt.flags;
        if(f && (f.is_admin || f.quick === "q1" || f.restricted === true)) return true;
    }catch(_e){ /* 判断できなければ ミュートにしない */ }
    return false;
}

function alCtx(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    if(!al.ctx){ try{ al.ctx = new AC(); }catch(_e){ return null; } }
    return al.ctx;
}
/** ピピピッ（アラーム音）。kind: "msg"＝みじかい（新着・未読） / "morning"＝朝のアラーム（長め）。ミュートの人は鳴らさない */
function alPlay(kind){
    if(alMuted()) return;
    try{
        const ctx = alCtx(); if(!ctx) return;
        if(ctx.state === "suspended") ctx.resume().catch(() => {});
        const t0 = ctx.currentTime + 0.03;
        // 1回分：高い音を ピ・ピ・ピ・ピッ と4つ
        const burst = (at) => [0, 0.2, 0.4, 0.6].forEach((dt, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = "sine"; o.frequency.value = i === 3 ? 1318 : 1046;
            const s = at + dt, e = s + 0.12;
            g.gain.setValueAtTime(0.0001, s);
            g.gain.exponentialRampToValueAtTime(0.16, s + 0.015);   // 音量は小さめ（最大でも 0.16）
            g.gain.exponentialRampToValueAtTime(0.0001, e);
            o.connect(g); g.connect(ctx.destination);
            o.start(s); o.stop(e + 0.02);
        });
        if(kind === "morning"){ burst(t0); burst(t0 + 1.4); burst(t0 + 2.8); burst(t0 + 4.2); }
        else burst(t0);
    }catch(_e){ /* 音が鳴らせない端末・まだ操作されていない画面では、そのまま黙る */ }
}

// ---------- 画面の上のポップアップ（新着と同じ見た目）----------
function alPopup(title, body, onClick, ms){
    try{
        if(nf.pop) nf.pop.remove();
        const pop = document.createElement("button");
        pop.type = "button"; pop.className = "nf-pop";
        pop.innerHTML = '<strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(body) + '</span>';
        pop.addEventListener("click", () => { pop.remove(); if(nf.pop === pop) nf.pop = null; if(onClick) onClick(); });
        document.body.appendChild(pop); nf.pop = pop;
        clearTimeout(nf.timer);
        nf.timer = setTimeout(() => { pop.remove(); if(nf.pop === pop) nf.pop = null; }, ms || 8000);
    }catch(_e){ /* 出せなくても続ける */ }
}
/** 画面を見ていないとき、サーバーのプッシュがオフの端末でだけ、ブラウザの通知も出す */
function alBrowserNotify(title, body, tag){
    try{
        let pushOn = false;
        try{ pushOn = typeof pushState === "function" && pushState() === "on"; }catch(_e){ pushOn = false; }
        if(pushOn || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
        const n = new Notification(title, {body, tag, silent: alMuted(), icon:"icon-192.png"});
        n.onclick = () => { window.focus(); n.close(); };
    }catch(_e){ /* 通知できない端末 */ }
}

// ---------- 未読のお知らせ ----------
function alUnreadNotify(){
    const total = typeof nfTotal === "function" ? nfTotal() : 0;
    if(!total) return;
    const now = Date.now();
    if(now - al.unreadAt < 10 * 60 * 1000) return;   // 10分以内に出したばかりなら、重ねて出さない
    al.unreadAt = now;
    const first = Object.keys(feat.unread).filter((id) => feat.unread[id] > 0)[0];
    const msg = "未読のメッセージが " + total + " 件あります";
    alPopup("📨 未読があります", msg, () => { if(first && typeof nfOpenRoom === "function") nfOpenRoom(first); }, 9000);
    alPlay("msg");
    alBrowserNotify("ARE：未読があります", msg, "unread-summary");
}

// ---------- 毎朝7時のアラーム（ARE を開いているとき）----------
function alDay(){ const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function alMorningKey(){ return "are_morning_" + (state.user ? state.user.id : ""); }
/** force：サーバーからの朝の通知を受け取ったとき（時間の判定は しない） */
function alMorningCheck(force){
    if(!state.user || alMuted()) return;
    const d = new Date(), mins = d.getHours() * 60 + d.getMinutes();
    if(!force && !(mins >= 420 && mins < 450)) return;   // 7:00〜7:29 のあいだだけ（それより遅く開いたときは 鳴らさない）
    let last = ""; try{ last = localStorage.getItem(alMorningKey()) || ""; }catch(_e){ /* 保存できなくても続ける */ }
    if(last === alDay()) return;   // きょうは もう知らせた
    try{ localStorage.setItem(alMorningKey(), alDay()); }catch(_e){ /* 何もしない */ }
    const total = typeof nfTotal === "function" ? nfTotal() : 0;
    const body = total ? "未読のメッセージが " + total + " 件あります。今日も いちにち よろしくね。" : "今日も ARE で、いいいちにちを！";
    alPopup("☀️ おはようございます（朝7時）", body, null, 15000);
    alPlay("morning");
    alBrowserNotify("☀️ おはようございます", body, "morning-alarm");
}

// ---------- ミュートかどうかを、サービスワーカー（閉じている間の通知）にも伝える ----------
function alSavePrefs(){
    try{
        if(!("caches" in window) || !state.user) return;
        const body = JSON.stringify({muted: alMuted(), at: Date.now()});
        caches.open("are-prefs").then((c) => c.put(new Request(new URL("are-prefs.json", location.href).href), new Response(body, {headers:{"Content-Type":"application/json"}}))).catch(() => {});
    }catch(_e){ /* 保存できなくても続ける */ }
}

function initAlarm(){
    // 音は「いちど画面を触ったあと」でないと鳴らせないので、最初のタッチ／クリックで準備しておく
    const unlock = () => { const c = alCtx(); if(c && c.state === "suspended") c.resume().catch(() => {}); };
    ["pointerdown", "keydown", "touchstart"].forEach((t) => document.addEventListener(t, unlock, {once:true, passive:true}));

    // 新着メッセージのポップアップが出るとき、アラーム音も鳴らす（ミュートの人は鳴らない）
    if(typeof nfPopup === "function"){
        const origPopup = nfPopup;
        nfPopup = function(room, m){
            const r = origPopup.apply(this, arguments);
            try{ if(!(m && typeof nfSilencedSender === "function" && nfSilencedSender(m.sender_id))) alPlay("msg"); }catch(_e){ /* 何もしない */ }
            return r;
        };
    }
    // 未読の数え直しが終わったあと：開いた直後／しばらくぶりに戻ったときに、未読のお知らせを出す
    if(typeof nfRecount === "function"){
        const origRecount = nfRecount;
        nfRecount = async function(){
            const r = await origRecount.apply(this, arguments);
            try{
                if(!al.firstDone && (state.rooms || []).length){ al.firstDone = true; alUnreadNotify(); }
                else if(al.backFlag){ al.backFlag = false; alUnreadNotify(); }
            }catch(_e){ /* 何もしない */ }
            return r;
        };
    }
    document.addEventListener("visibilitychange", () => {
        if(document.hidden){ al.hiddenAt = Date.now(); return; }
        if(al.hiddenAt && Date.now() - al.hiddenAt > 5 * 60 * 1000) al.backFlag = true;   // 5分以上はなれていた
        alMorningCheck(false); alSavePrefs();
    });
    // 朝7時：20秒ごとに時刻を見る（ARE を開いている間だけ動く）
    al.timer = setInterval(() => alMorningCheck(false), 20000);
    feat.timers.push(al.timer);
    alMorningCheck(false);
    // サーバーからの朝の通知（プッシュ）が、開いている画面に届いたとき：ここでポップアップ＋音を出す
    try{
        if("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (event) => {
            const d = event.data || {};
            if(d.type === "morning-alarm") alMorningCheck(true);
            else if(d.type === "alarm-sound") alPlay("msg");
        });
    }catch(_e){ /* 何もしない */ }
    // ミュートかどうかの記録（区分がわかるのは、起動して少しあと）
    alSavePrefs();
    [3000, 10000, 30000].forEach((ms) => setTimeout(alSavePrefs, ms));
    al.prefTimer = setInterval(alSavePrefs, 10 * 60 * 1000);
    feat.timers.push(al.prefTimer);
}
