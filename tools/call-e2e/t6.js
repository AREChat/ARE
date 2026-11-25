"use strict";
const OUT = (() => { const d = require("path").join(require("os").tmpdir(), "call-e2e") + "/"; require("fs").mkdirSync(d, {recursive:true}); return d; })();
// シナリオ6：長い通話（約2分・いろいろ操作しながら）→ すぐ2本目の通話（送信は通話中は後回し）
const L = require("./lib.js"); const {ok} = L; const fs = require("fs"), cp = require("child_process");
const DIR = OUT + "";
const heap = (p) => p.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
(async () => {
    const SOAK = Number(process.env.SOAK || 120);
    const R = await L.open2({}); const {A, B, S} = R;
    await L.connect(R, "video", A, B);
    const h0 = await heap(A);
    const t0 = Date.now(); let i = 0, shots = 0;
    while((Date.now() - t0) / 1000 < SOAK){
        i++;
        const k = i % 6;
        if(k === 0){ await A.evaluate(() => { const c = window.AREtel.state.call; telxSetHand(c, !c.x.hand); }); }
        if(k === 1){ await A.evaluate((n) => { const c = window.AREtel.state.call; c.x.layout = ["remote", "swap", "split"][n % 3]; telxApplyLayout(c); }, i); }
        if(k === 2){ await B.evaluate(() => { const c = window.AREtel.state.call; c.x.marks.push({at:telxElapsed(c), label:"m" + c.x.marks.length}); telxPersist(c); }); }
        if(k === 3){ await A.evaluate(() => telxTmStart(window.AREtel.state.call, 7)); }
        if(k === 4){ await B.evaluate(() => { const c = window.AREtel.state.call; telxSetHand(c, !c.x.hand); }); }
        if(k === 5 && i % 12 === 5){ await A.evaluate(async () => { const c = window.AREtel.state.call; await telxSnap(c); c.x.shots++; }); shots++; }
        // 画面の開け閉め（開いたまま通信状況を数秒）
        if(i % 9 === 0){ await L.openFeat(A, "net"); await L.sleep(2500); await L.closeSheet(A); }
        await L.sleep(4000);
        const ra = await L.recState(A), rb = await L.recState(B);
        if(!(ra && ra.on && rb && rb.on)){ ok(false, "録画が止まった t=" + Math.round((Date.now() - t0) / 1000) + JSON.stringify([ra, rb])); break; }
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    ok(true, "約 " + elapsed + " 秒、操作しながら 録画が続いた（" + i + " 回の操作）");
    await A.evaluate(() => { const c = window.AREtel.state.call; if(c.x.hand) telxSetHand(c, false); });
    // チャンク数（4秒ごと）
    const ch = await A.evaluate(() => telxReq("chunk", "readonly", (tx) => tx.objectStore("chunk").count()));
    ok(ch >= Math.floor(elapsed / 4) - 2 && ch <= Math.ceil(elapsed / 4) + 3, "端末の保存：かけら " + ch + " 個（4秒ごと・約 " + Math.round(elapsed / 4) + " 個）");
    const h1 = await heap(A);
    ok(h1 === 0 || h1 - h0 < 40 * 1048576, "JS のメモリ増加 " + Math.round((h1 - h0) / 1048576) + " MB（40MB未満）");
    ok(await A.evaluate(() => window.__errors.length) === 0 && await B.evaluate(() => window.__errors.length) === 0, "エラーなし");
    // 切って、すぐ 2本目をかける（送信は通話中は後回し）
    await A.click("#telEnd");
    await L.until(() => B.evaluate(() => !window.AREtel.state.call), 15000, "B 切れる");
    await L.sleep(300);
    const calls0 = S.files.length;
    await L.connect(R, "audio", B, A);   // 今度は B がかける
    ok(true, "切った直後に 2本目の通話がつながった");
    await L.sleep(1500);
    const n1 = S.putLog.length; await L.sleep(6000); const n2 = S.putLog.length;
    ok(n2 - n1 <= 1, "2本目の通話中は ドライブへ送らない（後回し）: 通話中に増えた送信 " + (n2 - n1) + " 回（送りかけの1回まで）");
    await B.click("#telEnd");
    await L.until(() => A.evaluate(() => !window.AREtel.state.call), 15000, "A 切れる");
    await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 4, 120000, "4本（2通話×2端末）");
    ok(S.files.filter((f) => /\.webm$/.test(f.name)).length === 4, "通話が終わったあと 4本ぜんぶ届く");
    const big = S.files.filter((f) => /\.webm$/.test(f.name)).sort((a, b) => b.size - a.size).slice(0, 2);
    for(const f of big){
        const p = DIR + "soak_" + f.name.replace(/[^\w.-]/g, "_"); fs.writeFileSync(p, f.buf);
        const r = cp.spawnSync("ffmpeg", ["-v", "error", "-stats", "-i", p, "-f", "null", "-"], {encoding:"utf8"});
        const mt = /time=(\d+):(\d+):(\d+)/g; let m, last = null; while((m = mt.exec(r.stderr))) last = m;
        const sec = last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0;
        ok(r.status === 0 && Math.abs(sec - elapsed) <= 8, f.name.slice(0, 34) + "：" + Math.round(f.size / 1024) + " KB・再生時間 約 " + sec + " 秒（通話 " + elapsed + " 秒）");
        const pr = cp.spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames,avg_frame_rate", "-of", "csv=p=0", p], {encoding:"utf8"});
        const nb = Number((pr.stdout.split(",")[1] || pr.stdout.split(",")[0] || "0").trim());
        ok(nb > elapsed * 3, f.name.slice(0, 20) + "：映像のコマ数 " + nb + "（10fps ねらい。多いほど滑らか）");
    }
    await R.close(); L.finish(); process.exit(L.T.fail ? 1 : 0);
})().catch((e) => { console.error("例外", e); process.exit(2); });
