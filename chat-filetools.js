"use strict";
// ===== ファイルの便利ツール（ぜんぶ この端末の中だけで処理。サーバーには送りません） =====
//  画像まとめて変換 / 画像→PDF / PDF操作 / 写真の位置情報を消す / ファイル照合 / 名前まとめて変更 / 文字化けなおし / CSV変換 / 動画から静止画 / 大きいファイルの分割・結合

const FT_MAX = 300 * 1024 * 1024;
const ftSt = {};
const ftBox = (id) => document.getElementById(id);
const ftSize = (n) => formatAttachmentSize(n);
const ftNum = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const ftPick = (ns, act, label, accept, multi, extra) => '<label class="tool-button">' + label + '<input class="file-input" type="file" ' + (multi ? "multiple " : "") + (accept ? 'accept="' + accept + '" ' : "") + (extra || "") + 'data-t="' + ns + ':' + act + '"></label>';
const ftBtn = (ns, act, label, opt) => '<button type="button" class="' + ((opt && opt.sub) ? "button-secondary" : "button") + '" data-t="' + ns + ':' + act + '"' + ((opt && opt.dis) ? " disabled" : "") + '>' + label + '</button>';
const ftMsgHtml = (m) => m ? '<div class="meta" role="status">' + m + '</div>' : "";
const ftSel = (ns, act, val, opts) => '<select data-t="' + ns + ':' + act + '">' + opts.map((o) => '<option value="' + escapeHtml(o[0]) + '"' + (String(o[0]) === String(val) ? " selected" : "") + '>' + escapeHtml(o[1]) + '</option>').join("") + '</select>';
const ftListStyle = 'max-height:32vh;overflow:auto;display:grid;gap:4px';
const ftRow = (left, right) => '<div class="row" style="justify-content:space-between;gap:6px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + left + '</span><span style="display:flex;gap:4px;flex:none">' + (right || "") + '</span></div>';
const ftErr = (e) => { const m = String((e && e.message) || e); return m === "ft_big" ? "大きすぎます（" + ftSize(FT_MAX) + "まで）。" : m === "ft_img" ? "画像として読めませんでした。" : m === "ft_pdf_enc" ? "パスワード付きのPDFは扱えません。" : m === "ft_pdf" ? "PDFとして読めませんでした。" : featError(e); };

