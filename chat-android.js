"use strict";
// ===== Android アプリ（native/android）の中だけで働く：強い通知の登録と、アプリの設定 =====
// ・ふつうのブラウザでは、何も起きません（window.AREAndroid が無いとき）。
// ・通知の流れ：アプリが Firebase（無料）の番号を取る → GAS（AIbot と同じプロジェクトの hub-extra）に登録 →
//   Supabase の通知先の表（push_subscriptions）に「fcm:端末番号:自分の番号の先頭」を1行足す
//   → 新着があると、Supabase の関数が GAS へ頼み、GAS が Firebase 経由で この端末へ送る。
// ・ログアウトするときは、この端末の登録を消す（別の人が使っても、前の人の通知が出ないように）。
const AND = {state: "", msg: "", busy: false, last: 0, device: "", endpoint: ""};

function andIs(){ try{ return !!(window.AREAndroid && window.AREAndroid.isApp()); }catch(_e){ return false; } }
function andHubUrl(){
    const c = window.ARE_CONFIG || {};
    if(c.hubUrl) return c.hubUrl;
    try{ return (feat.aib && feat.aib.shared && feat.aib.shared.url) || ""; }catch(_e){ return ""; }
}
async function andPost(body){
    const url = andHubUrl();
    if(!url) throw new Error("hub_url");
    const r = await fetch(url, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(body)});
    return r.json();
}
async function andToken(){
    const r = await requireClient().auth.getSession();
    return r && r.data && r.data.session ? r.data.session.access_token : "";
}
function andEndpoint(device){ return "fcm:" + device + ":" + String(state.user.id).slice(0, 8); }

async function andSync(force){
    if(!andIs() || AND.busy || !state.user) return;
    if(!force && Date.now() - AND.last < 10 * 60 * 1000 && AND.state === "on") return;
    AND.busy = true; AND.msg = "";
    try{
        try{ if(typeof aibLoadShared === "function") await aibLoadShared(); }catch(_e){ /* AIbot が使えない人は、hubUrl（apikey.js）だけで進む */ }
        const token = await andToken();
        if(!token){ AND.state = "login"; return; }
        const cfg = await andPost({action: "push", op: "config", token});
        if(!cfg || !cfg.ok){ AND.state = "error"; AND.msg = (cfg && cfg.message) || ""; return; }
        if(!cfg.enabled){ AND.state = "hub-off"; return; }
        const device = window.AREAndroid.deviceId();
        const fcm = await new Promise((resolve) => {
            const t = setTimeout(() => resolve(""), 20000);
            window.__areFcm = (tok, err) => { clearTimeout(t); if(err) AND.msg = err; resolve(tok || ""); };
            window.AREAndroid.initFirebase(JSON.stringify(cfg.firebase));
        });
        if(!fcm){ AND.state = "token-fail"; return; }
        const reg = await andPost({action: "push", op: "register", token: await andToken(), device, fcm});
        if(!reg || !reg.ok){ AND.state = "error"; AND.msg = (reg && reg.message) || ""; return; }
        const endpoint = andEndpoint(device);
        const row = {endpoint, user_id: state.user.id, p256dh: "fcm", auth: "fcm", show_body: !(feat.push && feat.push.showBody === false), ua: navigator.userAgent.slice(0, 120)};
        const res = await requireClient().from("push_subscriptions").upsert(row, {onConflict: "endpoint"});
        if(res.error) throw res.error;
        AND.device = device; AND.endpoint = endpoint; AND.state = "on"; AND.last = Date.now();
    }catch(e){
        AND.state = AND.state || "error";
        AND.msg = AND.msg || String((e && e.message) || e).slice(0, 80);
    }finally{ AND.busy = false; }
}

