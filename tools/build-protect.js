#!/usr/bin/env node
"use strict";
// protect.js（見張りのプログラム）を、読みにくく圧縮して作る。
//   元のコード（説明つき）：tools/src/protect.src.js   ← 直すときは、こちらを直す
//   公開するもの          ：protect.js                  ← このビルドで作る（直接は直さない）
//   使い方：  node tools/build-protect.js           作り直す
//             node tools/build-protect.js --check   いまの protect.js が、元から作った結果と同じかを調べる（違えば失敗）
// 注意：debugger の行（開発者ツールの見つけかたに使う）は、消さずに残す。
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const src = path.join(__dirname, "src", "protect.src.js");
const out = path.join(root, "protect.js");
let terser;
try { terser = require("terser"); } catch (_e) { console.error("terser が見つかりません。 npm i --no-save terser@5.51.2"); process.exit(2); }
(async () => {
    const code = fs.readFileSync(src, "utf8");
    const r = await terser.minify(code, {
        compress: { drop_debugger: false, passes: 2, toplevel: true },
        mangle: { toplevel: true },
        format: { comments: false, ascii_only: true }
    });
    if (r.error) { console.error(r.error.message); process.exit(1); }
    if (!/debugger/.test(r.code)) { console.error("debugger の行が消えています。設定を見直してください。"); process.exit(1); }
    const text = r.code + "\n";
    try { new (require("vm").Script)(text, { filename: "protect.js" }); } catch (e) { console.error("構文エラー: " + e.message); process.exit(1); }
    if (process.argv.includes("--check")) {
        const cur = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
        if (cur !== text) { console.error("protect.js が、元（tools/src/protect.src.js）から作った結果と違います。 node tools/build-protect.js を実行してください。"); process.exit(1); }
        console.log("protect.js は最新です。"); return;
    }
    fs.writeFileSync(out, text);
    console.log("protect.js を作りました（" + text.length + " 文字）。");
})();