function ftOpenTool(key, title, note){ ftSt.cur = key; openSheet(toolHead(title, note) + '<div id="ftBody"></div>' + toolClose()); ftSt[key] = ftSt[key] || {files:[], msg:""}; ftSt[key].msg = ""; ftPaint(); }
function ftPaint(){ const b = ftBox("ftBody"); if(b && ftSt.cur && ftPainters[ftSt.cur]) b.innerHTML = ftPainters[ftSt.cur](ftSt[ftSt.cur]); }
function ftAdd(s, list, filter){
  const add = Array.from(list).filter(filter || (() => true));
  s.files = s.files.concat(add);
  const total = s.files.reduce((t, f) => t + f.size, 0);
  if(total > FT_MAX){ s.files = s.files.slice(0, s.files.length - add.length); s.msg = "合計が大きすぎます（" + ftSize(FT_MAX) + "まで）。"; }
  else if(s.files.length > 500){ s.files = s.files.slice(0, 500); s.msg = "500個までです。"; }
  else s.msg = add.length < list.length ? "対応していない種類のファイルは とばしました。" : "";
}
const ftIsImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(f.name);
const ftIsPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const ftBase = (n) => String(n).replace(/\.[^./\\]+$/, "");
const ftExt = (n) => { const m = /\.([^./\\]+)$/.exec(n); return m ? m[1].toLowerCase() : ""; };
const ftFileOf = (blob, name) => new File([blob], name, {lastModified: Date.now()});
function ftSave(blob, name){ const n = name.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_"); downloadBlob(blob, n); shareOffer(blob, n); }
async function ftSaveZip(items, zipName){ const blob = await zipBuild(items.map((i) => ({path: i.name, file: ftFileOf(i.blob, i.name)}))); ftSave(blob, zipName); return blob; }
function ftUniq(names){ const seen = new Map(); return names.map((n) => { const k = n.toLowerCase(); const c = seen.get(k) || 0; seen.set(k, c + 1); if(!c) return n; const e = ftExt(n); return ftBase(n) + "_" + (c + 1) + (e ? "." + e : ""); }); }

async function ftLoadImage(file){
  try{ return await createImageBitmap(file, {imageOrientation: "from-image"}); }catch(_e){}
  return await new Promise((res, rej) => { const url = URL.createObjectURL(file); const im = new Image(); im.onload = () => { res(im); }; im.onerror = () => rej(new Error("ft_img")); im.src = url; });
}
const ftToBlob = (canvas, type, q) => new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error("ft_img")), type, q));
async function ftDraw(file, maxSide, flatten){
  const im = await ftLoadImage(file); let w = im.width || im.naturalWidth, h = im.height || im.naturalHeight;
  if(!w || !h) throw new Error("ft_img");
  const k = maxSide && Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1;
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  if(w * h > 100e6) throw new Error("ft_img");
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  if(flatten){ g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
  g.drawImage(im, 0, 0, w, h); if(im.close) try{ im.close(); }catch(_e){}
  return c;
}

const ftPainters = {};
const ftActs = {};

// ---------- 1. 画像まとめて圧縮・リサイズ・変換 ----------
ftPainters.imgc = (s) => {
  s.max = s.max || 1920; s.fmt = s.fmt || "image/jpeg"; s.q = s.q || 0.8; s.res = s.res || [];
  return ftPick("imgc", "add", "🖼️ 画像を選ぶ（いくつでも）", "image/*", true) +
    (s.files.length ? '<div style="' + ftListStyle + '">' + s.files.map((f, i) => ftRow(escapeHtml(f.name) + ' <span class="meta">' + ftSize(f.size) + '</span>', ftBtn("imgc", "rm:" + i, "✕", {sub:1}))).join("") + '</div>' : '<div class="empty-list">画像を選ぶと ここに並びます。</div>') +
    '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><label>長いほうの辺 ' + ftSel("imgc", "max", s.max, [[0, "そのまま"], [3840, "3840px"], [1920, "1920px（おすすめ）"], [1280, "1280px"], [800, "800px"]]) + '</label><label>形式 ' + ftSel("imgc", "fmt", s.fmt, [["image/jpeg", "JPEG"], ["image/webp", "WebP"], ["image/png", "PNG"]]) + '</label></div>' +
    (s.fmt === "image/png" ? "" : '<label>画質 ' + Math.round(s.q * 100) + '%<input type="range" min="40" max="95" value="' + Math.round(s.q * 100) + '" data-t="imgc:q"></label>') +
    ftMsgHtml(s.msg) +
    (s.res.length ? '<div style="' + ftListStyle + '">' + s.res.map((r, i) => ftRow(escapeHtml(r.name) + ' <span class="meta">' + ftSize(r.from) + ' → ' + (r.blob ? ftSize(r.blob.size) : "失敗") + '</span>', r.blob ? ftBtn("imgc", "dl:" + i, "保存", {sub:1}) : "")).join("") + '</div>' : "") +
    '<div class="row">' + ftBtn("imgc", "run", s.busy ? "変換中…" : "変換する", {dis: !s.files.length || s.busy}) + (s.res.some((r) => r.blob) ? ftBtn("imgc", "zip", "ぜんぶZIPで保存", {sub:1}) : "") + '</div>';
};
ftActs.imgc = async (a, node, s) => {
  const arg = String(node.dataset.t).split(":")[2];
  if(a === "add"){ ftAdd(s, node.files, ftIsImg); node.value = ""; s.res = []; }
  else if(a === "rm"){ s.files.splice(Number(arg), 1); s.res = []; }
  else if(a === "max"){ s.max = ftNum(node.value, 1920); s.res = []; }
  else if(a === "fmt"){ s.fmt = node.value; s.res = []; }
  else if(a === "q"){ s.q = ftNum(node.value, 80) / 100; s.res = []; ftBox("ftBody").querySelector("label input[type=range]").parentNode.firstChild.textContent = "画質 " + Math.round(s.q * 100) + "%"; return; }
  else if(a === "dl"){ const r = s.res[Number(arg)]; if(r && r.blob) ftSave(r.blob, r.name); return; }
  else if(a === "zip"){ await ftSaveZip(s.res.filter((r) => r.blob).map((r) => ({name: r.name, blob: r.blob})), "画像まとめ.zip"); s.msg = "ZIPを保存しました。"; }
  else if(a === "run"){
    s.busy = true; s.res = []; ftPaint();
    const ext = s.fmt === "image/png" ? "png" : s.fmt === "image/webp" ? "webp" : "jpg"; const names = ftUniq(s.files.map((f) => ftBase(f.name) + "." + ext));
    for(let i = 0; i < s.files.length; i++){
      const f = s.files[i];
      try{ const c = await ftDraw(f, s.max, s.fmt === "image/jpeg"); const blob = await ftToBlob(c, s.fmt, s.q); s.res.push({name: names[i], from: f.size, blob}); }
      catch(_e){ s.res.push({name: f.name, from: f.size, blob: null}); }
      s.msg = "変換中… " + (i + 1) + "/" + s.files.length; const b = ftBox("ftBody"); if(b && ftSt.cur === "imgc") ftPaint();
    }
    const ok = s.res.filter((r) => r.blob), before = s.files.reduce((t, f) => t + f.size, 0), after = ok.reduce((t, r) => t + r.blob.size, 0);
    s.busy = false; s.msg = ok.length + "個を変換しました（合計 " + ftSize(before) + " → " + ftSize(after) + "）" + (ok.length < s.files.length ? "。読めない画像が" + (s.files.length - ok.length) + "個ありました。" : "。");
  }
  ftPaint();
};

// ---------- 2. 画像→PDF ----------
async function ftBuildPdf(files, pageMode, margin, onP){
  const enc = new TextEncoder(); const chunks = []; const offs = []; let pos = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const obj = (n, body) => { offs[n] = pos; push(n + " 0 obj\n"); push(body); push("\nendobj\n"); };
  const pages = []; const imgs = [];
  for(let i = 0; i < files.length; i++){
    if(onP) onP(i);
    const c = await ftDraw(files[i], 4000, true); const blob = await ftToBlob(c, "image/jpeg", 0.88); const bytes = new Uint8Array(await blob.arrayBuffer());
    imgs.push({w: c.width, h: c.height, bytes});
  }
  // 1=catalog 2=pages ; 画像ごとに 3 つ（page, contents, image）
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const kids = [];
  imgs.forEach((im, i) => {
    const base = 3 + i * 3; kids.push(base + " 0 R");
    let pw, ph, dw, dh, x, y;
    if(pageMode === "fit"){ pw = im.w * 0.75; ph = im.h * 0.75; dw = pw; dh = ph; x = 0; y = 0; }
    else{
      const land = pageMode === "a4l" || (pageMode === "a4auto" && im.w > im.h);
      pw = land ? 841.89 : 595.28; ph = land ? 595.28 : 841.89;
      const m = margin, aw = pw - m * 2, ah = ph - m * 2, k = Math.min(aw / im.w, ah / im.h);
      dw = im.w * k; dh = im.h * k; x = (pw - dw) / 2; y = (ph - dh) / 2;
    }
    obj(base, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw.toFixed(2) + " " + ph.toFixed(2) + "] /Resources << /XObject << /Im0 " + (base + 2) + " 0 R >> >> /Contents " + (base + 1) + " 0 R >>");
    const cs = "q " + dw.toFixed(2) + " 0 0 " + dh.toFixed(2) + " " + x.toFixed(2) + " " + y.toFixed(2) + " cm /Im0 Do Q";
    obj(base + 1, "<< /Length " + cs.length + " >>\nstream\n" + cs + "\nendstream");
    offs[base + 2] = pos; push((base + 2) + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.bytes.length + " >>\nstream\n"); push(im.bytes); push("\nendstream\nendobj\n");
  });
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); obj(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + imgs.length + " >>");
  const n = 3 + imgs.length * 3; const xref = pos;
  let x = "xref\n0 " + n + "\n0000000000 65535 f \n"; for(let i = 1; i < n; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
  push(x + "trailer\n<< /Size " + n + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
  return new Blob(chunks, {type: "application/pdf"});
}
ftPainters.img2pdf = (s) => {
  s.mode = s.mode || "a4auto";
  return ftPick("img2pdf", "add", "🖼️ 画像を選ぶ（いくつでも）", "image/*", true) +
    (s.files.length ? '<div style="' + ftListStyle + '">' + s.files.map((f, i) => ftRow((i + 1) + ". " + escapeHtml(f.name), ftBtn("img2pdf", "up:" + i, "↑", {sub:1, dis: i === 0}) + ftBtn("img2pdf", "dn:" + i, "↓", {sub:1, dis: i === s.files.length - 1}) + ftBtn("img2pdf", "rm:" + i, "✕", {sub:1}))).join("") + '</div>' : '<div class="empty-list">画像を選ぶと ここに並びます（上から順にPDFのページになります）。</div>') +
    '<label>ページの大きさ ' + ftSel("img2pdf", "mode", s.mode, [["a4auto", "A4（画像の向きに合わせる）"], ["a4p", "A4 たて"], ["a4l", "A4 よこ"], ["fit", "画像の大きさに合わせる"]]) + '</label>' + ftMsgHtml(s.msg) +
    '<div class="row">' + ftBtn("img2pdf", "run", s.busy ? "作っています…" : "PDFにして保存", {dis: !s.files.length || s.busy}) + '</div>';
};
ftActs.img2pdf = async (a, node, s) => {
  const arg = Number(String(node.dataset.t).split(":")[2]);
  if(a === "add"){ ftAdd(s, node.files, ftIsImg); node.value = ""; }
  else if(a === "rm") s.files.splice(arg, 1);
  else if(a === "up" && arg > 0){ const t = s.files[arg]; s.files[arg] = s.files[arg - 1]; s.files[arg - 1] = t; }
  else if(a === "dn" && arg < s.files.length - 1){ const t = s.files[arg]; s.files[arg] = s.files[arg + 1]; s.files[arg + 1] = t; }
  else if(a === "mode") s.mode = node.value;
  else if(a === "run"){
    s.busy = true; s.msg = "作っています…"; ftPaint();
    try{ const blob = await ftBuildPdf(s.files, s.mode, 24, (i) => { s.msg = "作っています… " + (i + 1) + "/" + s.files.length; }); ftSave(blob, (s.files.length === 1 ? ftBase(s.files[0].name) : "画像まとめ") + ".pdf"); s.msg = "PDFを保存しました（" + s.files.length + "ページ・" + ftSize(blob.size) + "）。"; }
    catch(e){ s.msg = escapeHtml(ftErr(e)); }
    s.busy = false;
  }
  ftPaint();
};

// ---------- 3. PDF 結合・抜き出し・分割・回転 ----------
function ftLoadPdfLib(){
  if(window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "./vendor/lazy/pdf-lib.min.js"; sc.onload = () => window.PDFLib ? res(window.PDFLib) : rej(new Error("ft_pdf")); sc.onerror = () => rej(new Error("PDF機能の読み込みに失敗しました。ネットワークを確認してください。")); document.head.appendChild(sc); });
}
async function ftOpenPdf(file){ const L = await ftLoadPdfLib(); try{ return await L.PDFDocument.load(new Uint8Array(await file.arrayBuffer())); }catch(e){ throw new Error(/encrypt/i.test(String(e && e.message)) ? "ft_pdf_enc" : "ft_pdf"); } }
function ftParseRange(text, n){
  const out = []; for(const part of String(text).replace(/[、，]/g, ",").replace(/[ー−～〜]/g, "-").split(",")){
    const t = part.trim(); if(!t) continue; const m = /^(\d+)(?:-(\d+))?$/.exec(t); if(!m) return null;
    let a = Number(m[1]), b = m[2] ? Number(m[2]) : a; if(a < 1 || b < 1 || a > n || b > n) return null; if(a > b){ const x = a; a = b; b = x; }
    for(let i = a; i <= b; i++) out.push(i - 1);
  } return out.length ? out : null;
}
ftPainters.pdf = (s) => {
  s.mode = s.mode || "merge"; s.pages = s.pages || {};
  const tabs = '<div class="row" style="justify-content:flex-start">' + [["merge", "結合"], ["extract", "ページを抜き出す"], ["each", "1ページずつに分ける"], ["rotate", "回転"]].map((t) => ftBtn("pdf", "mode:" + t[0], t[1], {sub: s.mode !== t[0]})).join("") + '</div>';
  const multi = s.mode === "merge";
  const list = s.files.length ? '<div style="' + ftListStyle + '">' + s.files.map((f, i) => ftRow((multi ? (i + 1) + ". " : "") + escapeHtml(f.name) + ' <span class="meta">' + (s.pages[f.name + f.size] ? s.pages[f.name + f.size] + "ページ・" : "") + ftSize(f.size) + '</span>', (multi ? ftBtn("pdf", "up:" + i, "↑", {sub:1, dis: i === 0}) + ftBtn("pdf", "dn:" + i, "↓", {sub:1, dis: i === s.files.length - 1}) : "") + ftBtn("pdf", "rm:" + i, "✕", {sub:1}))).join("") + '</div>' : '<div class="empty-list">PDFを選んでください。</div>';
  let opt = "";
  if(s.mode === "extract") opt = '<label>取り出すページ（例：1-3,5,8-10）<input id="pdfRange" type="text" value="' + escapeHtml(s.range || "") + '" data-live="1" data-t="pdf:range" autocomplete="off"></label>';
  if(s.mode === "rotate") opt = '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><label>角度 ' + ftSel("pdf", "angle", s.angle || 90, [[90, "右に90°"], [180, "180°"], [270, "左に90°"]]) + '</label><label>ページ（空欄＝ぜんぶ）<input id="pdfRange" type="text" value="' + escapeHtml(s.range || "") + '" data-live="1" data-t="pdf:range" placeholder="例：2,4-6" autocomplete="off" style="width:9em"></label></div>';
  const label = {merge: "結合して保存", extract: "抜き出して保存", each: "ZIPで保存", rotate: "回転して保存"}[s.mode];
  return tabs + ftPick("pdf", "add", "📄 PDFを選ぶ" + (multi ? "（いくつでも）" : ""), "application/pdf,.pdf", multi) + list + opt + ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("pdf", "run", s.busy ? "処理中…" : label, {dis: !s.files.length || s.busy || (multi && s.files.length < 2)}) + '</div>';
};
ftActs.pdf = async (a, node, s) => {
  const arg = String(node.dataset.t).split(":")[2];
  if(a === "mode"){ s.mode = arg; if(arg !== "merge" && s.files.length > 1) s.files = s.files.slice(0, 1); s.msg = ""; }
  else if(a === "add"){
    const picked = Array.from(node.files).filter(ftIsPdf); node.value = "";
    if(s.mode !== "merge") s.files = []; ftAdd(s, picked, ftIsPdf); if(s.mode !== "merge") s.files = s.files.slice(0, 1);
    for(const f of s.files){ const k = f.name + f.size; if(!s.pages[k]){ try{ s.pages[k] = (await ftOpenPdf(f)).getPageCount(); }catch(e){ s.msg = escapeHtml(f.name + "：" + ftErr(e)); s.files = s.files.filter((x) => x !== f); } } }
  }
  else if(a === "rm") s.files.splice(Number(arg), 1);
  else if(a === "up" || a === "dn"){ const i = Number(arg), j = a === "up" ? i - 1 : i + 1; if(s.files[j]){ const t = s.files[i]; s.files[i] = s.files[j]; s.files[j] = t; } }
  else if(a === "range"){ s.range = node.value; return; }
  else if(a === "angle"){ s.angle = ftNum(node.value, 90); return; }
  else if(a === "run"){
    s.busy = true; s.msg = "処理中…"; ftPaint();
    try{
      const L = await ftLoadPdfLib();
      if(s.mode === "merge"){
        const out = await L.PDFDocument.create();
        for(const f of s.files){ const d = await ftOpenPdf(f); const pgs = await out.copyPages(d, d.getPageIndices()); pgs.forEach((p) => out.addPage(p)); }
        ftSave(new Blob([await out.save()], {type: "application/pdf"}), "結合.pdf"); s.msg = "結合して保存しました（" + out.getPageCount() + "ページ）。";
      }else{
        const f = s.files[0]; const d = await ftOpenPdf(f); const n = d.getPageCount();
        if(s.mode === "extract"){
          const idx = ftParseRange(s.range, n); if(!idx) throw new Error("ページの指定が正しくありません（1〜" + n + " の範囲で、例：1-3,5）。");
          const out = await L.PDFDocument.create(); (await out.copyPages(d, idx)).forEach((p) => out.addPage(p));
          ftSave(new Blob([await out.save()], {type: "application/pdf"}), ftBase(f.name) + "_抜き出し.pdf"); s.msg = idx.length + "ページを取り出して保存しました。";
        }else if(s.mode === "each"){
          if(n > 300) throw new Error("ページ数が多すぎます（300ページまで）。");
          const items = []; for(let i = 0; i < n; i++){ const out = await L.PDFDocument.create(); (await out.copyPages(d, [i])).forEach((p) => out.addPage(p)); items.push({name: ftBase(f.name) + "_" + String(i + 1).padStart(3, "0") + ".pdf", blob: new Blob([await out.save()], {type: "application/pdf"})}); s.msg = "分けています… " + (i + 1) + "/" + n; }
          await ftSaveZip(items, ftBase(f.name) + "_分割.zip"); s.msg = n + "ページに分けて、ZIPで保存しました。";
        }else{
          const idx = s.range && s.range.trim() ? ftParseRange(s.range, n) : d.getPageIndices(); if(!idx) throw new Error("ページの指定が正しくありません（1〜" + n + " の範囲で、例：2,4-6）。");
          const ang = ftNum(s.angle, 90); idx.forEach((i) => { const p = d.getPage(i); p.setRotation(L.degrees((p.getRotation().angle + ang) % 360)); });
          ftSave(new Blob([await d.save()], {type: "application/pdf"}), ftBase(f.name) + "_回転.pdf"); s.msg = idx.length + "ページを回転して保存しました。";
        }
      }
    }catch(e){ s.msg = escapeHtml(ftErr(e)); }
    s.busy = false;
  }
  ftPaint();
};

// ---------- 4. 写真の位置情報・撮影情報を消す ----------
function ftExifInfo(buf){
  const out = {gps: false, camera: false, date: false, has: false};
  try{
    const dv = new DataView(buf); if(dv.getUint16(0) !== 0xFFD8) return out;
    let p = 2;
    while(p + 4 < dv.byteLength){
      const m = dv.getUint16(p); if(m === 0xFFDA || m < 0xFF00) break; const len = dv.getUint16(p + 2);
      if(m === 0xFFE1 && dv.getUint32(p + 4) === 0x45786966){
        const t = p + 10, le = dv.getUint16(t) === 0x4949; const u16 = (o) => dv.getUint16(t + o, le), u32 = (o) => dv.getUint32(t + o, le);
        const walk = (off, depth) => { const n = u16(off); for(let i = 0; i < n; i++){ const tag = u16(off + 2 + i * 12); if(tag === 0x8825) out.gps = true; if(tag === 0x010F || tag === 0x0110) out.camera = true; if(tag === 0x9003 || tag === 0x0132) out.date = true; if(tag === 0x8769 && depth < 1) walk(u32(off + 2 + i * 12 + 8), depth + 1); } };
        walk(u32(4), 0); out.has = true; break;
      }
      p += 2 + len;
    }
  }catch(_e){}
  return out;
}
ftPainters.exif = (s) => {
  s.info = s.info || {};
  return ftPick("exif", "add", "📷 写真を選ぶ（いくつでも）", "image/*", true) +
    (s.files.length ? '<div style="' + ftListStyle + '">' + s.files.map((f, i) => { const x = s.info[f.name + f.size]; return ftRow(escapeHtml(f.name) + ' <span class="meta">' + ftSize(f.size) + (x ? (x.gps ? "・⚠️位置情報あり" : "") + (x.camera ? "・機種情報あり" : "") + (x.date ? "・撮影日時あり" : "") + (!x.has ? "・情報なし" : (!x.gps && !x.camera && !x.date ? "・その他の情報あり" : "")) : "") + '</span>', ftBtn("exif", "rm:" + i, "✕", {sub:1})); }).join("") + '</div>' : '<div class="empty-list">写真を選ぶと、位置情報などが入っているか 調べます。</div>') +
    '<div class="meta">SNSやチャットに写真を載せる前に。画像を作り直して、位置情報・撮影日時・カメラ機種などを取りのぞきます（画質はほぼ変わりません。向きは正しくなおします）。</div>' + ftMsgHtml(s.msg) +
    '<div class="row">' + ftBtn("exif", "run", s.busy ? "処理中…" : "情報を消して保存", {dis: !s.files.length || s.busy}) + '</div>';
};
ftActs.exif = async (a, node, s) => {
  const arg = Number(String(node.dataset.t).split(":")[2]);
  if(a === "add"){ ftAdd(s, node.files, ftIsImg); node.value = ""; for(const f of s.files){ const k = f.name + f.size; if(!s.info[k]){ try{ s.info[k] = ftExifInfo(await f.slice(0, 262144).arrayBuffer()); }catch(_e){ s.info[k] = {}; } } } }
  else if(a === "rm") s.files.splice(arg, 1);
  else if(a === "run"){
    s.busy = true; ftPaint(); const items = []; let fail = 0; const names = ftUniq(s.files.map((f) => ftBase(f.name) + "_clean." + (/png/i.test(f.type) ? "png" : /webp/i.test(f.type) ? "webp" : "jpg")));
    for(let i = 0; i < s.files.length; i++){ const f = s.files[i]; try{ const type = /png/i.test(f.type) ? "image/png" : /webp/i.test(f.type) ? "image/webp" : "image/jpeg"; const c = await ftDraw(f, 0, type === "image/jpeg"); items.push({name: names[i], blob: await ftToBlob(c, type, 0.95)}); }catch(_e){ fail++; } }
    try{ if(items.length === 1) ftSave(items[0].blob, items[0].name); else if(items.length) await ftSaveZip(items, "写真_情報なし.zip"); s.msg = items.length + "枚の情報を消して保存しました" + (fail ? "（" + fail + "枚は読めませんでした）" : "。"); }catch(e){ s.msg = escapeHtml(ftErr(e)); }
    s.busy = false;
  }
  ftPaint();
};

// ---------- 5. ファイル照合（ハッシュ値） ----------
const FT_HASH = [["SHA-256", "SHA-256"], ["SHA-1", "SHA-1"], ["SHA-384", "SHA-384"], ["SHA-512", "SHA-512"]];
ftPainters.hash = (s) => {
  s.res = s.res || []; s.cmp = s.cmp || "";
  const want = String(s.cmp).replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  return ftPick("hash", "add", "🔐 ファイルを選ぶ（いくつでも）", "", true) +
    (s.res.length ? '<div style="' + ftListStyle + '">' + s.res.map((r) => '<div class="admin-card" style="word-break:break-all"><b>' + escapeHtml(r.name) + '</b> <span class="meta">' + ftSize(r.size) + '</span>' + FT_HASH.map((h) => { const v = r.h[h[0]]; const ok = want && v === want; return '<div style="font-family:monospace;font-size:12px"><span class="meta">' + h[0] + '</span> ' + v + (ok ? ' <b>✅ 一致</b>' : "") + '</div>'; }).join("") + '</div>').join("") + '</div>' : '<div class="empty-list">ファイルを選ぶと、指紋（ハッシュ値）を計算します。配布元が公開している値と合えば、こわれていない・すりかわっていない ことが確かめられます。</div>') +
    '<label>照合したい値（配布元のハッシュを貼る）<input id="hashCmp" type="text" value="' + escapeHtml(s.cmp) + '" data-live="1" data-t="hash:cmp" autocomplete="off" placeholder="例：e3b0c442…"></label>' +
    (want && s.res.length ? '<div class="meta">' + (s.res.some((r) => FT_HASH.some((h) => r.h[h[0]] === want)) ? "✅ どれかのファイルと一致しました。" : "❌ 一致するファイルはありません。") + '</div>' : "") + ftMsgHtml(s.msg) +
    '<div class="meta">※MD5には対応していません（安全でないため）。</div>';
};
ftActs.hash = async (a, node, s) => {
  if(a === "cmp"){ s.cmp = node.value; ftPaint(); const i = ftBox("hashCmp"); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } return; }
  if(a === "add"){
    const list = Array.from(node.files); node.value = ""; s.res = []; s.msg = "計算中…"; ftPaint();
    for(const f of list){
      if(f.size > FT_MAX){ s.res.push({name: f.name, size: f.size, h: Object.fromEntries(FT_HASH.map((h) => [h[0], "（大きすぎて計算できません）"]))}); continue; }
      const buf = await f.arrayBuffer(); const h = {};
      for(const [alg] of FT_HASH) h[alg] = Array.from(new Uint8Array(await crypto.subtle.digest(alg, buf)), (b) => b.toString(16).padStart(2, "0")).join("");
      s.res.push({name: f.name, size: f.size, h});
    }
    s.msg = "";
  }
  ftPaint();
};

