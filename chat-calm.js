"use strict";
// ===== しずかモード（予定つき）／やさしい表示モード／ミニ検定 =====
// ・しずかモード：決めた時間（毎日・曜日ごと）や「あと1時間だけ」のあいだ、通知の音・ポップアップ・バイブを止めます。メッセージは ふつうに届きます（未読には数えます）。
//   閉じているあいだに届くサーバーからの通知は、音とバイブなしの「しずかな通知」になります。通話の着信は、ふつうに鳴ります。
//   設定は、この端末に保存し（ログインした端末どうしで同期）、サービスワーカー（閉じている間の通知）にも伝えます。
// ・やさしい表示：文字・ボタンを大きく、行間を広く、動きを少なく。新しいメッセージの自動読み上げ（ブラウザの音声）もできます。
// ・ミニ検定：自分でクイズ（最大10問・4択）をつくって、チャットに出します。答えはメッセージの中に入っているので、友だち同士の遊びむけです。

// =====================================================================
// 7) しずかモード
// =====================================================================
const qt = {timer:null, last:null};
const QT_DAYS = "日月火水木金土";
function qtMin(s){ const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2])) : 0; }
function quietCfg(){
    const c = (state.user && cfRead("quiet", null)) || {};
    return {on:!!c.on, from:/^\d{1,2}:\d{2}$/.test(c.from || "") ? c.from : "22:00", to:/^\d{1,2}:\d{2}$/.test(c.to || "") ? c.to : "07:00",
        days:Array.isArray(c.days) ? c.days.filter((d) => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6], until:Number(c.until) || 0};
}
function quietIn(cfg, now){
    if(cfg.until > now.getTime()) return true;
    if(!cfg.on) return false;
    const mins = now.getHours() * 60 + now.getMinutes(), f = qtMin(cfg.from), t = qtMin(cfg.to), dow = now.getDay();
    if(f === t) return false;
    if(f < t) return cfg.days.includes(dow) && mins >= f && mins < t;
    if(mins >= f) return cfg.days.includes(dow);                 // 夜のはじまり（その日が はじまりの曜日）
    if(mins < t) return cfg.days.includes((dow + 6) % 7);        // 日付がかわったあとの朝（前の日が はじまりの曜日）
    return false;
}
function quietActive(){ try{ return !!state.user && quietIn(quietCfg(), new Date()); }catch(_e){ return false; } }
function quietEnd(cfg, now){   // いまの しずかな時間が、何時に おわるか（表示用）
    if(cfg.until > now.getTime()) return new Date(cfg.until);
    const e = new Date(now), t = qtMin(cfg.to); e.setHours(Math.floor(t / 60), t % 60, 0, 0);
    if(e.getTime() <= now.getTime()) e.setDate(e.getDate() + 1);
    return e;
}
function quietSave(c){
    cfWrite("quiet", c);
    try{ if(typeof alSavePrefs === "function") alSavePrefs(); }catch(_e){}
    quietApply();
}
function quietApply(){
    const act = quietActive(), bar = $("quietBar");
    document.body.classList.toggle("quiet-on", act);
    if(act){
        const cfg = quietCfg(), end = quietEnd(cfg, new Date()), hm = String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0");
        const html = '🌙 しずかモード中（' + hm + 'まで）<small> タップして変える</small>';
        if(bar){ if(bar.innerHTML !== html) bar.innerHTML = html; }
        else if(el.roomList && el.roomList.parentNode){
            const b = document.createElement("button"); b.type = "button"; b.id = "quietBar"; b.className = "quiet-bar"; b.innerHTML = html;
            b.addEventListener("click", () => runTool(openQuiet));
            el.roomList.parentNode.insertBefore(b, el.roomList);
        }
    }else if(bar) bar.remove();
    if(qt.last !== null && qt.last !== act){ try{ if(typeof alSavePrefs === "function") alSavePrefs(); }catch(_e){} }
    qt.last = act;
}
function initCalm(){
    registerTool("qt", onQuietAction);
    registerTool("ez", onEasyAction);
    registerTool("qz", onQuizAction);
    // 新着のポップアップ（と、そのあとに鳴る音）を、しずかな時間は出さない。あとから包んだものが先に呼ばれるように、いちばん最後に包む
    if(typeof nfPopup === "function"){
        const orig = nfPopup;
        nfPopup = function(){ if(quietActive()) return undefined; return orig.apply(this, arguments); };
    }
    quietApply();
    clearInterval(qt.timer); qt.timer = setInterval(quietApply, 30000);
    document.addEventListener("visibilitychange", () => { if(!document.hidden) quietApply(); });
    ezInit();
    extraBubbles.quiz = (item) => {
        if(item && item.id) qz.cache[item.id] = item;
        const n = Array.isArray(item.q) ? item.q.length : 0, best = (cfRead("qzres", {}) || {})[item.id];
        return '<div class="bubble">🎓 <b>' + escapeHtml(String(item.title || "ミニ検定").slice(0, 40)) + '</b><br><span class="meta">全 ' + n + ' 問（4択）' + (typeof best === "number" ? '　あなたのベスト：' + best + ' / ' + n : "") + '</span><br>' +
            '<button type="button" class="button-secondary" data-openquiz="' + escapeHtml(String(item.id || "")) + '">挑戦する</button></div>';
    };
    el.messages.addEventListener("click", (e) => { const b = e.target.closest("[data-openquiz]"); if(b) runTool(() => quizTake(b.dataset.openquiz)); });
}

