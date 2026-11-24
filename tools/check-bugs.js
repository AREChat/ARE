"use strict";
// ===== 虫チェック：全機能で「虫は一切なし」（絵文字・名前・画像の指示文まで） =====
// 使い方:  node tools/check-bugs.js [調べるフォルダ ...]      （何も渡さないと 今のフォルダ）
// 虫の絵文字・虫の名前が 1つでも 見つかると NG（終了コード 1）。「虫は 出さない」という注意書きや、
// 人の名前・ふつうの言葉（がんばった／ハチャメチャ など）は 例外として 通します。
const fs = require("fs"), path = require("path");

const EMOJI = ["🐛", "🐝", "🦋", "🐞", "🐜", "🕷", "🕸", "🦗", "🪲", "🪳", "🦟", "🪰", "🪱", "🐌", "🦂"];
const WORDS = [
    "昆虫", "毛虫", "芋虫", "いもむし", "イモムシ", "虫歯", "虫けら", "虫の", "虫が", "虫を", "虫は", "虫と", "虫も", "虫め",
    "蝶", "蛾", "蜂", "蟻", "蚊", "蝿", "蝉", "蜘蛛", "蜻蛉", "蛍", "蜥蜴",
    "ちょうちょ", "チョウチョ", "ちょうちょう", "ミツバチ", "みつばち", "スズメバチ", "アシナガバチ", "ハチの", "ハチが", "ハチを",
    "カブトムシ", "かぶとむし", "クワガタ", "くわがた", "テントウムシ", "てんとうむし", "てんとう虫", "トンボ", "とんぼ", "バッタ", "ばった",
    "カマキリ", "かまきり", "コオロギ", "こおろぎ", "スズムシ", "すずむし", "セミの", "せみの", "ゴキブリ", "ごきぶり", "ムカデ", "むかで", "ゲジゲジ",
    "ダンゴムシ", "だんごむし", "ナメクジ", "なめくじ", "カタツムリ", "かたつむり", "ミミズ", "みみず", "サソリ", "アリの", "アリが", "アリを", "ありんこ", "アリンコ",
    "クモの", "クモが", "クモを", "くもの巣", "クモの巣", "ハエ", "ハチ", "ホタル", "カナブン", "アブラムシ", "シロアリ", "百足",
    "butterfly", "butterflies", "ladybug", "ladybird", "cockroach", "caterpillar", "dragonfly", "grasshopper", "beetle", "firefly", "centipede", "mosquito", "cicada", "termite"
];
// 例外：ふつうの言葉・人の名前・注意書き（この文字列を消してから 調べる）
const OK_PHRASES = [
    "がんばった", "頑張った", "ばったり", "当たりばったり", "あたりばったり", "ハチャメチャ", "ハチマキ", "ポテトンボ", "蛍光", "蝴蝶结", "蝴蝶",
    "トンボ(トリムマーク)", "トンボや塗り", "ほたる", "芦原",
    "角ばった", "ばったん", "ハチ公"
];
// 「虫は 出さない」と 書いてある 注意書き（同じ行に これがあれば 例外）
const NOTE_RE = /(一切|ぜったい|絶対|なし|入れな|出ない|出さな|出ません|禁止|NG|BAD|block|除外|使わな|無し|含まな|入って いな|入っていな|いない|ありません|ゼロ|無い)/;
// 注意書き／禁止語リストそのもの（中に 虫の言葉が 並ぶのが 仕事のファイル）
const SKIP_FILE = /(check-words\.js|check-bugs\.js|game6[\\/]js[\\/](pools|plan)\.js|[\\/]docs[\\/]|DEVLOG|story_bible|README|PROGRESS_NOTES|prompts?[\\/])/i;
const SKIP_DIR = new Set(["node_modules", ".git", "vendor", "lazy", "bgm", "bgm_src", "wasm"]);
const EXT = /\.(js|mjs|json|html|css|md|txt|svg|cpp|h)$/i;
const SKIP_NAME = /(three(\.min|\.module)?|\.bundle|precache|\.min)\b|chat\.bundle|game\.bundle|monsters\.json$/i;

function walk(d, out){
    for(const e of fs.readdirSync(d, {withFileTypes: true})){
        const p = path.join(d, e.name);
        if(e.isDirectory()){ if(!SKIP_DIR.has(e.name)) walk(p, out); }
        else if(EXT.test(e.name) && !SKIP_NAME.test(e.name) && !SKIP_FILE.test(p)) out.push(p);
    }
    return out;
}

const dirs = process.argv.slice(2); if(!dirs.length) dirs.push(".");
let bad = 0, files = 0;
for(const d of dirs){
    if(!fs.existsSync(d)) continue;
    for(const f of walk(d, [])){
        files++;
        let s; try{ s = fs.readFileSync(f, "utf8"); }catch(_e){ continue; }
        if(s.length > 6e6) continue;
        const lines = s.split("\n");
        for(let i = 0; i < lines.length; i++){
            let line = lines[i];
            for(const w of OK_PHRASES) if(line.includes(w)) line = line.split(w).join("");
            const hit = [];
            for(const w of EMOJI) if(line.includes(w)) hit.push(w);
            if(!(NOTE_RE.test(line))){
                for(const w of WORDS){
                    let re;
                    if(/^[a-z]+$/i.test(w)) re = new RegExp("\\b" + w + "\\b", "i");
                    else if(/^[ァ-ヶー]+$/.test(w)) re = new RegExp("(^|[^ァ-ヶー])" + w + "($|[^ァ-ヶー])");       // カタカナだけの言葉は、前後がカタカナでないときだけ
                    else if(/^[ぁ-ん]+$/.test(w) && w.length <= 3) re = new RegExp("(^|[^ぁ-ん])" + w + "($|[^ぁ-ん])");   // 短いひらがなの言葉は、前後がひらがなでないときだけ（長い言葉は そのまま調べる）
                    else re = null;
                    if(re ? re.test(line) : line.includes(w)) hit.push(w);
                }
            }else{
                for(const w of EMOJI) if(line.includes(w)) hit.push(w);
            }
            if(hit.length){ bad++; console.log("虫:", f + ":" + (i + 1), JSON.stringify([...new Set(hit)]), line.trim().slice(0, 80)); }
        }
    }
}
console.log(bad ? "NG " + bad + "件（" + files + "ファイルを確認）" : "OK（虫は 0件／" + files + "ファイルを確認）");
process.exit(bad ? 1 : 0);
