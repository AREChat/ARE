// まだ訳されていない日本語を、画面ごとに 出す（本物のエンジン i18n.js と 辞書 lazy/i18n-en.js で 判定する）
//   node tools/i18n-todo.js harvest.json [--screens a,b | --prefix tool:] [--skip-pages] [--from N] [--n 120] [--skip-screens a,b] [--out file]
// 先に:  node tools/build-i18n.js
const fs = require("fs"), vm = require("vm");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const h = JSON.parse(fs.readFileSync(args[0], "utf8"));
const store = {};
const sandbox = { window: {}, localStorage: { getItem: () => "ja", setItem() {} }, console, setTimeout, clearTimeout };
sandbox.document = { readyState: "complete", documentElement: { setAttribute() {}, hasAttribute: () => false }, currentScript: null, addEventListener() {}, getElementById: () => null, body: null, querySelector: () => null, createElement: () => ({}), head: null };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("i18n.js", "utf8"), sandbox);
for(const l of ["en"]) vm.runInContext(fs.readFileSync("lazy/i18n-" + l + ".js", "utf8"), sandbox);
const I = sandbox.AREI18N;
const JA = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
const norm = (s) => s.replace(/\s+/g, " ").trim();
const covered = (t) => { const o = I.tr(t, "en"); return o !== t && !JA.test(o.replace(/[「」『』（）、。・〜～：！？]/g, "")); };
const screensOpt = opt("screens", ""), prefix = opt("prefix", "");
let names = Object.keys(h.screens);
if(screensOpt) names = screensOpt.split(",");
if(prefix) names = names.filter((n) => n.startsWith(prefix));
if(args.includes("--skip-pages")) names = names.filter((n) => !n.startsWith("page:"));
const skipSc = (opt("skip-screens", "") || "").split(",").filter(Boolean);
const skipSeen = new Set(); skipSc.forEach((n) => (h.screens[n] || []).forEach((t) => skipSeen.add(norm(t))));
const seen = new Set(), list = []; let total = 0, ok = 0;
for(const n of names) for(const t of (h.screens[n] || [])) {
  const k = norm(t); if(seen.has(k) || skipSeen.has(k)) continue; seen.add(k); total++;
  if(covered(k)) { ok++; continue; } list.push([n, k]);
}
const from = Number(opt("from", 0)), cnt = Number(opt("n", 100000));
const slice = list.slice(from, from + cnt);
let last = ""; const out = [];
for(const [n, k] of slice){ if(n !== last){ out.push("#### " + n); last = n; } out.push(k); }
const text = out.join("\n");
if(opt("out", "")) fs.writeFileSync(opt("out", ""), text + "\n"); else console.log(text);
console.error("対象", total, "文／訳せた", ok, "文／未訳", list.length, "文（このうち", slice.length, "文を表示）");
