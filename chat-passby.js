"use strict";
// ===== すれ違いタウン（近くにいた人と、自動で「すれ違い」になる）=====
// 仕組み（かんたんに）
//  ・ふだんは何もしません。AREを開いていて、位置の許可があるあいだだけ、1分に1回、いまいる「ざっくりの区画」を知らせます。
//  ・区画は、この端末で 暗号のような文字（ハッシュ）にしてから送ります。正確な場所・住所・地名は、サーバーに来ません。保存もしません。
//  ・同じ区画（およそ数百メートル四方）に、20分いないに いた人どうしが「すれ違い」になります。つまり、少しあとに来た人とも すれ違えます（あとからすれ違い）。
//  ・すれ違いの記録は「だれと・いつ・何回」だけ。場所は入りません。ひとこと・気分は、決まった一覧から選ぶだけ（自由に書けない）。
//  ・かけらパズル（6まい×9かけら）：すれ違うたびに1つもらえます。1まいそろえるとポイント。
//  ・かざし合い：QRコード（3分だけ有効）を見せ合って、その場ですれ違いにします（位置は使いません）。
//  ・いつでも、オフ・記録の削除ができます。ブロック／ミュートした人・お試し（ゲスト）・管理者とは すれ違いません。
//  ・ブラウザの決まりで、AREを閉じているあいだは位置が取れません。そのかわり、あとからすれ違い／かざし合い／おでかけモード（画面をつけたまま）があります。
const PB_GRID = 0.003, PB_EDGE = 0.0007, PB_SALT = "ARE-passby-v1";
const PB_GREET = ["こんにちは！", "はじめまして！", "よろしくね！", "今日もいい天気だね", "おつかれさま！", "ゲームしよう！", "おなかすいたね", "のんびり中です", "おさんぽ中！", "また会えたね！", "いい一日を！", "チャットしよう！", "音楽をきいてるよ", "勉強をがんばってる", "散歩日和だね", "ひとやすみ中", "ぼうけんに出発！", "ちょっとねむい…", "お昼は何を食べた？", "笑顔でいこう", "ありがとう！", "元気だよ！", "ひまだよー", "またね！"];
const PB_MOOD = [["🙂", "ふつう"], ["😀", "ごきげん"], ["😌", "のんびり"], ["🤔", "考えごと"], ["😴", "ねむい"], ["🎮", "ゲーム気分"], ["📚", "勉強中"], ["🍙", "おなかすいた"], ["🚶", "おでかけ中"], ["🎧", "音楽きいてる"], ["🌟", "わくわく"], ["😅", "いそがしい"]];
const PB_SETS = ["夕やけの海", "星ぞらの丘", "花ばたけ", "雪のまち", "もりの小道", "にじのそら"];
const PB_LEVELS = [[0, "はじめの一歩"], [1, "すれ違いビギナー"], [5, "顔見知りさん"], [15, "まちの人気者"], [30, "広場の名人"], [60, "町のレジェンド"], [120, "伝説の旅人"]];
const pb = {avail:null, st:null, perm:"unknown", timer:0, busy:false, lastPing:0, lastUnseenAt:0, unseen:0, toasted:new Set(), popTimer:0, stream:null, raf:0, qrTimer:0, qrPoll:0, qrExpire:0, qrStart:0, qrFound:false, wake:null, invited:false, lastErr:""};

const pbKey = (n) => "are_pb_" + n + "_" + (state.user ? state.user.id : "x");
const pbGet = (n) => { try{ return localStorage.getItem(pbKey(n)); }catch(_e){ return null; } };
const pbSet = (n, v) => { try{ if(v === null) localStorage.removeItem(pbKey(n)); else localStorage.setItem(pbKey(n), String(v)); }catch(_e){ /* 保存できなくても動く */ } };

async function pbRpc(name, args){
    const r = await requireClient().rpc(name, args || {});
    if(r.error) throw r.error;
    return r.data;
}
const pbMissing = (e) => !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(String(e.message || "")));

function initPassby(){
    registerTool("pb", onPassbyAction);
    pbPaintCard();
    pbBoot();
    document.addEventListener("visibilitychange", () => { if(!document.hidden && pb.avail){ pbSchedule(1500); pbWakeSync(); } });
    window.addEventListener("online", () => { if(pb.avail) pbSchedule(2000); });
}

async function pbBoot(){
    try{
        const r = await pbRpc("passby_settings_get_v1");
        if(!r || r.ok === false){ pb.avail = false; pbPaintCard(); return; }
        pb.avail = true; pb.unseen = Number(r.unseen) || 0;
        pb.st = {enabled:!!r.enabled, scope:r.scope === "friends" ? "friends" : "everyone", greeting_id:Number(r.greeting_id) || 0, mood_id:Number(r.mood_id) || 0};
    }catch(e){
        if(pbMissing(e)){ pb.avail = false; pbPaintCard(); return; }        // サーバーの準備がまだ → 何も出さない
        console.error("[ARE passby]", e); setTimeout(pbBoot, 60000); return;
    }
    pbPaintCard();
    await pbPermRefresh();
    pbSchedule(3000);
    pbWakeSync();
    setTimeout(pbMaybeInvite, 7000);
}

// 準備ができていない／お試し（ゲスト）のときは、「その他」の入口を出さない。できているときは、新しいすれ違いの数を出す
function pbPaintCard(){
    document.querySelectorAll('[data-tool="passby"]').forEach((b) => {
        b.hidden = pb.avail !== true;
        let tag = b.querySelector(".pb-badge");
        if(pb.avail && pb.unseen > 0){
            if(!tag){ tag = document.createElement("span"); tag.className = "pb-badge"; b.appendChild(tag); }
            tag.textContent = "新しいすれ違い " + pb.unseen;
        }else if(tag) tag.remove();
    });
}

