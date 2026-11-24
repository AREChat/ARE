// 辞書を作る:  node tools/build-i18n.js   （i18n-src/*.txt → lazy/i18n-en.js / i18n-zh.js / i18n-ko.js）
// 書き方（1 行 1 文）:  日本語 || English || 中文 || 한국어      ※ # で始まる行と空行は 無視
//   ・{名前} は 型（数字や名前を 差しこむ）。4 言語すべてに 同じ {名前} を 入れること
//   ・同じ日本語が 2 回出たら あとのものが 勝つ（警告を出す）
//   ・\n は 改行
const fs = require("fs"), path = require("path");
const dir = "i18n-src", outDir = "lazy";
const LANGS = ["en", "zh", "ko"];
const maps = {en: {}, zh: {}, ko: {}};
let rows = 0, warn = 0, dup = 0;
const files = fs.readdirSync(dir).filter((f) => /\.txt$/.test(f)).sort();
for(const f of files){
  const lines = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if(!line.trim() || line.trim()[0] === "#") return;
    const parts = line.split(" || ").map((s) => s.trim().replace(/\\n/g, "\n"));
    if(parts.length !== 4){ console.warn("列の数が違う", f + ":" + (i + 1), parts.length, line.slice(0, 60)); warn++; return; }
    const [ja, en, zh, ko] = parts;
    if(!ja || !en || !zh || !ko){ console.warn("空の列", f + ":" + (i + 1), line.slice(0, 60)); warn++; return; }
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
    if(ph(ja) !== ph(en) || ph(ja) !== ph(zh) || ph(ja) !== ph(ko)){ console.warn("{名前} が そろっていない", f + ":" + (i + 1), line.slice(0, 80)); warn++; return; }
    const sent = (s) => s.replace(/\\\{/g, "\uE000").replace(/\\\}/g, "\uE001");   // \{ \} は そのままの波かっこ
    const key = sent(ja).replace(/\s+/g, " ").trim();
    if(maps.en[key] !== undefined) dup++;
    maps.en[key] = sent(en); maps.zh[key] = sent(zh); maps.ko[key] = sent(ko); rows++;
  });
}
fs.mkdirSync(outDir, {recursive: true});
for(const l of LANGS){
  const body = "AREI18N.add(" + JSON.stringify(l) + "," + JSON.stringify(maps[l]) + ");\n";
  fs.writeFileSync(path.join(outDir, "i18n-" + l + ".js"), "// 自動生成（tools/build-i18n.js）。直接は 編集しない。元は i18n-src/*.txt\n" + body);
}
console.log("rows", rows, "dup", dup, "warn", warn, "bytes", LANGS.map((l) => fs.statSync(path.join(outDir, "i18n-" + l + ".js")).size).join("/"));
if(warn) process.exitCode = 1;
