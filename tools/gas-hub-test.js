"use strict";
// AIbot の GAS（gas/AIbot-Code.gs）に つけたした「ハブ」（gas/hub-extra.gs）を、本物のコードのまま Node で動かして調べる。
//   node tools/gas-hub-test.js
// ・Google のサービス（Drive / Spreadsheet / Docs / Slides / Firebase）は「疑似」。呼ぶ順番や 入力の点検、番号の管理、上限の動きを たしかめる。
// ・本物の Google での動きは、GAS にデプロイして 実機で たしかめる（この試験では 確認できません）。
const fs = require("fs"), vm = require("vm"), crypto = require("crypto"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
let ok = 0, ng = 0;
const check = (c, m) => { if (c) ok++; else { ng++; console.log("NG:", m); } };

function makeGas(propsInit) {
  const props = new Map(Object.entries(propsInit || {}));
  const log = { fetch: [], fetchAll: [], mail: [], trashed: [], files: [], sheetCalls: [] };
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = rsa.privateKey.export({ type: "pkcs8", format: "pem" });
  let nowMs = Date.UTC(2026, 10, 26, 3, 0, 0);
  class FDate extends Date { constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); } static now() { return nowMs; } }
  const cache = new Map();
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => { if (String(v).length > 9 * 1024) throw new Error("Argument too large: value"); props.set(k, String(v)); },
    deleteProperty: (k) => { props.delete(k); },
    getProperties: () => Object.fromEntries(props),
    getKeys: () => Array.from(props.keys()),
  }) };
  const CacheService = { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => { cache.set(k, v); } }) };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const Utilities = {
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (a, s) => Array.from(crypto.createHash("sha256").update(String(s), "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
    base64EncodeWebSafe: (x) => Buffer.from(typeof x === "string" ? x : Buffer.from(x)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
    computeRsaSha256Signature: (s, key) => Array.from(crypto.sign("sha256", Buffer.from(s), crypto.createPrivateKey(key))),
    base64Decode: (s) => Array.from(Buffer.from(s, "base64")),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name, setName(n) { this.name = n; return this; } }),
    formatDate: (d, tz, fmt) => {
      const q = {};
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).forEach((p) => { q[p.type] = p.value; });
      q.hour = String(parseInt(q.hour, 10) % 24).padStart(2, "0");
      return fmt.replace("yyyy", q.year).replace("MM", q.month).replace("dd", q.day).replace("HH", q.hour).replace("mm", q.minute).replace("ss", q.second);
    },
  };
  const R = (code, text, blob) => ({ getResponseCode: () => code, getContentText: () => text, getBlob: () => blob || { setName(n) { this.name = n; return this; } } });
  const responders = { fetch: null, fetchAll: null };
  const UrlFetchApp = {
    fetch: (url, o) => {
      log.fetch.push({ url, o });
      if (responders.fetch) { const r = responders.fetch(url, o); if (r) return r; }
      if (/\/auth\/v1\/user$/.test(url)) { const t = String(o.headers.Authorization).replace("Bearer ", ""); return t === "good" ? R(200, '{"id":"user-1"}') : t === "good2" ? R(200, '{"id":"user-2"}') : R(401, "{}"); }
      if (/oauth2\.googleapis\.com\/token/.test(url)) return R(200, '{"access_token":"fcm-at"}');
      if (/\/files\/.+\/export/.test(url)) return R(200, "", { setName(n) { this.name = n; return this; } });
      if (/keepalive_v1/.test(url)) return R(200, "{}");
      return R(200, "ok");
    },
    fetchAll: (reqs) => { log.fetchAll.push(reqs); return reqs.map((r, i) => (responders.fetchAll ? responders.fetchAll(r, i) : R(200, "{}"))); },
  };
  const ContentService = { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) };
  // ---- Drive（疑似）----
  const mkFolder = (name) => {
    const f = { name, folders: [], files: [] };
    f.getFoldersByName = (n) => { const a = f.folders.filter((x) => x.name === n); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
    f.createFolder = (n) => { const x = mkFolder(n); f.folders.push(x); return x; };
    f.createFile = (a, b, c) => { const isBlob = typeof a === "object"; const x = { id: "f" + (log.files.length + 1), name: isBlob ? a.name : a, content: isBlob ? a.bytes : b, shared: false, trashed: false, created: new Date(nowMs + log.files.length),
      getBlob() { const me = this; return { getDataAsString: () => String(me.content) }; }, setContent(t) { this.content = t; return this; }, getId() { return this.id; }, getUrl() { return "https://drive.google.com/file/d/" + this.id; }, setSharing() { this.shared = true; return this; }, setTrashed(v) { this.trashed = v; log.trashed.push(this.id); return this; }, getDateCreated() { return this.created; } };
      f.files.push(x); log.files.push(x); return x; };
    f.getFiles = () => { const a = f.files.filter((x) => !x.trashed); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
    f.getFilesByName = (n) => { const a = f.files.filter((x) => !x.trashed && x.name === n); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
    return f;
  };
  const roots = [];
  const DriveApp = {
    Access: { ANYONE_WITH_LINK: "ANY" }, Permission: { VIEW: "VIEW" },
    getFoldersByName: (n) => { const a = roots.filter((x) => x.name === n); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; },
    createFolder: (n) => { const x = mkFolder(n); roots.push(x); return x; },
    getFileById: (id) => { const f = log.files.find((x) => x.id === id) || { setTrashed() { log.trashed.push(id); } }; return f; },
  };
  const any = (name) => new Proxy(function () {}, { get: (t, k) => (k === "getId" ? () => "gid-" + name : k === "getPageWidth" ? () => 720 : k === "getPageHeight" ? () => 405 : k === "getSlides" ? () => [any("slide0")] : any(name + "." + String(k))), apply: () => any(name + "()") });
  const sheetRec = (name) => new Proxy({}, { get: (t, k) => (...a) => { log.sheetCalls.push(name + "." + String(k)); return k === "getId" ? "gid-" + name : k === "getActiveSheet" || k === "insertSheet" ? sheetRec("sheet") : k === "getRange" ? sheetRec("range") : sheetRec(name); } });
  const SpreadsheetApp = { create: () => sheetRec("ss"), flush() {} };
  const DocumentApp = { create: () => any("doc"), ParagraphHeading: { TITLE: "T" } };
  const SlidesApp = { create: () => any("pres"), PredefinedLayout: { BLANK: "B" } };
  const MailApp = { sendEmail: (to, sub, body) => { log.mail.push({ to, sub, body }); } };
  const Session = { getEffectiveUser: () => ({ getEmail: () => "owner@example.invalid" }) };
  const ScriptApp = { getOAuthToken: () => "oauth" };
  const sandbox = { PropertiesService, CacheService, LockService, Utilities, UrlFetchApp, ContentService, DriveApp, SpreadsheetApp, DocumentApp, SlidesApp, MailApp, Session, ScriptApp,
    MimeType: { PLAIN_TEXT: "text/plain" }, console: { log() {}, error() {}, warn() {} }, Date: FDate, JSON, Math, Object, Array, String, Number, RegExp, Error, isFinite, parseInt, parseFloat, Boolean, encodeURIComponent };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "gas/AIbot-Code.gs"), "utf8"), sandbox, { filename: "AIbot-Code.gs" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "gas/hub-extra.gs"), "utf8"), sandbox, { filename: "hub-extra.gs" });
  const out = (o) => { try { return JSON.parse(o.getContent()); } catch (e) { return { __raw: o && o.getContent && o.getContent() }; } };
  return { props, log, pem, responders, sandbox, advance: (ms) => { nowMs += ms; },
    post: (b) => out(sandbox.doPost({ postData: { contents: typeof b === "string" ? b : JSON.stringify(b) } })),
    get: (p) => out(sandbox.doGet({ parameter: p || {} })), run: (c) => vm.runInContext(c, sandbox) };
}

