"use strict";
// ===== 通話（着信音・音声・ビデオ・画面共有）=====
// ・相手とは「1対1のチャット」だけ（グループは対象外）。登録も、アプリの追加も、いりません。
// ・声や映像は、ブラウザどうしが直接つなぎます（WebRTC）。Supabase も GAS も通りません。
// ・「いま電話するよ」「出たよ」「切ったよ」だけを、GAS の郵便受け（chat の adsUrl と同じ GAS・action=call）で受けわたします。
//   部屋の目印は、部屋の番号を SHA-256 にした 64文字（部屋の番号そのものは GAS に届きません）。
// ・着信に気づくのは、ARE を開いているあいだ（画面が見えているときは約6秒おき、ほかのタブにいるときは約15秒おき）。ブラウザを閉じたときは鳴りません。
// ・画面共有は、パソコンのブラウザで「する」側になれます（スマホのブラウザは、見るほうだけ）。
// ・つながりにくい回線のとき用に、GAS のスクリプトプロパティに無料の中継サーバー（TURN）を入れると、自動で使います（なくても動きます）。

const tel = {
    on:true, dev:"", after:{}, keyOf:new Map(), roomOfKey:new Map(), handled:new Set(),
    poll:null, pollMs:6000, errs:0, call:null, incoming:null, ac:null, tone:null, ice:null, iceAt:0, ui:null
};
const TEL_ON_KEY = "are_tel_on";
const TEL_EMOJIS = ["👍","❤️","😂","👏","🎉","😮","🙏","😢","🔥","✋"];
const TEL_RING_MS = 45000, TEL_ICE_FALLBACK = [{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}];

function telUrl(){ const c = window.ARE_CONFIG || {}; return String(c.adsUrl || c.videoUploadUrl || "").trim(); }
function telRand(n){ const a = new Uint8Array(n); (crypto || window.crypto).getRandomValues(a); return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); }

async function telHash(roomId){
    if(tel.keyOf.has(roomId)) return tel.keyOf.get(roomId);
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("are-call-v1:" + roomId));
    const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
    tel.keyOf.set(roomId, hex); tel.roomOfKey.set(hex, roomId);
    return hex;
}

async function telPost(body, timeout){
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout || 15000);
    try{
        const res = await fetch(telUrl(), {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(Object.assign({action:"call"}, body)), signal:ctl.signal, redirect:"follow"});
        return await res.json();
    }catch(_e){ return null; }finally{ clearTimeout(timer); }
}

// ===== 着信音・呼び出し音（音のファイルは使わず、ブラウザで作ります）=====
function telUnlockAudio(){
    try{
        if(!tel.ac){ const A = window.AudioContext || window.webkitAudioContext; if(!A) return; tel.ac = new A(); }
        if(tel.ac.state === "suspended"){
            const p = tel.ac.resume();
            // 着信中に 画面をさわって 音が出せるようになったら、すぐに鳴らしなおす
            if(p && p.then) p.then(() => { if(tel.incoming && tel.ac.state === "running" && !tel.toneMuted){ telToneStart("in"); if(tel.ui) telAudioHint(tel.ui); } }).catch(() => {});
        }
    }catch(_e){}
}
function telBeep(freq, at, dur, vol, wave){
    const ac = tel.ac; if(!ac || ac.state !== "running") return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
    o.type = wave || "sine"; o.frequency.value = freq;
    const e = Math.min(0.02, dur / 4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + e); g.gain.setValueAtTime(vol, t + dur - e * 2); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
/** 管理者の着信音は、平日（月〜金）の日本時間 7:00〜20:00（20:00 ちょうどは鳴る）は、消す。ほかの人・休日・夜は、ふつうに鳴る（祝日は、平日として数えます） */
function telNow(){ return typeof window.__telNow === "function" ? Number(window.__telNow()) : Date.now(); }
function telQuiet(){
    let admin = false;
    try{ admin = (typeof adIsAdmin === "function" && adIsAdmin()) || !!(typeof feat !== "undefined" && feat.isAdmin); }catch(_e){}
    return admin;   // 管理者は、いつでも「ミュートの着信」（画面には出るが、音もバイブもなし）
}
/** "in"＝着信音（にぎやか） ／ "out"＝かけているときの呼び出し音（静か） */
function telToneStart(kind){
    telToneStop();
    if(kind === "in" && telQuiet()){ tel.toneMuted = true; return; }   // 見た目の着信は出すが、音と振動は出さない
    telUnlockAudio();
    const cycle = () => {
        if(kind === "in"){
            // だれでも気づく、大きくて高い「リリリリ…」（高低2つの音を すばやく6回）。音量は 端末の音量にしたがいます
            for(let i = 0; i < 6; i++){
                const o = i * 0.2;
                telBeep(1319, o, 0.11, 0.55, "square"); telBeep(988, o + 0.1, 0.09, 0.45, "square");
            }
            telBeep(1760, 1.35, 0.5, 0.35, "triangle");
            try{ if(navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 500, 150, 500]); }catch(_e){}
        }else{ telBeep(440, 0, 0.9, 0.12); telBeep(480, 0, 0.9, 0.1); }
    };
    cycle();
    tel.tone = setInterval(cycle, kind === "in" ? 2200 : 3500);
}
function telTitleFlash(on){
    try{
        if(tel.flash){ clearInterval(tel.flash); tel.flash = null; if(tel.title0 != null){ document.title = tel.title0; tel.title0 = null; } }
        if(!on) return;
        tel.title0 = document.title; let k = 0;
        tel.flash = setInterval(() => { document.title = (k++ % 2 === 0) ? "📞 着信中！" : tel.title0; }, 700);
    }catch(_e){}
}
function telToneStop(){ telTitleFlash(false); tel.toneMuted = false; if(tel.tone){ clearInterval(tel.tone); tel.tone = null; } try{ if(navigator.vibrate) navigator.vibrate(0); }catch(_e){} }

