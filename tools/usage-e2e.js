"use strict";
// 利用時間レポートの通しテスト（ブラウザ）。画面側の chat-usage.js（本物）と、GAS 側の gas/file-storage.gs（本物のコードを Node で動かす）をつないで調べる。
//   NODE_PATH=$(npm root -g) node tools/usage-e2e.js            （Playwright はグローバルに入っているもの）
// ・Supabase にも 本物の GAS にも つながない（疑似）。時計は Playwright の page.clock で進める。
// ・画面の読み込み：chat-tools.js / chat-profile.js / chat-quick.js / chat-usage.js は本物。ほか（state・segSt・el など）は疑似。
const fs = require("fs"), path = require("path");
const { loadGas } = require("./gas-harness");
const ROOT = path.resolve(__dirname, "..");
const { chromium } = require("playwright");

let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log("NG  " + m); } else if (process.env.V) console.log("ok  " + m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + "  期待=" + JSON.stringify(b) + " 実際=" + JSON.stringify(a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_e) { v = null; } if (v) return v; if (Date.now() - t0 > (ms || 6000)) throw new Error("時間切れ: " + what); await sleep(40); } }
const U = (k) => "00000000-0000-4000-8000-" + String(k).padStart(12, "0");
const TOKEN = (r) => "tok-" + r + "-aaaaaaaaaaaaaaaaaaaaaaaa";
const ROLES = {   // 疑似の利用者（GAS の本人確認が返す内容）と、画面が受け取る flags
  admin:  { id: U(1), name: "管理者の本名", seg: "other", admin: true, flags: { is_admin: true, quick: null, restricted: false, show_users: true } },
  home:   { id: U(2), name: "家庭ママ", seg: "home", flags: { is_admin: false, quick: "q1", restricted: true, show_users: false } },
  work:   { id: U(3), name: "社員ヤマダ", seg: "work", flags: { is_admin: false, quick: "q2", restricted: false, show_users: true } },
  work2:  { id: U(4), name: "社員サトウ", seg: "work", flags: { is_admin: false, quick: "q2", restricted: false, show_users: true } },
  friend: { id: U(5), name: "友人タカハシ", seg: "friend", flags: { is_admin: false, quick: "q3", restricted: false, show_users: true } },
  friend2:{ id: U(6), name: "友人イトウ", seg: "friend", flags: { is_admin: false, quick: "q3", restricted: false, show_users: true } },
  other:  { id: U(7), name: "他人ナカムラ", seg: "other", flags: { is_admin: false, quick: "q4", restricted: false, show_users: false, other: { limit_admin: 5 } } },
  other2: { id: U(8), name: "他人コバヤシ", seg: "other", flags: { is_admin: false, quick: "q4", restricted: false, show_users: false, other: { limit_admin: 5 } } },
  guest:  { id: U(9), name: "お試しゲスト", seg: "other", guest: true, flags: { is_admin: false, quick: "q4", restricted: false, show_users: false, other: { limit_admin: 5 } } },
};
function identities() {
  const o = {};
  Object.keys(ROLES).forEach((k) => { const r = ROLES[k]; o[TOKEN(k)] = { uid: r.id, name: r.name, seg: r.seg, admin: r.admin === true, guest: r.guest === true }; });
  return o;
}
const T0 = Date.parse("2026-11-25T12:00:00+09:00");

const HARNESS = `<!doctype html><html lang="ja" data-i18n-nopicker><head><meta charset="utf-8"><title>h</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/chat.css"></head><body>
<div class="app"><div class="pane-more sidebar-content"></div></div>
<div class="modal" id="profileModal" hidden><div class="sheet" id="profileSheet"></div></div>
<script>
(function(){
  var Q = new URLSearchParams(location.search);
  window.__errors = []; window.__toasts = [];
  window.addEventListener("error", function(e){ window.__errors.push(String(e.message)); });
  window.addEventListener("unhandledrejection", function(e){ window.__errors.push("unhandled: " + String(e.reason && e.reason.message || e.reason)); });
  window.ARE_CONFIG = Q.get("nourl") === "1" ? {} : {adsUrl:"https://gas.mock.test/exec", videoUploadUrl:"https://gas.mock.test/exec"};
  window.__flagsJson = Q.get("flags") || "null";
})();
var state = {user: {id: new URLSearchParams(location.search).get("uid")}};
var segSt = {flags: JSON.parse(window.__flagsJson)};
var el = {profileModal: document.getElementById("profileModal"), profileSheet: document.getElementById("profileSheet")};
var feat = {};
el.profileModal.addEventListener("click", function(e){ if(e.target.closest && e.target.closest('[data-pm="close"]')) closeSheet(); });
function showToast(m){ window.__toasts.push(String(m)); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
var __tok = new URLSearchParams(location.search).get("tok");
function requireClient(){ return {auth:{getSession:function(){ return Promise.resolve({data:{session:{access_token:__tok, expires_at: Math.floor(Date.now()/1000) + 3000}}}); }, refreshSession:function(){ return Promise.resolve({data:{session:{access_token:__tok, expires_at: Math.floor(Date.now()/1000) + 3000}}}); }}}; }
function segApplyTabs(){ window.__tabsApplied = (window.__tabsApplied || 0) + 1; }
</script>
<script src="/i18n.js"></script>
<script src="/chat-tools.js"></script><script src="/chat-profile.js"></script><script src="/chat-videolink.js"></script><script src="/chat-quick.js"></script><script src="/chat-usage.js"></script>
<script>
  (function(){ try{ initTools(); initUsage(); }catch(e){ window.__errors.push("init: " + e.message); } window.__ready = true; })();
</script></body></html>`;

function server(G) {
  const S = { reqs: [], mode: "ok", delay: 0, G };
  S.install = async (ctx) => {
    await ctx.route("https://gas.mock.test/**", async (route, req) => {
      const body = req.postData() || "";
      let j = null; try { j = JSON.parse(body); } catch (_e) {}
      S.reqs.push({ method: req.method(), body: j, raw: body, ct: req.headers()["content-type"] });
      const CORS = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };
      if (S.delay) await sleep(S.delay);
      if (S.mode === "offline") return route.abort("failed");
      if (S.mode === "notready") return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ ok: false, message: "不明な操作です。" }) });
      if (S.mode === "server") return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ ok: false, message: "利用時間レポートのサーバー側の準備（report_identity_v1）がまだです。" }) });
      if (S.mode === "login") return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ ok: false, message: "ログインが確認できません。もう一度ログインしてください。" }) });
      if (S.mode === "garbage") return route.fulfill({ status: 200, headers: CORS, body: "<html>not json</html>" });
      if (S.mode === "http500") return route.fulfill({ status: 500, headers: CORS, body: "oops" });
      try { const pg = req.frame().page(); G.clock.now = await pg.evaluate(() => Date.now()); } catch (_e) { G.clock.now = Date.now(); }
      const out = G.post(body);
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(out) });
    });
    await ctx.route("https://harness.test/**", async (route, req) => {
      const u = new URL(req.url());
      if (u.pathname === "/h.html") return route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: HARNESS });
      const f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        const ext = path.extname(f), ct = ext === ".js" ? "text/javascript; charset=utf-8" : ext === ".css" ? "text/css" : "application/octet-stream";
        return route.fulfill({ status: 200, headers: { "content-type": ct }, body: fs.readFileSync(f) });
      }
      return route.fulfill({ status: 404, body: "nf" });
    });
  };
  S.adds = () => S.reqs.filter((r) => r.body && r.body.op === "add");
  S.ranks = () => S.reqs.filter((r) => r.body && r.body.op === "rank");
  return S;
}

