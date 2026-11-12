"use strict";
// ===== ZIP 圧縮・解凍 =====
// ・ぜんぶ この端末の中で処理します（ファイルはサーバーに送りません）。
// ・ブラウザの CompressionStream / DecompressionStream を使います（外部ライブラリなし）。使えない古いブラウザでは「圧縮しない ZIP」を作り、解凍はできない旨を案内します。
// ・パスワード付き ZIP・ZIP64（4GB超）・分割 ZIP は 扱えません。

const ZIP_MAX_BYTES = 300 * 1024 * 1024;   // 圧縮前の合計 / ZIP ファイルの大きさの上限
const ZIP_MAX_UNPACKED = 600 * 1024 * 1024; // 解凍後の合計の上限（ZIP爆弾よけ）
const ZIP_MAX_ENTRIES = 2000;
const ZIP_STORE_EXT = /\.(zip|jpe?g|png|gif|webp|heic|mp3|m4a|aac|ogg|mp4|mov|m4v|webm|mkv|pdf|docx|xlsx|pptx|7z|rar|gz|bz2|xz)$/i;
const zipSt = {tab:"pack", files:[], name:"まとめ", zipName:"", entries:[], busy:false, msg:""};

let zipCrcTable = null;
function zipCrc32(bytes){
    if(!zipCrcTable){ zipCrcTable = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; zipCrcTable[n] = c >>> 0; } }
    let crc = 0xFFFFFFFF;
    for(let i = 0; i < bytes.length; i++) crc = zipCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const zipCanStream = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

async function zipStream(bytes, Ctor, format, limit){
    const out = new Blob([bytes]).stream().pipeThrough(new Ctor(format));
    const reader = out.getReader(); const chunks = []; let total = 0;
    for(;;){
        const r = await reader.read(); if(r.done) break;
        total += r.value.length;
        if(limit && total > limit){ try{ await reader.cancel(); }catch(_e){} throw new Error("zip_too_big"); }
        chunks.push(r.value);
    }
    const res = new Uint8Array(total); let o = 0; for(const c of chunks){ res.set(c, o); o += c.length; }
    return res;
}

