"use strict";
// ===== 広告（2027年1月1日から、1時間ごとに 15秒の物語紹介映像）=====
// ・映像は ads/ に 100本（AD001.mp4〜AD100.mp4）。一覧は ads/manifest.json。収入はなし。
// ・500ポイントで30日間 広告なし（AREShop の上に出る）。管理者は広告なし。
// ・見つからない映像／広告なし か わからないとき（サーバー未準備など）は、広告を出さずに静かに飛ばす。
const AD = {
    START: Date.parse("2027-01-01T00:00:00+09:00"),
    HOUR: 3600000,
    free: null, until: null, price: 500, days: 30,
    list: null, busy: false, confirm: false, bad: {}
};
function adNow(){ return typeof window.__adNow === "function" ? window.__adNow() : Date.now(); }
function adUid(){ return (state && state.user && state.user.id) || "x"; }
function adKey(){ return "are_ad_v1_" + adUid(); }
function adLoad(){ try{ return JSON.parse(localStorage.getItem(adKey()) || "{}") || {}; }catch(_e){ return {}; } }
function adSave(o){ try{ localStorage.setItem(adKey(), JSON.stringify(o)); }catch(_e){} }
function adHourIndex(now){ return Math.floor((now - AD.START) / AD.HOUR); }

async function adStatusLoad(){
    try{
        const r = await requireClient().rpc("ad_free_status");
        if(r.error) throw r.error;
        const d = r.data || {};
        AD.free = !!d.free; AD.until = d.until || null;
        if(d.price) AD.price = d.price;
        if(d.days) AD.days = d.days;
    }catch(_e){ AD.free = null; }
}