// ===== 画面（着信・通話中）=====
function telCss(){
    if(document.getElementById("telCss")) return;
    const s = document.createElement("style"); s.id = "telCss";
    s.textContent =
        ".tel-ov{position:fixed;inset:0;z-index:9990;background:#05070d;color:#fff;display:flex;flex-direction:column}.tel-ov[hidden],.tel-in[hidden]{display:none}" +
        ".tel-top{padding:calc(12px + env(safe-area-inset-top)) 16px 8px;text-align:center}.tel-top b{font-size:18px}.tel-top small{display:block;color:#9aa8c2;margin-top:2px}" +
        ".tel-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center}" +
        ".tel-stage video.tel-remote{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}.tel-stage video[hidden]{display:none}" +
        ".tel-av{width:112px;height:112px;border-radius:50%;background:#1b253a;display:flex;align-items:center;justify-content:center;font-size:44px;overflow:hidden}.tel-av img{width:100%;height:100%;object-fit:cover}" +
        ".tel-pip{position:absolute;right:10px;bottom:10px;width:min(30%,150px);aspect-ratio:3/4;object-fit:cover;border-radius:10px;border:1px solid #2b3851;background:#000;z-index:2}.tel-pip[hidden]{display:none}" +
        ".tel-bar{display:flex;gap:10px 8px;justify-content:center;flex-wrap:wrap;padding:10px 8px calc(14px + env(safe-area-inset-bottom))}" +
        ".tel-bar .tb{display:flex;flex-direction:column;align-items:center;gap:3px;width:64px}.tel-bar .tb[hidden]{display:none}.tel-bar .tb small{font-size:10.5px;color:#b6c2da;line-height:1.1;text-align:center}" +
        ".tel-bar button{width:54px;height:54px;border-radius:50%;border:0;background:#26324a;color:#fff;font-size:22px}.tel-bar button.off{background:#fff;color:#111}.tel-bar button.end{background:#e0443e}.tel-bar button[hidden]{display:none}" +
        ".tel-stage video.tel-pip.mirror{transform:scaleX(-1)}" +
        ".tel-emo{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:94%;padding:8px 10px;border-radius:16px;background:rgba(20,27,45,.96);border:1px solid #3a4a6c}.tel-emo[hidden]{display:none}.tel-emo button{width:44px;height:44px;border-radius:12px;border:0;background:#26324a;font-size:24px}" +
        ".tel-fly{position:absolute;bottom:70px;z-index:5;font-size:44px;pointer-events:none;animation:telFly 2.4s ease-out forwards}.tel-fly small{display:block;font-size:11px;color:#cfe;text-align:center}" +
        "@keyframes telFly{0%{opacity:0;transform:translateY(0) scale(.6)}12%{opacity:1;transform:translateY(-20px) scale(1.15)}100%{opacity:0;transform:translateY(-260px) scale(1)}}" +
        "@media (prefers-reduced-motion:reduce){.tel-fly{animation-duration:.01s;animation-delay:1.6s}}" +
        ".tel-in{position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9995;width:min(94vw,380px);background:#141b2d;border:1px solid #7c9cff;border-radius:16px;padding:14px;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.5)}" +
        ".tel-in .row{display:flex;gap:10px;align-items:center}.tel-in .tel-av{width:54px;height:54px;font-size:22px;flex:none}.tel-in .nm{font-weight:700;font-size:17px}.tel-in small{color:#9aa8c2}" +
        ".tel-in .acts{display:flex;gap:8px;margin-top:12px}.tel-in .acts button{flex:1;border:0;border-radius:10px;padding:11px 6px;font-weight:700;color:#fff}.tel-in .ok{background:#2e9e6b}.tel-in .ng{background:#e0443e}" +
        ".tel-in{animation:telFlash 1s infinite alternate}@keyframes telFlash{from{border-color:#7c9cff;box-shadow:0 8px 30px rgba(0,0,0,.5)}to{border-color:#ff6b6b;box-shadow:0 0 0 4px rgba(255,107,107,.45),0 8px 30px rgba(0,0,0,.5)}}" +
        "@keyframes telPulse{0%{box-shadow:0 0 0 0 rgba(124,156,255,.5)}100%{box-shadow:0 0 0 9px rgba(124,156,255,0)}}.tel-in .tel-av{animation:telPulse 1.4s infinite}";
    document.head.appendChild(s);
}
function telBuildUi(){
    if(tel.ui) return tel.ui;
    telCss();
    const ov = document.createElement("div"); ov.className = "tel-ov"; ov.id = "telOv"; ov.hidden = true;
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "通話");
    ov.innerHTML =
        '<div class="tel-top"><b id="telName">通話</b><small id="telSt"></small></div>' +
        '<div class="tel-stage"><div class="tel-av" id="telAv">📞</div><video class="tel-remote" id="telRemote" autoplay playsinline hidden></video><video class="tel-pip" id="telLocal" autoplay playsinline muted hidden></video><div class="tel-emo" id="telEmoTray" hidden></div></div>' +
        '<div class="tel-bar">' +
        '<div class="tb"><button type="button" id="telMic" title="マイク（押すとミュート）" aria-label="ミュート" aria-pressed="false">🎤</button><small>ミュート</small></div>' +
        '<div class="tb"><button type="button" id="telSpk" title="スピーカー（相手の声を出す／止める）" aria-label="スピーカー" aria-pressed="true">🔊</button><small>スピーカー</small></div>' +
        '<div class="tb"><button type="button" id="telCam" title="カメラ" aria-label="カメラ">📷</button><small>カメラ</small></div>' +
        '<div class="tb" id="telFlipBox" hidden><button type="button" id="telFlip" title="内カメラ・外カメラを切りかえる" aria-label="カメラの向きを切りかえる">🔄</button><small id="telFlipTx">外カメラへ</small></div>' +
        '<div class="tb"><button type="button" id="telEmo" title="絵文字を送る" aria-label="絵文字">😀</button><small>絵文字</small></div>' +
        '<div class="tb" id="telScrBox" hidden><button type="button" id="telScr" title="画面共有" aria-label="画面共有">🖥️</button><small>画面共有</small></div>' +
        '<div class="tb"><button type="button" class="end" id="telEnd" title="切る" aria-label="切る">📵</button><small>切る</small></div>' +
        '</div>';
    document.body.appendChild(ov);
    const inc = document.createElement("div"); inc.className = "tel-in"; inc.id = "telIn"; inc.hidden = true;
    inc.setAttribute("role", "alertdialog"); inc.setAttribute("aria-label", "着信");
    inc.innerHTML =
        '<div class="row"><div class="tel-av" id="telInAv">📞</div><div><div class="nm" id="telInName"></div><small id="telInKind"></small></div></div>' +
        '<div class="acts"><button type="button" class="ng" id="telInNo">拒否</button><button type="button" class="ok" id="telInAudio">🎤 音声で出る</button><button type="button" class="ok" id="telInVideo">🎥 ビデオで出る</button></div>';
    document.body.appendChild(inc);
    const $ = (id) => document.getElementById(id);
    tel.ui = {ov, inc, name:$("telName"), st:$("telSt"), av:$("telAv"), remote:$("telRemote"), local:$("telLocal"), mic:$("telMic"), cam:$("telCam"), scr:$("telScr"), scrBox:$("telScrBox"), spk:$("telSpk"), flip:$("telFlip"), flipBox:$("telFlipBox"), flipTx:$("telFlipTx"), emo:$("telEmo"), emoTray:$("telEmoTray"), end:$("telEnd"),
        inAv:$("telInAv"), inName:$("telInName"), inKind:$("telInKind"), inNo:$("telInNo"), inAudio:$("telInAudio"), inVideo:$("telInVideo")};
    const u = tel.ui;
    u.end.addEventListener("click", () => telEnd("切りました"));
    u.mic.addEventListener("click", telToggleMic);
    u.cam.addEventListener("click", telToggleCam);
    u.scr.addEventListener("click", telToggleScreen);
    u.spk.addEventListener("click", telToggleSpeaker);
    u.flip.addEventListener("click", telFlipCamera);
    u.emo.addEventListener("click", () => { u.emoTray.hidden = !u.emoTray.hidden; });
    TEL_EMOJIS.forEach((e) => { const b = document.createElement("button"); b.type = "button"; b.textContent = e; b.setAttribute("aria-label", "絵文字 " + e); b.addEventListener("click", () => { telSendEmoji(e); u.emoTray.hidden = true; }); u.emoTray.appendChild(b); });
    u.inNo.addEventListener("click", () => telDecline());
    u.inAudio.addEventListener("click", () => telAccept(false));
    u.inVideo.addEventListener("click", () => telAccept(true));
    // 画面共有：ブラウザが対応しているときだけボタンを出す（スマホの多くは非対応）
    u.scrBox.hidden = !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    return u;
}
function telPartnerOf(room){ return room && !room.is_group ? room.partner : null; }
function telNameOf(room){ const p = telPartnerOf(room); return p ? profileDisplayName(p) : "相手"; }
function telPaintAvatar(target, room){
    const p = telPartnerOf(room);
    target.textContent = "";
    try{ if(p){ setAvatar(target, p); if(!target.textContent && !target.querySelector("img")) target.textContent = "📞"; } else target.textContent = "📞"; }catch(_e){ target.textContent = "📞"; }
}
function telStatus(text){ if(tel.ui) tel.ui.st.textContent = text || ""; }

