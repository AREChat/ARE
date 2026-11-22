"use strict";
// ===== 行動予定表：そのほかの機能（予定ボット・予定表チェック・場所メモ・思い出カード・声の操作の画面・みんなの待ち時間の表示）=====
// ・予定ボットは、外のサービスも AI も使いません。この端末の中の「ルール」と「あなたの実績」だけで、予定を考えます（無料・通信なし）。

// ---------- 画面の上の「道具のならび」----------
function itnStripHtml(plan){
    const n = plan ? itnCheck(plan).filter((x) => x.t !== "notime").length : 0;
    return '<div class="itn-strip">' +
        '<button type="button" data-t="itin:bot">🤖 予定ボット</button>' +
        '<button type="button" data-t="itin:check">✅ チェック' + (n ? ' <em>' + n + '</em>' : '') + '</button>' +
        '<button type="button" class="' + (itn.voiceOn ? "on" : "") + '" data-t="itin:voice">🎙 声で操作' + (itn.voiceOn ? "（ON）" : "") + '</button>' +
        '<button type="button" class="' + (itn.prefs.speak ? "on" : "") + '" data-t="itin:speak">🔊 読み上げ ' + (itn.prefs.speak ? "ON" : "OFF") + '</button>' +
        '<button type="button" data-t="itin:sayplan">📣 のこりを読む</button></div>';
}

// ---------- 予定表チェック＆自動調整 ----------
function itnCheckHtml(plan){
    let h = '<button type="button" class="itn-back" data-t="itin:back">← もどる</button><div class="itn-card"><div class="itn-card-t">✅ 予定表チェック</div>';
    if(!plan || !plan.items.length) return h + '<p class="itn-meta">予定が まだ ありません。</p></div>';
    const L = itnCheck(plan);
    const real = L.filter((x) => x.t !== "notime");
    if(!L.length) h += '<div class="itn-big-t ok">✨ 問題は 見つかりませんでした</div><p class="itn-meta">時刻の重なり・間に合わない予定・お昼ごはんの抜けを 調べました。</p>';
    else{
        h += '<p class="itn-meta">' + real.length + '件、気になる点が あります。</p>';
        L.forEach((x) => { h += '<div class="itn-chk-row ' + x.t + '"><span>' + (x.t === "lap" || x.t === "rev" ? "⚠" : x.t === "meal" ? "🍴" : x.t === "notime" ? "🕐" : "💡") + '</span><div>' + itnE(x.msg) + (x.id ? ' <button type="button" class="itn-link" data-t="itin:edit" data-id="' + itnE(x.id) + '">直す</button>' : '') + '</div></div>'; });
    }
    h += '</div>';
    if(real.some((x) => x.t === "rev" || x.t === "slot" || x.t === "lap")) h += '<button type="button" class="itn-big" data-t="itin:autofix">🪄 まとめて 自動で直す</button><div class="itn-meta">終わりと始まりの入れちがいを直し、待ちが入らない枠をひろげ、重なりを ずらして、時刻の順にならべます。まだ やっていない予定だけが対象です。</div>';
    if(itn.undoAll && itn.undoAll.pid === plan.id) h += '<button type="button" class="itn-big sec" data-t="itin:undoall">↩ 自動で直す前に もどす</button>';
    return h;
}

