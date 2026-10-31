#!/usr/bin/env node
// ===== 公式の Three.js を npm レジストリから 取得して vendor/three/ に おく =====
//  つかいかた:   node tools/fetch-three.mjs            （バージョンは js/config.js の threeVersion）
//                node tools/fetch-three.mjs 0.160.0     （バージョンを 指定）
//  やること:  ① `npm pack three@バージョン` で 公式の tarball を ダウンロード
//             ② tarball の sha512 が レジストリが 公表している dist.integrity と 一致するか 確認（ちがえば 中止）
//             ③ build/three.module.js と LICENSE だけを 取り出して vendor/three/ に コピー
//             ④ vendor/three/MANIFEST.json に バージョン・ハッシュ・取得日 を 記録
//  いっさい 改変しません。ファイルの中身を 書きかえることも 生成することも しません。
//  ひつよう: Node.js 18 以上 / npm / tar（Windows10以降・macOS・Linux に 標準）／ インターネット
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.DF_VENDOR_DIR || join(root, "vendor", "three");
const cfg = readFileSync(join(root, "js", "config.js"), "utf8");
const VERSION = process.argv[2] || (cfg.match(/threeVersion:\s*"([\d.]+)"/) || [])[1];
if(!VERSION){ console.error("バージョンが わかりません。js/config.js の threeVersion を かくにんしてください。"); process.exit(1); }
const sh = process.platform === "win32";
const run = (cmd, args, opt) => execFileSync(cmd, args, Object.assign({encoding: "utf8", shell: sh && cmd === "npm"}, opt || {}));
const die = (m, code) => { console.error("\n✖ " + m); process.exit(code || 1); };

const tmp = mkdtempSync(join(tmpdir(), "df-three-"));
try{
    console.log("→ three@" + VERSION + " を npm から ダウンロードします…");
    let file;
    try{ file = run("npm", ["pack", "three@" + VERSION, "--pack-destination", tmp, "--silent"]).trim().split(/\r?\n/).pop(); }
    catch(e){ die("ダウンロードに しっぱいしました（インターネットに つながっていますか？ npm は 入っていますか？）\n" + (e.stderr || e.message), 2); }
    const tgz = join(tmp, file); const buf = readFileSync(tgz);
    const integrity = "sha512-" + createHash("sha512").update(buf).digest("base64");
    let expect = null;
    try{ expect = run("npm", ["view", "three@" + VERSION, "dist.integrity"]).trim(); }catch(e){ /* 取得できない時は 下で 扱う */ }
    if(!expect) die("npm レジストリの 公表ハッシュ（dist.integrity）を 取得できませんでした。かくにんできないため 中止します。", 3);
    if(integrity !== expect) die("ハッシュが 一致しません！ ダウンロードした ファイルは 公式のものと ちがう かのうせいが あります。中止しました。\n  取得: " + integrity + "\n  公式: " + expect, 4);
    console.log("✔ tarball の ハッシュが レジストリの 公表値と 一致しました");
    try{ run("tar", ["-xzf", tgz, "-C", tmp, "package/build/three.module.js", "package/LICENSE", "package/package.json"]); }
    catch(e){ die("tar で 展開できませんでした。\n" + (e.stderr || e.message), 5); }
    const pj = JSON.parse(readFileSync(join(tmp, "package", "package.json"), "utf8"));
    if(pj.name !== "three" || pj.version !== VERSION) die("package.json が three@" + VERSION + " ではありません。", 6);
    const mod = readFileSync(join(tmp, "package", "build", "three.module.js"), "utf8");
    if(!/REVISION/.test(mod) || !/WebGLRenderer/.test(mod)) die("three.module.js が Three.js ではないようです。", 7);
    mkdirSync(join(out, "build"), {recursive: true});
    copyFileSync(join(tmp, "package", "build", "three.module.js"), join(out, "build", "three.module.js"));
    copyFileSync(join(tmp, "package", "LICENSE"), join(out, "LICENSE"));
    const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
    const files = ["build/three.module.js", "LICENSE"].map((f) => ({path: f, sha256: sha(join(out, f)), bytes: readFileSync(join(out, f)).length}));
    writeFileSync(join(out, "MANIFEST.json"), JSON.stringify({name: "three", version: VERSION, license: pj.license || "MIT", source: "npm registry: three@" + VERSION + "（npm pack）", tarballIntegrity: integrity, verifiedAgainstRegistry: true, fetchedAt: new Date().toISOString(), files}, null, 2) + "\n");
    console.log("✔ " + out + " に おきました（three@" + VERSION + "）。\n  ブラウザで ?diag=1 を つけて ひらくと 読みこみ状況を かくにんできます。");
}finally{ try{ rmSync(tmp, {recursive: true, force: true}); }catch(e){} }