// ===== 通話の準備 =====
async function telGetMedia(video){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("このブラウザでは通話できません（https で開き、新しいブラウザをお使いください）。");
    try{
        return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}, video:video ? {width:{ideal:1280}, height:{ideal:720}, facingMode:"user"} : false});
    }catch(e){
        const n = e && e.name;
        if(n === "NotAllowedError" || n === "SecurityError") throw new Error("マイク" + (video ? "とカメラ" : "") + "が許可されていません。ブラウザの設定で許可してください。");
        if(n === "NotFoundError" || n === "OverconstrainedError") throw new Error("マイク" + (video ? "またはカメラ" : "") + "が見つかりません。");
        throw new Error("マイク" + (video ? "・カメラ" : "") + "を使えませんでした。");
    }
}
async function telIceServers(){
    if(tel.ice && Date.now() - tel.iceAt < 10 * 60 * 1000) return tel.ice;
    try{
        const token = await freshAccessToken(requireClient());
        const r = await telPost({op:"ice", token}, 8000);
        if(r && r.ok && Array.isArray(r.iceServers) && r.iceServers.length){ tel.ice = r.iceServers; tel.iceAt = Date.now(); return tel.ice; }
    }catch(_e){}
    return TEL_ICE_FALLBACK;
}
function telGather(pc){
    return new Promise((resolve) => {
        if(pc.iceGatheringState === "complete"){ resolve(); return; }
        const done = () => { pc.removeEventListener("icegatheringstatechange", chk); clearTimeout(tm); resolve(); };
        const chk = () => { if(pc.iceGatheringState === "complete") done(); };
        const tm = setTimeout(done, 3500);
        pc.addEventListener("icegatheringstatechange", chk);
    });
}
function telSender(pc, kind){ const t = pc.getTransceivers().find((x) => x.receiver && x.receiver.track && x.receiver.track.kind === kind); return t ? t.sender : null; }

