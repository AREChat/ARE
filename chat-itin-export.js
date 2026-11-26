"use strict";
// ===== 行動予定表：書き出し（11種類：PowerPoint は GAS ハブ経由）=====
// PDF／Excel(.xlsx)／Word(.docx)／テキスト／JPEG／PNG／CSV／Webページ(HTML)／カレンダー(.ics)／バックアップ(JSON)
// ほかに「共有」「コピー」「印刷」。すべて この端末の中で作ります（外のサービスには送りません）。
// ・PDFと画像は「見た目そのまま」を画像で作ります（日本語の文字が どの端末でも 同じ形になります。文字の選択はできません）。
// ・Excel・Word・CSV・テキスト・カレンダーは 文字のまま入ります。

const ITN_COLS = ["状態", "開始(予定)", "終了(予定)", "内容", "種類", "予想待ち(分)", "実際待ち(分)", "実際の開始", "実際の終了", "費用(円)", "備考", "ひとことメモ", "★"];
const itnRowsOf = (plan) => plan.items.map((it) => [ITN_ST[it.st], it.s, it.e, it.n, itnCatOf(it.k)[2], it.w, it.aw, it.as, it.ae, it.c, it.m, it.nt, it.r || ""]);
const itnFileBase = (plan) => ("行動予定表_" + plan.title + (plan.date ? "_" + plan.date : "")).replace(/[\\/:*?"<>|\s\u0000-\u001f]+/g, "_").slice(0, 60);
const itnXmlEsc = (s) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const itnU8 = (s) => new TextEncoder().encode(s);
function itnSummary(plan){
    const st = itnStats(plan), L = ["完了 " + st.done + "/" + st.total + (st.skip ? "（スキップ " + st.skip + "）" : "")];
    if(st.waitN) L.push("待ち時間 合計 " + itnDur(st.actAll) + "・平均 " + itnDur(st.avg) + (st.cmp ? "（予想 " + itnDur(st.expDone) + " → 実際 " + itnDur(st.actDone) + "）" : ""));
    else if(st.expAll) L.push("予想の待ち時間 合計 " + itnDur(st.expAll));
    if(st.cost) L.push("費用 " + itnYen(st.cost));
    return L;
}
const itnDateFull = (plan) => (plan.date ? plan.date.replace(/-/g, "/") + " " + itnDateLabel(plan.date).replace(/^\d+\/\d+/, "") : "").trim();

// ---------- テキスト・CSV ----------
function itnTxt(plan){
    const L = ["■ 行動予定表「" + plan.title + "」 " + itnDateFull(plan), itnSummary(plan).join(" ／ "), "────────────────"];
    plan.items.forEach((it) => {
        const mark = {t: "□", w: "⏳", d: "▶", x: "✔", s: "－"}[it.st];
        L.push(mark + " " + (it.s || "--:--") + (it.e ? "–" + it.e : "") + " " + itnCatOf(it.k)[1] + (it.n || "（名前なし）"));
        const d = [];
        if(it.w > 0 || it.aw != null) d.push("待ち " + (it.w > 0 ? "予想" + it.w + "分" : "") + (it.w > 0 && it.aw != null ? " → " : "") + (it.aw != null ? "実際" + it.aw + "分" : ""));
        if(it.as || it.ae) d.push("実際 " + (it.as || "?") + "–" + (it.ae || "?"));
        if(it.c != null) d.push(itnYen(it.c));
        if(it.r) d.push("★".repeat(it.r));
        if(d.length) L.push("    " + d.join(" ／ "));
        if(it.m) L.push("    備考：" + it.m);
        if(it.nt) L.push("    メモ：" + it.nt);
    });
    L.push("────────────────", "（ARE 行動予定表）");
    return L.join("\n");
}
function itnCsv(plan){
    const q = (v) => { let s = v == null ? "" : String(v); if(/^[=+@]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return "\uFEFF" + [ITN_COLS].concat(itnRowsOf(plan)).map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

// ---------- Excel（.xlsx）----------
function itnXlsx(plan){
    const colL = (i) => String.fromCharCode(65 + i), TIMEC = new Set([1, 2, 7, 8]), NUMC = new Set([5, 6, 12]);
    const cell = (c, r, v, ty) => {
        const ref = colL(c) + r;
        if(r === 1) return '<c r="' + ref + '" t="inlineStr" s="1"><is><t>' + itnXmlEsc(v) + '</t></is></c>';
        if(TIMEC.has(c)){ const m = itnMin(v); return m == null ? '<c r="' + ref + '" s="3"/>' : '<c r="' + ref + '" s="3"><v>' + (m / 1440).toFixed(8) + '</v></c>'; }
        if(NUMC.has(c) || c === 9){ const n = v === "" || v == null ? null : Number(v); return n == null || !Number.isFinite(n) ? '<c r="' + ref + '" s="' + (c === 9 ? 5 : 4) + '"/>' : '<c r="' + ref + '" s="' + (c === 9 ? 5 : 4) + '"><v>' + n + '</v></c>'; }
        return '<c r="' + ref + '" t="inlineStr" s="2"><is><t xml:space="preserve">' + itnXmlEsc(v) + '</t></is></c>';
    };
    const rows = [ITN_COLS].concat(itnRowsOf(plan)), widths = [9, 11, 11, 30, 9, 12, 12, 11, 11, 11, 28, 32, 6];
    let sd = ""; rows.forEach((r, i) => { sd += '<row r="' + (i + 1) + '"' + (i === 0 ? ' ht="24" customHeight="1"' : "") + ">" + r.map((v, c) => cell(c, i + 1, v)).join("") + "</row>"; });
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const sheet1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ' + NS + '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>' +
        widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") + '</cols><sheetData>' + sd + '</sheetData><autoFilter ref="A1:M' + rows.length + '"/></worksheet>';
    const st = itnStats(plan);
    const sm = [["予定表", plan.title], ["日付", itnDateFull(plan)], ["完了", st.done + " / " + st.total], ["スキップ", st.skip], ["待ち時間 合計（実際・分）", st.actAll], ["待ち時間 平均（実際・分）", st.avg], ["予想の待ち 合計（記録のある分・分）", st.expDone], ["実際の待ち 合計（記録のある分・分）", st.actDone], ["費用 合計（円）", st.cost]];
    const sheet2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ' + NS + '><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/></cols><sheetData>' +
        sm.map((r, i) => '<row r="' + (i + 1) + '"><c r="A' + (i + 1) + '" t="inlineStr" s="2"><is><t>' + itnXmlEsc(r[0]) + '</t></is></c>' + (typeof r[1] === "number" ? '<c r="B' + (i + 1) + '" s="4"><v>' + r[1] + '</v></c>' : '<c r="B' + (i + 1) + '" t="inlineStr" s="2"><is><t>' + itnXmlEsc(r[1]) + '</t></is></c>') + '</row>').join("") + '</sheetData></worksheet>';
    const bd = '<border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ' + NS + '><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Yu Gothic"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5578ED"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' + bd + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="20" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", O = "http://schemas.openxmlformats.org/package/2006/relationships";
    const files = [
        ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
        ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + O + '"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ' + NS + ' xmlns:r="' + R + '"><sheets><sheet name="行動予定表" sheetId="1" r:id="rId1"/><sheet name="まとめ" sheetId="2" r:id="rId2"/></sheets></workbook>'],
        ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + O + '"><Relationship Id="rId1" Type="' + R + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + R + '/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="' + R + '/styles" Target="styles.xml"/></Relationships>'],
        ["xl/styles.xml", styles], ["xl/worksheets/sheet1.xml", sheet1], ["xl/worksheets/sheet2.xml", sheet2]];
    return makeZip(files.map((f) => ({name: f[0], data: itnU8(f[1])})));
}

// ---------- Word（.docx）----------
function itnDocx(plan){
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const run = (t, o) => { o = o || {}; return '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic"/>' + (o.b ? "<w:b/>" : "") + (o.color ? '<w:color w:val="' + o.color + '"/>' : "") + '<w:sz w:val="' + (o.sz || 20) + '"/></w:rPr><w:t xml:space="preserve">' + itnXmlEsc(t) + "</w:t></w:r>"; };
    const para = (t, o) => "<w:p>" + (o && o.sp ? '<w:pPr><w:spacing w:after="' + o.sp + '"/></w:pPr>' : "") + run(t, o) + "</w:p>";
    const widths = [800, 1900, 3500, 1000, 1000, 2100, 1300, 3798], head = ["状態", "予定の時刻", "内容", "予想の待ち", "実際の待ち", "実際の時刻", "費用", "備考・メモ"];
    const tc = (t, w, o) => '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (o && o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : "") + '<w:vAlign w:val="center"/></w:tcPr><w:p>' + run(t, o) + "</w:p></w:tc>";
    let rows = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + head.map((h, i) => tc(h, widths[i], {b: 1, color: "FFFFFF", fill: "5578ED"})).join("") + "</w:tr>";
    plan.items.forEach((it, n) => {
        const f = n % 2 ? "F3F6FF" : "", cols = [ITN_ST[it.st], (it.s || "") + (it.e ? "–" + it.e : ""), itnCatOf(it.k)[1] + " " + (it.n || ""), it.w > 0 ? it.w + "分" : "", it.aw != null ? it.aw + "分" : "", (it.as || "") + (it.as || it.ae ? "–" : "") + (it.ae || ""), it.c != null ? itnYen(it.c) : "", [it.m, it.nt ? "メモ：" + it.nt : "", it.r ? "★" + it.r : ""].filter(Boolean).join(" ／ ")];
        const bad = it.aw != null && it.w > 0 && it.aw > it.w;
        rows += "<w:tr>" + cols.map((c, i) => tc(c, widths[i], {fill: f, b: i === 2, color: i === 4 && it.aw != null && it.w > 0 ? (bad ? "C0392B" : "1E8449") : ""})).join("") + "</w:tr>";
    });
    const bd = ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>').join("");
    const body = para("行動予定表「" + plan.title + "」", {b: 1, sz: 36, sp: 60}) + para(itnDateFull(plan), {sz: 22, color: "555555"}) + para(itnSummary(plan).join("　／　"), {sz: 22, sp: 160}) +
        '<w:tbl><w:tblPr><w:tblW w:w="' + widths.reduce((a, b) => a + b, 0) + '" w:type="dxa"/><w:tblBorders>' + bd + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>" + rows + "</w:tbl>" +
        para("ARE 行動予定表で作りました。", {sz: 16, color: "888888"}) + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
    const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", O = "http://schemas.openxmlformats.org/package/2006/relationships";
    return makeZip([
        ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
        ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + O + '"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="word/document.xml"/></Relationships>'],
        ["word/document.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W + "><w:body>" + body + "</w:body></w:document>"]
    ].map((f) => ({name: f[0], data: itnU8(f[1])})));
}

// ---------- Webページ（HTML）----------
function itnHtml(plan){
    const rows = plan.items.map((it) => {
        const bad = it.aw != null && it.w > 0 && it.aw > it.w;
        return "<tr class=\"s-" + it.st + "\"><td>" + itnE(ITN_ST[it.st]) + "</td><td class=\"t\">" + itnE((it.s || "") + (it.e ? "–" + it.e : "")) + (it.as || it.ae ? "<br><small>実際 " + itnE((it.as || "?") + "–" + (it.ae || "?")) + "</small>" : "") + "</td><td><b>" + itnCatOf(it.k)[1] + " " + itnE(it.n) + "</b></td><td>" + (it.w > 0 ? "予想 " + it.w + "分" : "") + (it.aw != null ? "<br><b class=\"" + (it.w > 0 ? (bad ? "ng" : "ok") : "") + "\">実際 " + it.aw + "分</b>" : "") + "</td><td>" + (it.c != null ? itnE(itnYen(it.c)) : "") + "</td><td>" + itnE(it.m) + (it.nt ? "<br>📝 " + itnE(it.nt) : "") + (it.r ? "<br>" + "★".repeat(it.r) : "") + "</td></tr>";
    }).join("");
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + itnE(plan.title) + '</title><style>' +
        'body{font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif;margin:0;padding:20px;color:#1c2333;background:#f4f6fb}h1{margin:0 0 4px;font-size:24px}.d{color:#667;margin:0 0 8px}.sum{background:#fff;border-radius:12px;padding:10px 14px;margin:8px 0 14px;box-shadow:0 1px 4px #0001}' +
        'table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px #0001}th{background:#5578ed;color:#fff;padding:9px 8px;text-align:left;font-size:14px}td{padding:9px 8px;border-bottom:1px solid #e3e8f4;vertical-align:top;font-size:14px}tr:nth-child(even) td{background:#f7f9ff}.t{white-space:nowrap}small{color:#778}.ok{color:#1e8449}.ng{color:#c0392b}.s-x td:first-child{color:#1e8449;font-weight:700}.s-s td{opacity:.55}' +
        '@page{size:A4 landscape;margin:10mm}@media print{body{background:#fff;padding:0}.sum,table{box-shadow:none}}</style></head><body><h1>📋 ' + itnE(plan.title) + '</h1><p class="d">' + itnE(itnDateFull(plan)) + '</p><div class="sum">' + itnE(itnSummary(plan).join("　／　")) + '</div>' +
        '<table><thead><tr><th>状態</th><th>時刻</th><th>内容</th><th>待ち</th><th>費用</th><th>備考・メモ</th></tr></thead><tbody>' + rows + '</tbody></table><p class="d">ARE 行動予定表で作りました。</p></body></html>';
}

// ---------- カレンダー（.ics）----------
function itnIcs(plan){
    const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const fold = (line) => { const out = []; let cur = "", bytes = 0; for(const ch of line){ const b = new TextEncoder().encode(ch).length; if(bytes + b > 73){ out.push(cur); cur = " " + ch; bytes = 1 + b; } else { cur += ch; bytes += b; } } out.push(cur); return out.join("\r\n"); };
    const ymd = (date, min) => date.replace(/-/g, "") + "T" + String(Math.floor(min / 60)).padStart(2, "0") + String(min % 60).padStart(2, "0") + "00";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARE//Koudou Yoteihyo//JA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + esc(plan.title)];
    const date = plan.date || itnToday();
    plan.items.forEach((it) => {
        const s = itnMin(it.s); if(s == null) return;
        let e = itnMin(it.e); if(e == null || e <= s) e = Math.min(1439, s + 30);
        const desc = [it.w > 0 ? "予想の待ち：" + it.w + "分" : "", it.aw != null ? "実際の待ち：" + it.aw + "分" : "", it.c != null ? "費用：" + itnYen(it.c) : "", it.m, it.nt ? "メモ：" + it.nt : ""].filter(Boolean).join("\n");
        L.push("BEGIN:VEVENT", "UID:" + it.i + "-" + plan.id + "@are-itin", "DTSTAMP:" + stamp, "DTSTART:" + ymd(date, s), "DTEND:" + ymd(date, e), "SUMMARY:" + esc(itnCatOf(it.k)[1] + " " + (it.n || "予定")), "DESCRIPTION:" + esc(desc));
        if(it.al !== 0 && Number(itn.prefs.lead) > 0) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(it.n || "予定"), "TRIGGER:-PT" + Number(itn.prefs.lead) + "M", "END:VALARM");
        L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
}

// ---------- 画像・PDF（見た目そのまま）----------
const itnFont = (px, bold) => (bold ? "700 " : "400 ") + px + 'px "Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';
function itnWrap(ctx, text, maxW, maxLines){
    const out = []; let cur = "";
    for(const ch of String(text || "")){
        if(ch === "\n"){ out.push(cur); cur = ""; continue; }
        if(ctx.measureText(cur + ch).width > maxW && cur){ out.push(cur); cur = ch; } else cur += ch;
    }
    if(cur) out.push(cur);
    if(maxLines && out.length > maxLines){ out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{0,1}$/, "…"); }
    return out.length ? out : [""];
}
/** 見た目を作る。pageH があれば A4 の縦に分けて、なければ 1まいの長い画像にする */
function itnLayout(plan, pageH){
    const W = 1080, M = 36, cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    const X = [M, M + 70, M + 290, M + 640, M + 800], CW = [70, 220, 350, 160, W - 2 * M - 800];
    const rows = plan.items.map((it) => {
        ctx.font = itnFont(26, true); const nm = itnWrap(ctx, (it.n || "（名前なし）"), CW[2] - 16, 3);
        ctx.font = itnFont(21, false); const memo = itnWrap(ctx, [it.m, it.nt ? "📝" + it.nt : ""].filter(Boolean).join("  "), CW[4] - 12, 3);
        const wl = (it.w > 0 || it.aw != null ? (it.w > 0 && it.aw != null ? 2 : 1) : 0) + (it.c != null ? 1 : 0), tl = (it.as || it.ae) ? 2 : 1;
        const lines = Math.max(nm.length * 1.25, memo.length, wl, tl * 1.1, 1.9);
        return {it, nm, memo, h: Math.round(26 + lines * 30)};
    });
    const sum = itnSummary(plan), headH = 128 + sum.length * 34 + 22, tblH = 46, foot = 50, usable = pageH ? pageH - foot : 1e9;
    const pages = []; let cur = {rows: [], y: headH + tblH, first: true}; pages.push(cur);
    rows.forEach((r) => {
        if(pageH && cur.y + r.h > usable){ cur = {rows: [], y: 50 + tblH, first: false}; pages.push(cur); }
        r.y = cur.y; cur.rows.push(r); cur.y += r.h;
    });
    pages.forEach((p) => { p.h = pageH ? pageH : p.y + foot; });
    return {W, M, X, CW, rows, pages, sum, headH, tblH, foot};
}
function itnDrawPage(plan, L, pi, scale){
    const p = L.pages[pi], cv = document.createElement("canvas"); cv.width = Math.round(L.W * scale); cv.height = Math.round(p.h * scale);
    const ctx = cv.getContext("2d"); ctx.scale(scale, scale); ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, L.W, p.h);
    const {M, X, CW} = L; let y0 = 0;
    if(p.first){
        const g = ctx.createLinearGradient(0, 0, L.W, 0); g.addColorStop(0, "#5578ed"); g.addColorStop(1, "#7c9cff"); ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, 124);
        ctx.fillStyle = "#fff"; ctx.font = itnFont(44, true); ctx.fillText(itnWrap(ctx, "📋 " + plan.title, L.W - 2 * M, 1)[0], M, 70);
        ctx.font = itnFont(26, false); ctx.fillText(itnDateFull(plan) + "　全 " + plan.items.length + " 件", M, 106);
        ctx.fillStyle = "#1c2333"; ctx.font = itnFont(24, true); L.sum.forEach((t, i) => ctx.fillText(t, M, 128 + 30 + i * 34));
    }
    y0 = p.first ? L.headH : 50;
    const ty = y0;
    ctx.fillStyle = "#5578ed"; ctx.fillRect(M, ty, L.W - 2 * M, L.tblH);
    ctx.fillStyle = "#fff"; ctx.font = itnFont(22, true);
    ["状態", "予定の時刻", "内容", "待ち時間", "備考・メモ"].forEach((t, i) => ctx.fillText(t, X[i] + 8, ty + 31));
    p.rows.forEach((r, n) => {
        const it = r.it, y = r.y;
        if(n % 2) { ctx.fillStyle = "#f4f7ff"; ctx.fillRect(M, y, L.W - 2 * M, r.h); }
        ctx.strokeStyle = "#dfe5f3"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(M, y + r.h - 0.5); ctx.lineTo(L.W - M, y + r.h - 0.5); ctx.stroke();
        const col = {t: "#8a94ad", w: "#e08a1e", d: "#3f6be0", x: "#1e9e66", s: "#9aa3b8"}[it.st], mk = {t: "", w: "待", d: "中", x: "✓", s: "略"}[it.st];
        ctx.beginPath(); ctx.arc(X[0] + 30, y + 34, 20, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
        if(it.st === "x"){ ctx.fillStyle = col; ctx.fill(); }
        if(mk){ ctx.fillStyle = it.st === "x" ? "#fff" : col; ctx.font = itnFont(it.st === "x" ? 24 : 19, true); ctx.textAlign = "center"; ctx.fillText(mk, X[0] + 30, y + 42); ctx.textAlign = "left"; }
        ctx.fillStyle = "#1c2333"; ctx.font = itnFont(24, true); ctx.fillText((it.s || "--:--") + (it.e ? "–" + it.e : ""), X[1] + 6, y + 40);
        if(it.as || it.ae){ ctx.fillStyle = "#6b7590"; ctx.font = itnFont(20, false); ctx.fillText("実 " + (it.as || "?") + "–" + (it.ae || "?"), X[1] + 6, y + 70); }
        ctx.fillStyle = "#1c2333"; ctx.font = itnFont(26, true); r.nm.forEach((t, i) => ctx.fillText((i === 0 ? itnCatOf(it.k)[1] + " " : "") + t, X[2] + 8, y + 40 + i * 33));
        let wy = y + 38; ctx.font = itnFont(22, false);
        if(it.w > 0){ ctx.fillStyle = "#6b7590"; ctx.fillText("予想 " + it.w + "分", X[3] + 6, wy); wy += 30; }
        if(it.aw != null){ ctx.fillStyle = it.w > 0 ? (it.aw > it.w ? "#d0392b" : "#1e9e66") : "#1c2333"; ctx.font = itnFont(24, true); ctx.fillText("実際 " + it.aw + "分", X[3] + 6, wy); wy += 30; }
        if(it.c != null){ ctx.fillStyle = "#6b7590"; ctx.font = itnFont(21, false); ctx.fillText(itnYen(it.c), X[3] + 6, wy); }
        ctx.fillStyle = "#4a5470"; ctx.font = itnFont(21, false); r.memo.forEach((t, i) => ctx.fillText(t, X[4] + 6, y + 36 + i * 28));
        if(it.r){ ctx.fillStyle = "#e0a31e"; ctx.font = itnFont(20, true); ctx.fillText("★".repeat(it.r), X[4] + 6, y + r.h - 12); }
    });
    ctx.fillStyle = "#9aa3b8"; ctx.font = itnFont(18, false); ctx.fillText("ARE 行動予定表　" + (pi + 1) + " / " + L.pages.length, M, p.h - 18);
    return cv;
}
const itnBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => b ? res(b) : rej(new Error("画像を作れませんでした")), type, q));
async function itnImage(plan, type){
    let L = itnLayout(plan, null);
    const H = L.pages[0].h, scale = Math.max(0.4, Math.min(1.5, Math.sqrt(12e6 / (L.W * H)), 15000 / H));
    return itnBlob(itnDrawPage(plan, L, 0, scale), type, 0.92);
}
async function itnPdf(plan){
    const L = itnLayout(plan, Math.round(1080 * 1.4142)), PW = 595.28, PH = 841.89, jp = [];
    for(let i = 0; i < L.pages.length; i++){ const b = await itnBlob(itnDrawPage(plan, L, i, 1.6), "image/jpeg", 0.9); jp.push({bytes: new Uint8Array(await b.arrayBuffer()), w: Math.round(1080 * 1.6), h: Math.round(L.pages[i].h * 1.6)}); }
    const parts = [], offs = []; let len = 0;
    const push = (x) => { const b = typeof x === "string" ? itnU8(x) : x; parts.push(b); len += b.length; };
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const n = jp.length, kids = jp.map((_, i) => (3 + i * 3) + " 0 R").join(" ");
    const obj = (id, body) => { offs[id] = len; push(id + " 0 obj\n"); body.forEach(push); push("\nendobj\n"); };
    obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
    obj(2, ["<< /Type /Pages /Kids [" + kids + "] /Count " + n + " >>"]);
    jp.forEach((j, i) => {
        const pg = 3 + i * 3, ct = pg + 1, im = pg + 2, content = "q " + PW + " 0 0 " + PH + " 0 0 cm /Im0 Do Q";
        obj(pg, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>"]);
        obj(ct, ["<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream"]);
        obj(im, ["<< /Type /XObject /Subtype /Image /Width " + j.w + " /Height " + j.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + j.bytes.length + " >>\nstream\n", j.bytes, "\nendstream"]);
    });
    const xref = len, total = 3 + n * 3;
    push("xref\n0 " + total + "\n0000000000 65535 f \n");
    for(let i = 1; i < total; i++) push(String(offs[i]).padStart(10, "0") + " 00000 n \n");
    push("trailer\n<< /Size " + total + " /Root 1 0 R /Info << /Title (Koudou Yoteihyo) /Producer (ARE) >> >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, {type: "application/pdf"});
}

// ---------- ぜんぶの入口 ----------
function itnPrint(plan){
    const root = document.getElementById("itnRoot"); if(!root) return;
    const rows = plan.items.map((it) => '<tr><td>' + itnE(ITN_ST[it.st]) + '</td><td>' + itnE((it.s || "") + (it.e ? "–" + it.e : "")) + '</td><td>' + itnE(it.n) + '</td><td>' + (it.w > 0 ? it.w + "分" : "") + '</td><td>' + (it.aw != null ? it.aw + "分" : "") + '</td><td>' + itnE([it.m, it.nt].filter(Boolean).join(" / ")) + '</td></tr>').join("");
    const div = document.createElement("div"); div.className = "itn-print";
    div.innerHTML = '<h2>' + itnE(plan.title) + '</h2><p>' + itnE(itnDateFull(plan) + "　" + itnSummary(plan).join(" ／ ")) + '</p><table><thead><tr><th>状態</th><th>時刻</th><th>内容</th><th>予想待ち</th><th>実際待ち</th><th>備考・メモ</th></tr></thead><tbody>' + rows + '</tbody></table>';
    root.appendChild(div); document.body.classList.add("itn-printing");
    const done = () => { document.body.classList.remove("itn-printing"); if(div.parentNode) div.parentNode.removeChild(div); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); setTimeout(() => { try{ window.print(); }catch(_e){ done(); } }, 150); setTimeout(done, 60000);
}
// PowerPoint(.pptx) は、GAS ハブ（Google の無料の仕組み）に作ってもらい、できたファイルを開く。ログインしている人だけ・1日 30回まで
async function itnHubOffice(fmt, plan){
    try{
        if(typeof aibLoadShared === "function") await aibLoadShared();
        const url = typeof andHubUrl === "function" ? andHubUrl() : "";
        if(!url){ showToast("PowerPoint の書き出しは、GAS ハブの設定がすむと 使えます（いまは Excel・Word・PDF を お使いください）。"); return; }
        const ses = await requireClient().auth.getSession();
        const token = ses && ses.data && ses.data.session && ses.data.session.access_token;
        if(!token){ showToast("ログインが確認できません。ログインしなおしてください。"); return; }
        showToast("PowerPoint を作っています…（数秒かかります）");
        const body = {action: "office", token, format: fmt, title: plan.title + (plan.date ? " " + plan.date : ""), columns: ITN_COLS, rows: itnRowsOf(plan), summary: itnSummary(plan), slideCols: [0, 1, 3, 4, 10]};
        const r = await fetch(url, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(body)});
        const j = await r.json();
        if(!j || !j.ok){ showToast((j && j.message) || "作れませんでした。しばらくしてから もう一度おためしください。"); return; }
        showToast("「" + j.name + "」を作りました（ドライブの ARE-ハブ に保存）。ひらきます。きょうは あと " + j.left + " 回。");
        const a = document.createElement("a");
        a.href = j.download || j.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        document.body.appendChild(a); a.click(); a.remove();
    }catch(_e){
        showToast("PowerPoint を作れませんでした。通信を確かめて、もう一度おためしください。");
    }
}

async function itnExport(kind, plan){
    if(!plan || !plan.items.length){ showToast("書き出す予定がありません。"); return; }
    const base = itnFileBase(plan);
    const save = (blob, ext) => { downloadBlob(blob, base + "." + ext); showToast("「" + base + "." + ext + "」を 保存しました。"); };
    if(kind === "memory") return itnMemoryExport(plan);
    if(kind === "txt") return save(new Blob([itnTxt(plan)], {type: "text/plain;charset=utf-8"}), "txt");
    if(kind === "csv") return save(new Blob([itnCsv(plan)], {type: "text/csv;charset=utf-8"}), "csv");
    if(kind === "html") return save(new Blob([itnHtml(plan)], {type: "text/html;charset=utf-8"}), "html");
    if(kind === "ics") return save(new Blob([itnIcs(plan)], {type: "text/calendar;charset=utf-8"}), "ics");
    if(kind === "json") return save(new Blob([JSON.stringify({app: "ARE-itin", v: 1, plan: itnPackPlan(plan)}, null, 1)], {type: "application/json"}), "json");
    if(kind === "xlsx") return save(new Blob([itnXlsx(plan)], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), "xlsx");
    if(kind === "pptx") return itnHubOffice("pptx", plan);
    if(kind === "docx") return save(new Blob([itnDocx(plan)], {type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}), "docx");
    if(kind === "jpg" || kind === "png"){ showToast("画像を作っています…"); return save(await itnImage(plan, kind === "jpg" ? "image/jpeg" : "image/png"), kind); }
    if(kind === "pdf"){ showToast("PDFを作っています…"); return save(await itnPdf(plan), "pdf"); }
    if(kind === "copy"){
        const t = itnTxt(plan);
        try{ await navigator.clipboard.writeText(t); }catch(_e){ const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); }catch(_e2){} ta.remove(); }
        showToast("コピーしました。LINEやメモに はりつけられます。"); return;
    }
    if(kind === "print") return itnPrint(plan);
    if(kind === "share"){
        const text = itnTxt(plan);
        try{
            if(navigator.share){
                showToast("画像を作っています…");
                const blob = await itnImage(plan, "image/jpeg"), file = new File([blob], base + ".jpg", {type: "image/jpeg"});
                if(navigator.canShare && navigator.canShare({files: [file]})) await navigator.share({files: [file], title: plan.title, text: plan.title});
                else await navigator.share({title: plan.title, text});
                return;
            }
        }catch(e){ if(e && e.name === "AbortError") return; }
        return itnExport("copy", plan);
    }
}
