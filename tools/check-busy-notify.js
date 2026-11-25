#!/usr/bin/env node
"use strict";
// 「管理者はいつも取り込み中」「取り込み中でも通知は届く」を毎回たしかめる（node tools/check-busy-notify.js）
//  1. 管理者の表示：日本時間の 曜日7 × 時刻24 × 分(0,30) すべてで「取り込み中」（オフラインのときも）
//  2. ふつうのユーザーの表示は、いままでどおり（オンライン／待機中／取り込み中／オフライン／2分以上前はオフライン）
//  3. 自分の状態は すべて自動（自分では変えられない）：
//       管理者＝いつも取り込み中／通話中＝取り込み中／5分以上さわっていない＝待機中／アプリを開いている＝オンライン
//       「ステータス」の欄は さわれない（disabled）。保存されていた手動の値(are_manual_status)は 読まない
//  4. アプリを閉じたとき：ほかのタブがなければ すぐ offline を送る（keepalive）／ほかのタブが開いていれば送らない
//  5. 通知まわりのファイルが、在席の状態（presence_status / presenceOf / autoStatus / myStatus）を読んでいない
//     → 「取り込み中」を理由に 通知が止まることは ない
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.resolve(__dirname, "..");
let fail = 0, n = 0;
const ok = (c, m) => { n++; if(!c){ fail++; console.error("NG  " + m); } };

const ADMIN = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";
const STATUS_LABELS = {online:"オンライン",busy:"取り込み中",away:"待機中"};
function load(now, opt){
    opt = opt || {};
    const calls = [], fetches = [], store = Object.assign({}, opt.store || {});
    const RealDate = Date;
    class FakeDate extends RealDate { constructor(...a){ if(a.length === 0) super(now); else super(...a); } static now(){ return now; } }
    const ctx = {
        console, Intl, Math, Number, String, Object, Array, Promise, parseInt, JSON,
        Date: FakeDate,
        STATUS_LABELS, ONLINE_WINDOW_MS: 120000, IDLE_MS: 300000,
        feat: {lastActivity: now, isAdmin:false, timers:[]},
        localStorage: {getItem:(k) => (k in store ? store[k] : null), setItem:(k, v) => { store[k] = String(v); }, removeItem:(k) => { delete store[k]; }},
        window: {ARE_CONFIG: {supabaseUrl:"https://example.supabase.co", supabasePublishableKey:"pk_test"}, AREtel: {state: {call: opt.call || null}}},
        fetch: (url, init) => { fetches.push([url, init]); return Promise.resolve({ok:true}); },
        state: {rooms:[], recommendations:[]}, el: {}, TABLES: {profiles:"profiles"},
        escapeHtml: (s) => String(s), renderRooms(){}, renderRecommendations(){}, pushCloseRoomNotifications(){}, pushClearRoomOnOtherDevices(){},
        requireClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return {}; }, auth: {getSession: async () => ({data: {session: {access_token: "tok-" + now}}})} }),
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "chat-presence.js"), "utf8") + "\n;globalThis.__t={presenceOf,sendPresence,adminPresence,autoStatus,paintMyStatus,presenceGoOffline,presTabsTouch,PRES_TABS_KEY};", ctx);
    return {t: ctx.__t, ctx, calls, fetches, store};
}

// 1. 管理者の表示：ある週の月〜日 × 0〜23時 × 0/30分
const base = Date.parse("2026-11-23T00:00:00+09:00");      // 月曜（日本時間）
let adminChecks = 0;
for(let d = 0; d < 7; d++) for(let h = 0; h < 24; h++) for(const m of [0, 30]){
    const now = base + ((d * 24 + h) * 60 + m) * 60000;
    const {t} = load(now);
    for(const prof of [
        {id:ADMIN, presence_status:"online", last_seen_at:new Date(now - 1000).toISOString()},
        {id:ADMIN, presence_status:"away", last_seen_at:new Date(now - 1000).toISOString()},
        {id:ADMIN, presence_status:"offline", last_seen_at:new Date(now - 86400000).toISOString()},
        {id:ADMIN, presence_status:null, last_seen_at:null},
    ]){
        const p = t.presenceOf(prof); adminChecks++;
        if(p.cls !== "busy" || p.text !== "取り込み中") ok(false, "管理者が busy でない: d=" + d + " h=" + h + " m=" + m + " " + JSON.stringify(p));
    }
}
ok(adminChecks === 7 * 24 * 2 * 4, "管理者の確認の数");
console.log("管理者の表示：" + adminChecks + " 通り すべて 取り込み中");