function telMakePc(call, servers){
    const pc = new RTCPeerConnection({iceServers:servers});
    call.pc = pc; call.remote = new MediaStream();
    pc.addEventListener("track", (ev) => {
        if(!call.remote.getTracks().includes(ev.track)) call.remote.addTrack(ev.track);
        if(tel.ui){ tel.ui.remote.srcObject = call.remote; tel.ui.remote.play && tel.ui.remote.play().catch(() => {}); }
        if(ev.track.kind === "video") ev.track.addEventListener("unmute", telPaintRemote);
    });
    pc.addEventListener("connectionstatechange", () => {
        if(tel.call !== call) return;
        const s = pc.connectionState;
        if(s === "connected") telLive(call);
        else if(s === "failed") telEnd("つながりませんでした。ネットワークをかえて（Wi-Fi／モバイル）、もう一度お試しください。");
        else if(s === "disconnected"){ clearTimeout(call.dcTimer); call.dcTimer = setTimeout(() => { if(tel.call === call && pc.connectionState !== "connected") telEnd("通信がとぎれました。"); }, 10000); }
        else if(s === "closed"){ /* 自分で閉じた */ }
    });
    const dc = pc.createDataChannel("s", {negotiated:true, id:1});
    call.dc = dc;
    dc.addEventListener("open", () => telSendState(call));
    dc.addEventListener("message", (ev) => {
        let m = null; try{ m = JSON.parse(ev.data); }catch(_e){}
        if(!m) return;
        if(m.t === "bye"){ telEnd("相手が切りました。", {notify:false}); return; }
        if(m.t === "st"){ call.peerCam = !!m.cam; call.peerScr = !!m.scr; call.peerMuted = !!m.mic; telPaintRemote(); telPaintPeerMic(); }
        if(m.t === "em" && TEL_EMOJIS.includes(m.e)) telFlyEmoji(m.e, telNameOf(call.room));
    });
    // 音声と映像の「通り道」を、はじめから2つ作る（あとからカメラや画面共有を足しても、つなぎなおしがいらない）
    return pc;
}
function telSendState(call){
    try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"st", cam:!!call.camOn, scr:!!call.scrOn, mic:!!call.muted})); }catch(_e){}
}
function telPaintPeerMic(){
    const call = tel.call, u = tel.ui; if(!call || !u || !call.startAt) return;
    const base = u.st.textContent.replace(/ ・ 相手はミュート中$/, "");
    u.st.textContent = base + (call.peerMuted ? " ・ 相手はミュート中" : "");
}
function telPaintRemote(){
    const call = tel.call, u = tel.ui; if(!call || !u) return;
    const showVideo = !!(call.peerCam || call.peerScr);
    u.remote.hidden = !showVideo; u.av.hidden = showVideo;
    u.remote.style.objectFit = call.peerScr ? "contain" : "cover";
    if(showVideo && u.remote.paused) u.remote.play().catch(() => {});
}
function telPaintLocal(){
    const call = tel.call, u = tel.ui; if(!call || !u) return;
    const on = !!(call.camOn || call.scrOn);
    u.local.hidden = !on;
    if(on){ u.local.srcObject = call.scrOn ? call.screenStream : call.camStream; u.local.style.objectFit = call.scrOn ? "contain" : "cover"; }
    u.cam.classList.toggle("off", !call.camOn);
    u.mic.classList.toggle("off", !!call.muted);
    u.mic.textContent = call.muted ? "🔇" : "🎤"; u.mic.setAttribute("aria-pressed", call.muted ? "true" : "false");
    u.spk.classList.toggle("off", !!call.spkOff);
    u.spk.textContent = call.spkOff ? "🔈" : "🔊"; u.spk.setAttribute("aria-pressed", call.spkOff ? "false" : "true");
    u.scr.classList.toggle("off", !call.scrOn);
    u.local.classList.toggle("mirror", !!(call.camOn && !call.scrOn && call.facing !== "environment"));
    u.flipBox.hidden = !(call.camOn && !call.scrOn && telCanFlip());
    u.flipTx.textContent = call.facing === "environment" ? "内カメラへ" : "外カメラへ";
}

function telNewCall(o){
    return Object.assign({id:o.id || telRand(16), room:null, key:"", role:"caller", kind:"audio", pc:null, dc:null, remote:null, stream:null, camStream:null, screenStream:null,
        camOn:false, scrOn:false, muted:false, spkOff:false, peerMuted:false, facing:"user", peerCam:false, peerScr:false, answered:false, startAt:0, timer:null, ringTimer:null, dcTimer:null, ended:false}, o);
}
async function telSend(type, call, data, withToken){
    const body = {op:"send", key:call.key, type, from:tel.dev, id:call.id, data:data == null ? null : data};
    if(withToken) body.token = await freshAccessToken(requireClient());
    return telPost(body, 15000);
}

// ===== かける =====
async function telStart(kind){
    const room = state.currentRoom;
    if(!room || room.is_group || room.orphan){ showToast("通話できるのは、1対1のチャットだけです。"); return; }
    if(tel.call || tel.incoming){ showToast("いま通話中（または着信中）です。"); return; }
    if(!telUrl()){ showToast("通話の準備ができていません（GAS のアドレスが未設定です）。"); return; }
    if(!window.RTCPeerConnection){ showToast("このブラウザでは通話できません。"); return; }
    const partner = telPartnerOf(room);
    if(partner && feat.blocks && feat.blocks.get(partner.id) === "block"){ showToast("ブロック中の相手には、電話できません。"); return; }
    telUnlockAudio();
    const call = telNewCall({room, role:"caller", kind});
    call.key = await telHash(room.id);
    tel.call = call; telOpenUi(call, "準備中…");
    try{
        call.stream = await telGetMedia(kind === "video");
        const servers = await telIceServers();
        if(tel.call !== call) return;
        const pc = telMakePc(call, servers);
        const a = pc.addTransceiver("audio", {direction:"sendrecv"}), v = pc.addTransceiver("video", {direction:"sendrecv"});
        await a.sender.replaceTrack(call.stream.getAudioTracks()[0] || null);
        const vt = call.stream.getVideoTracks()[0] || null;
        if(vt){ await v.sender.replaceTrack(vt); call.camOn = true; call.camStream = call.stream; }
        await pc.setLocalDescription(await pc.createOffer());
        await telGather(pc);
        if(tel.call !== call) return;
        const r = await telSend("ring", call, {kind, uid:(state.user && state.user.id) || "", sdp:pc.localDescription.sdp}, true);
        if(!r || !r.ok){ telEnd("電話をかけられませんでした。" + (r && r.message ? "（" + String(r.message).slice(0, 60) + "）" : "しばらくしてからお試しください。"), {notify:false, noRecord:true}); return; }
        tel.after[call.key] = r.n;
        call.ringAt = Date.now();
        telPushCall(call, false);   // アプリを閉じている相手にも、通知で知らせる
        telStatus("呼び出し中…"); telToneStart("out"); telPaintLocal();
        call.ringTimer = setTimeout(() => { if(tel.call === call && !call.answered) telEnd("応答がありませんでした。", {result:"missed"}); }, TEL_RING_MS);
        telSchedule(800);
    }catch(e){ telEnd(String(e && e.message || "電話をかけられませんでした。"), {notify:false, noRecord:true}); }
}