// ログアウトのとき：この端末の登録を消す（失敗しても、ログアウトは止めない）
async function andOff(){
    if(!andIs() || !state.user) return;
    try{
        const device = window.AREAndroid.deviceId();
        await requireClient().from("push_subscriptions").delete().eq("endpoint", andEndpoint(device));
        const token = await andToken();
        if(token) await andPost({action: "push", op: "unregister", token, device});
    }catch(_e){ /* 何もしない */ }
    AND.state = ""; AND.last = 0;
}

const AND_TEXT = {
    on: "✅ つながっています。この端末に、強い通知が届きます。",
    "hub-off": "⚠️ サーバー側（GAS）の通知の準備が、まだ終わっていません。管理者に伝えてください。",
    "token-fail": "⚠️ この端末の通知の番号を取れませんでした。通信を見て、「つなぎなおす」を押してください。",
    login: "⚠️ ログインの確認ができませんでした。いちど ログインしなおしてください。",
    error: "⚠️ つなげませんでした。",
    "": "…まだ つないでいません。"
};

function openAndroidApp(){
    if(!andIs()){ showToast("これは、Android アプリの中でだけ使えます。"); return; }
    let st = {};
    try{ st = JSON.parse(window.AREAndroid.status()); }catch(_e){ st = {}; }
    const mark = (b) => (b ? "✅" : "⚠️");
    openSheet(toolHead("📱 アプリの通知", "この Android アプリで、通知を 強く・確実に 届けるための設定です。") +
        '<div class="admin-card"><b>サーバーとのつながり</b><div class="meta">' + escapeHtml(AND_TEXT[AND.state] || AND_TEXT.error) + (AND.msg ? "（" + escapeHtml(AND.msg) + "）" : "") + '</div>' +
        '<div class="row"><button type="button" data-t="andapp:resync">つなぎなおす</button></div></div>' +
        '<div class="admin-card"><b>この端末の許可</b>' +
        '<div class="meta">' + mark(st.notif) + ' 通知の許可</div>' +
        '<div class="meta">' + mark(st.battery) + ' 電池の節約から はずす（画面を消したあとの おくれを防ぐ）</div>' +
        '<div class="meta">' + mark(st.dnd) + ' おやすみモード中でも、着信と朝のお知らせを 鳴らす</div>' +
        '<div class="meta">' + mark(st.fullscreen) + ' 画面ロック中でも、着信を 全画面で出す</div>' +
        '<div class="row"><button type="button" data-t="andapp:notif">通知の設定</button><button type="button" data-t="andapp:battery">電池の設定</button></div>' +
        '<div class="row"><button type="button" data-t="andapp:dnd">おやすみモードの許可</button><button type="button" data-t="andapp:full">全画面の許可</button></div></div>' +
        '<div class="admin-card"><b>テスト通知（この端末の中だけで鳴らします）</b>' +
        '<div class="row"><button type="button" data-t="andapp:t-msg">メッセージ</button><button type="button" data-t="andapp:t-call">着信</button><button type="button" data-t="andapp:t-morning">朝のお知らせ</button></div></div>' +
        toolClose());
}

function onAndroidAction(act){
    if(!andIs()) return;
    const A = window.AREAndroid;
    if(act === "resync"){ showToast("つなぎなおしています…"); andSync(true).then(() => { openAndroidApp(); }); }
    else if(act === "notif") A.openNotificationSettings();
    else if(act === "battery") A.requestBatteryExempt();
    else if(act === "dnd") A.requestDndAccess();
    else if(act === "full") A.requestFullScreen();
    else if(act === "t-msg") A.testNotification("msg");
    else if(act === "t-call") A.testNotification("call");
    else if(act === "t-morning") A.testNotification("morning");
}

function initAndroidApp(){
    if(!andIs()) return;
    registerTool("andapp", onAndroidAction);
    const btn = document.querySelector('[data-tool="andapp"]');
    if(btn) btn.style.display = "";
    window.__areResume = () => { andSync(false); };   // アプリに戻ってきたとき（アプリ側が呼ぶ）
    setTimeout(() => { andSync(true); }, 1500);
}