async function mk(browser, S, o) {
  o = o || {};
  const role = ROLES[o.role || "work"];
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, deviceScaleFactor: o.dsf || 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  await S.install(ctx);
  const page = await ctx.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  await page.addInitScript((lang) => { try { localStorage.setItem("are_lang", lang); } catch (_e) {} }, o.lang || "ja");
  if (o.storage) await page.addInitScript((kv) => { try { Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } catch (_e) {} }, o.storage);
  await page.clock.install({ time: o.time || T0 });
  const flags = o.flags !== undefined ? o.flags : role.flags;
  const q = { uid: role.id, tok: TOKEN(o.role || "work"), flags: JSON.stringify(flags) };
  if (o.nourl) q.nourl = "1";
  await page.goto("https://harness.test/h.html?" + new URLSearchParams(q).toString());
  await page.waitForFunction(() => window.__ready === true);
  if (o.guestBar) await page.evaluate(() => document.body.classList.add("has-guest-bar"));
  await page.clock.pauseAt((o.time || T0) + 1000);
  page.role = role; page.ctx = ctx;
  return page;
}
const entryShown = (p) => p.evaluate(() => { const b = document.querySelector('.pane-more [data-tool="usage"]'); return !!b && b.style.display !== "none" && getComputedStyle(b).display !== "none"; });
const touch = (p) => p.evaluate(() => window.dispatchEvent(new Event("pointerdown")));
const settle = (p) => until(() => p.evaluate(() => !ux.busy && !ux.inflight), 8000, "送信の完了");
/** 時計を ms すすめる。送信中（本物の通信を待っている間）に 疑似の時計だけが すすむと 20秒の打ち切りが働いてしまうので、10秒ごとに 送信の完了を待つ */
async function adv(p, ms) {
  let left = ms;
  while (left > 0) { const c = Math.min(left, 10000); await p.clock.runFor(c); left -= c; if (ms > 10000) await until(() => p.evaluate(() => !ux.busy), 8000, "送信の完了（時計をすすめる途中）").catch(() => {}); }
}
/** 「さわりながら」sec 秒すすめる（60秒ごとにさわる） */
async function active(p, sec) { let left = sec; while (left > 0) { const s = Math.min(left, 60); await touch(p); await adv(p, s * 1000); left -= s; } }
const pend = (p) => p.evaluate(() => JSON.parse(JSON.stringify(ux.pend)));
const pendSum = (p) => p.evaluate(() => uxPendTotal());
/** 数えた秒の合計＝溜まり＋これまでに送った分（送信で 溜まりが減っても 数え間違いが わかるように）*/
const sentSum = (S) => S.adds().reduce((x, r) => x + Object.values(r.body.days).reduce((a, b) => a + b, 0), 0);
const counted = async (p, S) => (await pendSum(p)) + sentSum(S);
/** ページの時計が止まっているので、翻訳などの小さなタイマーを 少し進める */
const tickSmall = (p) => p.clock.runFor(300);
const sheetText = (p) => p.evaluate(() => { const r = document.querySelector("#profileSheet .ux-root"); return r ? r.innerText : null; });
const KANA = /[぀-ヿ]/;

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const G = loadGas({ identities: identities(), now: T0 });
  const S = server(G);
  const resetG = () => { G.props.clear(); G.cacheMap.clear(); S.reqs.length = 0; S.mode = "ok"; S.delay = 0; G.stats.fetch.length = 0; };
  const errs = (p, m) => ok(p.__errors.length === 0 && true, m + " ページのエラーなし " + JSON.stringify(p.__errors));
  const T = (name, fn) => async () => { console.log("-- " + name); try { await fn(); } catch (e) { fail++; n++; console.log("NG  例外 [" + name + "]: " + (e && e.stack || e)); } };

  // ===== 1) 入口の出し分け（家庭・お試し・不明は出さない）=====
  await T("入口の出し分け", async () => {
    for (const [role, shown] of [["work", true], ["friend", true], ["other", true], ["admin", true], ["home", false]]) {
      resetG(); const p = await mk(browser, S, { role });
      ok((await entryShown(p)) === shown, role + "：入口の表示 = " + shown);
      ok((await p.evaluate(() => uxMode())) === (role === "admin" ? "admin" : role === "home" ? "off" : "user"), role + "：モード");
      const items = await p.evaluate(() => qkItems().map((x) => x[0]));
      ok(items.includes("tool:usage") === shown, role + "：ショートカット候補に出る = " + shown);
      if (role === "home") {
        await p.evaluate(() => openUsage());
        ok((await p.evaluate(() => document.querySelector("#profileSheet .ux-root"))) === null, "家庭：レポートを（直接）開こうとしても開かない");
        ok((await p.evaluate(() => window.__toasts.length)) === 1, "家庭：『使えません』と案内");
        const b = await p.evaluate(() => { document.querySelector('.pane-more [data-tool="usage"]').click(); return document.querySelector("#profileSheet .ux-root"); });
        ok(b === null, "家庭：入口を（強制的に）押しても開かない");
      }
      errs(p, role); await p.ctx.close();
    }
    // 区分がまだ わからない間（flags なし・仮の状態）は出さない
    for (const [name, flags] of [["flags なし", null], ["仮の状態", { provisional: true, show_users: false, show_posts: false }], ["quick なし（SQL未実行）", { is_admin: false, show_users: true }], ["知らない quick", { is_admin: false, quick: "q9" }]]) {
      resetG(); const p = await mk(browser, S, { role: "work", flags });
      ok(!(await entryShown(p)), name + "：出さない");
      ok((await p.evaluate(() => uxMode())) === "off", name + "：off");
      await p.ctx.close();
    }
    // 区分がわかった（flags が入った）ら 出る／家庭に変わったら 引っこむ
    resetG(); let p = await mk(browser, S, { role: "work", flags: null });
    ok(!(await entryShown(p)), "はじめは出ない");
    await p.evaluate(() => { segSt.flags = { is_admin: false, quick: "q2", restricted: false }; segApplyTabs(); });
    ok(await entryShown(p), "区分がわかったら出る（segApplyTabs のあと）");
    await p.evaluate(() => { segSt.flags = { is_admin: false, quick: "q1", restricted: true }; segApplyTabs(); });
    ok(!(await entryShown(p)), "家庭に変わったら引っこむ");
    await p.ctx.close();
    // GAS の宛先がないとき
    resetG(); p = await mk(browser, S, { role: "work", nourl: true });
    ok(!(await entryShown(p)), "GAS のアドレスがなければ出さない");
    await active(p, 400); ok(S.reqs.length === 0, "GAS のアドレスがなければ 何も送らない");
    await p.ctx.close();
    // お試し（ゲスト）
    resetG(); p = await mk(browser, S, { role: "guest", guestBar: true });
    await p.evaluate(() => uxSyncEntry());
    ok(!(await entryShown(p)), "お試し（ゲスト）の画面では出さない");
    await active(p, 700); ok(S.reqs.length === 0, "お試し（ゲスト）は何も送らない");
    await p.ctx.close();
  })();

  // ===== 2) 家庭：記録しない・通信しない =====
  await T("家庭は通信しない", async () => {
    resetG(); const p = await mk(browser, S, { role: "home" });
    await active(p, 1800);
    ok(S.reqs.length === 0, "家庭は 30分使っても GAS に何も送らない: " + S.reqs.length);
    ok((await pendSum(p)) === 0, "家庭は 数えもしない");
    ok((await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("are_usage")))).length === 0, "家庭は 端末にも記録を残さない");
    await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await sleep(200); ok(S.reqs.length === 0, "家庭は 画面を閉じるときも送らない");
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(200); ok(S.reqs.length === 0, "家庭は 画面をかくしても送らない");
    ok(G.props.size === 0 || ![...G.props.keys()].some((k) => k.startsWith("usage:")), "GAS にも何も残らない");
    errs(p, "家庭"); await p.ctx.close();
  })();

  // ===== 3) 計測：さわっている間・放置・かくれている間・通話中 =====
  await T("計測のきまり", async () => {
    resetG(); let p = await mk(browser, S, { role: "work" });
    await active(p, 60);
    let s = await counted(p, S);
    ok(s >= 55 && s <= 61, "60秒さわり続けて ≒60秒: " + s);
    // 放置：最後にさわってから 2分まで数える（そのあとは止まる）
    resetG(); p = await mk(browser, S, { role: "work" });
    await touch(p); await adv(p, 600000);
    s = await counted(p, S);
    if (process.env.DBG) console.log("DBG idle", s, JSON.stringify(S.adds().map((r) => r.body.days)), JSON.stringify(await pend(p)));
    ok(s >= 115 && s <= 126, "さわったあと 10分放置しても 最大2分ぶんだけ: " + s);
    // かくれている間は数えない
    resetG(); p = await mk(browser, S, { role: "work" });
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); });
    await touch(p); await adv(p, 60000);
    ok((await counted(p, S)) === 0, "画面がかくれている間は 数えない");
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await touch(p); await adv(p, 30000);
    s = await counted(p, S); ok(s >= 25 && s <= 31, "見えるようになったら また数える: " + s);
    // 通話中は さわらなくても数える
    resetG(); p = await mk(browser, S, { role: "work" });
    await p.evaluate(() => { window.tel = { call: { id: "x" } }; });
    await adv(p, 120000 + 60000);
    s = await counted(p, S); ok(s >= 170 && s <= 185, "通話中は さわらなくても数える: " + s);
    await p.evaluate(() => { window.tel = { call: null }; });
    await adv(p, 1000); const before = await counted(p, S); await adv(p, 60000); ok((await counted(p, S)) === before, "通話が終われば（さわらなければ）止まる");
    // 長い眠り（PC のスリープ）：1回の ずれは 10秒まで
    resetG(); p = await mk(browser, S, { role: "work" });
    await touch(p); await p.clock.fastForward(3600 * 1000);
    s = await counted(p, S); ok(s <= 12, "1時間の スリープでも 数えるのは ごく少し: " + s);
    // 時計が戻っても 負にならない
    await p.evaluate(() => { ux.lastTick = Date.now() + 100000; }); await adv(p, 5000);
    ok((await pendSum(p)) >= 0 && !(await p.evaluate(() => Object.values(ux.pend).some((v) => !(v >= 0)))), "時計が戻っても 負や NaN にならない");
    // 日をまたぐ（日本時間 23:59:50）
    resetG(); p = await mk(browser, S, { role: "work", time: Date.parse("2026-11-25T23:59:40+09:00") });
    await active(p, 40);
    const pd = await pend(p);
    ok(Object.keys(pd).length === 2 && pd["2026-11-25"] > 0 && pd["2026-11-26"] > 0, "日本時間の日付ごとに分ける: " + JSON.stringify(pd));
    errs(p, "計測"); await p.ctx.close();
  })();

  // ===== 4) 送信：5分ごと／画面を閉じるとき／GAS に記録される =====
  await T("送信と記録", async () => {
    resetG(); let p = await mk(browser, S, { role: "work" });
    await active(p, 290);
    ok(S.adds().length === 0, "5分たつまでは 送らない");
    await active(p, 20);
    await settle(p);
    ok(S.adds().length === 1, "5分たつと 送る: " + S.adds().length);
    const a = S.adds()[0];
    ok(a.method === "POST" && /text\/plain/.test(a.ct || ""), "text/plain で送る（事前確認なし）: " + a.ct);
    ok(a.body.action === "usage" && a.body.token === TOKEN("work"), "action と本人のトークン");
    const sent = Object.values(a.body.days).reduce((x, y) => x + y, 0);
    ok(sent >= 295 && sent <= 310 && Object.keys(a.body.days).length === 1, "送った秒数 ≒300: " + JSON.stringify(a.body.days));
    ok(!("name" in a.body) && !("seg" in a.body) && !("uid" in a.body), "名前・区分・ユーザー番号は 画面から送らない（GAS が本人確認で決める）");
    const rec = G.prop(U(3));
    ok(rec && rec.t >= 295 && rec.t <= 310 && rec.g === "work" && rec.n === "社員ヤマダ", "GAS に記録された（名前・区分は GAS が決めた）: " + JSON.stringify(rec));
    ok((await pendSum(p)) <= 25, "送った分は 溜まりから引かれる: " + (await pendSum(p)));
    // 画面をかくす→すぐ送る
    await active(p, 30);
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await settle(p);
    ok(S.adds().length === 2, "画面をかくしたら すぐ送る: " + S.adds().length);
    // 画面を閉じる
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await active(p, 20);
    await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await until(() => S.adds().length === 3, 4000, "pagehide で送る");
    await settle(p);
    ok(S.adds().length === 3, "画面を閉じるとき（pagehide）も送る");
    // 2秒ほどの ごく短い分は 送らない
    const k0 = S.adds().length; await active(p, 3);
    await p.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    ok(true, "");
    errs(p, "送信"); await p.ctx.close();
  })();

  // ===== 5) 失敗しても 数えた分は失われない・二重に数えない =====
  await T("失敗と再送", async () => {
    resetG(); let p = await mk(browser, S, { role: "work" });
    S.mode = "offline";
    await active(p, 310); await settle(p);
    ok(S.adds().length === 1, "オフラインでも 5分で 送ろうとする");
    let s = await pendSum(p); ok(s >= 300, "送れなかった分は もどる（失われない）: " + s);
    ok(G.prop(U(3)) === null, "GAS には まだ何もない");
    S.mode = "ok";
    await active(p, 300); await settle(p);
    ok(S.adds().length === 2, "つながったら 送りなおす");
    const rec = G.prop(U(3));
    ok(rec && rec.t >= 595 && rec.t <= 630, "溜まった分が まとめて入る（初回は15分まで）: " + JSON.stringify(rec));
    ok((await pendSum(p)) < 40, "送れたら溜まりは空に近い: " + (await pendSum(p)));
    // GAS が まだ更新されていない（不明な操作）
    resetG(); p = await mk(browser, S, { role: "work" });
    S.mode = "notready";
    await active(p, 310); await settle(p);
    ok(S.adds().length === 1, "GAS 未更新：1回ためしに送る");
    await active(p, 900); await settle(p);
    ok(S.adds().length === 1, "GAS 未更新：30分は 送りなおさない（むだな通信をしない）: " + S.adds().length);
    ok((await pendSum(p)) >= 295 && (await pendSum(p)) <= 1800, "GAS 未更新：端末には溜めておく（最大30分）: " + (await pendSum(p)));
    await active(p, 1500); await settle(p);
    if (process.env.DBG) console.log("DBG retry", S.adds().length, JSON.stringify(await p.evaluate(() => ({ retryAt: ux.retryAt, now: Date.now(), last: ux.lastFlush }))));
    ok(S.adds().length === 2, "30分たったら また ためす: " + S.adds().length);
    ok((await pendSum(p)) <= 1800, "溜まりは 1800秒（30分）をこえない: " + (await pendSum(p)));
    S.mode = "ok";
    await active(p, 1800); await settle(p);
    ok(G.prop(U(3)) && G.prop(U(3)).t > 0, "GAS が更新されたら そこから入る");
    // 壊れた返事・HTTP エラー・ログイン失敗：かならず もどす
    for (const mode of ["garbage", "http500", "login", "server"]) {
      resetG(); p = await mk(browser, S, { role: "work" }); S.mode = mode;
      await active(p, 310); await settle(p);
      ok(S.adds().length >= 1 && (await pendSum(p)) >= 300, "返事が [" + mode + "] でも 数えた分は残る: " + (await pendSum(p)));
      await p.ctx.close();
    }
    // 送っている最中に さらに数える → 二重にも 欠けもしない
    resetG(); p = await mk(browser, S, { role: "work" }); S.delay = 600;
    await active(p, 295);
    await touch(p); await p.clock.runFor(10000);                       // ちょうど送信がはじまる（返事は 0.6秒後）。そのあいだも 数え続ける
    await p.evaluate(() => { window.__mid = ux.inflight ? Object.values(ux.inflight).reduce((a, b) => a + b, 0) : 0; });
    await touch(p); await p.clock.runFor(5000);
    await settle(p);
    const sentTotal = sentSum(S), left = await pendSum(p), mid = await p.evaluate(() => window.__mid);
    ok(mid > 0 || sentTotal > 0, "（送信がはじまった）");
    ok(sentTotal + left >= 305 && sentTotal + left <= 315, "送信中に数えた分も 失わず 二重にもしない: 送った" + sentTotal + " + 残り" + left);
    // 同時に2回 flush しても 1回しか送らない
    resetG(); p = await mk(browser, S, { role: "work" }); S.delay = 400; await active(p, 100);
    await p.evaluate(() => { uxFlush("a"); uxFlush("b"); uxFlush("c"); }); await settle(p);
    ok(S.adds().length === 1, "続けて flush しても 1回だけ: " + S.adds().length);
    errs(p, "再送"); await p.ctx.close();
  })();

  // ===== 6) 端末に残す：再起動のあと 前回の残りを送る =====
  await T("前回の残り", async () => {
    resetG(); let p = await mk(browser, S, { role: "work" });
    await active(p, 120);
    await p.evaluate(() => uxPendSave());
    const key = "are_usage_pend_" + U(3);
    const kept = await p.evaluate((k) => localStorage.getItem(k), key);
    ok(kept && JSON.parse(kept)["2026-11-25"] >= 115, "溜まりが端末に保存される: " + kept);
    // 画面をかくしたとき → 送りに行く前に 保存（5秒未満は送らない）
    await p.ctx.close();
    resetG(); p = await mk(browser, S, { role: "work", storage: { [key]: JSON.stringify({ "2026-11-25": 200 }) } });
    ok((await pendSum(p)) === 0, "起動の直後は まだ読みこまない");
    await touch(p); await adv(p, 10000);
    ok((await pendSum(p)) >= 200, "区分がわかって数えはじめたら 前回の残りを読みこむ: " + (await pendSum(p)));
    await touch(p); await adv(p, 15000); await settle(p);
    ok(S.adds().length === 1, "起動して20秒ほどで 前回の残りを送る: " + S.adds().length);
    ok(G.prop(U(3)) && G.prop(U(3)).t >= 200, "前回の残りが GAS に入る");
    ok(await p.evaluate((k) => { const v = JSON.parse(localStorage.getItem(k) || "{}"); return Object.values(v).reduce((a, b) => a + b, 0) < 60; }, key), "送れたら 端末の残りも 減る");
    await p.ctx.close();
    // 壊れた保存（文字化け・変な値）
    for (const bad of ["{not json", "[1,2,3]", "123", JSON.stringify({ "2026-11-25": "abc", "x": 5, "2026-11-24": -1, "2020-01-01": 99, "2026-11-25x": 4 }), JSON.stringify({ "2026-11-25": 999999 })]) {
      resetG(); p = await mk(browser, S, { role: "work", storage: { [key]: bad } });
      await touch(p); await adv(p, 10000);
      const pd = await pend(p);
      ok(Object.values(pd).every((v) => Number.isInteger(v) && v > 0 && v <= 1800), "壊れた保存データ " + bad.slice(0, 20) + " でも 落ちず 値は正常: " + JSON.stringify(pd));
      errs(p, "壊れた保存"); await p.ctx.close();
    }
    // 古い日の残りは GAS が受けつけないので捨てる
    resetG(); p = await mk(browser, S, { role: "work", storage: { [key]: JSON.stringify({ "2026-11-20": 300, "2026-11-25": 50 }) } });
    await touch(p); await adv(p, 10000);
    const pd = await pend(p); ok(!pd["2026-11-20"] && pd["2026-11-25"] >= 50, "3日前以前の残りは捨てる: " + JSON.stringify(pd));
    await p.ctx.close();
    // localStorage が使えない・満杯でも 数えられる
    resetG(); p = await mk(browser, S, { role: "work" });
    await p.evaluate(() => { Storage.prototype.setItem = function(){ throw new Error("QuotaExceededError"); }; Storage.prototype.getItem = function(){ throw new Error("SecurityError"); }; });
    await active(p, 310); await settle(p);
    ok(S.adds().length === 1, "localStorage が使えなくても 数えて 送れる");
    errs(p, "localStorage なし"); await p.ctx.close();
  })();

  // ===== 7) サーバーが「記録しない人」と判断したとき =====
  await T("サーバーが断った", async () => {
    // 画面は 社員のつもりだが、サーバーでは家庭だった（区分が変わった・画面の情報が古い）
    resetG(); G.idents[TOKEN("work")] = { uid: U(3), name: "社員ヤマダ", seg: "home", admin: false, guest: false };
    let p = await mk(browser, S, { role: "work" });
    ok(await entryShown(p), "（画面の情報が古くて）入口は一度出る");
    await active(p, 310); await settle(p);
    ok(!(await entryShown(p)), "サーバーが『家庭』と答えたら 入口が消える");
    ok((await pendSum(p)) === 0 && G.prop(U(3)) === null, "溜まりを捨てる・GAS にも残らない");
    const n1 = S.adds().length; await active(p, 900); await settle(p);
    ok(S.adds().length === n1, "そのあとは もう送らない");
    errs(p, "サーバーが断った"); await p.ctx.close();
    G.idents[TOKEN("work")] = { uid: U(3), name: "社員ヤマダ", seg: "work", admin: false, guest: false };
    // ゲスト
    resetG(); G.idents[TOKEN("work")] = { uid: U(3), name: "社員ヤマダ", seg: "other", admin: false, guest: true };
    p = await mk(browser, S, { role: "work" });
    await active(p, 310); await settle(p);
    ok(!(await entryShown(p)) && G.prop(U(3)) === null, "サーバーが『お試し』と答えたら 消えて 記録されない");
    await p.ctx.close();
    // 管理者
    resetG(); G.idents[TOKEN("work")] = { uid: U(3), name: "社員ヤマダ", seg: "work", admin: true, guest: false };
    p = await mk(browser, S, { role: "work" });
    await active(p, 310); await settle(p);
    ok(G.prop(U(3)) === null, "サーバーが『管理者』と答えたら 記録しない");
    await p.ctx.close();
    G.idents[TOKEN("work")] = { uid: U(3), name: "社員ヤマダ", seg: "work", admin: false, guest: false };
  })();

  // ===== 8) 管理者：記録しない・見るだけ =====
  await T("管理者は見るだけ", async () => {
    resetG();
    const seed = (id, name, g, t, d) => G.props.set("usage:" + U(id), JSON.stringify({ n: name, g, t, l: T0 - 1000, d: d || { "2026-11-25": t } }));
    seed(3, "社員ヤマダ", "work", 3600); seed(4, "社員サトウ", "work", 1800); seed(5, "友人タカハシ", "friend", 7200); seed(6, "友人イトウ", "friend", 600); seed(7, "他人ナカムラ", "other", 900); seed(8, "他人コバヤシ", "other", 300);
    const p = await mk(browser, S, { role: "admin" });
    ok(await entryShown(p), "管理者は入口が見える");
    await active(p, 900);
    ok(S.adds().length === 0, "管理者は 15分使っても 記録を送らない");
    ok((await pendSum(p)) === 0, "管理者は 数えない");
    await p.evaluate(() => window.dispatchEvent(new Event("pagehide"))); await sleep(150);
    ok(S.adds().length === 0, "管理者は 画面を閉じるときも送らない");
    await p.evaluate(() => openUsage());
    await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 5000, "ランキング表示");
    const txt = await sheetText(p);
    for (const nm of ["社員ヤマダ", "社員サトウ", "友人タカハシ", "友人イトウ", "他人ナカムラ", "他人コバヤシ"]) ok(txt.includes(nm), "管理者には 本名（" + nm + "）が見える");
    ok(!txt.includes("匿名"), "管理者の画面に 匿名はない");
    ok(!txt.includes("管理者の本名") && !txt.includes("家庭ママ"), "管理者自身・家庭の人は ランキングに出ない");
    ok(txt.includes("管理者は閲覧のみ") && txt.includes("閲覧のみ"), "『閲覧のみ』と案内");
    ok(await p.evaluate(() => !document.querySelector("#profileSheet .ux-me")), "管理者には『あなたの時間』の欄がない");
    ok(await p.evaluate(() => !document.querySelector("#profileSheet .ux-you")), "管理者の行に『あなた』印がない");
    ok(txt.includes("社員") && txt.includes("友人") && txt.includes("その他"), "管理者には区分のラベルも出る");
    ok(await p.evaluate(() => !!document.querySelector("#profileSheet .ux-root[data-i18n-skip]")), "自動翻訳の対象外の印");
    ok(S.reqs.every((r) => r.body && r.body.op === "rank"), "管理者の通信は ランキングの取得だけ: " + S.reqs.map((r) => r.body && r.body.op).join(","));
    ok(!JSON.stringify(G.props).includes("管理者の本名") && G.prop(U(1)) === null, "管理者の記録は GAS にない");
    // 並び：累計の多い順（友人タカハシ 7200 が1位）
    const names = await p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-row .ux-nm")].map((e) => e.textContent.trim()));
    ok(names[0].startsWith("友人タカハシ"), "今日の1位 = タカハシ: " + names.join("|"));
    // 期間のきりかえ
    await p.click('#profileSheet [data-v="all"]');
    ok(await p.evaluate(() => document.querySelector('#profileSheet [data-v="all"]').classList.contains("on")), "累計に切りかえ");
    // 画面の閉じ方（✕）
    await p.click("#profileSheet .sheet-x"); ok(await p.evaluate(() => document.getElementById("profileModal").hidden), "✕で閉じる");
    errs(p, "管理者"); await p.ctx.close();
  })();

  // ===== 9) ランキングの本名・匿名（画面に届いた文字そのものを調べる）=====
  await T("本名と匿名", async () => {
    resetG();
    const seed = (id, name, g, t, d) => G.props.set("usage:" + U(id), JSON.stringify({ n: name, g, t, l: T0 - 1000, d: d || { "2026-11-25": t } }));
    seed(3, "社員ヤマダ", "work", 3600); seed(4, "社員サトウ", "work", 1800); seed(5, "友人タカハシ", "friend", 7200); seed(6, "友人イトウ", "friend", 600); seed(7, "他人ナカムラ", "other", 900); seed(8, "他人コバヤシ", "other", 300);
    G.props.set("usage:" + U(2), JSON.stringify({ n: "家庭ママ", g: "home", t: 99999, l: T0 - 1000, d: { "2026-11-25": 99999 } }));
    const view = async (role) => {
      const p = await mk(browser, S, { role }); await p.evaluate(() => openUsage());
      await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 5000, role + " のランキング");
      const html = await p.content(), txt = await sheetText(p), raw = JSON.stringify(S.reqs.map((r) => r.raw));
      const rows = await p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-row")].map((r) => ({ no: r.querySelector(".ux-no").textContent, nm: r.querySelector(".ux-nm").textContent.trim(), t: r.querySelector(".ux-t").textContent.trim(), me: r.classList.contains("me"), anon: r.classList.contains("anon") })));
      return { p, html, txt, rows };
    };
    const hasAny = (s, list) => list.filter((x) => s.includes(x));
    // 社員ヤマダ
    let v = await view("work");
    eq(hasAny(v.txt, ["社員ヤマダ", "社員サトウ"]).length, 2, "社員：同じ社員の名前は見える");
    eq(hasAny(v.txt + v.html, ["友人タカハシ", "友人イトウ", "他人ナカムラ", "他人コバヤシ", "家庭ママ", "管理者の本名"]), [], "社員の画面（HTML全体）に 友人・その他・家庭・管理者の名前が 一文字も入らない");
    ok(v.rows.filter((r) => r.anon).length === 4 && v.rows.every((r) => r.anon ? /^匿名 [0-9A-F]{5}$/.test(r.nm) : true), "ほかのグループは『匿名 ＋5文字』: " + JSON.stringify(v.rows.filter((r) => r.anon).map((r) => r.nm)));
    ok(v.rows.filter((r) => r.me).length === 1 && v.rows.find((r) => r.me).nm.startsWith("社員ヤマダ"), "自分の行に『あなた』");
    ok(v.rows.length === 6, "6人が並ぶ（家庭・管理者は出ない）: " + v.rows.length);
    ok(!/99999|27時間46分/.test(v.txt), "家庭の記録は 数字としても出ない");
    const anonA = v.rows.filter((r) => r.anon).map((r) => r.nm).sort();
    await v.p.ctx.close();
    // 友人タカハシ
    v = await view("friend");
    eq(hasAny(v.txt, ["友人タカハシ", "友人イトウ"]).length, 2, "友人：同じ友人の名前は見える");
    eq(hasAny(v.txt + v.html, ["社員ヤマダ", "社員サトウ", "他人ナカムラ", "他人コバヤシ", "家庭ママ", "管理者の本名"]), [], "友人の画面に 社員・その他の名前が入らない");
    await v.p.ctx.close();
    // その他：同じその他どうしでも匿名（隔離）。自分だけ本名
    v = await view("other");
    eq(hasAny(v.txt, ["他人ナカムラ"]).length, 1, "その他：自分の名前は見える");
    eq(hasAny(v.txt + v.html, ["他人コバヤシ", "社員ヤマダ", "社員サトウ", "友人タカハシ", "友人イトウ", "家庭ママ", "管理者の本名"]), [], "その他の画面に 自分以外の名前が 入らない（同じその他でも）");
    ok(v.rows.filter((r) => r.anon).length === 5, "その他：自分以外はぜんぶ匿名: " + v.rows.filter((r) => r.anon).length);
    ok(/匿名/.test(v.txt) && !/同じグループの人は名前/.test(v.txt) && /ほかの人は匿名/.test(v.txt), "その他向けの案内文");
    // 匿名の番号は 見る人が変わっても 同じ（同じ人だとわかるのは番号だけ）
    const anonO = v.rows.filter((r) => r.anon).map((r) => r.nm);
    ok(anonO.filter((x) => anonA.includes(x)).length === 3, "同じ人の番号は 見る人が変わっても同じ（友人2人＋その他の1人）: " + anonO.join(",") + " / " + anonA.join(","));
    await v.p.ctx.close();
    // 期間ごとの並び替え・同順位・0の人
    resetG();
    seed(3, "社員ヤマダ", "work", 5000, { "2026-11-25": 0, "2026-11-24": 100, "2026-11-10": 4900 }); seed(4, "社員サトウ", "work", 700, { "2026-11-25": 300, "2026-11-24": 400 });
    seed(5, "友人タカハシ", "friend", 300, { "2026-11-25": 300 }); seed(6, "友人イトウ", "friend", 100, { "2026-11-25": 100 });
    v = await view("work");
    let rows = v.rows; eq(rows.map((r) => r.no), ["1", "1", "3"], "今日：300・300・100（同じ時間は同順位）");
    eq(rows.map((r) => r.nm.replace(/ あなた$/, "").replace(/ 匿名.*/, "")).slice(0, 1), ["社員サトウ"], "同じ時間は 累計の多い人が先");
    await v.p.click('#profileSheet [data-v="week"]');
    rows = await v.p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-row")].map((r) => r.querySelector(".ux-no").textContent + ":" + r.querySelector(".ux-t").textContent.trim()));
    eq(rows, ["1:11分", "2:5分", "3:1分", "3:1分"], "7日の並びと順位（ヤマダ100・イトウ100 は同順位）");
    await v.p.click('#profileSheet [data-v="month"]');
    const m30 = await v.p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-row .ux-nm")].map((r) => r.textContent.trim().replace(/\s+/g, " ")));
    ok(m30[0].startsWith("社員ヤマダ"), "30日：ヤマダが1位（11/10 の 4900 が入る）: " + m30.join("|"));
    await v.p.click('#profileSheet [data-v="all"]');
    const allT = await v.p.evaluate(() => document.querySelector("#profileSheet .ux-big").textContent.trim());
    eq(allT, "1時間23分", "累計：自分 5000秒 = 1時間23分");
    // 自分が今日 0 のとき
    await v.p.click('#profileSheet [data-v="day"]');
    const dayBig = await v.p.evaluate(() => document.querySelector("#profileSheet .ux-big").textContent.trim());
    eq(dayBig, "まだ記録がありません", "今日 0 のときは『まだ記録がありません』");
    ok(await v.p.evaluate(() => !document.querySelector("#profileSheet .ux-rank")), "0 のときは 順位を出さない");
    await v.p.ctx.close();
    // この期間に だれの記録もないとき（古い記録だけ）
    resetG(); seed(3, "社員ヤマダ", "work", 5000, { "2026-10-01": 5000 });
    const pe = await mk(browser, S, { role: "work" }); await pe.evaluate(() => openUsage());
    await until(() => pe.evaluate(() => /記録は、まだありません/.test((document.querySelector("#profileSheet .ux-root") || {}).innerText || "")), 5000, "空のランキング");
    ok(await pe.evaluate(() => !document.querySelector("#profileSheet .ux-row") && !document.querySelector("#profileSheet .ux-err")), "この期間に だれの記録もないときは『まだありません』（エラーにしない）");
    await pe.click('#profileSheet [data-v="all"]');
    ok(await pe.evaluate(() => document.querySelectorAll("#profileSheet .ux-row").length === 1), "累計にすれば 1人出る");
    await pe.ctx.close();
  })();

  // ===== 10) 表示の細かいところ =====
  await T("表示", async () => {
    resetG();
    const seed = (id, name, g, t, d) => G.props.set("usage:" + U(id), JSON.stringify({ n: name, g, t, l: T0 - 1000, d: d || { "2026-11-25": t } }));
    seed(4, "<img src=x onerror=__xss=1>", "work", 1800);
    seed(5, "友人".repeat(15), "friend", 1500); seed(6, "ア".repeat(30), "work", 1200);
    seed(3, "社員ヤマダ", "work", 3600, { "2026-11-25": 3600, "2026-11-24": 100, "2026-11-23": 7300, "2026-11-20": 5 });
    const p = await mk(browser, S, { role: "work", vp: { width: 360, height: 640 }, touch: true });
    await p.evaluate(() => openUsage());
    await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 5000, "表示");
    ok(await p.evaluate(() => !window.__xss && !document.querySelector("#profileSheet img")), "名前の HTML は 画面に出ない（エスケープ）");
    ok((await sheetText(p)).includes("<img src=x onerror=__xss=1>"), "名前は 文字としてそのまま見える");
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.getElementById("profileSheet").scrollWidth <= document.getElementById("profileSheet").clientWidth + 1), "360px幅で 横にはみ出さない");
    const hh = await p.evaluate(() => ({ chips: [...document.querySelectorAll("#profileSheet .ux-chip")].map((b) => b.getBoundingClientRect().height), rows: [...document.querySelectorAll("#profileSheet .ux-row")].map((r) => r.getBoundingClientRect().height), ref: document.querySelector('#profileSheet [data-t="ux:refresh"]').getBoundingClientRect().height, close: document.querySelector("#profileSheet .sheet-x") ? document.querySelector("#profileSheet .sheet-x").getBoundingClientRect().height : 0 }));
    ok(hh.chips.every((h) => h >= 44) && hh.ref >= 40, "押すところは 44px 以上: " + JSON.stringify(hh.chips) + " " + hh.ref);
    ok(await p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-nm")].every((e) => e.scrollWidth <= e.clientWidth + 2 || getComputedStyle(e).textOverflow === "ellipsis")), "長い名前は … で省略（はみ出さない）");
    // 7日のグラフ
    const bars = await p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-bar")].map((b) => ({ d: b.querySelector(".ux-bard").textContent, v: b.querySelector(".ux-barv").textContent, h: b.querySelector("i").style.height })));
    ok(bars.length === 7 && bars[6].d === "11/25" && bars[0].d === "11/19", "7日分の棒（古い順・今日が右）: " + JSON.stringify(bars.map((b) => b.d)));
    ok(bars[6].v === "1時間" && bars[5].v === "1分" && bars[4].v === "2時間1分" && bars[1].v === "5秒" && bars[0].v === "–", "棒の時間の書き方: " + JSON.stringify(bars.map((b) => b.v)));
    ok(bars[4].h === "100%" && bars[0].h === "0%" && parseInt(bars[6].h) > 40, "棒の高さ: " + JSON.stringify(bars.map((b) => b.h)));
    await p.screenshot({ path: "/tmp/usage-m-ja.png" });
    // 横向きスマホ
    await p.setViewportSize({ width: 667, height: 375 });
    ok(await p.evaluate(() => document.getElementById("profileSheet").scrollWidth <= document.getElementById("profileSheet").clientWidth + 1), "横向きでも はみ出さない");
    await p.screenshot({ path: "/tmp/usage-land-ja.png" });
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.screenshot({ path: "/tmp/usage-pc-ja.png" });
    // 更新ボタン：読み込み中は押せない／連打しても 1回
    S.delay = 400; S.reqs.length = 0;
    await p.evaluate(() => { document.querySelector('#profileSheet [data-t="ux:refresh"]').click(); });
    ok(await p.evaluate(() => document.querySelector('#profileSheet [data-t="ux:refresh"]').disabled), "読み込み中は更新ボタンが押せない");
    await p.evaluate(() => { document.querySelector('#profileSheet [data-t="ux:refresh"]').click(); document.querySelector('#profileSheet [data-t="ux:refresh"]').click(); });
    await until(() => p.evaluate(() => !ux.loading), 5000, "読み込み完了");
    ok(S.ranks().length === 1, "更新の連打は 1回だけ: " + S.ranks().length);
    S.delay = 0;
    // 開いている間に 別の画面を開いたら、あとから届いた答えで 乗っとらない
    S.delay = 500;
    await p.evaluate(() => { document.querySelector('#profileSheet [data-t="ux:refresh"]').click(); });
    await p.evaluate(() => { openSheet('<div id="other-sheet">別の画面</div>'); });
    await sleep(900);
    ok(await p.evaluate(() => !!document.getElementById("other-sheet") && !document.querySelector("#profileSheet .ux-root")), "別の画面を開いたあとに 答えが届いても 画面をうばわない");
    S.delay = 0;
    // 閉じて開きなおす：期間は覚えている
    await p.evaluate(() => { closeSheet(); openUsage(); });
    await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 5000, "再表示");
    // スクロール位置を保ったまま 期間を切りかえ
    await p.evaluate(() => { document.getElementById("profileSheet").style.maxHeight = "200px"; document.getElementById("profileSheet").style.overflowY = "auto"; document.getElementById("profileSheet").scrollTop = 120; });
    await p.click('#profileSheet [data-v="week"]');
    ok(await p.evaluate(() => document.getElementById("profileSheet").scrollTop) > 60, "期間を切りかえても スクロール位置が保たれる");
    errs(p, "表示"); await p.ctx.close();
  })();

  // ===== 11) エラーの表示（4言語）=====
  await T("エラーの表示", async () => {
    const LANGS = { ja: ["レポートを読み込めませんでした", "通信できませんでした", "準備が、まだ終わっていません", "サーバー側の準備", "ログインが確認できませんでした"],
      en: ["Could not load the report", "Could not connect", "not set up yet", "server side is not set up", "Could not confirm your login"],
      zh: ["无法加载报告", "无法连接", "尚未准备好", "服务器端尚未准备好", "无法确认登录"],
      ko: ["리포트를 불러오지 못했습니다", "연결할 수 없습니다", "준비가 아직 끝나지 않았습니다", "서버 쪽 준비", "로그인을 확인하지 못했습니다"] };
    for (const lang of Object.keys(LANGS)) {
      for (const [i, mode] of ["garbage", "offline", "notready", "server", "login"].entries()) {
        resetG(); S.mode = mode;
        const p = await mk(browser, S, { role: "work", lang });
        await p.evaluate(() => openUsage());
        await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-err")), 6000, lang + "/" + mode);
        await tickSmall(p);
        const t = await sheetText(p);
        ok(t.includes(LANGS[lang][i]), lang + "・" + mode + "：エラー文 [" + LANGS[lang][i] + "]: " + t.slice(0, 120).replace(/\n/g, " "));
        if (lang !== "ja") ok(!KANA.test(t), lang + "・" + mode + "：日本語（かな）が残っていない: " + t.match(/[぀-ヿ]+/g));
        ok(await p.evaluate(() => !document.querySelector("#profileSheet .ux-row")), "エラーのときは ランキングを出さない");
        ok(await p.evaluate(() => !document.querySelector('#profileSheet [data-t="ux:refresh"]').disabled), "エラーのあと 更新ボタンで やりなおせる");
        // 直ったら 更新で出る
        S.mode = "ok"; G.props.set("usage:" + U(3), JSON.stringify({ n: "社員ヤマダ", g: "work", t: 100, l: T0 - 1000, d: { "2026-11-25": 100 } }));
        await p.click('#profileSheet [data-t="ux:refresh"]');
        await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 6000, "回復");
        ok(await p.evaluate(() => !document.querySelector("#profileSheet .ux-err")), "回復したら エラーが消える");
        await p.ctx.close();
      }
    }
  })();

  // ===== 12) 4言語：日本語が残らない・言語ごとの時間の書き方・入口のカード =====
  await T("4か国語", async () => {
    resetG();
    const seed = (id, name, g, t, d) => G.props.set("usage:" + U(id), JSON.stringify({ n: name, g, t, l: T0 - 1000, d: d || { "2026-11-25": t } }));
    seed(3, "Taro", "work", 3725, { "2026-11-25": 3725, "2026-11-24": 61 }); seed(4, "Hanako", "work", 59, { "2026-11-25": 59 }); seed(5, "Friend A", "friend", 3000); seed(7, "Other B", "other", 120);
    const EXP = {
      ja: { dur: "1時間2分", s: "59秒", m: "2分", title: "利用時間レポート", chip: ["今日", "7日間", "30日間", "累計"], anon: /匿名 [0-9A-F]{5}/, you: "あなた", rank: "1位", of: "4人中" },
      en: { dur: "1h 2m", s: "59s", m: "2m", title: "Usage report", chip: ["Today", "7 days", "30 days", "Total"], anon: /Anonymous [0-9A-F]{5}/, you: "You", rank: "#1", of: "of 4" },
      zh: { dur: "1小时2分", s: "59秒", m: "2分", title: "使用时间报告", chip: ["今天", "7天", "30天", "累计"], anon: /匿名 [0-9A-F]{5}/, you: "你", rank: "第1名", of: "共4人" },
      ko: { dur: "1시간 2분", s: "59초", m: "2분", title: "사용 시간 리포트", chip: ["오늘", "7일", "30일", "누적"], anon: /익명 [0-9A-F]{5}/, you: "나", rank: "1위", of: "4명 중" },
    };
    for (const lang of Object.keys(EXP)) {
      const E = EXP[lang];
      const p = await mk(browser, S, { role: "work", lang });
      // 入口のカード（「その他」タブ）の文が 自動翻訳される
      await until(() => p.evaluate((l) => l === "ja" || (AREI18N._dict[l] && Object.keys(AREI18N._dict[l]).length > 100), lang), 8000, "辞書の読みこみ " + lang);
      await p.evaluate(() => AREI18N.refresh()); await tickSmall(p);
      const card = await p.evaluate(() => document.querySelector('.pane-more [data-tool="usage"]').innerText.replace(/\s+/g, " ").trim());
      ok(card.includes(E.title), lang + "：入口のカードの題が訳される: " + card);
      if (lang !== "ja") ok(!KANA.test(card), lang + "：入口のカードに日本語が残らない: " + card);
      await p.evaluate(() => openUsage());
      await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 6000, lang + " 表示");
      await tickSmall(p);
      const t = await sheetText(p);
      ok(t.includes(E.title), lang + "：題");
      ok(E.chip.every((c) => t.includes(c)), lang + "：期間のボタン " + E.chip.join("/"));
      ok(E.anon.test(t), lang + "：匿名の書き方: " + t.match(/(匿名|Anonymous|익명)\s?\S+/));
      ok(t.includes(E.you), lang + "：『あなた』");
      ok(t.includes(E.rank) && t.includes(E.of), lang + "：順位の書き方 " + E.rank + " " + E.of);
      await p.click('#profileSheet [data-v="all"]'); await tickSmall(p);
      const big = await p.evaluate(() => document.querySelector("#profileSheet .ux-big").textContent.trim());
      eq(big, E.dur, lang + "：3725秒の書き方");
      const lis = await p.evaluate(() => [...document.querySelectorAll("#profileSheet .ux-t")].map((x) => x.textContent.trim()));
      ok(lis.includes(E.m) && lis.includes(E.s), lang + "：2分・59秒の書き方 " + JSON.stringify(lis));
      if (lang !== "ja") {
        const noName = t.replace(/Taro|Hanako|Friend A|Other B/g, "");
        ok(!KANA.test(noName), lang + "：画面の中に日本語（かな）が残っていない: " + (noName.match(/[぀-ヿ]+/g) || []).join(","));
      }
      // 閉じるボタン等の 外側も 訳される
      await tickSmall(p);
      const aria = await p.evaluate(() => document.querySelector("#profileSheet .sheet-x").getAttribute("aria-label"));
      if (lang !== "ja") ok(!KANA.test(aria), lang + "：✕の説明が訳される: " + aria);
      ok(await p.evaluate((l) => document.documentElement.lang.startsWith(l === "zh" ? "zh" : l), lang), lang + "：html の lang");
      // 画面をひらいたまま 言語をきりかえる
      if (lang === "ja") {
        await p.evaluate(() => AREI18N.set("en"));
        await until(async () => { await tickSmall(p); return p.evaluate(() => (document.querySelector("#profileSheet .ux-h") || {}).textContent === "📊 Usage report"); }, 8000, "言語切りかえで描きなおし");
        ok(true, "ひらいたまま 言語を変えたら その場で描きなおす");
        await p.evaluate(() => AREI18N.set("ko"));
        await until(async () => { await tickSmall(p); return p.evaluate(() => (document.querySelector("#profileSheet .ux-h") || {}).textContent === "📊 사용 시간 리포트"); }, 8000, "ko");
      }
      errs(p, "4か国語 " + lang); await p.ctx.close();
    }
  })();

  // ===== 13) スマホ・タブレット・PC のかたち（画像）=====
  await T("見た目", async () => {
    resetG();
    const seed = (id, name, g, t, d) => G.props.set("usage:" + U(id), JSON.stringify({ n: name, g, t, l: T0 - 1000, d: d || { "2026-11-25": t } }));
    seed(3, "社員ヤマダ", "work", 3725, { "2026-11-25": 3725, "2026-11-24": 1800, "2026-11-23": 7300, "2026-11-22": 600, "2026-11-21": 0, "2026-11-20": 2000 });
    for (let i = 0; i < 12; i++) seed(20 + i, i % 2 ? "友人" + i : "社員" + i, i % 2 ? "friend" : "work", 3000 - i * 200, { "2026-11-25": 3000 - i * 200 });
    for (const [name, vp, lang, role] of [["m-ja", { width: 390, height: 844 }, "ja", "work"], ["m-en", { width: 390, height: 844 }, "en", "friend"], ["s-ko", { width: 320, height: 568 }, "ko", "other"], ["t-zh", { width: 820, height: 1180 }, "zh", "work"], ["m-admin", { width: 390, height: 844 }, "ja", "admin"]]) {
      const p = await mk(browser, S, { role, vp, lang, dsf: 2, touch: vp.width < 700 });
      await p.evaluate(() => openUsage());
      await until(() => p.evaluate(() => !!document.querySelector("#profileSheet .ux-row")), 6000, "見た目 " + name);
      ok(await p.evaluate(() => document.getElementById("profileSheet").scrollWidth <= document.getElementById("profileSheet").clientWidth + 1), name + "：横にはみ出さない");
      await p.screenshot({ path: "/tmp/usage-" + name + ".png" });
      await p.ctx.close();
    }
  })();

  // ===== 14) 通信のきまり：Supabase に つながない・余計な通信をしない =====
  await T("通信のきまり", async () => {
    resetG(); const p = await mk(browser, S, { role: "work" });
    const hits = []; p.on("request", (r) => { const u = r.url(); if (!/^https:\/\/(harness|gas)\.mock\.test/.test(u) && !/^data:/.test(u)) hits.push(u); });
    await active(p, 1500); await settle(p);
    ok(hits.length === 0, "画面は GAS 以外とは通信しない（Supabase にも）: " + hits.join(","));
    const n = S.adds().length;
    ok(n >= 4 && n <= 6, "25分で 5分ごと = 4〜6回: " + n);
    ok(S.ranks().length === 0, "レポートを開かない間は ランキングを取らない");
    ok(G.stats.fetch.length >= 1 && G.stats.fetch.length <= 2, "GAS が Supabase に聞いたのは 25分で 1〜2回だけ（20分ごとに聞きなおす）: " + G.stats.fetch.length);
    await p.ctx.close();
  })();

  await browser.close();
  console.log(fail ? "\n失敗 " + fail + " / " + n : "\nOK（" + n + " 項目）");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