// ===== 受ける =====
function telIncoming(room, m, d){
    if(tel.incoming || tel.call){ return; }
    telBuildUi();
    const u = tel.ui, inc = {id:m.id, room, key:tel.keyOf.get(room.id), m, d, kind:d.kind === "video" ? "video" : "audio", t0:Date.now() - (m.age || 0)};
    tel.incoming = inc;
    u.inName.textContent = telNameOf(room);
    u.inKind.textContent = (inc.kind === "video" ? "ビデオ通話の着信です" : "音声通話の着信です") + (telQuiet() ? "（管理者は、着信音を消しています）" : "");
    telPaintAvatar(u.inAv, room);
    u.inVideo.hidden = inc.kind !== "video";
    u.inAudio.textContent = inc.kind === "video" ? "🎤 音声だけで出る" : "🎤 出る";
    u.inc.hidden = false;
    telToneStart("in");
    inc.timer = setTimeout(() => { if(tel.incoming === inc) telStopIncoming("不在着信"); }, Math.max(1000, TEL_RING_MS - (m.age || 0)));
    telTitleFlash(true);
    telNotify(inc, telNameOf(room));
    telAudioHint(u);
}
/** 相手のスマホ・PC に、アプリを閉じていても届く通知（Web Push）を頼む。失敗しても通話そのものには影響しない */
async function telPushCall(call, cancel){
    try{
        if(!call || !call.room || !state.user) return;
        const client = requireClient();
        const p = client.functions.invoke("call-push", {body:{room_id:call.room.id, kind:call.kind, cancel:!!cancel}});
        if(p && p.catch) p.catch(() => {});
    }catch(_e){}
}
/** 端末の「通知」で知らせる（スマホ・PC で設定している通知音がそのまま鳴る）。画面が見えているときも出す */
async function telNotify(inc, who){
    try{
        if(!("Notification" in window) || Notification.permission !== "granted") return;
        const opts = {body:(inc.kind === "video" ? "ビデオ通話" : "音声通話") + "の着信です。タップして出る", icon:"icon-192.png", tag:"are-call", renotify:true, requireInteraction:true, silent:telQuiet(), vibrate:[500, 150, 500, 150, 500], data:{call:1}};
        const title = "📞 着信：" + who;
        let reg = null;
        try{ reg = ("serviceWorker" in navigator) ? await navigator.serviceWorker.getRegistration() : null; }catch(_e){}
        if(reg && reg.showNotification){ await reg.showNotification(title, opts); inc.viaSw = true; }
        else{ const n = new Notification(title, opts); n.onclick = () => { try{ window.focus(); }catch(_e){} n.close(); }; inc.note = n; }
        if(tel.incoming !== inc) telCloseNotes();   // 通知を出すまでに 終わっていたとき
    }catch(_e){}
}
async function telCloseNotes(){
    try{
        const reg = ("serviceWorker" in navigator) ? await navigator.serviceWorker.getRegistration() : null;
        if(reg && reg.getNotifications){ (await reg.getNotifications({tag:"are-call"})).forEach((n) => n.close()); }
    }catch(_e){}
}
/** 音が出せない状態（まだ一度も画面を触っていない）のときは、案内を出す */
function telAudioHint(u){
    try{
        let h = u.inc.querySelector(".tel-hint");
        if(!h){ h = document.createElement("small"); h.className = "tel-hint"; h.style.cssText = "display:block;margin-top:8px;color:#ffd27c"; u.inc.appendChild(h); }
        const msgs = [];
        if(!tel.ac || tel.ac.state !== "running") msgs.push("🔊 画面をタッチすると、着信音が鳴ります。");
        if("Notification" in window && Notification.permission === "default") msgs.push("🔔 設定の「着信音をためす」で通知を許可すると、端末の通知音でもお知らせします。");
        h.textContent = msgs.join(" "); h.hidden = !msgs.length;
    }catch(_e){}
}
function telStopIncoming(why){
    const inc = tel.incoming; if(!inc) return;
    clearTimeout(inc.timer); telToneStop();
    try{ inc.note && inc.note.close(); }catch(_e){}
    if(inc.viaSw) telCloseNotes();
    tel.incoming = null;
    if(tel.ui) tel.ui.inc.hidden = true;
    if(why) showToast(why);
}
async function telDecline(){
    const inc = tel.incoming; if(!inc) return;
    telStopIncoming();
    telPost({op:"send", key:inc.key, type:"decline", from:tel.dev, id:inc.id, data:null});
}
async function telAccept(withVideo){
    const inc = tel.incoming; if(!inc) return;
    clearTimeout(inc.timer); telToneStop();
    try{ inc.note && inc.note.close(); }catch(_e){}
    if(inc.viaSw) telCloseNotes();
    tel.incoming = null; tel.ui.inc.hidden = true;
    telUnlockAudio();
    const call = telNewCall({id:inc.id, room:inc.room, key:inc.key, role:"callee", kind:inc.kind});
    tel.call = call; call.answered = true; telOpenUi(call, "つないでいます…");
    try{
        call.stream = await telGetMedia(!!withVideo && inc.kind === "video");
        const servers = await telIceServers();
        if(tel.call !== call) return;
        const pc = telMakePc(call, servers);
        await pc.setRemoteDescription({type:"offer", sdp:inc.d.sdp});
        const aT = pc.getTransceivers().find((t) => t.receiver.track.kind === "audio"), vT = pc.getTransceivers().find((t) => t.receiver.track.kind === "video");
        if(aT){ aT.direction = "sendrecv"; await aT.sender.replaceTrack(call.stream.getAudioTracks()[0] || null); }
        if(vT){
            vT.direction = "sendrecv";
            const vt = call.stream.getVideoTracks()[0] || null;
            if(vt){ await vT.sender.replaceTrack(vt); call.camOn = true; call.camStream = call.stream; }
        }
        await pc.setLocalDescription(await pc.createAnswer());
        await telGather(pc);
        if(tel.call !== call) return;
        const r = await telSend("answer", call, {sdp:pc.localDescription.sdp}, false);
        if(!r || !r.ok){ telEnd("つなげませんでした。もう一度お試しください。", {notify:false}); return; }
        tel.after[call.key] = r.n;
        telPaintLocal(); telSchedule(500);
    }catch(e){ telEnd(String(e && e.message || "つなげませんでした。"), {notify:true}); }
}

