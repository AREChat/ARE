"use strict";
// ===== 通知まわり：閉じていても届くプッシュ通知・チャットごとのミュート・ホーム画面に追加 =====
// ・プッシュ通知は Web Push（無料）。サーバー側は Supabase の関数（send-push）が送ります。
// ・iPhone / iPad は「ホーム画面に追加」したアプリからだけ受け取れます（iOS の決まり）。
// ・ミュートは「そのチャットの通知だけ止める」機能です。メッセージ自体は今までどおり届きます。
// ・鍵（公開鍵）はここに書いてあるものを使います。秘密鍵はサーバー側だけにあります。

const PUSH_VAPID_PUBLIC = "BAlH0oPT2cFnXhNuqviP5X4w3IAIT5uv8PLMv3qa15Gh136Xlhv1CNwXBRYCVRzfFWlzjoWAwugxEYFerEHjvK4";
feat.push = {reg:null, sub:null, showBody:true, mutes:new Set(), installEvent:null, ready:false, quiet:{enabled:false,start:"22:00",end:"08:00",timezone:""}};

function pushIsIos(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); }
function pushIsStandalone(){
    try{ return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }catch(_e){ return false; }
}
function pushSupported(){ return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }

// この端末に出ている、そのチャットの通知（ポップアップ）を消す。既読にしたときに呼ぶ
function pushCloseRoomNotifications(roomId){
    if(!roomId || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
        if(!reg || !reg.getNotifications) return [];
        return reg.getNotifications({tag:"room-" + roomId});
    }).then((list) => { (list || []).forEach((n) => { try{ n.close(); }catch(_e){} }); }).catch(() => {});
}

// 他の端末（PC／スマホなど、同じ人の別デバイス）に出ている、そのチャットの通知を消してもらう
async function pushClearRoomOnOtherDevices(roomId){
    if(!roomId || !state.user) return;
    try{
        const client = requireClient();
        await client.functions.invoke("clear-push", {body:{room_id:roomId}});
    }catch(_e){ /* 届かなくても致命的ではない（次に新着が来れば通知は入れ替わる） */ }
}

function pushKeyBytes(b64){
    const pad = "=".repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(raw.length);
    for(let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

/** いまの状態：unsupported / need-install / denied / off / on */
function pushState(){
    if(!pushSupported()) return pushIsIos() && !pushIsStandalone() ? "need-install" : "unsupported";
    if(pushIsIos() && !pushIsStandalone()) return "need-install";
    if(Notification.permission === "denied") return "denied";
    return feat.push.sub ? "on" : "off";
}

async function pushRegister(){
    if(!("serviceWorker" in navigator)) return null;
    try{
        feat.push.reg = await navigator.serviceWorker.register("sw.js", {updateViaCache: "none"});
        if(pushSupported()){
            const ready = await navigator.serviceWorker.ready;
            feat.push.reg = ready || feat.push.reg;
            feat.push.sub = await feat.push.reg.pushManager.getSubscription();
        }
    }catch(error){ console.warn("[ARE push] service worker", error); }
    feat.push.ready = true;
    return feat.push.reg;
}

async function pushEnable(){
    const st = pushState();
    if(st === "need-install") throw new Error("iPhone / iPad では、先に「ホーム画面に追加」してから開き直してください。");
    if(st === "unsupported") throw new Error("このブラウザは、閉じている間のプッシュ通知に対応していません。");
    if(st === "denied") throw new Error("通知がブロックされています。ブラウザの設定で、このサイトの通知を「許可」にしてください。");
    const perm = await Notification.requestPermission();
    if(perm !== "granted") throw new Error("通知は許可されませんでした。");
    const reg = feat.push.reg || await pushRegister();
    if(!reg) throw new Error("通知の準備ができませんでした。");
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:pushKeyBytes(PUSH_VAPID_PUBLIC)});
    const j = sub.toJSON();
    const row = {endpoint:sub.endpoint, user_id:state.user.id, p256dh:j.keys.p256dh, auth:j.keys.auth, show_body:feat.push.showBody, ua:navigator.userAgent.slice(0, 120)};
    const res = await requireClient().from("push_subscriptions").upsert(row, {onConflict:"endpoint"});
    if(res.error){ try{ await sub.unsubscribe(); }catch(_e){} throw res.error; }
    feat.push.sub = sub;
    try{ localStorage.setItem("are_push_" + state.user.id, "1"); localStorage.removeItem("are_push_optout_" + state.user.id); }catch(_e){}
}

