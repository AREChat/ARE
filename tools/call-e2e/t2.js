"use strict";
// シナリオ2：管理者だけが 止める・再開できる（両方向）／管理者でない相手のなりすましは聞かない
const L = require("./lib.js"); const {ok} = L;
(async () => {
    // A＝ふつうのユーザー、B＝管理者（A から見た相手の ID が 管理者の ID）
    const R = await L.open2({idB:L.ADMIN_ID, adminB:true, adminA:false});
    const {A, B, S} = R;
    await L.connect(R, "audio", A, B);
    ok(JSON.stringify(await L.recState(A)) && (await L.recState(A)).on && (await L.recState(B)).on, "A・B とも録画中");
    // 管理者 B の＋の中には 止めるボタンが出る
    await L.openFeat(B, "rec");
    let btns = await B.evaluate(() => Array.from(document.querySelectorAll("#telxBody button")).map((b) => b.textContent));
    ok(btns.some((t) => /止める（管理者のみ）/.test(t)) && !btns.some((t) => /再開する/.test(t)), "B（管理者）：止めるボタンだけ出ている: " + btns.join("|"));
    ok(await B.evaluate(() => !/止める・再開するボタンは、管理者だけに表示されます/.test(document.getElementById("telxBody").textContent)), "B（管理者）：『管理者だけ』の注意は出ない");
    await L.closeSheet(B);
    // A（ふつう）の＋には 出ない
    await L.openFeat(A, "rec");
    btns = await A.evaluate(() => Array.from(document.querySelectorAll("#telxBody button")).map((b) => b.textContent));
    ok(!btns.some((t) => /止める|再開する/.test(t)), "A（ふつう）：ボタンなし");
    await L.closeSheet(A);
    await L.sleep(5000);   // 最初の1本に中身をためる
    // 管理者が止める
    await L.openFeat(B, "rec");
    await B.click("#telxBody button.dng");
    await L.until(async () => !(await L.recState(B)).on && (await L.recState(B)).mr === null || (await L.recState(B)).mr === "inactive", 8000, "B が止まる");
    await L.until(async () => !(await L.recState(A)).on, 8000, "A も止まる（管理者の指示）");
    ok(true, "管理者が止めると、相手の端末も止まる");
    ok((await L.badge(A)).text === "録音・録画は止まっています" && (await L.badge(A)).off, "A のバッジ：止まっています（" + JSON.stringify(await L.badge(A)) + "）");
    ok((await L.badge(B)).text === "録音・録画は止まっています", "B のバッジ：止まっています");
    ok(await B.evaluate(() => window.__toasts.some((t) => /録音・録画を止めました/.test(t))), "B：止めたと表示");
    ok(await A.evaluate(() => window.__toasts.some((t) => /管理者が、録音・録画を止めました/.test(t))), "A：管理者が止めたと表示");
    // 止まっている間は、A（ふつう）に 再開の手段がない
    const ra = await A.evaluate(() => { const c = window.AREtel.state.call; return {r:telxAdminResume(c), on:c.x.recOn}; });
    ok(ra.r === false && ra.on === false, "A：自分では再開できない");
    // なりすまし：ふつうの A が「再開して」と送っても B（管理者）は動かない…ではなく、B から見て相手(A)は管理者でないので無視
    await A.evaluate(() => window.AREtel.state.call.dc.send(JSON.stringify({t:"rec", on:true})));
    await L.sleep(800);
    ok((await L.recState(B)).on === false, "B：ふつうの相手からの『再開して』は聞かない");
    // 管理者が再開
    await B.evaluate(() => telxShow("rec"));
    await B.click("#telxBody button.pri");
    await L.until(async () => (await L.recState(B)).on && (await L.recState(A)).on, 10000, "再開で両方が録画");
    ok((await L.recState(A)).parts === 2 && (await L.recState(B)).parts === 2, "2本目（パート2）に入った");
    ok(await A.evaluate(() => window.__toasts.some((t) => /管理者が、録音・録画を再開しました/.test(t))), "A：再開を表示");
    ok((await L.badge(A)).text === "録音・録画中" && !(await L.badge(A)).off, "A のバッジ：録画中に戻る");
    await L.closeSheet(B);
    await L.sleep(5000);
    // もう一度止める → もう一度再開（連打に近い切りかえ）
    for(let i = 0; i < 2; i++){
        await L.sleep(1800);   // 短すぎると 中身のない記録になり、自動で捨てられます（仕様）
        await B.evaluate(() => { const c = window.AREtel.state.call; telxAdminStop(c); });
        await L.until(async () => !(await L.recState(A)).on && !(await L.recState(B)).on, 8000, "止まる " + i);
        await L.until(async () => !(await L.recState(B)).mr || (await L.recState(B)).mr === "inactive", 8000, "終了待ち " + i);
        await L.sleep(400);
        await B.evaluate(() => { const c = window.AREtel.state.call; telxAdminResume(c); });
        await L.until(async () => (await L.recState(A)).on && (await L.recState(B)).on, 10000, "再開 " + i);
    }
    ok((await L.recState(A)).parts === 4, "止める・再開を繰り返して 4 本目（" + (await L.recState(A)).parts + "）");
    await L.sleep(4500);
    // 管理者 B が切る
    await B.click("#telEnd");
    await L.until(() => A.evaluate(() => !window.AREtel.state.call), 15000, "A も切れる");
    // それぞれの端末に 4 本ずつ
    for(const [p, nm] of [[A, "A"], [B, "B"]]){
        const metas = await L.until(async () => { const m = await p.evaluate(async () => (await window.AREtelx.allMeta()).filter((x) => x.type === "rec").map((x) => ({id:x.id, part:x.part, done:x.done, bytes:x.bytes}))); return m.length === 4 && m.every((x) => x.done) ? m : null; }, 20000, nm + " の4本");
        ok(metas.every((m) => m.bytes > 0), nm + "：4本とも中身がある " + JSON.stringify(metas.map((m) => m.bytes)));
    }
    await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 8, 90000, "ドライブに8本");
    const names = S.files.map((f) => f.name);
    ok(S.files.length === 8, "ドライブに 8 本（両端末×4パート）: " + S.files.length);
    for(const part of [1, 2, 3, 4]) ok(names.filter((x) => new RegExp("_p" + part + "\\.webm$").test(x)).length === 2, "パート" + part + " が両端末分そろう");
    ok(new Set(names).size === names.length, "ファイル名が かぶらない");
    ok(S.finishes.length === 0, "finish は 呼ばない");
    // 通話の記録の画面
    await A.evaluate(() => window.AREtelx.viewer());
    await L.until(() => A.evaluate(() => document.querySelectorAll(".telx-vrow").length >= 4), 8000, "記録の画面");
    const rows = await A.evaluate(() => Array.from(document.querySelectorAll(".telx-vrow")).map((r) => r.textContent));
    ok(rows.length === 4 && rows.every((t) => /ドライブに保存ずみ/.test(t)), "記録の画面：4件とも『ドライブに保存ずみ』");
    ok(await A.evaluate(() => window.__errors.length) === 0 && await B.evaluate(() => window.__errors.length) === 0, "ページ内エラーなし");
    await R.close(); L.finish(); process.exit(L.T.fail ? 1 : 0);
})().catch((e) => { console.error("例外", e); process.exit(2); });
