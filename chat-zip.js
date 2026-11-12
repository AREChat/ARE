"use strict";
// ===== ZIP 圧縮・解凍 =====
// ・ぜんぶ この端末の中で処理します（ファイルはサーバーに送りません）。
// ・ブラウザの CompressionStream / DecompressionStream を使います（外部ライブラリなし）。使えない古いブラウザでは「圧縮しない ZIP」を作り、解凍はできない旨を案内します。
// ・パスワード付き ZIP・ZIP64（4GB超）・分割 ZIP は 扱えません。

const ZIP_MAX_BYTES = 300 * 1024 * 1024;   // 圧縮前の合計 / ZIP ファイルの大きさの上限
const ZIP_MAX_UNPACKED = 600 * 1024 * 1024; // 解凍後の合計の上限（ZIP爆弾よけ）
const ZIP_MAX_ENTRIES = 2000;
const ZIP_STORE_EXT = /\.(zip|jpe?g|png|gif|webp|heic|mp3|m4a|aac|ogg|mp4|mov|m4v|webm|mkv|pdf|docx|xlsx|pptx|7z|rar|gz|bz2|xz)$/i;
const zipSt = {tab:"pack", files:[], name:"まとめ", zipName:"", entries:[], busy:false, msg:"", enc:"none", pw:"", show:false, openPw:""};

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


