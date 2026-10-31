// リンク切れ検査(T419/T475)：html の href / src が 指す ファイルが あるか（自分のサイト内だけ）
const fs = require("fs"), path = require("path");
let bad = 0;
const pages = fs.readdirSync(".").filter((f) => f.endsWith(".html")).concat(["game", "game2", "game3", "game4", "game6", "dream-frontier"].filter(fs.existsSync).map((d) => path.join(d, "index.html")).filter(fs.existsSync));
for(const f of pages){
  const s = fs.readFileSync(f, "utf8"), dir = path.dirname(f);
  for(const m of s.matchAll(/(?:href|src)=["']([^"'#?]+)(?:[?#][^"']*)?["']/g)){
    const u = m[1]; if(/^(https?:|data:|mailto:|tel:|javascript:|\/\/)/.test(u)) continue;
    const t = path.normalize(path.join(dir, u));
    if(!fs.existsSync(t) && !fs.existsSync(t + "/index.html")){ console.log("切れ:", f, "→", u); bad++; }
  }
}
console.log(bad ? "NG " + bad + "件" : "OK");
process.exit(bad ? 1 : 0);
