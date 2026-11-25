"use strict";
// シナリオ5：4か国語（日本語のまま残らないか）／管理者が「かけた側」のとき
const L = require("./lib.js"); const {ok} = L;
const KANA = /[぀-ヿ]/;      // ひらがな・カタカナ
const CJK = /[㐀-鿿]/;
const ALLOW = /^(日本語|English|中文（简体）|한국어|中文)$/;
async function texts(p){
    return p.evaluate(() => {
        const out = [];
        const roots = [document.getElementById("telOv"), document.getElementById("telIn"), document.querySelector(".telx-viewer")].filter(Boolean);
        for(const r of roots){
            const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
            for(let n = w.nextNode(); n; n = w.nextNode()){ const t = n.nodeValue.trim(); if(t && !/^[\s\W\d_]*$/.test(t) && !n.parentElement.closest("textarea,pre")) out.push(t); }
            r.querySelectorAll("[aria-label],[title],[placeholder]").forEach((e) => { ["aria-label", "title", "placeholder"].forEach((a) => { const v = e.getAttribute(a); if(v) out.push(v); }); });
        }
        return out;
    });
}
function bad(lang, list){
    return list.filter((t) => !ALLOW.test(t) && (KANA.test(t) || (lang === "en" && CJK.test(t)) || (lang === "ko" && CJK.test(t) && !/[가-힯]/.test(t))));
}
(async () => {
    const WANT = {
        en:{badge:"Recording", note:"This call will be recorded (audio and video) automatically once connected.", tile:"Timer", min:"# Call minutes", memoPh:"Notes you write here become the minutes when the call ends."},
        zh:{badge:"正在录音／录像", note:"通话接通后将自动录音／录像。", tile:"计时器", min:"# 通话会议纪要", memoPh:"在此写下的笔记会在通话结束后成为会议纪要。"},
        ko:{badge:"녹음·녹화 중", note:"이 통화는 연결되면 자동으로 녹음·녹화됩니다.", tile:"타이머", min:"# 통화 회의록", memoPh:"여기에 적은 메모는 통화가 끝나면 회의록이 됩니다."}
    };
    for(const lang of ["en", "zh", "ko"]){
        console.log("--- 言語 " + lang);
        const R = await L.open2({lang}); const {A, B, S} = R;
        const W = WANT[lang];
        await A.evaluate(() => window.AREtel.start("video"));
        await L.until(() => A.evaluate(() => !!document.getElementById("telxNote")), 8000, "UI");
        await L.sleep(1200);   // 翻訳が反映されるのを待つ
        ok((await A.evaluate(() => document.getElementById("telxNote").textContent)) === W.note, lang + "：かけているとき、案内が訳されている");
        await B.evaluate(() => window.AREtel.tick());
        await L.until(() => B.evaluate(() => { const i = document.getElementById("telIn"); return i && !i.hidden; }), 25000, "着信");
        await L.sleep(800);
        ok(await B.evaluate((w) => document.querySelector("#telIn .telx-recnote").textContent === w, W.note), lang + "：着信の画面の案内が訳されている");
        let bl = bad(lang, await texts(B)); ok(bl.length === 0, lang + "：着信の画面に 日本語が残っていない " + JSON.stringify(bl));
        await B.click("#telInVideo");
        await L.until(() => A.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.startAt > 0), 40000, "A つながる");
        await L.until(() => B.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.startAt > 0), 40000, "B つながる");
        await L.sleep(1500);
        ok((await A.evaluate(() => document.getElementById("telxRecTx").textContent)) === W.badge, lang + "：REC バッジ『" + W.badge + "』");
        await A.click("#telPlus"); await L.sleep(500);
        ok((await A.evaluate(() => Array.from(document.querySelectorAll("#telxSheet .telx-tile")).map((t) => t.textContent.trim()))).some((t) => t.includes(W.tile)), lang + "：タイル名が訳されている（" + W.tile + "）");
        // 15 の画面を ぜんぶ開いて、日本語が残っていないか
        const feats = await A.evaluate(() => window.AREtelx.feats);
        let leftovers = [];
        bl = bad(lang, await texts(A)); if(bl.length) leftovers.push(["grid", bl]);
        for(const f of feats){
            await A.click('#telxSheet [data-f="' + f + '"]'); await L.sleep(350);
            if(f === "memo"){ const ph = await A.getAttribute("#telxBody textarea", "placeholder"); ok(ph === W.memoPh, lang + "：メモの入力欄の説明が訳されている"); await A.fill("#telxBody textarea", "x"); }
            if(f === "todo"){ await A.fill("#telxBody input[type=text]", "task"); await A.click("#telxBody button.pri"); }
            if(f === "mark"){ await A.click("#telxBody button.pri"); }
            if(f === "hand"){ await A.click("#telxBody button.pri"); await L.sleep(300); }
            await L.sleep(300);   // 自動翻訳が反映されるまで
            const b2 = bad(lang, await texts(A)); if(b2.length) leftovers.push([f, b2]);
            await A.click("#telxBack");
        }
        ok(leftovers.length === 0, lang + "：15機能の画面すべてで 日本語が残っていない " + JSON.stringify(leftovers).slice(0, 600));
        // 議事録
        await A.click('#telxSheet [data-f="min"]'); await L.sleep(300);
        const md = await A.inputValue("#telxBody textarea");
        ok(md.startsWith(W.min), lang + "：議事録の見出し『" + W.min + "』");
        ok(!KANA.test(md.replace(/ビー/g, "")), lang + "：議事録に 日本語（かな）が残っていない " + (md.match(KANA) ? md.slice(0, 400) : ""));
        await L.closeSheet(A);
        // 切る → 記録の画面
        await A.click("#telEnd");
        await L.until(() => A.evaluate(async () => (await window.AREtelx.allMeta()).some((m) => m.done)), 20000, "done");
        await A.evaluate(() => window.AREtelx.viewer()); await L.sleep(1500);
        bl = bad(lang, await texts(A)); ok(bl.length === 0, lang + "：記録の画面に 日本語が残っていない " + JSON.stringify(bl));
        ok(await A.evaluate(() => window.__errors.length) === 0 && await B.evaluate(() => window.__errors.length) === 0, lang + "：エラーなし");
        await R.close();
    }
    // ===== 管理者が かけた側 =====
    console.log("--- 管理者がかける");
    {
        const R = await L.open2({idA:L.ADMIN_ID, adminA:true, adminB:false}); const {A, B, S} = R;
        await L.connect(R, "video", A, B);
        ok((await L.recState(A)).on && (await L.recState(B)).on, "どちらも録画中");
        ok(await B.evaluate(() => window.AREtelx.canStop() === false), "B：ふつうのユーザー");
        await L.openFeat(A, "rec"); ok(await A.evaluate(() => !!document.querySelector("#telxBody button.dng")), "A（管理者）：止めるボタンあり"); await L.closeSheet(A);
        await L.sleep(3000);
        await A.evaluate(() => telxAdminStop(window.AREtel.state.call));
        await L.until(async () => !(await L.recState(B)).on, 8000, "B が止まる");
        ok(true, "管理者（かけた側）が止めると、出た側も止まる");
        ok((await L.badge(B)).text === "録音・録画は止まっています", "B のバッジ");
        // B が自分で戻す手段はない
        const rb = await B.evaluate(() => telxAdminResume(window.AREtel.state.call));
        ok(rb === false && !(await L.recState(B)).on, "B は再開できない");
        await A.evaluate(() => telxAdminResume(window.AREtel.state.call));
        await L.until(async () => (await L.recState(B)).on, 10000, "B も再開");
        ok(true, "管理者が再開すると、出た側も再開");
        // 管理者が止めたまま切る → どちらも ちゃんと保存される
        await L.sleep(2500);
        await A.evaluate(() => telxAdminStop(window.AREtel.state.call)); await L.sleep(1200);
        await A.click("#telEnd");
        await L.until(() => B.evaluate(() => !window.AREtel.state.call), 15000, "B 切れる");
        await L.until(() => S.files.filter((f) => /\.webm$/.test(f.name)).length >= 4, 80000, "2パート×2端末");
        ok(S.files.filter((f) => /\.webm$/.test(f.name)).length === 4, "止めたまま切っても、全パートが保存される（4本）");
        ok(S.finishes.length === 0, "finish は呼ばない");
        await R.close();
    }
    L.finish(); process.exit(L.T.fail ? 1 : 0);
})().catch((e) => { console.error("例外", e); process.exit(2); });