// ---------- 6. ファイル名まとめて変更 ----------
function ftRenamePlan(s){
  const o = s.o || {}; const files = s.files; const start = ftNum(o.start, 1), digits = Math.max(1, Math.min(8, ftNum(o.digits, 3)));
  const today = new Date(), ymd = today.getFullYear() + String(today.getMonth() + 1).padStart(2, "0") + String(today.getDate()).padStart(2, "0");
  const pat = o.pattern || "{name}";
  const names = files.map((f, i) => {
    let base = ftBase(f.name); const ext = ftExt(f.name);
    if(o.find) base = base.split(o.find).join(o.repl || "");
    let n = pat.split("{name}").join(base).split("{n}").join(String(start + i).padStart(digits, "0")).split("{date}").join(ymd);
    if(o.case === "lower") n = n.toLowerCase(); else if(o.case === "upper") n = n.toUpperCase();
    n = n.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_").trim() || "file";
    return n + (ext ? "." + (o.case === "lower" ? ext : o.case === "upper" ? ext.toUpperCase() : ftExt(f.name) ? f.name.slice(f.name.lastIndexOf(".") + 1) : ext) : "");
  });
  return ftUniq(names);
}
ftPainters.rename = (s) => {
  s.o = s.o || {pattern: "{name}", start: 1, digits: 3, case: ""}; const plan = ftRenamePlan(s);
  const inp = (k, label, extra) => '<label>' + label + '<input type="text" value="' + escapeHtml(s.o[k] == null ? "" : s.o[k]) + '" data-live="1" data-t="rename:o:' + k + '" autocomplete="off" ' + (extra || "") + '></label>';
  return ftPick("rename", "add", "📄 ファイルを選ぶ（いくつでも）", "", true) +
    inp("pattern", "新しい名前の形（{name}＝もとの名前 {n}＝連番 {date}＝今日の日付）", 'placeholder="例：旅行_{n}"') +
    '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap">' + inp("find", "さがす文字", 'style="width:8em"') + inp("repl", "おきかえ", 'style="width:8em"') + inp("start", "連番の開始", 'style="width:5em" inputmode="numeric"') + inp("digits", "桁数", 'style="width:4em" inputmode="numeric"') + '<label>大文字小文字 ' + ftSel("rename", "case", s.o.case, [["", "そのまま"], ["lower", "小文字に"], ["upper", "大文字に"]]) + '</label></div>' +
    (s.files.length ? '<div style="' + ftListStyle + '">' + s.files.map((f, i) => ftRow(escapeHtml(f.name) + ' → <b>' + escapeHtml(plan[i]) + '</b>', ftBtn("rename", "rm:" + i, "✕", {sub:1}))).join("") + '</div>' : '<div class="empty-list">ファイルを選ぶと、変更後の名前を ここで確認できます。</div>') +
    ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("rename", "run", s.busy ? "処理中…" : "名前を変えてZIPで保存", {dis: !s.files.length || s.busy}) + '</div><div class="meta">※ブラウザの安全のため、もとのファイルは変わりません。新しい名前の ZIP ができます。</div>';
};
ftActs.rename = async (a, node, s) => {
  const parts = String(node.dataset.t).split(":");
  if(a === "add"){ ftAdd(s, node.files); node.value = ""; }
  else if(a === "rm") s.files.splice(Number(parts[2]), 1);
  else if(a === "case"){ s.o.case = node.value; }
  else if(a === "o"){ s.o[parts[2]] = node.value; const act = node; ftPaint(); const again = ftBox("ftBody").querySelector('[data-t="rename:o:' + parts[2] + '"]'); if(again){ again.focus(); again.setSelectionRange(again.value.length, again.value.length); } return; }
  else if(a === "run"){
    s.busy = true; ftPaint();
    try{ const plan = ftRenamePlan(s); await ftSaveZip(s.files.map((f, i) => ({name: plan[i], blob: f})), "名前変更.zip"); s.msg = s.files.length + "個の名前を変えて、ZIPで保存しました。"; }catch(e){ s.msg = escapeHtml(ftErr(e)); }
    s.busy = false;
  }
  ftPaint();
};

