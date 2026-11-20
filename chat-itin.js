"use strict";
// ===== 行動予定表（データ・保存・同期・アラーム）=====
// ・1日の予定（時刻・内容・予想の待ち時間・メモ）を作り、当日は「並びはじめた／はじまった／おわった」を押すだけで、
//   実際の待ち時間と時刻が自動で記録されます。時刻はぜんぶ あとから直せます。
// ・データはこの端末に保存し、さらにクラウド（user_prefs の itin:〜）にも「自分の分だけ」保存します（スマホとパソコンで同じになります）。
// ・アラームは「アプリを開いているあいだ」に鳴ります（音・振動・画面のポップアップ・通知）。アプリを完全に閉じると鳴りません。
// ・画面（UI）は chat-itin-ui.js、書き出しは chat-itin-export.js にあります。

const ITN_CATS = [["act", "🎯", "体験"], ["eat", "🍽️", "食事"], ["move", "🚃", "移動"], ["show", "🎭", "ショー"], ["shop", "🛍️", "買い物"], ["rest", "☕", "休憩"], ["work", "💼", "用事"], ["other", "📌", "その他"]];
const ITN_ST = {t: "まだ", w: "並び中", d: "進行中", x: "完了", s: "スキップ"};
const ITN_MAX_ITEMS = 150, ITN_MAX_PLANS = 30, ITN_CLOUD_BYTES = 19000;
const ITN_LS = () => "are_itin_" + (state && state.user ? state.user.id : "x");

const itn = {
    plans: {}, active: "", tab: "now", sub: "", editId: "", focus: "", confirm: "",
    prefs: {alarm: true, sound: true, vibrate: true, notify: true, speak: true, speakAct: true, speakEvery: 0, rate: 1, crowd: false, lead: 5, wake: false}, cards: new Map(),
    fired: {}, snooze: {}, del: {}, dirty: new Set(), undo: null, cloudMsg: "", cloudOff: false,
    crowd: {}, crowdOff: false, crowdAt: 0, voiceOn: false, undoAll: null,
    live: null, alarm: null, wl: null, scroll0: false, importTxt: "", importTitle: "", importMode: "add", importErrors: [], pulledAt: 0
};

// ---------- ちいさな道具 ----------
const itnE = (v) => escapeHtml(v);
const itnMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null; };
const itnHM = (min) => { min = Math.max(0, Math.min(1439, Math.round(Number(min) || 0))); return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); };
const itnNowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const itnNowHM = () => itnHM(itnNowMin());
const itnDur = (m) => { m = Math.round(Number(m) || 0); if(m < 60) return m + "分"; const h = Math.floor(m / 60), r = m % 60; return h + "時間" + (r ? r + "分" : ""); };
const itnYen = (n) => "¥" + Number(n || 0).toLocaleString("ja-JP");
const itnId = () => Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);
const itnToday = () => dayKey(new Date());
const itnAt = (date, hm) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""), t = itnMin(hm); return m && t != null ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(t / 60), t % 60).getTime() : 0; };
const itnDateLabel = (date) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""); if(!m) return ""; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return (d.getMonth() + 1) + "/" + d.getDate() + "(" + "日月火水木金土"[d.getDay()] + ")"; };
const itnCatOf = (k) => ITN_CATS.find((c) => c[0] === k) || ITN_CATS[ITN_CATS.length - 1];
const itnFmtClock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0"); };

/** 内容の言葉から、種類（食事・移動…）をだいたい当てる */
function itnGuessKind(name, hasWait){
    const n = String(name || "");
    if(/食|ランチ|ディナー|朝ごはん|昼ごはん|夕食|カフェ|レストラン|おやつ|ドリンク|ごはん/.test(n)) return "eat";
    if(/電車|駅|バス|移動|出発|到着|乗り換え|空港|タクシー|新幹線|電車|車で|徒歩|歩く|帰宅|帰り|行き/.test(n)) return "move";
    if(/買い物|お土産|ショップ|購入|物販|グッズ/.test(n)) return "shop";
    if(/ショー|パレード|イベント|ライブ|公演|上映|花火/.test(n)) return "show";
    if(/休憩|ホテル|宿|チェックイン|チェックアウト|トイレ|仮眠/.test(n)) return "rest";
    if(/会議|打ち合わせ|仕事|作業|勉強|診察|受付|手続き|会計|申請/.test(n)) return "work";
    return hasWait ? "act" : "other";
}

