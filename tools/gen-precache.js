// オフライン用の一覧（precache-manifest.js / precache.json）を作る。ファイルを足したり消したりしたら実行する:  node tools/gen-precache.js
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const SKIP_DIR = new Set(["lazy", ".git", "node_modules", "docs", "tools", ".github", "sql", "edge-functions"]);
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
for(const f of shell.slice()) if(/(^|\/)index\.html$/.test(f)) shell.push(f.replace(/index\.html$/, "") || "./");
shell.sort(); image.sort(); audio.sort();
const sum = (a) => a.reduce((t, f) => t + (size[f] || 0), 0);
const v = crypto.createHash("md5").update(shell.map((f) => f + (size[f] || 0)).join("|")).digest("hex").slice(0, 8);
const data = {v, shell, image, audio, bytes: {shell: sum(shell), image: sum(image), audio: sum(audio)}};
fs.writeFileSync("precache.json", JSON.stringify(data));
fs.writeFileSync("precache-manifest.js", "self.ARE_MANIFEST=" + JSON.stringify({v, shell}) + ";\n");
console.log("shell", shell.length, Math.round(data.bytes.shell / 1024) + "KB", "image", image.length, Math.round(data.bytes.image / 1048576) + "MB", "audio", audio.length, Math.round(data.bytes.audio / 1048576) + "MB", "v", v);