// ---- パスワード（暗号化）----
// ・ZipCrypto … 昔からある方式。Windows のエクスプローラーなど ほぼ全部のソフトで開ける（ただし 強い暗号ではありません）
// ・AES-256 … 強い暗号（WinZip AES）。7-Zip・WinZip・Keka などで開けます（Windows標準のエクスプローラーでは 開けないことがあります）
// ・ファイルの名前までは 隠せません（ZIPのきまり）。
let zipAesSbox = null;
function zipAesInit(){
    if(zipAesSbox) return;
    const sbox = new Uint8Array(256); let p = 1, q = 1;
    do{ p = p ^ ((p << 1) & 0xFF) ^ (p & 0x80 ? 0x1B : 0); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xFF; if(q & 0x80) q ^= 0x09;
        const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4)); sbox[p] = (x ^ 0x63) & 0xFF;
    }while(p !== 1);
    sbox[0] = 0x63; zipAesSbox = sbox;
}
function zipAesExpandKey(key){
    zipAesInit(); const nk = key.length / 4, nr = nk + 6, w = new Uint8Array(16 * (nr + 1)); w.set(key);
    let rcon = 1;
    for(let i = nk; i < 4 * (nr + 1); i++){
        let t = w.slice((i - 1) * 4, i * 4);
        if(i % nk === 0){ t = new Uint8Array([zipAesSbox[t[1]] ^ rcon, zipAesSbox[t[2]], zipAesSbox[t[3]], zipAesSbox[t[0]]]); rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x11B : 0)) & 0xFF; }
        else if(nk > 6 && i % nk === 4){ t = new Uint8Array([zipAesSbox[t[0]], zipAesSbox[t[1]], zipAesSbox[t[2]], zipAesSbox[t[3]]]); }
        for(let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - nk) * 4 + j] ^ t[j];
    }
    return {w, nr};
}
const zipXt = (b) => ((b << 1) ^ (b & 0x80 ? 0x1B : 0)) & 0xFF;
function zipAesEncryptBlock(ks, inp, out){
    const s = new Uint8Array(16), w = ks.w; for(let i = 0; i < 16; i++) s[i] = inp[i] ^ w[i];
    const t = new Uint8Array(16);
    for(let r = 1; r <= ks.nr; r++){
        for(let i = 0; i < 16; i++) t[i] = zipAesSbox[s[i]];
        // ShiftRows
        const u = new Uint8Array([t[0], t[5], t[10], t[15], t[4], t[9], t[14], t[3], t[8], t[13], t[2], t[7], t[12], t[1], t[6], t[11]]);
        if(r < ks.nr){
            for(let c = 0; c < 4; c++){ const a0 = u[c * 4], a1 = u[c * 4 + 1], a2 = u[c * 4 + 2], a3 = u[c * 4 + 3];
                s[c * 4] = zipXt(a0) ^ (zipXt(a1) ^ a1) ^ a2 ^ a3; s[c * 4 + 1] = a0 ^ zipXt(a1) ^ (zipXt(a2) ^ a2) ^ a3; s[c * 4 + 2] = a0 ^ a1 ^ zipXt(a2) ^ (zipXt(a3) ^ a3); s[c * 4 + 3] = (zipXt(a0) ^ a0) ^ a1 ^ a2 ^ zipXt(a3); }
        }else s.set(u);
        for(let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    }
    out.set(s);
}
/** WinZip AES の CTR（カウンタは 1 から・リトルエンディアン） */
function zipAesCtr(ks, data){
    const out = new Uint8Array(data.length), ctr = new Uint8Array(16), ksb = new Uint8Array(16);
    for(let off = 0, n = 1; off < data.length; off += 16, n++){
        ctr[0] = n & 0xFF; ctr[1] = (n >>> 8) & 0xFF; ctr[2] = (n >>> 16) & 0xFF; ctr[3] = (n >>> 24) & 0xFF;
        zipAesEncryptBlock(ks, ctr, ksb);
        const m = Math.min(16, data.length - off); for(let i = 0; i < m; i++) out[off + i] = data[off + i] ^ ksb[i];
    }
    return out;
}
async function zipAesKeys(password, salt){
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({name: "PBKDF2", hash: "SHA-1", salt, iterations: 1000}, base, 8 * (32 + 32 + 2)));
    return {aes: bits.subarray(0, 32), mac: bits.subarray(32, 64), pv: bits.subarray(64, 66)};
}
async function zipHmac10(macKey, data){
    const k = await crypto.subtle.importKey("raw", macKey, {name: "HMAC", hash: "SHA-1"}, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, data)).subarray(0, 10);
}
async function zipAesEncrypt(password, plain){
    const salt = crypto.getRandomValues(new Uint8Array(16)); const k = await zipAesKeys(password, salt);
    const enc = zipAesCtr(zipAesExpandKey(k.aes), plain); const mac = await zipHmac10(k.mac, enc);
    const out = new Uint8Array(16 + 2 + enc.length + 10); out.set(salt, 0); out.set(k.pv, 16); out.set(enc, 18); out.set(mac, 18 + enc.length); return out;
}
async function zipAesDecrypt(password, data){
    if(data.length < 28) throw new Error("zip_invalid");
    const salt = data.subarray(0, 16), k = await zipAesKeys(password, salt);
    if(k.pv[0] !== data[16] || k.pv[1] !== data[17]) throw new Error("zip_password");
    const enc = data.subarray(18, data.length - 10), mac = await zipHmac10(k.mac, enc);
    for(let i = 0; i < 10; i++) if(mac[i] !== data[data.length - 10 + i]) throw new Error("zip_password");
    return zipAesCtr(zipAesExpandKey(k.aes), enc);
}
// ZipCrypto（昔からの方式）
function zipCrcUpd(c, b){ return zipCrcTable[(c ^ b) & 0xFF] ^ (c >>> 8); }
function zipLegacyKeys(password){
    zipCrc32(new Uint8Array(0));   // CRC表を作っておく
    const k = [305419896, 591751049, 878082192];
    const upd = (b) => { k[0] = zipCrcUpd(k[0], b) >>> 0; k[1] = (Math.imul((k[1] + (k[0] & 0xFF)) >>> 0, 134775813) + 1) >>> 0; k[2] = zipCrcUpd(k[2], k[1] >>> 24) >>> 0; };
    const dec = () => { const t = (k[2] | 2) & 0xFFFF; return ((t * (t ^ 1)) >>> 8) & 0xFF; };
    for(const b of new TextEncoder().encode(password)) upd(b);
    return {upd, dec};
}
function zipLegacyEncrypt(password, plain, crc){
    const {upd, dec} = zipLegacyKeys(password); const head = crypto.getRandomValues(new Uint8Array(12)); head[11] = (crc >>> 24) & 0xFF;
    const out = new Uint8Array(12 + plain.length);
    for(let i = 0; i < 12; i++){ const p = head[i]; out[i] = p ^ dec(); upd(p); }
    for(let i = 0; i < plain.length; i++){ const p = plain[i]; out[12 + i] = p ^ dec(); upd(p); }
    return out;
}
function zipLegacyDecrypt(password, data, check){
    if(data.length < 12) throw new Error("zip_invalid");
    const {upd, dec} = zipLegacyKeys(password); const out = new Uint8Array(data.length - 12); let last = 0;
    for(let i = 0; i < 12; i++){ last = data[i] ^ dec(); upd(last); }
    if(last !== check) throw new Error("zip_password");
    for(let i = 12; i < data.length; i++){ const p = data[i] ^ dec(); upd(p); out[i - 12] = p; }
    return out;
}

