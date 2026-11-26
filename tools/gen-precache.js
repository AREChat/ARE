// オフライン用の一覧（precache-manifest.js / precache.json）を作る。ファイルを足したり消したりしたら実行する:  node tools/gen-precache.js
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const SKIP_DIR = new Set(["lazy", ".git", "node_modules", "docs", "tools", ".github", "sql", "edge-functions", "ads", "native", "gas"]);
const SHELL = /\.(html|js|css|json|webmanifest|txt)$/i;
const MEDIA = /\.(webp|png|jpg|jpeg|gif|svg|ico)$/i, AUDIO = /\.(mp3|ogg|wav|m4a)$/i;
const SKIP_FILE = /^(sw\.js|precache-manifest\.js|precache\.json|googlea.*\.html|robots\.txt|sitemap\.xml)$/;
const shell = [], image = [], audio = [], size = {};
(function walk(d){
  for(const n of fs.readdirSync(d, {withFileTypes: true})){
    const p = path.join(d, n.name), rel = p.split(path.sep).join("/");
    if(n.isDirectory()){ if(!SKIP_DIR.has(n.name)) walk(p); continue; }
    if(SKIP_FILE.test(n.name) || /\/sw\.js$/.test(rel)) continue;
    const s = fs.statSync(p).size; size[rel] = s;
    if(AUDIO.test(n.name)) audio.push(rel); else if(MEDIA.test(n.name)) image.push(rel); else if(SHELL.test(n.name)) shell.push(rel);
  }
})(".");
// チャットの JS は 1 つにまとめた chat.bundle.js だけを使う。元ファイル（約1.6MB）は、どの html からも読まれないものを控えから外す
// （更新のたびに みんなの端末が 裏で取り直す量を へらして、読み込みを 軽くする）。html が直接読んでいるもの（system.js など）は残す。
try{
  const bundled = new Set(fs.readFileSync("tools/chat-bundle-sources.txt", "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== "#"));
  bundled.add("chat.js");   // 古い一枚岩の chat.js（どの html も読んでいない）
  const used = new Set();
  for(const f of shell) if(/\.html$/i.test(f)){
    const t = fs.readFileSync(f, "utf8"), re = /<script[^>]+src=["']([^"'?#]+)/gi; let m;
    while((m = re.exec(t))) used.add(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  }
  for(let i = shell.length - 1; i >= 0; i--) if(bundled.has(shell[i]) && !used.has(shell[i])) shell.splice(i, 1);
}catch(_e){}
// 大きくて、使うときだけ読めば足りるもの（AIボットの QA.json 1.5MB／3Dアイコンの three.module.js 1.2MB）は、更新のたびの取り直しから外す。
// 初めて使ったときに読み込まれ、そのあとは控えに入る（オフラインで初めて開く場合だけ使えない）。
for(let i = shell.length - 1; i >= 0; i--) if(/^(QA\.json|vendor\/three\/three\.module\.js)$/.test(shell[i])) shell.splice(i, 1);
for(const f of shell.slice()) if(/(^|\/)index\.html$/.test(f)) shell.push(f.replace(/index\.html$/, "") || "./");
shell.sort(); image.sort(); audio.sort();
const sum = (a) => a.reduce((t, f) => t + (size[f] || 0), 0);
const h = {}; for(const f of shell){ try{ h[f] = crypto.createHash("md5").update(fs.readFileSync(f.endsWith("/") ? (f + "index.html") : f)).digest("hex").slice(0, 10); }catch(_e){} }
const v = crypto.createHash("md5").update(shell.map((f) => f + (size[f] || 0) + (h[f] || "")).join("|")).digest("hex").slice(0, 8);
const data = {v, shell, image, audio, bytes: {shell: sum(shell), image: sum(image), audio: sum(audio)}};
fs.writeFileSync("precache.json", JSON.stringify(data));
fs.writeFileSync("precache-manifest.js", "self.ARE_MANIFEST=" + JSON.stringify({v, shell, h}) + ";\n");
console.log("shell", shell.length, Math.round(data.bytes.shell / 1024) + "KB", "image", image.length, Math.round(data.bytes.image / 1048576) + "MB", "audio", audio.length, Math.round(data.bytes.audio / 1048576) + "MB", "v", v);