if (require.main !== module) { module.exports = { makeGas }; return; }      // 別の試験（ブラウザの試験）から、本物の GAS コードを動かすために 読みこまれたとき
// ===== 1. AIbot の動きが 変わっていないこと =====
{
  const g = makeGas({ XAI_API_KEY: "k", APP_TOKEN: "secret-secret-1234" });
  check(g.post({ token: "bad", messages: [{ role: "user", content: "hi" }] }).code === "auth", "AIbot：合言葉のまちがいは auth");
  check(g.get().name === "AIbot", "AIbot：doGet は今までどおり");
  check(makeGas({}).post({ token: "x" }).code === "setup", "AIbot：鍵が無いときは setup");
  check(g.post("not json").code === "input", "AIbot：JSON でないものは input");
}
// ===== 2. 通知（push）=====
{
  const FB = { FB_PROJECT_ID: "proj", FB_APP_ID: "1:2:android:3", FB_API_KEY: "AIza-test", FB_SENDER_ID: "123" };
  let g = makeGas({});
  check(g.post({ action: "push", op: "config", token: "good" }).enabled === false, "通知：設定が無いときは enabled:false");
  g = makeGas(Object.assign({}, FB));
  check(g.post({ action: "push", op: "config", token: "good" }).enabled === false, "通知：鍵と合言葉が無いときも enabled:false");
  g = makeGas({});
  g.props.set("FCM_SERVICE_ACCOUNT", JSON.stringify({ client_email: "sa@x.iam", private_key: g.pem }));
  g.props.set("PUSH_SECRET", "p".repeat(24)); Object.entries(FB).forEach(([k, v]) => g.props.set(k, v));
  const cfg = g.post({ action: "push", op: "config", token: "good" });
  check(cfg.enabled === true && cfg.firebase.projectId === "proj" && !JSON.stringify(cfg).includes("private_key"), "通知：設定が入ると enabled:true、秘密の鍵は返さない");
  check(g.post({ action: "push", op: "config", token: "bad" }).ok === false, "通知：ログインが確認できない人には返さない");
  const dev = (n) => String(n).padStart(32, "0").replace(/[^0-9a-f]/g, "a"), tok = "A".repeat(100) + ":" + "b".repeat(50);
  check(g.post({ action: "push", op: "register", token: "good", device: "zz", fcm: tok }).ok === false, "通知：端末番号のかたちが違うと断る");
  check(g.post({ action: "push", op: "register", token: "good", device: dev(1), fcm: "short" }).ok === false, "通知：通知番号のかたちが違うと断る");
  check(g.post({ action: "push", op: "register", token: "good", device: dev(1), fcm: tok }).ok === true && g.props.has("pd:" + dev(1)), "通知：登録できる");
  for (let i = 2; i <= 7; i++) g.post({ action: "push", op: "register", token: "good", device: dev(i), fcm: tok + i });
  const mine = Array.from(g.props.keys()).filter((k) => k.startsWith("pd:"));
  check(mine.length === 5 && !g.props.has("pd:" + dev(1)), "通知：1人5台まで（古いものから入れかわる） 件数=" + mine.length);
  check(g.post({ action: "push", op: "send", secret: "wrong", items: [] }).message === "forbidden", "通知：合言葉がちがう送信は forbidden");
  check(g.post({ action: "push", op: "send", items: [] }).message === "forbidden", "通知：合言葉なしの送信は forbidden");
  const r = g.post({ action: "push", op: "send", secret: "p".repeat(24), items: [{ device: dev(7), type: "call", title: "📞 着信", body: "出て", room: "r1", tag: "are-call", silent: true }, { device: dev(1), title: "x" }, { device: "bad" }] });
  check(r.ok && r.sent === 1, "通知：登録ずみの端末にだけ送る " + JSON.stringify(r));
  const req = g.log.fetchAll[0][0], m = JSON.parse(req.payload).message;
  check(/\/v1\/projects\/proj\/messages:send$/.test(req.url) && req.headers.Authorization === "Bearer fcm-at", "通知：Firebase の送り先と入場券");
  check(m.android.priority === "HIGH" && m.android.ttl === "45s" && m.data.type === "call" && m.data.silent === "1" && Object.values(m.data).every((v) => typeof v === "string"), "通知：着信は HIGH・45秒・値はすべて文字");
  const other = g.post({ action: "push", op: "send", secret: "p".repeat(24), items: [{ device: dev(7), user: "someone-else", title: "a" }] });
  check(other.ok && other.sent === 0, "通知：端末の持ち主がちがうときは、送らない");
  const wrongU8 = g.post({ action: "push", op: "send", secret: "p".repeat(24), items: [{ device: dev(7), u8: "zzzzzzzz", title: "a" }] });
  check(wrongU8.sent === 0, "通知：宛先の目印（先頭8桁）がちがうときも、送らない");
  const mineSend = g.post({ action: "push", op: "send", secret: "p".repeat(24), items: [{ device: dev(7), user: "user-1", title: "a" }] });
  check(mineSend.sent === 1, "通知：持ち主が合えば送る");
  g.responders.fetchAll = () => ({ getResponseCode: () => 404, getContentText: () => '{"error":{"status":"NOT_FOUND","message":"UNREGISTERED"}}' });
  const r2 = g.post({ action: "push", op: "send", secret: "p".repeat(24), items: [{ device: dev(7), title: "a" }] });
  check(r2.removed === 1 && !g.props.has("pd:" + dev(7)), "通知：もう使われていない端末は自動で消える");
  const tokenCalls = g.log.fetch.filter((f) => /oauth2/.test(f.url)).length;
  g.post({ action: "push", op: "send", secret: "p".repeat(24), items: [{ device: dev(6), title: "a" }] });
  check(g.log.fetch.filter((f) => /oauth2/.test(f.url)).length === tokenCalls, "通知：入場券は覚えておいて、毎回は取りにいかない");
  check(g.post({ action: "push", op: "unregister", token: "good", device: dev(6) }).ok && !g.props.has("pd:" + dev(6)), "通知：登録を消せる");
}
// ===== 3. Office 書き出し =====
{
  const g = makeGas({});
  const base = { action: "office", token: "good", title: "予定表", columns: ["状態", "内容"], rows: [["○", "=SUM(A1)"], ["×", "かいもの"]], summary: ["完了 1/2"] };
  check(g.post(Object.assign({}, base, { token: "bad" })).ok === false, "Office：ログインが確認できないと断る");
  check(g.post(Object.assign({}, base, { format: "exe" })).ok === false, "Office：知らない形式は断る");
  check(g.post(Object.assign({}, base, { format: "xlsx", columns: [] })).ok === false, "Office：列が0は断る");
  check(g.post(Object.assign({}, base, { format: "xlsx", rows: new Array(2001).fill(["a", "b"]) })).ok === false, "Office：2001行は断る");
  const x = g.post(Object.assign({}, base, { format: "xlsx" }));
  check(x.ok && /\.xlsx$/.test(x.name) && /drive\.google\.com/.test(x.url), "Office：xlsx が作れる " + JSON.stringify(x).slice(0, 120));
  const calls = g.log.sheetCalls, iNum = calls.indexOf("range.setNumberFormat"), iVal = calls.indexOf("range.setValues");
  check(iNum >= 0 && iVal > iNum, "Office：先に「文字」と決めてから値を入れる（= で始まる文字が数式にならない）");
  check(g.log.trashed.includes("gid-ss"), "Office：一時のスプレッドシートは、書き出したあと ごみ箱へ");
  check(g.log.files[0].shared === true, "Office：書き出したファイルは「リンクを知っている人」だけ見られる");
  check(g.post(Object.assign({}, base, { format: "docx" })).ok === true, "Office：docx も最後まで流れる");
  check(g.post(Object.assign({}, base, { format: "pptx", slideCols: [1, 0, 99] })).ok === true, "Office：pptx も最後まで流れる");
  g.run("PropertiesService.getScriptProperties().setProperty('ofd:user-1', '2026-11-26:30')");
  check(/回まで/.test(g.post(Object.assign({}, base, { format: "xlsx" })).message || ""), "Office：1日30回をこえると断る");
}
// ===== 4. テスト結果の受け口（CI のかわり）=====
{
  let g = makeGas({});
  check(/CI_SECRET/.test(g.post({ action: "ci", op: "report", secret: "x" }).message), "CI：合言葉が未設定なら、そう伝える");
  g = makeGas({ CI_SECRET: "c".repeat(24) });
  check(g.post({ action: "ci", op: "report", secret: "nope", name: "t", status: "pass" }).message === "forbidden", "CI：合言葉がちがうと forbidden");
  const r = g.post({ action: "ci", op: "report", secret: "c".repeat(24), name: "run_all_tests", status: "fail", summary: { total: 10, pass: 9, fail: 1 }, text: "# 結果\n- × foo", host: "pc" });
  check(r.ok && g.log.files.length === 1 && /_run_all_tests_fail\.md$/.test(g.log.files[0].name), "CI：結果をドライブに保存できる");
  const st = g.get({ action: "ci" });
  check(st.latest && st.latest.status === "fail" && st.latest.summary.fail === 1 && !JSON.stringify(st).includes("secret"), "CI：?action=ci で最近の結果が見える（秘密は出ない）");
  for (let i = 0; i < 70; i++) g.post({ action: "ci", op: "report", secret: "c".repeat(24), name: "n" + i, status: "pass", summary: { total: 1, pass: 1 }, text: "x" });
  const idx = JSON.parse(g.props.get("ci:idx"));
  check(idx.length <= 60 && g.log.trashed.length >= 10, "CI：保管は60件まで（古いものはごみ箱へ） 件数=" + idx.length);
  const bytes = Buffer.from("PK-apk-bytes");
  const a = g.post({ action: "ci", op: "artifact", secret: "c".repeat(24), name: "ARE-debug.apk", mime: "application/vnd.android.package-archive", b64: bytes.toString("base64") });
  check(a.ok && a.bytes === bytes.length && /drive\.google\.com/.test(a.download), "CI：アプリのファイルを受け取って ドライブに置ける");
  check(g.post({ action: "ci", op: "artifact", secret: "c".repeat(24), name: "a.bin", b64: "A".repeat(60 * 1024 * 1024) }).ok === false, "CI：大きすぎるファイルは断る");
  g.responders.fetch = (url) => (/chat\.html/.test(url) ? { getResponseCode: () => 500, getContentText: () => "" } : null);
  const w = g.run("hubxDailyWatch()");
  check(w === "fail" && g.log.mail.length === 1 && /1 件/.test(g.log.mail[0].sub), "見張り：サイトがこわれていたら、持ち主にメールで知らせる");
  g.responders.fetch = null;
  check(g.run("hubxDailyWatch()") === "pass" && g.log.mail.length === 1, "見張り：すべて正常ならメールは出さない");
}
// ===== 5. 引き継ぎ（sync）=====
{
  const g = makeGas({});
  const S = (o) => g.post(Object.assign({ action: "sync", token: "good", app: "games" }, o));
  check(S({ op: "pull", token: "bad" }).ok === false, "引き継ぎ：ログインが確認できないと断る");
  check(S({ op: "pull", app: "../x" }).ok === false && S({ op: "pull", app: "" }).ok === false, "引き継ぎ：アプリ名のかたちが違うと断る");
  check(S({ op: "zzz" }).ok === false, "引き継ぎ：知らない操作は断る");
  const e = S({ op: "pull" });
  check(e.ok && e.count === 0 && e.total === 0 && g.log.files.length === 0, "引き継ぎ：何も無いときは空を返し、ファイルは作らない");
  const p1 = S({ op: "push", items: { kaaa: { t: 1000, v: "A" }, kbbb: { t: 1000, v: "B".repeat(5000) } } });
  check(p1.ok && p1.accepted.length === 2 && p1.accepted.includes("kaaa") && Object.keys(p1.newer).length === 0, "引き継ぎ：送ると取りこまれる " + JSON.stringify(p1).slice(0, 100));
  check(g.log.files.length === 1 && /games\.json$/.test(g.log.files[0].name), "引き継ぎ：1人・1アプリで 1ファイル");
  const pl = S({ op: "pull" });
  check(pl.ok && pl.count === 2 && pl.items.kaaa.v === "A" && pl.items.kbbb.v.length === 5000, "引き継ぎ：取り出せる");
  check(S({ op: "pull", have: { kaaa: 1000, kbbb: 999 } }).count === 1, "引き継ぎ：手元と同じか新しいものは 返さない（古いものだけ返す）");
  check(S({ op: "pull", keys: ["kaaa"], have: { kaaa: 99999 } }).count === 1, "引き継ぎ：keys を指定すると その項目だけ返す");
  check(Object.keys(S({ op: "pull", keys: ["nothing"] }).items).length === 0, "引き継ぎ：keys にない項目は 返さない");
  const p2 = S({ op: "push", items: { kaaa: { t: 900, v: "OLD" } } });
  check(p2.ok && p2.accepted.length === 0 && p2.newer.kaaa && p2.newer.kaaa.v === "A", "引き継ぎ：古い時刻のものは 取りこまず、サーバーのものを返す");
  check(S({ op: "pull" }).items.kaaa.v === "A", "引き継ぎ：古い送信で 上書きされない");
  const p3 = S({ op: "push", items: { kaaa: { t: 2000, del: 1 } } });
  check(p3.accepted.includes("kaaa") && S({ op: "pull" }).items.kaaa.del === 1 && S({ op: "pull" }).items.kaaa.v === undefined, "引き継ぎ：消した印（del）も 時刻つきで残る");
  check(S({ op: "push", items: { kaaa: { t: 1500, v: "ZZ" } } }).accepted.length === 0, "引き継ぎ：消した後に 古い値が戻ってこない");
  const bad = S({ op: "push", items: { "bad key!": { t: 5, v: "x" }, "../etc": { t: 5, v: "x" }, kneg: { t: -1, v: "x" }, kfuture: { t: Date.now() + 99 * 24 * 3600 * 1000, v: "x" }, knum: { t: 5, v: 12 }, kbig: { t: 5, v: "x".repeat(900 * 1024 + 1) }, kok: { t: 5, v: "ok" } } });
  check(bad.ok && bad.accepted.length === 1 && bad.accepted[0] === "kok", "引き継ぎ：おかしな名前・時刻・大きさ・型は 取りこまない " + JSON.stringify(bad.accepted));
  check(S({ op: "push", items: Object.fromEntries(Array.from({ length: 121 }, (_, i) => ["k" + i, { t: 5, v: "x" }])) }).ok === false, "引き継ぎ：1回に送れる数に上限（120）");
  // 別の人の分とは混ざらない
  g.responders.fetch = null;
  const other = g.post({ action: "sync", op: "pull", token: "good2", app: "games" });
  check(other.ok && other.count === 0, "引き継ぎ：ほかの人の記録は 見えない");
  g.post({ action: "sync", op: "push", token: "good2", app: "games", items: { kaaa: { t: 3000, v: "OTHER" } } });
  check(S({ op: "pull" }).items.kaaa.del === 1 && g.post({ action: "sync", op: "pull", token: "good2", app: "games" }).items.kaaa.v === "OTHER", "引き継ぎ：人ごとに 別々に 保存される");
  check(g.post({ action: "sync", op: "pull", token: "good", app: "learn" }).count === 0, "引き継ぎ：アプリごとにも 別々");
  // 回数の上限（1分40回）
  let last; for (let i = 0; i < 45; i++) last = S({ op: "pull" });
  check(last.ok === false && last.busy === true, "引き継ぎ：1分に40回をこえると 待つように言う");
  g.advance(61000);
  check(S({ op: "pull" }).ok === true, "引き継ぎ：1分たつと また使える");
  // 大きさの上限
  const g2 = makeGas({});
  const res = []; for (let i = 0; i < 8; i++) { res.push(g2.post({ action: "sync", op: "push", token: "good", app: "games", items: { ["kb" + i]: { t: 10 + i, v: "y".repeat(800 * 1024) } } }).ok); g2.advance(61000); }
  check(res.slice(0, 6).every(Boolean) && res[7] === false, "引き継ぎ：1つのファイルが 6MB をこえるときは 断る " + res.join(","));
  check(g.get({ action: "hub" }).features.includes("sync"), "引き継ぎ：?action=hub に sync が出る");
}
console.log(ok + " / " + (ok + ng) + (ng ? "  ← NG あり" : "  すべて OK"));
process.exit(ng ? 1 : 0);
