"use strict";
// ===== 行動予定表：ファイルから取り込み（10種類）=====
// JSON／CSV／TSV／テキスト／Markdown／カレンダー(.ics)／Webページ(HTML)／Excel(.xlsx)／Word(.docx)／PDF（文字が入っているもの）
// ・すべて この端末の中で読みます（外のサービスには送りません）。
// ・Excelの複数シート・Wordの複数の表・カレンダーの日ごと・複数のファイルは、「まとまり」に分けます。
//   まとまりごとに 1つの予定表にできます（取り込む前に、入れるまとまり・名前・日付を選べます）。
// ・このアプリで書き出した JSON／Excel／Word／CSV／テキスト／Webページ／カレンダーは、記録（実際の待ち時間など）も そのまま読み直せます。
// ・PDF・画像で書き出したものは「画像」なので読み直せません（JSON・Excel・CSV などをお使いください）。

const ITN_IMP_TYPES = [
    ["json", "📦", "JSON", "バックアップ"],
    ["xlsx", "📗", "Excel", "シートごと"],
    ["docx", "📘", "Word", "表ごと"],
    ["csv", "📊", "CSV", "Excelの保存形式"],
    ["tsv", "🧾", "TSV", "タブ区切り"],
    ["txt", "📃", "テキスト", "いくつでも"],
    ["md", "📝", "Markdown", "表・リスト"],
    ["ics", "📅", "カレンダー", "日ごと"],
    ["html", "🌐", "Webページ", "表ごと"],
    ["pdf", "📄", "PDF", "文字が入ったもの"]
];
const ITN_IMP_ACCEPT = ".json,.csv,.tsv,.tab,.txt,.text,.md,.markdown,.ics,.ical,.html,.htm,.xlsx,.docx,.pdf";
const ITN_IMP_MAX_FILES = 20, ITN_IMP_MAX_GROUPS = 40, ITN_IMP_MAX_ROWS = 3000, ITN_IMP_MAX_COLS = 60;
const ITN_IMP_BYTES = {text: 1048576, zip: 5242880, pdf: 10485760};
const ITN_IMP_XML_MAX = 12 * 1048576;