// ---------- 場所メモ ----------
const itnHav = (a, b) => { const R = 6371000, t = (x) => x * Math.PI / 180, dl = t(b[0] - a[0]), dg = t(b[1] - a[1]); const s = Math.sin(dl / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const itnMapUrl = (p) => "https://www.openstreetmap.org/?mlat=" + p[0] + "&mlon=" + p[1] + "#map=18/" + p[0] + "/" + p[1];
const itnNavUrl = (p) => "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + p[0] + "," + p[1];
function itnPrevPlace(plan, it){
    const i = plan.items.indexOf(it); for(let j = i - 1; j >= 0; j--){ if(plan.items[j].p) return plan.items[j]; } return null;
}
function itnWalkText(plan, it){
    if(!it.p) return ""; const pv = itnPrevPlace(plan, it); if(!pv) return "";
    const d = itnHav(pv.p, it.p), min = Math.max(1, Math.ceil(d * 1.3 / 80));
    return "「" + pv.n + "」から 約" + (d >= 1000 ? (d / 1000).toFixed(1) + "km" : Math.round(d / 10) * 10 + "m") + "・歩いて 約" + min + "分";
}
function itnPlaceHtml(plan, it){
    let h = '<div class="itn-place"><button type="button" data-t="itin:place" data-id="' + it.i + '">📍 ' + (it.p ? "場所を 今の位置に 更新" : "いまの場所を おぼえる") + '</button>';
    if(it.p) h += '<a class="itn-link" data-lc-done="1" href="' + itnE(itnMapUrl(it.p)) + '" target="_blank" rel="noopener noreferrer">🗺 地図で見る</a><a class="itn-link" data-lc-done="1" href="' + itnE(itnNavUrl(it.p)) + '" target="_blank" rel="noopener noreferrer">🚶 ここへ案内</a><button type="button" class="itn-link" data-t="itin:placedel" data-id="' + it.i + '">消す</button>';
    h += '</div>';
    if(it.p){ const w = itnWalkText(plan, it); if(w) h += '<div class="itn-meta">🚶 ' + itnE(w) + '</div>'; }
    return h;
}
function itnPlaceGet(plan, it){
    if(!navigator.geolocation){ showToast("このブラウザでは 位置情報を使えません。"); return; }
    showToast("場所を しらべています…");
    navigator.geolocation.getCurrentPosition((pos) => {
        it.p = [Math.round(pos.coords.latitude * 1e4) / 1e4, Math.round(pos.coords.longitude * 1e4) / 1e4];
        itnTouch(plan); showToast("📍 場所をおぼえました。" + (itnWalkText(plan, it) ? itnWalkText(plan, it) : "")); if(typeof itnRender === "function") itnRender();
    }, (err) => { showToast(err && err.code === 1 ? "位置情報が 許可されていません（ブラウザの設定で 許可してください）。" : "場所を取得できませんでした。"); }, {enableHighAccuracy: true, timeout: 12000, maximumAge: 30000});
}

// ---------- みんなの待ち時間（表示）----------
function itnCrowdLine(it){
    const c = itnCrowdOf(it.n); if(!c || !c.n) return "";
    return '<div class="itn-hint">👥 みんなの待ち時間：平均 <b>' + Math.round(c.avg) + '分</b>（まん中 ' + Math.round(c.med) + '分・' + c.users + '人 ' + c.n + '件・名前は わかりません）' + (it.st === "t" ? ' <button type="button" class="itn-link" data-t="itin:usehist" data-id="' + it.i + '" data-v="' + Math.round(c.med) + '">予想に使う</button>' : '') + '</div>';
}

// ---------- 思い出カード（画像）----------
const ITN_MFONT = '"Hiragino Sans","Yu Gothic","Noto Sans CJK JP","Noto Sans JP","Meiryo",system-ui,sans-serif';
function itnBadgeList(plan){
    const its = plan.items, done = its.filter((x) => x.st === "x"), st = itnStats(plan), B = [];
    if(done.some((x) => x.w > 0 && x.aw != null && x.aw <= x.w - 10)) B.push("⚡ 予想より 10分以上 早かった");
    if(done.some((x) => x.w > 0 && x.aw != null && Math.abs(x.aw - x.w) <= 2)) B.push("🎯 予想ぴったり");
    if(done.some((x) => x.aw != null && x.aw >= 30)) B.push("🧘 30分以上 待てた");
    if(its.filter((x) => x.nt).length >= 3) B.push("📝 メモを3つ以上");
    if(its.some((x) => x.r === 5)) B.push("🌟 ★5をつけた");
    if(st.cmp >= 2 && st.expDone > st.actDone) B.push("⏱ 待ちが 予想より 短い");
    if(its.length >= 3 && done.length + st.skip === its.length) B.push("🏁 ぜんぶ おわった");
    return B;
}
function itnWrapG(g, text, maxW, maxLines){
    const out = []; let line = "";
    for(const ch of Array.from(String(text))){
        if(g.measureText(line + ch).width > maxW && line){ out.push(line); line = ch; if(out.length >= maxLines) break; } else line += ch;
    }
    if(out.length < maxLines && line) out.push(line);
    return out;
}
function itnMemoryCanvas(plan){
    const W = 1080, H = 1440, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), st = itnStats(plan);
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#1b2a6e"); bg.addColorStop(.55, "#6a3df0"); bg.addColorStop(1, "#ff6fb1");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.globalAlpha = .12; g.fillStyle = "#fff"; [[140, 160, 200], [940, 260, 150], [880, 1260, 260], [120, 1180, 130]].forEach((o) => { g.beginPath(); g.arc(o[0], o[1], o[2], 0, Math.PI * 2); g.fill(); }); g.globalAlpha = 1;
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fillStyle = fill; g.fill(); };
    g.textBaseline = "alphabetic"; g.fillStyle = "rgba(255,255,255,.85)"; g.font = "600 34px " + ITN_MFONT; g.fillText("🎴 きょうの 思い出カード", 70, 100);
    g.fillStyle = "#fff"; g.font = "800 74px " + ITN_MFONT;
    const tl = itnWrapG(g, plan.title, W - 140, 2); tl.forEach((s, i) => g.fillText(s, 70, 205 + i * 90));
    let y = 205 + tl.length * 90 - 20;
    g.font = "500 36px " + ITN_MFONT; g.fillStyle = "rgba(255,255,255,.9)"; g.fillText(itnDateLabel(plan.date), 70, y + 30); y += 80;
    rr(50, y, W - 100, 700, 36, "rgba(255,255,255,.96)");
    const kp = [["完了", st.done + " / " + st.total, "#4b3bd6"], ["待ち時間 合計", st.waitN ? itnDur(st.actAll) : "—", "#e0457b"], ["平均の待ち", st.waitN ? itnDur(st.avg) : "—", "#0e9f6e"]];
    const tw = (W - 100 - 80 - 40) / 3;
    kp.forEach((k, i) => { const x = 90 + i * (tw + 20); rr(x, y + 30, tw, 170, 24, "#f2f0ff"); g.fillStyle = "#6b7390"; g.font = "500 28px " + ITN_MFONT; g.fillText(k[0], x + 22, y + 78); g.fillStyle = k[2]; g.font = "800 52px " + ITN_MFONT; g.fillText(itnWrapG(g, k[1], tw - 30, 1)[0] || "", x + 22, y + 156); });
    let yy = y + 250; g.fillStyle = "#1b2033";
    if(st.longest){ g.font = "700 36px " + ITN_MFONT; g.fillText("🐢 いちばん待った", 90, yy); g.font = "500 36px " + ITN_MFONT; g.fillStyle = "#4a5170"; itnWrapG(g, st.longest.n + "（" + st.longest.aw + "分）", W - 200, 1).forEach((s) => g.fillText(s, 120, yy + 52)); yy += 110; }
    if(st.cmp){ const d = st.expDone - st.actDone; g.fillStyle = "#1b2033"; g.font = "700 36px " + ITN_MFONT; g.fillText("🎯 予想とくらべて", 90, yy); g.font = "600 40px " + ITN_MFONT; g.fillStyle = d >= 0 ? "#0e9f6e" : "#e0457b"; g.fillText(d >= 0 ? itnDur(d) + " 早かった ✨" : itnDur(-d) + " 長かった", 120, yy + 54); yy += 112; }
    const fav = plan.items.filter((x) => x.r >= 4 || x.nt).sort((a, b) => b.r - a.r).slice(0, 3);
    if(fav.length){ g.fillStyle = "#1b2033"; g.font = "700 36px " + ITN_MFONT; g.fillText("⭐ お気に入り・ひとこと", 90, yy); yy += 20;
        fav.forEach((x) => { yy += 52; g.font = "600 34px " + ITN_MFONT; g.fillStyle = "#3a4163"; const t = (x.r ? "★".repeat(x.r) + " " : "") + x.n; g.fillText(itnWrapG(g, t, W - 220, 1)[0], 120, yy); if(x.nt){ g.font = "500 28px " + ITN_MFONT; g.fillStyle = "#6b7390"; yy += 40; g.fillText(itnWrapG(g, "「" + x.nt + "」", W - 240, 1)[0], 140, yy); } }); }
    const B = itnBadgeList(plan).slice(0, 4);
    let by = y + 700 + 50;
    if(B.length){ g.font = "600 34px " + ITN_MFONT; B.forEach((b, i) => { const bx = 70 + (i % 2) * ((W - 140) / 2), byy = by + Math.floor(i / 2) * 78; rr(bx, byy, (W - 140) / 2 - 14, 62, 31, "rgba(255,255,255,.2)"); g.fillStyle = "#fff"; g.fillText(itnWrapG(g, b, (W - 140) / 2 - 60, 1)[0], bx + 24, byy + 43); }); }
    g.fillStyle = "rgba(255,255,255,.8)"; g.font = "500 30px " + ITN_MFONT; g.fillText("ARE 行動予定表で 記録しました", 70, H - 60);
    return c;
}
function itnMemoryExport(plan){
    const c = itnMemoryCanvas(plan), base = itnFileBase(plan) + "_思い出カード";
    c.toBlob((blob) => { if(!blob){ showToast("画像を作れませんでした。"); return; } downloadBlob(blob, base + ".jpg"); showToast("「" + base + ".jpg」を 保存しました。"); }, "image/jpeg", .92);
}