// ---------- 中身を きれいにする（クラウド・ファイルから来たデータも ここを通す）----------
function itnCleanItem(x){
    x = x && typeof x === "object" ? x : {};
    const tm = (v) => typeof v === "string" && itnMin(v) != null ? v : "";
    const num = (v, lo, hi) => { if(v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
    const st = ITN_ST[x.st] ? x.st : "t";
    return {
        i: String(x.i || "").replace(/[^\w-]/g, "").slice(0, 12) || itnId(),
        k: ITN_CATS.some((c) => c[0] === x.k) ? x.k : "other",
        n: String(x.n || "").replace(/[\r\n\t]+/g, " ").slice(0, 60),
        s: tm(x.s), e: tm(x.e), w: num(x.w, 0, 600),
        m: String(x.m || "").replace(/[\r\n\t]+/g, " ").slice(0, 120), c: num(x.c, 0, 10000000),
        st, ts: (st === "w" || st === "d") && Number.isFinite(Number(x.ts)) ? Number(x.ts) : 0,
        aw: num(x.aw, 0, 1440), as: tm(x.as), ae: tm(x.ae),
        nt: String(x.nt || "").replace(/\r/g, "").slice(0, 200), r: num(x.r, 0, 5) || 0, al: x.al === 0 ? 0 : 1,
        p: Array.isArray(x.p) && x.p.length === 2 && x.p[0] != null && x.p[1] != null && Number.isFinite(Number(x.p[0])) && Number.isFinite(Number(x.p[1])) && Math.abs(Number(x.p[0])) <= 90 && Math.abs(Number(x.p[1])) <= 180 ? [Math.round(Number(x.p[0]) * 1e4) / 1e4, Math.round(Number(x.p[1]) * 1e4) / 1e4] : null
    };
}
function itnCleanPlan(p, id){
    if(!p || typeof p !== "object") return null;
    const pid = String(id || p.id || "").replace(/[^\w-]/g, "").slice(0, 20);
    if(pid.length < 3) return null;
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, ITN_MAX_ITEMS).map(itnCleanItem);
    const seen = new Set(); items.forEach((it) => { while(seen.has(it.i)) it.i = itnId(); seen.add(it.i); });
    return {id: pid, title: String(p.title || "行動予定表").replace(/[\r\n\t]+/g, " ").slice(0, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : "", t: Number(p.t) > 0 ? Number(p.t) : Date.now(), items};
}
/** 保存用に、からっぽの項目を省いて小さくする（クラウドは 1 件 約19KBまで） */
function itnPackPlan(plan){
    return {id: plan.id, title: plan.title, date: plan.date, t: plan.t, items: plan.items.map((it) => {
        const o = {i: it.i, n: it.n};
        if(it.k !== "other") o.k = it.k; if(it.s) o.s = it.s; if(it.e) o.e = it.e; if(it.w != null) o.w = it.w; if(it.m) o.m = it.m; if(it.c != null) o.c = it.c;
        if(it.st !== "t") o.st = it.st; if(it.ts) o.ts = it.ts; if(it.aw != null) o.aw = it.aw; if(it.as) o.as = it.as; if(it.ae) o.ae = it.ae;
        if(it.nt) o.nt = it.nt; if(it.r) o.r = it.r; if(it.al === 0) o.al = 0; if(it.p) o.p = it.p;
        return o;
    })};
}
const itnBytes = (v) => { try{ return new Blob([JSON.stringify(v)]).size; }catch(_e){ return JSON.stringify(v).length * 3; } };

// ---------- 保存（この端末）----------
function itnLoad(){
    itn.plans = {};
    try{
        const d = JSON.parse(localStorage.getItem(ITN_LS()) || "null");
        if(d && typeof d === "object"){
            Object.keys(d.plans || {}).slice(0, ITN_MAX_PLANS).forEach((id) => { const p = itnCleanPlan(d.plans[id], id); if(p) itn.plans[p.id] = p; });
            itn.active = String(d.active || "");
            if(d.prefs && typeof d.prefs === "object") Object.keys(itn.prefs).forEach((k) => { if(k in d.prefs && typeof d.prefs[k] === typeof itn.prefs[k]) itn.prefs[k] = d.prefs[k]; });
            itn.fired = d.fired && typeof d.fired === "object" ? d.fired : {};
            itn.del = d.del && typeof d.del === "object" ? d.del : {};
        }
    }catch(_e){}
    itnFix();
}
function itnFix(){
    if(!itn.plans[itn.active]) itn.active = Object.keys(itn.plans).sort((a, b) => itn.plans[b].t - itn.plans[a].t)[0] || "";
    const cut = Date.now() - 3 * 86400000;
    Object.keys(itn.fired).forEach((k) => { if(!(Number(itn.fired[k]) > cut)) delete itn.fired[k]; });
}
function itnSaveLocal(){
    try{
        const plans = {}; Object.keys(itn.plans).forEach((id) => { plans[id] = itnPackPlan(itn.plans[id]); });
        localStorage.setItem(ITN_LS(), JSON.stringify({v: 1, active: itn.active, prefs: itn.prefs, fired: itn.fired, del: itn.del, plans}));
    }catch(_e){ showToast("この端末に保存できませんでした（空き容量をご確認ください）。"); }
}
/** 変更したら、これを呼ぶ（端末に保存 → あとでクラウドにも保存）*/
function itnTouch(plan){ if(plan){ plan.t = Date.now(); itn.dirty.add(plan.id); } itnSaveLocal(); itnCloudSoon(); }
const itnPlan = () => itn.plans[itn.active] || null;
function itnNewPlan(title, date, items){
    const ids = Object.keys(itn.plans);
    if(ids.length >= ITN_MAX_PLANS) throw new Error("予定表は " + ITN_MAX_PLANS + " 個までです。いらないものを消してください。");
    const plan = itnCleanPlan({id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), title: title || "行動予定表", date: date || itnToday(), t: Date.now(), items: items || []});
    itn.plans[plan.id] = plan; itn.active = plan.id; itnTouch(plan);
    return plan;
}

// ---------- クラウド（user_prefs）----------
let itnCloudTimer = 0;
function itnCloudSoon(){ clearTimeout(itnCloudTimer); itnCloudTimer = setTimeout(itnCloudPush, 2500); }
async function itnCloudPush(){
    if(itn.cloudOff || !state || !state.user || !itn.dirty.size) return;
    const ids = Array.from(itn.dirty); itn.dirty.clear();
    let failed = false;
    for(const id of ids){
        let value = null;
        if(itn.plans[id]) value = itnPackPlan(itn.plans[id]); else if(itn.del[id]) value = {del: 1, t: itn.del[id]}; else continue;
        if(itnBytes(value) > ITN_CLOUD_BYTES){ itn.cloudMsg = "「" + (itn.plans[id] ? itn.plans[id].title : id) + "」は大きすぎて、クラウドには入りません（この端末には保存されています）。項目を減らしてください。"; continue; }
        try{
            const r = await requireClient().from("user_prefs").upsert({user_id: state.user.id, key: "itin:" + id, value, updated_at: new Date().toISOString()}, {onConflict: "user_id,key"});
            if(r.error){ if(typeof isMissingBackend === "function" && isMissingBackend(r.error)) itn.cloudOff = true; throw r.error; }
            itn.cloudMsg = "";
        }catch(_e){ failed = true; itn.dirty.add(id); }
    }
    if(failed && !itn.cloudOff){ itn.cloudMsg = "クラウドに送れませんでした（この端末には保存済み）。あとでもう一度ためします。"; clearTimeout(itnCloudTimer); itnCloudTimer = setTimeout(itnCloudPush, 30000); }
    if(typeof itnRenderStatus === "function") itnRenderStatus();
}
async function itnCloudPull(){
    if(itn.cloudOff || !state || !state.user) return;
    itn.pulledAt = Date.now();
    try{
        const r = await requireClient().from("user_prefs").select("key,value").eq("user_id", state.user.id).like("key", "itin:%");
        if(r.error){ if(typeof isMissingBackend === "function" && isMissingBackend(r.error)) itn.cloudOff = true; return; }
        const rows = Array.isArray(r.data) ? r.data : []; let changed = false;
        rows.forEach((row) => {
            const id = String(row.key || "").slice(5); if(!/^[\w-]{3,20}$/.test(id)) return;
            const v = row.value; if(!v || typeof v !== "object") return;
            const loc = itn.plans[id];
            if(v.del){ const t = Number(v.t) || 0; itn.del[id] = Math.max(itn.del[id] || 0, t); if(loc && t > loc.t){ delete itn.plans[id]; changed = true; } return; }
            const p = itnCleanPlan(v, id); if(!p) return;
            if(!loc){ if(Object.keys(itn.plans).length < ITN_MAX_PLANS && !(itn.del[id] > p.t)){ itn.plans[id] = p; changed = true; } }
            else if(p.t > loc.t){ itn.plans[id] = p; changed = true; }
            else if(loc.t > p.t) itn.dirty.add(id);
        });
        Object.keys(itn.plans).forEach((id) => { if(!rows.some((row) => row.key === "itin:" + id)) itn.dirty.add(id); });
        if(changed){ itnFix(); itnSaveLocal(); if(typeof itnRender === "function") itnRender(); }
        itnCloudSoon();
    }catch(_e){ /* つながらなくても使える */ }
}

// ---------- アラーム（音・振動・ポップアップ・通知）----------
function itnAudio(){
    try{
        if(!itn.ac){ const A = window.AudioContext || window.webkitAudioContext; if(!A) return null; itn.ac = new A(); }
        if(itn.ac.state === "suspended") itn.ac.resume();
        return itn.ac;
    }catch(_e){ return null; }
}
function itnBeep(kind){
    if(itn.prefs.sound){
        const ac = itnAudio();
        if(ac){
            const notes = kind === "late" ? [440, 330, 440, 330] : kind === "go" ? [988, 1319, 988, 1319, 1568] : [880, 1175, 880];
            notes.forEach((f, i) => { try{ const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.22; o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.start(t); o.stop(t + 0.22); }catch(_e){} });
        }
    }
    if(itn.prefs.vibrate){ try{ if(navigator.vibrate) navigator.vibrate(kind === "late" ? [500, 200, 500] : [250, 120, 250, 120, 250]); }catch(_e){} }
}
async function itnSysNotify(title, body, tag){
    if(!itn.prefs.notify || !("Notification" in window) || Notification.permission !== "granted") return;
    try{
        const reg = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null;
        if(reg && reg.showNotification){ await reg.showNotification(title, {body, tag, icon: "icon-192.png", badge: "icon-192.png", renotify: true, vibrate: [200, 100, 200], data: {room: ""}}); return; }
    }catch(_e){}
    try{ new Notification(title, {body, tag}); }catch(_e){}
}
function itnPopup(key, title, body){
    let box = document.getElementById("itnPops");
    if(!box){ box = document.createElement("div"); box.id = "itnPops"; box.className = "itn-pops"; box.setAttribute("role", "alert"); document.body.appendChild(box); box.addEventListener("click", itnPopClick); }
    const div = document.createElement("div"); div.className = "itn-pop"; div.dataset.key = key;
    div.innerHTML = '<div class="itn-pop-t">' + itnE(title) + '</div><div class="itn-pop-b">' + itnE(body) + '</div><div class="itn-pop-r"><button type="button" data-a="ok">OK</button><button type="button" data-a="snz">5分あとで</button><button type="button" data-a="open">ひらく</button></div>';
    box.appendChild(div);
    while(box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { if(div.parentNode) div.parentNode.removeChild(div); }, 90000);
}
function itnPopClick(ev){
    const b = ev.target.closest("button[data-a]"); if(!b) return;
    const pop = b.closest(".itn-pop"), key = pop ? pop.dataset.key : "", a = b.dataset.a;
    itnAudio();
    if(a === "snz" && key){ itn.snooze[key] = Date.now() + 5 * 60000; showToast("5分あとに、もう一度お知らせします。"); }
    if(pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if(a === "open") runTool(openItin);
}
function itnFire(key, title, body, kind){
    if(itn.fired[key]) return;
    itn.fired[key] = Date.now(); itnSaveLocal();
    if(!itn.prefs.alarm) return;
    itnBeep(kind);
    if(itn.prefs.speak) itnSay(String(title).replace(/[⏰⌛]/g, "") + "。" + body);
    itnPopup(key, title, body);
    if(document.hidden || !document.hasFocus()) itnSysNotify(title, body, "itin-" + key.slice(0, 40));
}
function itnAlarmTick(){
    const now = Date.now();
    Object.keys(itn.snooze).forEach((k) => { if(itn.snooze[k] <= now){ delete itn.snooze[k]; delete itn.fired[k]; } });
    if(!itn.prefs.alarm) return;
    const today = itnToday();
    Object.keys(itn.plans).forEach((pid) => {
        const plan = itn.plans[pid]; if(plan.date !== today) return;
        plan.items.forEach((it) => {
            if(it.al === 0) return;
            const nm = it.n || "予定", base = pid + "|" + it.i;
            if(it.st === "w" && it.ts && itn.prefs.speak && Number(itn.prefs.speakEvery) > 0){
                const ev = Number(itn.prefs.speakEvery), k = Math.floor((now - it.ts) / 60000 / ev), key = "sp|" + base + "|" + it.ts + "|" + k;
                if(k >= 1 && !itn.fired[key]){ itn.fired[key] = now; itnSay("いま、" + (k * ev) + "分、待っています。" + (it.w > 0 ? "予想は、" + it.w + "分です。" : "")); }
            }
            if(it.st === "t" && it.s){
                const at = itnAt(plan.date, it.s), lead = Number(itn.prefs.lead);
                if(lead > 0 && now >= at - lead * 60000 && now < at) itnFire("pre|" + base + "|" + it.s, "⏰ あと " + lead + "分：" + nm, "予定 " + it.s + (it.w ? "（予想の待ち " + it.w + "分）" : ""), "pre");
                if(now >= at && now < at + 10 * 60000) itnFire("on|" + base + "|" + it.s, "⏰ 時間です：" + nm, "予定の " + it.s + " になりました。" + (it.w ? "予想の待ちは " + it.w + "分です。" : ""), "go");
            }else if(it.st === "w" && it.ts && it.w > 0){
                const el = (now - it.ts) / 60000;
                if(el >= it.w) itnFire("wx|" + base + "|" + it.ts, "⌛ 予想の待ち時間になりました：" + nm, "待ちはじめて " + it.w + "分たちました。", "pre");
                if(el >= it.w + 10) itnFire("wy|" + base + "|" + it.ts, "⌛ 予想より 10分 長くなっています：" + nm, "いま " + Math.round(el) + "分 待っています。続けますか？", "late");
            }else if(it.st === "d" && it.e){
                const at = itnAt(plan.date, it.e);
                if(now >= at && now < at + 30 * 60000) itnFire("end|" + base + "|" + it.ts, "⏰ 終わりの時刻です：" + nm, "予定の終わり " + it.e + " になりました。", "pre");
            }
        });
    });
}
function itnStartAlarm(){
    if(itn.alarm) return;
    itn.alarm = setInterval(itnAlarmTick, 4000);
    document.addEventListener("visibilitychange", () => { if(!document.hidden){ itnAlarmTick(); if(itn.wlWant) itnWake(true); } });
}
/** 画面を消さない（対応しているブラウザだけ）*/
async function itnWake(on){
    try{
        itn.wlWant = on;
        if(!on){ if(itn.wl){ await itn.wl.release(); itn.wl = null; } return; }
        if(navigator.wakeLock && !document.hidden && !itn.wl){ itn.wl = await navigator.wakeLock.request("screen"); itn.wl.addEventListener("release", () => { itn.wl = null; }); }
    }catch(_e){ itn.wl = null; }
}

// ---------- 予定のあつかい ----------
const itnItem = (plan, id) => plan ? plan.items.find((x) => x.i === id) : null;
function itnSnap(plan, it, label){ itn.undo = {pid: plan.id, id: it.i, label, snap: JSON.stringify(it), at: Date.now()}; }
function itnDoUndo(){
    const u = itn.undo; if(!u) return false;
    const plan = itn.plans[u.pid]; if(!plan) return false;
    const idx = plan.items.findIndex((x) => x.i === u.id), old = itnCleanItem(JSON.parse(u.snap));
    if(idx < 0) plan.items.push(old); else plan.items[idx] = old;
    itn.undo = null; itnTouch(plan); return true;
}
/** 状態を進める：まだ→(並び中)→進行中→完了 */
function itnAdvance(plan, it, act){
    const now = Date.now(), hm = itnNowHM();
    if(act === "wait"){ itnSnap(plan, it, "「並びはじめた」"); it.st = "w"; it.ts = now; it.aw = null; it.as = ""; it.ae = ""; }
    else if(act === "begin"){
        itnSnap(plan, it, "「はじまった」");
        const sh = it.st === "w" && it.ts ? new Date(it.ts).getHours() : -1;
        if(it.st === "w" && it.ts) it.aw = Math.max(0, Math.round((now - it.ts) / 60000));
        it.st = "d"; it.ts = now; it.as = hm; it.ae = "";
        if(sh >= 0) itnCrowdReport(it, sh);
    }else if(act === "finish"){
        itnSnap(plan, it, "「おわった」");
        if(it.st === "w" && it.ts){ it.aw = Math.max(0, Math.round((now - it.ts) / 60000)); it.as = hm; itnCrowdReport(it, new Date(it.ts).getHours()); }
        if(!it.as) it.as = hm;
        it.st = "x"; it.ts = 0; it.ae = hm;
    }else if(act === "skip"){ itnSnap(plan, it, "「スキップ」"); it.st = "s"; it.ts = 0; }
    else if(act === "reopen"){ itnSnap(plan, it, "「もどす」"); it.st = "t"; it.ts = 0; it.aw = null; it.as = ""; it.ae = ""; }
    itn.focus = "";
    itnTouch(plan);
}
/** 次の予定（時刻順ではなく、表の順番どおり） */
function itnWorking(plan){ return plan.items.filter((x) => x.st === "w" || x.st === "d"); }
function itnNextTodo(plan){
    const f = itn.focus && plan.items.find((x) => x.i === itn.focus && x.st === "t");
    return f || plan.items.find((x) => x.st === "t") || null;
}
/** 全体の遅れ。d（分）がプラス＝予定より遅れ、マイナス＝予定より早い（st は基準にした予定の状態）。今日の予定表のときだけ出す */
function itnDelay(plan){
    if(plan.date && plan.date !== itnToday()) return null;
    const ref = plan.items.find((x) => (x.st === "t" || x.st === "w" || x.st === "d") && itnMin(x.s) != null);
    if(!ref) return null;
    const planned = itnMin(ref.s); let actual;
    if(ref.st === "t") actual = itnNowMin();
    else if(ref.st === "w" && ref.ts){ const d = new Date(ref.ts); actual = d.getHours() * 60 + d.getMinutes(); }
    else if(ref.st === "d" && itnMin(ref.as) != null) actual = itnMin(ref.as);
    else return null;
    const d = actual - planned;
    return Math.abs(d) > 720 ? null : {d, st: ref.st};
}
function itnShift(plan, ids, delta){
    let n = 0;
    plan.items.forEach((it) => {
        if(!ids.includes(it.i) || it.st !== "t") return;
        ["s", "e"].forEach((f) => { const m = itnMin(it[f]); if(m != null) it[f] = itnHM(m + delta); });
        n++;
    });
    return n;
}
/** 同じ名前の、これまでの実際の待ち時間（ほかの予定表もふくむ）*/
function itnHist(name, exceptId){
    const key = String(name || "").replace(/[\s　]+/g, "").toLowerCase(); if(!key) return null;
    const v = [];
    Object.keys(itn.plans).forEach((pid) => itn.plans[pid].items.forEach((it) => {
        if(it.i === exceptId || it.st !== "x" || it.aw == null) return;
        if(String(it.n).replace(/[\s　]+/g, "").toLowerCase() === key) v.push(it.aw);
    }));
    return v.length ? {n: v.length, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), last: v[v.length - 1]} : null;
}
function itnStats(plan){
    const its = plan.items, done = its.filter((x) => x.st === "x"), skip = its.filter((x) => x.st === "s");
    const both = done.filter((x) => x.aw != null && x.w != null);
    const expAll = its.reduce((a, x) => a + (x.w || 0), 0);
    const expDone = both.reduce((a, x) => a + x.w, 0), actDone = both.reduce((a, x) => a + x.aw, 0);
    const waits = done.filter((x) => x.aw != null);
    const longest = waits.slice().sort((a, b) => b.aw - a.aw)[0] || null;
    const cost = its.filter((x) => x.st !== "s").reduce((a, x) => a + (x.c || 0), 0);
    return {total: its.length, done: done.length, skip: skip.length, expAll, expDone, actDone, cmp: both.length, waitN: waits.length, actAll: waits.reduce((a, x) => a + x.aw, 0), avg: waits.length ? Math.round(waits.reduce((a, x) => a + x.aw, 0) / waits.length) : 0, longest, cost,
        shorter: both.filter((x) => x.aw < x.w).length, longer: both.filter((x) => x.aw > x.w).length};
}

// ---------- みんなの待ち時間（名前なしの集計。サーバー側の表と関数が入っているときだけ 使う）----------
/** 名前をそろえた「かぎ」（全角半角・大文字小文字・空白のちがいを なくす）。サーバーにも この形で送る */
const itnKey = (n) => { try{ return String(n || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/g, "").slice(0, 40); }catch(_e){ return ""; } };
const itnCrowdMissing = (e) => /PGRST202|42883|could not find|does not exist|schema cache/i.test(String((e && (e.message || e.code || e.details)) || ""));
async function itnCrowdFetch(force){
    if(itn.crowdOff || !state || !state.user) return;
    if(!force && Date.now() - itn.crowdAt < 600000) return;
    const plan = itnPlan(); if(!plan) return;
    const names = Array.from(new Set(plan.items.map((x) => itnKey(x.n)).filter((k) => k.length >= 2))).slice(0, 60);
    if(!names.length) return;
    itn.crowdAt = Date.now();
    try{
        const r = await requireClient().rpc("itin_wait_stats", {p_names: names});
        if(r.error){ if(itnCrowdMissing(r.error)) itn.crowdOff = true; return; }
        itn.crowdOk = true;
        (Array.isArray(r.data) ? r.data : []).forEach((row) => { const k = String(row.name_key || ""); if(k) itn.crowd[k] = {n: Number(row.n) || 0, users: Number(row.users) || 0, avg: Number(row.avg_min) || 0, med: Number(row.median_min) || 0}; });
        if(typeof itnRender === "function") itnRender();
    }catch(e){ if(itnCrowdMissing(e)) itn.crowdOff = true; }
}
function itnCrowdReport(it, hour){
    if(!itn.prefs.crowd || itn.crowdOff || !(it.aw >= 1) || !state || !state.user) return;
    const k = itnKey(it.n); if(k.length < 2) return;
    try{ Promise.resolve(requireClient().rpc("itin_report_wait", {p_name: k, p_wait: it.aw, p_hour: hour})).then((r) => { if(r && r.error && itnCrowdMissing(r.error)) itn.crowdOff = true; }, () => {}); }catch(_e){}
}
const itnCrowdOf = (name) => itn.crowdOff ? null : (itn.crowd[itnKey(name)] || null);

// ---------- 予定表チェック＆自動調整 ----------
function itnCheck(plan){
    const its = plan.items, out = [], live = its.filter((x) => x.st === "t" || x.st === "w" || x.st === "d");
    const timed = live.filter((x) => itnMin(x.s) != null).map((x, i) => ({x, i})).sort((a, b) => itnMin(a.x.s) - itnMin(b.x.s) || a.i - b.i).map((o) => o.x);
    its.forEach((x) => {
        const s = itnMin(x.s), e = itnMin(x.e);
        if(s != null && e != null && e < s) out.push({t: "rev", id: x.i, msg: "「" + x.n + "」の終わり（" + x.e + "）が 始まり（" + x.s + "）より 前になっています"});
        else if(s != null && e != null && x.st !== "x" && x.st !== "s" && x.w > 0 && e - s < x.w) out.push({t: "slot", id: x.i, msg: "「" + x.n + "」は 予想の待ちが " + x.w + "分なのに、予定の枠が " + (e - s) + "分しか ありません"});
    });
    for(let i = 1; i < timed.length; i++){
        const a = timed[i - 1], b = timed[i], ae = itnMin(a.e) != null ? itnMin(a.e) : null, bs = itnMin(b.s);
        if(ae != null && bs < ae) out.push({t: "lap", id: b.i, over: ae - bs, msg: "「" + a.n + "」と「" + b.n + "」が " + (ae - bs) + "分 重なっています"});
        else if(ae != null && bs - ae < 5 && (a.w > 0 || b.w > 0)) out.push({t: "tight", id: b.i, msg: "「" + a.n + "」→「" + b.n + "」は 間が " + (bs - ae) + "分 しかなく、待ちが のびると 間に合わなくなります"});
    }
    const nt = live.filter((x) => itnMin(x.s) == null && x.st === "t").length;
    if(nt) out.push({t: "notime", msg: "時刻が まだ入っていない予定が " + nt + "件 あります（時刻なしでも 使えますが、アラームは 鳴りません）"});
    if(timed.length >= 4){
        const lo = Math.min(...timed.map((x) => itnMin(x.s))), hi = Math.max(...timed.map((x) => itnMin(x.e) != null ? itnMin(x.e) : itnMin(x.s)));
        if(lo <= 11 * 60 + 30 && hi >= 13 * 60 && !its.some((x) => x.k === "eat" && itnMin(x.s) != null && itnMin(x.s) >= 10 * 60 + 30 && itnMin(x.s) <= 14 * 60 + 30)) out.push({t: "meal", msg: "お昼ごろに「食事」の予定が ありません（朝から夕方まで 動く予定です）"});
    }
    return out;
}
/** 自動調整：①終わりと始まりの逆を直す ②待ちが入らない枠を ひろげる ③重なりを ずらして なくす ④時刻順にならべる。やる前の状態は 1つ 取っておく */
function itnAutoFix(plan){
    itn.undoAll = {pid: plan.id, snap: JSON.stringify(itnPackPlan(plan))};
    let n = 0;
    plan.items.forEach((x) => {
        const s = itnMin(x.s), e = itnMin(x.e);
        if(s != null && e != null && e < s){ x.s = itnHM(e); x.e = itnHM(s); n++; }
    });
    plan.items.forEach((x) => {
        const s = itnMin(x.s), e = itnMin(x.e);
        if((x.st === "t" || x.st === "w") && s != null && e != null && x.w > 0 && e - s < x.w){ x.e = itnHM(s + x.w + 5); n++; }
    });
    const todo = plan.items.filter((x) => x.st === "t" && itnMin(x.s) != null).map((x, i) => ({x, i})).sort((a, b) => itnMin(a.x.s) - itnMin(b.x.s) || a.i - b.i).map((o) => o.x);
    let prevEnd = null;
    todo.forEach((x) => {
        const s = itnMin(x.s), e = itnMin(x.e);
        if(prevEnd != null && s < prevEnd){ const d = prevEnd - s; x.s = itnHM(s + d); if(e != null) x.e = itnHM(e + d); n++; }
        const ne = itnMin(x.e); prevEnd = ne != null ? ne : itnMin(x.s);
    });
    const idx = new Map(plan.items.map((x, i) => [x, i]));
    plan.items.sort((a, b) => { const p = itnMin(a.s), q = itnMin(b.s); if(p == null && q == null) return idx.get(a) - idx.get(b); if(p == null) return 1; if(q == null) return -1; return p - q || idx.get(a) - idx.get(b); });
    itnTouch(plan);
    return n;
}
function itnUndoAll(){
    const u = itn.undoAll; if(!u) return false;
    const plan = itn.plans[u.pid]; if(!plan) return false;
    const old = itnCleanPlan(JSON.parse(u.snap), plan.id); if(!old) return false;
    plan.items = old.items; itn.undoAll = null; itnTouch(plan); return true;
}

// ---------- 声で操作（ハンズフリー）----------
const ITN_VOICE = [
    ["undo", /もどして|戻して|もどす|戻す|取り消|とりけし|やりなおし|やり直し/],
    ["skip", /スキップ|やめた|やめます|パス/],
    ["wait", /ならびはじめ|並びはじめ|並び始め|ならび始め|並びます|ならびます|並んだ|ならんだ|並ぶ|ならぶ/],
    ["finish", /おわった|終わった|おわり|終わり|終了|完了|かんりょう|降りた|おりた|出た|でた/],
    ["begin", /はじまった|始まった|乗れた|のれた|入れた|はいれた|はじめた|始めた|はじめます|スタート/],
    ["now", /いま(なんぷん|何分)|なんぷん|何分|待ち時間|まちじかん/],
    ["next", /つぎ|次/]
];
function itnVoiceCmd(text){
    let t = ""; try{ t = String(text || "").normalize("NFKC").replace(/[\s　、。,.！!？?]/g, ""); }catch(_e){ t = String(text || ""); }
    for(const c of ITN_VOICE){ if(c[1].test(t)) return c[0]; }
    return "";
}
/** 声のコマンドを実行する。返り値は 画面に出す ひとこと */
function itnVoiceDo(cmd){
    const plan = itnPlan(); if(!plan) return "";
    const work = itnWorking(plan), nxt = itnNextTodo(plan), waiting = work.find((x) => x.st === "w"), doing = work.find((x) => x.st === "d");
    let msg = "";
    if(cmd === "undo"){ msg = itnDoUndo() ? "元に戻しました" : "戻せるものが ありません"; }
    else if(cmd === "wait"){ const t = waiting ? null : nxt; if(t){ itnAdvance(plan, t, "wait"); msg = "「" + t.n + "」に 並びはじめました"; } else msg = waiting ? "もう 並んでいます" : "つぎの予定が ありません"; }
    else if(cmd === "begin"){ const t = waiting || nxt; if(t && !doing){ itnAdvance(plan, t, "begin"); msg = "「" + t.n + "」はじまり" + (t.aw != null ? "（待ち " + t.aw + "分）" : ""); } else msg = doing ? "もう はじまっています" : "つぎの予定が ありません"; }
    else if(cmd === "finish"){ const t = doing || waiting; if(t){ itnAdvance(plan, t, "finish"); const nx = itnNextTodo(plan); msg = "「" + t.n + "」おわり。" + (nx ? "つぎは「" + nx.n + "」" + (nx.s ? "、" + itnClockSay(nx.s) + "から" : "") + "です" : "ぜんぶ おわりました"); } else msg = "進行中の予定が ありません"; }
    else if(cmd === "skip"){ const t = waiting || doing || nxt; if(t){ itnAdvance(plan, t, "skip"); msg = "「" + t.n + "」をスキップ"; } else msg = "予定が ありません"; }
    else if(cmd === "next"){ msg = nxt ? "つぎは「" + nxt.n + "」" + (nxt.s ? "、" + nxt.s + "です" : "") : "つぎの予定は ありません"; }
    else if(cmd === "now"){ msg = waiting ? "いま " + Math.max(0, Math.round((Date.now() - waiting.ts) / 60000)) + "分 待っています" + (waiting.w > 0 ? "。予想は " + waiting.w + "分です" : "") : doing ? "「" + doing.n + "」の最中です" : "いまは 待っていません"; }
    return msg;
}
function itnVoiceHandle(text){
    const cmd = itnVoiceCmd(text); if(!cmd) return false;
    const msg = itnVoiceDo(cmd);
    if(msg){ showToast("🎙 " + msg); itnSay(msg, true); try{ if(navigator.vibrate) navigator.vibrate(40); }catch(_e){} }
    if(typeof itnRender === "function") itnRender();
    return true;
}
function itnVoiceStop(){ itn.voiceOn = false; try{ if(itn.vrec) itn.vrec.stop(); }catch(_e){} itn.vrec = null; }
function itnVoiceStart(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ showToast("このブラウザでは 声の操作を使えません。"); return false; }
    try{ if(itn.rec){ itn.rec.stop(); itn.rec = null; } }catch(_e){}
    const r = new SR(); r.lang = "ja-JP"; r.continuous = true; r.interimResults = false; r.maxAlternatives = 3;
    r.onresult = (e) => { for(let i = e.resultIndex; i < e.results.length; i++){ if(!e.results[i].isFinal) continue; for(let j = 0; j < e.results[i].length; j++){ if(itnVoiceHandle(e.results[i][j].transcript)) break; } } };
    r.onerror = (e) => { if(e && (e.error === "not-allowed" || e.error === "service-not-allowed")){ itn.voiceOn = false; showToast("マイクが 許可されていません。"); if(typeof itnRender === "function") itnRender(); } };
    r.onend = () => { if(itn.voiceOn && document.getElementById("itnRoot")){ try{ r.start(); }catch(_e){ itn.voiceOn = false; } } else { itn.voiceOn = false; if(typeof itnRender === "function") itnRender(); } };
    itn.vrec = r; itn.voiceOn = true;
    try{ r.start(); }catch(_e){ itn.voiceOn = false; return false; }
    return true;
}

