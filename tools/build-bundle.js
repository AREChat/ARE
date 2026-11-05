#!/usr/bin/env node
"use strict";
// チャット画面（chat.html）の JS 97本を、1本の chat.bundle.js にまとめるビルド（読み込みを速くするため）
//
// ・まとめる順番は tools/chat-bundle-sources.txt の上から下（＝これまで chat.html に並んでいた順番）
// ・もとの 97 ファイルは今までどおり編集する。編集したら、このビルドを実行して chat.bundle.js を作り直す：
//       npm i --no-save terser@5.51.2
//       node tools/build-bundle.js
// ・terser は「空白とコメントを消すだけ」で使う（名前の短縮・コードの書きかえはしない）ので、動作は変わらない
// ・出来た chat.bundle.js の中身から ?v=（ハッシュ）を決めて、chat.html の <script> を書きかえる
//   （中身が変わると URL も変わる → 古い控え（キャッシュ）が使われない）
// ・   node tools/build-bundle.js --check   … 作り直した結果が今のファイルと同じかを調べる（CI 用。違えば失敗）

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const listFile = path.join(__dirname, "chat-bundle-sources.txt");
const outFile = path.join(root, "chat.bundle.js");
const htmlFile = path.join(root, "chat.html");
const checkOnly = process.argv.includes("--check");

let terser;
try { terser = require("terser"); }
catch (_e) {
    console.error("terser が見つかりません。先に  npm i --no-save terser@5.51.2  を実行してください。");
    process.exit(2);
}

const sources = fs.readFileSync(listFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
if (!sources.length) { console.error("chat-bundle-sources.txt が空です。"); process.exit(2); }

(async () => {
    const parts = [];
    for (const rel of sources) {
        const file = path.join(root, rel);
        if (!fs.existsSync(file)) { console.error("ファイルがありません: " + rel); process.exit(2); }
        const code = fs.readFileSync(file, "utf8");
        // ファイルごとに構文を確かめる（まとめたあとで原因が分からなくなるのを防ぐ）
        try { new (require("vm").Script)(code, { filename: rel }); }
        catch (e) { console.error("構文エラー: " + rel + " : " + e.message); process.exit(1); }
        parts.push("/* ---- " + rel + " ---- */\n" + code.replace(/\s+$/, "") + "\n;");
    }
    const joined = parts.join("\n");

    // 空白とコメントを消すだけ（compress / mangle は使わない）
    const result = await terser.minify(joined, {
        compress: false,
        mangle: false,
        format: { comments: false, ascii_only: false, beautify: false }
    });
    if (result.error) { console.error("terser エラー: " + result.error.message); process.exit(1); }
    const bundle = result.code + "\n";

    // まとめた全体も構文チェック（同じ名前の let / const の重複などはここで見つかる）
    try { new (require("vm").Script)(bundle, { filename: "chat.bundle.js" }); }
    catch (e) { console.error("chat.bundle.js の構文エラー: " + e.message); process.exit(1); }

    const hash = crypto.createHash("sha1").update(bundle).digest("hex").slice(0, 10);
    const html = fs.readFileSync(htmlFile, "utf8");
    const tag = '<script defer src="./chat.bundle.js?v=' + hash + '"></script>';
    const re = /<script defer src="\.\/chat\.bundle\.js\?v=[0-9a-f]+"><\/script>/;
    if (!re.test(html)) { console.error("chat.html に chat.bundle.js の <script> がありません。"); process.exit(2); }
    const newHtml = html.replace(re, tag);

    if (checkOnly) {
        const curBundle = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
        if (curBundle !== bundle || newHtml !== html) {
            console.error("chat.bundle.js または chat.html の ?v= が古いです。  node tools/build-bundle.js  を実行して、できたファイルをコミットしてください。");
            process.exit(1);
        }
        console.log("OK: chat.bundle.js は最新です（" + sources.length + " ファイル, " + hash + "）");
        return;
    }
    fs.writeFileSync(outFile, bundle);
    fs.writeFileSync(htmlFile, newHtml);
    console.log("chat.bundle.js を作りました: " + sources.length + " ファイル, " + bundle.length + " 文字, v=" + hash);
})();
