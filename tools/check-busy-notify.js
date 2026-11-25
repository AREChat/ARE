#!/usr/bin/env node
"use strict";
// 「管理者はいつも取り込み中」「取り込み中でも通知は届く」を毎回たしかめる（node tools/check-busy-notify.js）
//  1. 管理者の表示：日本時間の 曜日7 × 時刻24 × 分(0,30) すべてで「取り込み中」（オフラインのときも）
//  2. ふつうのユーザーの表示は、いままでどおり（オンライン／待機中／取り込み中／オフライン／2分以上前はオフライン）
//  3. 管理者が自分の状態を送るとき：オンライン・待機中・5分放置のどれでも busy。管理者でなければ選んだとおり
//  4. 通知まわりのファイルが、在席の状態（presence_status / presenceOf / feat.manual / myStatus）を読んでいない
//     → 「取り込み中」を理由に 通知が止まることは ない
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.resolve(__dirname, "..");
let fail = 0, n = 0;
const ok = (c, m) => { n++; if(!c){ fail++; console.error("NG  " + m); } };

const ADMIN = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";
const STATUS_LABELS = {online:"オンライン",busy:"取り込み中",away:"待機中"};
function load(now){
    const calls = [];
    const RealDate = Date;
    class FakeDate extends RealDate { constructor(...a){ if(a.length === 0) super(now); else super(...a); } static now(){ return now; } }
    const ctx = {
        console, Intl, Math, Number, String, Object, Array, Promise, parseInt, JSON,
        Date: FakeDate,
        STATUS_LABELS, ONLINE_WINDOW_MS: 120000, IDLE_MS: 300000,
        feat: {manual:"online", lastActivity: now, isAdmin:false, timers:[]},
        state: {rooms:[], recommendations:[]}, el: {}, TABLES: {profiles:"profiles"},
        escapeHtml: (s) => String(s), renderRooms(){}, renderRecommendations(){}, pushCloseRoomNotifications(){}, pushClearRoomOnOtherDevices(){},
        requireClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return {}; } }),
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "chat-presence.js"), "utf8") + "\n;globalThis.__t={presenceOf,sendPresence,adminPresence};", ctx);
    return {t: ctx.__t, ctx, calls};
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

// 3. 自分の状態を送るとき
(async () => {
    for(const [isAdmin, manual, idleMs, want] of [
        [true, "online", 0, "busy"], [true, "away", 0, "busy"], [true, "online", 400000, "busy"], [true, "busy", 0, "busy"],
        [false, "online", 0, "online"], [false, "online", 400000, "away"], [false, "busy", 0, "busy"], [false, "busy", 400000, "busy"], [false, "away", 0, "away"],
    ]){
        const now = base + 12 * 3600000;
        const {t, ctx, calls} = load(now);
        ctx.feat.isAdmin = isAdmin; ctx.feat.manual = manual; ctx.feat.lastActivity = now - idleMs;
        await t.sendPresence();
        const got = calls.length === 1 && calls[0][0] === "set_my_presence" ? calls[0][1].p_status : JSON.stringify(calls);
        ok(got === want, "送る状態: admin=" + isAdmin + " manual=" + manual + " idle=" + idleMs + " → " + got + "（期待 " + want + "）");
    }
    console.log("自分の状態を送る：9 通り");

    // 4. 通知まわりが 在席の状態を読んでいない
    const files = ["chat-notify.js", "chat-push.js", "chat-alarm.js", "chat-call.js", "sw.js", "sw-core.js", "sw-update.js"];
    const BAD = /presence_status|presenceOf|presenceHtml|feat\.manual|myStatus|are_manual_status|STATUS_LABELS|adminPresence|ADMIN_PRES_ID/;
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
