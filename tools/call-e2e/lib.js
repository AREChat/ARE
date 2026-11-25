"use strict";
// 通話の録音・録画／＋メニューの統合テスト用の土台：ブラウザ2つ＋疑似GAS＋疑似ドライブ
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = require("path").resolve(__dirname, "../..");
const ADMIN_ID = "9d660098-27f5-4933-bdce-d0ea7a6f08b4";
const acorn = require(ROOT + "/node_modules/acorn");
const terser = require(ROOT + "/node_modules/terser");

// chat-videolink.js から gasCall / driveUploadUrl を そのまま取り出す（本物と同じ動きで試すため）
function extractFns(file, names){
    const src = fs.readFileSync(file, "utf8");
    const ast = acorn.parse(src, {ecmaVersion: "latest", sourceType: "script"});
    const out = [];
    for(const n of ast.body) if(n.type === "FunctionDeclaration" && names.includes(n.id.name)) out.push(src.slice(n.start, n.end));
    if(out.length !== names.length) throw new Error("関数が見つかりません: " + names);
    return out.join("\n");
}

const HARNESS = (q) => `<!doctype html><html lang="ja" data-i18n-nopicker><head><meta charset="utf-8"><title>h</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<div class="chat-header"><button id="searchBtn" type="button">s</button></div>
<button id="telSetItem" type="button">x<small></small></button><button id="telTestItem" type="button">t</button>
<button id="telRecItem" class="admin-card more-item" type="button">🎞 通話の記録 <small>見る・保存・削除</small></button>
<div id="toast"></div>
<script>
(function(){
  var Q = new URLSearchParams(location.search);
  window.__q = Q;
  window.__errors = []; window.__toasts = []; window.__sent = []; window.__pres = 0;
  window.addEventListener("error", function(e){ window.__errors.push(String(e.message)); });
  window.addEventListener("unhandledrejection", function(e){ window.__errors.push("unhandled: " + String(e.reason && e.reason.message || e.reason)); });
  try{ localStorage.setItem("are_lang", Q.get("lang") || "ja"); }catch(_e){}
  if(Q.get("nomr") === "1"){ try{ delete window.MediaRecorder; window.MediaRecorder = undefined; }catch(_e){} }
  window.ARE_CONFIG = {adsUrl:"https://gas.mock.test/exec", videoUploadUrl:"https://gas.mock.test/exec", supabaseUrl:"https://sb.mock.test", supabasePublishableKey:"pk"};
  var uid = Q.get("uid"), pid = Q.get("pid");
  window.state = {user:{id:uid}, rooms:[], currentRoom:null};
  var room = {id:"room-1", is_group:false, orphan:false, partner:{id:pid, display_name:Q.get("pname") || "相手"}};
  window.state.rooms = [room]; window.state.currentRoom = room;
  window.feat = {isAdmin: Q.get("admin") === "1", blocks:new Map(), lastActivity:Date.now(), timers:[]};
  window.showToast = function(m){ window.__toasts.push(String(m)); };
  window.escapeHtml = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
  window.profileDisplayName = function(p){ return (p && p.display_name) || "相手"; };
  window.setAvatar = function(t, p){ t.textContent = ((p && p.display_name) || "?").slice(0,1); };
  window.runTool = function(f){ return f(); };
  window.extraBubbles = {};
  var hooks = []; window.addRoomHook = function(f){ hooks.push(f); try{ f(window.state.currentRoom); }catch(_e){} };
  window.sendPresence = function(){ window.__pres++; return Promise.resolve(); };
  window.sendPayloadToRoom = function(id, p){ window.__sent.push({id:id, p:p}); return Promise.resolve(); };
  window.requireClient = function(){ return {auth:{getSession:function(){ return Promise.resolve({data:{session:{access_token:"tok-" + uid}}}); }}, functions:{invoke:function(){ return Promise.resolve({}); }}, rpc:function(){ return Promise.resolve({}); }}; };
  window.freshAccessToken = function(){ return Promise.resolve("tok-" + uid); };
  window.ADMIN_PRES_ID = "${ADMIN_ID}";
})();
</script>
<script src="/i18n.js"></script>
<script>${extractFns(ROOT + "/chat-videolink.js", ["driveUploadUrl", "gasCall"]).replace(/<\/script>/g, "<\\/script>")}</script>
${q.min ? '<script src="/min.js"></script>' : '<script src="/chat-call.js"></script><script src="/chat-call-rec.js"></script><script src="/chat-call-plus.js"></script>'}
<script>window.__ready = true; initCall();</script>
</body></html>`;