function openQuiet(){
    const cfg = quietCfg(), now = new Date(), act = quietIn(cfg, now);
    const until = cfg.until > now.getTime();
    openSheet(toolHead("🌙 しずかモード", "決めた時間は、通知の音・ポップアップ・バイブをお休みします（メッセージは ふつうに届きます）") +
        '<div class="admin-card"><b>いま：' + (act ? "🌙 しずかモード中（" + String(quietEnd(cfg, now).getHours()).padStart(2, "0") + ":" + String(quietEnd(cfg, now).getMinutes()).padStart(2, "0") + "まで）" : "ふつうのモード") + '</b>' +
        '<div class="row" style="flex-wrap:wrap;justify-content:flex-start">' + [[1, "1時間"], [3, "3時間"], [8, "8時間"]].map((x) => '<button type="button" class="button-secondary" data-t="qt:for" data-h="' + x[0] + '">あと' + x[1] + 'だけ</button>').join("") +
        '<button type="button" class="button-secondary" data-t="qt:morning">あしたの朝まで</button>' + (until ? '<button type="button" class="button-danger" data-t="qt:stop">今すぐ もどす</button>' : "") + '</div></div>' +
        '<div class="admin-card"><label class="row" style="gap:8px;justify-content:flex-start"><input type="checkbox" data-t="qt:on"' + (cfg.on ? " checked" : "") + '> <b>毎日、決めた時間に しずかモードにする</b></label>' +
        '<div class="row" style="flex-wrap:wrap"><label>はじまり <input type="time" id="qtFrom" data-t="qt:from" value="' + escapeHtml(cfg.from.padStart(5, "0")) + '"></label><label>おわり <input type="time" id="qtTo" data-t="qt:to" value="' + escapeHtml(cfg.to.padStart(5, "0")) + '"></label></div>' +
        '<div class="meta">しずかに「はじまる」曜日（夜から朝をまたぐときは、はじまった日の ほうの曜日です）</div>' +
        '<div class="row" style="flex-wrap:wrap;justify-content:flex-start">' + Array.from(QT_DAYS).map((w, i) => '<label class="qt-day"><input type="checkbox" data-t="qt:day" data-d="' + i + '"' + (cfg.days.includes(i) ? " checked" : "") + '> ' + w + '</label>').join("") + '</div></div>' +
        '<div class="meta">・止まるもの：新着のポップアップ・音・ブラウザの通知・「未読があります」「おはよう」のお知らせ。<br>・閉じているときにスマホへ届く通知は、音とバイブなしの「しずかな通知」になります（通知そのものは出ます）。<br>・通話の着信は、ふつうに鳴ります。<br>・相手には、しずかモードは 見えません。メッセージの送受信は とまりません。</div>' + toolClose());
}
function onQuietAction(action, node){
    const cfg = quietCfg();
    if(action === "for"){ cfg.until = Date.now() + Number(node.dataset.h) * 3600000; }
    else if(action === "morning"){ const d = new Date(); d.setHours(7, 0, 0, 0); if(d.getTime() <= Date.now() + 600000) d.setDate(d.getDate() + 1); cfg.until = d.getTime(); }
    else if(action === "stop"){ cfg.until = 0; }
    else if(action === "on"){ cfg.on = !!node.checked; }
    else if(action === "from"){ if(!node.value) return; cfg.from = node.value; }
    else if(action === "to"){ if(!node.value) return; cfg.to = node.value; }
    else if(action === "day"){ const d = Number(node.dataset.d); cfg.days = cfg.days.filter((x) => x !== d); if(node.checked) cfg.days.push(d); cfg.days.sort(); }
    else return;
    quietSave(cfg);
    if(["for", "morning", "stop"].includes(action)) openQuiet();
}