// 初期値はオン：自分でオフにしていない人は、最初の操作（タップ）で自動的にオンにする
// （ブラウザの決まりで、通知の許可は画面を触ったときにしか聞けません）
let pushAutoTried = 0;
async function pushAutoOn(){
    if(pushAutoTried >= 3 || !state.user || feat.push.sub) return;
    try{ if(localStorage.getItem("are_push_optout_" + state.user.id)) return; }catch(_e){ return; }
    const st = pushState();
    if(st !== "off") return;
    pushAutoTried++;
    try{ await pushEnable(); pushBarPaint(); }catch(_e){ /* 断られたら何もしない（また触ったときに、聞きなおす。3回まで） */ }
}
function pushAutoArm(){
    if(!pushSupported() || (typeof Notification !== "undefined" && Notification.permission === "denied")) return;
    if(typeof Notification !== "undefined" && Notification.permission === "granted"){ pushAutoOn(); return; }
    // ブラウザの決まりで、許可を聞けるのは「画面を触った直後」だけ。聞かれても閉じられたときは、次に触ったときにもう一度聞く（3回まで）
    const again = () => {
        if(pushAutoTried >= 3 || feat.push.sub || Notification.permission !== "default"){ document.removeEventListener("click", again, true); return; }
        pushAutoOn();
    };
    document.addEventListener("click", again, true);
}

// ===== 通知の「いまの状態」を見せる帯と、診断 =====
function pushBarPaint(){
    let bar = document.getElementById("pushBar");
    let st = "on";
    try{ st = state.user ? pushState() : "on"; }catch(_e){ st = "on"; }
    let optout = false, hushed = false;
    try{ optout = !!(state.user && localStorage.getItem("are_push_optout_" + state.user.id)); hushed = Date.now() - Number(localStorage.getItem("are_pushbar_hush") || 0) < 3 * 86400000; }catch(_e){}
    if(st === "on" || optout || hushed || st === "unsupported"){ if(bar) bar.remove(); return; }
    const text = {off:"🔔 通知がオフです。オンにすると、閉じていても新着・着信が届きます。", denied:"⛔ 通知がブロックされています。直さないと、新着・着信が届きません。", "need-install":"📲 iPhone / iPad は「ホーム画面に追加」すると通知が届きます。"}[st] || "";
    const btn = {off:"オンにする", denied:"なおし方", "need-install":"やり方"}[st] || "設定";
    if(!bar){
        bar = document.createElement("div"); bar.id = "pushBar"; bar.setAttribute("role", "status");
        bar.style.cssText = "position:fixed;left:6px;right:6px;z-index:41;background:#2b2440;color:#fff;font-size:12px;line-height:1.3;border:1px solid #8a6bff;border-radius:10px;padding:4px 6px;display:flex;gap:6px;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none";
        bar.innerHTML = '<span id="pushBarText" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span><button type="button" id="pushBarGo" class="button" style="padding:2px 10px;font-size:12px;min-height:0;flex:none"></button><button type="button" id="pushBarX" class="button-secondary" aria-label="とじる" style="padding:2px 8px;font-size:12px;min-height:0;flex:none">✕</button>';
        document.body.appendChild(bar);
        bar.querySelector("#pushBarGo").style.pointerEvents = "auto"; bar.querySelector("#pushBarX").style.pointerEvents = "auto";
        bar.querySelector("#pushBarGo").addEventListener("click", async () => {
            const cur = pushState();
            if(cur === "off"){ try{ await pushEnable(); showToast("通知をオンにしました。"); }catch(error){ showToast(featError(error)); openPushSettings(); } pushBarPaint(); }
            else openPushSettings();
        });
        bar.querySelector("#pushBarX").addEventListener("click", () => { try{ localStorage.setItem("are_pushbar_hush", String(Date.now())); }catch(_e){} bar.remove(); });
    }
    bar.style.top = (document.getElementById("guestBar") ? 34 : 6) + "px";
    bar.querySelector("#pushBarText").textContent = text;
    bar.querySelector("#pushBarGo").textContent = btn;
}

