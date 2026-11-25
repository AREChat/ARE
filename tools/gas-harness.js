"use strict";
// gas/file-storage.gs を、Node の中で「本物のコードのまま」動かすための疑似 Google Apps Script。
//   const h = loadGas({ identities: { "tok-a": {uid, name, seg, admin, guest} } });
//   h.post({action:"usage", op:"add", token:"tok-a", days:{...}})   → GAS の doPost を呼んで、返ってきた JSON を返す
// 使うもの：PropertiesService / CacheService / LockService / Utilities / UrlFetchApp（Supabase の疑似）/ ContentService / DriveApp（最小）/ ScriptApp
// 時計は h.clock.now を書きかえると進む（Date.now() と new Date() の両方）。
const fs = require("fs"), vm = require("vm"), crypto = require("crypto"), path = require("path");
const GAS_FILE = path.resolve(__dirname, "../gas/file-storage.gs");

function loadGas(opts) {
  opts = opts || {};
  const clock = { now: opts.now || Date.UTC(2026, 10, 25, 3, 0, 0) };   // 2026-11-25 12:00 JST
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(clock.now); else super(...a); }
    static now() { return clock.now; }
  }
  const stats = { fetch: [], locks: 0, unlocks: 0, setProp: 0, cachePut: 0, failSet: false };
  const idents = Object.assign({}, opts.identities || {});
  // ---- Properties ----
  const props = new Map(Object.entries(opts.props || {}));
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => {
        stats.setProp++;
        if (stats.failSet) throw new Error("Exception: Quota exceeded: PropertiesService storage");
        if (String(v).length > 9 * 1024) throw new Error("Exception: Argument too large: value");
        props.set(k, String(v));
      },
      deleteProperty: (k) => { props.delete(k); },
      getProperties: () => Object.fromEntries(props),
    }),
  };
  // ---- Cache（時間で消える）----
  const cacheMap = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => { const e = cacheMap.get(k); if (!e) return null; if (e.exp <= clock.now) { cacheMap.delete(k); return null; } return e.v; },
      put: (k, v, sec) => { stats.cachePut++; if (String(v).length > 100 * 1024) throw new Error("too large"); cacheMap.set(k, { v: String(v), exp: clock.now + (sec || 600) * 1000 }); },
      getAll: (ks) => { const o = {}; ks.forEach((k) => { const e = cacheMap.get(k); if (e && e.exp > clock.now) o[k] = e.v; }); return o; },
    }),
  };
  const LockService = { getScriptLock: () => ({ waitLock: () => { stats.locks++; }, releaseLock: () => { stats.unlocks++; } }) };
  const Utilities = {
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (alg, s) => Array.from(crypto.createHash("sha256").update(String(s), "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),   // GAS は 符号つきバイトを返す
    formatDate: (d, tz, fmt) => {
      const q = {};
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).forEach((x) => { q[x.type] = x.value; });
      q.hour = String(parseInt(q.hour, 10) % 24).padStart(2, "0");
      return fmt.replace("yyyy", q.year).replace("MM", q.month).replace("dd", q.day).replace("HH", q.hour).replace("mm", q.minute).replace("ss", q.second);
    },
    getUuid: () => crypto.randomUUID(),
    base64Encode: (b) => Buffer.from(b).toString("base64"),
  };
  // ---- Supabase（疑似）----
  const UrlFetchApp = {
    fetch: (url, o) => {
      o = o || {};
      stats.fetch.push({ url, o });
      const auth = String((o.headers && o.headers.Authorization) || "").replace(/^Bearer /, "");
      if (/\/rest\/v1\/rpc\/report_identity_v1$/.test(url)) {
        if (opts.rpcMissing) return resp(404, '{"code":"PGRST202"}');
        const id = idents[auth];
        if (!id) return resp(401, '{"message":"JWT"}');
        if (id.__raw !== undefined) return resp(200, id.__raw);
        return resp(200, JSON.stringify(id));
      }
      return resp(404, "{}");
    },
  };
  const resp = (code, text) => ({ getResponseCode: () => code, getContentText: () => text, getAllHeaders: () => ({}) });
  const ContentService = {
    MimeType: { JSON: "json" },
    createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }),
  };
  // ---- Drive（バックアップ用の最小）----
  const driveFiles = [];
  const mkFolder = (name) => {
    const f = { name, folders: [], files: [] };
    f.getFoldersByName = (n) => { const a = f.folders.filter((x) => x.name === n); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
    f.createFolder = (n) => { const x = mkFolder(n); f.folders.push(x); return x; };
    f.getFilesByName = (n) => { const a = f.files.filter((x) => x.name === n && !x.trashed); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
    f.createFile = (n, content, mime) => { const x = { name: n, content, mime, trashed: false, setTrashed(v) { this.trashed = v; } }; f.files.push(x); driveFiles.push(x); return x; };
    f.getId = () => "folder-" + name;
    return f;
  };
  const root = mkFolder("root");
  const DriveApp = { getFolderById: () => root, getRootFolder: () => root };
  const ScriptApp = { getOAuthToken: () => "oauth" };

  const sandbox = {
    PropertiesService, CacheService, LockService, Utilities, UrlFetchApp, ContentService, DriveApp, ScriptApp,
    console: { log() {}, error() {}, warn() {} }, Date: FakeDate, JSON, Math, Object, Array, String, Number, RegExp, Error, isFinite, parseInt, parseFloat, Boolean, encodeURIComponent,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GAS_FILE, "utf8"), sandbox, { filename: "file-storage.gs" });

  const out = (o) => { try { return JSON.parse(o.getContent()); } catch (e) { return { __raw: o && o.getContent && o.getContent() }; } };
  return {
    clock, stats, props, cacheMap, idents, root, driveFiles, sandbox,
    post: (body) => out(sandbox.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } })),
    get: (params) => out(sandbox.doGet({ parameter: params || {} })),
    run: (code) => vm.runInContext(code, sandbox),
    advance: (ms) => { clock.now += ms; },
    prop: (uid) => { const v = props.get("usage:" + uid); return v ? JSON.parse(v) : null; },
  };
}
module.exports = { loadGas };