// ---------- 予定ボット（AI・通信なし）----------
const ITN_BOT_KIND = [
    ["park", "🎡 テーマパーク", /テーマパーク|遊園地|パーク|アトラクション|遊びに|あそびに/],
    ["trip", "🧳 旅行・おでかけ", /旅行|観光|おでかけ|お出かけ|ドライブ|ハイキング|散歩|日帰り|温泉|ピクニック/],
    ["work", "💼 仕事・勉強", /仕事|勉強|在宅|作業|オフィス|テスト|宿題/],
    ["event", "🎤 ライブ・イベント", /ライブ|イベント|フェス|コンサート|試合|展示|祭り|まつり|花火/],
    ["queue", "🏥 病院・役所", /病院|役所|銀行|受付|診察|手続|免許/],
    ["shop", "🛍 買い物", /買い物|ショッピング|セール|アウトレット|モール/]
];
const itnKindLabel = (k) => (ITN_BOT_KIND.find((x) => x[0] === k) || [0, "予定"])[1];
const itnCircle = (n) => "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"[n - 1] || String(n);
function itnBotNorm(s){ try{ return String(s || "").normalize("NFKC"); }catch(_e){ return String(s || ""); } }
/** 話した言葉から、条件を ひろう（時刻・種類・こども・ペース・ほしいもの）*/
function itnBotParse(text){
    const t = itnBotNorm(text), o = {};
    for(const k of ITN_BOT_KIND){ if(k[2].test(t)){ o.kind = k[0]; break; } }
    const times = []; let m; const re = /(\d{1,2})\s*(?::|時)\s*(\d{1,2})?\s*分?/g;
    while((m = re.exec(t))){ const h = Number(m[1]), mi = Number(m[2] || 0); if(h < 24 && mi < 60) times.push(h * 60 + mi); }
    if(times.length >= 2){ o.start = Math.min(times[0], times[1]); o.end = Math.max(times[0], times[1]); }
    else if(times.length === 1){ if(/まで|終わ|おわ|帰/.test(t) && !/から|はじ|始|開始/.test(t)) o.end = times[0]; else o.start = times[0]; }
    if(o.start == null && o.end == null){
        if(/終日|一日|1日|丸一日|まる1日|朝から夜/.test(t)){ o.start = 540; o.end = 1140; }
        else if(/半日|午前だけ|午前中だけ/.test(t)){ o.start = 540; o.end = 780; }
        else if(/午後だけ|午後から/.test(t)){ o.start = 780; o.end = 1080; }
    }
    if(/こども|子ども|子供|赤ちゃん|ベビー|幼児|キッズ|孫/.test(t)) o.kids = true;
    if(/ゆっくり|のんびり|まったり|ほどほど|少なめ|疲れたくない/.test(t)) o.pace = 0.7;
    else if(/たくさん|がっつり|詰め込|ぎっしり|いっぱい|効率|全部|ぜんぶ/.test(t)) o.pace = 1.35;
    if(/ショー|パレード|ステージ/.test(t)) o.show = true;
    if(/食べ歩き|グルメ|ごはん|ご飯|食べ/.test(t)) o.eat = true;
    if(/おみやげ|お土産|買い物|ショッピング/.test(t)) o.shop = true;
    if(/ジェットコースター|絶叫|スリル|のりもの|乗り物/.test(t)) o.thrill = true;
    return o;
}
/** あなたの これまでの実績から、「待ちは予想の何倍だったか」を 推測する（3件以上あるときだけ）*/
function itnLearnFactor(){
    let a = 0, e = 0, n = 0;
    Object.keys(itn.plans).forEach((pid) => itn.plans[pid].items.forEach((x) => { if(x.st === "x" && x.aw != null && x.w > 0){ a += x.aw; e += x.w; n++; } }));
    if(n < 3 || e <= 0) return {f: 1, n: 0};
    return {f: Math.min(2, Math.max(0.5, a / e)), n};
}
/** 時間帯ごとの、待ち時間の目安（分）。午前は すいていて、昼すぎが いちばん こむ、という一般的なかたむき。 */
function itnWaitGuess(min, kind, o, fac){
    const h = min / 60;
    let base = kind === "park" ? 28 : kind === "event" ? 25 : kind === "queue" ? 20 : kind === "shop" ? 10 : 8;
    const curve = h < 10.5 ? 0.75 : h < 12 ? 1.1 : h < 15.5 ? 1.35 : h < 17.5 ? 1.0 : 0.8;
    let w = base * curve * (o.pace && o.pace < 1 ? 0.9 : 1) * fac;
    if(o.thrill) w *= 1.15;
    return Math.max(0, Math.round(w / 5) * 5);
}
/** 条件から、1日の予定を つくる */
function itnBotBuild(o){
    const kind = o.kind || "park", pace = o.pace || 1, kids = !!o.kids, lf = itnLearnFactor(), fac = lf.f;
    let start = o.start != null ? o.start : 540, end = Math.min(o.end != null ? o.end : 1080, 23 * 60 + 30);
    if(end - start < 120) end = Math.min(start + 180, 23 * 60 + 30);
    const items = [], rnd = (v) => Math.round(v / 5) * 5;
    let cur = start, nAct = 0, nBreak = 0, sinceRest = 0, lunch = false, showDone = false, paradeDone = false, shopDone = false;
    const cfg = {
        park: {title: "テーマパークの1日", open: ["入口に集合・入場", "move", 30], close: ["退園・帰りの電車", "move", 50], act: "アトラクション", actKind: "act", ride: 20, gap: 10},
        trip: {title: "旅行・おでかけの1日", open: ["出発・移動", "move", 60], close: ["帰りの移動", "move", 60], act: "観光スポット", actKind: "act", ride: 70, gap: 15},
        work: {title: "仕事・勉強の1日", open: ["朝のしたく・移動", "move", 30], close: ["ふりかえり・かたづけ", "work", 30], act: "集中タイム", actKind: "work", ride: 80, gap: 5},
        event: {title: "ライブ・イベントの日", open: ["集合・物販の列", "shop", 60], close: ["帰りの電車", "move", 50], act: "イベント", actKind: "show", ride: 100, gap: 15},
        queue: {title: "順番待ちの日", open: ["受付", "work", 15], close: ["会計・かたづけ", "work", 20], act: "手続き", actKind: "work", ride: 20, gap: 5},
        shop: {title: "買い物の1日", open: ["出発・移動", "move", 30], close: ["帰りの移動", "move", 40], act: "お店めぐり", actKind: "shop", ride: 50, gap: 10}
    }[kind];
    const push = (name, k, dur, w) => { items.push({n: name, k, s: itnHM(cur), e: itnHM(cur + dur), w: w > 0 ? w : null}); cur += dur; };
    push(cfg.open[0], cfg.open[1], cfg.open[2], kind === "event" ? rnd(waitFor(cur, 1)) : 0);
    function waitFor(min, mult){ return itnWaitGuess(min, kind, o, fac) * mult; }
    cur += cfg.gap;
    const closeDur = cfg.close[2], restEvery = kids ? 90 : (pace < 1 ? 110 : 160);
    let guard = 0;
    while(cur + 35 <= end - closeDur - 5 && guard++ < 40){
        const left = end - closeDur - cur;
        if(!lunch && kind !== "queue" && cur >= 11 * 60 + 15 && cur <= 14 * 60 && end - start >= 300){ push("ランチ", "eat", kids ? 70 : 60, rnd(waitFor(cur, 0.4))); lunch = true; sinceRest = 0; cur += cfg.gap; continue; }
        if(sinceRest >= restEvery && left >= 40 && kind !== "queue"){ push(kids ? "休憩・おやつ" : "休憩", "rest", kids ? 25 : 20, 0); nBreak++; sinceRest = 0; cur += 5; continue; }
        if(o.show && kind === "park" && !showDone && cur >= 13 * 60 && left >= 80){ push("ショー", "show", 30, 0); showDone = true; sinceRest += 30; cur += cfg.gap; continue; }
        if(o.show && kind === "park" && !paradeDone && cur >= 16 * 60 + 30 && left >= 60){ push("パレード", "show", 40, 0); paradeDone = true; sinceRest += 40; cur += cfg.gap; continue; }
        if((o.shop || kind === "park" || kind === "trip") && !shopDone && left <= 110 && left >= 40){ push("おみやげ", "shop", 30, 0); shopDone = true; cur += cfg.gap; continue; }
        if(o.eat && nAct > 0 && nAct % 2 === 0 && left >= 60 && lunch){ push("食べ歩き・おやつ", "eat", 25, rnd(waitFor(cur, 0.3))); nAct++; cur += cfg.gap; continue; }
        const w = cfg.actKind === "work" || kind === "trip" ? (kind === "queue" ? rnd(waitFor(cur, 1)) : 0) : rnd(waitFor(cur, kids ? 0.85 : 1));
        const dur = Math.round((w + cfg.ride * (kids && kind === "park" ? 1.1 : 1)) / 5) * 5, d = Math.min(Math.max(dur, 30), left - 5);
        if(d < 25) break;
        nAct++; push(cfg.act + (kind === "queue" ? "" : itnCircle(nAct)), cfg.actKind, d, w);
        sinceRest += d + cfg.gap;
        if(pace < 1 && nAct >= 3 && nAct % 3 === 0) { sinceRest += 30; }
        cur += Math.round(cfg.gap / pace);
        if(kind === "queue" && nAct >= 3) break;
        if(pace < 1 && nAct >= Math.ceil((end - start) / 150)) { if(!o.eat) break; }
    }
    const cs = Math.max(cur, end - closeDur);
    cur = Math.min(cs, 23 * 60 + 30 - closeDur);
    push(cfg.close[0], cfg.close[1], closeDur, 0);
    return {title: cfg.title, kind, items: items.slice(0, ITN_MAX_ITEMS), fac, learned: lf.n};
}
function itnBotPropHtml(prop){
    const tw = prop.items.reduce((a, x) => a + (x.w || 0), 0);
    let h = '<div class="itn-bot-prop"><b>' + itnE(prop.title) + '</b><small>' + prop.items.length + '件 ・ 待ちの目安 合計 約' + itnDur(tw) + '</small>';
    prop.items.slice(0, 14).forEach((x) => { h += '<div class="itn-bot-r"><span>' + itnE(x.s) + '</span><span>' + itnCatOf(x.k)[1] + ' ' + itnE(x.n) + '</span>' + (x.w ? '<em>待ち' + x.w + '分</em>' : '') + '</div>'; });
    if(prop.items.length > 14) h += '<small>ほか ' + (prop.items.length - 14) + '件</small>';
    return h + '</div>';
}
/** いまの予定表を見て、気づいたことを話す */
function itnBotAdvise(plan){
    if(!plan || !plan.items.length) return {text: "予定表が まだ空です。「10時から18時まで、テーマパーク」のように話しかけてください。", chips: ["10時から18時 テーマパーク", "9時から17時 旅行"]};
    const L = [], chips = [], iss = itnCheck(plan), real = iss.filter((x) => x.t !== "notime");
    real.slice(0, 5).forEach((x) => L.push("・" + x.msg));
    const its = plan.items, timed = its.filter((x) => itnMin(x.s) != null);
    if(timed.length >= 3){
        const lo = Math.min(...timed.map((x) => itnMin(x.s))), hi = Math.max(...timed.map((x) => itnMin(x.e) != null ? itnMin(x.e) : itnMin(x.s)));
        const rests = its.filter((x) => x.k === "rest").length, hours = (hi - lo) / 60;
        if(hours >= 5 && rests === 0){ L.push("・" + Math.round(hours) + "時間 動くのに、休憩が ありません。"); chips.push("休憩を入れて"); }
        const bigWait = its.filter((x) => x.w >= 45 && x.st === "t");
        if(bigWait.length >= 2) L.push("・待ちが 45分以上の予定が " + bigWait.length + "件 あります（" + bigWait.slice(0, 2).map((x) => x.n).join("・") + "）。朝いちばんか、夕方に ずらすと すくことが 多いです。");
    }
    const fin = its.filter((x) => x.st === "x" && x.w > 0 && x.aw != null);
    if(fin.length >= 2){
        const a = fin.reduce((s, x) => s + x.aw, 0), e = fin.reduce((s, x) => s + x.w, 0), r = a / e;
        const rest = its.filter((x) => x.st === "t" && x.w > 0).length;
        L.push("・ここまでの待ちは、予想の " + (Math.round(r * 10) / 10) + "倍でした（実際 " + a + "分 ／ 予想 " + e + "分）。");
        if(rest && Math.abs(r - 1) >= 0.15){ L.push("  のこり " + rest + "件の予想も、この ペースで 見直すと よさそうです。"); chips.push("のこりの予想を " + (Math.round(r * 10) / 10) + "倍に 補正して"); }
    }
    if(iss.some((x) => x.t === "lap" || x.t === "rev" || x.t === "slot")) chips.push("自動で直して");
    if(iss.some((x) => x.t === "meal")) chips.push("ランチを入れて");
    chips.push("待ち時間を 予想して");
    if(!L.length) L.push("・とくに 気になる点は ありません。よく できています ✨");
    return {text: "いまの予定表（" + plan.title + "）を 見ました。\n" + L.filter(Boolean).join("\n"), chips: Array.from(new Set(chips)).slice(0, 4)};
}
/** 待ち時間の予想（あなたの実績・みんなの平均・時間帯のかたむきから）*/
function itnBotPredict(plan){
    if(!plan) return {text: "予定表が ありません。", chips: []};
    const todo = plan.items.filter((x) => x.st === "t" && itnMin(x.s) != null && (x.k === "act" || x.k === "show" || x.k === "eat" || x.k === "shop" || x.w > 0)).slice(0, 8);
    if(!todo.length) return {text: "予想できる予定が ありません（時刻の入った予定が 必要です）。", chips: []};
    const lf = itnLearnFactor(), L = [];
    todo.forEach((x) => {
        const h = itnHist(x.n, x.i), c = itnCrowdOf(x.n);
        let g, why;
        if(h){ g = h.avg; why = "あなたの実績（" + h.n + "回）"; }
        else if(c && c.n >= 3){ g = Math.round(c.med); why = "みんなの まん中の値"; }
        else { g = itnWaitGuess(itnMin(x.s), x.k === "act" ? "park" : x.k, {}, lf.f); why = "時間帯の目安" + (lf.n ? "＋あなたの傾向" : ""); }
        L.push("・" + x.s + " " + x.n + "：約" + g + "分（" + why + "）" + (x.w > 0 && Math.abs(g - x.w) >= 10 ? " ← いまの予想 " + x.w + "分と ちがいます" : ""));
    });
    return {text: "待ち時間を 推測しました。\n" + L.join("\n") + "\n（あくまで 目安です。実際に はかるほど、あなた専用に 正確になります）", chips: ["いまの予定を 見てアドバイス"]};
}
function itnBotInsert(plan, name, kind, dur, targetMin){
    const today = !plan.date || plan.date === itnToday(), now = itnNowMin();
    let s = targetMin;
    if(today && now + 5 > s) s = Math.ceil((now + 5) / 5) * 5;
    s = Math.min(s, 23 * 60);
    const ids = plan.items.filter((x) => x.st === "t" && itnMin(x.s) != null && itnMin(x.s) >= s).map((x) => x.i);
    itnShift(plan, ids, dur);
    const ni = itnCleanItem({n: name, k: kind, s: itnHM(s), e: itnHM(s + dur)});
    plan.items.push(ni);
    const idx = new Map(plan.items.map((x, i) => [x, i]));
    plan.items.sort((a, b) => { const p = itnMin(a.s), q = itnMin(b.s); if(p == null && q == null) return idx.get(a) - idx.get(b); if(p == null) return 1; if(q == null) return -1; return p - q || idx.get(a) - idx.get(b); });
    itnTouch(plan);
    return {s: itnHM(s), shifted: ids.length};
}
function itnBotAdd(who, text, extra){ itn.bot.log.push(Object.assign({who, text}, extra || {})); if(itn.bot.log.length > 60) itn.bot.log.shift(); }
const ITN_BOT_HELP = {text: "こんなふうに 話しかけてください。\n・「10時から18時、こども連れでテーマパーク」→ 1日の予定を つくります\n・「いまの予定を 見て」→ アドバイス\n・「待ち時間を 予想して」\n・「休憩を入れて」「ランチを入れて」\n・「30分 おくらせて」（のこりの予定を ずらす）", chips: ["10時から18時 こども連れでテーマパーク", "いまの予定を 見てアドバイス", "待ち時間を 予想して"]};
/** ボットの返事を つくる（ここが「頭」）。ctx に 聞きかけの条件を 持つ */
function itnBotReply(text){
    const t = itnBotNorm(text), plan = itnPlan(), o = itnBotParse(t), ctx = itn.bot.ctx || (itn.bot.ctx = {});
    if(/ありがと|thanks|助かった|たすかった/.test(t)) return {text: "どういたしまして！ 楽しい 1日に なりますように 🎉", chips: []};
    if(/^(こんにちは|こんばんは|おはよう|はじめまして|やあ)/.test(t) && !o.kind) return {text: "こんにちは！ 予定づくりを お手伝いします。", chips: ITN_BOT_HELP.chips};
    if(/アドバイス|見て|みて|チェック|どう(かな|？|\?|$)|おかしい|大丈夫|だいじょうぶ/.test(t) && !o.kind && o.start == null) { itn.bot.ctx = {}; return itnBotAdvise(plan); }
    if(/予想|推測|予測|待ち時間.*(教|おしえ|どのくらい)/.test(t) && !o.kind && !/倍/.test(t)){ return itnBotPredict(plan); }
    const sh = /(\d{1,3})\s*分\s*(?:ほど|くらい)?\s*(おくら|遅ら|ずら|あと|早め|はやめ|前に|まえに)/.exec(t);
    if(sh && plan){
        let d = Number(sh[1]); if(/早め|はやめ|前に|まえに/.test(sh[2])) d = -d;
        const n = itnShift(plan, plan.items.map((x) => x.i), d); itnTouch(plan);
        return {text: n ? "のこり " + n + "件を " + Math.abs(d) + "分 " + (d > 0 ? "あとに" : "前に") + " ずらしました。" : "ずらせる予定が ありません（まだ やっていない予定が 必要です）。", chips: ["いまの予定を 見てアドバイス"], changed: true};
    }
    if(/休憩|きゅうけい|やすみ|休み/.test(t) && plan && !/つくって|作って/.test(t) && !o.kind && o.start == null){
        const r = itnBotInsert(plan, "休憩", "rest", 20, Math.max(itnNowMin(), 11 * 60));
        return {text: r.s + "に「休憩」を 20分 入れました。" + (r.shifted ? "あとの予定 " + r.shifted + "件を 20分 ずらしています。" : ""), chips: ["いまの予定を 見てアドバイス"], changed: true};
    }
    if(/ランチ|昼ごはん|昼ご飯|お昼|ひるごはん/.test(t) && plan && !o.kind){
        if(plan.items.some((x) => x.k === "eat" && itnMin(x.s) >= 10 * 60 + 30 && itnMin(x.s) <= 14 * 60 + 30)) return {text: "お昼ごろの食事は すでに 入っています。", chips: []};
        const r = itnBotInsert(plan, "ランチ", "eat", 60, 12 * 60);
        return {text: r.s + "に「ランチ」を 60分 入れました。" + (r.shifted ? "あとの予定 " + r.shifted + "件を ずらしています。" : ""), chips: ["いまの予定を 見てアドバイス"], changed: true};
    }
    const sc = /(?:のこり|残り|予想).*?(\d(?:\.\d)?)\s*倍/.exec(t);
    if(sc && plan){
        const r = Math.min(3, Math.max(0.3, Number(sc[1])));
        let n = 0; plan.items.forEach((x) => { if(x.st === "t" && x.w > 0){ x.w = Math.min(180, Math.max(1, Math.round(x.w * r))); n++; } });
        itnTouch(plan);
        return {text: n ? "のこり " + n + "件の「予想の待ち」を " + r + "倍に 直しました。時刻の ずれは「チェック」の「自動で直す」で そろえられます。" : "直せる予想が ありません。", chips: ["自動で直して"], changed: true};
    }
    if(/自動で?直|なおして|直して|整えて|ととのえて/.test(t) && plan){
        const n = itnAutoFix(plan); return {text: n ? n + "か所 直しました。「チェック」から 元にも もどせます。" : "直すところは ありませんでした ✨", chips: [], changed: true};
    }
    // ここから「予定をつくる」
    Object.assign(ctx, o);
    const wantsMake = o.kind || o.start != null || /つくって|作って|組んで|くんで|予定|プラン|計画|考えて/.test(t) || ctx.asking;
    if(!wantsMake) return ITN_BOT_HELP;
    if(!ctx.kind){ ctx.asking = "kind"; return {text: "どんな日ですか？", chips: ITN_BOT_KIND.map((k) => k[1])}; }
    if(ctx.start == null && ctx.end == null && !ctx.timeAsked){ ctx.timeAsked = true; ctx.asking = "time"; return {text: "何時から 何時までの予定にしますか？（例：「10時から18時」）", chips: ["9時から18時", "10時から17時", "8時半から20時", "おまかせ"]}; }
    if(/おまかせ|どれでも|わからない|分からない/.test(t) && ctx.start == null){ ctx.start = 540; ctx.end = 1080; }
    const prop = itnBotBuild(ctx), keep = Object.assign({}, ctx);
    itn.bot.ctx = {};
    itn.bot.prop = prop; itn.bot.last = keep;
    const sm = itnMin(prop.items[0].s), em = itnMin(prop.items[prop.items.length - 1].e);
    const why = [];
    if(keep.kids) why.push("こども連れなので、休憩を こまめに入れ、予定を やや少なめに");
    if(keep.pace && keep.pace < 1) why.push("ゆっくりめに");
    if(keep.pace && keep.pace > 1) why.push("たっぷり まわれるように");
    if(prop.learned) why.push("あなたの これまでの " + prop.learned + "件の実績（予想の " + (Math.round(prop.fac * 10) / 10) + "倍）で 待ち時間を 補正");
    return {text: "こんな予定は どうでしょう？（" + itnHM(sm) + "〜" + itnHM(em) + "）\n午前は すいているので 待ちが少なめ、昼すぎは こみやすいので 食事や 休憩に あてています。" + (why.length ? "\n工夫：" + why.join("、") + "。" : "") + "\n名前や時刻は あとから 自由に 直せます。", prop, chips: ["📥 この予定で 新しい予定表を作る", "もっと ゆっくり", "もっと ぎっしり", keep.kids ? "こども連れじゃない" : "こども連れで"]};
}
function itnBotSend(text){
    text = String(text || "").trim().slice(0, 200); if(!text) return;
    itnBotAdd("me", text);
    // チップの「作る」操作
    if(/^📥/.test(text)){ itnBotDo("new"); return; }
    if(/^➕/.test(text)){ itnBotDo("add"); return; }
    const last = itn.bot.last;
    let q = text;
    if(/^(もっと\s*ゆっくり)$/.test(text) && last){ itn.bot.ctx = Object.assign({}, last, {pace: 0.7, timeAsked: true}); q = "予定を作って"; }
    else if(/^(もっと\s*ぎっしり)$/.test(text) && last){ itn.bot.ctx = Object.assign({}, last, {pace: 1.35, timeAsked: true}); q = "予定を作って"; }
    else if(/^こども連れで$/.test(text) && last){ itn.bot.ctx = Object.assign({}, last, {kids: true, timeAsked: true}); q = "予定を作って"; }
    else if(/^こども連れじゃない$/.test(text) && last){ itn.bot.ctx = Object.assign({}, last, {kids: false, timeAsked: true}); q = "予定を作って"; }
    else { const kk = ITN_BOT_KIND.find((k) => k[1] === text); if(kk) q = kk[1].replace(/^\S+\s*/, ""); }
    const r = itnBotReply(q);
    itnBotAdd("bot", r.text, {prop: r.prop, chips: r.chips});
    if(r.changed && typeof itnRender === "function"){ /* 予定が変わった */ }
}
function itnBotDo(mode){
    const prop = itn.bot.prop; if(!prop){ itnBotAdd("bot", "つくった予定が ありません。もういちど 話しかけてください。", {chips: ITN_BOT_HELP.chips}); return; }
    const plan = itnPlan();
    if(mode === "add" && plan){
        if(plan.items.length + prop.items.length > ITN_MAX_ITEMS){ itnBotAdd("bot", "予定が 多すぎて 足せません（" + ITN_MAX_ITEMS + "件まで）。"); return; }
        prop.items.forEach((x) => plan.items.push(itnCleanItem(x))); itnTouch(plan);
        itnBotAdd("bot", prop.items.length + "件を、いまの予定表に 足しました。「予定表」で 見られます。", {chips: ["いまの予定を 見てアドバイス"]});
    }else{
        const p = itnNewPlan(prop.title, itnToday(), prop.items); itn.active = p.id;
        itnBotAdd("bot", "新しい予定表「" + prop.title + "」を 作りました。上の「もどる」から 使いはじめられます。", {chips: ["いまの予定を 見てアドバイス", "待ち時間を 予想して"]});
    }
    itn.bot.prop = null;
}
function itnBotHtml(plan){
    if(!itn.bot.log.length) itnBotAdd("bot", "こんにちは！ 予定ボットです 🤖\nAI や通信は 使わず、この端末の中だけで 考えます。あなたの 実績が たまるほど、待ち時間の予想が 当たるように なります。", {chips: ITN_BOT_HELP.chips.concat(["休憩を入れて"])});
    let h = '<button type="button" class="itn-back" data-t="itin:back">← もどる</button><div class="itn-botlog" id="itnBotLog">';
    itn.bot.log.forEach((m, i) => {
        h += '<div class="itn-bot-m ' + m.who + '"><div>' + itnE(m.text).replace(/\n/g, "<br>") + '</div>' + (m.prop ? itnBotPropHtml(m.prop) : "") + '</div>';
        if(m.who === "bot" && m.prop && i === itn.bot.log.length - 1){ h += '<div class="itn-chips"><button type="button" class="pri" data-t="itin:botdo" data-v="new">📥 新しい予定表に する</button>' + (plan && plan.items.length ? '<button type="button" data-t="itin:botdo" data-v="add">➕ いまの予定表に 足す</button>' : '') + '</div>'; }
    });
    const last = itn.bot.log[itn.bot.log.length - 1];
    if(last && last.who === "bot" && last.chips && last.chips.length) h += '<div class="itn-chips">' + last.chips.filter((c) => !/^📥/.test(c)).map((c) => '<button type="button" data-t="itin:botq" data-v="' + itnE(c) + '">' + itnE(c) + '</button>').join("") + '</div>';
    return h + '</div><div class="itn-botin"><input type="text" id="itnBotIn" maxlength="200" placeholder="例：10時から18時、こども連れでテーマパーク" autocomplete="off"><button type="button" class="button" data-t="itin:botsend">送る</button></div>';
}