function telOpenUi(call, status){
    const u = telBuildUi();
    u.name.textContent = telNameOf(call.room);
    telPaintAvatar(u.av, call.room);
    u.av.hidden = false; u.remote.hidden = true; u.remote.srcObject = null; u.local.hidden = true;
    u.mic.classList.remove("off"); u.cam.classList.remove("off"); u.scr.classList.add("off"); u.emoTray.hidden = true; u.flipBox.hidden = true; u.remote.muted = false; u.local.classList.remove("mirror");
    u.mic.textContent = "🎤"; u.spk.textContent = "🔊"; u.spk.classList.remove("off");
    u.ov.hidden = false; telStatus(status);
    try{ document.body.style.overflow = "hidden"; }catch(_e){}
}
function telLive(call){
    if(call.startAt) return;
    call.startAt = Date.now(); call.answered = true; clearTimeout(call.ringTimer); telToneStop();
    telStatus("通話中 0:00");
    call.timer = setInterval(() => {
        const s = Math.floor((Date.now() - call.startAt) / 1000);
        telStatus("通話中 " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + (call.peerMuted ? " ・ 相手はミュート中" : ""));
    }, 1000);
    telSendState(call); telPaintLocal(); telPaintRemote(); telCountCams(call);
}

// ===== 通話中の操作 =====
function telToggleMic(){
    const call = tel.call; if(!call || !call.stream) return;
    call.muted = !call.muted;
    call.stream.getAudioTracks().forEach((t) => { t.enabled = !call.muted; });
    telSendState(call); telPaintLocal();
}
function telToggleSpeaker(){
    const call = tel.call, u = tel.ui; if(!call || !u) return;
    call.spkOff = !call.spkOff;
    u.remote.muted = call.spkOff;           // 相手の声を出す／止める
    if(!call.spkOff) u.remote.play && u.remote.play().catch(() => {});
    telPaintLocal();
    showToast(call.spkOff ? "スピーカーを止めました（相手の声が聞こえません）。" : "スピーカーをつけました。");
}
let telEmoAt = 0;
function telSendEmoji(e){
    const call = tel.call; if(!call || !TEL_EMOJIS.includes(e)) return;
    const now = Date.now(); if(now - telEmoAt < 300) return; telEmoAt = now;
    telFlyEmoji(e, "");
    try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"em", e})); else showToast("つながってから送れます。"); }catch(_e){}
}
function telFlyEmoji(e, who){
    const u = tel.ui; if(!u) return;
    const stage = u.ov.querySelector(".tel-stage"); if(!stage) return;
    const el = document.createElement("div"); el.className = "tel-fly";
    el.style.left = (15 + Math.random() * 70) + "%";
    el.textContent = e;
    if(who){ const sm = document.createElement("small"); sm.textContent = who; el.appendChild(sm); }
    stage.appendChild(el);
    setTimeout(() => { try{ el.remove(); }catch(_e){} }, 2600);
}
async function telCountCams(call){
    try{ call.camDevices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length; telPaintLocal(); }catch(_e){}
}
function telCanFlip(){ return !!(tel.call && (tel.call.camDevices > 1 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))); }
async function telFlipCamera(){
    const call = tel.call; if(!call || !call.pc || !call.camOn || call.scrOn || call.flipping) return;
    const sender = telSender(call.pc, "video"); if(!sender) return;
    call.flipping = true;
    try{
        const next = call.facing === "environment" ? "user" : "environment";
        let s = null;
        try{
            s = await navigator.mediaDevices.getUserMedia({audio:false, video:{width:{ideal:1280}, height:{ideal:720}, facingMode:{ideal:next}}});
        }catch(_e){ s = null; }
        // パソコンなど facingMode が効かないときは、カメラを順番に切りかえる
        let vt = s && s.getVideoTracks()[0];
        const curId = call.camStream && call.camStream.getVideoTracks()[0] && call.camStream.getVideoTracks()[0].getSettings().deviceId;
        const gotId = vt && vt.getSettings().deviceId;
        if(!vt || (curId && gotId === curId)){
            if(s) s.getTracks().forEach((t) => t.stop());
            const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
            if(devs.length < 2) throw new Error("切りかえられるカメラがありません。");
            const i = Math.max(0, devs.findIndex((d) => d.deviceId === curId));
            const nd = devs[(i + 1) % devs.length];
            s = await navigator.mediaDevices.getUserMedia({audio:false, video:{deviceId:{exact:nd.deviceId}}});
            vt = s.getVideoTracks()[0];
        }
        const old = call.camStream; 
        await sender.replaceTrack(vt);
        call.camStream = new MediaStream([vt]);
        try{ old && old.getVideoTracks().forEach((t) => { if(t !== vt) t.stop(); }); }catch(_e){}   // 声（マイク）は止めない
        call.facing = next;
        const fm = vt.getSettings && vt.getSettings().facingMode;
        if(fm === "environment" || fm === "user") call.facing = fm;
        showToast(call.facing === "environment" ? "外カメラにしました。" : "内カメラにしました。");
    }catch(e){ showToast(String(e && e.message || "カメラの向きを切りかえられませんでした。")); }
    call.flipping = false;
    telPaintLocal();
}
async function telToggleCam(){
    const call = tel.call; if(!call || !call.pc) return;
    const sender = telSender(call.pc, "video"); if(!sender) return;
    try{
        if(call.camOn){
            call.camStream && call.camStream.getVideoTracks().forEach((t) => t.stop());
            await sender.replaceTrack(null); call.camOn = false; call.camStream = null;
        }else{
            if(call.scrOn) await telStopScreen(true);
            const s = await telGetMedia(true);
            s.getAudioTracks().forEach((t) => t.stop());   // 声は、いまのマイクのまま
            const vt = s.getVideoTracks()[0];
            await sender.replaceTrack(vt); call.camOn = true; call.camStream = new MediaStream([vt]); call.facing = "user";
            try{ call.camDevices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length; }catch(_e){ call.camDevices = 0; }
        }
    }catch(e){ showToast(String(e && e.message || "カメラを切りかえられませんでした。")); }
    telSendState(call); telPaintLocal();
}
async function telToggleScreen(){
    const call = tel.call; if(!call || !call.pc) return;
    if(call.scrOn){ await telStopScreen(false); return; }
    if(!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)){ showToast("このブラウザでは画面共有ができません（パソコンのブラウザで使えます）。"); return; }
    const sender = telSender(call.pc, "video"); if(!sender) return;
    try{
        const s = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15, max:30}}, audio:false});
        const vt = s.getVideoTracks()[0];
        if(call.camOn){ call.camStream && call.camStream.getVideoTracks().forEach((t) => t.stop()); call.camOn = false; call.camStream = null; }
        await sender.replaceTrack(vt);
        call.scrOn = true; call.screenStream = s;
        vt.addEventListener("ended", () => { if(tel.call === call && call.scrOn) telStopScreen(false); });
    }catch(e){
        if(e && e.name === "NotAllowedError") showToast("画面共有をとりやめました。"); else showToast("画面共有をはじめられませんでした。");
    }
    telSendState(call); telPaintLocal();
}
async function telStopScreen(quiet){
    const call = tel.call; if(!call) return;
    try{ call.screenStream && call.screenStream.getTracks().forEach((t) => t.stop()); }catch(_e){}
    call.scrOn = false; call.screenStream = null;
    try{ const sender = call.pc && telSender(call.pc, "video"); if(sender) await sender.replaceTrack(null); }catch(_e){}
    if(!quiet){ telSendState(call); telPaintLocal(); }
}