// ===== 疑似 GAS（通話の郵便受け＋ドライブのアップロード口）。GAS の本物（gas/file-storage.gs）と同じ決まり =====
// ごく小さな STUN サーバー（Binding Request に 相手のアドレスを返すだけ）。この環境では外の STUN に届かないので、本番と同じ「STUNを使う」道すじを ここで試す
function startStun(){
    const dgram = require("dgram"); const sock = dgram.createSocket("udp4");
    sock.on("message", (msg, rinfo) => {
        if(msg.length < 20 || msg.readUInt16BE(0) !== 0x0001 || msg.readUInt32BE(4) !== 0x2112A442) return;
        const tid = msg.slice(8, 20), res = Buffer.alloc(32);
        res.writeUInt16BE(0x0101, 0); res.writeUInt16BE(12, 2); res.writeUInt32BE(0x2112A442, 4); tid.copy(res, 8);
        res.writeUInt16BE(0x0020, 20); res.writeUInt16BE(8, 22); res.writeUInt8(0, 24); res.writeUInt8(1, 25);
        res.writeUInt16BE(rinfo.port ^ 0x2112, 26);
        const ip = rinfo.address.split(".").map(Number); const cookie = [0x21, 0x12, 0xA4, 0x42];
        for(let i = 0; i < 4; i++) res.writeUInt8(ip[i] ^ cookie[i], 28 + i);
        sock.send(res, rinfo.port, rinfo.address);
    });
    return new Promise((resolve) => sock.bind(0, "127.0.0.1", () => resolve({port:sock.address().port, close:() => sock.close()})));
}
function makeServer(opts){
    opts = opts || {};
    const S = {boxes:{}, sessions:{}, files:[], starts:[], finishes:[], faults:{putFail:0, startFail:0, putDrop:0, putDelay:0}, putLog:[], callLog:[], minJs:null};
    const CALL = {TTL_SEC:120, RING_AGE_MS:50000, POLL_MS:3000, MAX_KEYS:40};
    const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|msp|apk|ipa|sh|bash|zsh|ps1|psm1|vbs|vbe|wsf|wsh|hta|scr|pif|jar|dll|sys|lnk|reg|js|svg|xml|xhtml|docm|xlsm|pptm|dotm|xlsb|app|pkg|dmg|deb|rpm)$/i;
    const keyOk = (k) => typeof k === "string" && /^[0-9a-f]{64}$/.test(k);
    function callSend(b){
        const k = String(b.key || ""), type = String(b.type || ""), from = String(b.from || ""), id = String(b.id || "");
        if(!keyOk(k)) return {ok:false, message:"key"};
        if(!/^(ring|answer|decline|cancel|hangup|busy)$/.test(type)) return {ok:false, message:"type"};
        if(!/^[A-Za-z0-9_-]{6,40}$/.test(from)) return {ok:false, message:"from"};
        if(!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return {ok:false, message:"id"};
        const data = b.data == null ? "" : JSON.stringify(b.data);
        if(data.length > 20000) return {ok:false, message:"too large"};
        if(type === "ring" && !/^tok-/.test(String(b.token || ""))) return {ok:false, message:"ログインが確認できません。"};
        const now = Date.now(); const box = S.boxes[k] || (S.boxes[k] = {n:0, m:[]});
        box.m = box.m.filter((x) => now - x.t < CALL.TTL_SEC * 1000);
        box.n = Math.max(now, (box.n || 0) + 1);
        box.m.push({n:box.n, t:now, f:from, ty:type, id, d:data});
        S.callLog.push({ty:type, from, id});
        return {ok:true, n:box.n, now};
    }
    function callPoll(b){
        const keys = (b.keys || []).slice(0, CALL.MAX_KEYS), after = b.after || {}, me = String(b.me || ""), now = Date.now(), out = {};
        for(const k of keys){
            if(!keyOk(k)) continue; const box = S.boxes[k]; if(!box) continue; const seen = after[k];
            const list = box.m.filter((x) => {
                if(x.f === me || now - x.t > CALL.TTL_SEC * 1000) return false;
                if(typeof seen === "number") return x.n > seen;
                if(x.ty !== "ring" || now - x.t > CALL.RING_AGE_MS) return false;
                for(const y of box.m) if(y.id === x.id && y.n > x.n && y.ty !== "ring" && y.ty !== "busy") return false;
                return true;
            });
            if(list.length || typeof seen !== "number") out[k] = {n:box.n || 0, m:list.map((x) => ({n:x.n, age:now - x.t, f:x.f, ty:x.ty, id:x.id, d:x.d}))};
        }
        return {ok:true, now, pollMs:CALL.POLL_MS, r:out};
    }
    function start(b){
        if(S.faults.startFail > 0){ S.faults.startFail--; return {ok:false, message:"ドライブのアップロード口を作れませんでした（503）。"}; }
        if(!/^tok-/.test(String(b.token || ""))) return {ok:false, message:"ログインが確認できません。"};
        const size = Number(b.size) || 0; const kind = {video:1, image:1, audio:1, file:1}[b.kind] ? b.kind : "file";
        const name = String(b.name || kind).replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 120);
        const mime = String(b.mime || (kind === "video" ? "video/mp4" : "application/octet-stream")).slice(0, 100);
        if(kind === "video" && !/^video\//i.test(mime)) return {ok:false, message:"動画ファイルだけ送れます。"};
        if(BLOCKED_EXT.test(name)) return {ok:false, message:"この種類のファイルは、安全のため送れません。"};
        if(size <= 0) return {ok:false, message:"大きさを確認できませんでした。"};
        const id = crypto.randomBytes(8).toString("hex");
        S.sessions[id] = {id, name, size, mime, kind, uid:String(b.token).slice(4), parts:[], offset:0, done:false, fileId:"file_" + id};
        S.starts.push({name, size, mime, kind, uid:S.sessions[id].uid});
        return {ok:true, sessionUrl:"https://drive.mock.test/up/" + id, maxBytes:1e13, retentionDays:0};
    }
    const CORS = {"access-control-allow-origin":"*", "access-control-allow-methods":"GET,POST,PUT,OPTIONS", "access-control-allow-headers":"content-type,content-range", "access-control-expose-headers":"Range,Location"};
    async function gas(route, req){
        if(req.method() === "OPTIONS") return route.fulfill({status:204, headers:CORS});
        let b = {}; try{ b = JSON.parse(req.postData() || "{}"); }catch(_e){}
        let r;
        if(b.action === "call") r = b.op === "send" ? callSend(b) : b.op === "poll" ? callPoll(b) : b.op === "ice" ? {ok:true, iceServers:[{urls:["stun:127.0.0.1:" + (S.stunPort || 9)]}], turn:false} : {ok:false};
        else if(b.action === "start") r = start(b);
        else if(b.action === "finish"){ S.finishes.push(b); r = {ok:true}; }
        else r = {ok:false, message:"不明な操作です。"};
        return route.fulfill({status:200, headers:Object.assign({"content-type":"application/json"}, CORS), body:JSON.stringify(r)});
    }
    async function drive(route, req){
        const m = /\/up\/([0-9a-f]+)/.exec(req.url()); const s = m && S.sessions[m[1]];
        if(req.method() === "OPTIONS") return route.fulfill({status:204, headers:CORS});
        if(!s) return route.fulfill({status:404, headers:CORS, body:"no"});
        const cr = req.headers()["content-range"] || ""; const body = req.postDataBuffer() || Buffer.alloc(0);
        S.putLog.push({id:s.id, cr, len:body.length});
        const range = () => s.offset > 0 ? {Range:"bytes=0-" + (s.offset - 1)} : {};
        if(S.faults.putDelay > 0) await new Promise((r) => setTimeout(r, S.faults.putDelay));
        if(S.faults.putDrop > 0){ S.faults.putDrop--; return route.abort("failed"); }
        if(S.faults.putFail > 0){ S.faults.putFail--; return route.fulfill({status:503, headers:CORS, body:"busy"}); }
        if(s.done) return route.fulfill({status:200, headers:Object.assign({"content-type":"application/json"}, CORS), body:JSON.stringify({id:s.fileId, name:s.name})});
        const q = /^bytes \*\/(\d+)$/.exec(cr);
        if(q) return route.fulfill({status:308, headers:Object.assign({}, CORS, range()), body:""});
        const mm = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
        if(!mm) return route.fulfill({status:400, headers:CORS, body:"bad range"});
        const a = Number(mm[1]), e = Number(mm[2]), total = Number(mm[3]);
        if(total !== s.size) return route.fulfill({status:400, headers:CORS, body:"size mismatch"});
        if(a !== s.offset) return route.fulfill({status:308, headers:Object.assign({}, CORS, range()), body:""});
        if(body.length !== e - a + 1) return route.fulfill({status:400, headers:CORS, body:"len mismatch"});
        s.parts.push(body); s.offset = e + 1;
        if(s.offset >= s.size){
            s.done = true; const buf = Buffer.concat(s.parts);
            const file = {name:s.name, size:buf.length, mime:s.mime, kind:s.kind, uid:s.uid, fileId:s.fileId, buf};
            S.files.push(file);
            return route.fulfill({status:200, headers:Object.assign({"content-type":"application/json"}, CORS), body:JSON.stringify({id:s.fileId, name:s.name})});
        }
        return route.fulfill({status:308, headers:Object.assign({}, CORS, range()), body:""});
    }
    async function install(context){
        await context.route("https://gas.mock.test/**", gas);
        await context.route("https://drive.mock.test/**", drive);
        await context.route("https://sb.mock.test/**", (r) => r.fulfill({status:200, headers:CORS, body:"{}"}));
        await context.route("https://harness.test/**", async (route, req) => {
            const u = new URL(req.url());
            if(u.pathname === "/h.html") return route.fulfill({status:200, headers:{"content-type":"text/html; charset=utf-8"}, body:HARNESS({min:u.searchParams.get("min") === "1"})});
            if(u.pathname === "/min.js") return route.fulfill({status:200, headers:{"content-type":"text/javascript; charset=utf-8"}, body:S.minJs || ""});
            const f = path.join(ROOT, decodeURIComponent(u.pathname));
            if(f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()){
                const ext = path.extname(f); const ct = ext === ".js" ? "text/javascript; charset=utf-8" : ext === ".css" ? "text/css" : "application/octet-stream";
                return route.fulfill({status:200, headers:{"content-type":ct}, body:fs.readFileSync(f)});
            }
            return route.fulfill({status:404, body:"nf"});
        });
    }
    async function init(){ const st = await startStun(); S.stunPort = st.port; S._stun = st; }
    function close(){ try{ S._stun && S._stun.close(); }catch(_e){} }
    return {S, install, init, close};
}

