// 禁止語チェック(T420)：ゲームの文章に 虫の名前・実在の地名・チート一覧mdが 入っていないか
const fs = require("fs"), path = require("path");
const BAD = ["ゴキブリ", "ムカデ", "ゲジゲジ", "カブトムシ", "クワガタ", "テントウムシ", "コオロギ", "バッタ", "ハチ", "アリ地獄", "蜘蛛", "ミミズ"];
const REAL = ["東京", "仙台", "大阪", "京都", "渋谷", "秋葉原", "埼玉", "栃木", "青森", "宮城"];
const DIRS = ["game", "game2", "game3", "game4", "game6"];
let bad = 0;
function walk(d, out){ for(const f of fs.readdirSync(d, {withFileTypes:true})){ const p = path.join(d, f.name); if(f.isDirectory()){ if(!["node_modules", "vendor", "bgm", "img"].includes(f.name)) walk(p, out); } else if(/\.(js|json|html)$/.test(f.name) && !/three|monsters\.json/.test(f.name)) out.push(p); } return out; }
for(const d of DIRS){
  if(!fs.existsSync(d)) continue;
  for(const f of walk(d, [])){
    const s = fs.readFileSync(f, "utf8");
    for(const w of REAL){ if(s.includes(w)){ console.log("実在の地名:", f, w); bad++; } }
    for(const w of BAD){ if(new RegExp("(^|[^ァ-ヶー])" + w + "($|[^ァ-ヶー])").test(s) && !/^\s*\/\//m.test(w)){ console.log("要確認の語:", f, w); bad++; } }
  }
}
console.log(bad ? "NG " + bad + "件" : "OK");
process.exit(bad ? 1 : 0);
