"use strict";
// ===== 文字コードの判定（チャットの「送る前の文字化けなおし」と、ファイルを開く専用ページ fileview.html で共通）=====
// 中身（バイト列）を調べて、UTF-8・UTF-8（目印つき）・UTF-16（目印つき）・JIS（ISO-2022-JP）・Shift_JIS・EUC-JP のどれかを決める。
// 決められないとき（バイナリ・ほかの言語など）は enc:"unknown" を返す。呼び出す側は、そのときは何も変えない。
const TEXT_ENCODING_LABEL = {"utf-16le":"UTF-16","utf-16be":"UTF-16","iso-2022-jp":"JIS（ISO-2022-JP）","shift_jis":"Shift_JIS","euc-jp":"EUC-JP"};

function decodeStrict(bytes,label){
    try{ return new TextDecoder(label,{fatal:true}).decode(bytes); }catch(error){ return null; }
}

// 日本語の文章らしさを数える（Shift_JIS と EUC-JP のどちらで読むか決めるため）
function scoreJapaneseText(text){
    let score = 0, weird = 0, nonAscii = 0;
    for(const ch of text){
        const c = ch.codePointAt(0);
        if(c < 0x80) continue;
        nonAscii++;
        if((c >= 0x3041 && c <= 0x3096) || (c >= 0x30A1 && c <= 0x30FA) || c === 0x30FC) score += 2;        // ひらがな・カタカナ
        else if(c >= 0x4E00 && c <= 0x9FFF) score += 1;                                                       // 漢字
        else if(c >= 0xFF61 && c <= 0xFF9F){ score -= 3; weird++; }                                           // 半角カタカナ（読み違えると大量に出る）
        else if((c >= 0x3000 && c <= 0x303F) || (c >= 0xFF01 && c <= 0xFF5E) || (c >= 0xFFE0 && c <= 0xFFE6)   // 全角の記号・英数
            || (c >= 0x2010 && c <= 0x203B) || (c >= 0x2160 && c <= 0x217F) || (c >= 0x2190 && c <= 0x22FF)     // 約物・ローマ数字・矢印・数学記号
            || (c >= 0x2460 && c <= 0x24FF) || (c >= 0x25A0 && c <= 0x26FF) || (c >= 0x3200 && c <= 0x33FF)     // 丸数字・図形・単位
            || (c >= 0x0391 && c <= 0x03C9) || (c >= 0x0401 && c <= 0x0451)                                     // ギリシャ・ロシア文字
            || c === 0xA7 || c === 0xA8 || c === 0xB0 || c === 0xB1 || c === 0xB4 || c === 0xB6 || c === 0xD7 || c === 0xF7) score += 0;
        else { score -= 2; weird++; }
    }
    return {score, weird, nonAscii};
}

// 中身（バイト列）の文字コードを調べる。enc: "utf-8" | "utf-8-bom" | 変換が必要なもの | "unknown"
function detectTextEncoding(bytes){
    const n = bytes.length;
    if(n === 0) return {enc:"utf-8"};
    if(n >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return {enc:"utf-8-bom"};
    if(n >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))){
        const enc = bytes[0] === 0xFF ? "utf-16le" : "utf-16be";
        const text = decodeStrict(bytes,enc);
        return text === null ? {enc:"unknown"} : {enc, text};
    }
    // JIS（ISO-2022-JP）は、全部が英数字のバイトだけでできている（途中に ESC の切りかえ印が入る）ので、UTF-8 より先に調べる
    let high = false, nul = false, jisMark = false;
    for(let i = 0; i < n; i++){
        const b = bytes[i];
        if(b >= 0x80){ high = true; break; }
        if(b === 0) nul = true;
        else if(b === 0x1B && i + 2 < n && ((bytes[i+1] === 0x24 && (bytes[i+2] === 0x40 || bytes[i+2] === 0x42)) || (bytes[i+1] === 0x28 && bytes[i+2] === 0x4A))) jisMark = true;
    }
    if(!high && jisMark && !nul){
        const text = decodeStrict(bytes,"iso-2022-jp");
        return text === null ? {enc:"unknown"} : {enc:"iso-2022-jp", text};
    }
    if(nul) return {enc:"unknown"};                       // 0 のバイトが混ざる ＝ バイナリか、目印なしの UTF-16 など。触らない
    if(decodeStrict(bytes,"utf-8") !== null) return {enc:"utf-8"};

    const cands = [];
    ["shift_jis","euc-jp"].forEach((enc) => {
        const text = decodeStrict(bytes,enc);
        if(text === null) return;
        const s = scoreJapaneseText(text);
        if(s.nonAscii > 0 && s.score > 0 && s.weird <= s.nonAscii * 0.2) cands.push({enc, text, score:s.score});
    });
    if(!cands.length) return {enc:"unknown"};
    cands.sort((a,b) => b.score - a.score);                // 同点なら、先に入れた Shift_JIS
    return {enc:cands[0].enc, text:cands[0].text};
}