async function adManifest(){
    if(AD.list) return AD.list;
    const res = await fetch("./ads/manifest.json", {cache: "no-cache"});
    if(!res.ok) throw new Error("manifest");
    const j = await res.json();
    AD.list = (j.ads || []).filter((a) => a && a.file);
    return AD.list;
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

function adComposerBusy(){
    const a = document.activeElement;
    return !!(a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text")) && String(a.value || "").length > 0);
}

function adDue(){
    if(AD.free !== false || AD.busy || document.hidden) return false;
    const now = adNow(); if(now < AD.START) return false;
    return adHourIndex(now) > (adLoad().hour === undefined ? -1 : adLoad().hour);
}

async function adCheck(){
    if(!adDue() || adComposerBusy()) return;
    AD.busy = true;
    try{
        const list = await adManifest();
        const st = adLoad(); const hour = adHourIndex(adNow());
        for(let n = 0; n < 3; n++){
            const ad = adPick(list, st); if(!ad) break;
            const ok = await adPlay(ad);
            if(ok){ st.hour = hour; adSave(st); return; }
            AD.bad[ad.id] = true;
        }
        st.hour = hour; adSave(st);          // 3本とも だめなら、この1時間は あきらめる（くり返さない）
    }catch(_e){
        const st = adLoad(); st.hour = adHourIndex(adNow()); adSave(st);
    }finally{ AD.busy = false; }
}

// 再生が はじまったら true（映像が見つからない／読めない時は false）
function adPlay(ad){
    return new Promise((resolve) => {
        const ov = document.createElement("div");
        ov.id = "adOverlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "広告");
        ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:12px;color:#fff;font-size:14px";
        const tag = document.createElement("div"); tag.textContent = "広告 ・ 物語紹介"; tag.style.cssText = "opacity:.8";
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
        v.setAttribute("controlsList", "nodownload noremoteplayback"); v.disablePictureInPicture = true;
        v.style.cssText = "width:min(100%,960px);max-height:62vh;background:#000;border-radius:10px";
        const cap = document.createElement("div"); cap.style.cssText = "font-weight:700;font-size:16px;text-align:center"; cap.textContent = ad.title || "";
        const cnt = document.createElement("div"); cnt.setAttribute("aria-live", "off"); cnt.textContent = "あと " + 15 + " 秒";
        const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
        const mk = (t, cls) => { const b = document.createElement("button"); b.type = "button"; b.className = cls || "button-secondary"; b.textContent = t; return b; };
        const snd = mk("🔊 音を出す"); const close = mk("閉じる", "button"); const buy = mk("🚫 " + AD.price + "ポイントで" + AD.days + "日間 広告なし");
        close.hidden = true; buy.hidden = true;
        row.append(snd, close, buy);
        ov.append(tag, v, cap, cnt, row);
        let started = false, done = false, hard = null, boot = null;
        const finish = (ok) => { if(done) return; done = true; clearTimeout(hard); clearTimeout(boot); try{ v.pause(); v.removeAttribute("src"); v.load(); }catch(_e){} ov.remove(); resolve(ok); };
        const allow = () => { close.hidden = false; buy.hidden = false; cnt.textContent = "広告は ここまで。ありがとうございました"; };
        v.addEventListener("playing", () => {
            if(started) return; started = true; clearTimeout(boot);
            hard = setTimeout(allow, 20000);               // 万一 終わりの合図が来なくても、20秒で閉じられる
        });
        v.addEventListener("timeupdate", () => { const left = Math.max(0, Math.ceil((v.duration && isFinite(v.duration) ? v.duration : 15) - v.currentTime)); if(!close.hidden) return; cnt.textContent = "あと " + left + " 秒"; });
        v.addEventListener("ended", allow);
        v.addEventListener("error", () => { if(!started) finish(false); else allow(); });
        boot = setTimeout(() => { if(!started) finish(false); }, 8000);
        snd.addEventListener("click", () => { v.muted = !v.muted; snd.textContent = v.muted ? "🔊 音を出す" : "🔇 音を消す"; });
        close.addEventListener("click", () => finish(true));
        buy.addEventListener("click", () => { finish(true); try{ if(typeof openPtShop === "function") openPtShop("pack"); }catch(_e){} });
        document.body.appendChild(ov);
        v.src = "./ads/" + encodeURIComponent(ad.file);
        const p = v.play(); if(p && p.catch) p.catch(() => {});
    });
}

// ---------- AREShop の「広告なし」カード ----------
function adFreeCardHtml(pts){
    if(AD.free === null) return "";
    const untilTxt = AD.until ? new Date(AD.until).toLocaleDateString("ja-JP", {year:"numeric", month:"long", day:"numeric"}) : "";
    let state1;
    if(AD.until && new Date(AD.until) > new Date(adNow())) state1 = '<div class="meta">✅ 広告なし：' + escapeHtml(untilTxt) + ' まで</div>';
    else state1 = '<div class="meta">広告は 2027年1月1日から 1時間ごとに 15秒の物語紹介映像が出ます。いま買っても、1月1日から ' + AD.days + '日間 広告が出ません。</div>';
    if(adNow() >= AD.START && AD.until && new Date(AD.until) > new Date(adNow())) state1 = '<div class="meta">✅ 広告なし：' + escapeHtml(untilTxt) + ' まで（買い足すと、その後ろに ' + AD.days + '日 のびます）</div>';
    const lack = pts < AD.price;
    let btn;
    if(AD.confirm) btn = '<button type="button" class="button" data-t="pt:adbuy">本当に ' + AD.price + '円 と交換する</button><button type="button" class="button-secondary" data-t="pt:adcancel">やめる</button>';
    else btn = '<button type="button" class="button' + (lack ? " button-secondary" : "") + '" data-t="pt:adask"' + (lack ? " disabled" : "") + '>' + AD.price + '円 で ' + AD.days + '日間 広告なし</button>' + (lack ? '<span class="meta">あと ' + (AD.price - pts) + '円</span>' : "");
    return '<div class="admin-card"><b>🚫 広告なし（' + AD.days + '日間）</b>' + state1 + '<div class="row" style="justify-content:space-between;align-items:center"><span><b>' + AD.price + '</b> 円</span><span>' + btn + '</span></div></div>';
}
async function adFreeAction(action){
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
    adStatusLoad().then(() => adCheck());
    feat.timers.push(setInterval(adCheck, 30000));
    feat.timers.push(setInterval(adStatusLoad, 30 * 60000));
    document.addEventListener("visibilitychange", () => { if(!document.hidden) adCheck(); });
    window.AREAds = {check: adCheck, status: () => ({free: AD.free, until: AD.until})};
}