/** 通知が届くための条件を、ひとつずつ調べる（○なら大丈夫、×ならなおし方つき） */
async function pushDiagnose(){
    const out = [];
    const add = (ok, label, fix) => out.push({ok, label, fix: ok ? "" : (fix || "")});
    const ios = pushIsIos(), stand = pushIsStandalone();
    const android = /Android/i.test(navigator.userAgent);
    if(ios) add(stand, "ホーム画面のアプリとして開いている", "Safari の「共有」ボタン →「ホーム画面に追加」を押し、できたアイコンから開いてください（iPhone の決まりです。iOS 16.4 以上が必要）。");
    add(pushSupported(), "この端末・ブラウザは、閉じている間の通知に対応している", ios ? "iOS 16.4 以上に更新し、ホーム画面のアプリとして開いてください。" : "Chrome・Edge・Firefox・Safari など、新しいブラウザで開いてください（LINE などのアプリ内ブラウザは非対応です）。");
    const perm = typeof Notification !== "undefined" ? Notification.permission : "denied";
    add(perm === "granted", "通知が「許可」されている（いま：" + ({granted:"許可", denied:"ブロック", default:"まだ聞いていない"}[perm] || perm) + "）",
        perm === "denied" ? (ios ? "「設定」アプリ → 通知 → ARE → 「通知を許可」をオンにしてください。" : android ? "Chrome の ⋮ → 設定 → サイトの設定 → 通知 → このサイトを「許可」にしてください。（アプリの場合は、端末の設定 → アプリ → ARE／Chrome → 通知 をオン）" : "アドレスバーの 🔒（または ⓘ）→ 通知 → 「許可」にしてください。") : "下の「通知をオンにする」を押して、出てきた確認で「許可」を選んでください。");
    add(!!feat.push.sub, "この端末が、通知の受け取りに登録されている", "「通知をオンにする」を押してください。");
    let saved = false;
    try{
        if(feat.push.sub){
            const r = await requireClient().from("push_subscriptions").select("endpoint").eq("endpoint", feat.push.sub.endpoint).maybeSingle();
            saved = !!(r && r.data);
        }
    }catch(_e){}
    add(saved, "サーバーにも、この端末が登録されている", "いったん「通知をオフにする」→「通知をオンにする」で、登録し直してください。");
    let sw = false;
    try{ const reg = await navigator.serviceWorker.getRegistration(); sw = !!(reg && reg.active); }catch(_e){}
    add(sw, "通知を受け取る部品（サービスワーカー）が動いている", "ページを一度「強く再読み込み」（またはアプリを閉じて開き直し）してください。");
    try{
        const q = feat.push.quiet;
        if(q && q.enabled){
            const now = new Date(), hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
            const inq = q.start > q.end ? (hm >= q.start || hm < q.end) : (hm >= q.start && hm < q.end);
            add(!inq, "「おやすみ時間」ではない（設定：" + q.start + "〜" + q.end + "）", "いまは「おやすみ時間」のため、通知は送られません。下の設定を変えてください。");
        }
    }catch(_e){}
    return out;
}
function pushDiagHtml(list){
    return '<div class="meta" style="display:grid;gap:4px">' + list.map((x) => '<div>' + (x.ok ? "✅ " : "❌ ") + escapeHtml(x.label) + (x.fix ? '<div style="margin:2px 0 0 22px;opacity:.9">👉 ' + escapeHtml(x.fix) + '</div>' : "") + '</div>').join("") + '</div>';
}
async function pushServerTest(){
    const res = await requireClient().functions.invoke("call-push", {body:{test:true}});
    if(res.error) throw new Error("サーバーに届きませんでした。通信のようすを見て、もう一度お試しください。");
    const devs = (res.data && res.data.devices) || [];
    if(!devs.length) return '<div class="meta">❌ サーバーに、あなたの端末の登録が1つもありません。「通知をオンにする」を押してください。</div>';
    return '<div class="meta" style="display:grid;gap:4px">' + devs.map((d) => '<div>' + (d.ok ? "✅ " : "❌ ") + escapeHtml(d.kind) + "：" + (d.ok ? "サーバーからは送れました（その端末に、通知が出るはずです）" : (d.removed ? "この端末の登録が切れていたので、登録を消しました。その端末で「通知をオンにする」を押し直してください" : "送れませんでした（エラー " + (d.status || "?") + "）")) + '</div>').join("") + '</div>';
}

