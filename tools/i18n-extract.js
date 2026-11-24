// 画面に出そうな日本語を、ソースから 取り出して 一覧にする（辞書づくりの下調べ用）:  node tools/i18n-extract.js [--files] [--out file]
// ・html：タグの外の文字／placeholder・title・aria-label・alt・value
// ・js：'…' "…" `…` の中の日本語（${…} で 区切る）。コメントは 除く。
const fs = require("fs"), path = require("path");
const JA = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
const SKIP_DIR = new Set(["node_modules", ".git", "sql", "tools", "docs", "edge-functions", "gas", "lazy", "i18n-src", "vendor", "img", "ads", "pack"]);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const out = new Map();   // text -> Set(files)
function add(t, f){
  t = norm(t); if(!t || !JA.test(t)) return;
  if(t.length > 400) return;
  if(!out.has(t)) out.set(t, new Set()); out.get(t).add(f);
}
function stripJsComments(src){
  let o = "", i = 0, n = src.length, q = null;
  while(i < n){
    const c = src[i], d = src[i + 1];
    if(q){
      o += c;
      if(c === "\\"){ o += src[i + 1] || ""; i += 2; continue; }
      if(c === q) q = null;
      i++; continue;
    }
    if(c === "/" && d === "/"){ while(i < n && src[i] !== "\n") i++; continue; }
    if(c === "/" && d === "*"){ i += 2; while(i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if(c === "'" || c === '"' || c === "`"){ q = c; o += c; i++; continue; }
    o += c; i++;
  }
  return o;
}
function fromJs(src, f){
  src = stripJsComments(src);
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g; let m;
  while((m = re.exec(src))){
    const body = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3];
    if(!JA.test(body)) continue;
    // 文字列の中の html は、タグを 区切りにして 文だけ取り出す
    const text = body.replace(/\\n/g, "\n").replace(/\\(['"`\\])/g, "$1");
    for(const part of text.split(/\$\{[^}]*\}|<[^>]*>/)) {
      for(const line of part.split("\n")) add(line.replace(/&[a-z]+;/g, " "), f);
    }
  }
}
function fromHtml(src, f){
  src = src.replace(/<script[\s\S]*?<\/script>/gi, (s) => { const b = s.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, ""); fromJs(b, f); return ""; });
  src = src.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const attr = /\s(?:placeholder|title|aria-label|alt|value|data-title)=("([^"]*)"|'([^']*)')/gi; let m;
  while((m = attr.exec(src))) add(m[2] != null ? m[2] : m[3], f);
  for(const part of src.split(/<[^>]*>/)) for(const line of part.split("\n")) add(line.replace(/&[a-z]+;/g, " "), f);
}
function walk(d){
  for(const n of fs.readdirSync(d, {withFileTypes: true})){
    const p = path.join(d, n.name);
    if(n.isDirectory()){ if(!SKIP_DIR.has(n.name)) walk(p); continue; }
    if(/^(chat\.bundle\.js|precache-manifest\.js|i18n\.js|chat-lang\.js)$/.test(n.name)) continue;
    const rel = p.replace(/^\.\//, "");
    if(/\.html$/.test(n.name)) fromHtml(fs.readFileSync(p, "utf8"), rel);
    else if(/\.js$/.test(n.name)) fromJs(fs.readFileSync(p, "utf8"), rel);
  }
}
walk(".");
const args = process.argv.slice(2);
const oi0 = args.indexOf("--only");
if(oi0 >= 0){   // --only a.js,b.html : そのファイルにある文だけ（ファイルごとに 見出しつき）
  const names = args[oi0 + 1].split(",");
  for(const n of names){
    console.log("#### " + n);
    for(const [t, fs_] of [...out].sort((a, b) => a[0].localeCompare(b[0], "ja"))) if(fs_.has(n)) console.log(t);
  }
  process.exit(0);
}
if(args.includes("--files")){
  const per = {}; for(const [t, fs_] of out) for(const f of fs_) per[f] = (per[f] || 0) + 1;
  Object.entries(per).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(String(c).padStart(5), f));
  console.log("total unique", out.size);
}else{
  const oi = args.indexOf("--out");
  const lines = [...out.keys()].sort();
  if(oi >= 0) fs.writeFileSync(args[oi + 1], lines.join("\n") + "\n"); else console.log(lines.join("\n"));
  console.error("unique", out.size);
}