// ===== 終わる =====
function telEnd(reason, opts){
    const call = tel.call; opts = opts || {};
    if(!call || call.ended){ telStopIncoming(); return; }
    call.ended = true; tel.call = null;
    clearTimeout(call.ringTimer); clearTimeout(call.dcTimer); clearInterval(call.timer); telToneStop();
    if(opts.notify !== false){
        try{ if(call.dc && call.dc.readyState === "open") call.dc.send(JSON.stringify({t:"bye"})); }catch(_e){}
        const type = call.answered ? "hangup" : "cancel";
        telPost({op:"send", key:call.key, type, from:tel.dev, id:call.id, data:null});
        if(call.role === "caller" && !call.answered) telPushCall(call, true);   // 閉じている相手の「着信」通知も消す
    }
    const sec = call.startAt ? Math.round((Date.now() - call.startAt) / 1000) : 0;
    try{ call.stream && call.stream.getTracks().forEach((t) => t.stop()); }catch(_e){}
    try{ call.camStream && call.camStream.getTracks().forEach((t) => t.stop()); }catch(_e){}
    try{ call.screenStream && call.screenStream.getTracks().forEach((t) => t.stop()); }catch(_e){}
    try{ call.dc && call.dc.close(); }catch(_e){}
    try{ call.pc && call.pc.close(); }catch(_e){}
    if(tel.ui){ tel.ui.ov.hidden = true; tel.ui.remote.srcObject = null; tel.ui.local.srcObject = null; }
    try{ document.body.style.overflow = ""; }catch(_e){}
    if(reason) showToast(reason);
    // かけた側だけが、チャットに記録を1つ残す（「不在着信」「通話 3:12」など）
    if(call.role === "caller" && !opts.noRecord){
        const result = sec > 0 ? "ended" : (opts.result || (reason && /断/.test(reason) ? "declined" : "missed"));
        try{ Promise.resolve(sendPayloadToRoom(call.room.id, {type:"call", kind:call.kind, result, sec})).catch(() => {}); }catch(_e){}
    }
    telSchedule(1500);
}

// ===== 郵便受けを見にいく =====
function telSchedule(ms){ clearTimeout(tel.poll); tel.poll = setTimeout(telTick, ms); }
async function telTick(){
    let next = tel.pollMs + Math.random() * 1500;
    try{
        if(!telUrl() || !state.user){ next = 8000; }
        else if(tel.call){ await telPollCall(); next = tel.call && tel.call.answered && tel.call.startAt ? 1500 : 1000; }
        else if(tel.on){ if(document.hidden) next = 15000 + Math.random() * 3000; await telPollIdle(); }
        else next = 30000;
        tel.errs = 0;
    }catch(_e){ tel.errs = Math.min(tel.errs + 1, 6); next = Math.min(60000, 4000 * Math.pow(2, tel.errs)); }
    telSchedule(next);
}
async function telPollIdle(){
    const rooms = (state.rooms || []).filter((r) => r && !r.is_group && !r.orphan && r.id).slice(0, 40);
    if(!rooms.length) return;
    const keys = [];
    for(const r of rooms){ keys.push(await telHash(r.id)); }
    const res = await telPost({op:"poll", keys, after:tel.after, me:tel.dev}, 12000);
    if(!res || !res.ok) throw new Error("poll");
    if(res.pollMs) tel.pollMs = Math.max(3000, Math.min(30000, Number(res.pollMs) || 6000));
    telApply(res);
}
async function telPollCall(){
    const call = tel.call; if(!call || !call.key) return;
    const res = await telPost({op:"poll", keys:[call.key], after:tel.after, me:tel.dev}, 8000);
    if(!res || !res.ok) throw new Error("poll");
    telApply(res);
}
function telApply(res){
    const r = res.r || {};
    for(const k of Object.keys(r)){
        const box = r[k], roomId = tel.roomOfKey.get(k);
        let top = typeof tel.after[k] === "number" ? tel.after[k] : 0;
        for(const m of (box.m || [])){ top = Math.max(top, m.n); telOnMsg(roomId, k, m); }
        tel.after[k] = Math.max(top, Number(box.n) || 0);
    }
}
function telOnMsg(roomId, key, m){
    let d = null; try{ d = m.d ? JSON.parse(m.d) : {}; }catch(_e){ d = {}; }
    const call = tel.call;
    if(call && call.id === m.id){
        if(m.ty === "answer" && call.role === "caller" && !call.answered && d.sdp){
            call.answered = true; call.peerDev = m.f || ""; clearTimeout(call.ringTimer); telToneStop(); telStatus("つないでいます…");
            call.pc.setRemoteDescription({type:"answer", sdp:d.sdp}).catch(() => telEnd("つなげませんでした。", {notify:true}));
        }else if(m.ty === "answer" && call.role === "caller" && call.answered && m.f && call.peerDev && m.f !== call.peerDev){
            // 相手の別の端末も出てしまった：先に出た端末とだけつなぎ、あとの端末は切る
            telPost({op:"send", key, type:"busy", from:tel.dev, id:call.id, data:{to:m.f}});
        }else if(m.ty === "busy" && call.role === "callee" && !call.startAt && d && d.to === tel.dev){
            telEnd("ほかの端末が先に出たため、切れました。", {notify:false, noRecord:true});
        }else if(m.ty === "decline" || m.ty === "busy"){
            if(call.role === "caller" && !call.answered) telEnd(m.ty === "busy" ? "相手は、ほかの通話中です。" : "通話は断られました。", {notify:false, result:"declined"});
        }else if(m.ty === "hangup" || m.ty === "cancel"){
            telEnd("相手が切りました。", {notify:false});
        }
        return;
    }
    if(tel.incoming && tel.incoming.id === m.id){
        if(m.ty === "cancel") telStopIncoming("不在着信がありました。");
        else if(m.ty === "answer" || m.ty === "decline") telStopIncoming("ほかの端末で応答しました。");
        return;
    }
    if(m.ty !== "ring" || tel.handled.has(m.id)) return;
    tel.handled.add(m.id);
    if(d && d.uid && state.user && d.uid === state.user.id) return;   // 自分の別の端末からかけた着信は、こちらでは鳴らさない
    if(!tel.on || (m.age || 0) > TEL_RING_MS || !d.sdp) return;
    const room = (state.rooms || []).find((x) => x.id === roomId);
    if(!room || room.is_group) return;
    const p = telPartnerOf(room);
    if(p && feat.blocks && feat.blocks.get(p.id)) return;   // ブロック・ミュートした相手の着信は鳴らさない
    if(tel.call || tel.incoming){ telPost({op:"send", key, type:"busy", from:tel.dev, id:m.id, data:null}); return; }
    telIncoming(room, m, d);
}

