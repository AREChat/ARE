"use strict";
// ===== 毎日の小さな楽しみ：今日のおみくじ／ひとこと日記・ふりかえり／友だち誕生日カレンダー／週刊ダイジェスト =====
// ・おみくじ・誕生日・ダイジェストの設定は、この端末のブラウザに保存し、ログインのたびに同期されます（端末をまたいだ設定の同期）。
// ・ひとこと日記は、これまでの「日記」と同じ表（user_diary）に入ります。自分だけが見られます。
// ・外のサービスは使いません（すべて、このアプリの中と Supabase だけ）。

// ---------- 共通 ----------
function dyHash(text){ let h = 2166136261; for(const ch of String(text)){ h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function dyRng(seed){ let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function dyPick(rng, list){ return list[Math.floor(rng() * list.length) % list.length]; }
function dyWeek(date){   // 月曜はじまりの週の目印（例：2026-W48）
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const wk = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
    return d.getUTCFullYear() + "-W" + String(wk).padStart(2, "0");
}
function dyDays(from, to){ return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000); }
function dyCopy(text){ return navigator.clipboard.writeText(text).then(() => showToast("コピーしました。"), () => showToast("コピーできませんでした。")); }
async function dyPostText(text){
    if(!state.currentRoom){ showToast("送りたいチャットを先に開いてください。"); return false; }
    await sendMessagePayload({type:"text", text:String(text).slice(0, 3900)}, {keepInput:true});
    return true;
}
const dy2 = {bdMonth:null, bdSel:null, digest:null};

function initDaily(){
    registerTool("om", onOmikujiAction);
    registerTool("ol", onOneLineAction);
    registerTool("bd", onBirthdayAction);
    registerTool("dg", onDigestAction);
    extraBubbles.bday = (item) => {
        const m = Number(item.m), d = Number(item.d);
        const ok = m >= 1 && m <= 12 && d >= 1 && d <= 31;
        return '<div class="bubble">🎂 <b>' + escapeHtml(String(item.name || "").slice(0, 30)) + '</b> さんの誕生日<br>' + (ok ? '<span style="font-size:1.1em">' + m + '月' + d + '日' + (Number(item.y) ? '（' + Number(item.y) + '年生まれ）' : "") + '</span>' : "") +
            (ok ? '<br><button type="button" class="button-secondary" data-addbday="1" data-n="' + escapeHtml(String(item.name || "").slice(0, 30)) + '" data-m="' + m + '" data-d="' + d + '" data-y="' + (Number(item.y) || 0) + '">📅 カレンダーに入れる</button>' : "") + '</div>';
    };
    el.messages.addEventListener("click", (e) => {
        const b = e.target.closest("[data-addbday]"); if(!b) return;
        runTool(() => { bdAdd({n:b.dataset.n, m:Number(b.dataset.m), d:Number(b.dataset.d), y:Number(b.dataset.y) || 0}); showToast("誕生日カレンダーに入れました。"); });
    });
    setTimeout(() => runTool(dyStartup), 6000);
    document.addEventListener("visibilitychange", () => { if(!document.hidden) setTimeout(() => runTool(dyStartup), 1500); });
}
/** 開いたとき：今日・あしたの誕生日／月曜はじまりの週に1回のダイジェスト を、画面の上に そっと知らせる */
function dyStartup(){
    if(!state.user || document.hidden) return;
    if(typeof quietActive === "function" && quietActive()) return;
    const t = dayKey(new Date()), s = cfRead("bday", {}) || {};
    if(s.shown !== t){
        const list = bdList(), today = list.filter((x) => bdNext(x).days === 0), tom = list.filter((x) => bdNext(x).days === 1);
        if(today.length || tom.length){
            s.shown = t; cfWrite("bday", Object.assign({list:s.list || []}, {shown:t}));
            const msg = (today.length ? "🎂 今日は " + today.map((x) => x.n).join("・") + " さんの誕生日です" : "") + (today.length && tom.length ? "。" : "") + (tom.length ? "あしたは " + tom.map((x) => x.n).join("・") + " さんです" : "");
            if(typeof alPopup === "function") alPopup("🎂 誕生日のお知らせ", msg, () => openBirthdays(), 12000);
            return;
        }
    }
    const dgs = cfRead("digest", {}) || {}, wk = dyWeek(new Date());
    if(dgs.off !== true && dgs.shown !== wk && new Date().getDay() !== 0){   // 日曜のうちは、その週ぶんをまだ出さない（月曜からの週に1回）
        cfWrite("digest", Object.assign({}, dgs, {shown:wk}));
        if(dgs.shown && typeof alPopup === "function") alPopup("📰 先週のまとめができました", "タップして、1週間のふりかえりを見る", () => openDigest(), 10000);
    }
}

// =====================================================================
// 4) 今日のおみくじ・ひとこと占い
// =====================================================================
const OMI_LEVELS = [["大吉", 12], ["中吉", 18], ["吉", 25], ["小吉", 20], ["末吉", 15], ["凶", 10]];
const OMI_STARS = {"大吉":[4, 5], "中吉":[3, 5], "吉":[3, 4], "小吉":[2, 4], "末吉":[2, 3], "凶":[1, 3]};
const OMI_WORDS = {
    "大吉":["思いきって一歩ふみ出すと、よい風が吹きます。", "あなたの笑顔が、まわりを明るくする日です。", "やってみたかったことを、今日はじめましょう。", "うれしい知らせが、そっととどきそうです。"],
    "中吉":["コツコツ続けてきたことが、実を結びはじめます。", "人の話に耳をかたむけると、よいヒントが。", "ていねいに 進めれば、だいじょうぶ。", "ちいさな親切が、あとで返ってきます。"],
    "吉":["ふつうの一日こそ、たからもの。", "身の回りを整えると、気持ちも整います。", "ひと息いれてから、取りかかると うまくいきます。", "今日は聞き役になると、よいことが。"],
    "小吉":["あわてず、ひとつずつ。", "ちょっとした工夫が、ひらめきを呼びます。", "ありがとうを、いつもより多めに。", "好きな音楽が、力になる日です。"],
    "末吉":["これから、じわじわ よくなります。", "待つことも、立派な作戦です。", "早めに休むと、あしたが楽しみになります。", "小さな目標を、ひとつだけ決めましょう。"],
    "凶":["今日は むりをせず、のんびりと。", "気をつけたい日。急がず、ゆっくり確認を。", "ことばは やさしめに。あとで自分が助かります。", "悪いことのあとには、よいことが。深呼吸をひとつ。"]
};
const OMI_COLORS = ["あか", "あお", "きいろ", "みどり", "むらさき", "オレンジ", "ピンク", "しろ", "くろ", "ちゃいろ", "みずいろ", "はいいろ"];
const OMI_DO = ["窓を開けて 深呼吸する", "あたたかい飲み物を ゆっくり飲む", "机の上を ひとつだけ片づける", "5分だけ散歩する", "知っている人に「ありがとう」を送る", "ノートに今日の目標を1行書く", "好きな曲を1曲 聞く", "水をコップ1杯 飲む", "ストレッチを1分する", "スマホを置いて 10分すごす", "好きな食べ物を ひとくち味わう", "ねる前に 今日よかったことを1つ思い出す"];
const OMI_CATS = ["勉強・仕事", "人づきあい", "お金", "元気"];

function omiRoll(uid, day){
    const rng = dyRng(dyHash(uid + "|" + day + "|omikuji-v1"));
    let r = rng() * 100, level = OMI_LEVELS[OMI_LEVELS.length - 1][0];
    for(const lv of OMI_LEVELS){ if(r < lv[1]){ level = lv[0]; break; } r -= lv[1]; }
    const [lo, hi] = OMI_STARS[level];
    return {level, stars:OMI_CATS.map(() => lo + Math.floor(rng() * (hi - lo + 1))), word:dyPick(rng, OMI_WORDS[level]), color:dyPick(rng, OMI_COLORS), num:1 + Math.floor(rng() * 99), act:dyPick(rng, OMI_DO)};
}
function omiText(day, o){
    return "🎴 今日のおみくじ（" + day + "）\n運勢：" + o.level + "\n" + OMI_CATS.map((c, i) => c + " " + "★".repeat(o.stars[i]) + "☆".repeat(5 - o.stars[i])).join("\n") +
        "\nひとこと：" + o.word + "\nラッキーカラー：" + o.color + "　ラッキーナンバー：" + o.num + "\nおすすめ：" + o.act;
}
function omiStreak(drawn){
    let n = 0; const d = new Date();
    if(!drawn[dayKey(d)]) d.setDate(d.getDate() - 1);   // 今日まだ引いていなければ、きのうから数える
    while(drawn[dayKey(d)]){ n++; d.setDate(d.getDate() - 1); }
    return n;
}
function openOmikuji(){ omiPaint(false); }
function omiPaint(anim){
    const day = dayKey(new Date()), st = cfRead("omi", {}) || {}, drawn = st.drawn || {}, done = !!drawn[day];
    let body;
    if(!done){
        body = '<div class="omi-box"><div class="omi-mark" aria-hidden="true">🎴</div><div class="meta">1日1回、今日のおみくじが引けます。結果は、その日のうちは かわりません。</div>' +
            '<div class="row" style="justify-content:center"><button type="button" class="button" data-t="om:draw">おみくじを引く</button></div></div>';
    }else{
        const o = omiRoll(state.user.id, day);
        body = '<div class="omi-box' + (anim ? " omi-pop" : "") + '"><div class="omi-level omi-' + (o.level === "凶" ? "bad" : "ok") + '">' + escapeHtml(o.level) + '</div>' +
            '<div class="omi-stars">' + OMI_CATS.map((c, i) => '<div><span>' + escapeHtml(c) + '</span><b aria-label="' + o.stars[i] + '個">' + "★".repeat(o.stars[i]) + '<i>' + "★".repeat(5 - o.stars[i]) + '</i></b></div>').join("") + '</div>' +
            '<div class="omi-word">' + escapeHtml(o.word) + '</div>' +
            '<div class="meta">ラッキーカラー：<b>' + escapeHtml(o.color) + '</b>　ラッキーナンバー：<b>' + o.num + '</b></div><div class="meta">今日のおすすめ：<b>' + escapeHtml(o.act) + '</b></div></div>' +
            '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="om:send">いまのチャットに送る</button><button type="button" class="button-secondary" data-t="om:copy">コピー</button></div>';
    }
    const last = Object.keys(drawn).sort().slice(-7).reverse();
    openSheet(toolHead("🎴 今日のおみくじ・ひとこと占い", "おたのしみ用です。気楽に、どうぞ") + body +
        '<div class="meta">続けて引いた日数：<b>' + omiStreak(drawn) + '</b> 日　／　これまでに引いた日：' + Object.keys(drawn).length + ' 日</div>' +
        (last.length ? '<details><summary class="meta">さいきんの結果</summary>' + last.map((d) => '<div class="meta">' + escapeHtml(d) + '　' + escapeHtml(omiRoll(state.user.id, d).level) + '</div>').join("") + '</details>' : "") + toolClose());
}
async function onOmikujiAction(action){
    const day = dayKey(new Date());
    if(action === "draw"){
        const st = cfRead("omi", {}) || {}; st.drawn = st.drawn || {}; st.drawn[day] = 1;
        const keys = Object.keys(st.drawn).sort(); if(keys.length > 400) delete st.drawn[keys[0]];
        cfWrite("omi", st); omiPaint(true); return;
    }
    const st = cfRead("omi", {}) || {};
    if(!(st.drawn && st.drawn[day])) return;
    const text = omiText(day, omiRoll(state.user.id, day));
    if(action === "copy") await dyCopy(text);
    else if(action === "send"){ if(await dyPostText(text)) showToast("送りました。"); }
}

// =====================================================================
// 6) ひとこと日記＋ふりかえり
// =====================================================================
const OL_MOODS = ["", "😣", "😕", "😐", "🙂", "😄"];
const ol = {rows:[], range:"week", today:null, mood:0};

async function openOneLine(){
    ol.range = "week"; ol.mood = 0;
    openSheet(toolHead("✏️ ひとこと日記・ふりかえり", "1日ひとこと、気分つきで。あとで 週・月・年で ふりかえれます（自分だけが見られます）") + '<div id="olBody"><div class="empty-list">読み込み中...</div></div>' + toolClose());
    await olLoad();
}
async function olLoad(){
    try{
        const since = dayKey(new Date(Date.now() - 400 * 86400000));
        const r = await requireClient().from("user_diary").select("day,mood,body").gte("day", since).order("day", {ascending:false}).limit(500);
        if(r.error) throw r.error;
        ol.rows = r.data || [];
        const t = ol.rows.find((x) => x.day === dayKey(new Date()));
        ol.mood = t && t.mood ? t.mood : 0;
        olPaint();
    }catch(e){ if($("olBody")) $("olBody").innerHTML = '<div class="empty-list">' + escapeHtml(featError(e)) + '</div>'; }
}
function olStreak(){
    const days = new Set(ol.rows.filter((x) => (x.body && x.body.trim()) || x.mood).map((x) => x.day));
    let n = 0; const d = new Date();
    if(!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while(days.has(dayKey(d))){ n++; d.setDate(d.getDate() - 1); }
    return n;
}
function olRange(range){
    const end = new Date(), start = new Date();
    if(range === "week") start.setDate(end.getDate() - 6);
    else if(range === "month") start.setDate(end.getDate() - 29);
    else start.setDate(end.getDate() - 364);
    return {from:dayKey(start), to:dayKey(end), start, end};
}
function olPaint(){
    const box = $("olBody"); if(!box) return;
    const keep = $("olLine") ? $("olLine").value : "";
    const today = dayKey(new Date()), cur = ol.rows.find((x) => x.day === today);
    const rg = olRange(ol.range), inR = ol.rows.filter((x) => x.day >= rg.from && x.day <= rg.to);
    const moods = inR.filter((x) => x.mood), avg = moods.length ? moods.reduce((a, x) => a + x.mood, 0) / moods.length : null;
    const spanDays = ol.range === "week" ? 7 : ol.range === "month" ? 30 : 365;
    const cnt = [0, 0, 0, 0, 0, 0]; moods.forEach((x) => { cnt[x.mood]++; });
    const maxC = Math.max(1, ...cnt.slice(1));
    // 日ごとの棒（週と月）／月ごとの平均（年）
    let chart = "";
    if(ol.range !== "year"){
        const cells = []; const d = new Date(rg.start);
        for(let i = 0; i < spanDays; i++){ const k = dayKey(d), row = inR.find((x) => x.day === k); cells.push('<span class="ol-bar" title="' + k + '" style="height:' + (row && row.mood ? row.mood * 18 : 4) + 'px;opacity:' + (row && row.mood ? 1 : 0.25) + '"></span>'); d.setDate(d.getDate() + 1); }
        chart = '<div class="ol-chart" aria-label="気分のうつりかわり">' + cells.join("") + '</div>';
    }else{
        const m = {}; moods.forEach((x) => { const k = x.day.slice(0, 7); (m[k] = m[k] || []).push(x.mood); });
        const ks = Object.keys(m).sort();
        chart = '<div class="ol-chart">' + (ks.length ? ks.map((k) => { const a = m[k].reduce((p, c) => p + c, 0) / m[k].length; return '<span class="ol-bar" title="' + k + '：' + a.toFixed(1) + '" style="height:' + Math.round(a * 18) + 'px"></span>'; }).join("") : '<span class="meta">まだ記録がありません</span>') + '</div>';
    }
    const best = moods.slice().sort((a, b) => b.mood - a.mood || (a.day < b.day ? 1 : -1)).find((x) => x.body && x.body.trim());
    const ago = [[7, "1週間前の今日"], [30, "1か月前の今日"], [365, "1年前の今日"]].map(([n, label]) => { const d = new Date(); d.setDate(d.getDate() - n); const k = dayKey(d), row = ol.rows.find((x) => x.day === k && x.body && x.body.trim()); return row ? '<div class="admin-card"><b>' + label + '</b>　' + (OL_MOODS[row.mood] || "") + '<div style="white-space:pre-wrap">' + escapeHtml(row.body.slice(0, 200)) + '</div></div>' : ""; }).join("");
    box.innerHTML = '<div class="admin-card"><b>今日（' + escapeHtml(today) + '）</b><div class="row" style="justify-content:flex-start" id="olMoods">' + [1, 2, 3, 4, 5].map((n) => '<button type="button" class="' + (ol.mood === n ? "" : "button-secondary") + '" data-t="ol:mood" data-m="' + n + '" aria-pressed="' + (ol.mood === n) + '" aria-label="気分' + n + '">' + OL_MOODS[n] + '</button>').join("") + '</div>' +
        '<input id="olLine" type="text" maxlength="100" placeholder="今日のひとこと（100文字まで）" value="' + escapeHtml(keep) + '">' +
        '<div class="row"><button type="button" class="button" data-t="ol:save">保存</button></div>' +
        (cur && cur.body ? '<div class="meta" style="white-space:pre-wrap">きょうの記録：' + escapeHtml(cur.body.slice(0, 300)) + '</div>' : "") + '</div>' +
        '<div class="row" style="justify-content:flex-start"><b>ふりかえり</b>' + [["week", "1週間"], ["month", "1か月"], ["year", "1年"]].map((x) => '<button type="button" class="' + (ol.range === x[0] ? "" : "button-secondary") + '" data-t="ol:range" data-v="' + x[0] + '" aria-pressed="' + (ol.range === x[0]) + '">' + x[1] + '</button>').join("") + '</div>' +
        '<div class="admin-card"><div>書いた日：<b>' + inR.filter((x) => (x.body && x.body.trim()) || x.mood).length + '</b> / ' + spanDays + ' 日　　続けて書いた日数：<b>' + olStreak() + '</b> 日</div>' +
        '<div>気分の平均：<b>' + (avg === null ? "—" : avg.toFixed(1) + " " + OL_MOODS[Math.round(avg)]) + '</b>（' + moods.length + '日ぶん）</div>' +
        '<div class="ol-dist">' + [1, 2, 3, 4, 5].map((n) => '<span title="' + n + '"><i style="height:' + Math.round(cnt[n] / maxC * 40) + 'px"></i>' + OL_MOODS[n] + '<small>' + cnt[n] + '</small></span>').join("") + '</div>' + chart +
        (best ? '<div class="meta">いちばん気分がよかった日：' + escapeHtml(best.day) + '　' + OL_MOODS[best.mood] + '<br><span style="white-space:pre-wrap">' + escapeHtml(best.body.slice(0, 120)) + '</span></div>' : "") + '</div>' +
        ago + '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="ol:copy">ふりかえりをコピー</button></div>' +
        '<div class="meta">くわしく書きたい日は、「📔 日記」を使ってください（同じ記録が見られます）。</div>';
}
async function onOneLineAction(action, node){
    if(action === "mood"){ const m = Number(node.dataset.m); ol.mood = ol.mood === m ? 0 : m; olPaint(); return; }
    if(action === "range"){ ol.range = node.dataset.v; olPaint(); return; }
    if(action === "copy"){
        const rg = olRange(ol.range), inR = ol.rows.filter((x) => x.day >= rg.from && x.day <= rg.to).sort((a, b) => (a.day < b.day ? -1 : 1));
        await dyCopy("✏️ ふりかえり（" + rg.from + " 〜 " + rg.to + "）\n" + inR.map((x) => x.day + " " + (OL_MOODS[x.mood] || "") + " " + String(x.body || "").replace(/\s+/g, " ").slice(0, 80)).join("\n"));
        return;
    }
    if(action === "save"){
        const line = ($("olLine").value || "").trim(), today = dayKey(new Date()), cur = ol.rows.find((x) => x.day === today);
        if(!line && !ol.mood){ showToast("ひとことを書くか、気分を選んでください。"); return; }
        let body = cur && cur.body ? cur.body : "";
        if(line){ body = body ? body + "\n" + line : line; }
        if(Array.from(body).length > 2000){ showToast("きょうの記録が長くなりすぎました（2000文字まで）。「📔 日記」で整理してください。"); return; }
        node.disabled = true;
        try{
            const r = await requireClient().from("user_diary").upsert({user_id:state.user.id, day:today, mood:ol.mood || (cur ? cur.mood : null) || null, body, updated_at:new Date().toISOString()}, {onConflict:"user_id,day"});
            if(r.error) throw r.error;
            showToast("保存しました。");
            if($("olLine")) $("olLine").value = "";
            await olLoad();
        }catch(e){ showToast(featError(e)); }
        finally{ node.disabled = false; }
    }
}

// =====================================================================
// 10) 友だち誕生日カレンダー
// =====================================================================
function bdList(){
    const s = cfRead("bday", {}) || {};
    return Array.isArray(s.list) ? s.list.filter((x) => x && x.n && x.m >= 1 && x.m <= 12 && x.d >= 1 && x.d <= 31).slice(0, 200) : [];
}
function bdSave(list){ const s = cfRead("bday", {}) || {}; return cfWrite("bday", {list:list.slice(0, 200), shown:s.shown || ""}); }
function bdAdd(e){
    const list = bdList(), name = String(e.n || "").trim().slice(0, 30);
    if(!name) return false;
    const same = list.find((x) => x.n === name && x.m === e.m && x.d === e.d);
    if(same){ if(e.y && !same.y) same.y = e.y; }
    else list.push({id:"b" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), n:name, m:e.m, d:e.d, y:Number(e.y) || 0, me:e.me ? 1 : 0});
    return bdSave(list);
}
function bdNext(x){
    const now = new Date(), t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const at = (yr) => { const lastD = new Date(yr, x.m, 0).getDate(); return new Date(yr, x.m - 1, Math.min(x.d, lastD)); };
    let d = at(t.getFullYear()); if(d < t) d = at(t.getFullYear() + 1);
    return {date:d, days:dyDays(t, d), age:x.y ? d.getFullYear() - x.y : null};
}
function openBirthdays(){ dy2.bdSel = null; dy2.bdMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); bdPaint(true); }
function bdPaint(fresh){
    const list = bdList().map((x) => Object.assign({}, x, {next:bdNext(x)})).sort((a, b) => a.next.days - b.next.days);
    const y = dy2.bdMonth.getFullYear(), mo = dy2.bdMonth.getMonth(), first = new Date(y, mo, 1).getDay(), last = new Date(y, mo + 1, 0).getDate();
    const byDay = {}; list.forEach((x) => { if(x.m === mo + 1){ const dd = Math.min(x.d, last); (byDay[dd] = byDay[dd] || []).push(x); } });
    const cells = []; for(let i = 0; i < first; i++) cells.push("<span></span>");
    const tk = dayKey(new Date());
    for(let d = 1; d <= last; d++){
        const has = byDay[d], isToday = tk === y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        cells.push('<button type="button" class="bd-cell' + (has ? " bd-has" : "") + (isToday ? " bd-today" : "") + (dy2.bdSel === d ? " bd-sel" : "") + '" data-t="bd:day" data-d="' + d + '" aria-label="' + (mo + 1) + '月' + d + '日' + (has ? "　誕生日あり" : "") + '">' + d + (has ? '<i>🎂</i>' : "") + '</button>');
    }
    const sel = dy2.bdSel ? (byDay[dy2.bdSel] || []) : [];
    const html = toolHead("🎂 友だち誕生日カレンダー", "誕生日を入れておくと、近づいたとき 開いたときに知らせます（この端末と、ログインした端末に保存・自分だけに見えます）") +
        '<div class="row" style="justify-content:space-between"><button type="button" class="button-secondary" data-t="bd:prev" aria-label="前の月">◀</button><b>' + y + '年' + (mo + 1) + '月</b><button type="button" class="button-secondary" data-t="bd:next" aria-label="次の月">▶</button></div>' +
        '<div class="bd-grid">' + "日月火水木金土".split("").map((w) => '<small>' + w + '</small>').join("") + cells.join("") + '</div>' +
        (dy2.bdSel ? '<div class="admin-card"><b>' + (mo + 1) + '月' + dy2.bdSel + '日</b>' + (sel.length ? sel.map((x) => '<div>🎂 ' + escapeHtml(x.n) + '</div>').join("") : '<div class="meta">この日の誕生日は、ありません。</div>') + '</div>' : "") +
        '<b>これから</b>' + (list.length ? list.slice(0, 40).map((x) => '<div class="admin-card" style="display:flex;gap:8px;align-items:center"><span style="flex:1;min-width:0"><b>' + (x.me ? "🙋 " : "🎂 ") + escapeHtml(x.n) + '</b><small class="meta" style="display:block">' + x.m + '月' + x.d + '日' + (x.next.age !== null ? '　（' + x.next.age + '歳になる日）' : "") + '　' + (x.next.days === 0 ? '<b style="color:var(--accent)">今日です！🎉</b>' : 'あと ' + x.next.days + ' 日') + '</small></span>' +
            '<button type="button" class="button-secondary" data-t="bd:wish" data-id="' + escapeHtml(x.id) + '" title="お祝いメッセージを予約" aria-label="お祝いを予約">🎁</button>' +
            '<button type="button" class="button-secondary" data-t="bd:rm" data-id="' + escapeHtml(x.id) + '" aria-label="消す">🗑</button></div>').join("") : '<div class="empty-list">まだ登録がありません。</div>') +
        '<div class="admin-card"><b>誕生日をたす</b><label for="bdName">名前（30文字まで）</label><input id="bdName" type="text" maxlength="30" placeholder="例：たろう">' +
        '<div class="row" style="flex-wrap:wrap"><label>月 <select id="bdM">' + Array.from({length:12}, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + '</option>').join("") + '</select></label><label>日 <select id="bdD">' + Array.from({length:31}, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + '</option>').join("") + '</select></label>' +
        '<label>生まれた年（なくてOK） <input id="bdY" type="number" min="1900" max="' + new Date().getFullYear() + '" placeholder="2005" style="width:6em"></label></div>' +
        '<label class="row" style="gap:8px;justify-content:flex-start"><input type="checkbox" id="bdMe"> これは自分の誕生日</label>' +
        '<div class="row" style="flex-wrap:wrap"><button type="button" class="button" data-t="bd:add">登録</button><button type="button" class="button-secondary" data-t="bd:sendme" title="いまのチャットに、自分の誕生日カードを送る">自分の誕生日カードを送る</button></div></div>' +
        '<div id="bdWish"></div>' + toolClose();
    if(fresh) openSheet(html); else { const k = riKeep(["bdName", "bdM", "bdD", "bdY"]); openSheet(html); riRestore(k); }
}
function bdSleep(ms){ return new Promise((r) => setTimeout(r, ms)); }
async function onBirthdayAction(action, node){
    if(action === "prev"){ dy2.bdMonth = new Date(dy2.bdMonth.getFullYear(), dy2.bdMonth.getMonth() - 1, 1); dy2.bdSel = null; bdPaint(); return; }
    if(action === "next"){ dy2.bdMonth = new Date(dy2.bdMonth.getFullYear(), dy2.bdMonth.getMonth() + 1, 1); dy2.bdSel = null; bdPaint(); return; }
    if(action === "day"){ const d = Number(node.dataset.d); dy2.bdSel = dy2.bdSel === d ? null : d; bdPaint(); return; }
    if(action === "add"){
        const n = ($("bdName").value || "").trim(), m = Number($("bdM").value), d = Number($("bdD").value), y = Number($("bdY").value) || 0, me = $("bdMe").checked;
        if(!n){ showToast("名前を入れてください。"); return; }
        const lastD = new Date(2024, m, 0).getDate();   // うるう年ふくめて、その月の最後の日
        if(d > lastD){ showToast(m + "月に " + d + "日は ありません。"); return; }
        if(y && (y < 1900 || y > new Date().getFullYear())){ showToast("生まれた年を確かめてください。"); return; }
        if(bdList().length >= 200){ showToast("登録できるのは 200人までです。"); return; }
        if(!bdAdd({n, m, d, y, me})) return;
        dy2.bdMonth = new Date(dy2.bdMonth.getFullYear(), m - 1, 1); dy2.bdSel = d; bdPaint(); showToast("登録しました。"); return;
    }
    if(action === "rm"){ bdSave(bdList().filter((x) => x.id !== node.dataset.id)); bdPaint(); return; }
    if(action === "sendme"){
        const me = bdList().find((x) => x.me);
        if(!me){ showToast("先に「これは自分の誕生日」にチェックして登録してください。"); return; }
        if(await dyPostText2({type:"bday", name:me.n, m:me.m, d:me.d, y:me.y || 0})) showToast("誕生日カードを送りました。");
        return;
    }
    if(action === "wish"){
        const x = bdList().find((e) => e.id === node.dataset.id); if(!x) return;
        if(!state.currentRoom){ showToast("お祝いを送りたい相手のチャットを、先に開いてください。"); return; }
        const nx = bdNext(x);
        if(nx.days > 28){ showToast("予約できるのは30日先までです。あと " + (nx.days - 28) + " 日ほど たってから、もういちど どうぞ。"); return; }
        const box = $("bdWish");
        box.innerHTML = '<div class="admin-card"><b>🎁 ' + escapeHtml(x.n) + ' さんへ、お祝いを予約</b><div class="meta">いま開いているチャット（' + escapeHtml(roomTitle(state.currentRoom)) + '）に、' + (nx.date.getMonth() + 1) + '月' + nx.date.getDate() + '日に とどきます。</div>' +
            '<textarea id="bdWishText" rows="3" maxlength="300">' + escapeHtml("お誕生日おめでとう！🎂 すてきな一年になりますように。") + '</textarea>' +
            '<label>とどく時間 <select id="bdWishAt"><option value="0">0:00（日付が かわってすぐ）</option><option value="8">8:00</option><option value="12">12:00</option><option value="18">18:00</option></select></label>' +
            '<div class="row"><button type="button" class="button" data-t="bd:wishgo" data-id="' + escapeHtml(x.id) + '">予約する</button></div></div>';
        box.scrollIntoView({block:"nearest"}); return;
    }
    if(action === "wishgo"){
        const x = bdList().find((e) => e.id === node.dataset.id); if(!x || !state.currentRoom) return;
        const text = ($("bdWishText").value || "").trim(); if(!text){ showToast("メッセージを入れてください。"); return; }
        const nx = bdNext(x), at = new Date(nx.date.getFullYear(), nx.date.getMonth(), nx.date.getDate(), Number($("bdWishAt").value) || 0, 0, 0);
        if(at.getTime() < Date.now() + 60000){ showToast("その時刻は、もう すぎています（あしたの日付で 登録するか、時間をかえてください）。"); return; }
        if(at.getTime() > Date.now() + 29.5 * 86400000){ showToast("予約できるのは30日先までです。"); return; }
        node.disabled = true;
        try{
            const r = await requireClient().rpc("schedule_message", {p_room_id:state.currentRoom.id, p_content:JSON.stringify({type:"text", text}), p_send_at:at.toISOString()});
            if(r.error) throw r.error;
            showToast("予約しました（" + formatDateTime(at.toISOString()) + "）。取り消しは「予約」の一覧からできます。");
            $("bdWish").innerHTML = "";
        }catch(e){ showToast(featError(e)); }
        finally{ node.disabled = false; }
    }
}
async function dyPostText2(payload){
    if(!state.currentRoom){ showToast("送りたいチャットを先に開いてください。"); return false; }
    await sendMessagePayload(payload, {keepInput:true}); return true;
}

// =====================================================================
// 9) 週刊ダイジェスト
// =====================================================================
async function dgPages(build){
    let all = [];
    for(let i = 0; i < 10; i++){
        const r = await build().range(i * 1000, i * 1000 + 999);
        if(r.error) throw r.error;
        all = all.concat(r.data || []);
        if(!r.data || r.data.length < 1000) break;
    }
    return all;
}
async function openDigest(){
    openSheet(toolHead("📰 週刊ダイジェスト", "この1週間の、あなたのチャットの ふりかえりです（自分だけに見えます）") + '<div id="dgBody"><div class="empty-list">集計しています...</div></div>' + toolClose());
    try{
        const c = requireClient(), since = new Date(Date.now() - 14 * 86400000).toISOString();
        const [msgs, imgs, dia] = await Promise.all([
            dgPages(() => c.from("messages").select("room_id,sender_id,created_at").gte("created_at", since).is("deleted_at", null).order("created_at", {ascending:false})),
            dgPages(() => c.from("messages").select("sender_id,created_at").gte("created_at", since).is("deleted_at", null).ilike("content", "%\"type\":\"image\"%").order("created_at", {ascending:false})),
            c.from("user_diary").select("day,mood").gte("day", dayKey(new Date(Date.now() - 6 * 86400000))).limit(10)
        ]);
        if(dia.error) throw dia.error;
        dy2.digest = dgBuild(msgs, imgs, dia.data || []);
        dgPaint();
    }catch(e){ if($("dgBody")) $("dgBody").innerHTML = '<div class="empty-list">' + escapeHtml(featError(e)) + '</div>'; }
}
function dgBuild(msgs, imgs, diary){
    const now = Date.now(), t7 = now - 7 * 86400000, me = state.user.id;
    const cur = msgs.filter((m) => new Date(m.created_at).getTime() >= t7), prev = msgs.filter((m) => new Date(m.created_at).getTime() < t7);
    const days = [], base = new Date(); base.setHours(0, 0, 0, 0);
    for(let i = 6; i >= 0; i--){ const d = new Date(base); d.setDate(base.getDate() - i); days.push({k:dayKey(d), w:"日月火水木金土"[d.getDay()], n:0}); }
    cur.forEach((m) => { const k = dayKey(new Date(m.created_at)), g = days.find((x) => x.k === k); if(g) g.n++; });
    const byRoom = {}; cur.forEach((m) => { byRoom[m.room_id] = (byRoom[m.room_id] || 0) + 1; });
    const rooms = Object.keys(byRoom).map((id) => ({id, n:byRoom[id], name:(() => { const r = (state.allRooms || state.rooms || []).find((x) => x.id === id); return r ? roomTitle(r) : "（ほかのチャット）"; })()})).sort((a, b) => b.n - a.n).slice(0, 5);
    const hours = new Array(24).fill(0); cur.forEach((m) => { hours[new Date(m.created_at).getHours()]++; });
    const peak = hours.indexOf(Math.max(...hours));
    const imgC = imgs.filter((m) => new Date(m.created_at).getTime() >= t7);
    const moods = diary.filter((x) => x.mood);
    return {sent:cur.filter((m) => m.sender_id === me).length, recv:cur.filter((m) => m.sender_id !== me).length, prevTotal:prev.length, total:cur.length, days, rooms, peak:cur.length ? peak : null,
        imgSent:imgC.filter((m) => m.sender_id === me).length, imgRecv:imgC.filter((m) => m.sender_id !== me).length, diaryDays:diary.length, avgMood:moods.length ? moods.reduce((a, x) => a + x.mood, 0) / moods.length : null, rooms7:Object.keys(byRoom).length};
}
function dgText(g){
    return "📰 週刊ダイジェスト\nメッセージ：合計 " + g.total + " 件（送った " + g.sent + "・受けとった " + g.recv + "）\n" + g.days.map((d) => d.k.slice(5) + "(" + d.w + ") " + d.n).join("\n") +
        (g.rooms.length ? "\nよく話したチャット：" + g.rooms.map((r) => r.name + " " + r.n + "件").join("、") : "") + (g.peak !== null ? "\nいちばん多い時間帯：" + g.peak + "時ごろ" : "") +
        "\n写真：送った " + g.imgSent + "・受けとった " + g.imgRecv + "\nひとこと日記：" + g.diaryDays + " 日" + (g.avgMood !== null ? "（気分の平均 " + g.avgMood.toFixed(1) + "）" : "");
}
function dgPaint(){
    const box = $("dgBody"), g = dy2.digest; if(!box || !g) return;
    const max = Math.max(1, ...g.days.map((d) => d.n)), diff = g.total - g.prevTotal, off = (cfRead("digest", {}) || {}).off === true;
    box.innerHTML = '<div class="admin-card"><div style="font-size:1.3em"><b>' + g.total + '</b> 件</div><div class="meta">送った ' + g.sent + ' ／ 受けとった ' + g.recv + '　／　その前の週より ' + (diff === 0 ? "同じ" : (diff > 0 ? diff + " 件 多い" : -diff + " 件 少ない")) + '（前の週は ' + g.prevTotal + ' 件）</div>' +
        '<div class="dg-bars">' + g.days.map((d) => '<span><i style="height:' + Math.round(d.n / max * 70 + 2) + 'px"></i><small>' + d.w + '</small><small>' + d.n + '</small></span>').join("") + '</div></div>' +
        '<div class="admin-card"><b>よく話したチャット</b>' + (g.rooms.length ? g.rooms.map((r, i) => '<div>' + (i + 1) + '. ' + escapeHtml(r.name) + '　<span class="meta">' + r.n + ' 件</span></div>').join("") : '<div class="meta">この1週間は、まだ ありません。</div>') +
        '<div class="meta">' + g.rooms7 + ' 個のチャットで やりとりしました' + (g.peak !== null ? '。いちばん多い時間帯は ' + g.peak + ' 時ごろ' : "") + '</div></div>' +
        '<div class="admin-card">📷 写真：送った <b>' + g.imgSent + '</b>・受けとった <b>' + g.imgRecv + '</b><br>✏️ ひとこと日記：<b>' + g.diaryDays + '</b> / 7 日' + (g.avgMood !== null ? '　気分の平均 <b>' + g.avgMood.toFixed(1) + '</b> ' + OL_MOODS[Math.round(g.avgMood)] : "") + '</div>' +
        '<label class="row" style="gap:8px;justify-content:flex-start"><input type="checkbox" data-t="dg:notify"' + (off ? "" : " checked") + '> 新しい週のはじめに、開いたとき お知らせする</label>' +
        '<div class="row" style="flex-wrap:wrap"><button type="button" class="button-secondary" data-t="dg:copy">コピー</button><button type="button" class="button-secondary" data-t="dg:refresh">もう一度 集計する</button></div>' +
        '<div class="meta">送受信の件数は、いま見られるメッセージの数です（自動で消えたものや、消したものは入りません）。</div>';
}
async function onDigestAction(action, node){
    if(action === "notify"){ const s = cfRead("digest", {}) || {}; s.off = !node.checked; cfWrite("digest", s); return; }
    if(action === "copy" && dy2.digest){ await dyCopy(dgText(dy2.digest)); return; }
    if(action === "refresh") await openDigest();
}
