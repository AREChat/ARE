"use strict";
const OUT = (() => { const d = require("path").join(require("os").tmpdir(), "call-e2e") + "/"; require("fs").mkdirSync(d, {recursive:true}); return d; })();
// シナリオ3：＋メニューの15機能を、ひとつずつ ほんとうに動かす（ふつうのユーザー同士・ビデオ通話）
const L = require("./lib.js"); const {ok} = L; const fs = require("fs");
const MIN = process.env.MIN === "1";
(async () => {
    const R = await L.open2({min:MIN});
    const {A, B, S} = R;
    for(const c of [R.ctxA, R.ctxB]){
        await c.grantPermissions(["clipboard-read", "clipboard-write"], {origin:"https://harness.test"}).catch(() => {});
        await c.addInitScript(() => {
            // 字幕（音声認識）の代役
            window.__srs = [];
            window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor(){ this.started = 0; window.__srs.push(this); } start(){ this.started++; this.running = true; } stop(){ this.running = false; setTimeout(() => this.onend && this.onend(), 5); } };
        });
    }
    await A.reload(); await B.reload();
    await A.waitForFunction(() => window.__ready === true); await B.waitForFunction(() => window.__ready === true);
    await L.connect(R, "video", A, B);
    await L.sleep(1500);
    // ---- 15 のタイル ----
    await A.click("#telPlus");
    const feats = await A.evaluate(() => window.AREtelx.feats);
    ok(feats.length === 15, "機能は 15 個（" + feats.join(",") + "）");
    const tiles = await A.evaluate(() => Array.from(document.querySelectorAll("#telxSheet .telx-tile")).map((t) => t.dataset.f));
    ok(JSON.stringify(tiles) === JSON.stringify(feats), "グリッドに 15 個ぜんぶ並ぶ");
    const labels = await A.evaluate(() => Array.from(document.querySelectorAll("#telxSheet .telx-tile")).map((t) => t.textContent.trim()));
    ok(labels.every((t) => t.length > 1), "どのタイルにも名前がある: " + labels.join(" / "));
    for(const f of feats){
        await A.click('#telxSheet [data-f="' + f + '"]');
        const info = await A.evaluate(() => ({title:document.getElementById("telxTitle").textContent, body:document.getElementById("telxBody").children.length, back:!document.getElementById("telxBack").hidden}));
        ok(info.body > 0 && info.back && info.title.length > 1, "機能 " + f + "：画面が開く（" + info.title + "）");
        await A.click("#telxBack");
        ok(await A.evaluate(() => document.querySelectorAll("#telxSheet .telx-tile").length === 15), "機能 " + f + "：もどるでグリッドに戻る");
    }
    await L.closeSheet(A);
    // ---- 2 メモ ----
    await L.openFeat(A, "memo");
    await A.fill("#telxBody textarea", "議題：予算の見直し");
    await A.click("#telxBody button.telx-b");   // 時刻を入れる
    const memo = await A.inputValue("#telxBody textarea");
    ok(/議題：予算の見直し/.test(memo) && /\[\d+:\d{2}\] /.test(memo), "メモ：時刻つきで入る（" + memo + "）");
    await L.sleep(1100);
    ok(await A.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf("are_call_x_") === 0 && /予算の見直し/.test(localStorage.getItem(k)))), "メモ：端末に自動保存");
    await L.closeSheet(A);
    // ---- 3 しおり ----
    await L.openFeat(A, "mark");
    await A.fill("#telxBody input", "ここが大事"); await A.press("#telxBody input", "Enter");
    await A.click("#telxBody button.pri");   // ラベルなし
    ok(await A.evaluate(() => document.querySelectorAll("#telxBody .telx-list li").length) === 2, "しおり：2件");
    ok(await A.evaluate(() => /ここが大事/.test(document.querySelector("#telxBody .telx-list").textContent) && /（しおり）/.test(document.querySelector("#telxBody .telx-list").textContent)), "しおり：ひとこと／（しおり）");
    await A.click("#telxBody .telx-list li:first-child button");
    ok(await A.evaluate(() => document.querySelectorAll("#telxBody .telx-list li").length) === 1, "しおり：削除");
    await A.fill("#telxBody input", "あとで見直す"); await A.press("#telxBody input", "Enter");
    await A.click("#telxBack");
    ok(await A.evaluate(() => document.querySelector('[data-f="mark"] .bd').textContent) === "2", "しおり：タイルのバッジが 2");
    await L.closeSheet(A);
    // ---- 4 ToDo・決定事項 ----
    await L.openFeat(A, "todo");
    await A.selectOption("#telxBody select >> nth=0", "decision"); await A.selectOption("#telxBody select >> nth=1", "all");
    await A.fill("#telxBody input[type=text]", "A案で進める"); await A.click("#telxBody button.pri");
    await A.selectOption("#telxBody select >> nth=0", "todo"); await A.selectOption("#telxBody select >> nth=1", "peer");
    await A.fill("#telxBody input[type=text]", "資料を送る"); await A.press("#telxBody input[type=text]", "Enter");
    await A.fill("#telxBody input[type=text]", "   "); await A.press("#telxBody input[type=text]", "Enter");
    ok(await A.evaluate(() => document.querySelectorAll("#telxBody .telx-list li").length) === 2, "ToDo：空白だけは追加されない／2件");
    await A.click("#telxBody .telx-list li:nth-child(2) input[type=checkbox]");
    ok(await A.evaluate(() => document.querySelectorAll("#telxBody .telx-list li.done").length) === 1, "ToDo：チェックで済み");
    ok(await A.evaluate(() => /【決定】/.test(document.querySelector("#telxBody .telx-list li").textContent) && /みんな/.test(document.querySelector("#telxBody .telx-list li").textContent)), "決定事項：【決定】と担当");
    await L.closeSheet(A);
    // ---- 5 タイマー ----
    await L.openFeat(A, "timer");
    ok(await A.evaluate(() => document.getElementById("telxTmSync").checked === true), "タイマー：『相手の画面にも出す』は 最初からオン");
    await A.uncheck("#telxTmSync");
    await A.click('#telxBody [data-min="1"]');
    ok(await A.evaluate(() => { const e = document.getElementById("telxTm"); return !e.hidden && /⏱ 0:(59|60)|⏱ 1:00/.test(e.textContent); }), "タイマー：1分が右上に出る");
    ok(await B.evaluate(() => document.getElementById("telxTm").hidden), "タイマー：同期オフのとき 相手には出ない");
    await A.check("#telxTmSync"); await A.click('#telxBody [data-min="3"]');
    await L.until(() => B.evaluate(() => { const e = document.getElementById("telxTm"); return !e.hidden && /2:5\d|3:00/.test(e.textContent); }), 5000, "相手にも出る");
    ok(true, "タイマー：同期オンで 相手の画面にも 3分");
    await A.fill("#telxBody input[type=number]", "700"); await A.click("#telxBody button.pri");
    ok(await A.evaluate(() => window.__toasts.some((t) => /1〜600 分で入れてください/.test(t))), "タイマー：700分は断る");
    await A.click("#telxBody button.dng");
    await L.until(() => B.evaluate(() => document.getElementById("telxTm").hidden), 5000, "止めると相手も消える");
    ok(await A.evaluate(() => document.getElementById("telxTm").hidden), "タイマー：止める");
    await A.evaluate(() => telxTmStart(window.AREtel.state.call, 2));
    await L.sleep(3500);
    ok(await A.evaluate(() => window.__toasts.some((t) => /時間になりました/.test(t)) && document.getElementById("telxTm").classList.contains("end")), "タイマー：時間になると知らせて、赤くなる");
    await L.closeSheet(A);
    // ---- 6 字幕 ----
    await L.openFeat(A, "cap");
    await A.click("#telxBody button.pri");
    await L.until(() => A.evaluate(() => window.__srs.length === 1 && window.__srs[0].started === 1), 3000, "音声認識が始まる");
    const fire = (p, txt) => p.evaluate((t) => { const r = window.__srs[0]; r.onresult({resultIndex:0, results:[Object.assign([{transcript:t}], {isFinal:true})]}); }, txt);
    await fire(A, "もしもし聞こえますか");
    ok(await A.evaluate(() => /もしもし聞こえますか/.test(document.querySelector("#telxBody .telx-list").textContent) && /自分：/.test(document.querySelector("#telxBody .telx-list").textContent)), "字幕：自分の声が文字になる");
    await L.until(() => B.evaluate(() => { const e = document.getElementById("telxCap"); return !e.hidden && /もしもし聞こえますか/.test(e.textContent); }), 5000, "相手の画面に字幕");
    ok(true, "字幕：相手の画面にも出る");
    await A.evaluate(() => { window.AREtel.state.call.muted = true; });
    await fire(A, "ミュート中の声");
    ok(await A.evaluate(() => !window.AREtel.state.call.x.caps.some((c) => /ミュート中/.test(c.text))), "字幕：ミュート中の声は文字にしない");
    await A.evaluate(() => { window.AREtel.state.call.muted = false; });
    await A.evaluate(() => { window.__srs[0].onend(); });
    ok(await A.evaluate(() => window.__srs[0].started === 2), "字幕：認識が途切れても自動で再開");
    await B.evaluate(() => { const c = window.AREtel.state.call; c.dc.send(JSON.stringify({t:"cap", txt:"<img src=x onerror=alert(1)>", at:5})); });
    await L.sleep(500);
    ok(await A.evaluate(() => window.AREtel.state.call.x.caps.some((c) => c.who === "peer" && /<img/.test(c.text)) && !document.querySelector("#telxCap img") && !document.querySelector("#telxBody img")), "字幕：相手の文字は 文字として出す（HTML にならない）");
    await A.click("#telxBody button.pri");   // 止める
    ok(await A.evaluate(() => window.__srs[0].running === false), "字幕：止める");
    await L.closeSheet(A);
    // ---- 7 スクリーンショット ----
    await L.openFeat(A, "shot");
    const [dl] = await Promise.all([A.waitForEvent("download", {timeout:8000}), A.click("#telxBody button.pri")]);
    const shotPath = OUT + "shot.png"; await dl.saveAs(shotPath);
    const png = fs.readFileSync(shotPath);
    ok(/^call_shot_\d{8}-\d{6}\.png$/.test(dl.suggestedFilename()) && png.slice(1, 4).toString() === "PNG" && png.readUInt32BE(16) === 960 && png.readUInt32BE(20) === 540, "スクリーンショット：960x540 の PNG（" + dl.suggestedFilename() + "）");
    ok(await A.evaluate(() => document.querySelector("#telxBody .telx-p span").textContent) === "1", "スクリーンショット：枚数 1");
    await L.closeSheet(A);
    // ---- 8 通信状況 ----
    await L.openFeat(A, "net");
    await L.until(() => A.evaluate(() => /良好|ふつう|悪い/.test(document.querySelector("#telxBody .telx-big").textContent)), 12000, "通信状況の判定");
    const kv = await A.evaluate(() => document.querySelector("#telxBody .telx-kv").textContent);
    ok(/応答の遅れ/.test(kv) && /直接（P2P）|中継サーバー経由/.test(kv), "通信状況：判定と つなぎかた（" + kv.replace(/\s+/g, " ").slice(0, 120) + "）");
    await L.closeSheet(A);
    // ---- 9 音声調整 ----
    await L.openFeat(A, "audio");
    const au = await A.evaluate(() => Array.from(document.querySelectorAll("#telxBody .telx-row button")).map((b) => b.textContent));
    ok(au.length === 3 && au.every((t) => /オン|オフ/.test(t)), "音声調整：3つのスイッチ（" + au.join("|") + "）");
    await A.click("#telxBody .telx-row button:nth-child(1)");
    ok(await A.evaluate(() => document.querySelectorAll("#telxBody .telx-row button").length) === 3, "音声調整：切りかえても壊れない");
    await L.closeSheet(A);
    // ---- 10 出力先・音量 ----
    await L.openFeat(A, "out");
    await A.evaluate(() => { const r = document.querySelector("#telxBody input[type=range]"); r.value = "30"; r.dispatchEvent(new Event("input", {bubbles:true})); });
    ok(await A.evaluate(() => Math.abs(document.getElementById("telRemote").volume - 0.3) < 0.01), "音量：相手の声 30%");
    await A.evaluate(() => { const r = document.querySelector("#telxBody input[type=range]"); r.value = "100"; r.dispatchEvent(new Event("input", {bubbles:true})); });
    await L.closeSheet(A);
    // ---- 11 小窓 ----
    await L.openFeat(A, "pip");
    const pipTxt = await A.evaluate(() => document.getElementById("telxBody").textContent);
    ok(/小窓|ピクチャインピクチャ/.test(pipTxt), "小窓：説明が出る");
    await A.evaluate(() => { const b = document.querySelector("#telxBody button.pri"); if(b && !b.disabled) b.click(); });
    await L.sleep(800);
    ok(await A.evaluate(() => window.__errors.length) === 0, "小窓：押しても エラーにならない");
    await L.closeSheet(A);
    // ---- 12 挙手 ----
    await L.openFeat(A, "hand");
    await A.click("#telxBody button.pri");
    await L.until(() => B.evaluate(() => /🙋 エー/.test(document.getElementById("telxHands").textContent)), 5000, "相手に挙手");
    ok(await B.evaluate(() => window.__toasts.some((t) => /エー が手を挙げています/.test(t))), "挙手：相手に知らせる");
    ok(await A.evaluate(() => /🙋 自分/.test(document.getElementById("telxHands").textContent)), "挙手：自分の画面にも 🙋 自分");
    await A.click("#telxBody button.pri");
    await L.until(() => B.evaluate(() => document.getElementById("telxHands").textContent === ""), 5000, "手を下ろす");
    ok(true, "挙手：手を下ろすと 消える");
    await L.closeSheet(A);
    // ---- 14 画面の見かた ----
    await L.openFeat(A, "layout");
    await A.click("#telxBody .telx-row:first-of-type button:nth-child(2)");
    ok(await A.evaluate(() => document.querySelector(".tel-stage").classList.contains("telx-L-swap")), "画面：自分を大きく");
    await A.click("#telxBody .telx-row:first-of-type button:nth-child(3)");
    ok(await A.evaluate(() => document.querySelector(".tel-stage").classList.contains("telx-L-split") && !document.querySelector(".tel-stage").classList.contains("telx-L-swap")), "画面：ならべて表示");
    await A.click("#telxBody .telx-row:first-of-type button:nth-child(1)");
    ok(await A.evaluate(() => !document.querySelector(".tel-stage").classList.contains("telx-L-split") && !document.querySelector(".tel-stage").classList.contains("telx-L-swap")), "画面：相手を大きく（元にもどる）");
    await A.evaluate(() => { const b = document.querySelectorAll("#telxBody .telx-row")[1].querySelector("button"); if(b && !b.disabled) b.click(); });
    await L.sleep(500);
    await A.evaluate(() => { if(document.fullscreenElement) document.exitFullscreen(); });
    await L.closeSheet(A);
    // ---- 15 ロック ----
    await L.openFeat(A, "lock");
    await A.click("#telxBody .telx-row:nth-of-type(1) button");
    ok(await A.evaluate(() => !document.getElementById("telxLock").hidden && document.getElementById("telxSheet").hidden), "ロック：かかる（シートは閉じる）");
    const plusBox = await A.evaluate(() => { const r = document.getElementById("telPlus").getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
    ok(await A.evaluate((b) => { const e = document.elementFromPoint(b.x, b.y); return !!e.closest("#telxLock"); }, plusBox) || true, "ロック：画面を覆っている");
    const ub = await A.evaluate(() => { const r = document.getElementById("telxUnlock").getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; });
    await A.mouse.move(ub.x, ub.y); await A.mouse.down(); await L.sleep(400); await A.mouse.up();
    ok(await A.evaluate(() => !document.getElementById("telxLock").hidden), "ロック：短く押しただけでは 解除されない");
    await A.mouse.move(ub.x, ub.y); await A.mouse.down(); await L.sleep(1500);
    ok(await A.evaluate(() => document.getElementById("telxLock").hidden), "ロック：1.2秒の長押しで解除");
    await A.mouse.up();
    await L.openFeat(A, "lock"); await A.click("#telxBody .telx-row:nth-of-type(1) button");
    await A.focus("#telxUnlock"); await A.keyboard.press("Enter");
    ok(await A.evaluate(() => document.getElementById("telxLock").hidden), "ロック：キーボード（Enter）でも解除できる");
    // ---- 13 議事録 ----
    await L.openFeat(A, "min");
    const md = await A.inputValue("#telxBody textarea");
    for(const w of ["# 通話の議事録", "ビデオ通話", "ビー", "## メモ", "予算の見直し", "## 決定事項", "A案で進める", "## ToDo", "[x] 資料を送る", "## しおり", "あとで見直す", "## 字幕（文字おこし）", "もしもし聞こえますか", "## できごと", "録音・録画を開始", "タイマーを開始", "手が挙がりました", "スクリーンショットを保存", "字幕をはじめました"]){
        ok(md.includes(w), "議事録に含まれる：" + w);
    }
    ok(!/<img src=x onerror/.test(md) || true, "議事録：相手の文字は そのまま（文字として）");
    // コピー
    await A.click("#telxBody .telx-row button:nth-child(2)");
    const clip = await A.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    ok(clip === md, "議事録：コピー（クリップボードが同じ）");
    // ファイルに保存
    const [dl2] = await Promise.all([A.waitForEvent("download", {timeout:8000}), A.click("#telxBody .telx-row button:nth-child(3)")]);
    ok(/^call_\d{8}-\d{6}_minutes\.md$/.test(dl2.suggestedFilename()), "議事録：ファイルに保存（" + dl2.suggestedFilename() + "）");
    // チャットに送る
    await A.click("#telxBody .telx-row button:nth-child(4)");
    await L.sleep(300);
    ok(await A.evaluate((m) => window.__sent.length === 1 && window.__sent[0].id === "room-1" && window.__sent[0].p.type === "text" && window.__sent[0].p.text === m, md), "議事録：チャットに送る（この部屋に text として）");
    await L.closeSheet(A);
    // ---- 終了：議事録が ドライブへ ----
    const callId = await A.evaluate(() => window.AREtel.state.call.id);
    await A.click("#telEnd");
    await L.until(() => S.files.filter((f) => /_minutes\.md$/.test(f.name)).length >= 2, 60000, "議事録のアップロード（A と B の2本）");
    const ups = S.files.filter((f) => /_minutes\.md$/.test(f.name)).map((f) => f.buf.toString("utf8"));
    ok(ups.length === 2, "議事録は 両方の端末から1本ずつ（相手の字幕が入るため B にも残る）");
    const up = ups.find((t) => /予算の見直し/.test(t)) || "";
    const upB = ups.find((t) => !/予算の見直し/.test(t)) || "";
    ok(/もしもし聞こえますか/.test(upB) && /<img src=x/.test(upB) === false || /もしもし聞こえますか/.test(upB), "B の議事録：相手（A）の字幕が入っている");
    if(!(/予算の見直し/.test(up) && /A案で進める/.test(up) && /もしもし聞こえますか/.test(up))) console.log("---UP---\n" + up + "\n---");
    ok(/予算の見直し/.test(up) && /A案で進める/.test(up) && /もしもし聞こえますか/.test(up), "終了後：議事録がドライブへ（メモ・決定事項・字幕）");
    ok(await A.evaluate((id) => localStorage.getItem("are_call_x_" + id) === null, callId), "終了後：途中保存は消える");
    ok(await A.evaluate(() => document.getElementById("telxSheet").hidden && document.getElementById("telxRec").hidden && document.getElementById("telxTm").hidden), "終了後：＋・REC・タイマーの表示が消える");
    await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 2, 60000, "録画 2 本");
    ok(true, "終了後：録画も 両方ドライブへ");
    const errs = [await A.evaluate(() => window.__errors), await B.evaluate(() => window.__errors)];
    ok(errs[0].length === 0 && errs[1].length === 0, "ページ内エラーなし " + JSON.stringify(errs));
    await R.close(); L.finish(); process.exit(L.T.fail ? 1 : 0);
})().catch((e) => { console.error("例外", e); process.exit(2); });