/** [{path, file}] → ZIP の Blob（opt: {password, mode:"aes"|"legacy"}） */
async function zipBuild(items, onProgress, opt){
    const pw = opt && opt.password ? String(opt.password) : "", aes = pw && opt.mode !== "legacy";
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
        let flags = 0x0800, hMethod = method, hCrc = crc, extra = new Uint8Array(0), ver = 20;
        if(pw){
            flags |= 1;
            if(aes){ data = await zipAesEncrypt(pw, data); hCrc = 0; ver = 51; extra = new Uint8Array([0x01, 0x99, 7, 0, 2, 0, 0x41, 0x45, 3, method & 0xFF, method >> 8]); hMethod = 99; }
            else data = zipLegacyEncrypt(pw, data, crc);
        }
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, ver, true); lh.setUint16(6, flags, true); lh.setUint16(8, hMethod, true);
        lh.setUint16(10, t.time, true); lh.setUint16(12, t.date, true); lh.setUint32(14, hCrc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, extra.length, true);
        parts.push(lh.buffer, name, extra, data);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, ver, true); ch.setUint16(6, ver, true); ch.setUint16(8, flags, true); ch.setUint16(10, hMethod, true);
        ch.setUint16(12, t.time, true); ch.setUint16(14, t.date, true); ch.setUint32(16, hCrc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true); ch.setUint16(30, extra.length, true);
        ch.setUint32(42, offset, true);
        central.push(ch.buffer, name, extra);
        offset += 30 + name.length + extra.length + data.length;
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
        let aes = null;
        for(let x = p + 46 + nlen, xe = x + elen; x + 4 <= xe;){ const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true); if(id === 0x9901 && sz >= 7) aes = {ver: dv.getUint16(x + 4, true), strength: buf[x + 8], method: dv.getUint16(x + 9, true)}; x += 4 + sz; }
        declared += usize;
        if(declared > ZIP_MAX_UNPACKED) throw new Error("zip_bomb");
        list.push({name, flags, method, crc, csize, usize, lho, aes, dir:/\/$/.test(name), enc:!!(flags & 1), time:dv.getUint16(p + 12, true)});
        p += 46 + nlen + elen + clen;
    }
    return {buf, list};
}