// ---- ここから下は「ファイルの種類の分け方」と「UTF-8 にして書き出す」ための共通部品 ----
// 文字のファイルとして扱う拡張子（chat-base.js の送れるファイル一覧のうち、text/* と json。ics・vcf は中に文字コードが書いてあるので除く）
const TEXT_FILE_EXT = new Set(["txt","log","ini","cfg","conf","toml","yaml","yml","srt","vtt","lrc","tex","rst","sql","diff","patch","jsonl","md","markdown","json","html","htm","csv","tsv","py","mjs","ts","jsx","tsx","css","scss","java","kt","c","h","cpp","hpp","cs","go","rs","rb","php","swift","lua","dart","gd","pl","r","scala","obj","tmx","ldtk"]);
const TEXT_FIX_BOM_EXT = new Set(["txt","csv","tsv","log"]);   // 直したあと、先頭に UTF-8 の目印（BOM）を付ける（メモ帳や Excel で正しく開けるように）
// このアプリの中で「文字として表示してよい」ファイル。プログラムのコード・設定・データ（py・css・json・sql など）は、中身を画面に出さない（ダウンロードだけ）
const VIEW_TEXT_EXT = new Set(["txt","log","srt","vtt","lrc","md","markdown","csv","tsv"]);
const VIEW_IMAGE_EXT = new Set(["jpg","jpeg","png","gif","webp","avif","bmp"]);
const VIEW_VIDEO_EXT = new Set(["mp4","mov","webm","m4v"]);
const VIEW_AUDIO_EXT = new Set(["mp3","m4a","aac","wav","ogg","opus","weba","flac"]);

// 専用ページ（fileview.html）で開く種類。"" ＝ そこでは開かない（docx・zip などは、今までどおりダウンロード）
function fileViewKind(ext){
    ext = String(ext || "").toLowerCase();
    if(ext === "html" || ext === "htm") return "html";      // ページの画面として、安全な枠（sandbox）の中で表示する
    if(VIEW_TEXT_EXT.has(ext)) return "text";            // コードは、画面に出さない（VIEW_TEXT_EXT に無いものは ダウンロードだけ）
    if(VIEW_IMAGE_EXT.has(ext)) return "image";
    if(VIEW_VIDEO_EXT.has(ext)) return "video";
    if(VIEW_AUDIO_EXT.has(ext)) return "audio";
    if(ext === "pdf") return "pdf";
    if(ext === "pptx") return "pptx";       // スライドの表示とスライドショー（fileview-pptx.js）
    return "";
}

// 文字列を UTF-8 のバイト列にする（withBom が true なら、先頭に目印を付ける）
function encodeUtf8Text(text,withBom){
    const body = new TextEncoder().encode(text);
    const out = new Uint8Array(body.length + (withBom ? 3 : 0));
    if(withBom) out.set([0xEF,0xBB,0xBF],0);
    out.set(body,withBom ? 3 : 0);
    return out;
}
