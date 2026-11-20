"use strict";
// ===== 行動予定表（画面・取り込み・ひな形）=====
// 画面は「いま／予定表／タイムライン／まとめ」の4つ。ふだんは「いま」だけ使えば、ボタンを押すだけで記録できます。

const ITN_TPL = [
    ["park", "🎡", "テーマパークの1日", "アトラクションの待ち時間を はかる", [
        ["08:30", "09:00", "入口に集合", 0, "move"], ["09:00", "09:40", "アトラクションA", 30, "act"], ["09:50", "10:40", "アトラクションB", 40, "act"],
        ["10:50", "11:20", "ショー", 0, "show"], ["11:30", "12:30", "ランチ", 15, "eat"], ["12:40", "13:40", "アトラクションC", 45, "act"],
        ["13:50", "14:20", "おみやげ", 0, "shop"], ["14:30", "15:15", "アトラクションD", 35, "act"], ["15:20", "15:50", "おやつ休憩", 0, "rest"],
        ["16:00", "16:45", "アトラクションE", 30, "act"], ["17:30", "18:00", "パレード", 0, "show"], ["18:30", "19:30", "退園・帰りの電車", 0, "move"]]],
    ["trip", "🧳", "旅行・おでかけの1日", "移動・観光・食事を ならべる", [
        ["07:30", "08:30", "家を出発・駅へ", 0, "move"], ["08:30", "10:30", "電車で移動", 0, "move"], ["10:40", "12:00", "観光スポットA", 10, "act"],
        ["12:10", "13:10", "ランチ", 20, "eat"], ["13:30", "15:00", "観光スポットB", 15, "act"], ["15:10", "16:00", "カフェで休憩", 10, "rest"],
        ["16:10", "17:00", "おみやげ", 0, "shop"], ["17:15", "18:00", "ホテルにチェックイン", 5, "rest"], ["18:30", "20:00", "夕食", 20, "eat"]]],
    ["work", "💼", "仕事・勉強の1日", "集中する時間と休けいを ならべる", [
        ["07:30", "08:30", "朝のしたく", 0, "other"], ["08:30", "09:00", "移動", 0, "move"], ["09:00", "11:00", "集中タイム①", 0, "work"],
        ["11:00", "12:00", "会議・打ち合わせ", 0, "work"], ["12:00", "13:00", "ランチ", 0, "eat"], ["13:00", "15:00", "集中タイム②", 0, "work"],
        ["15:00", "15:15", "休憩", 0, "rest"], ["15:15", "17:00", "メール・かたづけ", 0, "work"]]],
    ["event", "🎤", "ライブ・イベントの日", "列・入場・開演までを ならべる", [
        ["09:00", "10:30", "物販の列", 60, "shop"], ["11:00", "12:00", "ごはん", 15, "eat"], ["13:00", "13:30", "入場", 20, "act"],
        ["14:00", "16:00", "開演", 0, "show"], ["16:30", "17:30", "帰りの電車（混雑）", 30, "move"]]],
    ["queue", "🏥", "病院・役所の順番待ち", "受付から会計まで 待ち時間を はかる", [
        ["09:00", "09:15", "受付", 10, "work"], ["09:15", "10:15", "診察の順番待ち", 45, "work"], ["10:15", "10:30", "診察", 0, "work"],
        ["10:30", "10:50", "会計", 15, "work"], ["10:50", "11:20", "薬局", 20, "work"]]],
    ["blank", "📝", "からっぽから作る", "1件ずつ 自分で入れる", []]
];
const itnTplItems = (key) => (ITN_TPL.find((t) => t[0] === key) || ITN_TPL[ITN_TPL.length - 1])[4].map((r) => ({n: r[2], s: r[0], e: r[1], w: r[3] || null, k: r[4]}));