async function zipExtractEntry(buf, e, password){
    const dv = new DataView(buf.buffer);
    if(e.enc && !password) throw new Error("zip_need_password");
    if(dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error("zip_invalid");
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    let data = buf.subarray(start, start + e.csize), method = e.method, checkCrc = true;
    if(e.enc){
        if(e.method === 99 && e.aes){ if(e.aes.strength !== 3) throw new Error("zip_method"); data = await zipAesDecrypt(password, data); method = e.aes.method; checkCrc = e.aes.ver === 1; }
        else if(e.method === 99) throw new Error("zip_method");
        else data = zipLegacyDecrypt(password, data, (e.flags & 8) ? (e.time >>> 8) & 0xFF : (e.crc >>> 24) & 0xFF);
    }
    let out;
    if(method === 0) out = data;
    else if(method === 8){
        if(!zipCanStream()) throw new Error("zip_nostream");
        try{ out = await zipStream(data, DecompressionStream, "deflate-raw", Math.max(e.usize, 1) + 1024); }
        catch(err){ if(e.enc && String(err && err.message) !== "zip_too_big") throw new Error("zip_password"); throw err; }
    }else throw new Error("zip_method");
    if(checkCrc && zipCrc32(out) !== e.crc) throw new Error(e.enc ? "zip_password" : "zip_crc");
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
    return ({zip_invalid:"ZIPファイルとして読めませんでした（こわれている可能性があります）。", zip_zip64:"4GBをこえる大きなZIP（ZIP64）には対応していません。", zip_many:"ファイルの数が多すぎます（" + ZIP_MAX_ENTRIES + "個まで）。", zip_bomb:"ほどくと大きくなりすぎるため、安全のため中止しました（" + formatAttachmentSize(ZIP_MAX_UNPACKED) + "まで）。", zip_need_password:"パスワードを入れてください。", zip_password:"パスワードがちがうようです（または、こわれています）。", zip_nostream:"このブラウザは ZIP の解凍に対応していません。新しいブラウザ（Chrome・Edge・Safari 16.4以上など）をお使いください。", zip_method:"この圧縮方式には対応していません。", zip_crc:"中身がこわれているようです（チェックが合いません）。", zip_too_big:"大きすぎるため中止しました。"})[m] || featError(error);
}

function openZip(){
    openSheet(toolHead("🗜️ ZIP 圧縮・解凍","ファイルをまとめて ZIP にしたり、ZIP をほどいたり。ぜんぶ この端末の中で処理します（サーバーには送りません）") + '<div id="zpBody"></div>' + toolClose());
    zipSt.msg = ""; zipSt.pw = ""; zipSt.openPw = ""; zipPaint();
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
            '<label>パスワード ' + '<select data-t="zp:enc"><option value="none"' + (zipSt.enc === "none" ? " selected" : "") + '>つけない</option><option value="aes"' + (zipSt.enc === "aes" ? " selected" : "") + '>つける：AES-256（強い・おすすめ）</option><option value="legacy"' + (zipSt.enc === "legacy" ? " selected" : "") + '>つける：ZipCrypto（Windows標準でも開ける・弱い）</option></select></label>' +
            (zipSt.enc !== "none" ? '<input id="zpPw" type="' + (zipSt.show ? "text" : "password") + '" value="' + escapeHtml(zipSt.pw) + '" data-live="1" data-t="zp:pw" autocomplete="new-password" placeholder="パスワード（忘れると開けません）"><label><input type="checkbox" data-t="zp:show"' + (zipSt.show ? " checked" : "") + '> パスワードを表示する</label><div class="meta">' + (zipSt.enc === "aes" ? "AES-256：7-Zip・WinZip・Keka などで開けます。Windows標準のエクスプローラーでは開けないことがあります。" : "ZipCrypto：ほとんどのソフトで開けますが、暗号は弱めです。大事なものはAES-256を。") + ' ファイルの名前までは隠せません。パスワードは この端末の外には出ません。</div>' : "") +
            msg + '<div class="row"><button type="button" class="button-secondary" data-t="zp:clear"' + (zipSt.files.length ? "" : " disabled") + '>ぜんぶはずす</button><button type="button" class="button" data-t="zp:pack"' + (zipSt.files.length && !zipSt.busy && (zipSt.enc === "none" || zipSt.pw) ? "" : " disabled") + '>' + (zipSt.busy ? "作っています…" : zipSt.enc !== "none" ? "🔒 パスワード付きZIPにして保存" : "ZIPにして保存") + '</button></div>' +
            (zipCanStream() ? "" : '<div class="meta">※このブラウザでは、小さくせずに まとめるだけのZIPになります。</div>');
    }else{
        const files = zipSt.entries.filter((e) => !e.dir);
        const rows = files.map((e, i) => '<div class="row" style="justify-content:space-between;gap:6px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(zipSafePath(e.name)) + ' <span class="meta">' + formatAttachmentSize(e.usize) + (e.enc ? "・🔒" : "") + '</span></span><button type="button" class="button-secondary" data-t="zp:dl:' + i + '"' + (zipSt.busy || (e.enc && !zipSt.openPw) ? " disabled" : "") + '>保存</button></div>').join("");
        const anyEnc = files.some((e) => e.enc);
        box.innerHTML = tabs +
            '<div class="row"><label class="tool-button">🗜️ ZIPファイルを選ぶ<input class="file-input" type="file" accept=".zip,application/zip,application/x-zip-compressed" data-t="zp:openzip"></label></div>' +
            (zipSt.zipName ? '<div class="meta">' + escapeHtml(zipSt.zipName) + '：' + files.length + '個のファイル' + (anyEnc ? "（🔒パスワード付き）" : "") + '</div>' : "") +
            (anyEnc ? '<label>パスワード<input id="zpOpenPw" type="password" value="' + escapeHtml(zipSt.openPw) + '" data-live="1" data-t="zp:openpw" autocomplete="off" placeholder="ZIPのパスワードを入れてください"></label>' : "") +
            (rows ? '<div style="max-height:40vh;overflow:auto;display:grid;gap:4px">' + rows + '</div>' : (zipSt.zipName ? '<div class="empty-list">ファイルが入っていません。</div>' : '<div class="empty-list">ZIPを選ぶと、中身が ここに並びます。</div>')) +
            msg + '<div class="row"><button type="button" class="button" data-t="zp:dlall"' + (files.length && !zipSt.busy && (!anyEnc || zipSt.openPw) ? "" : " disabled") + '>ぜんぶ保存（1つずつ）</button></div>';
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
    const bytes = await zipExtractEntry(zipSt.buf, e, zipSt.openPw);
    { const b = new Blob([bytes], {type:"application/octet-stream"}), n = zipSafeFileName(e.name); downloadBlob(b, n); shareOffer(b, n); }
}

async function onZipAction(action, node){
    const arg = String(node.dataset.t).split(":")[2];
    if(action === "tab"){ zipSt.tab = arg === "open" ? "open" : "pack"; zipSt.msg = ""; zipPaint(); return; }
    if(action === "name"){ zipSt.name = node.value; return; }
    if(action === "enc"){ zipSt.enc = node.value; zipPaint(); return; }
    if(action === "show"){ zipSt.show = node.checked; zipPaint(); return; }
    if(action === "pw"){ zipSt.pw = node.value; const b = document.querySelector('[data-t="zp:pack"]'); if(b) b.disabled = !(zipSt.files.length && !zipSt.busy && zipSt.pw); return; }
    if(action === "openpw"){ zipSt.openPw = node.value; document.querySelectorAll('[data-t^="zp:dl"]').forEach((b) => { b.disabled = !zipSt.openPw || zipSt.busy; }); return; }
    if(action === "addfiles" || action === "addfolder"){ zipAddFiles(node.files || [], action === "addfolder"); node.value = ""; zipPaint(); return; }
    if(action === "rm"){ zipSt.files.splice(Number(arg), 1); zipSt.msg = ""; zipPaint(); return; }
    if(action === "clear"){ zipSt.files = []; zipSt.msg = ""; zipPaint(); return; }
    if(action === "pack"){
        if(!zipSt.files.length || zipSt.busy) return;
        const nameEl = $("zpName"); if(nameEl) zipSt.name = nameEl.value;
        const base = (String(zipSt.name || "").replace(/\.zip$/i, "").replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_").trim() || "まとめ");
        zipSt.busy = true; zipSt.msg = "作っています…"; zipPaint();
        try{
            const blob = await zipBuild(zipSt.files, (i, n, p) => { const m = $("zpMsg"); if(m) m.textContent = "作っています… " + (i + 1) + "/" + n; }, zipSt.enc !== "none" ? {password: zipSt.pw, mode: zipSt.enc} : null);
            downloadBlob(blob, base + ".zip"); shareOffer(blob, base + ".zip");
            zipSt.msg = (zipSt.enc !== "none" ? "🔒パスワード付きの" : "") + "ZIPを保存しました（" + formatAttachmentSize(blob.size) + "）。";
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
            zipSt.openPw = "";
            zipSt.msg = dir.list.some((e) => e.enc && !(e.method === 99 ? (e.aes && e.aes.strength === 3) : true)) ? "AES-128/192 の暗号には対応していません（AES-256 と ZipCrypto に対応）。" : (dir.list.some((e) => !e.dir && e.method === 8) && !zipCanStream() ? escapeHtml(zipErrText(new Error("zip_nostream"))) : "");
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
            try{ await zipSaveEntry(e); ok++; }catch(_e){ ng++; if(e.enc && String(_e && _e.message) === "zip_password"){ break; } }
            await new Promise((r) => setTimeout(r, 350));   // 続けてダウンロードすると ブラウザが止めることがあるので 少し間をあける
        }
        zipSt.busy = false; zipSt.msg = ok + "個を保存しました" + (ng ? "（" + ng + "個は ほどけませんでした）" : "。") + (ok > 1 ? " ※ブラウザが「複数ダウンロード」の許可を聞いてきたら、許可してください。" : ""); zipPaint();
    }
}

function initZip(){ registerTool("zp", onZipAction); }