// =====================================================================
// 11) 読み上げ・やさしい表示モード
// =====================================================================
const ez = {room:null, at:"", ready:false};
function easyCfg(){ const c = (state.user && cfRead("easy", null)) || {}; return {on:!!c.on, auto:!!c.auto}; }
function easyApply(){ document.body.classList.toggle("cf-easy", easyCfg().on); }
function ezInit(){
    easyApply();
    addRoomHook((room) => { ez.room = room ? room.id : null; ez.ready = false; ez.at = ""; try{ speechSynthesis.cancel(); }catch(_e){} });
    addRenderHook(ezAfterRender);
    window.addEventListener("are-prefs-synced", easyApply);
}
function ezIncoming(){
    return (state.messages || []).filter((m) => m && m.sender_id !== state.user.id).map((m) => ({m, item:parseMessageContent(m.content)}));
}
function ezAfterRender(){
    if(!state.currentRoom) return;
    const msgs = state.messages || [], lastAt = msgs.length ? msgs[msgs.length - 1].created_at : "";
    if(!ez.ready){ ez.ready = true; ez.at = lastAt || new Date().toISOString(); return; }      // 開いた直後に出ている分は 読み上げない
    const cfg = easyCfg();
    if(!cfg.auto || document.hidden || !speakSupported() || quietActive()){ if(lastAt > ez.at) ez.at = lastAt; return; }
    const fresh = ezIncoming().filter((x) => x.m.created_at > ez.at && x.item && x.item.type === "text" && String(x.item.text || "").trim());
    if(lastAt > ez.at) ez.at = lastAt;
    if(!fresh.length) return;
    const text = fresh.slice(-3).map((x) => senderName(x.m) + "さん、" + x.item.text).join("。 ");
    speakText(text, "easy-" + Date.now());
}
function openEasy(){
    const cfg = easyCfg();
    openSheet(toolHead("🧓 やさしい表示モード", "文字とボタンを大きく、見やすく、さわりやすくします（この端末に保存・ログインした端末で同期）") +
        '<label class="row" style="gap:8px;justify-content:flex-start;font-size:1.1em"><input type="checkbox" data-t="ez:on"' + (cfg.on ? " checked" : "") + '> <b>やさしい表示モードを使う</b></label>' +
        '<div class="meta">大きな文字・広い行間・大きなボタン・動きの少ない画面になります。もっと大きくしたいときは「🔠 見やすさ・読み上げ」の「文字の大きさ」も使えます。</div>' +
        '<label class="row" style="gap:8px;justify-content:flex-start"><input type="checkbox" data-t="ez:auto"' + (cfg.auto ? " checked" : "") + (speakSupported() ? "" : " disabled") + '> 新しいメッセージを、自動で読み上げる（開いているチャットの ことばだけ）</label>' +
        (speakSupported() ? "" : '<div class="meta">このブラウザは、読み上げに対応していません。</div>') +
        '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="ez:readlast"' + (speakSupported() ? "" : " disabled") + '>▶ このチャットの最新を読み上げる</button><button type="button" class="button-secondary" data-t="ez:stop">■ 止める</button></div>' +
        '<div class="meta" style="margin-top:6px">見本：<span class="bubble" style="display:inline-block;padding:6px 12px">こんにちは！ ARE です。</span></div>' +
        '<div class="meta">※ 漢字にふりがなを自動でつけることは、できません。読み上げでおぎなってください。メッセージを長押し（右クリック）して「🔊 読み上げ」でも読めます。</div>' + toolClose());
}
function onEasyAction(action, node){
    const cfg = easyCfg();
    if(action === "on"){ cfg.on = !!node.checked; cfWrite("easy", cfg); easyApply(); return; }
    if(action === "auto"){ cfg.auto = !!node.checked; cfWrite("easy", cfg); ez.ready = false; ez.at = ""; if(cfg.auto) showToast("新しく届いたメッセージを、読み上げます。"); return; }
    if(action === "stop"){ speakStop(); return; }
    if(action === "readlast"){
        const list = ezIncoming().filter((x) => x.item && x.item.type === "text" && String(x.item.text || "").trim()).slice(-3);
        if(!list.length){ showToast("読み上げるメッセージが、まだありません。"); return; }
        speakText(list.map((x) => senderName(x.m) + "さん、" + x.item.text).join("。 "), "easy-last-" + Date.now());
    }
}