// 着信を「アプリを閉じていても届く」ようにする更新（1台につき1回）。
// ホーム画面のアプリ（PWA）は、閉じている間は動けません。代わりに、サーバーからの通知（プッシュ）で起こします。
// すでにアプリ化している人も、この更新で自動的に切りかわります（通知の許可は、画面を触ったときに1回だけ聞きます）
async function pushBackgroundUpgrade(force){
    if(!pushSupported() || !state.user) return;
    const key = "are_bg_call_v2_" + state.user.id;
    try{
        if(!force && localStorage.getItem(key) === "1") return;
        if(localStorage.getItem("are_push_optout_" + state.user.id)) return;
    }catch(_e){ return; }
    if(typeof Notification !== "undefined" && Notification.permission === "denied") return;
    const run = async () => {
        try{
            await pushEnable();
            try{ localStorage.setItem(key, "1"); }catch(_e){}
            if(pushIsStandalone() || force) showToast("アプリを閉じていても、着信と新着が届くようにしました。");
        }catch(_e){ /* 断られた・非対応のときは何もしない（次に開いたときに、もう一度やってみる） */ }
    };
    if(Notification.permission === "granted"){ await run(); return; }
    const once = () => { document.removeEventListener("click", once, true); run(); };
    document.addEventListener("click", once, true);
}

async function pushDisable(){
    const sub = feat.push.sub;
    feat.push.sub = null;
    try{ localStorage.removeItem("are_push_" + state.user.id); }catch(_e){}
    if(!sub) return;
    try{ await requireClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint); }catch(_e){}
    try{ await sub.unsubscribe(); }catch(_e){}
}

async function pushLoadPrefs(){
    try{
        const res = await requireClient().from("push_subscriptions").select("endpoint,show_body");
        if(!res.error && feat.push.sub){
            const mine = (res.data || []).find((r) => r.endpoint === feat.push.sub.endpoint);
            if(mine) feat.push.showBody = mine.show_body !== false;
            else if(localStorage.getItem("are_push_" + state.user.id)) await pushEnable().catch(() => {});   // サーバー側から消えていたら登録し直す
        }
    }catch(_e){}
    try{
        const result = await requireClient().from("notification_preferences").select("quiet_enabled,quiet_start,quiet_end,timezone").maybeSingle();
        if(!result.error && result.data) feat.push.quiet = {enabled:result.data.quiet_enabled,start:String(result.data.quiet_start).slice(0,5),end:String(result.data.quiet_end).slice(0,5),timezone:result.data.timezone || ""};
    }catch(_e){}
}

async function pushSetBody(on){
    feat.push.showBody = Boolean(on);
    if(!feat.push.sub) return;
    const res = await requireClient().from("push_subscriptions").update({show_body:feat.push.showBody}).eq("endpoint", feat.push.sub.endpoint);
    if(res.error) throw res.error;
}

async function pushSaveQuiet(node){
    const box = el.profileSheet;
    const enabled = Boolean(box.querySelector('[data-t="push:quiet"]')?.checked);
    const start = tpValue(box, "quiet-start") || feat.push.quiet.start || "22:00";
    const end = tpValue(box, "quiet-end") || feat.push.quiet.end || "08:00";
    if(start === end){ showToast("開始と終了が同じ時刻です。ちがう時刻にしてください。"); return; }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
    const button = box.querySelector('[data-t="push:quiet-save"]');
    if(button) button.disabled = true;
    try{
        const result = await requireClient().from("notification_preferences").upsert({user_id:state.user.id,quiet_enabled:enabled,quiet_start:start,quiet_end:end,timezone,updated_at:new Date().toISOString()},{onConflict:"user_id"});
        if(result.error) throw result.error;
    }finally{
        if(button) button.disabled = false;
    }
    feat.push.quiet = {enabled,start,end,timezone};
    tpNote(box.querySelector("[data-quiet-note]"), start, end, true, enabled ? "この時間は通知を送りません" : "いまはオフです");
    showToast(enabled ? "おやすみ時間を " + start + "〜" + end + " に決定しました。" : "おやすみ時間はオフです（時刻 " + start + "〜" + end + " は保存しました）。");
}

// ===== ミュート =====
async function muteLoad(){
    try{
        const res = await requireClient().from("room_mutes").select("room_id");
        if(!res.error) feat.push.mutes = new Set((res.data || []).map((r) => r.room_id));
    }catch(_e){}
    muteButtonPaint();
    if(typeof renderRooms === "function") try{ renderRooms(); }catch(_e){}
}
function isMuted(roomId){ return feat.push.mutes.has(roomId); }