// 2. ふつうのユーザー
{
    const now = base + 12 * 3600000;
    const {t} = load(now);
    const U = "11111111-2222-3333-4444-555555555555";
    const seen = new Date(now - 30000).toISOString();
    ok(t.presenceOf({id:U, presence_status:"online", last_seen_at:seen}).cls === "online", "一般: online");
    ok(t.presenceOf({id:U, presence_status:"away", last_seen_at:seen}).cls === "away", "一般: away");
    ok(t.presenceOf({id:U, presence_status:"busy", last_seen_at:seen}).cls === "busy", "一般: busy");
    ok(t.presenceOf({id:U, presence_status:"online", last_seen_at:new Date(now - 130000).toISOString()}).cls === "offline", "一般: 2分以上前は offline");
    ok(t.presenceOf({id:U, presence_status:"offline", last_seen_at:seen}).cls === "offline", "一般: offline");
    ok(t.presenceOf({id:U}).cls === "offline", "一般: 情報なしは offline");
    ok(t.presenceOf(null).cls === "offline", "一般: null は offline");
}

// 3. 自分の状態を送るとき（すべて自動）
(async () => {
    const now0 = base + 12 * 3600000;
    let cases = 0;
    for(const [isAdmin, inCall, idleMs, want] of [
        [true, false, 0, "busy"], [true, false, 400000, "busy"], [true, true, 0, "busy"], [true, true, 400000, "busy"],
        [false, false, 0, "online"], [false, false, 299000, "online"], [false, false, 301000, "away"], [false, false, 4000000, "away"],
        [false, true, 0, "busy"], [false, true, 400000, "busy"],
    ]){
        const {t, ctx, calls} = load(now0, {call: inCall ? {id:"c1"} : null});
        ctx.feat.isAdmin = isAdmin; ctx.feat.lastActivity = now0 - idleMs;
        await t.sendPresence(); cases++;
        const got = calls.length === 1 && calls[0][0] === "set_my_presence" ? calls[0][1].p_status : JSON.stringify(calls);
        ok(got === want, "送る状態: admin=" + isAdmin + " call=" + inCall + " idle=" + idleMs + " → " + got + "（期待 " + want + "）");
        ok(t.autoStatus() === want, "autoStatus: admin=" + isAdmin + " call=" + inCall + " idle=" + idleMs);
    }
    // 保存されていた手動の値があっても、使わない（昔「取り込み中」「待機中」を選んだ端末でも 自動に従う）
    for(const manual of ["busy", "away", "online", "offline"]){
        const {t, ctx, calls} = load(now0, {store: {are_manual_status: manual}});
        await t.sendPresence(); cases++;
        ok(calls[0] && calls[0][1].p_status === "online", "手動の値(" + manual + ")を読まない");
        ok(typeof ctx.feat.manual === "undefined", "feat.manual が存在しない");
    }
    // 「ステータス」の欄：さわれない
    for(const [isAdmin, want] of [[true, "busy"], [false, "online"]]){
        const {t, ctx} = load(now0);
        ctx.feat.isAdmin = isAdmin;
        ctx.el.myStatus = {disabled: false, value: "away"};
        await t.sendPresence(); cases++;
        ok(ctx.el.myStatus.disabled === true && ctx.el.myStatus.value === want, "ステータス欄は disabled で " + want + "（" + JSON.stringify(ctx.el.myStatus) + "）");
    }
    // サーバーへ送る値は、許される値だけ
    {
        const {t, ctx, calls} = load(now0);
        for(let k = 0; k < 40; k++){ ctx.feat.isAdmin = k % 3 === 0; ctx.feat.lastActivity = now0 - (k % 5) * 200000; ctx.window.AREtel.state.call = k % 4 === 0 ? {} : null; await t.sendPresence(); }
        ok(calls.length === 40 && calls.every((c) => ["online", "away", "busy"].includes(c[1].p_status)), "送る値は online/away/busy のどれか");
        cases += 40;
    }
    // 通信が失敗しても 例外にならない
    {
        const {t, ctx} = load(now0);
        ctx.console = {warn(){}, log: console.log, error: console.error};
        ctx.requireClient = () => ({rpc: async () => { throw new Error("network"); }, auth: {getSession: async () => { throw new Error("x"); }}});
        let threw = false; try{ await t.sendPresence(); }catch(_e){ threw = true; }
        ok(!threw, "通信失敗でも例外にならない"); cases++;
    }
    console.log("自分の状態を送る：" + cases + " 通り（すべて自動）");

    // 4. アプリを閉じたとき
    {
        // ほかにタブがない → offline を keepalive で送る（トークンは 直前の sendPresence で控えてある）
        const {t, fetches, store} = load(now0);
        await t.sendPresence();
        const sent = t.presenceGoOffline();
        ok(sent === true && fetches.length === 1, "閉じる：ほかのタブがないとき offline を送る");
        const [url, init] = fetches[0] || [];
        ok(/\/rest\/v1\/rpc\/set_my_presence$/.test(url || ""), "閉じる：送り先 " + url);
        ok(init && init.keepalive === true && init.method === "POST", "閉じる：keepalive の POST");
        ok(init && JSON.parse(init.body).p_status === "offline", "閉じる：offline");
        ok(init && init.headers.Authorization === "Bearer tok-" + now0 && init.headers.apikey === "pk_test", "閉じる：本人のトークンで送る");
        ok(!(JSON.parse(store.are_pres_tabs || "{}")[""]), "閉じる：タブの印を消す");
    }
    {
        // ほかのタブが90秒以内に動いている → 送らない
        const {t, fetches, store} = load(now0, {store: {are_pres_tabs: JSON.stringify({othertab1: now0 - 20000})}});
        await t.sendPresence();
        const sent = t.presenceGoOffline();
        ok(sent === false && fetches.length === 0, "閉じる：ほかのタブが開いているときは 送らない");
    }
    {
        // ほかのタブの印が古い（90秒以上前＝もう閉じている）→ 送る
        const {t, fetches} = load(now0, {store: {are_pres_tabs: JSON.stringify({deadtab: now0 - 200000})}});
        await t.sendPresence();
        ok(t.presenceGoOffline() === true && fetches.length === 1, "閉じる：古いタブの印は 無視して offline を送る");
    }
    {
        // 一度もログイン状態を取れていない（トークンなし）→ 送らない（2分でオフライン表示になる）
        const {t, fetches} = load(now0);
        ok(t.presenceGoOffline() === false && fetches.length === 0, "閉じる：トークンがないときは送らない");
    }
    {
        // 壊れた localStorage でも 例外にならない
        const {t, ctx} = load(now0, {store: {are_pres_tabs: "{{{壊れた"}});
        let threw = false; try{ await t.sendPresence(); t.presenceGoOffline(); }catch(_e){ threw = true; }
        ok(!threw, "閉じる：壊れた保存データでも例外にならない");
        ctx.localStorage.getItem = () => { throw new Error("blocked"); };
        threw = false; try{ await t.sendPresence(); t.presenceGoOffline(); }catch(_e){ threw = true; }
        ok(!threw, "閉じる：localStorage が使えなくても例外にならない");
    }
    console.log("アプリを閉じたとき：5 通り");

    // 5. 通知まわりが 在席の状態を読んでいない
    const files = ["chat-notify.js", "chat-push.js", "chat-alarm.js", "chat-call.js", "sw.js", "sw-core.js", "sw-update.js"];
    const BAD = /presence_status|presenceOf|presenceHtml|autoStatus|feat\.manual|myStatus|are_manual_status|STATUS_LABELS|adminPresence|ADMIN_PRES_ID|feat\.wentOffline/;
    for(const f of files){
        const p = path.join(root, f);
        if(!fs.existsSync(p)) continue;
        const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
        lines.forEach((ln, i) => { if(BAD.test(ln)) ok(false, f + ":" + (i + 1) + " 通知まわりが在席の状態を読んでいる → " + ln.trim().slice(0, 100)); });
        ok(true, f);
    }
    console.log("通知まわり " + files.length + " ファイル：在席の状態を読んでいない");

    console.log(fail ? "\n失敗 " + fail + " / " + n : "\nOK（" + n + " 項目）");
    process.exit(fail ? 1 : 0);
})();