// ---------- 7. 文字化けなおし・改行変換 ----------
const FT_ENC = [["auto", "自動で判定"], ["utf-8", "UTF-8"], ["shift_jis", "Shift_JIS（Windows日本語）"], ["euc-jp", "EUC-JP"], ["utf-16le", "UTF-16（LE）"], ["utf-16be", "UTF-16（BE）"], ["iso-2022-jp", "ISO-2022-JP（JIS）"], ["windows-1252", "西欧（Windows-1252）"]];
function ftDecode(bytes, enc){
  if(enc === "auto"){
    if(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return {text: new TextDecoder("utf-8").decode(bytes.subarray(3)), enc: "UTF-8（BOMあり）"};
    if(bytes[0] === 0xFF && bytes[1] === 0xFE) return {text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), enc: "UTF-16LE"};
    if(bytes[0] === 0xFE && bytes[1] === 0xFF) return {text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), enc: "UTF-16BE"};
    if(!bytes.includes(0x1B)){ try{ return {text: new TextDecoder("utf-8", {fatal: true}).decode(bytes), enc: "UTF-8"}; }catch(_e){} }
    for(const e of ["iso-2022-jp", "shift_jis", "euc-jp"]){ if(e === "iso-2022-jp" && !bytes.includes(0x1B)) continue; try{ return {text: new TextDecoder(e, {fatal: true}).decode(bytes), enc: e === "shift_jis" ? "Shift_JIS" : e === "euc-jp" ? "EUC-JP" : "ISO-2022-JP"}; }catch(_e){} }
    return {text: new TextDecoder("windows-1252").decode(bytes), enc: "Windows-1252（推測）"};
  }
  let b = bytes; if(enc === "utf-8" && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
  return {text: new TextDecoder(enc).decode(b), enc: (FT_ENC.find((x) => x[0] === enc) || [0, enc])[1]};
}
ftPainters.textfix = (s) => {
  s.enc = s.enc || "auto"; s.eol = s.eol || "keep"; s.text = s.text == null ? "" : s.text;
  const shown = s.bytes ? ftDecode(s.bytes, s.enc) : null; if(shown) s.text = shown.text;
  return ftPick("textfix", "add", "📝 テキストファイルを選ぶ", ".txt,.csv,.tsv,.log,.md,.json,.xml,.html,.htm,.srt,.ini,text/*", false) +
    '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><label>もとの文字コード ' + ftSel("textfix", "enc", s.enc, FT_ENC) + '</label><label>改行 ' + ftSel("textfix", "eol", s.eol, [["keep", "そのまま"], ["lf", "LF（Mac・Linux）"], ["crlf", "CRLF（Windows）"]]) + '</label><label><input type="checkbox" data-t="textfix:bom"' + (s.bom ? " checked" : "") + '> BOM付きで保存（Excelで開く用）</label></div>' +
    (s.bytes ? '<div class="meta">' + escapeHtml(s.name) + '（' + ftSize(s.bytes.length) + '）・判定：' + escapeHtml(shown.enc) + '</div><textarea readonly rows="8" style="width:100%;font-family:monospace;font-size:12px">' + escapeHtml(s.text.slice(0, 3000)) + (s.text.length > 3000 ? "\n…（先頭の3000文字だけ表示）" : "") + '</textarea>' : '<div class="empty-list">ファイルを選ぶと、文字化けをなおして UTF-8 にします。ためしに別の文字コードを選ぶと、読めるようになることがあります。</div>') +
    ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("textfix", "run", "UTF-8で保存", {dis: !s.bytes}) + ftBtn("textfix", "copy", "コピー", {sub:1, dis: !s.bytes}) + '</div>';
};
function ftFixText(s){ let t = s.text; if(s.eol !== "keep"){ t = t.replace(/\r\n?|\n/g, "\n"); if(s.eol === "crlf") t = t.replace(/\n/g, "\r\n"); } return t; }
ftActs.textfix = async (a, node, s) => {
  if(a === "add"){ const f = node.files[0]; node.value = ""; if(!f) return; if(f.size > 50 * 1024 * 1024){ s.msg = "大きすぎます（50MBまで）。"; } else{ s.bytes = new Uint8Array(await f.arrayBuffer()); s.name = f.name; s.msg = ""; } }
  else if(a === "enc") s.enc = node.value; else if(a === "eol") s.eol = node.value; else if(a === "bom") s.bom = node.checked;
  else if(a === "run"){ const t = ftFixText(s); ftSave(new Blob([s.bom ? "﻿" : "", t], {type: "text/plain;charset=utf-8"}), ftBase(s.name) + "_utf8." + (ftExt(s.name) || "txt")); s.msg = "UTF-8で保存しました。"; }
  else if(a === "copy"){ try{ await navigator.clipboard.writeText(ftFixText(s)); s.msg = "コピーしました。"; }catch(_e){ s.msg = "コピーできませんでした。"; } }
  ftPaint();
};