// ---------- 取り込み（Excel・メモ・PDFの表を貼りつけ）----------
const ITN_TIME = "(\\d{1,2})(?::(\\d{2})|時(?!間)\\s*(\\d{2})?\\s*分?)";
const itnTimeG = () => new RegExp(ITN_TIME, "g");
function itnTimesIn(s){ const out = []; let m; const re = itnTimeG(); while((m = re.exec(s))){ const h = Number(m[1]), mi = Number(m[2] || m[3] || 0); if(h < 24 && mi < 60) out.push(itnHM(h * 60 + mi)); } return out; }
const itnNum = (s) => String(s == null ? "" : s).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/：/g, ":").replace(/，/g, ",").replace(/[ 　]+/g, (m) => m.length > 1 || m === "　" ? m : " ");
const ITN_HEAD = /^(開始|終了|時刻|時間|内容|備考|予想|待ち|待ち時間|予想待ち時間|名前|名称|アトラクション|施設|場所|項目|予定|メモ|金額|費用|番号|実際|状態|完了|開始時刻|終了時刻|No\.?|#)+$/;
const ITN_RE_WAIT = /^(?:約|およそ|待ち時間|待ち|予想|待)?\s*[:：]?\s*(\d{1,3})\s*(?:分|min|ふん)(?:\s*(?:待ち|程度|くらい|ぐらい|前後))?$/i;
const ITN_RE_HOUR = /^(?:約)?\s*(\d{1,2})\s*時間(?:\s*(\d{1,2})\s*分)?(?:\s*待ち)?$/;
const ITN_RE_COST = /^(?:[¥￥]\s*[\d,]+(?:\s*円)?|[\d,]+\s*円)$/;
const ITN_RE_EMBED = /[（(]?(?:待ち時間|待ち|待|予想)\s*(\d{1,3})\s*分[)）]?|[（(]?(\d{1,3})\s*分\s*待ち[)）]?/;
function itnIsTimeCell(c){ const t = c.replace(itnTimeG(), "").replace(/[\s~〜～\-–—−→ーから:]+/g, ""); return t === "" && itnTimesIn(c).length > 0; }
function itnCellType(c){
    if(itnIsTimeCell(c)) return "time";
    if(ITN_RE_WAIT.test(c) || ITN_RE_HOUR.test(c)) return "wait";
    if(ITN_RE_COST.test(c)) return "cost";
    if(/^\d{1,5}$/.test(c)) return "num";
    return "text";
}
function itnCsvSplit(line){
    const out = []; let cur = "", q = false;
    for(let i = 0; i < line.length; i++){ const ch = line[i]; if(q){ if(ch === '"'){ if(line[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; } else if(ch === '"') q = true; else if(ch === ","){ out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out;
}
function itnSplitLine(raw){
    let cells;
    if(raw.indexOf("\t") >= 0) cells = raw.split("\t");
    else if(/[|｜]/.test(raw)) cells = raw.split(/[|｜]/);
    else if(raw.split(",").length >= 3) cells = itnCsvSplit(raw);
    else cells = raw.split(/\s{2,}|　+/);
    cells = cells.map((c) => c.trim()).filter((c) => c !== "");
    if(cells.length === 1){            // 「アトラクションA 35分 9:00 9:30」のように ふつうの空白で区切られた行
        const tok = cells[0].split(/[\s　]+/);
        if(tok.length > 1 && tok.some((t) => itnCellType(t) !== "text")){
            const out = []; let txt = "";
            tok.forEach((t) => { if(itnCellType(t) === "text") txt += (txt ? " " : "") + t; else { if(txt){ out.push(txt); txt = ""; } out.push(t); } });
            if(txt) out.push(txt);
            // 「9:00 ~ 10:00」のような区切りだけの記号は時刻にくっつける
            return out.filter((t) => !/^[~〜～\-–—−→]$/.test(t));
        }
    }
    return cells;
}
function itnRowFromCells(cells){
    const r = {n: "", memos: [], times: [], w: null, c: null}, texts = [];
    cells.forEach((cell) => {
        const type = itnCellType(cell);
        if(type === "time"){ r.times.push(...itnTimesIn(cell)); return; }
        if(type === "wait" && r.w == null){ let m = ITN_RE_HOUR.exec(cell); r.w = m ? Number(m[1]) * 60 + Number(m[2] || 0) : Number((ITN_RE_WAIT.exec(cell) || [])[1]); return; }
        if(type === "cost" && r.c == null){ r.c = Number(cell.replace(/[^\d]/g, "")); return; }
        if(type === "num"){ const n = Number(cell); if(!texts.length) return; if(n <= 300 && r.w == null){ r.w = n; return; } if(r.c == null){ r.c = n; return; } }
        texts.push(cell);
    });
    if(texts.length){
        let name = texts[0];
        const lead = new RegExp("^\\s*" + ITN_TIME + "(?:\\s*[~〜～\\-–—−→]\\s*" + ITN_TIME + ")?\\s*[:：]?\\s*");
        const lm = lead.exec(name);
        if(lm && lm[0].trim() && name.length > lm[0].length){ r.times.unshift(...itnTimesIn(lm[0])); name = name.slice(lm[0].length); }
        const em = ITN_RE_EMBED.exec(name);
        if(em && r.w == null){ r.w = Number(em[1] || em[2]); name = name.replace(ITN_RE_EMBED, "").trim(); }
        r.n = name.replace(/^[\s・●○◆■□▶▷\-*]+/, "").trim(); r.memos = texts.slice(1);
    }
    return r;
}
function itnParse(text){
    const lines = itnNum(String(text || "").replace(/\r/g, "")).split("\n").map((l) => l.trim()).filter((l) => l);
    const res = {items: [], skipped: 0, date: "", title: ""};
    const rows = [];
    const split = lines.map(itnSplitLine);
    const single = split.filter((c) => c.length === 1).length;
    if(lines.length >= 6 && single / lines.length > 0.6){          // PDFなどで 1つのマスが 1行ずつ になっているとき
        let row = null; const flush = () => { if(row && row.cells.length) rows.push(row.cells); row = null; };
        split.forEach((cells) => { if(cells.length > 1){ flush(); rows.push(cells); return; } cells.forEach((c) => {
            const ty = itnCellType(c);
            if(!row) row = {cells: [], text: false, time: false, after: false};
            if(ty === "text" && row.text && row.after) flush();
            else if(ty === "time" && row.time && row.text && !row.after) flush();
            if(!row) row = {cells: [], text: false, time: false, after: false};
            if(ty === "text"){ row.text = true; } else { if(row.text) row.after = true; if(ty === "time") row.time = true; }
            row.cells.push(c);
        }); });
        flush();
    }else split.forEach((c) => rows.push(c));
    rows.forEach((cells) => {
        if(!cells.length) return;
        if(cells.every((c) => ITN_HEAD.test(c.replace(/[\s（）()]/g, "")))) return;
        const r = itnRowFromCells(cells);
        if(!r.n){
            const dm = /(\d{4})[\/\-.年]\s*(\d{1,2})[\/\-.月]\s*(\d{1,2})/.exec(cells.join(" "));
            if(dm && !res.date) res.date = dm[1] + "-" + String(dm[2]).padStart(2, "0") + "-" + String(dm[3]).padStart(2, "0");
            else res.skipped++;
            return;
        }
        if(!r.times.length && r.w == null && r.c == null && r.memos.length === 0 && /^[【■●◆▼#＃\[]/.test(cells[0])){
            if(!res.title) res.title = r.n.replace(/^[【■●◆▼#＃\[\s]+|[】\]\s]+$/g, "").replace(/\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2}日?\s*[（(][^）)]*[）)]?/, "").trim().slice(0, 40);
            const dm = /(\d{4})[\/\-.年]\s*(\d{1,2})[\/\-.月]\s*(\d{1,2})/.exec(r.n);
            if(dm && !res.date) res.date = dm[1] + "-" + String(dm[2]).padStart(2, "0") + "-" + String(dm[3]).padStart(2, "0");
            return;
        }
        if(res.items.length >= ITN_MAX_ITEMS){ res.skipped++; return; }
        res.items.push({n: r.n, s: r.times[0] || "", e: r.times[1] || "", w: r.w, c: r.c, m: r.memos.join(" / "), k: itnGuessKind(r.n, r.w > 0)});
    });
    return res;
}
const ITN_SAMPLE = "開始時刻\t終了時刻\t内容\t備考\n8:30\t9:00\t駅に集合\t改札の前\n9:00\t9:45\tアトラクションA 待ち35分\t先に整理券\n10:00\t10:30\tショー\t¥1,200\n11:30\t12:30\tランチ\t予約ずみ\n";

// ---------- 画面 ----------
const itnSTMARK = {t: "○", w: "⏳", d: "▶", x: "✔", s: "⏭"};
const itnHasMic = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

function itnDelayText(dl){
    if(!dl) return "";
    if(dl.st === "t" && dl.d < 0) return "🕐 つぎの予定まで あと " + itnDur(-dl.d);
    if(dl.d >= 2) return "⚠ 予定より " + itnDur(dl.d) + " 遅れ";
    if(dl.d <= -2) return "✨ 予定より " + itnDur(-dl.d) + " 早い";
    return "✅ 予定どおり";
}
function itnDateNote(plan){
    if(!plan.date) return "";
    const t = itnToday();
    if(plan.date === t) return "";
    const diff = Math.round((itnAt(plan.date, "00:00") - itnAt(t, "00:00")) / 86400000);
    const when = diff === 1 ? "あした" : diff === -1 ? "きのう" : diff > 0 ? diff + "日後" : Math.abs(diff) + "日前";
    return '<div class="itn-note-day">📅 この予定表は <b>' + itnE(itnDateLabel(plan.date)) + '（' + when + '）</b>のものです。' + (diff > 0 ? '当日になると、アラームが鳴ります。' : '') + ' <button type="button" class="itn-link" data-t="itin:today">きょうの日付にする</button></div>';
}
function itnTopHtml(plan){
    const ok = itn.prefs.alarm;
    return '<div class="itn-top"><button type="button" class="itn-plan" data-t="itin:plans"><b>📋 ' + itnE(plan ? plan.title : "行動予定表") + '</b><small>' + (plan ? itnE(itnDateLabel(plan.date)) + ' ・ ' + plan.items.length + '件' : 'ここから はじめましょう') + ' ▾</small></button>' +
        '<button type="button" class="itn-ic' + (ok ? " on" : "") + '" data-t="itin:alarm" aria-label="アラームの設定">' + (ok ? "🔔" : "🔕") + '</button><button type="button" class="itn-ic" data-t="itin:export" aria-label="書き出し">📤</button></div>';
}
function itnProgHtml(plan){
    const st = itnStats(plan), pct = st.total ? Math.round((st.done + st.skip) / st.total * 100) : 0;
    return '<div class="itn-prog"><div class="itn-bar"><i style="width:' + pct + '%"></i></div><span>' + st.done + '/' + st.total + ' 完了</span><span class="itn-dl" data-itn-delay>' + itnDelayText(itnDelay(plan)) + '</span></div>';
}
function itnTabsHtml(){
    return '<div class="itn-tabs" role="tablist">' + [["now", "🎯 いま"], ["list", "📋 予定表"], ["time", "🕐 時間割"], ["sum", "📊 まとめ"]].map((t) => '<button type="button" role="tab" class="' + (itn.tab === t[0] ? "on" : "") + '" data-t="itin:tab" data-v="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
}
function itnEmptyHtml(){
    return '<div class="itn-empty"><div class="itn-bigemoji">📋</div><b>まず、予定を入れましょう</b><p>Excelやメモの表を はりつけると、時刻・待ち時間・金額を 自動で読み取ります。ひな形から 作ることも できます。</p>' +
        '<button type="button" class="itn-big" data-t="itin:import">📥 表をはりつけて取り込む</button><button type="button" class="itn-big sec" data-t="itin:plans">✨ ひな形から作る（テーマパーク・旅行・仕事…）</button><button type="button" class="itn-big sec" data-t="itin:add">＋ 1件ずつ入れる</button></div>';
}
function itnStarsHtml(it){
    let h = '<div class="itn-stars" role="group" aria-label="満足度">';
    for(let n = 1; n <= 5; n++) h += '<button type="button" class="' + (it.r >= n ? "on" : "") + '" data-t="itin:star" data-id="' + it.i + '" data-n="' + n + '" aria-label="' + n + '">★</button>';
    return h + '</div>';
}
function itnHeroHtml(plan, it){
    const c = itnCatOf(it.k), hist = itnHist(it.n, it.i), time = (it.s || "") + (it.e ? " – " + it.e : "");
    let h = '<div class="itn-hero st-' + it.st + '"><div class="itn-hero-top"><span class="itn-cat">' + c[1] + '</span><div class="itn-hero-nm"><b>' + itnE(it.n || "（名前なし）") + '</b><div class="itn-meta">' + (time ? "予定 " + itnE(time) : "時刻なし") + (it.w > 0 ? " ・ 予想の待ち " + it.w + "分" : "") + '</div></div><span class="itn-tag">' + ITN_ST[it.st] + '</span></div>';
    if(it.st === "w"){
        h += '<div class="itn-clock" data-lv="wait" data-id="' + it.i + '">0:00</div>';
        if(it.w > 0) h += '<div class="itn-meter"><i data-lv="bar" data-id="' + it.i + '"></i></div>';
        h += '<div class="itn-lab" data-lv="lab" data-id="' + it.i + '"></div><div class="itn-meta c">並びはじめ ' + itnE(itnHM(new Date(it.ts).getHours() * 60 + new Date(it.ts).getMinutes())) + '</div>';
    }else if(it.st === "d"){
        h += '<div class="itn-clock" data-lv="doing" data-id="' + it.i + '">0:00</div><div class="itn-meta c">はじまり ' + itnE(it.as) + (it.aw != null ? ' ・ 待ち ' + it.aw + '分' + (it.w != null ? '（予想 ' + it.w + '分）' : '') : '') + '</div>';
    }else{
        h += '<div class="itn-lab" data-lv="until" data-id="' + it.i + '"></div>';
        if(hist) h += '<div class="itn-hint">📈 これまでの実績：待ち 平均 ' + hist.avg + '分（' + hist.n + '回）</div>';
    }
    h += '<div class="itn-acts">';
    if(it.st === "t"){
        if(it.w > 0) h += '<button type="button" class="itn-big" data-t="itin:wait" data-id="' + it.i + '">🚶 並びはじめた</button><div class="itn-acts2"><button type="button" data-t="itin:begin" data-id="' + it.i + '">▶ 並ばずに はじめた</button><button type="button" data-t="itin:skip" data-id="' + it.i + '">⏭ スキップ</button></div>';
        else h += '<button type="button" class="itn-big" data-t="itin:begin" data-id="' + it.i + '">▶ はじめた</button><div class="itn-acts2"><button type="button" data-t="itin:wait" data-id="' + it.i + '">🚶 並びはじめた</button><button type="button" data-t="itin:finish" data-id="' + it.i + '">✅ すぐ おわった</button><button type="button" data-t="itin:skip" data-id="' + it.i + '">⏭ スキップ</button></div>';
    }else if(it.st === "w"){
        h += '<button type="button" class="itn-big go" data-t="itin:begin" data-id="' + it.i + '">🎬 はじまった（順番がきた）</button><div class="itn-acts2"><button type="button" data-t="itin:skip" data-id="' + it.i + '">⏭ やめた</button><button type="button" data-t="itin:reopen" data-id="' + it.i + '">↩ 並びなおす前に戻す</button></div>';
    }else if(it.st === "d"){
        h += '<button type="button" class="itn-big done" data-t="itin:finish" data-id="' + it.i + '">✅ おわった</button>';
    }
    h += '</div>' + (it.st === "t" || it.st === "w" ? itnCrowdLine(it) : "") + itnPlaceHtml(plan, it) + '<div class="itn-note"><textarea data-t="itin:note" data-id="' + it.i + '" rows="2" maxlength="200" placeholder="ひとことメモ（感想・気づき）">' + itnE(it.nt) + '</textarea>' + (itnHasMic() ? '<button type="button" class="itn-mic" data-t="itin:mic" data-id="' + it.i + '" aria-label="声でメモ">🎤</button>' : '') + '</div>' +
        itnStarsHtml(it) + '<div class="itn-acts2"><button type="button" data-t="itin:edit" data-id="' + it.i + '">✏️ 時刻・内容を直す</button></div></div>';
    return h;
}
function itnPaceHtml(plan){
    const dl = itnDelay(plan), late = dl && dl.d >= 5 ? dl.d : 0;
    const ends = plan.items.map((x) => itnMin(x.e) != null ? itnMin(x.e) : itnMin(x.s)).filter((v) => v != null);
    const last = ends.length ? Math.max(...ends) : null;
    let h = '<div class="itn-card"><div class="itn-card-t">⏱ いまのペース</div><div class="itn-delay" data-itn-delay>' + (itnDelayText(dl) || "（時刻の入った予定がありません）") + '</div>';
    if(last != null && dl && dl.d >= 2 && (!plan.date || plan.date === itnToday())) h += '<div class="itn-meta">このペースだと、さいごの予定は <b>' + itnHM(last + dl.d) + '</b> ごろ（予定 ' + itnHM(last) + '）</div>';
    h += '<div class="itn-shift"><span>のこりの予定を ずらす</span><button type="button" data-t="itin:shiftall" data-d="-5">−5分</button><button type="button" data-t="itin:shiftall" data-d="5">＋5分</button><button type="button" data-t="itin:shiftall" data-d="10">＋10分</button><button type="button" data-t="itin:shiftall" data-d="15">＋15分</button></div>';
    if(late) h += '<button type="button" class="itn-big sec" data-t="itin:shiftlate">⏩ 遅れ ' + late + '分ぶん、のこりの予定をずらす</button>';
    return h + '<button type="button" class="itn-link" data-t="itin:status">📣 いまの様子を友だちに送る</button></div>';
}
function itnNextHtml(plan, heroes){
    const hid = heroes.map((x) => x.i), next = plan.items.filter((x) => x.st === "t" && !hid.includes(x.i));
    if(!next.length) return "";
    let h = '<div class="itn-card"><div class="itn-card-t">つぎの予定（タップで「いま」にします）</div>';
    next.slice(0, 5).forEach((it) => { h += '<button type="button" class="itn-next" data-t="itin:focus" data-id="' + it.i + '"><span>' + itnCatOf(it.k)[1] + '</span><b>' + itnE(it.n || "（名前なし）") + '</b><small>' + itnE(it.s || "") + (it.w > 0 ? ' ・ 待ち予想 ' + it.w + '分' : '') + '</small></button>'; });
    if(next.length > 5) h += '<div class="itn-meta">ほか ' + (next.length - 5) + '件 …「予定表」で見られます</div>';
    return h + '</div>';
}
function itnNowHtml(plan){
    if(!plan.items.length) return itnEmptyHtml();
    const work = itnWorking(plan), nxt = itnNextTodo(plan), heroes = work.length ? work : (nxt ? [nxt] : []);
    let h = itnDateNote(plan) + '<div class="itn-grid"><div class="itn-col">';
    if(!heroes.length) h += '<div class="itn-hero itn-alldone"><div class="itn-bigemoji">🎉</div><b>ぜんぶ おわりました！おつかれさま</b><p class="itn-meta">「まとめ」で 待ち時間を ふりかえれます。</p><button type="button" class="itn-big" data-t="itin:tab" data-v="sum">📊 まとめを見る</button></div>';
    heroes.forEach((it) => { h += itnHeroHtml(plan, it); });
    h += '<button type="button" class="itn-big sec" data-t="itin:adhoc">＋ 予定外のことを はじめる</button>';
    return h + '</div><div class="itn-col">' + itnGapHtml(plan) + itnPaceHtml(plan) + itnNextHtml(plan, heroes) + '</div></div>';
}
function itnBadges(it){
    let b = "";
    if(it.w > 0) b += '<span class="itn-bd">予想 ' + it.w + '分</span>';
    if(it.aw != null) b += '<span class="itn-bd ' + (it.w != null && it.w > 0 ? (it.aw <= it.w ? "good" : "bad") : "") + '">実際 ' + it.aw + '分</span>';
    if(it.c != null) b += '<span class="itn-bd">' + itnYen(it.c) + '</span>';
    if(it.r) b += '<span class="itn-bd">★' + it.r + '</span>';
    return b;
}
function itnListHtml(plan){
    let h = itnDateNote(plan) + '<div class="itn-tools"><button type="button" class="button" data-t="itin:add">＋ 追加</button><button type="button" class="button-secondary" data-t="itin:sort">🕐 時刻順にならべる</button><button type="button" class="button-secondary" data-t="itin:import">📥 取り込み</button></div>';
    if(!plan.items.length) return h + itnEmptyHtml();
    const nowm = itnNowMin(), isToday = plan.date === itnToday();
    h += '<div class="itn-hint2">時刻は そのまま さわって 直せます。◯を押すと「おわった」になります。</div>';
    plan.items.forEach((it) => {
        const s = itnMin(it.s), e = itnMin(it.e), cur = isToday && it.st === "t" && s != null && nowm >= s && (e == null || nowm < e);
        h += '<div class="itn-row st-' + it.st + (cur ? " cur" : "") + '"><button type="button" class="itn-chk" data-t="itin:cycle" data-id="' + it.i + '" aria-label="状態を進める（いま：' + ITN_ST[it.st] + '）">' + itnSTMARK[it.st] + '</button><div class="itn-rc"><div class="itn-r1">' +
            '<input type="time" value="' + itnE(it.s) + '" data-t="itin:set" data-id="' + it.i + '" data-f="s" aria-label="開始"><span>–</span><input type="time" value="' + itnE(it.e) + '" data-t="itin:set" data-id="' + it.i + '" data-f="e" aria-label="終了">' + itnBadges(it) + '</div>' +
            '<button type="button" class="itn-rn" data-t="itin:edit" data-id="' + it.i + '">' + itnCatOf(it.k)[1] + ' ' + itnE(it.n || "（名前なし）") + (it.p ? ' 📍' : '') + (cur ? ' <small class="itn-nowtag">いま</small>' : '') + '</button>' +
            (it.m || it.nt ? '<div class="itn-memo">' + itnE([it.m, it.nt ? "📝" + it.nt : ""].filter(Boolean).join("  ")) + '</div>' : '') + '</div></div>';
    });
    return h;
}
function itnTimelineHtml(plan){
    const its = plan.items.filter((x) => itnMin(x.s) != null || itnMin(x.as) != null);
    if(!its.length) return itnDateNote(plan) + '<div class="itn-empty"><div class="itn-bigemoji">🕐</div><b>時刻の入った予定がありません</b><p>「予定表」で時刻を入れると、1日の流れが 時間割になって 見えます。</p></div>';
    let lo = 24 * 60, hi = 0;
    const blocks = its.map((it) => { const s = itnMin(it.s), e = itnMin(it.e), as = itnMin(it.as), ae = itnMin(it.ae); const a = s != null ? s : as, b = e != null ? e : (s != null ? s + 30 : (ae != null ? ae : as + 30)); lo = Math.min(lo, a, as != null ? as : a); hi = Math.max(hi, b, ae != null ? ae : b); return {it, a, b: Math.max(b, a + 20), s, e, as, ae}; });
    lo = Math.max(0, Math.floor(lo / 60) * 60 - 0); hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60 + 0);
    const PX = 1.15, H = Math.round((hi - lo) * PX);
    blocks.sort((x, y) => x.a - y.a); const lanes = [];
    blocks.forEach((bk) => { let l = lanes.findIndex((end) => end <= bk.a); if(l < 0){ l = lanes.length; lanes.push(0); } lanes[l] = bk.b; bk.lane = l; });
    const nl = Math.max(1, lanes.length);
    let h = itnDateNote(plan) + '<div class="itn-tl" style="height:' + H + 'px">';
    for(let m = lo; m <= hi; m += 60) h += '<div class="itn-tl-h" style="top:' + Math.round((m - lo) * PX) + 'px"><span>' + (m / 60) + ':00</span></div>';
    blocks.forEach((bk) => {
        const it = bk.it, top = Math.round((bk.a - lo) * PX), ht = Math.max(24, Math.round((bk.b - bk.a) * PX) - 2), w = 100 / nl;
        h += '<button type="button" class="itn-tl-b st-' + it.st + '" style="top:' + top + 'px;height:' + ht + 'px;left:calc(46px + (100% - 50px) * ' + (bk.lane / nl).toFixed(3) + ');width:calc((100% - 50px) * ' + (1 / nl).toFixed(3) + ' - 3px)" data-t="itin:edit" data-id="' + it.i + '"><b>' + itnCatOf(it.k)[1] + ' ' + itnE(it.n || "（名前なし）") + '</b><small>' + itnE((it.s || "") + (it.e ? "–" + it.e : "")) + (it.w > 0 ? ' 待' + it.w : '') + (it.aw != null ? ' → 実' + it.aw : '') + '</small></button>';
        if(bk.as != null){ const ae = bk.ae != null ? bk.ae : (it.st === "d" ? itnNowMin() : bk.as + 10); h += '<i class="itn-tl-a" style="top:' + Math.round((bk.as - lo) * PX) + 'px;height:' + Math.max(8, Math.round((ae - bk.as) * PX)) + 'px" title="実際 ' + itnE(it.as + "–" + (it.ae || "")) + '"></i>'; }
    });
    if(plan.date === itnToday()){ const nm = itnNowMin(); if(nm >= lo && nm <= hi) h += '<div class="itn-tl-now" style="top:' + Math.round((nm - lo) * PX) + 'px"><span>いま</span></div>'; }
    return h + '</div><div class="itn-hint2">色のついた ぼうは 予定、右はしの 細い線は 実際に かかった時間です。タップで直せます。</div>';
}
function itnSumHtml(plan){
    const st = itnStats(plan);
    if(!plan.items.length) return itnEmptyHtml();
    let cmp = "まだ記録がありません";
    if(st.cmp){ const d = st.expDone - st.actDone; cmp = d >= 0 ? "予想より <b class='ok'>" + itnDur(d) + " 早かった ✨</b>" : "予想より <b class='ng'>" + itnDur(-d) + " 長かった</b>"; }
    let h = itnDateNote(plan) + '<div class="itn-cards">' +
        '<div class="itn-kpi"><small>完了</small><b>' + st.done + '<em>/' + st.total + '</em></b>' + (st.skip ? '<small>スキップ ' + st.skip + '</small>' : '') + '</div>' +
        '<div class="itn-kpi"><small>待ち時間（実際）</small><b>' + (st.waitN ? itnDur(st.actAll) : "—") + '</b><small>' + (st.cmp ? "予想 " + itnDur(st.expDone) + " と くらべて" : "") + '</small></div>' +
        '<div class="itn-kpi"><small>平均の待ち</small><b>' + (st.waitN ? itnDur(st.avg) : "—") + '</b>' + (st.longest ? '<small>最長 ' + itnE(st.longest.n) + ' ' + st.longest.aw + '分</small>' : '') + '</div>' +
        '<div class="itn-kpi"><small>お金</small><b>' + (st.cost ? itnYen(st.cost) : "—") + '</b></div></div>' +
        '<div class="itn-card"><div class="itn-card-t">予想とのちがい</div><div class="itn-big-t">' + cmp + '</div>' + (st.cmp ? '<div class="itn-meta">予想より 短かった ' + st.shorter + '件 ／ 長かった ' + st.longer + '件</div>' : '') + '</div>';
    const bars = plan.items.filter((x) => x.w > 0 || x.aw != null), mx = Math.max(10, ...bars.map((x) => Math.max(x.w || 0, x.aw || 0)));
    if(bars.length){
        h += '<div class="itn-card"><div class="itn-card-t">待ち時間のくらべ <span class="itn-legend"><i class="e"></i>予想 <i class="a"></i>実際</span></div>';
        bars.forEach((it) => { h += '<div class="itn-bars"><div class="itn-bn">' + itnCatOf(it.k)[1] + ' ' + itnE(it.n || "（名前なし）") + '</div><div class="itn-bw"><i class="e" style="width:' + Math.round((it.w || 0) / mx * 100) + '%"></i>' + (it.aw != null ? '<i class="a ' + (it.w > 0 && it.aw > it.w ? "bad" : "good") + '" style="width:' + Math.round(it.aw / mx * 100) + '%"></i>' : '') + '</div><div class="itn-bv">' + (it.w > 0 ? it.w : "—") + ' → ' + (it.aw != null ? it.aw : "—") + '</div></div>'; });
        h += '</div>';
    }
    const use = {}; let tot = 0;
    plan.items.forEach((it) => { if(it.st === "s") return; let a = itnMin(it.as), b = itnMin(it.ae), d = a != null && b != null ? b - a : (itnMin(it.s) != null && itnMin(it.e) != null ? itnMin(it.e) - itnMin(it.s) : 0); if(d > 0){ use[it.k] = (use[it.k] || 0) + d; tot += d; } });
    if(tot){
        h += '<div class="itn-card"><div class="itn-card-t">時間の つかいかた</div><div class="itn-use">' + ITN_CATS.filter((c) => use[c[0]]).map((c) => '<i class="u-' + c[0] + '" style="flex:' + use[c[0]] + '" title="' + c[2] + '"></i>').join("") + '</div><div class="itn-meta">' + ITN_CATS.filter((c) => use[c[0]]).map((c) => c[1] + c[2] + " " + itnDur(use[c[0]])).join(" ・ ") + '</div></div>';
    }
    h += itnBadgesHtml(plan);
    const notes = plan.items.filter((x) => x.nt || x.r);
    if(notes.length){ h += '<div class="itn-card"><div class="itn-card-t">ひとことメモ・★</div>'; notes.forEach((it) => { h += '<div class="itn-memoline"><b>' + itnE(it.n) + '</b> ' + (it.r ? '<span class="itn-star">' + "★".repeat(it.r) + '</span>' : '') + (it.nt ? '<div>' + itnE(it.nt) + '</div>' : '') + '</div>'; }); h += '</div>'; }
    return h + '<div class="itn-tools"><button type="button" class="button" data-t="itin:x" data-k="jpg">📷 画像（JPEG）にする</button><button type="button" class="button-secondary" data-t="itin:x" data-k="memory">🎴 思い出カード</button><button type="button" class="button-secondary" data-t="itin:export">📤 ほかの形で書き出す</button></div>';
}
function itnEditHtml(plan){
    const it = itnItem(plan, itn.editId); if(!it) return '<div class="itn-empty">この予定は見つかりません。</div><button type="button" class="itn-big sec" data-t="itin:back">もどる</button>';
    const idx = plan.items.indexOf(it), hist = itnHist(it.n, it.i);
    const names = []; Object.keys(itn.plans).forEach((pid) => itn.plans[pid].items.forEach((x) => { if(x.n && !names.includes(x.n)) names.push(x.n); }));
    const nz = (v) => v == null ? "" : v;
    const sh = (d, l) => '<button type="button" data-t="itin:nudge" data-id="' + it.i + '" data-d="' + d + '">' + l + '</button>';
    let h = '<button type="button" class="itn-back" data-t="itin:back">← もどる</button><div class="itn-form">' +
        '<label>内容<input type="text" maxlength="60" list="itnNames" value="' + itnE(it.n) + '" data-t="itin:set" data-id="' + it.i + '" data-f="n" placeholder="例：アトラクションA" autocomplete="off"></label><datalist id="itnNames">' + names.slice(0, 60).map((n) => '<option value="' + itnE(n) + '">').join("") + '</datalist>' +
        '<div class="itn-kinds" role="group" aria-label="種類">' + ITN_CATS.map((c) => '<button type="button" class="' + (it.k === c[0] ? "on" : "") + '" data-t="itin:kind" data-id="' + it.i + '" data-k="' + c[0] + '"><span>' + c[1] + '</span>' + c[2] + '</button>').join("") + '</div>' +
        '<div class="itn-f2"><label>開始（予定）<input type="time" value="' + itnE(it.s) + '" data-t="itin:set" data-id="' + it.i + '" data-f="s"></label><label>終了（予定）<input type="time" value="' + itnE(it.e) + '" data-t="itin:set" data-id="' + it.i + '" data-f="e"></label></div>' +
        '<div class="itn-shift"><span>この予定の時刻を ずらす</span>' + sh(-15, "−15") + sh(-5, "−5") + sh(5, "＋5") + sh(15, "＋15") + '</div>' +
        '<div class="itn-shift"><span>この予定いこうを まとめてずらす</span><button type="button" data-t="itin:nudgeafter" data-id="' + it.i + '" data-d="-10">−10</button><button type="button" data-t="itin:nudgeafter" data-id="' + it.i + '" data-d="-5">−5</button><button type="button" data-t="itin:nudgeafter" data-id="' + it.i + '" data-d="5">＋5</button><button type="button" data-t="itin:nudgeafter" data-id="' + it.i + '" data-d="10">＋10</button></div>' +
        '<div class="itn-f2"><label>予想の待ち（分）<input type="text" inputmode="numeric" value="' + nz(it.w) + '" data-t="itin:set" data-id="' + it.i + '" data-f="w" placeholder="例：35"></label><label>お金（円）<input type="text" inputmode="numeric" value="' + nz(it.c) + '" data-t="itin:set" data-id="' + it.i + '" data-f="c" placeholder="例：1200"></label></div>' +
        (hist ? '<div class="itn-hint">📈 これまでの実績：待ち 平均 ' + hist.avg + '分（' + hist.n + '回・前回 ' + hist.last + '分） <button type="button" class="itn-link" data-t="itin:usehist" data-id="' + it.i + '" data-v="' + hist.avg + '">予想に使う</button></div>' : '') +
        '<label>備考<input type="text" maxlength="120" value="' + itnE(it.m) + '" data-t="itin:set" data-id="' + it.i + '" data-f="m" placeholder="例：改札の前で集合"></label>' +
        itnCrowdLine(it) + itnPlaceHtml(plan, it) +
        '<div class="itn-sec">📝 じっさいの記録</div>' +
        '<label>状態<select data-t="itin:set" data-id="' + it.i + '" data-f="st">' + Object.keys(ITN_ST).map((k) => '<option value="' + k + '"' + (it.st === k ? " selected" : "") + '>' + ITN_ST[k] + '</option>').join("") + '</select></label>' +
        '<div class="itn-f3"><label>実際の待ち（分）<input type="text" inputmode="numeric" value="' + nz(it.aw) + '" data-t="itin:set" data-id="' + it.i + '" data-f="aw"></label><label>実際の開始<input type="time" value="' + itnE(it.as) + '" data-t="itin:set" data-id="' + it.i + '" data-f="as"></label><label>実際の終了<input type="time" value="' + itnE(it.ae) + '" data-t="itin:set" data-id="' + it.i + '" data-f="ae"></label></div>' +
        '<label>ひとことメモ<textarea rows="2" maxlength="200" data-t="itin:set" data-id="' + it.i + '" data-f="nt" placeholder="感想・気づき">' + itnE(it.nt) + '</textarea></label>' + itnStarsHtml(it) +
        '<label class="itn-sw"><input type="checkbox" data-t="itin:set" data-id="' + it.i + '" data-f="al"' + (it.al === 0 ? "" : " checked") + '> この予定のアラームを使う</label>' +
        '<div class="itn-tools"><button type="button" class="button-secondary" data-t="itin:up" data-id="' + it.i + '"' + (idx === 0 ? " disabled" : "") + '>↑ 上へ</button><button type="button" class="button-secondary" data-t="itin:down" data-id="' + it.i + '"' + (idx === plan.items.length - 1 ? " disabled" : "") + '>↓ 下へ</button><button type="button" class="button-secondary" data-t="itin:dup" data-id="' + it.i + '">⧉ コピー</button>' +
        '<button type="button" class="button-danger" data-t="itin:del" data-id="' + it.i + '">' + (itn.confirm === "item:" + it.i ? "もういちど押すと 消します" : "🗑 消す") + '</button></div><button type="button" class="itn-big" data-t="itin:back">✔ できた</button></div>';
    return h;
}
function itnPlansHtml(plan){
    let h = '<button type="button" class="itn-back" data-t="itin:back">← もどる</button>';
    const ids = Object.keys(itn.plans).sort((a, b) => (itn.plans[b].date || "").localeCompare(itn.plans[a].date || "") || itn.plans[b].t - itn.plans[a].t);
    if(ids.length){
        h += '<div class="itn-card"><div class="itn-card-t">予定表を えらぶ</div>';
        ids.forEach((id) => { const p = itn.plans[id], st = itnStats(p); h += '<button type="button" class="itn-next' + (id === itn.active ? " on" : "") + '" data-t="itin:switch" data-id="' + id + '"><span>' + (id === itn.active ? "✅" : "📋") + '</span><b>' + itnE(p.title) + '</b><small>' + itnE(itnDateLabel(p.date)) + ' ・ ' + st.done + '/' + st.total + '</small></button>'; });
        h += '</div>';
    }
    if(plan){
        h += '<div class="itn-card"><div class="itn-card-t">この予定表の名前と日付</div><div class="itn-f2"><label>名前<input type="text" maxlength="40" value="' + itnE(plan.title) + '" data-t="itin:pset" data-f="title"></label><label>日付<input type="date" value="' + itnE(plan.date) + '" data-t="itin:pset" data-f="date"></label></div>' +
            '<div class="itn-tools"><button type="button" class="button-secondary" data-t="itin:pdup">⧉ この表をコピー</button><button type="button" class="button-secondary" data-t="itin:pclear">🔄 記録だけ消して やりなおし</button><button type="button" class="button-danger" data-t="itin:pdel">' + (itn.confirm === "plan:" + plan.id ? "もういちど押すと この表を消します" : "🗑 この表を消す") + '</button></div></div>';
    }
    h += '<div class="itn-card"><div class="itn-card-t">新しい予定表を作る</div>' + ITN_TPL.map((t) => '<button type="button" class="itn-next" data-t="itin:tpl" data-k="' + t[0] + '"><span>' + t[1] + '</span><b>' + t[2] + '</b><small>' + t[3] + '</small></button>').join("") + '<button type="button" class="itn-next" data-t="itin:import"><span>📥</span><b>表をはりつけて作る</b><small>Excel・メモ・PDFの表から</small></button></div>';
    return h + '<div class="itn-meta">' + (itn.cloudMsg ? '⚠ ' + itnE(itn.cloudMsg) : itn.cloudOff ? '☁ クラウドには まだ つながっていません（この端末には 保存されています）' : '☁ この端末とクラウド（あなただけ）に 自動で保存されます。スマホとパソコンで 同じ予定表が 見えます。') + '</div>';
}
function itnImportHtml(plan){
    let h = '<button type="button" class="itn-back" data-t="itin:back">← もどる</button><div class="itn-card"><div class="itn-card-t">📥 表をはりつけて取り込む</div><p class="itn-meta">Excel・メモ・PDFの表を コピーして、下に はりつけてください。<b>時刻・待ち時間（35分）・金額（¥1,200）・内容・備考</b>を 自動で読み取ります。列の順番は 自由です。</p>' +
        '<textarea id="itnImpTxt" rows="9" placeholder="例）&#10;9:00&#9;9:45&#9;アトラクションA 待ち35分&#9;備考" spellcheck="false">' + itnE(itn.importTxt) + '</textarea>' +
        '<div class="itn-tools"><button type="button" class="button" data-t="itin:parse">🔍 読み取る</button><button type="button" class="button-secondary" data-t="itin:sample">例を入れる</button><label class="button-secondary itn-file">ファイルから<input type="file" accept=".txt,.csv,.tsv,.md,.json,text/*,application/json" data-t="itin:file" hidden></label></div></div>';
    const pv = itn.preview;
    if(pv){
        h += '<div class="itn-card"><div class="itn-card-t">読み取った結果：' + pv.items.length + '件' + (pv.skipped ? '（読み取れない行 ' + pv.skipped + '）' : '') + '</div>';
        if(!pv.items.length) h += '<p class="itn-meta">予定が見つかりませんでした。1行に1つずつ、「時刻」と「内容」が入っているか 確かめてください。</p>';
        pv.items.slice(0, 12).forEach((x) => { h += '<div class="itn-pv"><b>' + itnCatOf(x.k)[1] + ' ' + itnE(x.n) + '</b><small>' + itnE((x.s || "（時刻なし）") + (x.e ? "–" + x.e : "") + (x.w > 0 ? " ・待ち予想" + x.w + "分" : "") + (x.c != null ? " ・" + itnYen(x.c) : "") + (x.m ? " ・" + x.m : "")) + '</small></div>'; });
        if(pv.items.length > 12) h += '<div class="itn-meta">ほか ' + (pv.items.length - 12) + '件</div>';
        if(pv.items.length){
            h += '<div class="itn-f2"><label>取り込みかた<select id="itnImpMode"><option value="new"' + (itn.importMode === "new" || !plan ? " selected" : "") + '>新しい予定表にする</option>' + (plan ? '<option value="add"' + (itn.importMode === "add" ? " selected" : "") + '>いまの予定表に 足す</option><option value="replace">いまの予定表を 入れかえる</option>' : '') + '</select></label><label>名前（新しい表のとき）<input type="text" id="itnImpTitle" maxlength="40" value="' + itnE(itn.importTitle || pv.title || "") + '" placeholder="例：11/21 おでかけ"></label></div>' +
                '<label>日付<input type="date" id="itnImpDate" value="' + itnE(pv.date || (plan && plan.date) || itnToday()) + '"></label><button type="button" class="itn-big" data-t="itin:doimport">✅ ' + pv.items.length + '件を 取り込む</button>';
        }
        h += '</div>';
    }
    return h;
}
function itnExportHtml(plan){
    const F = [["pdf", "📄", "PDF", "印刷・メールに"], ["xlsx", "📗", "Excel", "表計算（.xlsx）"], ["docx", "📘", "Word", "文書（.docx）"], ["txt", "📃", "テキスト", "メモ帳・LINEに"], ["jpg", "📷", "JPEG画像", "スマホに保存・送る"], ["png", "🖼️", "PNG画像", "くっきり画像"], ["csv", "📊", "CSV", "Excelで開ける"], ["html", "🌐", "Webページ", "ブラウザで見る・印刷"], ["ics", "📅", "カレンダー", "iPhone・Googleに（.ics）"], ["json", "💾", "バックアップ", "あとで読みこめる"]];
    return '<button type="button" class="itn-back" data-t="itin:back">← もどる</button><div class="itn-card"><div class="itn-card-t">📤 書き出す（10種類）</div><p class="itn-meta">「' + itnE(plan ? plan.title : "") + '」を 好きな形で 保存・共有できます。記録（実際の待ち時間など）も 入ります。</p><div class="itn-xgrid">' +
        F.map((f) => '<button type="button" data-t="itin:x" data-k="' + f[0] + '"><span>' + f[1] + '</span><b>' + f[2] + '</b><small>' + f[3] + '</small></button>').join("") + '</div></div>' +
        itnRoomSendHtml() + '<div class="itn-card"><div class="itn-card-t">そのほか</div><div class="itn-tools"><button type="button" class="button-secondary" data-t="itin:x" data-k="memory">🎴 思い出カード（画像）</button><button type="button" class="button-secondary" data-t="itin:x" data-k="share">📤 共有（LINEなど）</button><button type="button" class="button-secondary" data-t="itin:x" data-k="copy">📋 テキストをコピー</button><button type="button" class="button-secondary" data-t="itin:x" data-k="print">🖨 印刷</button></div></div>' +
        '<div class="itn-meta">PDF・画像は「見た目そのまま」の画像ベースです（文字の選択はできません）。文字を使いたいときは Excel・Word・テキストをお使いください。</div>';
}
function itnAlarmHtml(){
    const p = itn.prefs, perm = ("Notification" in window) ? Notification.permission : "none";
    const permTxt = perm === "granted" ? "✅ 許可されています" : perm === "denied" ? "🚫 ブロックされています（ブラウザの設定で許可してください）" : perm === "default" ? "まだ 許可していません" : "このブラウザでは 通知を使えません";
    const sw = (k, label) => '<label class="itn-sw"><input type="checkbox" data-t="itin:pref" data-k="' + k + '"' + (p[k] ? " checked" : "") + '> ' + label + '</label>';
    return '<button type="button" class="itn-back" data-t="itin:back">← もどる</button><div class="itn-card"><div class="itn-card-t">🔔 アラーム・お知らせ</div>' + sw("alarm", "アラームを使う（ぜんたいのスイッチ）") + sw("sound", "🔊 音を鳴らす") + sw("vibrate", "📳 ふるえる（対応する端末）") + sw("speak", "🗣 声で読み上げる（スマホをポケットに入れていても わかる）") + sw("speakAct", "　└ ボタンを押したあとにも 読み上げる（「並びはじめました。予想は35分です」など）") + sw("notify", "🔔 通知（ポップアップ）も出す") +
        '<label>声の はやさ<select data-t="itin:pref" data-k="rate">' + [[0.8, "ゆっくり"], [1, "ふつう"], [1.25, "はやめ"]].map((o) => '<option value="' + o[0] + '"' + (Number(p.rate) === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select></label>' +
        '<label>並んでいるあいだ、読み上げる間かく<select data-t="itin:pref" data-k="speakEvery">' + [[0, "読み上げない"], [3, "3分ごと"], [5, "5分ごと"], [10, "10分ごと"]].map((o) => '<option value="' + o[0] + '"' + (Number(p.speakEvery) === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select></label>' +
        '<div class="itn-tools"><button type="button" class="button-secondary" data-t="itin:sayplan">🔊 読み上げの テスト（のこりの予定を読む）</button></div>' +
        (itn.crowdOff ? "" : sw("crowd", "👥 実際の待ち時間を、名前を伏せて みんなの目安に役立てる（3人以上の記録が たまった ものだけ 見られます）")) +
        '<div class="itn-meta">通知の許可：' + permTxt + '</div>' + (perm === "default" ? '<button type="button" class="button" data-t="itin:perm">通知を許可する</button>' : '') +
        '<label>予定の何分前に 知らせる<select data-t="itin:pref" data-k="lead">' + [[-1, "知らせない（時刻ちょうどだけ）"], [0, "ちょうどの時刻だけ"], [3, "3分前"], [5, "5分前"], [10, "10分前"], [15, "15分前"], [30, "30分前"]].map((o) => '<option value="' + o[0] + '"' + (Number(p.lead) === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select></label>' + sw("wake", "💡 この画面を開いているあいだ、画面を消さない") +
        '<div class="itn-tools"><button type="button" class="button-secondary" data-t="itin:test">🔔 テストで鳴らす</button></div></div>' +
        '<div class="itn-card"><div class="itn-card-t">お知らせする内容</div><ul class="itn-ul"><li>予定の「○分前」と「時刻ちょうど」</li><li>並んでいるとき：予想の待ち時間になったとき／10分長くなったとき</li><li>進行中の予定の「終わりの時刻」</li></ul><div class="itn-meta">各予定の「アラームを使う」は、予定の編集画面で 切りかえられます。ポップアップの「5分あとで」で もう一度 お知らせします。</div></div>' +
        '<div class="itn-card"><div class="itn-card-t">ご注意（正直に）</div><ul class="itn-ul"><li>アラームは、<b>この アプリを 開いているあいだ</b>に 鳴ります。ブラウザや アプリを 完全に 閉じたときや、端末が 深く 眠っているときは 鳴らないことが あります。</li><li>当日は、アプリを 開いたまま、「画面を消さない」を オンにすると 安心です。</li><li>iPhoneで 通知を使うには、Safariの 共有メニューから「ホーム画面に追加」した アプリで 開いてください。</li><li>裏に回ったとき、時計が 1分ほど ずれて 鳴ることが あります。</li></ul></div>';
}
function itnSubHtml(plan){
    if(itn.sub === "edit") return itnEditHtml(plan);
    if(itn.sub === "plans") return itnPlansHtml(plan);
    if(itn.sub === "import") return itnImportHtml(plan);
    if(itn.sub === "export") return itnExportHtml(plan);
    if(itn.sub === "alarm") return itnAlarmHtml();
    if(itn.sub === "check") return itnCheckHtml(plan);
    if(itn.sub === "bot") return itnBotHtml(plan);
    return "";
}
function itnUndoHtml(){
    const u = itn.undo; if(!u || Date.now() - u.at > 20000 || itn.sub) return "";
    return '<div class="itn-undo"><span>' + itnE(u.label) + 'を押しました</span><button type="button" data-t="itin:undo">↩ 元に戻す</button></div>';
}
function itnRender(){
    const root = document.getElementById("itnRoot"); if(!root) return;
    const prev = root.querySelector(".itn-body"), sc = prev && !itn.scroll0 ? prev.scrollTop : 0;
    itn.scroll0 = false;
    const plan = itnPlan();
    let h = itnTopHtml(plan);
    if(!itn.sub && plan && plan.items.length) h += itnProgHtml(plan);
    if(itn.sub) h += '<div class="itn-body">' + itnSubHtml(plan) + '</div>';
    else h += itnTabsHtml() + (plan ? itnStripHtml(plan) : '') + '<div class="itn-body">' + (!plan ? itnEmptyHtml() : itn.tab === "list" ? itnListHtml(plan) : itn.tab === "time" ? itnTimelineHtml(plan) : itn.tab === "sum" ? itnSumHtml(plan) : itnNowHtml(plan)) + '</div>';
    h += itnUndoHtml();
    root.innerHTML = h;
    const b = root.querySelector(".itn-body"); if(b) b.scrollTop = sc;
    if(itn.botScroll){ itn.botScroll = false; if(b && itn.sub === "bot"){ b.scrollTop = b.scrollHeight; const inp = document.getElementById("itnBotIn"); if(inp && !itn.voiceOn) try{ inp.focus({preventScroll: true}); }catch(_e){} } }
    itnLive();
}
function itnRenderStatus(){ const r = document.getElementById("itnRoot"); if(r && itn.sub === "plans") itnRender(); }

// ---------- 1秒ごとの更新（時計・遅れ・ピル）----------
function itnLive(){
    const root = document.getElementById("itnRoot");
    if(!root){ clearInterval(itn.live); itn.live = null; if(itn.wl) itnWake(false); itnPill(); return; }
    const plan = itnPlan(); if(!plan) return;
    const now = Date.now();
    root.querySelectorAll("[data-lv]").forEach((n) => {
        const it = itnItem(plan, n.dataset.id); if(!it) return;
        const k = n.dataset.lv;
        if((k === "wait" || k === "doing") && it.ts) n.textContent = itnFmtClock((now - it.ts) / 1000);
        else if(k === "bar" && it.ts && it.w > 0){ const el = (now - it.ts) / 1000; n.style.width = Math.min(100, el / (it.w * 60) * 100) + "%"; n.parentNode.classList.toggle("over", el > it.w * 60); }
        else if(k === "lab" && it.ts){
            if(!(it.w > 0)){ n.textContent = "待ち時間をはかっています"; return; }
            const diff = it.w - (now - it.ts) / 60000;
            n.textContent = diff >= 1 ? "予想まで あと " + Math.ceil(diff) + "分ぐらい（予想 " + it.w + "分）" : diff > -1 ? "そろそろ 予想の時間です" : "予想より " + Math.floor(-diff) + "分 長くなっています";
            n.classList.toggle("bad", diff <= -1); n.classList.toggle("good", diff >= 1);
        }else if(k === "until"){
            if(plan.date && plan.date !== itnToday()){ n.textContent = it.s ? "予定 " + itnDateLabel(plan.date) + " " + it.s : ""; return; }
            if(!it.s){ n.textContent = ""; return; }
            const diff = (itnAt(itnToday(), it.s) - now) / 60000;
            n.textContent = diff >= 1 ? "予定の時刻まで あと " + itnDur(Math.ceil(diff)) : diff > -1 ? "予定の時刻です" : "予定を " + itnDur(Math.floor(-diff)) + " すぎています";
            n.classList.toggle("bad", diff <= -5);
        }
    });
    const dt = itnDelayText(itnDelay(plan));
    root.querySelectorAll("[data-itn-delay]").forEach((n) => { if(n.textContent !== dt && (dt || n.classList.contains("itn-dl"))) n.textContent = dt; });
    const u = root.querySelector(".itn-undo"); if(u && (!itn.undo || now - itn.undo.at > 20000)) u.remove();
    itnPill();
}
/** 並んでいる／進行中のあいだ、画面の すみに 小さな時計を出す（ほかの画面を見ていても わかる）*/
function itnPill(){
    let pill = document.getElementById("itnPill");
    const plan = itnPlan(), it = plan ? itnWorking(plan)[0] : null, open = !!document.getElementById("itnRoot");
    if(!it || open || !it.ts){ if(pill) pill.hidden = true; return; }
    if(!pill){ pill = document.createElement("button"); pill.type = "button"; pill.id = "itnPill"; pill.className = "itn-pill"; pill.addEventListener("click", () => runTool(openItin)); document.body.appendChild(pill); }
    const el = (Date.now() - it.ts) / 1000;
    pill.hidden = false; pill.classList.toggle("bad", it.st === "w" && it.w > 0 && el > it.w * 60);
    pill.textContent = (it.st === "w" ? "🚶 " : "▶ ") + itnFmtClock(el) + (it.st === "w" && it.w > 0 ? " / " + it.w + "分" : "") + " " + (it.n || "").slice(0, 8);
}

// ---------- 操作 ----------
function itnFlush(){
    const plan = itnPlan(), root = document.getElementById("itnRoot"); if(!plan || !root) return;
    root.querySelectorAll('textarea[data-t="itin:note"]').forEach((t) => { const it = itnItem(plan, t.dataset.id); if(it && it.nt !== t.value.slice(0, 200)){ it.nt = t.value.slice(0, 200); itnTouch(plan); } });
}
function itnLeaveEdit(plan){
    const it = plan && itnItem(plan, itn.editId);
    if(it && !it.n && !it.s && !it.e && !it.m && it.w == null && it.c == null && it.st === "t"){ plan.items.splice(plan.items.indexOf(it), 1); itnTouch(plan); }
    itn.editId = ""; itn.confirm = "";
}
function itnGo(sub){ const bb = document.querySelector("#itnRoot .itn-body"); if(!itn.sub && bb) itn.ret = bb.scrollTop; itn.sub = sub; itn.confirm = ""; itn.scroll0 = true; if(sub !== "import") itn.preview = null; itnRender(); }
function itnMic(plan, it, node){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ showToast("このブラウザでは 声のメモを使えません。"); return; }
    if(itn.rec){ try{ itn.rec.stop(); }catch(_e){} itn.rec = null; return; }
    const r = new SR(); r.lang = "ja-JP"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(""); it.nt = ((it.nt ? it.nt + " " : "") + t).slice(0, 200); itnTouch(plan); itnRender(); };
    r.onend = r.onerror = () => { itn.rec = null; node.classList.remove("rec"); };
    itn.rec = r; node.classList.add("rec"); showToast("🎤 話してください"); try{ r.start(); }catch(_e){ itn.rec = null; }
}
function itnStatusText(plan){
    const work = itnWorking(plan), nxt = itnNextTodo(plan), L = ["【" + plan.title + "】いまの様子"];
    work.forEach((it) => { if(it.st === "w") L.push("🚶 いま「" + it.n + "」に 並んでいます（" + Math.max(0, Math.round((Date.now() - it.ts) / 60000)) + "分め" + (it.w > 0 ? "・予想" + it.w + "分" : "") + "）"); else L.push("▶ いま「" + it.n + "」の 最中です"); });
    if(nxt) L.push("⏭ つぎは「" + nxt.n + "」" + (nxt.s ? "（予定 " + nxt.s + "）" : ""));
    const dl = itnDelay(plan); if(dl && dl.st !== "t") L.push(itnDelayText(dl)); else if(dl && dl.d >= 2) L.push(itnDelayText(dl));
    const st = itnStats(plan); L.push("✅ " + st.done + "/" + st.total + " 完了");
    return L.join("\n");
}
async function onItinAction(action, node){
    itnAudio(); itnFlush();
    const plan = itnPlan(), d = node && node.dataset ? node.dataset : {}, it = plan && d.id ? itnItem(plan, d.id) : null;
    const redo = () => itnRender();
    switch(action){
        case "tab": itn.tab = d.v; itn.sub = ""; itn.scroll0 = true; return redo();
        case "back": { if(itn.sub === "edit") itnLeaveEdit(plan); itn.sub = ""; itn.confirm = ""; itn.scroll0 = true; itnRender(); const bb = document.querySelector("#itnRoot .itn-body"); if(bb) bb.scrollTop = itn.ret || 0; return; }
        case "plans": case "alarm": case "export": return itnGo(action);
        case "import": itn.importMode = plan && plan.items.length ? "add" : "new"; return itnGo("import");
        case "wait": case "begin": case "finish": case "skip": case "reopen": {
            if(!it) return; itnAdvance(plan, it, action); itnSayAction(action, plan, it);
            if(action === "finish") showToast("おつかれさま！" + (it.aw != null ? "待ちは " + it.aw + "分でした。" : "記録しました。"));
            if(action === "begin" && it.aw != null) showToast("待ち " + it.aw + "分" + (it.w > 0 ? "（予想 " + it.w + "分）" : "") + "。記録しました。");
            try{ if(navigator.vibrate) navigator.vibrate(30); }catch(_e){}
            return redo();
        }
        case "cycle": { if(!it) return; itnAdvance(plan, it, it.st === "t" ? "finish" : it.st === "w" ? "begin" : it.st === "d" ? "finish" : "reopen"); return redo(); }
        case "focus": itn.focus = d.id; itn.scroll0 = true; return redo();
        case "undo": if(itnDoUndo()) showToast("元に戻しました。"); return redo();
        case "star": if(it){ it.r = it.r === Number(d.n) ? 0 : Number(d.n); itnTouch(plan); redo(); } return;
        case "note": if(it){ it.nt = node.value.slice(0, 200); itnTouch(plan); } return;
        case "mic": if(it) itnMic(plan, it, node); return;
        case "edit": itn.editId = d.id; itn.confirm = ""; return itnGo("edit");
        case "add": {
            if(!plan){ itnNewPlan("行動予定表", itnToday(), []); }
            const p = itnPlan(); if(p.items.length >= ITN_MAX_ITEMS){ showToast("予定は " + ITN_MAX_ITEMS + "件までです。"); return; }
            const last = p.items[p.items.length - 1], ni = itnCleanItem({n: "", s: last && last.e ? last.e : "", k: "other"});
            p.items.push(ni); itnTouch(p); itn.editId = ni.i; itn.tab = "list"; return itnGo("edit");
        }
        case "set": {
            if(!it) return; const f = d.f, v = node.type === "checkbox" ? node.checked : node.value, cl = itnCleanItem(Object.assign({}, it, {[f]: f === "al" ? (v ? 1 : 0) : v}));
            if(f === "n" || f === "m" || f === "nt") it[f] = cl[f];
            else if(f === "s" || f === "e" || f === "as" || f === "ae") it[f] = String(v || "") === "" ? "" : cl[f];
            else if(f === "w" || f === "c" || f === "aw") it[f] = String(v).trim() === "" ? null : cl[f];
            else if(f === "al") it.al = v ? 1 : 0;
            else if(f === "st"){ it.st = cl.st; it.ts = (it.st === "w" || it.st === "d") ? Date.now() : 0; if(it.st === "t"){ it.aw = null; it.as = ""; it.ae = ""; } }
            itnTouch(plan);
            if(f === "st") redo(); else { const dl = document.querySelector("[data-itn-delay]"); if(dl) itnLive(); }   // 入力中の欄を つくりなおさない（キーボードが消えるため）
            return;
        }
        case "kind": if(it){ it.k = d.k; itnTouch(plan); redo(); } return;
        case "usehist": if(it){ it.w = Number(d.v); itnTouch(plan); redo(); } return;
        case "nudge": case "nudgeafter": {
            if(!it) return; const dd = Number(d.d) || 0;
            if(action === "nudge"){ ["s", "e"].forEach((f) => { const m = itnMin(it[f]); if(m != null) it[f] = itnHM(m + dd); }); }
            else itnShift(plan, plan.items.slice(plan.items.indexOf(it)).map((x) => x.i), dd), (it.st !== "t" && ["s", "e"].forEach((f) => { const m = itnMin(it[f]); if(m != null) it[f] = itnHM(m + dd); }));
            itnTouch(plan); return redo();
        }
        case "up": case "down": { if(!it) return; const i = plan.items.indexOf(it), j = action === "up" ? i - 1 : i + 1; if(j < 0 || j >= plan.items.length) return; plan.items.splice(i, 1); plan.items.splice(j, 0, it); itnTouch(plan); return redo(); }
        case "dup": { if(!it) return; const c = itnCleanItem(Object.assign({}, it, {i: itnId(), st: "t", ts: 0, aw: null, as: "", ae: "", nt: "", r: 0})); plan.items.splice(plan.items.indexOf(it) + 1, 0, c); itnTouch(plan); itn.editId = c.i; showToast("コピーしました。"); return redo(); }
        case "del": {
            if(!it) return;
            if(itn.confirm !== "item:" + it.i){ itn.confirm = "item:" + it.i; return redo(); }
            plan.items.splice(plan.items.indexOf(it), 1); itn.confirm = ""; itn.editId = ""; itn.sub = ""; itnTouch(plan); showToast("消しました。"); return redo();
        }
        case "sort": {
            const idx = new Map(plan.items.map((x, i) => [x, i]));
            plan.items.sort((a, b) => { const x = itnMin(a.s), y = itnMin(b.s); if(x == null && y == null) return idx.get(a) - idx.get(b); if(x == null) return 1; if(y == null) return -1; return x - y || idx.get(a) - idx.get(b); });
            itnTouch(plan); showToast("時刻の順にならべました。"); return redo();
        }
        case "shiftall": { const n = itnShift(plan, plan.items.map((x) => x.i), Number(d.d)); itnTouch(plan); showToast(n ? "のこり " + n + "件を " + Math.abs(Number(d.d)) + "分 " + (Number(d.d) > 0 ? "あとに" : "前に") + " ずらしました。" : "ずらす予定がありません。"); return redo(); }
        case "shiftlate": { const dl = itnDelay(plan); if(!dl || dl.d < 1) return; const n = itnShift(plan, plan.items.map((x) => x.i), dl.d); itnTouch(plan); showToast("のこり " + n + "件を " + dl.d + "分 ずらしました。"); return redo(); }
        case "today": if(plan){ plan.date = itnToday(); itnTouch(plan); } return redo();
        case "status": {
            if(!plan) return; const text = itnStatusText(plan);
            if(navigator.share){ try{ await navigator.share({text}); return; }catch(e){ if(e && e.name === "AbortError") return; } }
            try{ await navigator.clipboard.writeText(text); showToast("コピーしました。LINEなどに はりつけてください。"); }catch(_e){ showToast("共有できませんでした。"); }
            return;
        }
        // ----- 予定表そのもの -----
        case "switch": if(itn.plans[d.id]){ itn.active = d.id; itn.sub = ""; itn.scroll0 = true; itnSaveLocal(); } return redo();
        case "tpl": { const t = ITN_TPL.find((x) => x[0] === d.k); itnNewPlan(t ? t[2] : "行動予定表", itnToday(), itnTplItems(d.k)); itn.tab = d.k === "blank" ? "list" : "now"; itn.sub = ""; itn.scroll0 = true; showToast("作りました。時刻や名前は あとから 直せます。"); return redo(); }
        case "pset": { if(!plan) return; if(d.f === "title") plan.title = (node.value.trim() || "行動予定表").slice(0, 40); else if(d.f === "date") plan.date = /^\d{4}-\d{2}-\d{2}$/.test(node.value) ? node.value : ""; itnTouch(plan); return; }
        case "pdup": { if(!plan) return; const p = itnNewPlan(plan.title + "（コピー）", plan.date, plan.items.map((x) => Object.assign({}, x, {i: itnId(), st: "t", ts: 0, aw: null, as: "", ae: "", nt: "", r: 0}))); itn.sub = ""; showToast("コピーしました。"); return redo(); }
        case "pclear": { if(!plan) return; plan.items.forEach((x) => { x.st = "t"; x.ts = 0; x.aw = null; x.as = ""; x.ae = ""; x.nt = ""; x.r = 0; }); itnTouch(plan); itn.sub = ""; showToast("記録を消して、やりなおせるようにしました。"); return redo(); }
        case "pdel": {
            if(!plan) return;
            if(itn.confirm !== "plan:" + plan.id){ itn.confirm = "plan:" + plan.id; return redo(); }
            const id = plan.id; delete itn.plans[id]; itn.del[id] = Date.now(); itn.dirty.add(id); itn.confirm = ""; itnFix(); itnSaveLocal(); itnCloudSoon(); showToast("消しました。"); return redo();
        }
        // ----- 取り込み -----
        case "sample": itn.importTxt = ITN_SAMPLE; itn.preview = null; return redo();
        case "parse": {
            const ta = document.getElementById("itnImpTxt"); itn.importTxt = ta ? ta.value : itn.importTxt;
            itn.preview = itnParse(itn.importTxt);
            if(!itn.preview.items.length) showToast("予定が見つかりませんでした。");
            return redo();
        }
        case "file": {
            const f = node.files && node.files[0]; if(!f) return;
            if(f.size > 500000){ showToast("ファイルが大きすぎます（500KBまで）。"); return; }
            const text = await f.text(); node.value = "";
            if(/\.json$/i.test(f.name) || /^\s*\{/.test(text)){
                try{ const j = JSON.parse(text), p = j && (j.plan || j); if(p && Array.isArray(p.items)){ const np = itnNewPlan(String(p.title || "取り込んだ予定表").slice(0, 40), /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : itnToday(), p.items.slice(0, ITN_MAX_ITEMS)); itn.sub = ""; itn.tab = "list"; showToast("バックアップから「" + np.title + "」を作りました。"); return redo(); } }catch(_e){}
            }
            itn.importTxt = text.slice(0, 60000); itn.preview = itnParse(itn.importTxt); return redo();
        }
        case "doimport": {
            const pv = itn.preview; if(!pv || !pv.items.length) return;
            const mode = (document.getElementById("itnImpMode") || {}).value || "new", title = ((document.getElementById("itnImpTitle") || {}).value || "").trim(), date = (document.getElementById("itnImpDate") || {}).value || "";
            itn.importMode = mode; itn.importTitle = title;
            if(mode === "new" || !plan){ itnNewPlan(title || pv.title || "取り込んだ予定表", date || itnToday(), pv.items); }
            else{
                if(mode === "replace") plan.items = [];
                if(plan.items.length + pv.items.length > ITN_MAX_ITEMS){ showToast("予定は " + ITN_MAX_ITEMS + "件までです。"); return; }
                pv.items.forEach((x) => plan.items.push(itnCleanItem(x))); if(date) plan.date = date; itnTouch(plan);
            }
            const n = pv.items.length; itn.preview = null; itn.importTxt = ""; itn.sub = ""; itn.tab = "list"; itn.scroll0 = true; showToast(n + "件を 取り込みました。時刻は あとから 直せます。"); return redo();
        }
        // ----- 設定・書き出し -----
        case "pref": {
            const k = d.k; if(!(k in itn.prefs)) return;
            itn.prefs[k] = typeof itn.prefs[k] === "boolean" ? !!node.checked : Number(node.value);
            if(k === "wake") itnWake(itn.prefs.wake);
            itnSaveLocal(); return redo();
        }
        case "perm": {
            try{ const r = await Notification.requestPermission(); showToast(r === "granted" ? "通知を許可しました。" : "通知は許可されませんでした。"); }catch(_e){ showToast("このブラウザでは 通知を使えません。"); }
            return redo();
        }
        case "test": { delete itn.fired["test"]; itnFire("test", "⏰ テスト：アラームです", "このように お知らせします。", "go"); delete itn.fired["test"]; if(!document.hasFocus() || document.hidden) return; itnSysNotify("⏰ テスト：アラームです", "このように お知らせします。", "itin-test"); return; }
        case "x": return itnExport(d.k, plan);
        case "send": return itnSendRoom(d.k, node);
        case "adhoc": {
            const p = plan || itnNewPlan("行動予定表", itnToday(), []);
            if(p.items.length >= ITN_MAX_ITEMS){ showToast("予定は " + ITN_MAX_ITEMS + "件までです。"); return; }
            const hm = itnNowHM(), ni = itnCleanItem({n: "予定外のこと", s: hm, k: "other", st: "d", ts: Date.now(), as: hm});
            p.items.push(ni); itnTouch(p); itn.editId = ni.i; return itnGo("edit");
        }
        default: return itnMoreAction(action, node, plan, it, d);
    }
}


// ---------- チャットに「カード」で送る／受け取って取り込む（この アプリならでは）----------
/** 友だちに送るカード。予定だけ／結果（実際の待ち時間）つき。メッセージは 12000文字までなので、入りきらない分は 省く */
function itnCardPayload(plan, withResult){
    const items = plan.items.map((it) => {
        const o = {n: it.n}; if(it.k !== "other") o.k = it.k; if(it.s) o.s = it.s; if(it.e) o.e = it.e; if(it.w != null) o.w = it.w; if(it.m) o.m = it.m; if(it.c != null) o.c = it.c;
        if(withResult && it.st === "x"){ o.z = 1; if(it.aw != null) o.a = it.aw; if(it.r) o.r = it.r; }
        return o;
    });
    let n = items.length, p;
    for(;;){ p = {type: "itin", v: 1, title: plan.title, date: plan.date, total: items.length, res: withResult ? 1 : 0, items: items.slice(0, n)}; if(JSON.stringify(p).length <= 11000 || n <= 1) break; n = Math.max(1, n - Math.max(1, Math.ceil(n * 0.1))); }
    return p;
}
function itnCardHtml(item){
    const items = (Array.isArray(item.items) ? item.items : []).slice(0, 80), total = Number(item.total) || items.length;
    const key = "c" + (itn.cards.size % 50) + "_" + String(item.title || "").length + "_" + items.length;
    itn.cards.set(key, item);
    let h = '<div class="bubble itn-cd"><div class="itn-cd-t">📋 <b>' + itnE(String(item.title || "行動予定表").slice(0, 40)) + '</b></div><div class="meta">' + itnE(itnDateLabel(String(item.date || ""))) + ' ・ 全 ' + total + '件' + (item.res ? ' ・ 🏁 結果つき' : '') + '</div>';
    items.slice(0, 7).forEach((x) => {
        const w = Number(x.w) > 0 ? Number(x.w) : 0, a = x.a != null ? Number(x.a) : null;
        h += '<div class="itn-cd-r"><span class="t">' + itnE(String(x.s || "").slice(0, 5)) + '</span><span class="n">' + itnCatOf(x.k)[1] + ' ' + itnE(String(x.n || "").slice(0, 30)) + '</span>' + (w || a != null ? '<span class="w' + (a != null && w && a > w ? " bad" : a != null ? " good" : "") + '">' + (w ? "予想" + w : "") + (a != null ? (w ? "→" : "") + "実" + a : "") + '分</span>' : '') + '</div>';
    });
    if(total > 7) h += '<div class="meta">ほか ' + (total - 7) + '件…</div>';
    return h + '<button type="button" class="button-secondary" data-itn-card="' + itnE(key) + '">📥 私の行動予定表に取り込む</button></div>';
}
function itnImportCard(key){
    const c = itn.cards.get(key); if(!c || !Array.isArray(c.items)) return;
    const useA = !!c.res; let used = 0;
    const items = c.items.slice(0, ITN_MAX_ITEMS).map((x) => { const w = useA && x.a != null ? Number(x.a) : x.w; if(useA && x.a != null) used++; return {n: x.n, k: x.k, s: x.s, e: x.e, w, m: x.m, c: x.c}; });
    const plan = itnNewPlan(String(c.title || "友だちの予定表").slice(0, 28) + "（友だちから）", /^\d{4}-\d{2}-\d{2}$/.test(c.date || "") ? c.date : itnToday(), items);
    itn.tab = "list"; openItin(); showToast("取り込みました。" + (used ? "友だちの実際の待ち時間 " + used + "件を、あなたの「予想」に入れました。" : "時刻は 自分の予定に合わせて 直せます。"));
    return plan;
}
async function itnSendRoom(kind, node){
    const plan = itnPlan(), sel = document.getElementById("itnRoom"), roomId = sel ? sel.value : "";
    if(!plan || !plan.items.length){ showToast("送る予定がありません。"); return; }
    if(!roomId){ showToast("送り先のチャットを えらんでください。"); return; }
    node.disabled = true;
    try{
        const res = kind === "status" ? await sendRpcContent(roomId, itnStatusText(plan)) : await sendPayloadToRoom(roomId, itnCardPayload(plan, kind === "result"));
        if(res && res.error) throw res.error;
        showToast("チャットに 送りました。");
        if(state.currentRoom && state.currentRoom.id === roomId && typeof loadMessages === "function") await loadMessages(false, true);
    }catch(error){ showToast(featError(error)); }
    node.disabled = false;
}
function itnRoomSendHtml(){
    const rooms = (state.rooms || []).filter((r) => !r.suspended_at), cur = state.currentRoom ? state.currentRoom.id : "";
    if(!rooms.length) return "";
    return '<div class="itn-card"><div class="itn-card-t">💬 チャットの友だちに 送る</div><select id="itnRoom"><option value="">（送り先をえらぶ）</option>' + rooms.map((r) => '<option value="' + itnE(r.id) + '"' + (r.id === cur ? " selected" : "") + '>' + itnE(roomTitle(r)) + '</option>').join("") + '</select>' +
        '<div class="itn-tools"><button type="button" class="button-secondary" data-t="itin:send" data-k="plan">📋 予定表カード</button><button type="button" class="button-secondary" data-t="itin:send" data-k="result">🏁 結果つきカード</button><button type="button" class="button-secondary" data-t="itin:send" data-k="status">📣 いまの様子（文字）</button></div>' +
        '<div class="itn-meta">受け取った友だちは、ボタン1つで 自分の行動予定表に 取り込めます。<b>結果つきカード</b>なら、あなたの実際の待ち時間が、友だちの「予想の待ち時間」になります。</div></div>';
}
/** すきま時間の提案：つぎの時刻つきの予定まで あきがあるとき、入りそうな予定を すすめる */
function itnGapHtml(plan){
    if(plan.date && plan.date !== itnToday()) return "";
    if(itnWorking(plan).length) return "";
    const now = itnNowMin(), todo = plan.items.filter((x) => x.st === "t");
    const timed = todo.filter((x) => itnMin(x.s) != null && itnMin(x.s) > now).sort((a, b) => itnMin(a.s) - itnMin(b.s));
    const anchor = timed[0]; if(!anchor) return "";
    const free = itnMin(anchor.s) - now - 3; if(free < 10) return "";
    const dur = (x) => { const s = itnMin(x.s), e = itnMin(x.e); return Math.max(s != null && e != null && e > s ? e - s : 0, (x.w || 0) + 10, 10); };
    const cands = todo.filter((x) => x !== anchor && dur(x) <= free && (itnMin(x.s) == null || itnMin(x.s) > itnMin(anchor.s) || itnMin(x.s) < now)).slice(0, 2);
    if(!cands.length) return "";
    return '<div class="itn-card itn-gap"><div class="itn-card-t">🧩 すきま時間</div><div class="itn-meta">「' + itnE(anchor.n) + '」（' + itnE(anchor.s) + '）まで あと <b>' + itnDur(free) + '</b>。いま ならこれが 入りそうです：</div>' +
        cands.map((x) => '<button type="button" class="itn-next" data-t="itin:focus" data-id="' + x.i + '"><span>' + itnCatOf(x.k)[1] + '</span><b>' + itnE(x.n) + '</b><small>約' + itnDur(dur(x)) + '</small></button>').join("") + '</div>';
}
/** バッジ（がんばりの しるし）と、待ち時間ランキング */
function itnBadgesHtml(plan){
    const its = plan.items, done = its.filter((x) => x.st === "x"), st = itnStats(plan), B = [];
    if(done.some((x) => x.w > 0 && x.aw != null && x.aw <= x.w - 10)) B.push(["⚡", "予想より 10分以上 早かった"]);
    if(done.some((x) => x.w > 0 && x.aw != null && Math.abs(x.aw - x.w) <= 2)) B.push(["🎯", "予想ぴったり"]);
    if(done.some((x) => x.aw != null && x.aw >= 30)) B.push(["🧘", "30分以上 待てた"]);
    if(its.filter((x) => x.nt).length >= 3) B.push(["📝", "メモを3つ以上"]);
    if(its.some((x) => x.r === 5)) B.push(["🌟", "★5をつけた"]);
    if(st.cmp >= 2 && st.expDone > st.actDone) B.push(["⏱", "待ち時間 合計が 予想より 短い"]);
    if(its.length >= 3 && done.length + st.skip === its.length) B.push(["🏁", "ぜんぶ おわった"]);
    const waits = done.filter((x) => x.aw != null).sort((a, b) => b.aw - a.aw);
    let h = "";
    if(B.length) h += '<div class="itn-card"><div class="itn-card-t">🏅 バッジ</div><div class="itn-badgerow">' + B.map((b) => '<span class="itn-badge"><i>' + b[0] + '</i>' + itnE(b[1]) + '</span>').join("") + '</div></div>';
    if(waits.length >= 2){
        const top = waits.slice(0, 3), low = waits.slice().reverse().slice(0, 3);
        h += '<div class="itn-card"><div class="itn-card-t">🏆 待ち時間ランキング</div><div class="itn-meta">長かった順</div>' + top.map((x, i) => '<div class="itn-rank"><b>' + (i + 1) + '</b><span>' + itnE(x.n) + '</span><em class="ng">' + x.aw + '分</em></div>').join("") + '<div class="itn-meta">短かった順</div>' + low.map((x, i) => '<div class="itn-rank"><b>' + (i + 1) + '</b><span>' + itnE(x.n) + '</span><em class="ok">' + x.aw + '分</em></div>').join("") + '</div>';
    }
    return h;
}

function openItin(){
    if(!Object.keys(itn.plans).length) itnLoad();
    const today = Object.keys(itn.plans).find((id) => itn.plans[id].date === itnToday());
    if(today && !itn.autoPicked && itn.active !== today){ itn.active = today; }
    itn.autoPicked = true;
    itn.sub = ""; itn.editId = ""; itn.confirm = ""; itn.scroll0 = true;
    openSheet('<div class="itn-root" id="itnRoot"></div>');
    itnRender();
    clearInterval(itn.live); itn.live = setInterval(itnLive, 1000);
    if(Date.now() - itn.pulledAt > 60000) itnCloudPull();
    itnWake(itn.prefs.wake);
    itnMoreOpen();
}
function initItin(){
    initItinMore();
    registerTool("itin", onItinAction);
    extraBubbles.itin = itnCardHtml;
    if(el.messages) el.messages.addEventListener("click", (e) => { const b = e.target.closest("[data-itn-card]"); if(b) runTool(() => itnImportCard(b.dataset.itnCard)); });
    itnLoad(); itnStartAlarm();
    setInterval(itnPill, 1000);
    setTimeout(itnCloudPull, 3000);
}
