"use strict";
// ===== 広告（2027年1月1日から、1時間ごとに 15秒の物語紹介映像）=====
// ・映像は ads/ に 100本（AD001.mp4〜AD100.mp4）。一覧は ads/manifest.json。収入はなし。
// ・500ポイントで30日間 広告なし（AREShop の上に出る）。管理者と家庭は ずっと広告なし。社員・友人は1時間ごと、その他は10分ごと。広告は はじまって10秒でスキップできる。
// ・見つからない映像／広告なし か わからないとき（サーバー未準備など）は、広告を出さずに静かに飛ばす。
// ・広告が終わったら、自動で閉じる。ポイント：最後まで見た＝1000／スキップした＝100／途中で閉じた・ブラウザを強制終了した＝0
//   （サーバーが「はじまった時刻」を覚えていて、時間が足りないときは0。sql/ad_reward_v1.sql の ad_view_start / ad_view_finish。管理者・家庭・テスト表示はポイントなし）
const AD = {
    START: Date.parse("2027-01-01T00:00:00+09:00"),
    HOUR: 3600000,
    PT_DONE: 1000, PT_SKIP: 100, introDone: false, introTries: 0, free: null, admin: false, exempt: false, interval: 60, until: null, price: 500, days: 30, SKIP_MS: 10000,
    list: null, busy: false, confirm: false, bad: {}
};
// 管理者は、どんな時も 広告を出さない（サーバーの返事・ポイントの情報・画面の管理者の印、どれか1つでも「管理者」なら出さない）
function adIsAdmin(){
    try{ if(AD.admin) return true; }catch(_e){}
    try{ if(typeof pt !== "undefined" && pt && pt.acc && pt.acc.admin) return true; }catch(_e){}
    try{ if(typeof feat !== "undefined" && feat && feat.isAdmin === true) return true; }catch(_e){}
    return false;
}
function adNow(){ return typeof window.__adNow === "function" ? window.__adNow() : Date.now(); }
function adUid(){ return (state && state.user && state.user.id) || "x"; }
function adKey(){ return "are_ad_v1_" + adUid(); }
function adLoad(){ try{ return JSON.parse(localStorage.getItem(adKey()) || "{}") || {}; }catch(_e){ return {}; } }
function adSave(o){ try{ localStorage.setItem(adKey(), JSON.stringify(o)); }catch(_e){} }
// 広告の間隔：社員・友人は60分、その他は10分（サーバーが返す interval_min。わからなければ60分）。管理者・家庭は広告なし
function adSlotMs(){ return Math.max(1, AD.interval || 60) * 60000; }
function adHourIndex(now){ return AD.START + Math.floor((now - AD.START) / adSlotMs()) * adSlotMs(); }   // いまの枠のはじまり（ミリ秒）

async function adStatusLoad(){
    try{
        const r = await requireClient().rpc("ad_free_status");
        if(r.error) throw r.error;
        const d = r.data || {};
        AD.admin = !!d.admin; AD.exempt = !!d.exempt || AD.admin; AD.free = !!d.free || AD.exempt; AD.until = d.until || null;
        const iv = Number(d.interval_min); AD.interval = (iv >= 1 && iv <= 1440) ? iv : 60;
        if(d.price) AD.price = d.price;
        if(d.days) AD.days = d.days;
    }catch(_e){ AD.free = null; }
}

function adsUrl(){ return String((window.ARE_CONFIG || {}).adsUrl || "").trim(); }

// 映像の一覧。adsUrl（Googleドライブの「広告」フォルダを配るGAS）があれば、ドライブに「いま入っているもの」だけ。なければ ads/ のもの
async function adManifest(){
    if(AD.list) return AD.list;
    const res = await fetch("./ads/manifest.json", {cache: "no-cache"});
    if(!res.ok) throw new Error("manifest");
    const j = await res.json();
    const base = (j.ads || []).filter((a) => a && a.file);
    const url = adsUrl();
    if(!url){ AD.list = base; return AD.list; }
    const r = await adFetch(url + "?action=list", 20000);
    const g = await r.json();
    if(!g || !g.ok) throw new Error("ads list");
    const by = {}; base.forEach((a) => { by[a.id] = a; });
    AD.list = (g.ads || []).map((m) => Object.assign({}, by[m.id] || {id: m.id, file: m.id + ".mp4", title: ""}, {gas: m}));
    return AD.list;
}
async function adFetch(url, ms){
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try{
        const r = await fetch(url, {signal: ctl.signal});
        if(!r.ok) throw new Error("http " + r.status);
        return r;
    }finally{ clearTimeout(t); }
}