// =====================================================================
// 12) ミニ検定・クイズを友だちに出す
// =====================================================================
const qz = {draft:null, take:null, cache:{}};
const QZ_MAX_Q = 10;
function qzBlank(){ return {q:"", o:["", "", "", ""], a:0, e:""}; }
const QZ_SAMPLE = {title:"ためしの検定", qs:[
    {q:"1年は 何か月？", o:["10か月", "11か月", "12か月", "13か月"], a:2, e:"1年は 12か月です。"},
    {q:"1日は 何時間？", o:["12時間", "24時間", "36時間", "48時間"], a:1, e:"1日は 24時間です。"},
    {q:"にじの色は いくつ（ふつうの数え方）？", o:["3つ", "5つ", "7つ", "9つ"], a:2, e:"赤・だいだい・黄・緑・青・あい・むらさきの 7色です。"}]};
function openQuizMaker(){
    if(!state.currentRoom){ showToast("クイズを出したいチャットを、先に開いてください。"); return; }
    qz.draft = {title:"", qs:[qzBlank()]};
    qzPaintMaker();
}
function qzCollect(){
    const d = qz.draft; if(!d) return;
    const t = $("qzTitle"); if(t) d.title = t.value;
    d.qs.forEach((q, i) => {
        const g = (s) => { const n = $(s + i); return n ? n.value : ""; };
        q.q = g("qzQ"); q.e = g("qzE"); q.o = [0, 1, 2, 3].map((k) => { const n = $("qzO" + i + "_" + k); return n ? n.value : ""; });
        const r = document.querySelector('input[name="qzA' + i + '"]:checked'); if(r) q.a = Number(r.value) || 0;
    });
}
function qzPaintMaker(){
    const d = qz.draft;
    openSheet(toolHead("🎓 ミニ検定をつくる", "最大 " + QZ_MAX_Q + " 問・4択。チャットに出すと、みんなが挑戦できます（答えはメッセージの中に入っています。友だち同士の遊び向けです）") +
        '<label for="qzTitle">検定の名前（40文字まで）</label><input id="qzTitle" type="text" maxlength="40" placeholder="例：わたしのことクイズ" value="' + escapeHtml(d.title) + '">' +
        d.qs.map((q, i) => '<div class="admin-card"><b>第' + (i + 1) + '問</b>' + (d.qs.length > 1 ? ' <button type="button" class="button-secondary" data-t="qz:del" data-i="' + i + '" aria-label="この問題を消す">🗑</button>' : "") +
            '<input id="qzQ' + i + '" type="text" maxlength="100" placeholder="問題（100文字まで）" value="' + escapeHtml(q.q) + '">' +
            [0, 1, 2, 3].map((k) => '<div class="row" style="flex-wrap:nowrap"><label style="white-space:nowrap"><input type="radio" name="qzA' + i + '" value="' + k + '"' + (q.a === k ? " checked" : "") + ' aria-label="これが正解"> 正解</label><input id="qzO' + i + '_' + k + '" type="text" maxlength="40" placeholder="' + "ABCD"[k] + '（40文字まで' + (k >= 2 ? "・空でもOK" : "") + '）" value="' + escapeHtml(q.o[k]) + '" style="flex:1"></div>').join("") +
            '<input id="qzE' + i + '" type="text" maxlength="100" placeholder="解説（なくてもOK・100文字まで）" value="' + escapeHtml(q.e) + '"></div>').join("") +
        '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="qz:add"' + (d.qs.length >= QZ_MAX_Q ? " disabled" : "") + '>＋ 問題をふやす</button><button type="button" class="button-secondary" data-t="qz:sample">れいを入れる</button></div>' +
        '<div class="row"><button type="button" class="button" data-t="qz:post">チャットに出す</button></div>' + toolClose());
}
function qzBuild(){
    qzCollect();
    const d = qz.draft, title = d.title.trim();
    if(!title) return {err:"検定の名前を入れてください。"};
    const qs = [];
    for(let i = 0; i < d.qs.length; i++){
        const q = d.qs[i], text = q.q.trim();
        if(!text) return {err:"第" + (i + 1) + "問の問題文を入れてください。"};
        const opts = [], map = {};
        q.o.forEach((o, k) => { const t = o.trim(); if(t){ map[k] = opts.length; opts.push(t); } });
        if(opts.length < 2) return {err:"第" + (i + 1) + "問は、選択肢を2つ以上 入れてください。"};
        if(!(q.a in map)) return {err:"第" + (i + 1) + "問の「正解」に、空の選択肢が えらばれています。"};
        if(new Set(opts).size !== opts.length) return {err:"第" + (i + 1) + "問に、同じ選択肢が あります。"};
        qs.push({q:text, o:opts, a:map[q.a], e:q.e.trim()});
    }
    const payload = {type:"quiz", id:"q" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), title, q:qs};
    if(JSON.stringify(payload).length > 11000) return {err:"内容が長すぎます。問題や解説を すこし短くしてください。"};
    return {payload};
}
async function onQuizAction(action, node){
    if(action === "add"){ qzCollect(); if(qz.draft.qs.length < QZ_MAX_Q) qz.draft.qs.push(qzBlank()); qzPaintMaker(); return; }
    if(action === "del"){ qzCollect(); qz.draft.qs.splice(Number(node.dataset.i), 1); if(!qz.draft.qs.length) qz.draft.qs.push(qzBlank()); qzPaintMaker(); return; }
    if(action === "sample"){ qz.draft = {title:QZ_SAMPLE.title, qs:QZ_SAMPLE.qs.map((q) => ({q:q.q, o:q.o.slice(), a:q.a, e:q.e}))}; qzPaintMaker(); return; }
    if(action === "post"){
        const r = qzBuild();
        if(r.err){ showToast(r.err); return; }
        node.disabled = true;
        try{ await sendMessagePayload(r.payload, {keepInput:true}); closeSheet(); showToast("チャットに出しました。"); }
        finally{ node.disabled = false; }
        return;
    }
    const t = qz.take; if(!t) return;
    if(action === "pick"){
        if(t.picked !== null) return;
        t.picked = Number(node.dataset.i);
        if(t.picked === t.item.q[t.i].a) t.score++;
        quizPaintTake(); return;
    }
    if(action === "next"){ t.i++; t.picked = null; quizPaintTake(); return; }
    if(action === "again"){ quizTake(t.item.id); return; }
    if(action === "send"){
        const n = t.item.q.length;
        if(!state.currentRoom){ showToast("結果を送るチャットを、先に開いてください。"); return; }
        await sendMessagePayload({type:"text", text:"🎓 「" + t.item.title + "」の結果：" + t.score + " / " + n + " 点（" + quizRank(t.score, n) + "）"}, {keepInput:true});
        showToast("結果を送りました。");
    }
}
function quizRank(score, n){
    const r = n ? score / n : 0;
    return r >= 1 ? "満点！マスター" : r >= 0.8 ? "ゆうしゅう" : r >= 0.5 ? "がんばりました" : "もうすこし";
}
function quizTake(id){
    const item = qz.cache[id];
    if(!item || !Array.isArray(item.q) || !item.q.length){ showToast("この検定は、いま開けません。"); return; }
    qz.take = {item, i:0, score:0, picked:null};
    quizPaintTake();
}
function quizPaintTake(){
    const t = qz.take, n = t.item.q.length;
    if(t.i >= n){
        const res = cfRead("qzres", {}) || {};
        if(typeof res[t.item.id] !== "number" || t.score > res[t.item.id]){
            res[t.item.id] = t.score; const ks = Object.keys(res); if(ks.length > 200) delete res[ks[0]];
            cfWrite("qzres", res);
        }
        openSheet(toolHead("🎓 " + escapeHtml(t.item.title), "けっか") + '<div class="omi-box"><div class="omi-level omi-ok">' + t.score + ' / ' + n + '</div><div class="omi-word">' + escapeHtml(quizRank(t.score, n)) + '</div></div>' +
            '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="qz:again">もういちど</button><button type="button" class="button" data-t="qz:send">結果をチャットに送る</button></div>' + toolClose());
        return;
    }
    const q = t.item.q[t.i], done = t.picked !== null;
    openSheet(toolHead("🎓 " + escapeHtml(t.item.title), "第 " + (t.i + 1) + " 問 / " + n + "　　いまの正解数：" + t.score) +
        '<div class="admin-card" style="font-size:1.1em"><b>' + escapeHtml(q.q) + '</b></div>' +
        q.o.map((o, k) => '<button type="button" class="' + (done && k === q.a ? "" : "button-secondary") + '" style="display:block;width:100%;text-align:left;margin:4px 0;' + (done && k === q.a ? "outline:2px solid var(--success)" : done && k === t.picked ? "outline:2px solid var(--danger)" : "") + '" data-t="qz:pick" data-i="' + k + '"' + (done ? " disabled" : "") + '>' + "ABCD"[k] + '．' + escapeHtml(o) + (done && k === q.a ? "　✅" : done && k === t.picked ? "　❌" : "") + '</button>').join("") +
        (done ? '<div class="admin-card"><b>' + (t.picked === q.a ? "⭕ 正解！" : "❌ ざんねん。正解は " + "ABCD"[q.a] + " です") + '</b>' + (q.e ? '<div>' + escapeHtml(q.e) + '</div>' : "") + '</div><div class="row"><button type="button" class="button" data-t="qz:next">' + (t.i + 1 >= n ? "結果を見る" : "次の問題へ") + '</button></div>' : "") + toolClose());
}