async function muteSet(roomId, on){
    if(!roomId) return;
    const t = requireClient().from("room_mutes");
    const res = on ? await t.upsert({user_id:state.user.id, room_id:roomId}, {onConflict:"user_id,room_id"}) : await t.delete().eq("room_id", roomId).eq("user_id", state.user.id);
    if(res.error) throw res.error;
    if(on) feat.push.mutes.add(roomId); else feat.push.mutes.delete(roomId);
    muteButtonPaint();
    try{ renderRooms(); }catch(_e){}
}

function muteButtonPaint(){
    const b = document.getElementById("muteBtn");
    if(!b) return;
    const room = state.currentRoom;
    b.hidden = !room;
    if(!room) return;
    const m = isMuted(room.id);
    b.textContent = m ? "🔕" : "🔔";
    b.title = m ? "このチャットの通知を再開" : "このチャットの通知を止める";
    b.setAttribute("aria-label", b.title);
    b.setAttribute("aria-pressed", m ? "true" : "false");
}

function roomNameById(id){
    const r = (state.rooms || []).find((x) => x.id === id);
    return r ? roomTitle(r) : "（見つからないチャット）";
}

// ===== 設定画面 =====
function openPushSettings(){
    const st = pushState();
    const stText = {on:"✅ オン（アプリを閉じていても届きます）", off:"⚪ オフ", denied:"⛔ ブラウザでブロック中", "need-install":"📲 先に「ホーム画面に追加」が必要です", unsupported:"❌ このブラウザは未対応"}[st];
    const standalone = pushIsStandalone();
    let install = "";
    if(standalone) install = '<div class="meta">✅ ホーム画面のアプリとして開いています。</div>';
    else if(feat.push.installEvent) install = '<button type="button" data-t="push:install">📲 ホーム画面に追加する</button>';
    else if(pushIsIos()) install = '<div class="meta">📲 iPhone / iPad：Safari の「共有」ボタン →「ホーム画面に追加」を押し、ホーム画面のアイコンから開いてください。</div>';
    else install = '<div class="meta">📲 ブラウザのメニュー（⋮）から「アプリをインストール」または「ホーム画面に追加」を選べます。</div>';
    const muted = Array.from(feat.push.mutes);
    openSheet(toolHead("🔔 通知・ホーム画面", "アプリを閉じていても、新着をお知らせします（無料）") +
        '<div class="meta">状態：' + stText + '</div>' +
        '<h4 style="margin:10px 0 4px">通知が来ないとき（診断）</h4><div data-push-diag class="meta">調べています…</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="push:servertest">📨 サーバーからテスト送信（登録している全部の端末）</button></div><div data-push-testout></div>' +
        '<div class="row">' + (st === "on"
            ? '<button type="button" data-t="push:off">通知をオフにする</button><button type="button" class="button-secondary" data-t="push:test">テスト通知</button>'
            : '<button type="button" data-t="push:on"' + (st === "unsupported" || st === "denied" ? " disabled" : "") + '>通知をオンにする</button>') + '</div>' +
        '<label class="row" style="gap:8px"><input type="checkbox" data-t="push:body"' + (feat.push.showBody ? " checked" : "") + '> 通知に本文を表示する（オフだと「新しいメッセージ」とだけ表示）</label>' +
        '<h4 style="margin:12px 0 4px">おやすみ時間</h4><label class="row" style="gap:8px"><input type="checkbox" data-t="push:quiet"' + (feat.push.quiet.enabled ? " checked" : "") + '> この時間はプッシュ通知を送らない</label>' +
        '<div class="tp-box">' + tpHtml("quiet-start", "開始", feat.push.quiet.start, "22:00") + tpHtml("quiet-end", "終了", feat.push.quiet.end, "08:00") +
        '<div class="meta tp-note" data-quiet-note></div><button type="button" class="button tp-ok" data-t="push:quiet-save">決定</button></div>' +
        '<div class="meta">端末のタイムゾーン：' + escapeHtml(feat.push.quiet.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo") + '</div>' +
        '<h4 style="margin:12px 0 4px">ホーム画面に追加</h4>' + install +
        '<h4 style="margin:12px 0 4px">起動と同時に、裏で受けとる</h4>' +
        '<div class="meta">・スマホ／タブレット：通知をオンにして「ホーム画面に追加」しておけば、アプリを閉じていても着信・新着が届きます（次に開いたとき、自動でこの設定をやりなおします）。<br>・パソコン（Chrome／Edge）：「📲 アプリとして追加」→ ブラウザで about://apps を開き、ARE を右クリック →「ログイン時にアプリを開く（Start app when you sign in）」。さらに、Chrome の設定 → システム →「Google Chrome を閉じてもバックグラウンド アプリの処理を続行する」をオンにすると、画面を閉じていても通知が届きます。<br>・この「ログイン時に開く」は、パソコンごとのブラウザの設定です。ARE のページから自動で切りかえることは、ブラウザの決まりでできません。</div>' +
        '<h4 style="margin:12px 0 4px">ミュート中のチャット</h4>' +
        (muted.length ? muted.map((id) => '<div class="row"><span>🔕 ' + escapeHtml(roomNameById(id)) + '</span><button type="button" class="button-secondary" data-t="push:unmute" data-room="' + escapeHtml(id) + '">再開</button></div>').join("") : '<div class="meta">ありません（チャット画面の 🔔 で切り替えます）</div>') +
        toolClose());
    // 時刻は、「決定」ボタンを押したときに保存する。チェック（オン／オフ）は、押したらすぐ保存する
    pushDiagnose().then((list) => { const box = el.profileSheet.querySelector("[data-push-diag]"); if(box) box.innerHTML = pushDiagHtml(list); }).catch(() => {});
    const quietNote = () => tpNote(el.profileSheet.querySelector("[data-quiet-note]"), tpValue(el.profileSheet, "quiet-start"), tpValue(el.profileSheet, "quiet-end"), false);
    tpNote(el.profileSheet.querySelector("[data-quiet-note]"), feat.push.quiet.start, feat.push.quiet.end, true, feat.push.quiet.enabled ? "この時間は通知を送りません" : "いまはオフです");
    tpBind(el.profileSheet, ["quiet-start", "quiet-end"], quietNote);
    const quietBox = el.profileSheet.querySelector('[data-t="push:quiet"]');
    if(quietBox) quietBox.addEventListener("change", () => { pushSaveQuiet().catch((error) => showToast(featError(error))); });
}

async function onPushAction(action, node){
    if(action === "on"){ await pushEnable(); showToast("通知をオンにしました。"); pushBarPaint(); openPushSettings(); }
    else if(action === "off"){ try{ localStorage.setItem("are_push_optout_" + state.user.id, "1"); }catch(_e){} await pushDisable(); showToast("通知をオフにしました。"); openPushSettings(); }
    else if(action === "body"){ await pushSetBody(node.checked); showToast(node.checked ? "本文を表示します。" : "本文を隠します。"); }
    else if(action === "quiet-save"){ await pushSaveQuiet(node); }
    else if(action === "quiet"){ feat.push.quiet.enabled = node.checked; }
    else if(action === "unmute"){ await muteSet(node.dataset.room, false); openPushSettings(); }
    else if(action === "servertest"){
        const out = el.profileSheet.querySelector("[data-push-testout]");
        if(out) out.innerHTML = '<div class="meta">送っています…</div>';
        const html = await pushServerTest();
        if(out) out.innerHTML = html;
    }
    else if(action === "test"){
        const reg = feat.push.reg || await navigator.serviceWorker.ready;
        await reg.showNotification("ARE テスト通知", {body:"このように表示されます。", icon:"icon-192.png", tag:"are-test"});
    }else if(action === "install"){
        const ev = feat.push.installEvent;
        if(!ev) return;
        ev.prompt();
        try{ await ev.userChoice; }catch(_e){}
        feat.push.installEvent = null;
        openPushSettings();
    }
}

function pushOpenFromUrl(){
    let id = null;
    try{ id = new URLSearchParams(location.search).get("room"); }catch(_e){}
    if(!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    const room = (state.rooms || []).find((r) => r.id === id);
    if(room){ selectRoom(room, room.partner); history.replaceState(null, "", location.pathname); }
}


// ===== 次回から自動で「裏で受けとれる」状態にする（全ユーザー） =====
// ・通知の登録（アプリを閉じていても着信・新着が届く）を、次に開いたとき自動でやりなおす（pushBackgroundUpgrade）
// ・対応しているブラウザ（Chrome・Edge のインストール済みアプリ）には、「ときどき裏で目ざめる」登録もする
// ・パソコンでは「ログインしたら自動で開く」は 端末ごとのブラウザの設定なので、アプリからは切りかえられません。やり方を1回だけ案内します
function pushIsDesktop(){ return !pushIsIos() && !/Android/i.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && matchMedia("(pointer:coarse)").matches); }
async function pushBgBoot(){
    if(!state.user) return;
    try{
        if(pushIsDesktop() && !localStorage.getItem("are_autostart_tip_v1_" + state.user.id) && typeof alPopup === "function"){
            localStorage.setItem("are_autostart_tip_v1_" + state.user.id, "1");
            alPopup("💻 パソコンの起動と同時に、ARE を裏で開けます", pushIsStandalone() ? "Chrome／Edge で about://apps を開き、ARE を右クリック →「ログイン時にアプリを開く（Start app when you sign in）」を選びます。くわしくは 🔔 通知・ホーム画面 に書いてあります。" : "先に「📲 アプリとして追加」をすると、パソコンを起動したときに自動で開けるようになります。くわしくは 🔔 通知・ホーム画面 に書いてあります。", () => openPushSettings(), 15000);
        }
    }catch(_e){}
    if(!("serviceWorker" in navigator)) return;
    try{ if(navigator.storage && navigator.storage.persist) await navigator.storage.persist(); }catch(_e){}
    try{
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 5000))]);
        if(reg && reg.periodicSync && reg.periodicSync.register) await reg.periodicSync.register("are-bg-refresh", {minInterval: 12 * 3600 * 1000});
    }catch(_e){ /* 対応していない・許可されていないときは、何もしない */ }
}