// ---------- 8. CSV → JSON / TSV / 表 ----------
function ftParseCsv(text, delim){
  const rows = []; let row = [], cell = "", q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; } else cell += c; }
    else if(c === '"' && cell === "") q = true;
    else if(c === delim){ row.push(cell); cell = ""; }
    else if(c === "\n" || c === "\r"){ if(c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if(cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
function ftGuessDelim(t){ const head = t.split(/\r?\n/).slice(0, 5).join("\n"); const cnt = (d) => head.split(d).length - 1; return [["\t", cnt("\t")], [",", cnt(",")], [";", cnt(";")]].sort((a, b) => b[1] - a[1])[0][0]; }
ftPainters.csv = (s) => {
  s.hdr = s.hdr !== false; s.delim = s.delim || "auto";
  let table = "";
  if(s.text){
    const d = s.delim === "auto" ? ftGuessDelim(s.text) : s.delim; s.rows = ftParseCsv(s.text, d);
    const rows = s.rows, cols = Math.max(0, ...rows.map((r) => r.length));
    table = '<div class="meta">' + rows.length + '行 × ' + cols + '列（区切り：' + (d === "\t" ? "タブ" : d === "," ? "カンマ" : "セミコロン") + '）</div><div style="overflow:auto;max-height:36vh"><table style="border-collapse:collapse;font-size:12px">' + rows.slice(0, 60).map((r, i) => '<tr>' + Array.from({length: cols}, (_, j) => (i === 0 && s.hdr ? "<th" : "<td") + ' style="border:1px solid rgba(128,128,128,.35);padding:2px 6px;white-space:nowrap">' + escapeHtml(r[j] == null ? "" : r[j]) + (i === 0 && s.hdr ? "</th>" : "</td>")).join("") + '</tr>').join("") + '</table></div>' + (rows.length > 60 ? '<div class="meta">先頭の60行だけ表示しています（保存は全部）。</div>' : "");
  }
  return ftPick("csv", "add", "📊 CSVを選ぶ", ".csv,.tsv,.txt,text/csv", false) + '<textarea id="csvText" rows="3" placeholder="またはここにCSVを貼りつけ" data-live="1" data-t="csv:text" style="width:100%">' + escapeHtml(s.text || "") + '</textarea>' +
    '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><label>区切り ' + ftSel("csv", "delim", s.delim, [["auto", "自動"], [",", "カンマ"], ["\t", "タブ"], [";", "セミコロン"]]) + '</label><label><input type="checkbox" data-t="csv:hdr"' + (s.hdr ? " checked" : "") + '> 1行目は見出し</label></div>' + table + ftMsgHtml(s.msg) +
    '<div class="row">' + ftBtn("csv", "json", "JSONで保存", {dis: !s.text}) + ftBtn("csv", "tsv", "TSVで保存", {sub:1, dis: !s.text}) + ftBtn("csv", "xl", "Excel用CSV(BOM付き)", {sub:1, dis: !s.text}) + '</div>';
};
ftActs.csv = async (a, node, s) => {
  if(a === "add"){ const f = node.files[0]; node.value = ""; if(!f) return; if(f.size > 30 * 1024 * 1024){ s.msg = "大きすぎます（30MBまで）。"; } else{ const r = ftDecode(new Uint8Array(await f.arrayBuffer()), "auto"); s.text = r.text.replace(/^﻿/, ""); s.name = f.name; s.msg = ""; } }
  else if(a === "text"){ s.text = node.value; s.name = s.name || "data.csv"; const keep = node.selectionStart; ftPaint(); const t = ftBox("csvText"); if(t){ t.focus(); t.setSelectionRange(keep, keep); } return; }
  else if(a === "delim") s.delim = node.value; else if(a === "hdr") s.hdr = node.checked;
  else if(s.rows){
    const base = ftBase(s.name || "data");
    if(a === "json"){
      let data; if(s.hdr && s.rows.length){ const h = s.rows[0].map((x, i) => x || "列" + (i + 1)); data = s.rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] == null ? "" : r[i]]))); } else data = s.rows;
      ftSave(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"}), base + ".json"); s.msg = "JSONで保存しました（" + data.length + "件）。";
    }else if(a === "tsv"){ ftSave(new Blob([s.rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n")], {type: "text/tab-separated-values;charset=utf-8"}), base + ".tsv"); s.msg = "TSVで保存しました。"; }
    else if(a === "xl"){ ftSave(new Blob(["﻿", s.rows.map((r) => r.map((c) => /[",\r\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(",")).join("\r\n")], {type: "text/csv;charset=utf-8"}), base + "_excel.csv"); s.msg = "Excel用のCSVで保存しました。"; }
  }
  ftPaint();
};

// ---------- 9. 動画から静止画を切り出す ----------
ftPainters.vframe = (s) => {
  return ftPick("vframe", "add", "🎞️ 動画を選ぶ", "video/*", false) + (s.url ? '<video id="vfVideo" src="' + s.url + '" controls playsinline preload="auto" style="width:100%;max-height:42vh;background:#000;border-radius:10px"></video>' +
    '<input id="vfRange" type="range" min="0" max="1000" value="0" data-t="vframe:seek" style="width:100%"><div class="row" style="justify-content:flex-start;gap:6px;flex-wrap:wrap">' + ftBtn("vframe", "back", "◀ 1コマ", {sub:1}) + ftBtn("vframe", "fwd", "1コマ ▶", {sub:1}) + '<label>形式 ' + ftSel("vframe", "fmt", s.fmt || "image/png", [["image/png", "PNG（きれい）"], ["image/jpeg", "JPEG（軽い）"]]) + '</label></div>' +
    ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("vframe", "save", "この場面を画像で保存") + '</div>' : '<div class="empty-list">動画を選んで、止めたい場面を決めて保存します。スライダーや「1コマ」ボタンで細かく動かせます。</div>' + ftMsgHtml(s.msg));
};
ftActs.vframe = async (a, node, s) => {
  const v = ftBox("vfVideo");
  if(a === "add"){ const f = node.files[0]; node.value = ""; if(!f) return; if(s.url) URL.revokeObjectURL(s.url); s.url = URL.createObjectURL(f); s.name = f.name; s.msg = ""; ftPaint(); return; }
  if(a === "fmt"){ s.fmt = node.value; return; }
  if(!v) return;
  if(a === "seek"){ v.pause(); if(Number.isFinite(v.duration)) v.currentTime = v.duration * ftNum(node.value, 0) / 1000; return; }
  if(a === "back" || a === "fwd"){ v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + (a === "fwd" ? 1 : -1) / 30)); return; }
  if(a === "save"){
    try{
      v.pause(); if(!v.videoWidth) throw new Error("動画を読み込めていません。");
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
      const fmt = s.fmt || "image/png"; const blob = await ftToBlob(c, fmt, 0.92); const t = v.currentTime.toFixed(2).replace(".", "-");
      ftSave(blob, ftBase(s.name) + "_" + t + "s." + (fmt === "image/png" ? "png" : "jpg")); s.msg = "保存しました（" + c.width + "×" + c.height + "・" + ftSize(blob.size) + "）。";
    }catch(e){ s.msg = escapeHtml(String(e.message || e)); }
    const m = ftBox("ftBody").querySelector(".meta[role=status]"); if(m) m.textContent = s.msg; else { const keep = v.currentTime; ftPaint(); const nv = ftBox("vfVideo"); if(nv) nv.currentTime = keep; }
  }
};

// ---------- 10. 大きいファイルの分割・結合 ----------
ftPainters.fsplit = (s) => {
  s.mode = s.mode || "cut"; s.mb = s.mb || 20;
  const tabs = '<div class="row" style="justify-content:flex-start">' + ftBtn("fsplit", "mode:cut", "分割する", {sub: s.mode !== "cut"}) + ftBtn("fsplit", "mode:join", "もとに戻す（結合）", {sub: s.mode !== "join"}) + '</div>';
  if(s.mode === "cut"){
    const f = s.files[0]; const n = f ? Math.ceil(f.size / (s.mb * 1048576)) : 0;
    return tabs + ftPick("fsplit", "add", "📦 分割するファイルを選ぶ", "", false) + (f ? '<div class="meta">' + escapeHtml(f.name) + '（' + ftSize(f.size) + '）→ ' + n + '個に分けます</div>' : '<div class="empty-list">送れないほど大きいファイルを、小さく分けて送れます。受け取った側は「もとに戻す」で合体できます。</div>') +
      '<label>1つの大きさ ' + ftSel("fsplit", "mb", s.mb, [[5, "5MB"], [10, "10MB"], [20, "20MB"], [25, "25MB（メールの目安）"], [45, "45MB"]]) + '</label>' + ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("fsplit", "run", s.busy ? "処理中…" : "分割してZIPで保存", {dis: !f || s.busy || n < 2}) + '</div>' + (f && n < 2 ? '<div class="meta">このファイルは 分けるほど大きくありません。</div>' : "");
  }
  return tabs + ftPick("fsplit", "addparts", "📦 分割されたファイルを選ぶ（ぜんぶ）", "", true) + (s.files.length ? '<div style="' + ftListStyle + '">' + s.files.map((f) => ftRow(escapeHtml(f.name) + ' <span class="meta">' + ftSize(f.size) + '</span>')).join("") + '</div>' : '<div class="empty-list">「名前.part001」「名前.part002」…をぜんぶ選ぶと、1つのファイルに戻ります（順番は名前で自動に並べます）。</div>') + ftMsgHtml(s.msg) + '<div class="row">' + ftBtn("fsplit", "join", "1つに戻して保存", {dis: s.files.length < 2 || s.busy}) + '</div>';
};
ftActs.fsplit = async (a, node, s) => {
  if(a === "mode"){ s.mode = String(node.dataset.t).split(":")[2]; s.files = []; s.msg = ""; }
  else if(a === "add"){ s.files = []; ftAdd(s, node.files); node.value = ""; s.files = s.files.slice(0, 1); }
  else if(a === "addparts"){ s.files = []; ftAdd(s, node.files); node.value = ""; s.files.sort((x, y) => x.name.localeCompare(y.name, "ja", {numeric: true})); }
  else if(a === "mb") s.mb = ftNum(node.value, 20);
  else if(a === "run"){
    s.busy = true; ftPaint(); const f = s.files[0], size = s.mb * 1048576; const items = [];
    try{ for(let i = 0, o = 0; o < f.size; i++, o += size) items.push({name: f.name + ".part" + String(i + 1).padStart(3, "0"), blob: f.slice(o, o + size)}); await ftSaveZip(items, ftBase(f.name) + "_分割.zip"); s.msg = items.length + "個に分けて、ZIPで保存しました。受け取った側は、ZIPをほどいてから「もとに戻す」を使います。"; }catch(e){ s.msg = escapeHtml(ftErr(e)); }
    s.busy = false;
  }else if(a === "join"){
    s.busy = true; ftPaint();
    try{
      const first = s.files[0].name; const name = first.replace(/\.part0*1$/i, "").replace(/\.0*1$/, "") || "joined";
      ftSave(new Blob(s.files), name === first ? "結合" + (ftExt(first) ? "." + ftExt(first) : "") : name); s.msg = s.files.length + "個を1つにして保存しました。";
    }catch(e){ s.msg = escapeHtml(ftErr(e)); }
    s.busy = false;
  }
  ftPaint();
};

// ---------- 入口 ----------
function openImgc(){ ftOpenTool("imgc", "🖼️ 画像まとめて変換", "画像を小さく・サイズ変更・形式変換（まとめて）"); }
function openImg2pdf(){ ftOpenTool("img2pdf", "🧾 画像→PDF", "写真やスキャンを1つのPDFにまとめる"); }
function openPdfTool(){ ftOpenTool("pdf", "📕 PDFを操作", "結合・ページ抜き出し・1ページずつに分ける・回転"); }
function openExifClean(){ ftOpenTool("exif", "🛡️ 写真の位置情報を消す", "投稿・送信の前に、位置情報や撮影情報を取りのぞく"); }
function openHashTool(){ ftOpenTool("hash", "🔐 ファイル照合（ハッシュ）", "ダウンロードしたファイルが本物か確かめる"); }
function openRenameTool(){ ftOpenTool("rename", "🏷️ ファイル名まとめて変更", "連番・置きかえ・大文字小文字（ZIPで保存）"); }
function openTextFix(){ ftOpenTool("textfix", "🔤 文字化けなおし・改行変換", "Shift_JIS などの文字化けを UTF-8 にしてなおす"); }
function openCsvTool(){ ftOpenTool("csv", "📊 CSV変換・表示", "CSVを表で見る／JSON・TSV・Excel用に変換"); }
function openVideoFrame(){ ftOpenTool("vframe", "🎞️ 動画から静止画", "動画の好きな場面を、画像で保存"); }
function openSplitTool(){ ftOpenTool("fsplit", "📦 大きいファイルの分割・結合", "送れない大きさのファイルを分けて送る／もとに戻す"); }

function initFileTools(){
  for(const key of Object.keys(ftActs)){
    registerTool(key, async (action, node) => { const s = ftSt[key] = ftSt[key] || {files: [], msg: ""}; if(ftSt.cur !== key) return; await ftActs[key](action, node, s); });
  }
}