// ---------- 位置 ----------
async function pbPermRefresh(){
    if(!navigator.geolocation){ pb.perm = "none"; return; }
    try{
        if(navigator.permissions && navigator.permissions.query){
            const s = await navigator.permissions.query({name:"geolocation"});
            pb.perm = s.state;
            s.onchange = () => { pb.perm = s.state; if(pb.perm === "granted") pbSchedule(1500); };
            return;
        }
    }catch(_e){ /* 次の方法へ */ }
    pb.perm = pbGet("geo") === "1" ? "granted" : "prompt";
}
function pbGetPos(fresh){
    return new Promise((res, rej) => {
        if(!navigator.geolocation){ rej({code:0}); return; }
        navigator.geolocation.getCurrentPosition(res, rej, {enableHighAccuracy:false, timeout:fresh ? 20000 : 12000, maximumAge:fresh ? 0 : 45000});
    });
}
async function pbHash(s){
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** 緯度・経度 → ざっくりの区画（境目に近いときは、となりの区画もふくめて最大4つ）のハッシュ。日本時間の日づけで毎日かわる */
async function pbCells(lat, lng){
    const day = new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Tokyo"}).format(new Date());
    const m = PB_EDGE / PB_GRID, fa = lat / PB_GRID, fo = lng / PB_GRID, ia = Math.floor(fa), io = Math.floor(fo);
    const las = [ia], los = [io];
    if(fa - ia < m) las.push(ia - 1); else if(ia + 1 - fa < m) las.push(ia + 1);
    if(fo - io < m) los.push(io - 1); else if(io + 1 - fo < m) los.push(io + 1);
    const out = [];
    for(const la of las) for(const lo of los) out.push(await pbHash(PB_SALT + "|" + day + "|" + la + "|" + lo));
    return out;
}

// ---------- 1分ごとの「いまここ」の知らせ ----------
const pbOuting = () => Number(pbGet("out")) > Date.now();
const pbInterval = () => pbOuting() ? 30000 : 60000;
const pbCanRun = () => pb.avail === true && !!pb.st && pb.st.enabled && pb.perm === "granted" && !document.hidden && navigator.onLine !== false;
function pbSchedule(ms){ clearTimeout(pb.timer); pb.timer = setTimeout(pbTick, ms); }

async function pbTick(){
    pbSchedule(pbInterval());                    // 次の予約を先にしておく（途中で失敗しても止まらない）
    if(!pbCanRun() || pb.busy) return;
    pb.busy = true;
    try{ await pbPingOnce(); }
    catch(e){
        pb.lastErr = String((e && e.message) || e);
        if(e && e.code === 1){ pb.perm = "denied"; }                      // 位置を止められた
        else if(!(e && (e.code === 2 || e.code === 3))) console.error("[ARE passby]", e);
    }finally{ pb.busy = false; }
}

async function pbPingOnce(){
    const pos = await pbGetPos(false);
    if(Number(pos.coords.accuracy) > 1500){ pb.lastErr = "accuracy"; return; }    // 位置があらすぎる（IPアドレスだけの推定など）ときは、まちがいのもとなので送らない
    const cells = await pbCells(pos.coords.latitude, pos.coords.longitude);
    const r = await pbRpc("passby_ping_v1", {p_cells:cells});
    pb.lastErr = "";
    if(r && r.ok === false){ if(r.error === "guest"){ pb.avail = false; pbPaintCard(); } return; }
    if(r && r.enabled === false){ if(pb.st) pb.st.enabled = false; return; }
    if(!r || r.throttled) return;
    pb.lastPing = Date.now();
    if(r.new && r.new.length){
        pbCelebrate(r.new);
        pbRpc("passby_mark_seen_v1", {p_ids:r.new.map((c) => c.id)}).catch(() => {});     // いま見せたので「新しい」から外す
    }
    if(Date.now() - pb.lastUnseenAt > 90000) await pbCheckUnseen();
}

// あとから来た人が すれ違ってくれた分（自分の画面は、その人の操作で記録される）を、知らせる
async function pbCheckUnseen(){
    pb.lastUnseenAt = Date.now();
    const r = await pbRpc("passby_settings_get_v1");
    if(!r || r.ok === false) return;
    pb.unseen = Number(r.unseen) || 0; pbPaintCard();
    if(pb.unseen > 0 && el.profileModal.hidden){
        const list = await pbRpc("passby_inbox_v1", {p_limit:10});
        const fresh = (list || []).filter((c) => !c.seen && !pb.toasted.has(c.id + ":" + c.last_at));
        fresh.forEach((c) => pb.toasted.add(c.id + ":" + c.last_at));
        if(fresh.length) pbCelebrate(fresh);
    }
}

// ---------- 「すれ違いました！」の知らせ（1回だけ静かに出る。点滅・動きなし） ----------
function pbPopRemove(){ clearTimeout(pb.popTimer); const o = document.getElementById("pbPop"); if(o) o.remove(); }
function pbPop(html, ms){
    pbPopRemove();
    const d = document.createElement("div");
    d.id = "pbPop"; d.className = "pb-pop"; d.setAttribute("role", "status");
    d.innerHTML = html;
    d.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pb]");
        if(!b) return;
        const a = b.dataset.pb;
        pbPopRemove();
        if(a === "inbox") runTool(openPbInbox);
        else if(a === "intro") runTool(openPbIntro);
        else if(a === "later"){ pbSet("inv", Date.now()); }
    });
    document.body.appendChild(d);
    if(ms) pb.popTimer = setTimeout(pbPopRemove, ms);
}
function pbCelebrate(list){
    const names = list.map((c) => escapeHtml(c.name || "ユーザー"));
    const head = list.length === 1 ? "<b>" + names[0] + "</b> さんとすれ違いました！"
        : "<b>" + names.slice(0, 2).join("さん・") + "</b> さん" + (list.length > 2 ? " ほか" + (list.length - 2) + "人" : "") + "と すれ違いました！";
    const c0 = list[0], gr = PB_GREET[c0.greeting_id] || PB_GREET[0], mo = PB_MOOD[c0.mood_id] || PB_MOOD[0];
    pbPop('<div class="pb-pop-ic">📡</div><div class="pb-pop-tx">' + head + '<small>' + mo[0] + ' 「' + escapeHtml(gr) + '」 ・ 🧩 かけら ' + (list.length > 1 ? "+" + list.length : "+1") + '</small></div>' +
        '<button type="button" data-pb="inbox">見る</button><button type="button" class="pb-x" data-pb="x" aria-label="閉じる">✕</button>', 9000);
}
// はじめて：位置の許可を、ブラウザにたずねる前に、説明の画面へ案内する
function pbMaybeInvite(){
    if(pb.invited || !pbCanInvite()) return;
    const t = Number(pbGet("inv")) || 0;
    if(Date.now() - t < 7 * 86400000) return;
    pb.invited = true;
    pbPop('<div class="pb-pop-ic">📡</div><div class="pb-pop-tx"><b>すれ違いタウン</b>が はじまります<small>近くにいた人と、自動ですれ違いに。位置は「ざっくりの区画」だけ・いつでもオフにできます。</small></div>' +
        '<button type="button" data-pb="intro">くわしく</button><button type="button" class="pb-x" data-pb="later">あとで</button>', 0);
}
const pbCanInvite = () => pb.avail === true && !!pb.st && pb.st.enabled && pb.perm === "prompt" && document.body.contains(el.messages) && !!state.user;

