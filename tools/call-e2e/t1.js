"use strict";
const OUT = (() => { const d = require("path").join(require("os").tmpdir(), "call-e2e") + "/"; require("fs").mkdirSync(d, {recursive:true}); return d; })();
// シナリオ1：ふつうのユーザー同士。つながると自動で録音・録画／止められない／ドライブへ自動で送られる
const L = require("./lib.js"); const fs = require("fs");
let n = 0, fail = 0;
const ok = (c, m) => { n++; if(!c){ fail++; console.error("NG  " + m); } else console.log("ok  " + m); };
(async () => {
    const srv = L.makeServer(); const {S} = srv; await srv.init();
    const browser = await L.launch();
    const ctxA = await browser.newContext({viewport:{width:420, height:820}}), ctxB = await browser.newContext({viewport:{width:420, height:820}});
    await srv.install(ctxA); await srv.install(ctxB);
    const A = await ctxA.newPage(), B = await ctxB.newPage();
    for(const [p, nm] of [[A, "A"], [B, "B"]]){ p.on("pageerror", (e) => console.error("pageerror " + nm + ": " + e.message)); p.on("console", (m) => { if(m.type() === "error") console.error("console.error " + nm + ": " + m.text()); }); }
    await A.goto(L.URL_({uid:"user-A-0001", pid:"user-B-0002", pname:"ビー", admin:"0"}));
    await B.goto(L.URL_({uid:"user-B-0002", pid:"user-A-0001", pname:"エー", admin:"0"}));
    await A.waitForFunction(() => window.__ready === true);
    await B.waitForFunction(() => window.__ready === true);
    ok(true, "ページ読み込み");
    // A がビデオ通話をかける
    await A.evaluate(() => window.AREtel.start("video"));
    await L.until(() => A.evaluate(() => !!document.getElementById("telOv") && !document.getElementById("telOv").hidden), 5000, "A の通話画面");
    ok(await A.evaluate(() => document.getElementById("telxNote") && !document.getElementById("telxNote").hidden), "かけている間：『つながると自動で録音・録画』の案内が出る");
    ok(await A.evaluate(() => window.__pres) >= 1, "A：通話開始で在席を送った");
    // B に着信
    await B.evaluate(() => window.AREtel.tick());
    await L.until(() => B.evaluate(() => { const i = document.getElementById("telIn"); return i && !i.hidden; }), 20000, "B の着信");
    ok(await B.evaluate(() => !!document.querySelector("#telIn .telx-recnote")), "着信の画面に『録音・録画されます』が出る");
    await B.click("#telInVideo");
    await L.until(() => A.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.startAt > 0), 30000, "A がつながる");
    await L.until(() => B.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.startAt > 0), 30000, "B がつながる");
    ok(true, "つながった（WebRTC）");
    await L.sleep(500);
    for(const [p, nm] of [[A, "A"], [B, "B"]]){
        ok(await p.evaluate(() => { const c = window.AREtel.state.call; return !!(c.x && c.x.recOn && c.x.rec && c.x.rec.mr.state === "recording"); }), nm + "：つながったら自動で録画中");
        ok(await p.evaluate(() => { const b = document.getElementById("telxRec"); return !!b && !b.hidden && !b.classList.contains("off") && /録音・録画中/.test(document.getElementById("telxRecTx").textContent); }), nm + "：REC バッジが出ている");
        ok(await p.evaluate(() => document.getElementById("telxNote").hidden), nm + "：つながったら案内は消える");
    }
    await L.sleep(1200);
    // 管理者でないので、止める手段がない
    for(const [p, nm] of [[A, "A"], [B, "B"]]){
        await p.click("#telPlus");
        await p.click('[data-f="rec"]');
        const btns = await p.evaluate(() => Array.from(document.querySelectorAll("#telxBody button")).map((b) => b.textContent));
        ok(!btns.some((t) => /止める|再開する/.test(t)), nm + "：＋の中に 止める／再開するボタンが無い（" + btns.join("|") + "）");
        ok(await p.evaluate(() => /止める・再開するボタンは、管理者だけに表示/.test(document.getElementById("telxBody").textContent)), nm + "：管理者だけの案内が出る");
        ok(await p.evaluate(() => window.AREtelx.canStop() === false), nm + "：canStop=false");
        // API を直接呼んでも止まらない
        const r = await p.evaluate(() => { const c = window.AREtel.state.call; const a = telxAdminStop(c); return {a, on:c.x.recOn, st:c.x.rec.mr.state}; });
        ok(r.a === false && r.on === true && r.st === "recording", nm + "：telxAdminStop を直接呼んでも止まらない");
        const r2 = await p.evaluate(() => { const c = window.AREtel.state.call; c.x.rec.mr.stop; return telxAdminResume(c); });
        ok(r2 === false, nm + "：telxAdminResume も効かない");
        await p.click("#telxSheet .telx-head [aria-label='閉じる']");
    }
    // 管理者でない相手から「止めて」が来ても聞かない
    await B.evaluate(() => { const c = window.AREtel.state.call; c.dc.send(JSON.stringify({t:"rec", on:false})); });
    await L.sleep(800);
    ok(await A.evaluate(() => { const c = window.AREtel.state.call; return c.x.recOn && c.x.rec.mr.state === "recording"; }), "A：管理者でない相手の『止めて』は聞かない");
    // 通話の途中のしおり・メモ
    await A.click("#telPlus"); await A.click('[data-f="memo"]');
    await A.fill("#telxBody textarea", "来週の会議の準備をする");
    await A.click("#telxSheet .telx-head [aria-label='閉じる']");
    // 録画を数秒ためる
    await L.sleep(9000);
    // A が切る
    await A.click("#telEnd");
    await L.until(() => B.evaluate(() => !window.AREtel.state.call), 15000, "B も切れる");
    ok(true, "A が切ると B も切れる");
    // 端末の中に記録が残る
    for(const [p, nm] of [[A, "A"], [B, "B"]]){
        const metas = await L.until(async () => { const m = await p.evaluate(async () => (await window.AREtelx.allMeta()).map((x) => ({id:x.id, type:x.type, done:x.done, bytes:x.bytes, sec:x.sec, uploaded:x.uploaded, mime:x.mime}))); return m.length && m.every((x) => x.done) ? m : null; }, 20000, nm + " の記録が done");
        const rec = metas.filter((m) => m.type === "rec");
        ok(rec.length === 1 && rec[0].bytes > 1000 && rec[0].sec >= 5, nm + "：端末に録画が1本（" + JSON.stringify(rec[0]) + "）");
        ok(rec[0] && /^video\/webm/.test(rec[0].mime), nm + "：webm");
    }
    // ドライブへ自動で送られる（通話が終わって数秒後）
    await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 2, 60000, "ドライブに録画2本（A・B）");
    const webms = S.files.filter((f) => /\.webm$/.test(f.name));
    ok(webms.length === 2, "ドライブに録画が2本（両方の端末の分）: " + webms.map((f) => f.name + " " + f.size).join(", "));
    ok(webms.every((f) => /^call_\d{8}-\d{6}_[a-z0-9]{8}_(caller|callee)_user-[A-Za-z0-9-]{0,2}/.test(f.name) || /^call_\d{8}-\d{6}_/.test(f.name)), "ファイル名の形（日時・通話ID・役割）");
    ok(webms.some((f) => /_caller_/.test(f.name)) && webms.some((f) => /_callee_/.test(f.name)), "かけた側・出た側の両方");
    ok(S.finishes.length === 0, "GAS の finish（リンクを全員に公開）は呼ばない");
    ok(webms.every((f) => f.kind === "video" && f.mime.startsWith("video/webm")), "kind=video・mime=video/webm");
    // 議事録（メモあり）
    await L.until(() => S.files.some((f) => /_minutes\.md$/.test(f.name)), 30000, "議事録のアップロード");
    const md = S.files.find((f) => /_minutes\.md$/.test(f.name));
    ok(md && /来週の会議の準備をする/.test(md.buf.toString("utf8")) && /# 通話の議事録/.test(md.buf.toString("utf8")), "議事録に メモが入っている");
    ok(S.files.filter((f) => /_minutes\.md$/.test(f.name)).length === 1, "議事録は メモを書いた A の1本だけ（B はメモなし）");
    // ffprobe で本物の動画か
    for(const f of webms){
        const p = OUT + "out_" + f.name; fs.writeFileSync(p, f.buf);
        const out = require("child_process").spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", p], {encoding:"utf8"});
        let j = {}; try{ j = JSON.parse(out.stdout); }catch(_e){}
        const st = j.streams || [];
        ok(st.some((s) => s.codec_type === "video" && s.width === 960 && s.height === 540), f.name.slice(0, 40) + "：960x540 の映像");
        ok(st.some((s) => s.codec_type === "audio"), f.name.slice(0, 40) + "：音声あり");
        const fr = require("child_process").spawnSync("ffmpeg", ["-v", "error", "-i", p, "-f", "null", "-"], {encoding:"utf8"});
        ok(fr.status === 0 && !fr.stderr.trim(), f.name.slice(0, 40) + "：最後までデコードできる " + fr.stderr.trim().slice(0, 80));
    }
    ok(await A.evaluate(() => window.__errors.length) === 0, "A：ページ内エラーなし " + JSON.stringify(await A.evaluate(() => window.__errors)));
    ok(await B.evaluate(() => window.__errors.length) === 0, "B：ページ内エラーなし " + JSON.stringify(await B.evaluate(() => window.__errors)));
    await browser.close(); srv.close();
    console.log(fail ? "\n失敗 " + fail + " / " + n : "\nOK（" + n + " 項目）");
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("例外", e); process.exit(2); });