function initPush(){
    registerTool("push", onPushAction);
    setTimeout(() => { if(feat.push.ready) pushAutoArm(); else pushRegister().then(pushAutoArm); }, 2500);
    setTimeout(() => { pushBackgroundUpgrade(false).catch(() => {}); }, 4500);
    setTimeout(() => { pushBgBoot().catch(() => {}); }, 8000);
    setTimeout(() => { pushBarPaint(); }, 6000);
    setInterval(() => { pushBarPaint(); }, 60000);
    // ヘッダーの 🔔 ボタン
    const head = document.querySelector(".chat-header");
    const anchor = document.getElementById("refreshMessagesButton");
    if(!head || !anchor) throw new Error("チャットの上部が見つかりません。");
    const b = document.createElement("button");
    b.type = "button"; b.id = "muteBtn"; b.className = "button-secondary"; b.hidden = true; b.textContent = "🔔";
    b.addEventListener("click", () => { if(state.currentRoom) runTool(() => muteSet(state.currentRoom.id, !isMuted(state.currentRoom.id)).then(() => showToast(isMuted(state.currentRoom.id) ? "このチャットの通知を止めました。" : "このチャットの通知を再開しました。"))); });
    head.insertBefore(b, anchor);
    addRoomHook(() => muteButtonPaint());
    // 画面内ポップアップ・ブラウザ通知もミュートに従う
    if(typeof nfPopup === "function"){
        const orig = nfPopup;
        nfPopup = function(room, m){ if(room && isMuted(room.id)) return; return orig.apply(this, arguments); };
    }
    // ホーム画面に追加
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); feat.push.installEvent = e; });
    window.addEventListener("appinstalled", () => { feat.push.installEvent = null; setTimeout(() => { pushBackgroundUpgrade(true).catch(() => {}); }, 1500); });
    // 通知をタップして開いたとき
    if("serviceWorker" in navigator){
        navigator.serviceWorker.addEventListener("message", (e) => {
            const d = e.data || {};
            if(d.type === "open-room" && d.room){ const r = (state.rooms || []).find((x) => x.id === d.room); if(r) selectRoom(r, r.partner); }
        });
    }
    const orig2 = renderRooms;
    let opened = false;
    renderRooms = function(){ orig2.apply(this, arguments); if(!opened && (state.rooms || []).length){ opened = true; pushOpenFromUrl(); } };
    pushRegister().then(pushLoadPrefs);
    muteLoad();
    if(state.rooms && state.rooms.length){ opened = true; pushOpenFromUrl(); }
}