// ---------- 画面の部品 ----------
function pbAgo(t){
    const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
    if(s < 90) return "いま"; if(s < 3600) return Math.round(s / 60) + "分前"; if(s < 86400) return Math.round(s / 3600) + "時間前"; return Math.round(s / 86400) + "日前";
}
function pbAv(c){
    const u = safeHttpUrl(c.avatar_url || "");
    return '<span class="avatar pb-av">' + (u ? '<img src="' + escapeHtml(u) + '" alt="">' : escapeHtml(shortName(c.name || "ユーザー"))) + '</span>';
}
function pbCardHtml(c, extra){
    const gr = PB_GREET[c.greeting_id] || PB_GREET[0], mo = PB_MOOD[c.mood_id] || PB_MOOD[0];
    const piece = c.piece !== null && c.piece !== undefined && c.piece >= 0 && c.piece < 54 ? "🧩 " + PB_SETS[Math.floor(c.piece / 9)] + " の かけら #" + (c.piece % 9 + 1) : "";
    return '<div class="admin-card pb-card"><div class="pb-row">' + pbAv(c) + '<div class="pb-main"><div><b>' + escapeHtml(c.name || "ユーザー") + '</b>' +
        (c.seen === false ? ' <span class="pb-tag">NEW</span>' : "") + (c.friend ? ' <span class="pb-tag">友だち</span>' : "") + '</div>' +
        '<div class="meta">' + mo[0] + " " + mo[1] + ' ・ 「' + escapeHtml(gr) + '」</div>' +
        (c.last_at ? '<div class="meta">' + (c.count || 1) + '回目 ・ ' + pbAgo(c.last_at) + (c.kind === "qr" ? " ・ かざし合い" : "") + '</div>' : "") +
        (piece ? '<div class="meta">' + piece + '</div>' : "") + '</div></div>' +
        '<div class="row"><button type="button" data-t="pb:chat" data-id="' + escapeHtml(c.id) + '">💬 チャット</button><button type="button" class="button-secondary" data-t="pb:prof" data-id="' + escapeHtml(c.id) + '">👤 プロフィール</button></div>' + (extra || "") + '</div>';
}
function pbLevel(n){ let t = PB_LEVELS[0][1]; PB_LEVELS.forEach((l) => { if(n >= l[0]) t = l[1]; }); return t; }
function pbNextLevel(n){ const l = PB_LEVELS.find((x) => x[0] > n); return l ? l : null; }