// ===== 設定・ボタン =====
function telSetOn(on){
    tel.on = !!on;
    try{ localStorage.setItem(TEL_ON_KEY, on ? "1" : "0"); }catch(_e){}
    telPaintSetting();
    if(!on) telStopIncoming();
}
/** 設定の「着信音をためす」：通知の許可を聞き、大きな着信音を 3 秒ならし、通知も1つ出す */
async function telTestRing(){
    telUnlockAudio();
    try{ if("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); }catch(_e){}
    if(tel.incoming || tel.call){ showToast("いま着信中・通話中です。"); return; }
    const perm = ("Notification" in window) ? Notification.permission : "unsupported";
    telToneStart("in");
    setTimeout(() => { if(!tel.incoming && !tel.call) telToneStop(); }, 3200);
    try{
        if(perm === "granted"){
            const reg = ("serviceWorker" in navigator) ? await navigator.serviceWorker.getRegistration() : null;
            const o = {body:"これは着信音のテストです。", icon:"icon-192.png", tag:"are-call-test", renotify:true, silent:false, vibrate:[500, 150, 500]};
            if(reg && reg.showNotification) await reg.showNotification("📞 着信のテスト", o); else new Notification("📞 着信のテスト", o);
        }
    }catch(_e){}
    const quiet = telQuiet();
    showToast(quiet ? "（管理者は、着信音が消えます。音は鳴りません）" : (tel.ac && tel.ac.state === "running" ? "着信音をならしています。" : "音が出せません。画面をもう一度さわってください。") + (perm === "granted" ? " 通知も出しました（端末の通知音は、端末の設定どおりです）。" : perm === "denied" ? " 通知が許可されていません（ブラウザの設定で許可すると、端末の通知音でも知らせます）。" : ""));
}
function telPaintSetting(){
    const b = document.getElementById("telSetItem"); if(!b) return;
    b.querySelector("small").textContent = tel.on ? "いま：着信を受けます（ここを押すと、受けない設定に）" : "いま：着信を受けません（ここを押すと、受ける設定に）";
    b.firstChild.textContent = tel.on ? "📞 着信を受ける：ON" : "🔕 着信を受ける：OFF";
}

function initCall(){
    try{ tel.on = localStorage.getItem(TEL_ON_KEY) !== "0"; }catch(_e){}
    try{ tel.dev = sessionStorage.getItem("are_tel_dev") || ""; if(!tel.dev){ tel.dev = telRand(12); sessionStorage.setItem("are_tel_dev", tel.dev); } }catch(_e){ tel.dev = telRand(12); }
    const head = document.querySelector(".chat-header"), search = document.getElementById("searchBtn");
    if(head){
        const mk = (id, txt, title, kind) => {
            const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "button-secondary"; b.hidden = true; b.textContent = txt; b.title = title; b.setAttribute("aria-label", title);
            b.addEventListener("click", () => runTool(() => telStart(kind)));
            head.insertBefore(b, search || null);
            return b;
        };
        const a = mk("telAudioBtn", "📞", "音声通話（電話）", "audio"), v = mk("telVideoBtn", "🎥", "ビデオ通話（画面共有もできます）", "video");
        addRoomHook((room) => { const ok = !!room && !room.is_group && !room.orphan && !!telUrl(); a.hidden = !ok; v.hidden = !ok; });
    }
    const set = document.getElementById("telSetItem");
    if(set){
        set.addEventListener("click", () => {
            telUnlockAudio();
            telSetOn(!tel.on);
            try{ if(tel.on && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); }catch(_e){}
            if(tel.on) telBeep(880, 0, 0.15, 0.2);   // 音が出るか、ためせます
        });
        telPaintSetting();
    }
    const tt = document.getElementById("telTestItem");
    if(tt) tt.addEventListener("click", telTestRing);
    extraBubbles.call = (item) => {
        const ico = item.kind === "video" ? "🎥" : "📞", sec = Number(item.sec) || 0;
        const t = item.result === "ended" ? (item.kind === "video" ? "ビデオ通話" : "通話") + " " + Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0")
            : item.result === "declined" ? "通話は断られました" : "不在着信（応答がありませんでした）";
        return '<div class="bubble">' + ico + ' <b>' + escapeHtml(t) + '</b></div>';
    };
    document.addEventListener("pointerdown", telUnlockAudio, {passive:true});
    document.addEventListener("touchend", telUnlockAudio, {passive:true});
    document.addEventListener("click", telUnlockAudio, {passive:true});
    document.addEventListener("keydown", telUnlockAudio, {passive:true});
    document.addEventListener("visibilitychange", () => { if(!document.hidden && tel.on && !tel.call) telSchedule(300); });
    window.addEventListener("pagehide", () => {
        const call = tel.call;
        if(call && !call.ended && telUrl()){
            try{ navigator.sendBeacon(telUrl(), JSON.stringify({action:"call", op:"send", key:call.key, type:call.answered ? "hangup" : "cancel", from:tel.dev, id:call.id, data:null})); }catch(_e){}
        }
    });
    window.AREtel = {state:tel, quiet:telQuiet, start:telStart, end:telEnd, accept:telAccept, decline:telDecline, tick:() => telSchedule(10)};
    telSchedule(2500);
}