// ドライブの映像を、3MBずつ受け取って1本にする。いちど受け取ったら、この端末の Cache Storage に残す（2回目からは通信しない）
async function adGasBlob(ad){
    const m = ad.gas, key = new Request("https://are-ads.invalid/" + m.id + "-" + m.v + "-" + m.size);
    let cache = null; try{ cache = await caches.open("are-ads"); }catch(_e){ cache = null; }
    if(cache){ const hit = await cache.match(key); if(hit) return await hit.blob(); }
    const parts = [];
    for(let i = 0; i < m.parts; i++){
        const r = await adFetch(adsUrl() + "?action=part&id=" + encodeURIComponent(m.id) + "&i=" + i, 60000);
        const j = await r.json(); if(!j || !j.ok || typeof j.b64 !== "string") throw new Error("part " + i);
        const bin = atob(j.b64), u = new Uint8Array(bin.length);
        for(let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
        parts.push(u);
    }
    const blob = new Blob(parts, {type: "video/mp4"});
    if(blob.size !== m.size) throw new Error("size");
    if(cache){
        try{
            for(const k of await cache.keys()){ if(k.url.indexOf("https://are-ads.invalid/" + m.id + "-") === 0) await cache.delete(k); }   // 古い版は消す
            await cache.put(key, new Response(blob, {headers: {"content-type": "video/mp4"}}));
        }catch(_e){ /* 残せなくても、今回は流せる */ }
    }
    return blob;
}
// 流す映像のアドレスを用意する（ドライブ経由は、受け取り終わってから）
async function adSource(ad){
    if(ad.gas){ const blob = await adGasBlob(ad); return {url: URL.createObjectURL(blob), revoke: true}; }
    return {url: "./ads/" + encodeURIComponent(ad.file), revoke: false};
}

// 100本を ひととおり見てから 2周目（前回の最後と同じものが 続けて出ない）
function adPick(list, st){
    const ids = list.map((a) => a.id);
    let bag = (st.bag || []).filter((id) => ids.indexOf(id) >= 0 && !AD.bad[id]);
    if(!bag.length){
        bag = ids.filter((id) => !AD.bad[id]);
        for(let i = bag.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
        if(bag.length > 1 && bag[0] === st.last){ const t = bag[0]; bag[0] = bag[1]; bag[1] = t; }
    }
    if(!bag.length) return null;
    const id = bag.shift();
    st.bag = bag; st.last = id;
    return list.find((a) => a.id === id) || null;
}

// つぎに流す1本を決めておく（先に受け取っておけるように、保存しておく）
function adNext(list, st){
    if(st.next && !AD.bad[st.next]){ const a = list.find((x) => x.id === st.next); if(a) return a; }
    const a = adPick(list, st); st.next = a ? a.id : null; return a;
}
async function adPrefetch(){
    if(AD.free !== false || adIsAdmin() || AD.busy || !adsUrl() || adNow() < AD.START - 2 * 86400000) return;
    try{
        const list = await adManifest(); const st = adLoad();
        const ad = adNext(list, st); adSave(st);
        if(ad && ad.gas) await adGasBlob(ad);
    }catch(_e){ /* あとで もう一度 */ }
}

function adComposerBusy(){
    const a = document.activeElement;
    return !!(a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text")) && String(a.value || "").length > 0);
}

function adDue(){
    if(AD.free !== false || adIsAdmin() || AD.busy || document.hidden) return false;
    const now = adNow(); if(now < AD.START) return false;
    const at = adLoad().at; return at === undefined || adHourIndex(now) > at;
}

async function adCheck(){
    if(!adDue() || adComposerBusy()) return;
    AD.busy = true;
    try{
        const list = await adManifest();
        const st = adLoad(); const hour = adHourIndex(adNow());
        for(let n = 0; n < 3; n++){
            const ad = adNext(list, st); if(!ad) break;
            let ok = false, src = null;
            try{ src = await adSource(ad); ok = await adPlay(ad, src.url); }catch(_e){ ok = false; }
            finally{ if(src && src.revoke){ try{ URL.revokeObjectURL(src.url); }catch(_e){} } }
            if(ok){ st.at = hour; st.next = null; adSave(st); adPrefetch(); return; }
            AD.bad[ad.id] = true; st.next = null; adSave(st);
        }
        st.at = hour; adSave(st);          // 3本とも だめなら、この1時間は あきらめる（くり返さない）
    }catch(_e){
        const st = adLoad(); st.at = adHourIndex(adNow()); adSave(st);
    }finally{ AD.busy = false; }
}

// 広告の「終わった」を サーバーに連絡して、ポイントをもらう（時間が足りない・9分以内に もらったばかり、のときは 0）
async function adReward(rec, kind){
    try{
        const id = await rec; if(!id) return;
        const r = await requireClient().rpc("ad_view_finish", {p_id: id, p_kind: kind});
        const d = r && r.data;
        if(d && d.paid > 0){
            showToast(kind === "done" ? "🎉 最後まで見てくれて ありがとう！ +" + d.paid + "ポイント" : "+" + d.paid + "ポイント（スキップ）");
            try{ if(typeof ptRefresh === "function") ptRefresh(); }catch(_e){}
        }
    }catch(_e){ /* ポイントが付かなかっただけ。広告そのものは終わっている */ }
}

// 再生が はじまったら true（映像が見つからない／読めない時は false）
function adPlay(ad, srcUrl, test){
    return new Promise((resolve) => {
        const pays = test !== "test" && !AD.exempt;       // ポイントがもらえる広告か（管理者のテスト表示・管理者・家庭は なし）
        const ov = document.createElement("div");
        ov.id = "adOverlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "広告");
        ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:12px;color:#fff;font-size:14px";
        const tag = document.createElement("div"); tag.textContent = test === "intro" ? "広告 ・ 物語紹介（お試し表示 ・ 今回だけ）" : test ? "広告 ・ 物語紹介（テスト表示）" : "広告 ・ 物語紹介"; tag.style.cssText = "opacity:.8";
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
        v.setAttribute("controlsList", "nodownload noremoteplayback"); v.disablePictureInPicture = true;
        v.style.cssText = "width:min(100%,960px);max-height:62vh;background:#000;border-radius:10px";
        const cap = document.createElement("div"); cap.style.cssText = "font-weight:700;font-size:16px;text-align:center"; cap.textContent = ad.title || "";
        const cnt = document.createElement("div"); cnt.setAttribute("aria-live", "off"); cnt.textContent = "あと " + 15 + " 秒";
        const prize = document.createElement("div"); prize.style.cssText = "font-size:13px;opacity:.9;text-align:center;line-height:1.5";
        prize.textContent = pays ? "🎁 最後まで見ると +" + AD.PT_DONE + "ポイント（スキップは +" + AD.PT_SKIP + "ポイント。途中で閉じると 0 ポイント）" : "";
        const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
        const mk = (t, cls) => { const b = document.createElement("button"); b.type = "button"; b.className = cls || "button-secondary"; b.textContent = t; return b; };
        const snd = mk("🔊 音を出す"); const close = mk("スキップ ▶" + (pays ? "（+" + AD.PT_SKIP + "ポイント）" : ""), "button"); const buy = mk("🚫 " + AD.price + "ポイントで" + AD.days + "日間 広告なし");
        close.hidden = true; buy.hidden = true;
        row.append(snd, close, buy);
        ov.append(tag, v, cap, cnt, prize, row);
        let started = false, done = false, hard = null, boot = null, rec = null;
        // kind: "done"（最後まで）／"skip"（スキップ）／なし（映像が読めない など＝ポイントなし）
        const finish = (ok, kind) => {
            if(done) return; done = true; clearTimeout(hard); clearTimeout(boot); try{ v.pause(); v.removeAttribute("src"); v.load(); }catch(_e){} ov.remove(); resolve(ok);
            if(kind && rec) adReward(rec, kind);
        };
        const allow = () => { close.hidden = false; buy.hidden = !!test; cnt.textContent = "スキップできます（広告はあと少しで終わります）"; };
        v.addEventListener("playing", () => {
            if(started) return; started = true; clearTimeout(boot);
            if(pays){   // 再生がはじまった時刻を、サーバーに覚えてもらう（ポイントは、最後に「終わった」と連絡して、時間が足りていれば もらえる）
                try{ rec = Promise.resolve(requireClient().rpc("ad_view_start", {p_ad: String(ad.id || "")})).then((r) => (r && !r.error && r.data) || null).catch(() => null); }catch(_e){ rec = null; }
            }
            hard = setTimeout(allow, AD.SKIP_MS);          // 広告がはじまって 10秒たったら、スキップできる
        });
        v.addEventListener("timeupdate", () => {
            const dur = v.duration && isFinite(v.duration) ? v.duration : 15;
            if(started && v.currentTime >= dur - 0.05){ finish(true, "done"); return; }   // 終わりまで来たら、自動で閉じる（ended が来ない端末の保険）
            const left = Math.max(0, Math.ceil(dur - v.currentTime)); if(!close.hidden) return; cnt.textContent = "あと " + left + " 秒";
        });
        v.addEventListener("ended", () => { if(started) finish(true, "done"); else allow(); });   // 広告が終わったら、自動で閉じる
        v.addEventListener("error", () => { if(!started) finish(false); else allow(); });
        boot = setTimeout(() => { if(!started) finish(false); }, 8000);
        snd.addEventListener("click", () => { v.muted = !v.muted; snd.textContent = v.muted ? "🔊 音を出す" : "🔇 音を消す"; });
        close.addEventListener("click", () => finish(true, "skip"));
        buy.addEventListener("click", () => { finish(true, "skip"); try{ if(typeof openPtShop === "function") openPtShop("pack"); }catch(_e){} });
        document.body.appendChild(ov);
        v.src = srcUrl;
        const p = v.play(); if(p && p.catch) p.catch(() => {});
    });
}

// ---------- AREShop の「広告なし」カード ----------
function adFreeCardHtml(pts){
    if(AD.free === null) return "";
    if(AD.exempt) return '<div class="admin-card"><b>🚫 広告なし</b><div class="meta">✅ あなたのアカウントには、ずっと広告が出ません（ポイントは いりません）。</div>' + (adIsAdmin() ? '<div class="row"><button type="button" class="button-secondary" data-t="pt:adtest">▶ テストの広告を1回だけ出す（管理者用）</button></div>' : '') + '</div>';
    const untilTxt = AD.until ? new Date(AD.until).toLocaleDateString("ja-JP", {year:"numeric", month:"long", day:"numeric"}) : "";
    let state1;
    if(AD.until && new Date(AD.until) > new Date(adNow())) state1 = '<div class="meta">✅ 広告なし：' + escapeHtml(untilTxt) + ' まで</div>';
    else state1 = '<div class="meta">広告は 2027年1月1日から ' + (AD.interval >= 60 ? (AD.interval / 60) + '時間' : AD.interval + '分') + 'ごとに 15秒の物語紹介映像が出ます。いま買っても、1月1日から ' + AD.days + '日間 広告が出ません。</div>';
    if(adNow() >= AD.START && AD.until && new Date(AD.until) > new Date(adNow())) state1 = '<div class="meta">✅ 広告なし：' + escapeHtml(untilTxt) + ' まで（買い足すと、その後ろに ' + AD.days + '日 のびます）</div>';
    const lack = pts < AD.price;
    let btn;
    if(AD.confirm) btn = '<button type="button" class="button" data-t="pt:adbuy">本当に ' + AD.price + '円 と交換する</button><button type="button" class="button-secondary" data-t="pt:adcancel">やめる</button>';
    else btn = '<button type="button" class="button' + (lack ? " button-secondary" : "") + '" data-t="pt:adask"' + (lack ? " disabled" : "") + '>' + AD.price + '円 で ' + AD.days + '日間 広告なし</button>' + (lack ? '<span class="meta">あと ' + (AD.price - pts) + '円</span>' : "");
    state1 += '<div class="meta">🎁 広告は、最後まで見ると ' + AD.PT_DONE + 'ポイント、スキップすると ' + AD.PT_SKIP + 'ポイント もらえます（途中で閉じる・ブラウザを強制終了すると 0 ポイント）。</div>';
    return '<div class="admin-card"><b>🚫 広告なし（' + AD.days + '日間）</b>' + state1 + '<div class="row" style="justify-content:space-between;align-items:center"><span><b>' + AD.price + '</b> 円</span><span>' + btn + '</span></div></div>';
}
// ===== お試し表示：2027年より前に、全員（管理者・家庭の人も）に 1回だけ 広告を流す =====
// ・「見た」は アカウントごとに保存し、端末をまたいで引きつぐ（chat-prefsync.js の are_ad_intro_v1_）
// ・流れたときだけ「見た」にする（映像が取れなかった時は、あとで もう一度。1回の起動で最大3回まで）
function adIntroKey(){ return "are_ad_intro_v1_" + adUid(); }
function adIntroSeen(){ try{ return localStorage.getItem(adIntroKey()) === "1"; }catch(_e){ return true; } }   // 保存できない端末では くり返しを避けるため 出さない
async function adIntroCheck(){
    if(AD.introDone || AD.busy || document.hidden || adNow() >= AD.START || AD.introTries >= 3) return;
    if(adIntroSeen()){ AD.introDone = true; return; }
    if(adComposerBusy() || document.getElementById("adOverlay")) return;
    AD.busy = true; AD.introTries++;
    let src = null;
    try{
        const list = (await adManifest()).filter((a) => !AD.bad[a.id]);
        if(!list.length) return;
        const ad = list[Math.floor(Math.random() * list.length)];
        showToast("広告のお試し表示を準備しています…（はじめては30秒ほどかかります）");
        src = await adSource(ad);
        if(await adPlay(ad, src.url, "intro")){ try{ localStorage.setItem(adIntroKey(), "1"); }catch(_e){} AD.introDone = true; }
        else AD.bad[ad.id] = true;
    }catch(_e){ /* あとで もう一度 */ }
    finally{ if(src && src.revoke){ try{ URL.revokeObjectURL(src.url); }catch(_e){} } AD.busy = false; }
}

// 管理者の確認用：日付・間隔・「広告なし」に関係なく、ドライブの映像を 1本だけ流す（順番や次の予定は変えない）
async function adTestOnce(){
    if(!adIsAdmin()){ showToast("このボタンは管理者だけが使えます"); return; }
    if(AD.busy || document.getElementById("adOverlay")) return;
    AD.busy = true;
    let src = null;
    try{
        const list = await adManifest();
        if(!list.length){ showToast("広告の映像が見つかりません（ドライブの「広告」フォルダを確かめてください）"); return; }
        const ad = list[Math.floor(Math.random() * list.length)];
        showToast("広告を読み込んでいます…（はじめては30秒ほどかかります）");
        src = await adSource(ad);
        const ok = await adPlay(ad, src.url, "test");
        if(!ok) showToast("この映像は流せませんでした（" + ad.id + "）。もう一度ためしてください");
    }catch(_e){ showToast("テストの広告を出せませんでした。しばらくしてから もう一度ためしてください"); }
    finally{ if(src && src.revoke){ try{ URL.revokeObjectURL(src.url); }catch(_e){} } AD.busy = false; }
}
async function adFreeAction(action){
    if(action === "adtest"){ await adTestOnce(); return; }
    if(action === "adask"){ AD.confirm = true; ptShopPaint(); return; }
    if(action === "adcancel"){ AD.confirm = false; ptShopPaint(); return; }
    if(action === "adbuy"){
        AD.confirm = false;
        const r = await requireClient().rpc("ad_free_buy"); if(r.error) throw r.error;
        showToast("交換しました 🎉（広告なし）");
        await ptRefresh(); await adStatusLoad(); await ptShopLoad();
    }
}

function initAds(){
    setTimeout(adIntroCheck, 3000);
    adStatusLoad().then(() => {
        adCheck(); adPrefetch();
        try{ if(/[?&]adtest=1(&|$)/.test(location.search) && adIsAdmin()){ history.replaceState(null, "", location.pathname + location.hash); setTimeout(adTestOnce, 1200); } }catch(_e){}
    });
    feat.timers.push(setInterval(() => { adCheck(); adIntroCheck(); }, 30000));
    feat.timers.push(setInterval(adStatusLoad, 30 * 60000));
    document.addEventListener("visibilitychange", () => { if(!document.hidden){ adCheck(); adIntroCheck(); } });
    window.AREAds = {check: adCheck, test: adTestOnce, intro: adIntroCheck, status: () => ({free: AD.free, until: AD.until})};
}