// ---------- 画面からの操作 ----------
function itnMoreAction(action, node, plan, it, d){
    const redo = () => itnRender();
    switch(action){
        case "bot": itn.sub = "bot"; itn.scroll0 = true; itn.botScroll = true; return itnRender();
        case "botsend": { const inp = document.getElementById("itnBotIn"); const v = inp ? inp.value : ""; if(!v.trim()) return; itnBotSend(v); itn.botScroll = true; return redo(); }
        case "botq": itnBotSend(d.v); itn.botScroll = true; return redo();
        case "botdo": itnBotDo(d.v); itn.botScroll = true; return redo();
        case "check": return itnGo("check");
        case "autofix": { if(!plan) return; const n = itnAutoFix(plan); showToast(n ? n + "か所 直しました。" : "直すところは ありませんでした。"); return redo(); }
        case "undoall": if(itnUndoAll()) showToast("もとに もどしました。"); return redo();
        case "voice": { if(itn.voiceOn){ itnVoiceStop(); showToast("声の操作を 止めました。"); } else if(itnVoiceStart()) showToast("🎙 声の操作 ON：「ならびはじめた」「はじまった」「おわった」「つぎは？」「いま何分？」「スキップ」「もどして」"); return redo(); }
        case "speak": { itn.prefs.speak = !itn.prefs.speak; itnSaveLocal(); if(itn.prefs.speak) itnSay("読み上げを オンにしました。", true); else itnSayStop(); return redo(); }
        case "sayplan": { if(plan) itnSayPlan(plan); return; }
        case "place": if(it) itnPlaceGet(plan, it); return;
        case "placedel": if(it){ it.p = null; itnTouch(plan); redo(); } return;
        default: return;
    }
}
function itnMoreOpen(){ try{ itnCrowdFetch(false); }catch(_e){} }
function initItinMore(){
    itn.bot = {log: [], ctx: {}, prop: null, last: null};
    document.addEventListener("keydown", (e) => {
        if(e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
        const t = e.target; if(!t || t.id !== "itnBotIn") return;
        e.preventDefault(); const b = document.querySelector('[data-t="itin:botsend"]'); if(b) b.click();
    });
}