// ---------- 読み上げ（ブラウザの音声合成。外のサービスは使いません）----------
function itnVoice(){
    try{ const vs = window.speechSynthesis.getVoices() || []; return vs.find((v) => /^ja[-_]JP/i.test(v.lang) && /Kyoko|O-Ren|Google|Microsoft|Haruka|Sayaka|Ichiro/i.test(v.name)) || vs.find((v) => /^ja/i.test(v.lang)) || null; }catch(_e){ return null; }
}
/** しゃべる。force=true は 「読み上げ」のスイッチが切れていても 話す（「つぎは？」と聞かれたときなど）*/
function itnSay(text, force){
    try{
        if(!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
        if(!force && !itn.prefs.speak) return false;
        const u = new SpeechSynthesisUtterance(String(text).slice(0, 400)); u.lang = "ja-JP"; u.rate = Math.min(1.6, Math.max(0.6, Number(itn.prefs.rate) || 1));
        const v = itnVoice(); if(v) u.voice = v;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); return true;
    }catch(_e){ return false; }
}
function itnSayStop(){ try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(_e){} }
const itnClockSay = (hm) => { const m = itnMin(hm); return m == null ? "" : Math.floor(m / 60) + "時" + (m % 60 ? (m % 60) + "分" : ""); };
/** 動作のあと、自動で 読み上げる文（「読み上げ」＋「動作のあとも読み上げる」がオンのとき）*/
function itnSayAction(act, plan, it){
    if(!itn.prefs.speak || !itn.prefs.speakAct || !it) return;
    const nxt = itnNextTodo(plan), nxtTxt = nxt ? "つぎは、" + nxt.n + (nxt.s ? "、" + itnClockSay(nxt.s) + "からです。" : "です。") : "ぜんぶ おわりました。おつかれさまでした。";
    if(act === "wait") itnSay(it.n + "に、並びはじめました。" + (it.w > 0 ? "予想の待ち時間は、" + it.w + "分です。" : ""));
    else if(act === "begin") itnSay((it.aw != null ? "待ち時間は、" + it.aw + "分でした。" : "") + it.n + "、はじまりました。");
    else if(act === "finish") itnSay(it.n + "、おわりました。" + (it.aw != null && it.w > 0 ? (it.aw < it.w ? "予想より、" + (it.w - it.aw) + "分 早かったです。" : it.aw > it.w ? "予想より、" + (it.aw - it.w) + "分 長かったです。" : "予想どおりでした。") : "") + nxtTxt);
    else if(act === "skip") itnSay(it.n + "を、スキップしました。" + nxtTxt);
}
/** のこりの予定を ぜんぶ 読み上げる */
function itnSayPlan(plan){
    const todo = plan.items.filter((x) => x.st === "t" || x.st === "w" || x.st === "d");
    if(!todo.length){ itnSay("のこりの予定は、ありません。", true); return; }
    const L = ["のこりの予定は、" + todo.length + "件です。"];
    todo.slice(0, 12).forEach((x, i) => L.push((x.s ? itnClockSay(x.s) + "、" : "") + x.n + (x.w > 0 ? "、予想の待ちは " + x.w + "分" : "") + "。"));
    if(todo.length > 12) L.push("ほか、" + (todo.length - 12) + "件です。");
    itnSay(L.join(""), true);
}