// 6つの場面（すべて、このアプリのために描いたオリジナル。実在の場所・作品とは関係ありません）
function pbScene(i, u){
    const st = (n, ...a) => '<stop offset="' + n + '" stop-color="' + a[0] + '"/>';
    const grad = (id, stops) => '<defs><linearGradient id="' + u + id + '" x1="0" y1="0" x2="0" y2="1">' + stops.map((s) => st(s[0], s[1])).join("") + '</linearGradient></defs>';
    if(i === 0) return grad("g", [[0, "#ff9a6b"], [0.6, "#ffd6a0"], [1, "#ffe9c2"]]) + '<rect width="300" height="300" fill="url(#' + u + 'g)"/><circle cx="150" cy="150" r="42" fill="#fff3cf"/>' +
        '<rect y="165" width="300" height="135" fill="#3b6fa0"/><rect x="110" y="168" width="80" height="7" fill="#ffd9a3" opacity=".85"/><rect y="186" width="300" height="5" fill="#4f86b8"/><rect y="212" width="300" height="5" fill="#4f86b8"/><rect y="244" width="300" height="5" fill="#2f5d8a"/>' +
        '<path d="M196 214h46l-9 16h-28z" fill="#7a4a2b"/><path d="M219 214v-38l22 38z" fill="#ffffff"/><path d="M217 214v-30l-16 30z" fill="#ffe3b5"/>';
    if(i === 1){
        let s = grad("g", [[0, "#0b1b4a"], [1, "#2e4aa8"]]) + '<rect width="300" height="300" fill="url(#' + u + 'g)"/>';
        for(let k = 0; k < 34; k++){ const x = (k * 97 + 23) % 300, y = (k * 61 + 11) % 170, r = k % 5 === 0 ? 2.2 : 1.2; s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff8d6"/>'; }
        return s + '<circle cx="225" cy="62" r="26" fill="#fff6c8"/><circle cx="216" cy="56" r="5" fill="#f1e6a8"/><circle cx="234" cy="72" r="4" fill="#f1e6a8"/>' +
            '<ellipse cx="70" cy="290" rx="190" ry="90" fill="#1f4d3a"/><ellipse cx="240" cy="296" rx="170" ry="80" fill="#2c6b4a"/><rect x="60" y="188" width="6" height="26" fill="#5a3b24"/><circle cx="63" cy="182" r="18" fill="#2f7a52"/>';
    }
    if(i === 2){
        let s = '<rect width="300" height="300" fill="#bfe6ff"/><circle cx="240" cy="50" r="26" fill="#fff3a8"/><ellipse cx="80" cy="190" rx="180" ry="70" fill="#8fd18a"/><rect y="190" width="300" height="110" fill="#6cbf6b"/>';
        const cols = ["#ff6b8b", "#ffd24d", "#ffffff", "#c58bff", "#ff9f4d"];
        for(let k = 0; k < 28; k++){ const x = (k * 53 + 17) % 280 + 10, y = 205 + (k * 37) % 85, c = cols[k % 5]; s += '<rect x="' + (x - 0.8) + '" y="' + y + '" width="1.6" height="12" fill="#3f8f4a"/>' + [0, 72, 144, 216, 288].map((a) => '<circle cx="' + (x + 5 * Math.cos(a * Math.PI / 180)).toFixed(1) + '" cy="' + (y + 5 * Math.sin(a * Math.PI / 180)).toFixed(1) + '" r="4" fill="' + c + '"/>').join("") + '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="#ffd24d"/>'; }
        return s;
    }
    if(i === 3){
        let s = grad("g", [[0, "#cfe3ff"], [1, "#f4f9ff"]]) + '<rect width="300" height="300" fill="url(#' + u + 'g)"/><rect y="205" width="300" height="95" fill="#ffffff"/><ellipse cx="150" cy="208" rx="190" ry="14" fill="#eef4fb"/>';
        [[40, 150, 70, "#c0504d"], [140, 140, 80, "#4d7fc0"], [235, 155, 60, "#c0a04d"]].forEach((h) => { s += '<rect x="' + h[0] + '" y="' + h[1] + '" width="' + h[2] + '" height="' + (205 - h[1]) + '" fill="' + h[3] + '"/><path d="M' + (h[0] - 6) + ' ' + h[1] + 'L' + (h[0] + h[2] / 2) + ' ' + (h[1] - 30) + 'L' + (h[0] + h[2] + 6) + ' ' + h[1] + 'z" fill="#ffffff" stroke="#d9e4f2"/><rect x="' + (h[0] + 12) + '" y="' + (h[1] + 14) + '" width="14" height="16" fill="#ffe28a"/><rect x="' + (h[0] + h[2] - 26) + '" y="' + (h[1] + 14) + '" width="14" height="16" fill="#ffe28a"/>'; });
        for(let k = 0; k < 30; k++) s += '<circle cx="' + ((k * 71 + 9) % 300) + '" cy="' + ((k * 43 + 5) % 260) + '" r="' + (k % 3 + 1.2) + '" fill="#ffffff" stroke="#e3ecf7" stroke-width=".4"/>';
        return s;
    }
    if(i === 4){
        let s = '<rect width="300" height="300" fill="#d8efc9"/><circle cx="240" cy="48" r="24" fill="#fff7b0"/><path d="M120 300L150 150H170L230 300z" fill="#e6d3a3"/>';
        [[20, 150, 1.0], [70, 170, 0.8], [200, 140, 1.1], [255, 175, 0.8], [110, 120, 0.7]].forEach((t) => { const x = t[0], y = t[1], k = t[2]; s += '<rect x="' + (x - 4 * k) + '" y="' + y + '" width="' + 8 * k + '" height="' + 42 * k + '" fill="#6b4a2e"/>' + [0, 1, 2].map((j) => '<path d="M' + (x - (34 - j * 6) * k) + ' ' + (y + (14 - j * 24) * k) + 'L' + x + ' ' + (y - (30 + j * 24) * k) + 'L' + (x + (34 - j * 6) * k) + ' ' + (y + (14 - j * 24) * k) + 'z" fill="' + ["#2f7a45", "#3a8f52", "#47a35f"][j] + '"/>').join(""); });
        return s;
    }
    let s = '<rect width="300" height="300" fill="#a9d8ff"/>';
    ["#ff5d5d", "#ffa24d", "#ffe45d", "#5dd27a", "#5da8ff", "#8b6bff"].forEach((c, k) => { s += '<path d="M' + (30 + k * 11) + ' 230A' + (120 - k * 11) + ' ' + (120 - k * 11) + ' 0 0 1 ' + (270 - k * 11) + ' 230" fill="none" stroke="' + c + '" stroke-width="12"/>'; });
    return s + '<g fill="#ffffff"><circle cx="40" cy="215" r="20"/><circle cx="64" cy="205" r="24"/><circle cx="88" cy="217" r="18"/><circle cx="214" cy="212" r="18"/><circle cx="238" cy="203" r="24"/><circle cx="264" cy="216" r="18"/></g><rect y="236" width="300" height="64" fill="#7bcf6f"/>';
}
function pbPieceHtml(set, idx, n){
    const u = "p" + set + "_" + idx + "_";
    if(!n) return '<span class="pb-pc off"><svg viewBox="0 0 100 100" aria-label="まだ"><rect width="100" height="100" fill="#26304a"/><text x="50" y="63" text-anchor="middle" font-size="40" fill="#5b6a91">?</text></svg></span>';
    return '<span class="pb-pc"><svg viewBox="' + (idx % 3 * 100) + " " + (Math.floor(idx / 3) * 100) + ' 100 100" aria-label="' + escapeHtml(PB_SETS[set]) + " " + (idx + 1) + '">' + pbScene(set, u) + '</svg>' + (n > 1 ? '<i class="pb-dup">×' + n + '</i>' : "") + '</span>';
}

// ---------- メイン画面 ----------
function pbStatusHtml(){
    const on = pb.st && pb.st.enabled;
    const geo = pb.perm === "granted" ? "📍 位置：使えます" + (pb.lastPing ? "（さいごの更新：" + pbAgo(pb.lastPing) + "）" : "") + (pb.lastErr === "accuracy" ? " ※いまは位置があらすぎて、すれ違えません" : "")
        : pb.perm === "denied" ? "📍 位置：ブラウザで止められています"
        : pb.perm === "none" ? "📍 この端末では位置が使えません（かざし合いは使えます）"
        : "📍 位置：まだ許可していません";
    return '<div class="admin-card pb-status"><div><b>' + (on ? "✅ すれ違い：オン" : "⏸ すれ違い：オフ") + '</b> <span class="meta">（' + (pb.st && pb.st.scope === "friends" ? "友だちだけ" : "知らない人もOK") + '）</span></div>' +
        '<div class="meta">' + geo + '</div>' + (pbOuting() ? '<div class="meta">🎒 おでかけモード中（画面をつけたままにします）</div>' : "") +
        (on && pb.perm !== "granted" && pb.perm !== "none" ? '<div class="row"><button type="button" data-t="pb:intro">📍 位置を許可して はじめる</button></div>' : "") + '</div>';
}
async function openPassby(){
    if(pb.avail !== true){ showToast(pb.avail === false ? "すれ違いタウンは、いまは使えません（準備中か、お試しアカウントです）。" : "つながっていません。少し待ってからもう一度どうぞ。"); return; }
    openSheet(toolHead("📡 すれ違いタウン", "近くにいた人と、自動で「すれ違い」。かけらを集めよう") + '<div class="meta">読み込み中…</div>');
    const [stats, inbox, mis] = await Promise.all([pbRpc("passby_stats_v1"), pbRpc("passby_inbox_v1", {p_limit:4}), typeof pbtMissions === "function" ? pbtMissions() : Promise.resolve(null)]);
    if(!stats || stats.ok === false){ closeSheet(); showToast("すれ違いタウンは、いまは使えません。"); return; }
    pb.stats = stats;
    const have = new Set((stats.pieces || []).map((p) => p.piece)), done = [0, 1, 2, 3, 4, 5].filter((s) => [0, 1, 2, 3, 4, 5, 6, 7, 8].every((k) => have.has(s * 9 + k))).length;
    const nx = pbNextLevel(stats.unique), claimable = typeof pbtClaimable === "function" ? pbtClaimable(mis) : 0;
    openSheet(toolHead("📡 すれ違いタウン", "近くにいた人と、自動で「すれ違い」。かけらを集めよう") + pbStatusHtml() +
        '<div class="pb-stats"><div><b>' + stats.today_meets + '</b><small>きょう</small></div><div><b>' + stats.unique + '</b><small>すれ違った人</small></div><div><b>' + stats.meets + '</b><small>ぜんぶで</small></div><div><b>' + stats.streak + '</b><small>れんぞく日</small></div></div>' +
        '<div class="meta" style="text-align:center">称号：<b>' + pbLevel(stats.unique) + '</b>' + (nx ? "（あと " + (nx[0] - stats.unique) + " 人で「" + nx[1] + "」）" : "") + ' ・ 🧩 かけら ' + have.size + ' / 54（完成 ' + done + ' / 6）</div>' +
        '<div class="row pb-menu"><button type="button" data-t="pb:inbox">📖 すれ違った人' + (pb.unseen ? "（新しい " + pb.unseen + "）" : "") + '</button><button type="button" data-t="pb:puzzle">🧩 かけらパズル</button><button type="button" data-t="pb:qr">📷 かざし合い</button><button type="button" data-t="pb:settings">⚙️ 設定</button>' +
            (typeof pbTownMenu === "function" ? pbTownMenu(!!mis, claimable) : "") + '</div>' +
        ((inbox || []).length ? '<div class="meta" style="margin-top:6px">さいきんの すれ違い</div>' + inbox.map((c) => pbCardHtml(c)).join("") : '<div class="admin-card"><div class="meta">まだ すれ違いはありません。AREを開いたまま お出かけしてみよう。友だちとは「かざし合い」で すぐ試せます。</div></div>') +
        '<div class="meta">・位置は、ざっくりの区画を暗号のような文字にして送るだけです（正確な場所は送りません・保存しません）。<br>・同じ場所に20分以内にいた人と すれ違えます（少しあとに来た人とも）。<br>・すれ違いポイントは 1日30までです。</div>' + toolClose());
}

const PB_FILTERS = [["all", "すべて"], ["new", "NEW"], ["friend", "友だち"], ["qr", "かざし合い"], ["rep", "3回以上"]];
const pbFilterOk = (c, f) => f === "all" || (f === "new" && c.seen === false) || (f === "friend" && !!c.friend) || (f === "qr" && c.kind === "qr") || (f === "rep" && (c.count || 1) >= 3);
function pbInboxPaint(){
    const st = pb.inbox || {list:[], f:"all"}, f = st.f, list = st.list.filter((c) => pbFilterOk(c, f));
    const chips = PB_FILTERS.map((x) => '<button type="button" class="pb-chip' + (x[0] === f ? " on" : "") + '" data-t="pbt:filt" data-f="' + x[0] + '">' + x[1] + ' ' + st.list.filter((c) => pbFilterOk(c, x[0])).length + '</button>').join("");
    openSheet(toolHead("📖 すれ違った人", st.list.length + " 人") + '<div class="pb-chips">' + chips + '</div>' +
        (list.length ? list.map((c) => pbCardHtml(c)).join("") : '<div class="admin-card"><div class="meta">' + (st.list.length ? "この しぼりこみに あてはまる人は いません。" : "まだ すれ違いはありません。") + '</div></div>') +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}
function pbInboxFilter(f){ if(!pb.inbox || !PB_FILTERS.some((x) => x[0] === f)) return; pb.inbox.f = f; pbInboxPaint(); }
async function openPbInbox(){
    openSheet(toolHead("📖 すれ違った人") + '<div class="meta">読み込み中…</div>');
    const list = await pbRpc("passby_inbox_v1", {p_limit:60}) || [];
    pb.inbox = {list, f:"all"};
    pbInboxPaint();
    if(list.some((c) => !c.seen)){ pbRpc("passby_mark_seen_v1", {p_ids:null}).catch(() => {}); pb.unseen = 0; pbPaintCard(); }
}

async function openPbPuzzle(){
    const stats = await pbRpc("passby_stats_v1");
    if(!stats || stats.ok === false){ showToast("いまは使えません。"); return; }
    const n = {}; (stats.pieces || []).forEach((p) => { n[p.piece] = p.n; });
    const claims = new Set(stats.claims || []);
    let h = toolHead("🧩 かけらパズル", "すれ違うたびに、かけらが1つもらえます。1まいそろえると ポイント +40") ;
    for(let s = 0; s < 6; s++){
        const cnt = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((k) => n[s * 9 + k]).length, full = cnt === 9;
        h += '<div class="admin-card pb-set"><div><b>' + PB_SETS[s] + '</b> <span class="meta">' + cnt + ' / 9</span></div><div class="pb-grid">' +
            [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => pbPieceHtml(s, k, n[s * 9 + k] || 0)).join("") + '</div>' +
            (full ? (claims.has("set:" + s) ? '<div class="meta">✅ ポイントは うけとりずみ</div>' : '<div class="row"><button type="button" data-t="pb:claim" data-set="' + s + '">🎁 完成！ ポイントをうけとる（+40）</button></div>') : "") + '</div>';
    }
    openSheet(h + '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}

// ---------- 設定・説明 ----------
function openPbIntro(){
    const denied = pb.perm === "denied", none = pb.perm === "none";
    openSheet(toolHead("📡 すれ違いタウンを はじめる", "はじめる前に、しくみを知ってください") +
        '<div class="admin-card pb-explain"><b>こんなことが できます</b><br>近くにいた人と、自動で「すれ違い」になります。名前・ひとこと・気分が とどき、かけらパズルが すすみます。</div>' +
        '<div class="admin-card pb-explain"><b>位置の あつかい</b><br>・使うのは、AREを<b>開いているあいだだけ</b>です。<br>・「ざっくりの区画」を、この端末で暗号のような文字にして送ります。<b>正確な場所・住所・地名は、送りません・保存しません</b>。<br>・その文字は20分たつと、すれ違いに使われなくなります（2時間以内に消えます）。<br>・相手にも、あなたの場所は伝わりません（すれ違った事実だけ）。<br>・いつでも オフにできます。記録も、設定からぜんぶ消せます。<br>・ブロック／ミュートした人とは すれ違いません。</div>' +
        '<div class="admin-card pb-explain"><b>この「許可」について</b><br>下のボタンを押すと、ブラウザが「位置情報を使ってよいですか？」とたずねます。「許可」を選ぶと はじまります。</div>' +
        (denied ? '<div class="admin-card" style="border-color:#ff7777">いまは、ブラウザで位置が止められています。アドレスバーの 🔒（またはサイトの設定）から、このサイトの「位置情報」を「許可」にして、もういちど開いてください。</div>' : "") +
        (none ? '<div class="admin-card" style="border-color:#ff7777">この端末のブラウザでは、位置が使えません。「かざし合い」は使えます。</div>' : "") +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">あとで</button>' + (denied || none ? "" : '<button type="button" data-t="pb:ask">📍 位置を使う（許可する）</button>') + '</div>');
}
async function pbAsk(){
    try{
        await pbGetPos(true);
        pbSet("geo", "1"); pb.perm = "granted";
        showToast("すれ違いを はじめました。AREを開いたまま お出かけしてみよう。");
        pbSchedule(1000);
        await openPassby();
    }catch(e){
        if(e && e.code === 1){ pb.perm = "denied"; openPbIntro(); }
        else showToast("位置を取得できませんでした。電波のよいところで もういちど どうぞ。");
    }
}
function openPbSettings(){
    const st = pb.st || {enabled:true, scope:"everyone", greeting_id:0, mood_id:0};
    const opts = (arr, sel, f) => arr.map((x, i) => '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + f(x) + "</option>").join("");
    const out = pbOuting();
    openSheet(toolHead("⚙️ すれ違いの設定", "いつでも変えられます") +
        '<label for="pbEn">すれ違い</label><select id="pbEn" class="status-select"><option value="1"' + (st.enabled ? " selected" : "") + '>オン（はじめから）</option><option value="0"' + (st.enabled ? "" : " selected") + '>オフ</option></select>' +
        '<label for="pbScope">すれ違う相手</label><select id="pbScope" class="status-select"><option value="everyone"' + (st.scope === "everyone" ? " selected" : "") + '>みんなと（知らない人もOK）</option><option value="friends"' + (st.scope === "friends" ? " selected" : "") + '>友だち（フォロー関係）だけ</option></select>' +
        '<label for="pbGreet">あいさつ（相手に とどきます）</label><select id="pbGreet" class="status-select">' + opts(PB_GREET, st.greeting_id, (x) => escapeHtml(x)) + '</select>' +
        '<label for="pbMood">いまの気分</label><select id="pbMood" class="status-select">' + opts(PB_MOOD, st.mood_id, (x) => x[0] + " " + x[1]) + '</select>' +
        '<div class="row"><button type="button" data-t="pb:save">保存する</button></div>' +
        '<div class="admin-card"><b>🎒 おでかけモード</b><div class="meta">画面を つけたままにして、30秒ごとに 位置を知らせます（電池を多く使います）。3時間で自動で終わります。</div><div class="row"><button type="button" class="button-secondary" data-t="pb:outing">' + (out ? "おでかけモードを やめる" : "おでかけモードを はじめる") + '</button></div></div>' +
        (typeof pbKeyPanel === "function" ? pbKeyPanel() : "") +
        '<div class="admin-card"><b>🗑 記録を消す</b><div class="meta">すれ違いの記録・かけら・設定を、ぜんぶ消して、すれ違いをオフにします（相手の画面の記録は、そのまま残ります）。</div><div class="row"><button type="button" class="button-danger" data-t="pb:wipe">ぜんぶ消す</button></div></div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}
async function pbSave(){
    const g = (id) => (document.getElementById(id) || {}).value;
    const enabled = g("pbEn") === "1", scope = g("pbScope") === "friends" ? "friends" : "everyone", greet = Number(g("pbGreet")) || 0, mood = Number(g("pbMood")) || 0;
    const r = await pbRpc("passby_settings_set_v1", {p_enabled:enabled, p_scope:scope, p_greeting:greet, p_mood:mood});
    if(!r || r.ok === false){ showToast("保存できませんでした。"); return; }
    pb.st = {enabled, scope, greeting_id:greet, mood_id:mood};
    showToast("保存しました。");
    if(enabled) pbSchedule(1000);
    if(enabled && pb.perm === "prompt") openPbIntro(); else await openPassby();
}
async function pbWipe(){
    if(!confirm("すれ違いの記録・かけら・設定を、ぜんぶ消します。すれ違いは オフになります。よろしいですか？")) return;
    const r = await pbRpc("passby_delete_my_data_v1");
    if(!r || r.ok === false){ showToast("消せませんでした。"); return; }
    if(pb.st) pb.st.enabled = false;
    pb.unseen = 0; pb.toasted.clear(); pbPaintCard(); pbSet("out", null); pbWakeSync();
    showToast("ぜんぶ消しました。すれ違いは オフです（設定で、またオンにできます）。");
    await openPassby();
}

// ---------- おでかけモード（画面をつけたまま） ----------
async function pbWakeSync(){
    try{
        if(pbOuting() && !document.hidden && navigator.wakeLock && navigator.wakeLock.request && !pb.wake){
            pb.wake = await navigator.wakeLock.request("screen");
            pb.wake.addEventListener("release", () => { pb.wake = null; });
        }else if(!pbOuting() && pb.wake){ await pb.wake.release(); pb.wake = null; }
    }catch(_e){ pb.wake = null; }
}
function pbToggleOuting(){
    if(pbOuting()){ pbSet("out", null); showToast("おでかけモードを やめました。"); }
    else{
        if(pb.perm !== "granted"){ showToast("先に、位置の許可が必要です。"); openPbIntro(); return; }
        pbSet("out", Date.now() + 3 * 3600000); showToast("おでかけモード：3時間、画面をつけたままにします。"); pbSchedule(500);
    }
    pbWakeSync(); openPbSettings();
}

// ---------- かざし合い（QR） ----------
function pbStop(){
    clearInterval(pb.qrTimer); clearInterval(pb.qrPoll); pb.qrTimer = 0; pb.qrPoll = 0;
    cancelAnimationFrame(pb.raf);
    if(pb.stream){ pb.stream.getTracks().forEach((t) => t.stop()); pb.stream = null; }
}
const pbQrTabs = (cur) => '<div class="row"><button type="button" class="' + (cur === "show" ? "" : "button-secondary") + '" data-t="pb:qrshow">見せる</button><button type="button" class="' + (cur === "read" ? "" : "button-secondary") + '" data-t="pb:qrread">読みとる</button></div>';

async function pbQrShow(){
    pbStop();
    openSheet(toolHead("📷 かざし合い", "おたがいのスマホで QR を見せ合うと、その場で すれ違いになります（位置は使いません）") + pbQrTabs("show") +
        '<div class="pb-qrbox"><canvas id="pbQr" width="220" height="220" aria-label="かざし合いのQRコード"></canvas></div><div class="pb-code" id="pbCode">……</div><div class="meta" id="pbCount" style="text-align:center"></div>' +
        '<div class="meta">・QR は 3分だけ有効です。そのあいだに、相手に読んでもらってください（読めないときは、下のコードを相手に打ってもらいます）。<br>・相手が読むと、この画面にも出ます。</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    await pbQrMake();
}
async function pbQrMake(){
    const r = await pbRpc("passby_make_code_v1");
    const cv = document.getElementById("pbQr");
    if(!cv) return;
    if(!r || r.ok === false){
        cv.insertAdjacentHTML("afterend", '<div class="admin-card" style="border-color:#ff7777">' + (r && r.error === "disabled" ? "すれ違いが オフです。設定で オンにしてください。" : "いまは使えません。") + '</div>'); cv.remove();
        const c = document.getElementById("pbCode"); if(c) c.textContent = ""; return;
    }
    pb.qrStart = Date.now(); pb.qrExpire = pb.qrStart + (Number(r.seconds) || 180) * 1000; pb.qrFound = false;
    if(!window.AREQR) throw new Error("QRコード部品を読み込めませんでした。");
    window.AREQR.draw(cv, "ARE-PB:" + r.code, 220);
    document.getElementById("pbCode").textContent = r.code.slice(0, 4) + "-" + r.code.slice(4);
    clearInterval(pb.qrTimer); clearInterval(pb.qrPoll);
    pb.qrTimer = setInterval(() => {
        const c = document.getElementById("pbCount");
        if(!c || !document.getElementById("pbQr")){ pbStop(); return; }
        const left = Math.max(0, Math.round((pb.qrExpire - Date.now()) / 1000));
        c.textContent = "のこり " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
        if(left <= 0){ clearInterval(pb.qrTimer); runTool(pbQrMake); }          // 期限が来たら、自動で新しいコードに
    }, 1000);
    pb.qrPoll = setInterval(async () => {
        if(!document.getElementById("pbQr")){ pbStop(); return; }
        try{
            const list = await pbRpc("passby_inbox_v1", {p_limit:3});
            const hit = (list || []).find((c) => c.kind === "qr" && !c.seen && new Date(c.last_at).getTime() >= pb.qrStart - 2000);
            if(hit){ pbStop(); pbRpc("passby_mark_seen_v1", {p_ids:[hit.id]}).catch(() => {}); pbShowMeet(hit, false); }
        }catch(_e){ /* 次の回に */ }
    }, 4000);
}
function pbShowMeet(c, already){
    pbStop();
    const piece = c.piece !== null && c.piece !== undefined && c.piece >= 0 && c.piece < 54 ? '<div class="meta" style="text-align:center">🧩 「' + PB_SETS[Math.floor(c.piece / 9)] + '」の かけら #' + (c.piece % 9 + 1) + ' を もらいました！</div>' : "";
    openSheet(toolHead(already ? "👋 さっき すれ違ったばかりです" : "✨ すれ違いました！", already ? "5分あけると、また かざし合えます" : "かざし合い せいこう") + pbCardHtml(c) + (already ? "" : piece) +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">すれ違いタウンへ</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}

async function pbQrRead(){
    pbStop();
    openSheet(toolHead("📷 かざし合い", "相手の QR を、枠に映してください") + pbQrTabs("read") +
        '<video id="pbVideo" playsinline muted style="width:100%;max-height:300px;background:#000;border-radius:12px"></video>' +
        '<div class="admin-card" id="pbSt">カメラを起動しています…</div>' +
        '<label for="pbManual">または、相手のコード（8文字）を打つ</label><input id="pbManual" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="例：ABCD-EFGH">' +
        '<div class="row"><button type="button" data-t="pb:scan">コードで すれ違う</button><label class="button-secondary" for="pbImg" style="padding:10px 14px;border-radius:12px;cursor:pointer">画像から読みとる</label><input id="pbImg" type="file" accept="image/*" hidden></div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pb:main">← もどる</button><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    document.getElementById("pbImg").addEventListener("change", async () => {
        const f = document.getElementById("pbImg").files[0]; if(!f) return;
        try{ const dec = await ctDecoder(); const raw = await dec(await createImageBitmap(f)); if(raw) await pbHandleScan(raw); else pbSt("QRコードが見つかりませんでした。"); }
        catch(_e){ pbSt("読み取れませんでした。"); }
    });
    pb.qrFound = false;
    try{
        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("nocam");
        const dec = await ctDecoder();
        pb.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}, audio:false});
        const v = document.getElementById("pbVideo"); if(!v){ pbStop(); return; }
        v.srcObject = pb.stream; await v.play(); pbSt("QRコードを枠に映してください。");
        let last = 0, busy = false;
        const loop = async (t) => {
            if(!pb.stream) return;
            if(t - last > 250 && v.videoWidth && !busy && !pb.qrFound){
                last = t; busy = true;
                try{ const raw = await dec(v); if(raw) await pbHandleScan(raw); }catch(_e){ /* 次の回に */ }
                busy = false;
            }
            pb.raf = requestAnimationFrame(loop);
        };
        pb.raf = requestAnimationFrame(loop);
    }catch(e){
        pbSt(e && e.name === "NotAllowedError" ? "カメラが許可されていません。下のコード入力か「画像から読みとる」をお使いください。" : "カメラを使えませんでした。下のコード入力か「画像から読みとる」をお使いください。");
    }
}
function pbSt(t){ const a = document.getElementById("pbSt"); if(a) a.textContent = t; }
async function pbHandleScan(raw){
    const m = /ARE-PB:([A-Za-z0-9]{8})/.exec(String(raw)) || /^\s*([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})\s*$/.exec(String(raw));
    if(!m){ pbSt("これは、このアプリの かざし合いQRではありません。"); return; }
    if(pb.qrFound) return;
    pb.qrFound = true;
    const r = await pbRpc("passby_scan_v1", {p_code:m[1]});
    if(r && r.ok){ pbStop(); pbShowMeet(r.card || {}, !!r.already); return; }
    pb.qrFound = false;
    const msg = {expired:"このコードは、期限が切れているか、まちがっています。相手に新しいコードを出してもらってください。", self:"これは あなた自身の QR です。", bad_code:"コードの形がちがいます（8文字）。", not_allowed:"この人とは すれ違えません（相手がオフ／ブロック中／区分がちがう など）。", guest:"お試しアカウントでは使えません。"}[r && r.error] || "すれ違えませんでした。";
    pbSt(msg);
}

// ---------- ボタンの振り分け ----------
async function onPassbyAction(action, node){
    if(action === "main") await openPassby();
    else if(action === "inbox") await openPbInbox();
    else if(action === "puzzle") await openPbPuzzle();
    else if(action === "settings") openPbSettings();
    else if(action === "intro") openPbIntro();
    else if(action === "ask") await pbAsk();
    else if(action === "save") await pbSave();
    else if(action === "wipe") await pbWipe();
    else if(action === "outing") pbToggleOuting();
    else if(action === "qr" || action === "qrshow") await pbQrShow();
    else if(action === "qrread") await pbQrRead();
    else if(action === "scan"){ const v = (document.getElementById("pbManual") || {}).value || ""; if(!v.trim()){ pbSt("コードを打ってください。"); return; } await pbHandleScan(v); }
    else if(action === "claim"){
        const r = await pbRpc("passby_claim_set_v1", {p_set:Number(node.dataset.set)});
        showToast(r && r.ok ? "🎁 ポイントを " + r.gained + " もらいました！" : r && r.error === "already" ? "もう うけとっています。" : "まだ そろっていません。");
        await openPbPuzzle();
    }
    else if(action === "chat"){ const id = node.dataset.id; closeSheet(); await openOrCreateDirectChat(id); }
    else if(action === "prof"){ const p = await ctProfile(node.dataset.id); if(p) openProfileView(p); else showToast("プロフィールを読み込めませんでした。"); }
    else if(typeof onPbKeyAction === "function") await onPbKeyAction(action, node);
}