function itnImpFail(msg){ const e = new Error(msg); e.itnImp = true; return e; }
const itnImpErrText = (e) => e && e.itnImp ? e.message : "読み取れませんでした（壊れているか、特殊な形式です）。";
const itnImpBase = (name) => String(name || "").replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
const itnImpExt = (name) => { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };
const itnImpDateOf = (y, m, d) => y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
const itnImpFindDate = (s) => { const m = /(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/.exec(String(s || "")); return m && Number(m[2]) <= 12 && Number(m[3]) <= 31 ? itnImpDateOf(m[1], m[2], m[3]) : ""; };

// ---------- 文字コード ----------
function itnImpDecode(u8){
    const n = u8.length;
    if(n >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder("utf-8").decode(u8.subarray(3));
    if(n >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder("utf-16le").decode(u8.subarray(2));
    if(n >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder("utf-16be").decode(u8.subarray(2));
    try{ return new TextDecoder("utf-8", {fatal: true}).decode(u8); }catch(_e){}
    if(u8.indexOf(0x1B) >= 0){ try{ return new TextDecoder("iso-2022-jp", {fatal: true}).decode(u8); }catch(_e){} }
    for(const enc of ["shift_jis", "euc-jp"]){ try{ return new TextDecoder(enc, {fatal: true}).decode(u8); }catch(_e){} }
    return new TextDecoder("shift_jis").decode(u8);
}

// ---------- 表の行（CSV・TSV）----------
function itnImpCsvRows(text, delim){
    const rows = []; let row = [], cur = "", q = false;
    for(let i = 0; i < text.length; i++){
        const ch = text[i];
        if(q){ if(ch === '"'){ if(text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; continue; }
        if(ch === '"' && cur === ""){ q = true; continue; }
        if(ch === delim){ row.push(cur); cur = ""; continue; }
        if(ch === "\n" || ch === "\r"){ if(ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; if(rows.length > ITN_IMP_MAX_ROWS + 50) break; continue; }
        cur += ch;
    }
    if(cur !== "" || row.length){ row.push(cur); rows.push(row); }
    return rows;
}
function itnImpDelim(text){
    const head = text.split(/\r?\n/).slice(0, 8).join("\n"), cnt = (c) => head.split(c).length - 1;
    const t = cnt("\t"), c = cnt(","), s = cnt(";");
    return t >= c && t >= s && t > 0 ? "\t" : s > c ? ";" : ",";
}
/** セルをそろえる：前後の空白を取り、CSVの「=」よけの ' を外し、空の行を捨てる */
function itnImpCleanRows(rows){
    const out = [];
    for(const r of rows){
        const cells = r.slice(0, ITN_IMP_MAX_COLS).map((c) => { let s = String(c == null ? "" : c).replace(/ /g, " ").trim(); if(/^'[=+@-]/.test(s)) s = s.slice(1); return s.slice(0, 300); });
        if(cells.some((c) => c !== "")) out.push(cells);
        if(out.length >= ITN_IMP_MAX_ROWS) break;
    }
    return out;
}

// ---------- 見出し（列の名前）から 中身を決める ----------
const ITN_IMP_HEAD = [
    ["nt", /^(ひとことメモ|実際のメモ|感想)$/],
    ["asae", /^実際の?時刻$/],
    ["as", /^実際の?(開始|はじまり)(時刻|時間)?$/],
    ["ae", /^実際の?(終了|終わり|おわり)(時刻|時間)?$/],
    ["aw", /^(実際の?待ち(時間)?(\(分\))?|実待ち|実績待ち|実際)$/],
    ["w", /^(予想待ち|予想の待ち|予想待ち時間|予想待ち(\(分\))?|待ち|待ち時間|待ち(\(分\))?|待ち予想|予想|待ち時間(\(分\))?|wait|waittime)$/i],
    ["s", /^(開始|開始時刻|開始時間|開始(\(予定\))?|予定開始|時刻|時間|予定時刻|予定の時刻|出発|出発時刻|はじまり|start|starttime|from|time)$/i],
    ["e", /^(終了|終了時刻|終了時間|終了(\(予定\))?|予定終了|到着|到着時刻|終わり|おわり|end|endtime|to)$/i],
    ["c", /^(費用(\(円\))?|金額|料金|値段|価格|代金|予算|円|cost|price|fee|amount)$/i],
    ["m", /^(備考|備考・メモ|メモ|メモ欄|コメント|詳細|説明|note|notes|memo|remarks|comment|description)$/i],
    ["st", /^(状態|ステータス|進捗|status|state)$/i],
    ["k", /^(種類|カテゴリ|カテゴリー|分類|区分|category|type)$/i],
    ["r", /^(★|評価|星|rating)$/i],
    ["n", /^(内容|名前|名称|項目|予定|タイトル|件名|行き先|行先|スポット|やること|アトラクション|施設|活動|行動|イベント|name|title|summary|event|subject|task)$/i],
    ["loc", /^(場所|スポット名|location|place)$/i]
];
const itnImpHeadKey = (cell) => {
    const t = String(cell || "").replace(/[\s　]+/g, "").replace(/（/g, "(").replace(/）/g, ")");
    if(!t) return "";
    for(const h of ITN_IMP_HEAD) if(h[1].test(t)) return h[0];
    return "";
};
/** 最初の数行から 見出しの行を探す。「内容」の列と、あと1つ以上の列が見つかったら 見出しとみなす */
function itnImpFindHeader(rows){
    for(let ri = 0; ri < Math.min(10, rows.length); ri++){
        const map = {}, used = {}; let count = 0;
        rows[ri].forEach((cell, ci) => {
            let key = itnImpHeadKey(cell);
            if(!key) return;
            if(used[key] && key === "s") key = "e";
            if(used[key]) return;
            used[key] = true; map[ci] = key; count++;
        });
        if(!used.n && used.loc){ Object.keys(map).forEach((ci) => { if(map[ci] === "loc") map[ci] = "n"; }); used.n = true; delete used.loc; }
        if(used.n && count >= 2) return {ri, map};
    }
    return null;
}
const ITN_IMP_STMAP = [[/^(完了|済み?|終了済|done|✔|✓|○済)$/i, "x"], [/^(スキップ|skip|－|ー|飛ばし)$/i, "s"]];
function itnImpWaitCell(v){
    v = itnNum(v);
    const r = {w: null, aw: null}, mp = /予想\s*約?\s*(\d{1,4})/.exec(v), ma = /実際\s*約?\s*(\d{1,4})/.exec(v);
    if(mp) r.w = Number(mp[1]);
    if(ma) r.aw = Number(ma[1]);
    if(mp || ma) return r;
    let m = ITN_RE_HOUR.exec(v);
    if(m){ r.w = Number(m[1]) * 60 + Number(m[2] || 0); return r; }
    m = ITN_RE_WAIT.exec(v);
    if(m){ r.w = Number(m[1]); return r; }
    m = /^(\d{1,4})(?:\.\d+)?$/.exec(v);
    if(m) r.w = Number(m[1]);
    return r;
}
function itnImpCatKey(v){
    const t = String(v || "").trim();
    for(const c of ITN_CATS){ if(t === c[0] || t === c[2] || t.indexOf(c[1].replace(/️/g, "")) === 0) return c[0]; }
    return "";
}
/** 「🎯 アトラクション」のように 先頭に種類の絵文字が付いていたら、外して種類を返す */
function itnImpStripCat(name){
    const s = String(name || "");
    for(const c of ITN_CATS){
        const e = c[1].replace(/️/g, "");
        if(s.replace(/️/g, "").indexOf(e) === 0){ const rest = s.replace(/️/g, "").slice(e.length).replace(/^[\s　]+/, ""); return {k: c[0], n: rest}; }
    }
    return {k: "", n: s};
}
/** 備考の欄に「備考 ／ メモ：… ／ ★3」「📝 メモ」「★★★」のように 入っているとき、分けて取り出す */
function itnImpMemoCell(v){
    const segs = String(v || "").split(/\n| ／ /).map((x) => x.trim()).filter(Boolean), out = {m: [], nt: "", r: 0};
    const isNt = (x) => /^(?:📝\s*|メモ[：:]\s*)/.test(x), isR = (x) => /^★+$/.test(x) || /^★\d$/.test(x);
    if(!segs.some((x) => isNt(x) || isR(x))){ out.m.push(String(v || "").replace(/\s*\n\s*/g, " ")); return out; }
    segs.forEach((x) => {
        if(isNt(x)) out.nt = x.replace(/^(?:📝\s*|メモ[：:]\s*)/, "");
        else if(isR(x)) out.r = /^★\d$/.test(x) ? Number(x[1]) : x.length;
        else out.m.push(x);
    });
    return out;
}
function itnImpRowItem(cells, map){
    const it = {n: "", s: "", e: "", w: null, c: null, m: "", k: "", st: "t", aw: null, as: "", ae: "", nt: "", r: 0};
    const memos = [], locs = []; let any = false;
    Object.keys(map).forEach((ci) => {
        const key = map[ci], v = String(cells[ci] == null ? "" : cells[ci]).trim();
        if(v === "") return;
        any = true;
        const tm = (s) => itnTimesIn(itnNum(s));
        if(key === "n"){ const sc = itnImpStripCat(v); it.n = sc.n; if(sc.k) it.k = sc.k; }
        else if(key === "loc") locs.push(v);
        else if(key === "s"){ const parts = v.split(/実際/), t = tm(parts[0]); if(t[0]) it.s = t[0]; if(t[1] && !it.e) it.e = t[1]; if(parts[1]){ const a = tm(parts[1]); if(a[0]) it.as = a[0]; if(a[1]) it.ae = a[1]; } }
        else if(key === "e"){ const t = tm(v); if(t[0]) it.e = t[0]; }
        else if(key === "asae"){ const t = tm(v); if(t[0]) it.as = t[0]; if(t[1]) it.ae = t[1]; }
        else if(key === "as"){ const t = tm(v); if(t[0]) it.as = t[0]; }
        else if(key === "ae"){ const t = tm(v); if(t[0]) it.ae = t[0]; }
        else if(key === "w"){ const x = itnImpWaitCell(v); if(x.w != null) it.w = x.w; if(x.aw != null) it.aw = x.aw; }
        else if(key === "aw"){ const x = itnImpWaitCell(v); const val = x.aw != null ? x.aw : x.w; if(val != null) it.aw = val; }
        else if(key === "c"){ if(/無料|ただ|free/i.test(v)) it.c = 0; else { const d = itnNum(v).replace(/[^\d.]/g, ""); if(d !== "" && Number.isFinite(Number(d))) it.c = Math.round(Number(d)); } }
        else if(key === "st"){ const f = ITN_IMP_STMAP.find((x) => x[0].test(v)); it.st = f ? f[1] : "t"; }
        else if(key === "k"){ const k = itnImpCatKey(v); if(k) it.k = k; }
        else if(key === "r"){ const n = (v.match(/★/g) || []).length || Number(itnNum(v)); if(Number.isFinite(n) && n >= 0 && n <= 5) it.r = Math.round(n); }
        else if(key === "nt") it.nt = v;
        else if(key === "m"){ const x = itnImpMemoCell(v); memos.push(...x.m); if(x.nt) it.nt = x.nt; if(x.r) it.r = x.r; }
    });
    if(it.w == null && it.n){ const em = ITN_RE_EMBED.exec(it.n); if(em){ it.w = Number(em[1] || em[2]); it.n = it.n.replace(ITN_RE_EMBED, "").replace(/\s+/g, " ").trim(); } }   // 「アトラクションA 待ち35分」の 待ち時間を取り出す
    locs.forEach((l) => memos.unshift("場所：" + l));
    it.m = memos.filter(Boolean).join(" / ");
    if(it.aw != null || it.as || it.ae || it.nt || it.r) { /* 実績あり */ }
    return any ? it : null;
}
const itnImpFinishItem = (it) => { if(!it.k) it.k = itnGuessKind(it.n, it.w > 0); if(it.st !== "x" && it.st !== "s") it.st = "t"; delete it.i; return it; };
/** 表の行（見出しつき）→ 予定。見出しが見つからない／1件も取れないときは null */
function itnImpItemsFromRows(rows, rest){
    const hd = itnImpFindHeader(rows);
    if(!hd) return null;
    const res = {items: [], skipped: 0, date: "", title: ""};
    for(let i = 0; i < hd.ri; i++){ const line = rows[i].join(" "); if(!res.date) res.date = itnImpFindDate(line); }
    for(let i = hd.ri + 1; i < rows.length; i++){
        const it = itnImpRowItem(rows[i], hd.map);
        if(!it || !it.n){ if(rest && rows[i].some((c) => c !== "")) rest.push(rows[i].filter((c) => c !== "").join("\t")); }
        if(!it) continue;
        if(!it.n){ if(!res.date) res.date = itnImpFindDate(rows[i].join(" ")); res.skipped++; continue; }
        if(res.items.length >= ITN_MAX_ITEMS){ res.skipped++; continue; }
        res.items.push(itnImpFinishItem(it));
    }
    return res.items.length ? res : null;
}

// ---------- テキスト（このアプリで書き出した形／ふつうのメモ）----------
function itnImpOwnTxt(text){
    const lines = text.replace(/\r/g, "").split("\n"), groups = []; let g = null, it = null;
    const emoji = ITN_CATS.map((c) => [c[0], c[1].replace(/️/g, "")]);
    const mk = {"□": "t", "⏳": "t", "▶": "t", "✔": "x", "－": "s"};
    lines.forEach((raw) => {
        const hd = /^■\s*行動予定表「(.*)」\s*(.*)$/.exec(raw);
        if(hd){ g = {title: hd[1].slice(0, 40), date: itnImpFindDate(hd[2]), items: [], skipped: 0}; groups.push(g); it = null; return; }
        if(!g) return;
        const m = /^(□|⏳|▶|✔|－)\s+(--:--|\d{1,2}:\d{2})(?:[–\-](\d{1,2}:\d{2}))?\s+(.*)$/.exec(raw);
        if(m){
            let name = m[4].replace(/️/g, ""), k = "";
            for(const e of emoji){ if(name.indexOf(e[1]) === 0){ k = e[0]; name = name.slice(e[1].length); break; } }
            name = name.trim(); if(name === "（名前なし）") name = "";
            it = {n: name, s: m[2] === "--:--" ? "" : m[2], e: m[3] || "", w: null, c: null, m: "", k, st: mk[m[1]] || "t", aw: null, as: "", ae: "", nt: "", r: 0};
            if(g.items.length >= ITN_MAX_ITEMS) g.skipped++; else g.items.push(it);
            return;
        }
        if(!it || !/^\s{2,}\S/.test(raw)) return;
        const body = raw.trim();
        let mm;
        if((mm = /^備考：(.*)$/.exec(body))){ it.m = mm[1]; return; }
        if((mm = /^メモ：(.*)$/.exec(body))){ it.nt = mm[1]; return; }
        body.split(" ／ ").forEach((seg) => {
            seg = seg.trim();
            if(/^待ち/.test(seg)){ const x = itnImpWaitCell(seg.replace(/^待ち\s*/, "").replace(/\s*→\s*/, " ")); if(x.w != null) it.w = x.w; if(x.aw != null) it.aw = x.aw; }
            else if(/^実際\s/.test(seg)){ const t = itnTimesIn(itnNum(seg)); if(t[0]) it.as = t[0]; if(t[1]) it.ae = t[1]; }
            else if(/^[¥￥]/.test(seg)){ const d = seg.replace(/[^\d]/g, ""); if(d) it.c = Number(d); }
            else if(/^★+$/.test(seg)) it.r = seg.length;
        });
    });
    const out = groups.filter((x) => x.items.length);
    out.forEach((x) => x.items.forEach(itnImpFinishItem));
    return out.length ? out : null;
}
/** 見出しで区切られた いくつかのまとまり（【1日目】… 【2日目】…）に分ける */
function itnImpSections(text){
    const lines = String(text || "").replace(/\r/g, "").split("\n"), marks = [];
    lines.forEach((l, i) => { const t = itnNum(l.trim()); if(/^[【■●◆▼#＃]/.test(t) && itnTimesIn(t).length === 0 && !/[\t]/.test(t) && t.length <= 60) marks.push(i); });
    if(marks.length < 2) return null;
    const out = [];
    marks.forEach((start, k) => {
        const end = k + 1 < marks.length ? marks[k + 1] : lines.length, chunk = lines.slice(start, end).join("\n");
        const r = itnParse(chunk);
        if(r.items.length) out.push({title: r.title || "", date: r.date || "", items: r.items.map((x) => itnImpFinishItem(Object.assign({st: "t"}, x))), skipped: r.skipped});
    });
    return out.length >= 2 ? out : null;
}
/** 見出し行（開始・内容…）が 2つ以上ある文字の表 → 表ごとに まとまりにする（PDF・Word・メモ・Markdown など） */
function itnImpSplitTables(rows, raws){
    const heads = [];
    rows.forEach((r, i) => { if(r.length >= 2 && itnImpFindHeader([r])) heads.push(i); });
    if(heads.length < 2) return null;
    const isTitle = (i) => { if(i < 0 || heads.indexOf(i) >= 0) return false; const line = (raws ? raws[i] : rows[i].join(" ")).trim(); return line.length > 0 && line.length <= 50 && line.indexOf("\t") < 0 && rows[i].filter((c) => String(c).trim()).length >= 1 && itnTimesIn(line).length === 0 && !/[|｜]/.test(line); };
    const out = [];
    heads.forEach((h, k) => {
        const next = k + 1 < heads.length ? heads[k + 1] : rows.length;
        const nextTitle = k + 1 < heads.length && isTitle(next - 1) && next - 1 > h;
        const seg = rows.slice(h, nextTitle ? next - 1 : next);
        const r = itnImpItemsFromRows(seg);
        if(!r) return;
        const title = isTitle(h - 1) ? (raws ? raws[h - 1] : rows[h - 1].join(" ")).trim().replace(/^[【■●◆▼#＃\s]+|[】\s]+$/g, "") : "";
        r.title = title.slice(0, 40);
        if(!r.date && title) r.date = itnImpFindDate(title);
        out.push(r);
    });
    return out.length >= 2 ? out : (out.length === 1 ? out : null);
}
/** 文字のかたまり（テキスト・メモ・PDFから取った文字など）→ まとまり */
function itnImpFromText(text, base){
    text = String(text || "").replace(/﻿/g, "");
    const own = itnImpOwnTxt(text);
    if(own) return own;
    const rows = [], raws = [];
    text.replace(/\r/g, "").split("\n").forEach((l) => {
        if(!l.trim() || rows.length >= ITN_IMP_MAX_ROWS) return;
        const t = itnNum(l);   // タブがある行は、空のマスもそのまま残す（列がずれないように）
        const row = t.indexOf("\t") >= 0 ? t.split("\t") : itnSplitLine(t.trim());
        const cr = itnImpCleanRows([row]);
        if(cr.length){ rows.push(cr[0]); raws.push(l); }
    });
    const multi = itnImpSplitTables(rows, raws);
    if(multi) return multi;
    const rest = [], byHead = itnImpItemsFromRows(rows, rest);
    if(byHead){
        // 表のあとに「1行ずつ」書いた予定が続く貼りつけ（表＋縦書き）も、取りこぼさない
        if(rest.length >= 3){
            const r = itnParse(rest.join("\n"));
            if(r.items.length >= 2) r.items.forEach((x) => { if(byHead.items.length < ITN_MAX_ITEMS) byHead.items.push(itnImpFinishItem(Object.assign({st: "t"}, x))); else byHead.skipped++; });
        }
        return [byHead];
    }
    const secs = itnImpSections(text);
    if(secs) return secs;
    const r = itnParse(text);
    return [{title: r.title, date: r.date, items: r.items.map((x) => itnImpFinishItem(Object.assign({st: "t"}, x))), skipped: r.skipped}];
}

// ---------- JSON ----------
function itnImpJsonGroup(p, name){
    if(!p || typeof p !== "object") return null;
    let items = [];
    if(Array.isArray(p.items)) items = p.items;
    else if(Array.isArray(p)) items = p;
    else return null;
    const out = [], head = items.length && typeof items[0] === "object" ? items[0] : null;
    const isOwn = head && typeof head.n === "string";
    items.slice(0, ITN_MAX_ITEMS).forEach((x) => {
        if(!x || typeof x !== "object") return;
        if(isOwn || typeof x.n === "string"){ out.push(itnImpFinishItem(itnCleanItem(Object.assign({}, x)))); return; }
        const keys = Object.keys(x), map = {}, cells = [], used = {};
        keys.forEach((k, ci) => { let key = itnImpHeadKey(k); if(!key) return; if(used[key] && key === "s") key = "e"; if(used[key]) return; used[key] = true; map[ci] = key; cells[ci] = x[k] == null ? "" : typeof x[k] === "object" ? "" : String(x[k]); });
        if(!used.n && used.loc) Object.keys(map).forEach((ci) => { if(map[ci] === "loc") map[ci] = "n"; });
        const it = itnImpRowItem(cells, map);
        if(it && it.n) out.push(itnImpFinishItem(it));
    });
    return {title: String(p.title || name || "").slice(0, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : "", items: out, skipped: Math.max(0, items.length - out.length)};
}
function itnImpJson(text, name){
    let j;
    try{ j = JSON.parse(text); }catch(_e){ throw itnImpFail("JSONとして読めませんでした（書き方がまちがっているか、途中で切れています）。"); }
    const groups = [];
    const list = j && Array.isArray(j.plans) ? j.plans : j && j.plan ? [j.plan] : Array.isArray(j) && j.length && j.every((x) => x && typeof x === "object" && Array.isArray(x.items)) ? j : [j];
    list.forEach((p) => { const g = itnImpJsonGroup(p, name); if(g && g.items.length) groups.push(g); });
    return groups;
}

// ---------- カレンダー（.ics）----------
function itnImpIcsValue(s){ return String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }
function itnImpIcsTime(value){
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || "").trim());
    if(!m) return null;
    if(m[4] == null) return {date: itnImpDateOf(m[1], m[2], m[3]), time: "", allDay: true};
    if(m[7]){ const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0))); return {date: dayKey(d), time: itnHM(d.getHours() * 60 + d.getMinutes()), allDay: false}; }
    return {date: itnImpDateOf(m[1], m[2], m[3]), time: itnHM(Number(m[4]) * 60 + Number(m[5])), allDay: false};
}
function itnImpIcs(text, base){
    const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const events = []; let cur = null, depth = 0, calName = "", rrule = 0;
    lines.forEach((line) => {
        if(line === "BEGIN:VEVENT"){ cur = {}; depth = 0; return; }
        if(line === "END:VEVENT"){ if(cur) events.push(cur); cur = null; return; }
        if(/^BEGIN:/.test(line)){ if(cur) depth++; return; }
        if(/^END:/.test(line)){ if(cur && depth > 0) depth--; return; }
        const ix = line.indexOf(":"); if(ix < 1) return;
        const head = line.slice(0, ix), value = line.slice(ix + 1), prop = head.split(";")[0].toUpperCase();
        if(!cur){ if(prop === "X-WR-CALNAME" && !calName) calName = itnImpIcsValue(value).trim(); return; }
        if(depth > 0) return;
        if(prop === "SUMMARY" || prop === "DESCRIPTION" || prop === "LOCATION" || prop === "STATUS") cur[prop] = itnImpIcsValue(value);
        else if(prop === "DTSTART" || prop === "DTEND") cur[prop] = value;
        else if(prop === "RRULE") cur.RRULE = true;
    });
    const byDate = {};
    events.slice(0, 5000).forEach((ev) => {
        if(/CANCEL/i.test(ev.STATUS || "")) return;
        const st = itnImpIcsTime(ev.DTSTART); if(!st) return;
        if(ev.RRULE) rrule++;
        let e = "";
        const en = ev.DTEND ? itnImpIcsTime(ev.DTEND) : null;
        if(en && !en.allDay && !st.allDay && en.date === st.date && itnMin(en.time) > itnMin(st.time)) e = en.time;
        const sc = itnImpStripCat(String(ev.SUMMARY || "").replace(/\n/g, " ").trim());
        const it = {n: sc.n || "予定", s: st.time, e, w: null, c: null, m: "", k: sc.k, st: "t", aw: null, as: "", ae: "", nt: "", r: 0};
        const memos = [];
        String(ev.DESCRIPTION || "").split("\n").forEach((ln) => {
            ln = ln.trim(); if(!ln) return;
            let m;
            if((m = /^予想の待ち[：:]\s*(\d+)分/.exec(ln))) it.w = Number(m[1]);
            else if((m = /^実際の待ち[：:]\s*(\d+)分/.exec(ln))) it.aw = Number(m[1]);
            else if((m = /^費用[：:]\s*[¥￥]?\s*([\d,]+)/.exec(ln))) it.c = Number(m[1].replace(/,/g, ""));
            else if((m = /^メモ[：:]\s*(.*)$/.exec(ln))) it.nt = m[1];
            else memos.push(ln);
        });
        if(ev.LOCATION && ev.LOCATION.trim()) memos.unshift("場所：" + ev.LOCATION.trim().replace(/\n/g, " "));
        it.m = memos.join(" / ");
        (byDate[st.date] = byDate[st.date] || []).push(itnImpFinishItem(it));
    });
    const dates = Object.keys(byDate).sort(), multi = dates.length > 1, title = (calName || base || "カレンダー").slice(0, 40);
    return dates.map((d) => {
        const list = byDate[d].sort((a, b) => (itnMin(a.s) == null ? -1 : itnMin(a.s)) - (itnMin(b.s) == null ? -1 : itnMin(b.s)));
        return {title: multi ? (title.slice(0, 30) + " " + d.slice(5).replace("-", "/")).slice(0, 40) : title, date: d, items: list.slice(0, ITN_MAX_ITEMS), skipped: Math.max(0, list.length - ITN_MAX_ITEMS), note: rrule && d === dates[0] ? "くり返しの予定は、最初の1回だけ取り込みます。" : ""};
    });
}

// ---------- Markdown ----------
function itnImpMdClean(s){ return String(s || "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|~~|`)/g, "").replace(/^\s*[-*+]\s*\[[ xX]\]\s*/, "- ").replace(/<br\s*\/?>/gi, " "); }
function itnImpMd(text, base){
    const lines = text.replace(/\r/g, "").split("\n"), secs = []; let cur = {title: "", lines: []}; secs.push(cur);
    lines.forEach((l) => {
        const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
        if(h){ cur = {title: itnImpMdClean(h[1]).trim(), lines: []}; secs.push(cur); return; }
        cur.lines.push(l);
    });
    const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.indexOf("-") >= 0;
    const isRow = (l) => /^\s*\|/.test(l) || (l.split("|").length >= 3);
    const groups = [];
    secs.forEach((sec) => {
        const tables = [], rest = []; let t = null;
        sec.lines.forEach((l) => {
            if(isSep(l)) return;
            if(isRow(l)){ const cells = l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => itnImpMdClean(c).trim()); if(!t){ t = []; tables.push(t); } t.push(cells); return; }
            t = null; if(l.trim()) rest.push(itnImpMdClean(l));
        });
        let items = [], skipped = 0, date = "";
        tables.forEach((rows) => { const r = itnImpItemsFromRows(itnImpCleanRows(rows)); if(r){ items = items.concat(r.items); skipped += r.skipped; if(!date) date = r.date; } });
        if(rest.length){ const r = itnImpFromText(rest.join("\n"), base)[0]; if(r && r.items.length){ items = items.concat(r.items); skipped += r.skipped || 0; if(!date) date = r.date || ""; if(!sec.title && r.title) sec.title = r.title; } }
        if(items.length) groups.push({title: sec.title, date, items: items.slice(0, ITN_MAX_ITEMS), skipped});
    });
    return groups;
}

// ---------- Webページ（HTML）----------
function itnImpCellText(cell){
    const c = cell.cloneNode(true);
    c.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
    c.querySelectorAll("script,style").forEach((x) => x.remove());
    return c.textContent.replace(/[ \t 　]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}
function itnImpHtml(text, base){
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,template,noscript").forEach((x) => x.remove());
    const groups = []; let heading = "", n = 0;
    const docTitle = ((doc.querySelector("h1") || {}).textContent || (doc.querySelector("title") || {}).textContent || "").replace(/^[\s📋]+/, "").trim();
    doc.body.querySelectorAll("h1,h2,h3,h4,table").forEach((el) => {
        if(el.tagName !== "TABLE"){ heading = el.textContent.replace(/^[\s📋]+/, "").trim(); return; }
        if(el.querySelector("table")) return;
        const rows = itnImpCleanRows(Array.from(el.rows).map((tr) => Array.from(tr.cells).map(itnImpCellText)));
        const r = itnImpItemsFromRows(rows); n++;
        if(r){ const cap = el.querySelector("caption"); r.title = ((cap && cap.textContent.trim()) || heading || docTitle || "").slice(0, 40); groups.push(r); }
    });
    if(groups.length) return groups;
    const blocks = "p,div,li,tr,h1,h2,h3,h4,h5,h6,br,section,article,pre,dt,dd";
    doc.body.querySelectorAll(blocks).forEach((e) => e.insertAdjacentText("afterend", "\n"));
    doc.body.querySelectorAll("td,th").forEach((e) => e.insertAdjacentText("afterend", "\t"));
    return itnImpFromText(doc.body.textContent.replace(/\n\s*\n+/g, "\n"), base);
}

// ---------- Excel（.xlsx）・Word（.docx）の ZIP ----------
const itnImpEls = (node, local) => Array.from(node.getElementsByTagNameNS("*", local));
async function itnImpZipXml(dir, name, must){
    const e = dir.list.find((x) => x.name === name || x.name.toLowerCase() === name.toLowerCase());
    if(!e){ if(must) throw itnImpFail("このファイルの中身が見つかりません（" + name + "）。"); return null; }
    if(e.enc) throw itnImpFail("パスワードつきのファイルは読めません。パスワードを外して保存し直してください。");
    if(e.usize > ITN_IMP_XML_MAX) throw itnImpFail("中身が大きすぎて読めません。");
    const u8 = await zipExtractEntry(dir.buf, e);
    const xml = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(u8), "application/xml");
    if(xml.getElementsByTagName("parsererror").length) throw itnImpFail("このファイルの中身を読めませんでした。");
    return xml;
}
async function itnImpOpenZip(file){
    try{ return await zipReadDirectory(file); }
    catch(_e){ throw itnImpFail("ファイルを開けませんでした。パスワードつき・古い形式（.xls／.doc）・壊れたファイルは読めません。.xlsx／.docx で保存し直してください。"); }
}
const itnImpColIdx = (ref) => { const m = /^([A-Z]+)/.exec(ref || ""); if(!m) return -1; let n = 0; for(const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
function itnImpXlsxFmtKind(code, id){
    if([18, 19, 20, 21, 45, 46, 47].indexOf(id) >= 0) return "time";
    if([14, 15, 16, 17, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58].indexOf(id) >= 0) return "date";
    if(id === 22) return "datetime";
    if(!code) return "";
    const c = String(code).replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
    const hasT = /[hH]/.test(c) && /[mM:]/.test(c), hasD = /[yYdD]/.test(c) || /[eEgG]{1,2}/.test(c) && /[mM]/.test(c);
    return hasT && hasD ? "datetime" : hasT ? "time" : hasD ? "date" : "";
}
function itnImpXlsxNum(n, kind, d1904){
    if(kind === "time"){ const f = n - Math.floor(n), m = Math.round(f * 1440) % 1440; return itnHM(m); }
    if(kind === "date" || kind === "datetime"){
        const base = d1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30), d = new Date(base + Math.floor(n) * 86400000);
        const ds = itnImpDateOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        if(kind === "datetime"){ const m = Math.round((n - Math.floor(n)) * 1440) % 1440; return ds + " " + itnHM(m); }
        return ds;
    }
    return Number.isInteger(n) ? String(n) : String(+n.toFixed(6));
}
async function itnImpXlsx(file, base){
    const dir = await itnImpOpenZip(file);
    const wb = await itnImpZipXml(dir, "xl/workbook.xml", true);
    const relsXml = await itnImpZipXml(dir, "xl/_rels/workbook.xml.rels", false);
    const rel = {}; if(relsXml) itnImpEls(relsXml, "Relationship").forEach((r) => { rel[r.getAttribute("Id")] = r.getAttribute("Target"); });
    const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const d1904 = itnImpEls(wb, "workbookPr").some((x) => x.getAttribute("date1904") === "1" || x.getAttribute("date1904") === "true");
    const sheets = itnImpEls(wb, "sheet").map((s, i) => {
        const rid = s.getAttributeNS(RNS, "id") || s.getAttribute("r:id"); let tg = rel[rid] || ("worksheets/sheet" + (i + 1) + ".xml");
        tg = tg.charAt(0) === "/" ? tg.slice(1) : "xl/" + tg.replace(/^\.\//, "");
        return {name: s.getAttribute("name") || ("シート" + (i + 1)), path: tg, hidden: /hidden/i.test(s.getAttribute("state") || "")};
    }).filter((s) => !s.hidden);
    if(!sheets.length) throw itnImpFail("シートが見つかりませんでした。");
    // 文字（共有文字列）。ふりがな（rPh）は 読み込まない
    const sst = await itnImpZipXml(dir, "xl/sharedStrings.xml", false), strings = [];
    if(sst) itnImpEls(sst, "si").forEach((si) => {
        let t = ""; Array.from(si.children).forEach((c) => { if(c.localName === "t") t += c.textContent; else if(c.localName === "r") itnImpEls(c, "t").forEach((x) => { t += x.textContent; }); });
        strings.push(t);
    });
    // 書式（時刻・日付かどうか）
    const sty = await itnImpZipXml(dir, "xl/styles.xml", false), numFmts = {}, xfKind = [];
    if(sty){
        itnImpEls(sty, "numFmt").forEach((f) => { numFmts[f.getAttribute("numFmtId")] = f.getAttribute("formatCode"); });
        const xfs = itnImpEls(sty, "cellXfs")[0];
        if(xfs) Array.from(xfs.children).forEach((x) => { const id = Number(x.getAttribute("numFmtId") || 0); xfKind.push(itnImpXlsxFmtKind(numFmts[id], id)); });
    }
    const all = [];
    for(const sh of sheets.slice(0, 30)){
        const xml = await itnImpZipXml(dir, sh.path, false); if(!xml) continue;
        const rows = [];
        itnImpEls(xml, "row").slice(0, ITN_IMP_MAX_ROWS + 20).forEach((row) => {
            const cells = []; let seq = 0;
            Array.from(row.children).forEach((c) => {
                if(c.localName !== "c") return;
                const ref = c.getAttribute("r"); let ci = ref ? itnImpColIdx(ref) : seq; if(ci < 0) ci = seq; seq = ci + 1;
                if(ci >= ITN_IMP_MAX_COLS) return;
                const t = c.getAttribute("t"), v = c.getElementsByTagNameNS("*", "v")[0], kind = xfKind[Number(c.getAttribute("s") || 0)] || "";
                let val = "";
                if(t === "s") val = strings[Number(v ? v.textContent : -1)] || "";
                else if(t === "inlineStr"){ const is = c.getElementsByTagNameNS("*", "is")[0]; if(is) itnImpEls(is, "t").forEach((x) => { if(!(x.parentNode && x.parentNode.localName === "rPh")) val += x.textContent; }); }
                else if(t === "str") val = v ? v.textContent : "";
                else if(t === "b") val = v && v.textContent === "1" ? "TRUE" : "FALSE";
                else if(t === "e") val = "";
                else if(v && v.textContent !== ""){ const n = Number(v.textContent); val = Number.isFinite(n) ? itnImpXlsxNum(n, kind, d1904) : v.textContent; }
                cells[ci] = val;
            });
            const full = []; for(let i = 0; i < cells.length; i++) full.push(cells[i] == null ? "" : cells[i]);
            rows.push(full);
        });
        all.push({name: sh.name, rows: itnImpCleanRows(rows)});
    }
    // このアプリが書き出した Excel の「まとまり」のシート（予定表の名前・日付）
    let meta = null;
    all.forEach((s) => { if(s.rows.length && s.rows[0][0] === "予定表" && s.rows.some((r) => r[0] === "日付")){ meta = {title: s.rows[0][1] || "", date: itnImpFindDate((s.rows.find((r) => r[0] === "日付") || [])[1])}; s.skip = true; } });
    const groups = [];
    all.forEach((s) => { if(s.skip) return; const r = itnImpItemsFromRows(s.rows); if(r){ r.title = s.name; r.sheet = true; groups.push(r); } });
    let note = "";
    if(!groups.length){
        all.forEach((s) => { if(s.skip || !s.rows.length) return; const g = itnImpFromText(s.rows.map((r) => r.join("\t")).join("\n"), base)[0]; if(g && g.items.length){ g.title = s.name; g.sheet = true; groups.push(g); } });
    }
    if(meta && groups.length === 1 && /^行動予定表$/.test(groups[0].title)){ groups[0].title = meta.title || groups[0].title; if(meta.date) groups[0].date = meta.date; }
    if(all.filter((s) => !s.skip && s.rows.length).length > groups.length && groups.length) note = "予定が見つからなかったシートは とばしました。";
    return {groups, note, sheets: all.filter((s) => !s.skip).length};
}
function itnImpWordText(node){
    let t = "";
    (function walk(n){
        Array.from(n.childNodes).forEach((c) => {
            if(c.nodeType !== 1) return;
            const ln = c.localName;
            if(ln === "del" || ln === "instrText" || ln === "delText") return;
            if(ln === "t") t += c.textContent;
            else if(ln === "tab") t += "\t";
            else if(ln === "br" || ln === "cr") t += " ";
            else walk(c);
        });
    })(node);
    return t;
}
async function itnImpDocx(file, base){
    const dir = await itnImpOpenZip(file);
    const xml = await itnImpZipXml(dir, "word/document.xml", true);
    const body = itnImpEls(xml, "body")[0]; if(!body) throw itnImpFail("文書の中身が見つかりませんでした。");
    const blocks = [];
    (function walk(n){
        Array.from(n.children).forEach((c) => {
            const ln = c.localName;
            if(ln === "p") blocks.push({t: "p", text: itnImpWordText(c).replace(/\s+/g, " ").trim()});
            else if(ln === "tbl"){
                const rows = Array.from(c.children).filter((x) => x.localName === "tr").map((tr) => Array.from(tr.children).filter((x) => x.localName === "tc").map((tc) => itnImpEls(tc, "p").map((p) => itnImpWordText(p).trim()).filter(Boolean).join(" ")));
                blocks.push({t: "tbl", rows: itnImpCleanRows(rows)});
            }else if(ln === "sdt" || ln === "sdtContent" || ln === "ins") walk(c);
        });
    })(body);
    const groups = []; let last = "", n = 0;
    blocks.forEach((b) => {
        if(b.t === "p"){ if(b.text) last = b.text; return; }
        n++;
        const r = itnImpItemsFromRows(b.rows);
        if(r){ const m = /行動予定表「(.*)」/.exec(last); r.title = (m ? m[1] : last.length <= 40 ? last : "").trim(); if(m && !r.date){ const d = blocks.find((x) => x.t === "p" && itnImpFindDate(x.text)); if(d) r.date = itnImpFindDate(d.text); } groups.push(r); }
    });
    if(groups.length) return {groups, note: n > groups.length ? "予定の表ではない表は とばしました。" : ""};
    const text = blocks.map((b) => b.t === "p" ? b.text : b.rows.map((r) => r.join("\t")).join("\n")).filter(Boolean).join("\n");
    return {groups: itnImpFromText(text, base), note: "", text};
}

// ---------- PDF（文字が入っているもの）----------
let itnImpPdfLoad = null;
function itnImpLoadPdfJs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if(itnImpPdfLoad) return itnImpPdfLoad;
    itnImpPdfLoad = new Promise((res, rej) => {
        const sc = document.createElement("script"); sc.src = "./vendor/lazy/pdf.min.js";
        sc.onload = () => { if(window.pdfjsLib){ window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/lazy/pdf.worker.min.js"; res(window.pdfjsLib); } else rej(new Error("pdfjs")); };
        sc.onerror = () => rej(new Error("pdfjs")); document.head.appendChild(sc);
    }).catch((e) => { itnImpPdfLoad = null; throw e; });
    return itnImpPdfLoad;
}
async function itnImpPdfText(file){
    const bytes = new Uint8Array(await file.arrayBuffer());
    if(String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 5))) !== "%PDF-") throw itnImpFail("PDFとして読めませんでした。");
    let lib; try{ lib = await itnImpLoadPdfJs(); }catch(_e){ throw itnImpFail("PDFを読む部品を読み込めませんでした。通信を確かめて、もう一度お試しください。"); }
    let doc;
    try{ doc = await lib.getDocument({data: bytes, isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true, cMapUrl: "./vendor/lazy/cmaps/", cMapPacked: true, useSystemFonts: true}).promise; }
    catch(e){ if(e && e.name === "PasswordException") throw itnImpFail("パスワードつきのPDFは読めません。パスワードを外して保存し直してください。"); throw itnImpFail("PDFを読めませんでした（壊れているか、特殊な形式です）。"); }
    const out = []; let chars = 0;
    for(let p = 1; p <= Math.min(doc.numPages, 30); p++){
        const page = await doc.getPage(p), tc = await page.getTextContent();
        const items = tc.items.filter((i) => typeof i.str === "string" && i.transform && i.str !== "").map((i) => ({s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.height || i.transform[3] || 10)}));
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = []; let line = null;
        items.forEach((it) => {
            if(line && Math.abs(it.y - line.y) <= Math.max(2, line.h * 0.45)) line.items.push(it);
            else { line = {y: it.y, h: it.h, items: [it]}; lines.push(line); }
        });
        let cols = null;   // 直前の「見出し行」の列の位置（空のマスがあっても、列がずれないようにする）
        lines.forEach((l) => {
            l.items.sort((a, b) => a.x - b.x);
            const wide = Math.max(7, l.h * 0.8), cells = []; let cur = null, end = null;
            const brk = () => { if(cur && cur.t.trim()) cells.push({t: cur.t.replace(/\s+$/, ""), x: cur.x}); cur = null; };
            l.items.forEach((it) => {
                if(!it.s.trim()){   // PDFの部品が、すき間を「空白」として入れてくる。広い空白は 列の区切りにする
                    if(cur){ if(it.w > wide) brk(); else if(!/ $/.test(cur.t)) cur.t += " "; }
                    end = it.x + it.w; return;
                }
                if(cur && end != null){ const gap = it.x - end; if(gap > wide) brk(); else if(gap > 1.2 && /[A-Za-z0-9]$/.test(cur.t) && /^[A-Za-z0-9]/.test(it.s)) cur.t += " "; }
                if(!cur) cur = {t: "", x: it.x};
                cur.t += it.s; end = it.x + it.w;
            });
            brk();
            if(!cells.length) return;
            let row = cells.map((c) => c.t);
            if(cells.length >= 2 && itnImpFindHeader([row])) cols = cells.map((c) => c.x);
            else if(cols && cells.length === 1 && itnTimesIn(cells[0].t).length === 0) cols = null;
            else if(cols && cells.length < cols.length){
                const placed = new Array(cols.length).fill(""); let last = -1;
                cells.forEach((c) => {
                    let best = 0, bd = 1e9;
                    cols.forEach((x, i) => { const d = Math.abs(c.x - x); if(d < bd){ bd = d; best = i; } });
                    if(best <= last) best = last + 1;
                    if(best >= cols.length){ best = cols.length - 1; placed[best] = (placed[best] ? placed[best] + " " : "") + c.t; }
                    else placed[best] = c.t;
                    last = best;
                });
                row = placed;
            }
            const line = row.join("\t").replace(/[ \t]+$/, "");
            if(line.trim()){ out.push(line); chars += line.length; }
        });
        if(chars > 60000) break;
    }
    try{ doc.destroy(); }catch(_e){}
    return {text: out.join("\n").slice(0, 80000), pages: doc.numPages};
}

// ---------- 1つのファイル → まとまり ----------
/** @returns {{kind:string, groups:Array, text:string, note:string}} */
async function itnImpReadOne(file){
    const ext = itnImpExt(file.name), base = itnImpBase(file.name);
    if(ext === "xls" || ext === "doc" || ext === "ppt" || ext === "pptx" || ext === "odt" || ext === "ods" || ext === "numbers" || ext === "pages") throw itnImpFail("この形式（." + ext + "）は読めません。Excelは .xlsx、Wordは .docx で保存し直してください。");
    if(!file.size) throw itnImpFail("中身が空のファイルです。");
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const isZip = head[0] === 0x50 && head[1] === 0x4B, isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    const isOle = head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0;
    let kind = ext === "xlsx" || ext === "docx" || ext === "pdf" ? ext : "";
    if(!kind){
        if(isPdf) kind = "pdf";
        else if(isZip){ const dir = await itnImpOpenZip(file); kind = dir.list.some((e) => e.name === "xl/workbook.xml") ? "xlsx" : dir.list.some((e) => e.name === "word/document.xml") ? "docx" : "zip"; }
        else if(isOle) kind = "ole";
    }
    if(kind === "ole") throw itnImpFail("古い形式かパスワードつきのファイルです。.xlsx／.docx で、パスワードなしで保存し直してください。");
    if(kind === "zip") throw itnImpFail("ZIPファイルは読めません（中のExcel・Wordを取り出してから選んでください）。");
    if(kind === "xlsx" || kind === "docx"){
        if(!isZip) throw itnImpFail(isOle ? "古い形式かパスワードつきのファイルです。.xlsx／.docx で、パスワードなしで保存し直してください。" : "Excel／Wordのファイルとして読めませんでした。");
        if(file.size > ITN_IMP_BYTES.zip) throw itnImpFail("ファイルが大きすぎます（" + Math.round(ITN_IMP_BYTES.zip / 1048576) + "MBまで）。");
        const r = kind === "xlsx" ? await itnImpXlsx(file, base) : await itnImpDocx(file, base);
        return {kind, groups: r.groups, text: r.text || "", note: (kind === "xlsx" ? (r.sheets > 1 ? "シートが " + r.sheets + "枚あります。" : "") : "") + (r.note || "")};
    }
    if(kind === "pdf"){
        if(file.size > ITN_IMP_BYTES.pdf) throw itnImpFail("PDFが大きすぎます（" + Math.round(ITN_IMP_BYTES.pdf / 1048576) + "MBまで）。");
        const r = await itnImpPdfText(file);
        if(r.text.replace(/\s/g, "").length < 4) throw itnImpFail("このPDFには文字が入っていません（画像だけのPDFです。このアプリで書き出したPDFも画像です）。JSON・Excel・CSV・テキストなどで書き出したものをお使いください。");
        return {kind, groups: itnImpFromText(r.text, base), text: r.text.slice(0, 60000), note: "PDFの文字を読み取りました。表の形がくずれることがあるので、結果をよく確かめてください。"};
    }
    // ここから文字のファイル
    if(file.size > ITN_IMP_BYTES.text) throw itnImpFail("ファイルが大きすぎます（" + Math.round(ITN_IMP_BYTES.text / 1048576) + "MBまで）。");
    if(isZip || isPdf || isOle) throw itnImpFail("文字のファイルではありません。");
    const text = itnImpDecode(new Uint8Array(await file.arrayBuffer())).replace(/\u0000/g, "");
    const trim = text.replace(/^[﻿\s]+/, "");
    if(!ext || ["txt", "text", "csv", "tsv", "tab", "md", "markdown", "json", "ics", "ical", "html", "htm", "xml"].indexOf(ext) < 0){
        if(/^\{|^\[/.test(trim)) kind = "json"; else if(/^BEGIN:VCALENDAR/i.test(trim)) kind = "ics"; else if(/^<(!doctype|html|\?xml)/i.test(trim)) kind = "html"; else kind = "txt";
    }else kind = ext === "text" ? "txt" : ext === "tab" ? "tsv" : ext === "markdown" ? "md" : ext === "ical" ? "ics" : ext === "htm" ? "html" : ext === "xml" ? "txt" : ext;
    if(kind === "json") return {kind, groups: itnImpJson(text, base), text: "", note: ""};
    if(kind === "ics") return {kind, groups: itnImpIcs(text, base), text: "", note: ""};
    if(kind === "html") return {kind, groups: itnImpHtml(text, base), text: "", note: ""};
    if(kind === "md") return {kind, groups: itnImpMd(text, base), text: text.slice(0, 60000), note: ""};
    if(kind === "csv" || kind === "tsv"){
        const rows = itnImpCleanRows(itnImpCsvRows(text, kind === "tsv" ? "\t" : itnImpDelim(text)));
        const g = itnImpItemsFromRows(rows);
        if(g) return {kind, groups: [g], text: "", note: ""};
        const joined = rows.map((r) => r.join("\t")).join("\n");
        return {kind, groups: itnImpFromText(joined, base), text: joined.slice(0, 60000), note: ""};
    }
    return {kind: "txt", groups: itnImpFromText(text, base), text: text.slice(0, 60000), note: ""};
}

// ---------- いくつかのファイル → 取り込み前の画面に出す内容（preview）----------
/** @returns preview {items, skipped, date, title, note, kind, groups|null} */
async function itnImportFiles(fileList){
    const all = Array.from(fileList || []), files = all.slice(0, ITN_IMP_MAX_FILES), multiFiles = files.length > 1;
    const groups = [], notes = [], errors = []; let text = "", kinds = [];
    if(all.length > files.length) notes.push("ファイルは 一度に " + ITN_IMP_MAX_FILES + "個までです。先頭の " + ITN_IMP_MAX_FILES + "個だけ読み取りました（のこりは もういちど選んでください）。");
    for(const f of files){
        let r;
        try{ r = await itnImpReadOne(f); }catch(e){ errors.push(f.name + "：" + itnImpErrText(e)); continue; }
        kinds.push(r.kind);
        const base = itnImpBase(f.name).replace(/^行動予定表_/, "").replace(/_?\d{4}-\d{2}-\d{2}$/, "").trim();
        const fileDate = itnImpFindDate(itnImpBase(f.name));
        const gs = r.groups.filter((g) => g && g.items && g.items.length);
        if(!gs.length){ errors.push(f.name + "：予定が見つかりませんでした。"); continue; }
        if(r.note) notes.push((multiFiles ? f.name + "：" : "") + r.note);
        gs.forEach((g) => {
            let title = String(g.title || "").trim();
            if(multiFiles) title = (title && title !== base ? base + "・" + title : base);
            else if(!title) title = base;
            groups.push({title: (title || "取り込んだ予定表").slice(0, 40), date: g.date || fileDate || "", items: g.items, skipped: g.skipped || 0, on: true, file: f.name, note: g.note || ""});
            if(g.note && !notes.includes(g.note)) notes.push(g.note);
        });
        if(files.length === 1) text = r.text || "";
    }
    if(groups.length > ITN_IMP_MAX_GROUPS){ notes.push("まとまりが多いので、先頭の " + ITN_IMP_MAX_GROUPS + "個だけ読み取りました。"); groups.length = ITN_IMP_MAX_GROUPS; }
    const kindLabel = kinds.length === 1 ? (ITN_IMP_TYPES.find((t) => t[0] === kinds[0]) || [0, "📄", kinds[0]])[2] : kinds.length + "個のファイル";
    return {groups, notes, errors, text, kind: kindLabel, files: files.length};
}

/** 取り込み前の画面に出す形にする。まとまりが1つなら 今までと同じ画面、2つ以上なら まとまりの一覧 */
function itnImpPreviewOf(res){
    const gs = (res.groups || []).map((g) => Object.assign({on: true, file: "", note: ""}, g)), note = (res.notes || []).join(" ");
    if(gs.length === 1){ const g = gs[0]; return {items: g.items || [], skipped: g.skipped || 0, date: g.date || "", title: g.title || "", note, kind: res.kind || "", groups: null}; }
    if(!gs.length) return {items: [], skipped: 0, date: "", title: "", note, kind: res.kind || "", groups: null};
    return {items: [], skipped: gs.reduce((n, g) => n + (g.skipped || 0), 0), date: "", title: "", note, kind: res.kind || "", groups: gs};
}
