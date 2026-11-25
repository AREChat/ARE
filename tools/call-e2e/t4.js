"use strict";
const OUT = (() => { const d = require("path").join(require("os").tmpdir(), "call-e2e") + "/"; require("fs").mkdirSync(d, {recursive:true}); return d; })();
// シナリオ4：うまくいかないとき（送信の失敗・再送・途中まで送った続き・オフライン・タブを閉じた・非対応の端末・記録の画面）
const L = require("./lib.js"); const {ok} = L; const fs = require("fs"), crypto = require("crypto"), cp = require("child_process");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const metasOf = (p) => p.evaluate(async () => (await window.AREtelx.allMeta()).map((x) => ({id:x.id, type:x.type, done:x.done, up:x.uploaded, tries:x.tries || 0, bytes:x.bytes, err:x.lastErr || "", rec:!!x.recovered, sess:!!x.sessionUrl, drive:x.driveId || ""})));
const quickCall = async (R, secs) => { await L.connect(R, "audio", R.A, R.B); await L.sleep(secs * 1000); await R.A.click("#telEnd"); await L.until(() => R.B.evaluate(() => !window.AREtel.state.call), 15000, "B が切れる"); await L.until(async () => (await metasOf(R.A)).every((m) => m.done) && (await metasOf(R.B)).every((m) => m.done) && (await metasOf(R.A)).length >= 1, 20000, "記録が done"); };