async function buildMin(){
    // 本番のバンドルと同じ設定で、3本を小さくした版（変数名の短縮・まとめて圧縮でこわれないかの確認用）
    const parts = ["chat-call.js", "chat-call-rec.js", "chat-call-plus.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\s+$/, "") + "\n;");
    const r = await terser.minify(parts.join("\n"), {compress:{toplevel:false, passes:1}, mangle:{toplevel:false}, format:{comments:false}});
    if(r.error) throw r.error; return r.code;
}

const URL_ = (o) => "https://harness.test/h.html?" + new URLSearchParams(o).toString();
async function launch(){
    const { chromium } = require("playwright");
    const base = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--no-sandbox"];
    const extra = process.env.XF !== undefined ? process.env.XF.split(" ").filter(Boolean) : ["--disable-features=WebRtcHideLocalIpsWithMdns", "--force-webrtc-ip-handling-policy=default_public_and_private_interfaces"];
    return chromium.launch({args:base.concat(extra)});
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what){
    const t0 = Date.now();
    for(;;){ try{ const v = await fn(); if(v) return v; }catch(_e){} if(Date.now() - t0 > ms) throw new Error("時間切れ: " + what); await sleep(150); }
}
module.exports = {startStun, ROOT, ADMIN_ID, makeServer, buildMin, launch, URL_, sleep, until, extractFns};

// ===== 共通：2人の画面を開いて、つなぐ =====
const T = {n:0, fail:0};
function ok(c, m){ T.n++; if(!c){ T.fail++; console.error("NG  " + m); } else console.log("ok  " + m); }
function finish(){ console.log(T.fail ? "\n失敗 " + T.fail + " / " + T.n : "\nOK（" + T.n + " 項目）"); }
async function open2(o){
    o = o || {}; if(process.env.MIN === "1") o.min = true;
    const srv = makeServer(); await srv.init();
    if(o.min) srv.S.minJs = await buildMin();
    const browser = await launch();
    const mk = async () => { const c = await browser.newContext({viewport:{width:o.w || 420, height:o.h || 820}, acceptDownloads:true}); await srv.install(c); return c; };
    const ctxA = await mk(), ctxB = await mk();
    const A = await ctxA.newPage(), B = await ctxB.newPage();
    for(const [p, nm] of [[A, "A"], [B, "B"]]){ p.on("pageerror", (e) => console.error("pageerror " + nm + ": " + e.message)); p.on("console", (m) => { if(m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) console.error("console.error " + nm + ": " + m.text()); }); }
    const idA = o.idA || "user-A-0001", idB = o.idB || "user-B-0002";
    const qa = Object.assign({uid:idA, pid:idB, pname:"ビー", admin:o.adminA ? "1" : "0", lang:o.lang || "ja", min:o.min ? "1" : "0"}, o.qA || {});
    const qb = Object.assign({uid:idB, pid:idA, pname:"エー", admin:o.adminB ? "1" : "0", lang:o.lang || "ja", min:o.min ? "1" : "0"}, o.qB || {});
    await A.goto(URL_(qa)); await B.goto(URL_(qb));
    await A.waitForFunction(() => window.__ready === true); await B.waitForFunction(() => window.__ready === true);
    return {srv, S:srv.S, browser, ctxA, ctxB, A, B, qa, qb, async close(){ await browser.close(); srv.close(); }};
}
/** caller が かけて、callee が出る（kind: "video" | "audio"） */
async function connect(R, kind, caller, callee){
    caller = caller || R.A; callee = callee || R.B; kind = kind || "video";
    await caller.evaluate((k) => window.AREtel.start(k), kind);
    await until(() => caller.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.pc), 8000, "かける側の準備");
    await callee.evaluate(() => window.AREtel.tick());
    await until(() => callee.evaluate(() => { const i = document.getElementById("telIn"); return i && !i.hidden; }), 25000, "着信");
    await callee.click(kind === "video" ? "#telInVideo" : "#telInAudio");
    await until(() => caller.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.startAt > 0), 40000, "かける側がつながる");
    await until(() => callee.evaluate(() => window.AREtel.state.call && window.AREtel.state.call.startAt > 0), 40000, "出る側がつながる");
    await sleep(500);
}
const recState = (p) => p.evaluate(() => { const c = window.AREtel.state.call; if(!c || !c.x) return null; return {on:!!c.x.recOn, mr:c.x.rec ? c.x.rec.mr.state : null, parts:c.x.parts, stopped:c.x.recStopped, err:c.x.recErr}; });
const badge = (p) => p.evaluate(() => { const b = document.getElementById("telxRec"); return b ? {hidden:b.hidden, off:b.classList.contains("off"), text:document.getElementById("telxRecTx").textContent, peerWarn:!document.getElementById("telxRecPeer").hidden} : null; });
const openFeat = async (p, id) => { const hidden = await p.evaluate(() => document.getElementById("telxSheet").hidden); if(hidden) await p.click("#telPlus"); await p.click('#telxSheet [data-f="' + id + '"]'); };
const closeSheet = async (p) => { const hidden = await p.evaluate(() => document.getElementById("telxSheet").hidden); if(!hidden) await p.click("#telxSheet .telx-head [aria-label]:last-child"); };
Object.assign(module.exports, {ok, finish, T, open2, connect, recState, badge, openFeat, closeSheet});