function zipDosTime(ms){
    const d = new Date(Number.isFinite(ms) && ms > 315532800000 ? ms : Date.now());
    return {time:(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date:((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()};
}

/** [{path, file}] → ZIP の Blob */
async function zipBuild(items, onProgress){
    const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
    for(let idx = 0; idx < items.length; idx++){
        const {path, file} = items[idx];
        if(onProgress) onProgress(idx, items.length, path);
        const raw = new Uint8Array(await file.arrayBuffer());
        const crc = zipCrc32(raw);
        let method = 0, data = raw;
        if(raw.length > 64 && zipCanStream() && !ZIP_STORE_EXT.test(path)){
            try{ const def = await zipStream(raw, CompressionStream, "deflate-raw"); if(def.length < raw.length){ method = 8; data = def; } }catch(_e){}
        }
        const name = enc.encode(path); const t = zipDosTime(file.lastModified);
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
        lh.setUint16(10, t.time, true); lh.setUint16(12, t.date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
        parts.push(lh.buffer, name, data);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
        ch.setUint16(12, t.time, true); ch.setUint16(14, t.date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true);
        ch.setUint32(42, offset, true);
        central.push(ch.buffer, name);
        offset += 30 + name.length + data.length;
        if(offset > 0xF0000000) throw new Error("zip_too_big");
    }
    let csize = 0; for(let i = 0; i < central.length; i++) csize += central[i].byteLength !== undefined ? central[i].byteLength : central[i].length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, items.length, true); end.setUint16(10, items.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], {type:"application/zip"});
}

function zipDecodeName(bytes, utf8Flag){
    if(utf8Flag) return new TextDecoder("utf-8").decode(bytes);
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(bytes); }catch(_e){}
    try{ return new TextDecoder("shift_jis").decode(bytes); }catch(_e){}
    return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

/** ZIP の目次を読む（中身はまだ ほどかない） */
async function zipReadDirectory(file){
    const buf = new Uint8Array(await file.arrayBuffer()); const dv = new DataView(buf.buffer);
    let eocd = -1;
    for(let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--){ if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
    if(eocd < 0) throw new Error("zip_invalid");
    let count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    if(count === 0xFFFF || cdOff === 0xFFFFFFFF) throw new Error("zip_zip64");
    if(count > ZIP_MAX_ENTRIES) throw new Error("zip_many");
    const list = []; let p = cdOff, declared = 0;
    for(let n = 0; n < count; n++){
        if(p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip_invalid");
        const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
        const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
        const name = zipDecodeName(buf.subarray(p + 46, p + 46 + nlen), !!(flags & 0x800));
        declared += usize;
        if(declared > ZIP_MAX_UNPACKED) throw new Error("zip_bomb");
        list.push({name, flags, method, crc, csize, usize, lho, dir:/\/$/.test(name), enc:!!(flags & 1)});
        p += 46 + nlen + elen + clen;
    }
    return {buf, list};
}

async function zipExtractEntry(buf, e){
    const dv = new DataView(buf.buffer);
    if(e.enc) throw new Error("zip_encrypted");
    if(dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error("zip_invalid");
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const data = buf.subarray(start, start + e.csize);
    let out;
    if(e.method === 0) out = data;
    else if(e.method === 8){
        if(!zipCanStream()) throw new Error("zip_nostream");
        out = await zipStream(data, DecompressionStream, "deflate-raw", Math.max(e.usize, 1) + 1024);
    }else throw new Error("zip_method");
    if(zipCrc32(out) !== e.crc) throw new Error("zip_crc");
    return out;
}

/** ダウンロード名にしてよい形にする（フォルダ名・../ ・使えない文字をとりのぞく） */
function zipSafeFileName(path){
    const last = String(path).split(/[\\/]/).filter(Boolean).pop() || "file";
    return last.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_").slice(0, 120) || "file";
}
function zipSafePath(path){
    const segs = String(path).replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== "..");
    return segs.map((s) => s.replace(/[\u0000-\u001f]/g, "_")).join("/");
}

function zipErrText(error){
    const m = String(error && error.message || error);
    return ({zip_invalid:"ZIPファイルとして読めませんでした（こわれている可能性があります）。", zip_zip64:"4GBをこえる大きなZIP（ZIP64）には対応していません。", zip_many:"ファイルの数が多すぎます（" + ZIP_MAX_ENTRIES + "個まで）。", zip_bomb:"ほどくと大きくなりすぎるため、安全のため中止しました（" + formatAttachmentSize(ZIP_MAX_UNPACKED) + "まで）。", zip_encrypted:"パスワード付きのZIPは ほどけません。", zip_nostream:"このブラウザは ZIP の解凍に対応していません。新しいブラウザ（Chrome・Edge・Safari 16.4以上など）をお使いください。", zip_method:"この圧縮方式には対応していません。", zip_crc:"中身がこわれているようです（チェックが合いません）。", zip_too_big:"大きすぎるため中止しました。"})[m] || featError(error);
}

function openZip(){
    openSheet(toolHead("🗜️ ZIP 圧縮・解凍","ファイルをまとめて ZIP にしたり、ZIP をほどいたり。ぜんぶ この端末の中で処理します（サーバーには送りません）") + '<div id="zpBody"></div>' + toolClose());
    zipSt.msg = ""; zipPaint();
}

function zipTotal(){ return zipSt.files.reduce((s, f) => s + f.file.size, 0); }

function zipPaint(){
    const box = $("zpBody"); if(!box) return;
    const tabs = '<div class="row" style="justify-content:flex-start">' + [["pack","圧縮（ZIPにする）"],["open","解凍（ZIPをほどく）"]].map((t) => '<button type="button" class="' + (zipSt.tab === t[0] ? "button" : "button-secondary") + '" data-t="zp:tab:' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
    const msg = zipSt.msg ? '<div class="meta" id="zpMsg" role="status">' + zipSt.msg + '</div>' : "";
    if(zipSt.tab === "pack"){
        const rows = zipSt.files.map((f, i) => '<div class="row" style="justify-content:space-between;gap:6px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.path) + ' <span class="meta">' + formatAttachmentSize(f.file.size) + '</span></span><button type="button" class="button-secondary" data-t="zp:rm:' + i + '" aria-label="はずす">✕</button></div>').join("");
        box.innerHTML = tabs +
            '<div class="row"><label class="tool-button">📄 ファイルを選ぶ<input class="file-input" type="file" multiple data-t="zp:addfiles"></label><label class="tool-button">📁 フォルダを選ぶ<input class="file-input" type="file" webkitdirectory data-t="zp:addfolder"></label></div>' +
            (rows ? '<div style="max-height:34vh;overflow:auto;display:grid;gap:4px">' + rows + '</div><div class="meta">' + zipSt.files.length + '個・合計 ' + formatAttachmentSize(zipTotal()) + '（' + formatAttachmentSize(ZIP_MAX_BYTES) + 'まで）</div>' : '<div class="empty-list">ファイルを選ぶと ここに並びます。</div>') +
            '<label for="zpName">ZIPの名前</label><input id="zpName" type="text" maxlength="60" value="' + escapeHtml(zipSt.name) + '" data-live="1" data-t="zp:name" autocomplete="off">' +
            msg + '<div class="row"><button type="button" class="button-secondary" data-t="zp:clear"' + (zipSt.files.length ? "" : " disabled") + '>ぜんぶはずす</button><button type="button" class="button" data-t="zp:pack"' + (zipSt.files.length && !zipSt.busy ? "" : " disabled") + '>' + (zipSt.busy ? "作っています…" : "ZIPにして保存") + '</button></div>' +
            (zipCanStream() ? "" : '<div class="meta">※このブラウザでは、小さくせずに まとめるだけのZIPになります。</div>');
    }else{
        const files = zipSt.entries.filter((e) => !e.dir);
        const rows = files.map((e, i) => '<div class="row" style="justify-content:space-between;gap:6px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(zipSafePath(e.name)) + ' <span class="meta">' + formatAttachmentSize(e.usize) + (e.enc ? "・パスワード付き" : "") + '</span></span><button type="button" class="button-secondary" data-t="zp:dl:' + i + '"' + (e.enc || zipSt.busy ? " disabled" : "") + '>保存</button></div>').join("");
        box.innerHTML = tabs +
            '<div class="row"><label class="tool-button">🗜️ ZIPファイルを選ぶ<input class="file-input" type="file" accept=".zip,application/zip,application/x-zip-compressed" data-t="zp:openzip"></label></div>' +
            (zipSt.zipName ? '<div class="meta">' + escapeHtml(zipSt.zipName) + '：' + files.length + '個のファイル</div>' : "") +
            (rows ? '<div style="max-height:40vh;overflow:auto;display:grid;gap:4px">' + rows + '</div>' : (zipSt.zipName ? '<div class="empty-list">ファイルが入っていません。</div>' : '<div class="empty-list">ZIPを選ぶと、中身が ここに並びます。</div>')) +
            msg + '<div class="row"><button type="button" class="button" data-t="zp:dlall"' + (files.some((e) => !e.enc) && !zipSt.busy ? "" : " disabled") + '>ぜんぶ保存（1つずつ）</button></div>';
    }
}

function zipAddFiles(list, withPath){
    const add = []; let tooMany = false;
    for(const file of Array.from(list)){
        const path = zipSafePath(withPath && file.webkitRelativePath ? file.webkitRelativePath : file.name) || file.name;
        if(zipSt.files.some((f) => f.path === path)) continue;
        add.push({path, file});
    }
    const next = zipSt.files.concat(add);
    if(next.length > ZIP_MAX_ENTRIES){ tooMany = true; }
    const total = next.reduce((s, f) => s + f.file.size, 0);
    if(tooMany){ zipSt.msg = "ファイルの数が多すぎます（" + ZIP_MAX_ENTRIES + "個まで）。"; return; }
    if(total > ZIP_MAX_BYTES){ zipSt.msg = "合計が大きすぎます（" + formatAttachmentSize(ZIP_MAX_BYTES) + "まで）。"; return; }
    zipSt.files = next; zipSt.msg = add.length ? "" : "すでに入っているファイルです。";
}

async function zipSaveEntry(e){
    const bytes = await zipExtractEntry(zipSt.buf, e);
    downloadBlob(new Blob([bytes], {type:"application/octet-stream"}), zipSafeFileName(e.name));
}

async function onZipAction(action, node){
    const arg = String(node.dataset.t).split(":")[2];
    if(action === "tab"){ zipSt.tab = arg === "open" ? "open" : "pack"; zipSt.msg = ""; zipPaint(); return; }
    if(action === "name"){ zipSt.name = node.value; return; }
    if(action === "addfiles" || action === "addfolder"){ zipAddFiles(node.files || [], action === "addfolder"); node.value = ""; zipPaint(); return; }
    if(action === "rm"){ zipSt.files.splice(Number(arg), 1); zipSt.msg = ""; zipPaint(); return; }
    if(action === "clear"){ zipSt.files = []; zipSt.msg = ""; zipPaint(); return; }
    if(action === "pack"){
        if(!zipSt.files.length || zipSt.busy) return;
        const nameEl = $("zpName"); if(nameEl) zipSt.name = nameEl.value;
        const base = (String(zipSt.name || "").replace(/\.zip$/i, "").replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_").trim() || "まとめ");
        zipSt.busy = true; zipSt.msg = "作っています…"; zipPaint();
        try{
            const blob = await zipBuild(zipSt.files, (i, n, p) => { const m = $("zpMsg"); if(m) m.textContent = "作っています… " + (i + 1) + "/" + n; });
            downloadBlob(blob, base + ".zip");
            zipSt.msg = "ZIPを保存しました（" + formatAttachmentSize(blob.size) + "）。";
        }catch(error){ zipSt.msg = escapeHtml(zipErrText(error)); }
        zipSt.busy = false; zipPaint(); return;
    }
    if(action === "openzip"){
        const file = node.files && node.files[0]; node.value = ""; if(!file) return;
        zipSt.entries = []; zipSt.zipName = ""; zipSt.buf = null;
        if(file.size > ZIP_MAX_BYTES){ zipSt.msg = "ZIPが大きすぎます（" + formatAttachmentSize(ZIP_MAX_BYTES) + "まで）。"; zipPaint(); return; }
        try{
            const dir = await zipReadDirectory(file);
            zipSt.buf = dir.buf; zipSt.entries = dir.list; zipSt.zipName = file.name;
            zipSt.msg = dir.list.some((e) => e.enc) ? "パスワード付きのファイルは ほどけません。" : (dir.list.some((e) => !e.dir && e.method === 8) && !zipCanStream() ? escapeHtml(zipErrText(new Error("zip_nostream"))) : "");
        }catch(error){ zipSt.msg = escapeHtml(zipErrText(error)); }
        zipPaint(); return;
    }
    const files = zipSt.entries.filter((e) => !e.dir);
    if(action === "dl"){
        const e = files[Number(arg)]; if(!e) return;
        try{ await zipSaveEntry(e); zipSt.msg = ""; }catch(error){ zipSt.msg = escapeHtml(zipErrText(error)); }
        zipPaint(); return;
    }
    if(action === "dlall"){
        zipSt.busy = true; zipPaint(); let ok = 0, ng = 0;
        for(const e of files){
            if(e.enc){ ng++; continue; }
            try{ await zipSaveEntry(e); ok++; }catch(_e){ ng++; }
            await new Promise((r) => setTimeout(r, 350));   // 続けてダウンロードすると ブラウザが止めることがあるので 少し間をあける
        }
        zipSt.busy = false; zipSt.msg = ok + "個を保存しました" + (ng ? "（" + ng + "個は ほどけませんでした）" : "。") + (ok > 1 ? " ※ブラウザが「複数ダウンロード」の許可を聞いてきたら、許可してください。" : ""); zipPaint();
    }
}

function initZip(){ registerTool("zp", onZipAction); }