(async () => {
    // ===== 4-1 送信の失敗と再送 =====
    {
        console.log("--- 4-1 失敗と再送");
        const R = await L.open2({}); const {A, B, S} = R;
        await L.connect(R, "audio", A, B); await L.sleep(5000);
        S.faults.startFail = 2; S.faults.putFail = 2;
        await A.click("#telEnd");
        await L.until(() => B.evaluate(() => !window.AREtel.state.call), 15000, "B 切れる");
        // 自動で（約2.5秒後に）送りはじめる。start を2回ことわられ、PUT を2回ことわられても、あきらめずに最後は届く
        await L.until(async () => (await metasOf(A)).concat(await metasOf(B)).some((m) => m.tries >= 1), 20000, "失敗が記録される");
        const afterFail = (await metasOf(A)).concat(await metasOf(B));
        ok(afterFail.some((m) => /ドライブ|アップロード口/.test(m.err)), "失敗の理由が残る: " + afterFail.map((m) => m.err).join(" / ").slice(0, 100));
        ok(afterFail.every((m) => !m.up || m.drive), "失敗中に『保存ずみ』にはならない（うまくいった分以外）");
        for(let i = 0; i < 12 && S.files.filter((f) => /\.webm$/.test(f.name)).length < 2; i++){
            await A.evaluate(() => window.AREtelx.upload(50)); await B.evaluate(() => window.AREtelx.upload(50)); await L.sleep(3500);
        }
        await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 2, 30000, "最後は届く");
        const w = S.files.filter((f) => /\.webm$/.test(f.name));
        ok(w.length === 2 && new Set(w.map((f) => f.name)).size === 2, "失敗をはさんでも ちょうど2本（重複なし）: " + w.map((f) => f.name.slice(-30)).join(", "));
        const mm = (await metasOf(A)).concat(await metasOf(B));
        ok(mm.every((m) => m.up && m.drive && m.err === ""), "両方『保存ずみ』・エラー表示は消える");
        ok(S.finishes.length === 0, "finish は呼ばない");
        // 上のあいだ、通話中は送らない（通話中に送ろうとしても後回し）
        await R.close();
    }
    // ===== 4-2 8回失敗したら 止まり、『今すぐ送る』で もう一度 =====
    {
        console.log("--- 4-2 8回まで");
        const R = await L.open2({}); const {A, B, S} = R;
        S.faults.startFail = 1000;
        await quickCall(R, 4);
        for(let i = 0; i < 14; i++){ await A.evaluate(() => window.AREtelx.upload(30)); await L.sleep(500); if((await metasOf(A)).every((m) => m.tries >= 8)) break; }
        const tA = (await metasOf(A)).map((m) => m.tries);
        ok(tA.every((t) => t === 8), "8回で あきらめる（tries=" + tA + "）");
        const before = S.starts.length;
        await A.evaluate(() => window.AREtelx.upload(30)); await L.sleep(1500);
        ok(S.starts.length === before, "8回に達したあとは 自動では もう送らない");
        await A.evaluate(() => window.AREtelx.viewer());
        await L.until(() => A.evaluate(() => document.querySelectorAll(".telx-vrow").length >= 1), 5000, "記録の画面");
        ok(await A.evaluate(() => /⚠ 送れませんでした/.test(document.querySelector(".telx-vrow").textContent)), "記録の画面：⚠ 送れませんでした");
        S.faults.startFail = 0;
        await A.evaluate(() => { const b = Array.from(document.querySelectorAll(".telx-vrow button")).find((x) => /今すぐ送る/.test(x.textContent)); b.click(); });
        await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 1, 30000, "今すぐ送る で届く");
        await L.until(() => A.evaluate(() => /ドライブに保存ずみ/.test(document.querySelector(".telx-vrow").textContent)), 10000, "表示が保存ずみに");
        ok(true, "『今すぐ送る』で 再び送れて、表示も『保存ずみ』に変わる");
        await R.close();
    }
    // ===== 4-3 途中まで送った続き／もう届いていた／口がなくなっていた =====
    {
        console.log("--- 4-3 続きから");
        const R = await L.open2({}); const {A, S} = R;
        const make = (n) => A.evaluate(async (n) => {
            const bytes = new Uint8Array(n); for(let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 255;
            const id = "resume-" + n + "-" + Math.random().toString(36).slice(2, 6);
            await telxPutChunk(id, 0, new Blob([bytes.slice(0, Math.floor(n / 2))])); await telxPutChunk(id, 1, new Blob([bytes.slice(Math.floor(n / 2))]));
            const m = {id, type:"rec", callId:"cresume", part:1, roomId:"room-1", partnerName:"ビー", partnerId:"user-B-0002", uid:"user-A-0001", role:"caller", kind:"audio", startedAt:Date.now(), mime:"video/webm;codecs=vp9,opus", bytes:n, sec:3, done:true, uploaded:false, tries:0};
            await telxPutMeta(m);
            const s = await gasCall({action:"start", name:"manual_" + id + ".webm", size:n, mime:"video/webm", kind:"video"});
            return {id, sessionUrl:s.sessionUrl, n};
        }, n);
        const put = (sessionUrl, n, a, e) => A.evaluate(([u, n, a, e]) => new Promise((res) => { const bytes = new Uint8Array(n); for(let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 255; const x = new XMLHttpRequest(); x.open("PUT", u); x.setRequestHeader("Content-Range", "bytes " + a + "-" + (e - 1) + "/" + n); x.onload = () => res(x.status); x.onerror = () => res(0); x.send(new Blob([bytes.slice(a, e)])); }), [sessionUrl, n, a, e]);
        const expected = (n) => { const b = Buffer.alloc(n); for(let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255; return b; };
        // (a) 途中まで（40%）送ってあった
        const a = await make(100000);
        ok(await put(a.sessionUrl, a.n, 0, 40000) === 308, "（準備）40,000 バイトまで送ってある");
        await A.evaluate(([id, u]) => telxGetMeta(id).then((m) => { m.sessionUrl = u; return telxPutMeta(m); }), [a.id, a.sessionUrl]);
        S.putLog.length = 0;
        await A.evaluate(() => window.AREtelx.upload(50));
        await L.until(() => S.files.some((f) => f.name === "manual_" + a.id + ".webm"), 20000, "続きが届く");
        const fa = S.files.find((f) => f.name === "manual_" + a.id + ".webm");
        ok(fa.size === 100000 && sha(fa.buf) === sha(expected(100000)), "（a）続きから送って 1バイトも違わない");
        const lg = S.putLog.filter((x) => x.id === a.sessionUrl.split("/").pop());
        ok(lg.length >= 2 && /bytes \*\/100000/.test(lg[0].cr) && /^bytes 40000-99999\/100000$/.test(lg[1].cr), "（a）まず『どこまで届いた？』と聞き、40000 から送る: " + lg.map((x) => x.cr).join(" | "));
        // (b) もう全部届いていた（アプリが「できた」と受け取る前に閉じた）
        const b = await make(60000);
        ok(await put(b.sessionUrl, b.n, 0, 60000) === 200, "（準備）全部送ってある");
        await A.evaluate(([id, u]) => telxGetMeta(id).then((m) => { m.sessionUrl = u; return telxPutMeta(m); }), [b.id, b.sessionUrl]);
        const nb = S.files.length; S.putLog.length = 0;
        await A.evaluate(() => window.AREtelx.upload(50));
        await L.until(async () => (await metasOf(A)).find((m) => m.id === b.id).up, 15000, "届いていた分は 保存ずみに");
        ok(S.files.length === nb && S.putLog.every((x) => /bytes \*\//.test(x.cr)), "（b）もう届いていた分は 送りなおさない（問い合わせだけ）");
        // (c) 口がなくなっていた（404）→ 新しく作って送る
        const c = await make(50000);
        await A.evaluate(([id]) => telxGetMeta(id).then((m) => { m.sessionUrl = "https://drive.mock.test/up/deadbeefdeadbeef"; return telxPutMeta(m); }), [c.id]);
        await A.evaluate(() => window.AREtelx.upload(50));
        await L.until(() => S.files.some((f) => f.size === 50000), 20000, "新しい口で届く");
        const fc = S.files.find((f) => f.size === 50000);
        ok(sha(fc.buf) === sha(expected(50000)), "（c）古い口が使えなくても 新しく作って 送れる");
        ok(S.finishes.length === 0, "finish は呼ばない");
        await R.close();
    }
    // ===== 4-4 オフライン →オンライン =====
    {
        console.log("--- 4-4 オフライン");
        const R = await L.open2({}); const {A, B, S, ctxA} = R;
        await L.connect(R, "audio", A, B); await L.sleep(5000);
        await ctxA.setOffline(true);
        await L.sleep(300);
        await A.evaluate(() => window.AREtel.end("切りました"));   // オフラインのまま切る
        await L.until(async () => (await metasOf(A)).length >= 1 && (await metasOf(A)).every((m) => m.done), 15000, "A の記録が done");
        const s0 = S.starts.filter((x) => x.uid === "user-A-0001").length;
        await A.evaluate(() => window.AREtelx.upload(50)); await L.sleep(2500);
        ok(S.starts.filter((x) => x.uid === "user-A-0001").length === s0, "オフラインの間は 送ろうとしない");
        ok((await metasOf(A)).every((m) => !m.up && m.tries === 0), "オフラインでは『失敗の回数』も増えない");
        await ctxA.setOffline(false);
        await L.until(() => S.files.some((f) => /_caller_.*\.webm$/.test(f.name)), 40000, "オンラインに戻ると 自動で送る");
        ok(true, "オンラインに戻ると 自動で送りはじめる（A の分が届いた）");
        await R.close();
    }
    // ===== 4-5 タブを閉じてしまった：次に開いたとき、そこまでの分を救う =====
    {
        console.log("--- 4-5 タブを閉じた");
        const R = await L.open2({}); const {A, B, S, ctxA} = R;
        await L.connect(R, "audio", A, B);
        await L.openFeat(A, "memo"); await A.fill("#telxBody textarea", "閉じる前のメモ：A社に連絡"); await L.sleep(1200);
        await L.sleep(7000);   // 4秒ごとの保存が 1〜2回入る
        const callId = await A.evaluate(() => window.AREtel.state.call.id);
        await A.close({runBeforeUnload:false});
        // B は 相手が閉じたので切れる（ページを閉じるときの合図）
        await L.until(() => B.evaluate(() => !window.AREtel.state.call), 25000, "B：相手が閉じて切れる");
        ok(true, "A のタブを閉じると B の通話も終わる");
        const A2 = await ctxA.newPage();
        A2.on("pageerror", (e) => console.error("pageerror A2: " + e.message));
        await A2.goto(L.URL_(R.qa)); await A2.waitForFunction(() => window.__ready === true);
        await L.until(async () => { const m = await metasOf(A2); return m.length >= 2 && m.every((x) => x.done); }, 15000, "復旧で done になる");
        const m2 = await metasOf(A2);
        ok(m2.some((m) => m.type === "rec" && m.rec && m.bytes > 0), "録画：閉じる前までの分が 残っていて、『できたもの』になる " + JSON.stringify(m2.filter((m) => m.type === "rec").map((m) => m.bytes)));
        ok(m2.some((m) => m.type === "minutes" && m.rec), "メモ：閉じる前のメモが 議事録として残る");
        await L.until(() => S.files.some((f) => /_caller_.*\.webm$/.test(f.name)) && S.files.some((f) => /_minutes\.md$/.test(f.name) && /A社に連絡/.test(f.buf.toString("utf8"))), 40000, "復旧した分が ドライブへ");
        ok(true, "次に開いたとき 自動でドライブへ送る（録画・議事録）");
        const f = S.files.find((f) => /_caller_.*\.webm$/.test(f.name));
        const p = OUT + "recovered.webm"; fs.writeFileSync(p, f.buf);
        const fr = cp.spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", p], {encoding:"utf8"});
        ok(/video/.test(fr.stdout) && /audio/.test(fr.stdout), "復旧した録画も 映像と音声が読める");
        ok(await A2.evaluate((id) => localStorage.getItem("are_call_x_" + id) === null, callId), "途中保存のメモは 片づく");
        await R.close();
    }
    // ===== 4-6 録音・録画に対応していない端末 =====
    {
        console.log("--- 4-6 非対応");
        const R = await L.open2({qB:{nomr:"1"}}); const {A, B, S} = R;
        await L.connect(R, "audio", A, B); await L.sleep(3000);
        const sb = await L.recState(B);
        ok(sb && !sb.on && sb.err === "unsupported", "B：録画できない端末として扱う（" + JSON.stringify(sb) + "）");
        ok((await L.badge(B)).text === "この端末では録音・録画できません" && !(await L.badge(B)).hidden, "B：『この端末では録音・録画できません』と表示");
        await L.until(async () => (await L.badge(A)).peerWarn, 8000, "A に 相手は録画していないと出る");
        ok(true, "A：『相手の端末は、録音・録画していません』が出る");
        ok((await L.recState(A)).on, "A：自分の録画は続く");
        await L.openFeat(B, "rec");
        ok(await B.evaluate(() => /この端末では録音・録画できません/.test(document.querySelector("#telxBody .telx-big").textContent)), "B：＋の中でも同じ表示");
        await B.click("#telEnd");
        await L.until(() => A.evaluate(() => !window.AREtel.state.call), 15000, "A 切れる");
        await L.sleep(1500);
        ok((await metasOf(B)).filter((m) => m.type === "rec").length === 0, "B：録画の記録は作られない");
        await L.until(() => S.files.some((f) => /_caller_.*\.webm$/.test(f.name)), 40000, "A の分は届く");
        ok(S.files.filter((f) => /\.webm$/.test(f.name)).length === 1, "ドライブに届くのは A の1本だけ");
        ok(await B.evaluate(() => window.__errors.length) === 0 && await A.evaluate(() => window.__errors.length) === 0, "エラーなし");
        await R.close();
    }
    // ===== 4-7 記録の画面（再生・保存・削除） =====
    {
        console.log("--- 4-7 記録の画面");
        const R = await L.open2({}); const {A, B, S} = R;
        await L.connect(R, "video", A, B);
        await L.openFeat(A, "memo"); await A.fill("#telxBody textarea", "画面のテスト");
        await L.sleep(6000);
        await A.click("#telEnd");
        await L.until(() => S.files.length >= 3, 60000, "録画2本＋議事録");
        await L.sleep(500);
        // 「その他」の入口から開く
        await A.click("#telRecItem");
        await L.until(() => A.evaluate(() => document.querySelectorAll(".telx-vrow").length >= 2), 5000, "一覧");
        const rows = await A.evaluate(() => Array.from(document.querySelectorAll(".telx-vrow")).map((r) => r.textContent));
        ok(rows.length === 2 && rows.every((t) => /ドライブに保存ずみ/.test(t)) && rows.some((t) => /議事録/.test(t)), "一覧：録画1＋議事録1（" + rows.length + "）");
        ok(await A.evaluate(() => /ここで削除しても、ドライブに送ったものは消えません/.test(document.querySelector(".telx-vnote").textContent)), "一覧：削除してもドライブは消えない案内");
        // 再生
        await A.evaluate(() => { const r = Array.from(document.querySelectorAll(".telx-vrow")).find((x) => !/議事録/.test(x.textContent)); Array.from(r.querySelectorAll("button")).find((b) => /再生/.test(b.textContent)).click(); });
        await L.until(() => A.evaluate(() => { const v = document.querySelector(".telx-video"); return v && v.videoWidth === 960; }), 10000, "動画が再生できる");
        ok(true, "再生：960x540 の動画が読み込まれる");
        // 議事録を見る
        await A.evaluate(() => { const r = Array.from(document.querySelectorAll(".telx-vrow")).find((x) => /議事録/.test(x.textContent)); Array.from(r.querySelectorAll("button")).find((b) => /見る/.test(b.textContent)).click(); });
        ok(await A.evaluate(() => /画面のテスト/.test(document.querySelector(".telx-pre").textContent)), "議事録：見る");
        // 保存（ダウンロード）
        await A.evaluate(() => { window.__aTrace = []; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ window.__aTrace.push({dl:this.getAttribute("download"), blob:/^blob:/.test(this.href)}); return o.apply(this, arguments); }; });
        const [dl] = await Promise.all([A.waitForEvent("download", {timeout:8000}), A.evaluate(() => { const r = Array.from(document.querySelectorAll(".telx-vrow")).find((x) => !/議事録/.test(x.textContent)); Array.from(r.querySelectorAll("button")).find((b) => b.textContent === "保存").click(); })]);
        const tr = await A.evaluate(() => window.__aTrace);
        ok(tr.length === 1 && tr[0].blob && /^call_\d{8}-\d{6}_.*_p1\.webm$/.test(tr[0].dl), "保存：ダウンロードが始まる／名前は " + (tr[0] && tr[0].dl));   // ※ 日本語の名前のとき Playwright は suggestedFilename を 'download' と返す（テスト道具の癖）。ページ側の download 属性を確認
        const dlp = OUT + "viewer_saved.webm"; await dl.saveAs(dlp);
        const sp = cp.spawnSync("ffmpeg", ["-v", "error", "-i", dlp, "-f", "null", "-"], {encoding:"utf8"});
        ok(sp.status === 0 && !sp.stderr.trim(), "保存したファイルは 最後まで再生（デコード）できる");
        // 削除：1回目は確認、4秒たつと戻る、2回目で消える
        const delBtn = () => A.evaluate(() => { const r = Array.from(document.querySelectorAll(".telx-vrow")).find((x) => !/議事録/.test(x.textContent)); const b = r && r.querySelector(".telx-del"); return b ? b.textContent : null; });
        await A.evaluate(() => { const r = Array.from(document.querySelectorAll(".telx-vrow")).find((x) => !/議事録/.test(x.textContent)); r.querySelector(".telx-del").click(); });
        await L.sleep(300);
        ok(await delBtn() === "もう一度で削除", "削除：1回目は『もう一度で削除』");
        await L.sleep(4500);
        ok(await delBtn() === "削除", "削除：4秒たつと元に戻る（まちがい防止）");
        const nFiles = S.files.length;
        for(let i = 0; i < 2; i++){ await A.evaluate(() => { const r = Array.from(document.querySelectorAll(".telx-vrow")).find((x) => !/議事録/.test(x.textContent)); r && r.querySelector(".telx-del").click(); }); await L.sleep(400); }
        await L.sleep(500);
        ok(await A.evaluate(() => document.querySelectorAll(".telx-vrow").length) === 1, "削除：2回目で 消える（議事録だけ残る）");
        ok(S.files.length === nFiles, "ドライブのファイルは 消えない");
        ok((await metasOf(A)).filter((m) => m.type === "rec").length === 0, "端末の記録（録画）は 消えた（チャンクも）");
        const chunks = await A.evaluate(() => telxReq("chunk", "readonly", (tx) => tx.objectStore("chunk").count()));
        ok(chunks === 0, "端末の中の 録画のかけらも 残っていない（" + chunks + "）");
        // Esc で閉じる
        await A.keyboard.press("Escape");
        ok(await A.evaluate(() => !document.querySelector(".telx-viewer")), "Esc で閉じる");
        ok(await A.evaluate(() => window.__errors.length) === 0, "エラーなし");
        await R.close();
    }
    // ===== 4-8 大きい記録の送信中に通話がはじまったら、区切りで一時ストップ →終わったら続きから =====
    {
        console.log("--- 4-8 通話に譲る");
        const R = await L.open2({}); const {A, B, S} = R;
        const N = 5 * 1048576 + 12345;   // 2MB の区切りで 3 回
        const mk = await A.evaluate(async (n) => {
            const bytes = new Uint8Array(n); for(let i = 0; i < n; i++) bytes[i] = (i * 131 + 17) & 255;
            const id = "big-" + Math.random().toString(36).slice(2, 6); const cut = [0, 1048576 * 2, 1048576 * 4, n];
            for(let k = 0; k < 3; k++) await telxPutChunk(id, k, new Blob([bytes.slice(cut[k], cut[k + 1])]));
            await telxPutMeta({id, type:"rec", callId:"cbig", part:1, roomId:"room-1", partnerName:"ビー", partnerId:"user-B-0002", uid:"user-A-0001", role:"caller", kind:"audio", startedAt:Date.now(), mime:"video/webm", bytes:n, sec:9, done:true, uploaded:false, tries:0});
            return id;
        }, N);
        const expected = Buffer.alloc(N); for(let i = 0; i < N; i++) expected[i] = (i * 131 + 17) & 255;
        S.faults.putDelay = 700;
        S.putLog.length = 0;
        await A.evaluate(() => window.AREtelx.upload(50));
        await L.until(() => S.putLog.length >= 1, 8000, "最初の区切りが届く");
        // ここで通話がはじまったことにする
        await A.evaluate(() => { window.AREtel.state.call = {fake:true}; });
        await L.sleep(4000);
        const during = S.putLog.length;
        ok(during <= 2 && during >= 1, "通話がはじまると 区切りで止まる（届いた区切り " + during + " / 3）");
        const m1 = (await metasOf(A)).find((m) => m.id === mk);
        ok(m1 && !m1.up && m1.tries === 0, "止まっても『失敗の回数』は増えない（tries=" + (m1 && m1.tries) + "）");
        await L.sleep(2500);
        ok(S.putLog.length === during, "通話中は ずっと送らない");
        S.faults.putDelay = 0;
        await A.evaluate(() => { window.AREtel.state.call = null; window.AREtelx.upload(50); });
        await L.until(() => S.files.some((f) => f.size === N), 30000, "通話が終わると 続きから送って完成");
        const f = S.files.find((f) => f.size === N);
        ok(require("crypto").createHash("sha256").update(f.buf).digest("hex") === require("crypto").createHash("sha256").update(expected).digest("hex"), "続きから送って、1バイトも違わない（" + Math.round(N / 1048576 * 10) / 10 + " MB）");
        const cr = S.putLog.map((x) => x.cr).filter((c) => !/\*/.test(c));
        ok(new Set(cr).size === cr.length, "同じ区切りを 二度送らない: " + cr.join(" | "));
        await R.close();
    }
    L.finish(); process.exit(L.T.fail ? 1 : 0);
})().catch((e) => { console.error("例外", e); process.exit(2); });
