"use strict";
// ===== 利用時間レポート（ログインしてチャットを使っていた時間の記録と、ランキング）=====
// ・計測：この画面が「見えていて」、直近2分以内に さわった（クリック・タップ・キー・スクロール）か、通話中の間だけ数える。
//   5秒ごとに数え、5分ごと（と、画面を閉じる・かくすとき）に、GAS（gas/file-storage.gs の action=usage）へ まとめて送る。Supabase は使わない。
// ・記録しない人：管理者（見るだけ）・「家庭」の区分の人・お試し（ゲスト）。この人たちには、入口（その他 →「📊 利用時間レポート」）も出さない。
//   サーバー側（GAS）も同じ決まりで、送られてきても記録しない・ランキングも返さない。
// ・ランキング：「家庭」以外の全員。名前は、管理者には ぜんぶ本名／ほかの人には 同じグループ（区分）の人だけ本名・ほかのグループは匿名。
//   区分「その他」は隔離の決まりのため、同じ「その他」どうしでも匿名。本名を返してよい行にだけ、GAS が名前を入れて返す（匿名の行の名前は、この画面に届かない）。
// ・文は 4言語（日本語・English・中文・한국어）。この画面の中の文字は、自動翻訳の対象外（data-i18n-skip）にして、ここで言語を選ぶ。
// ・GAS をまだ更新していないとき・サーバーの関数がまだのときは、記録を端末に溜めるだけで（最大30分）、画面には「準備中」と出す。

const UX_IDLE_MS = 120000;        // さわってから この時間までは「使っている」
const UX_TICK_MS = 5000;
const UX_FLUSH_MS = 300000;       // 送る間隔
const UX_PEND_MAX = 1800;         // 端末に溜めておく最大（秒）
const UX_RETRY_MS = 1800000;      // GAS が未更新のとき、つぎに送りなおすまで
const UX_TX = {
    ja: {
        title:"📊 利用時間レポート",
        noteUser:"ログインしてチャットを使っていた時間（画面を開いて操作していた時間）を、自動で記録しています。ランキングでは、同じグループの人は名前、ほかのグループの人は匿名で表示されます。",
        noteOther:"ログインしてチャットを使っていた時間（画面を開いて操作していた時間）を、自動で記録しています。ランキングでは、ほかの人は匿名で表示されます。",
        noteAdmin:"管理者は閲覧のみです（管理者の時間は記録されません）。全員の名前が表示されます。",
        day:"今日", week:"7日間", month:"30日間", all:"累計",
        me:"あなた", youAre:"あなたの時間", rankN:"{n}位", ofN:"{n}人中", none:"まだ記録がありません", emptyList:"この期間の記録は、まだありません。",
        loading:"読み込み中…", refresh:"🔄 更新", updated:"更新 {t}", people:"{n}人が記録中", week7:"最近7日間のあなたの時間", anon:"匿名 {c}",
        errGeneric:"レポートを読み込めませんでした。しばらくしてから、もう一度お試しください。", errOffline:"通信できませんでした。電波のよいところで、もう一度お試しください。",
        errNotReady:"利用時間の記録の準備が、まだ終わっていません（管理者がGASを更新すると使えます）。", errServer:"サーバー側の準備が、まだ終わっていません。",
        errLogin:"ログインが確認できませんでした。いちどログアウトして、ログインし直してください。", unavailable:"このアカウントでは、利用時間レポートは使えません。",
        seg_work:"社員", seg_friend:"友人", seg_other:"その他", seg_home:"家庭", dur_h:"時間", dur_m:"分", dur_s:"秒", adminOnly:"閲覧のみ"
    },
    en: {
        title:"📊 Usage report",
        noteUser:"The time you spend using the chat while logged in (with the screen open and in use) is recorded automatically. In the ranking, people in your group are shown by name and people in other groups are anonymous.",
        noteOther:"The time you spend using the chat while logged in (with the screen open and in use) is recorded automatically. In the ranking, other people are shown anonymously.",
        noteAdmin:"Administrators can view only (their own time is not recorded). Everyone's name is shown.",
        day:"Today", week:"7 days", month:"30 days", all:"Total",
        me:"You", youAre:"Your time", rankN:"#{n}", ofN:"of {n}", none:"No record yet", emptyList:"There are no records for this period yet.",
        loading:"Loading…", refresh:"🔄 Refresh", updated:"Updated {t}", people:"{n} people recorded", week7:"Your time over the last 7 days", anon:"Anonymous {c}",
        errGeneric:"Could not load the report. Please try again in a little while.", errOffline:"Could not connect. Please try again where the signal is better.",
        errNotReady:"Usage recording is not set up yet (it works once the administrator updates the GAS).", errServer:"The server side is not set up yet.",
        errLogin:"Could not confirm your login. Please log out and log in again.", unavailable:"The usage report is not available for this account.",
        seg_work:"Staff", seg_friend:"Friends", seg_other:"Other", seg_home:"Family", dur_h:"h", dur_m:"m", dur_s:"s", adminOnly:"View only"
    },
    zh: {
        title:"📊 使用时间报告",
        noteUser:"登录后使用聊天的时间（打开并操作屏幕的时间）会被自动记录。在排行榜中，同一分组的人显示姓名，其他分组的人匿名显示。",
        noteOther:"登录后使用聊天的时间（打开并操作屏幕的时间）会被自动记录。在排行榜中，其他人匿名显示。",
        noteAdmin:"管理员仅可查看（管理员自己的时间不会被记录）。显示所有人的姓名。",
        day:"今天", week:"7天", month:"30天", all:"累计",
        me:"你", youAre:"你的时间", rankN:"第{n}名", ofN:"共{n}人", none:"暂无记录", emptyList:"此期间还没有记录。",
        loading:"加载中…", refresh:"🔄 刷新", updated:"更新于 {t}", people:"{n}人正在记录", week7:"你最近7天的时间", anon:"匿名 {c}",
        errGeneric:"无法加载报告，请稍后再试。", errOffline:"无法连接，请在信号较好的地方重试。",
        errNotReady:"使用时间的记录功能尚未准备好（管理员更新 GAS 后即可使用）。", errServer:"服务器端尚未准备好。",
        errLogin:"无法确认登录，请先退出再重新登录。", unavailable:"此账号无法使用“使用时间报告”。",
        seg_work:"员工", seg_friend:"朋友", seg_other:"其他", seg_home:"家人", dur_h:"小时", dur_m:"分", dur_s:"秒", adminOnly:"仅查看"
    },
    ko: {
        title:"📊 사용 시간 리포트",
        noteUser:"로그인해서 채팅을 사용한 시간(화면을 열고 조작한 시간)이 자동으로 기록됩니다. 순위에서는 같은 그룹 사람은 이름, 다른 그룹 사람은 익명으로 표시됩니다.",
        noteOther:"로그인해서 채팅을 사용한 시간(화면을 열고 조작한 시간)이 자동으로 기록됩니다. 순위에서는 다른 사람이 익명으로 표시됩니다.",
        noteAdmin:"관리자는 보기만 할 수 있습니다(관리자의 시간은 기록되지 않습니다). 모든 사람의 이름이 표시됩니다.",
        day:"오늘", week:"7일", month:"30일", all:"누적",
        me:"나", youAre:"내 시간", rankN:"{n}위", ofN:"{n}명 중", none:"아직 기록이 없습니다", emptyList:"이 기간의 기록은 아직 없습니다.",
        loading:"불러오는 중…", refresh:"🔄 새로고침", updated:"업데이트 {t}", people:"{n}명 기록 중", week7:"최근 7일간 내 시간", anon:"익명 {c}",
        errGeneric:"리포트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", errOffline:"연결할 수 없습니다. 전파가 좋은 곳에서 다시 시도해 주세요.",
        errNotReady:"사용 시간 기록 준비가 아직 끝나지 않았습니다(관리자가 GAS를 업데이트하면 사용할 수 있습니다).", errServer:"서버 쪽 준비가 아직 끝나지 않았습니다.",
        errLogin:"로그인을 확인하지 못했습니다. 로그아웃한 뒤 다시 로그인해 주세요.", unavailable:"이 계정에서는 사용 시간 리포트를 사용할 수 없습니다.",
        seg_work:"직원", seg_friend:"친구", seg_other:"기타", seg_home:"가족", dur_h:"시간", dur_m:"분", dur_s:"초", adminOnly:"보기 전용"
    }
};
const ux = {tok:"", tokAt:0, uid:"", pend:{}, inflight:null, acc:0, lastTick:0, lastAct:Date.now(), lastFlush:0, lastSave:0, busy:false, retryAt:0, off:"", timer:0, wired:false,
    data:null, period:"day", err:"", loading:false, open:false, seq:0, first:true};

// ---------- 小さな道具 ----------
function uxLang(){ try{ const l = window.AREI18N && window.AREI18N.lang; return UX_TX[l] ? l : "ja"; }catch(_e){ return "ja"; } }
function uxT(key, vars){
    let s = (UX_TX[uxLang()][key] != null ? UX_TX[uxLang()][key] : UX_TX.ja[key]) || key;
    if(vars) Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
}
/** 日本時間の日付（YYYY-MM-DD）。GAS も日本時間で日を数える */
function uxDay(ms){ return new Date((ms == null ? Date.now() : ms) + 9 * 3600000).toISOString().slice(0, 10); }
function uxUrl(){ const c = window.ARE_CONFIG || {}; return String(c.adsUrl || c.videoUploadUrl || "").trim(); }
/** 時間の書き方（言語ごと）：59秒まで＝秒／1時間未満＝分／それ以上＝時間と分 */
function uxDur(sec){
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const l = uxLang(), U = UX_TX[l], h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), gap = l === "en" || l === "ko" ? " " : "";
    if(sec < 60) return sec + U.dur_s;
    if(h < 1) return m + U.dur_m;
    return h + U.dur_h + (m ? gap + m + U.dur_m : "");
}

/** この人に、レポートを出して・記録してよいか：admin（見るだけ）／ user（記録する）／ off（家庭・お試し・まだ不明）
 *  区分の名前は、管理者以外には見えない決まりなので、サーバーが返す「ショートカットの組（quick）」だけで判断する（q1＝家庭）。わからない間は出さない */
function uxMode(){
    try{
        if(typeof state === "undefined" || !state || !state.user) return "off";
        if(document.body.classList.contains("has-guest-bar")) return "off";            // お試し（ゲスト）
        const f = typeof segSt === "object" && segSt ? segSt.flags : null;
        if(!f) return "off";
        if(f.is_admin === true) return "admin";
        if(f.quick === "q1" || f.restricted === true) return "off";                    // 家庭
        if(f.quick === "q2" || f.quick === "q3" || f.quick === "q4") return "user";
        return "off";                                                                  // 区分が まだ わからない
    }catch(_e){ return "off"; }
}
function uxEntryOk(){
    if(!uxUrl() || ux.off) return false;
    const m = uxMode();
    return m === "admin" || m === "user";
}
function uxSyncEntry(){
    try{
        const b = document.querySelector('.pane-more [data-tool="usage"]');
        if(!b) return;
        const show = uxEntryOk();
        const was = b.style.display !== "none";
        if(show){ if(!was) b.style.display = ""; } else if(was) b.style.display = "none";
        if(was !== show && typeof moSchedule === "function") moSchedule();                // 「その他」の分類の数を数えなおす
        if(!show && ux.open) uxCloseIfOpen();
    }catch(_e){ /* 出し入れできなくても使える */ }
}
function uxCloseIfOpen(){ try{ if(ux.open && el && el.profileSheet && el.profileSheet.querySelector(".ux-root")){ closeSheet(); } }catch(_e){} ux.open = false; }

// ---------- 計測 ----------
function uxUid(){ return typeof state !== "undefined" && state && state.user ? String(state.user.id) : ""; }
function uxPendKey(){ return "are_usage_pend_" + (uxUid() || "x"); }
function uxPendLoad(){
    ux.pend = {};
    try{
        const o = JSON.parse(localStorage.getItem(uxPendKey()) || "null");
        if(o && typeof o === "object") Object.keys(o).forEach((d) => { const n = Math.floor(Number(o[d])); if(/^\d{4}-\d{2}-\d{2}$/.test(d) && n > 0 && n <= UX_PEND_MAX) ux.pend[d] = n; });
    }catch(_e){ ux.pend = {}; }
}
function uxPendSave(){
    if(!ux.uid || ux.uid !== uxUid()) return;                 // まだ前回の分を読みこんでいない間は、保存しない（前回の残りを消さないため）
    ux.lastSave = Date.now();
    try{ if(Object.keys(ux.pend).length) localStorage.setItem(uxPendKey(), JSON.stringify(ux.pend)); else localStorage.removeItem(uxPendKey()); }catch(_e){ /* 保存できなくても数えられる */ }
}
function uxPendTotal(){ let n = 0; Object.keys(ux.pend).forEach((d) => { n += ux.pend[d]; }); return n; }
/** 溜まりすぎ（GAS が未更新・ずっとオフライン）は、古い日から捨てる */
function uxPendTrim(){
    const keep = [uxDay(Date.now() - 86400000), uxDay()];
    Object.keys(ux.pend).forEach((d) => { if(!keep.includes(d)) delete ux.pend[d]; });          // GAS は きょう・きのう以外は受けつけない
    let over = uxPendTotal() - UX_PEND_MAX;
    Object.keys(ux.pend).sort().forEach((d) => { if(over > 0){ const cut = Math.min(over, ux.pend[d]); ux.pend[d] -= cut; over -= cut; if(ux.pend[d] <= 0) delete ux.pend[d]; } });
}
function uxActive(){
    if(document.visibilityState !== "visible") return false;
    if(Date.now() - ux.lastAct <= UX_IDLE_MS) return true;
    try{ if(typeof tel !== "undefined" && tel && tel.call) return true; }catch(_e){}          // 通話中は、さわっていなくても「使っている」
    return false;
}
function uxTouch(){ ux.lastAct = Date.now(); }
function uxTick(){
    const now = Date.now(), dt = ux.lastTick ? Math.min(Math.max(now - ux.lastTick, 0), 2 * UX_TICK_MS) : 0;
    ux.lastTick = now;
    uxSyncEntry();
    const mode = uxMode();
    if(mode !== "user" || ux.off || !uxUrl()){ if(mode !== "user" && Object.keys(ux.pend).length){ ux.pend = {}; uxPendSave(); } return; }
    if(ux.uid !== uxUid()){ ux.uid = uxUid(); uxPendLoad(); ux.lastFlush = uxPendTotal() >= 20 ? now - UX_FLUSH_MS + 20000 : now; }   // 前回の残りがあれば、起動して20秒後に送る（なければ、ふつうに5分あとから）
    if(dt > 0 && uxActive()){
        ux.acc += dt;
        if(ux.acc >= 1000){
            const whole = Math.floor(ux.acc / 1000); ux.acc -= whole * 1000;
            const d = uxDay(now); ux.pend[d] = (ux.pend[d] || 0) + whole;
            uxPendTrim();
        }
    }
    if(now - ux.lastSave >= 15000) uxPendSave();
    if(uxPendTotal() >= 20 && now - ux.lastFlush >= UX_FLUSH_MS && now >= ux.retryAt) uxFlush("timer");
}
function uxWire(){
    if(ux.wired) return; ux.wired = true;
    let last = 0;
    const touch = (e) => { const n = Date.now(); if(e.type === "pointermove" || e.type === "scroll" || e.type === "wheel"){ if(n - last < 1000) return; last = n; } ux.lastAct = n; };
    ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll", "input", "click"].forEach((t) => window.addEventListener(t, touch, {capture:true, passive:true}));
    document.addEventListener("visibilitychange", () => {
        if(document.visibilityState === "hidden"){ ux.lastTick = 0; uxPendSave(); if(uxPendTotal() >= 5) uxFlush("hide"); }
        else { ux.lastTick = Date.now(); }
    });
    window.addEventListener("pagehide", () => { uxPendSave(); if(uxPendTotal() >= 1) uxFlush("hide"); });
}

// ---------- GAS との通信 ----------
async function uxPost(body, keepalive){
    const url = uxUrl(); if(!url) return {ok:false, message:"no url"};
    let token = ux.tok;
    if(!keepalive || !token || Date.now() - ux.tokAt > 40 * 60000){
        try{ token = await freshAccessToken(requireClient()); }catch(_e){ token = ""; }
        if(token){ ux.tok = token; ux.tokAt = Date.now(); }
    }
    if(!token) return {ok:false, message:"ログインが確認できません。"};
    const ctl = typeof AbortController === "function" ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), 20000) : 0;
    try{
        const res = await fetch(url, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(Object.assign({action:"usage", token}, body)), redirect:"follow", keepalive:!!keepalive, signal:ctl ? ctl.signal : undefined});
        try{ return await res.json(); }catch(_e){ return {ok:false, message:"bad response"}; }          // つながったが、JSON ではない返事（GAS のエラー画面など）
    }catch(_e){ return null; }finally{ if(timer) clearTimeout(timer); }          // null = つながらなかった
}
/** 通信の答えを、画面に出す種類に分ける */
function uxKind(r){
    if(!r) return "offline";
    if(r.ok) return "ok";
    const m = String(r.message || "");
    if(/report_identity_v1|サーバー側の準備/.test(m)) return "server";
    if(/不明な操作/.test(m)) return "notready";
    if(/ログイン/.test(m)) return "login";
    return "other";
}
async function uxFlush(reason){
    if(ux.busy || ux.inflight || ux.off) return;
    if(uxMode() !== "user") return;
    uxPendTrim();
    const days = {}; let sum = 0;
    Object.keys(ux.pend).sort().forEach((d) => { const n = Math.min(ux.pend[d], UX_PEND_MAX - sum); if(n > 0){ days[d] = n; sum += n; } });
    if(!sum) return;
    ux.busy = true; ux.inflight = days;
    Object.keys(days).forEach((d) => { ux.pend[d] -= days[d]; if(ux.pend[d] <= 0) delete ux.pend[d]; });   // 送っているあいだは、溜まりの外へ（二重に数えない）
    uxPendSave();
    ux.lastFlush = Date.now();
    let r = null;
    try{ r = await uxPost({op:"add", days}, reason === "hide"); }catch(_e){ r = null; }
    const kind = uxKind(r);
    const back = () => { Object.keys(days).forEach((d) => { ux.pend[d] = (ux.pend[d] || 0) + days[d]; }); uxPendTrim(); uxPendSave(); };   // 送れなかった分は もどす
    if(kind === "ok"){
        if(r.hidden || r.admin){ ux.off = r.hidden ? String(r.reason || "hidden") : "admin"; ux.pend = {}; uxPendSave(); uxSyncEntry(); }   // サーバーが「記録しない人」と判断した
    }else if(kind === "offline" || kind === "other"){ back(); }
    else if(kind === "login"){ back(); }
    else{ back(); ux.retryAt = Date.now() + UX_RETRY_MS; }                                                                                  // GAS 未更新・サーバー未設定：しばらく送らない
    ux.inflight = null; ux.busy = false;
    return kind;
}

// ---------- レポート画面 ----------
function openUsage(){
    if(!uxEntryOk()){ showToast(uxT("unavailable")); return; }
    ux.open = true; ux.period = ux.period || "day"; ux.err = "";
    uxCss(); openSheet(uxHtml());
    return uxLoad();
}
async function uxLoad(){
    const my = ++ux.seq;
    ux.loading = true; ux.err = ""; uxRender();
    if(!ux.open) { ux.loading = false; return; }
    let r = null;
    try{ r = await uxPost({op:"rank"}, false); }catch(_e){ r = null; }
    if(my !== ux.seq) return;
    ux.loading = false;
    const kind = uxKind(r);
    if(kind === "ok" && r.hidden){ ux.off = String(r.reason || "hidden"); ux.data = null; uxSyncEntry(); showToast(uxT("unavailable")); uxCloseIfOpen(); return; }
    if(kind === "ok" && Array.isArray(r.rows)){ ux.data = r; ux.err = ""; }
    else ux.err = kind === "offline" ? "errOffline" : kind === "notready" ? "errNotReady" : kind === "server" ? "errServer" : kind === "login" ? "errLogin" : "errGeneric";
    uxRender();
}
function uxKey(){ return {day:"d", week:"w", month:"m", all:"t"}[ux.period] || "d"; }
function uxName(r){ return r.nm != null && r.nm !== "" ? r.nm : uxT("anon", {c:r.an}); }
function uxRows(){
    const d = ux.data, k = uxKey();
    const rows = (d && d.rows || []).filter((x) => Number(x[k]) > 0).sort((a, b) => b[k] - a[k] || b.t - a.t || (a.an < b.an ? -1 : 1));
    let rank = 0, prev = null;
    rows.forEach((r, i) => { if(r[k] !== prev){ rank = i + 1; prev = r[k]; } r._rank = rank; });
    return rows;
}
function uxBars(mine){
    if(!Array.isArray(mine) || !mine.length) return "";
    const max = Math.max(1, ...mine.map((x) => Number(x[1]) || 0));
    return '<div class="ux-week"><div class="ux-sub">' + escapeHtml(uxT("week7")) + '</div><div class="ux-bars">' +
        mine.map((x) => { const v = Number(x[1]) || 0, h = v ? Math.max(6, Math.round(v / max * 100)) : 0;
            return '<div class="ux-bar" title="' + escapeHtml(x[0] + " " + uxDur(v)) + '"><span class="ux-barv">' + escapeHtml(v ? uxDur(v) : "–") + '</span><span class="ux-bart"><i style="height:' + h + '%"></i></span><span class="ux-bard">' + escapeHtml(String(x[0]).slice(5).replace("-", "/")) + '</span></div>'; }).join("") + '</div></div>';
}
function uxHtml(){
    const d = ux.data, admin = uxMode() === "admin", k = uxKey();
    const f = typeof segSt === "object" && segSt ? segSt.flags : null;
    const note = admin ? uxT("noteAdmin") : (f && f.other ? uxT("noteOther") : uxT("noteUser"));
    let h = '<div class="ux-root" data-i18n-skip><h3 class="ux-h">' + escapeHtml(uxT("title")) + '</h3><div class="meta">' + escapeHtml(note) + '</div>';
    h += '<div class="ux-chips" role="tablist">' + ["day", "week", "month", "all"].map((p) =>
        '<button type="button" role="tab" class="ux-chip' + (ux.period === p ? " on" : "") + '" data-t="ux:period" data-v="' + p + '" aria-selected="' + (ux.period === p ? "true" : "false") + '">' + escapeHtml(uxT(p)) + '</button>').join("") + '</div>';
    if(ux.loading && !d) h += '<div class="ux-msg" role="status">' + escapeHtml(uxT("loading")) + '</div>';
    if(ux.err) h += '<div class="ux-msg ux-err" role="alert">' + escapeHtml(uxT(ux.err)) + '</div>';
    if(d){
        const rows = uxRows(), me = (d.rows || []).find((x) => x.me);
        if(!admin){
            const mv = me ? Number(me[k]) || 0 : 0;
            const mr = me && mv > 0 ? rows.find((x) => x.me) : null;
            h += '<div class="ux-me"><div class="ux-sub">' + escapeHtml(uxT("youAre")) + '</div><div class="ux-big">' + escapeHtml(mv > 0 ? uxDur(mv) : uxT("none")) + '</div>' +
                (mr ? '<div class="ux-rank">' + escapeHtml(uxT("rankN", {n:mr._rank})) + ' <small>' + escapeHtml(uxT("ofN", {n:rows.length})) + '</small></div>' : "") + '</div>';
            h += uxBars(d.mine7);
        }
        const max = rows.length ? Math.max(1, rows[0][k]) : 1;
        if(!rows.length) h += '<div class="ux-msg">' + escapeHtml(uxT("emptyList")) + '</div>';
        else h += '<ol class="ux-list">' + rows.map((r) => {
            const w = Math.max(2, Math.round(r[k] / max * 100)), anon = r.nm == null || r.nm === "";
            return '<li class="ux-row' + (r.me ? " me" : "") + (anon ? " anon" : "") + '"><span class="ux-no">' + r._rank + '</span>' +
                '<span class="ux-main"><span class="ux-nm">' + escapeHtml(uxName(r)) + (r.me ? ' <b class="ux-you">' + escapeHtml(uxT("me")) + '</b>' : "") +
                (admin && r.sg ? ' <small class="ux-seg">' + escapeHtml(uxT("seg_" + r.sg) === "seg_" + r.sg ? r.sg : uxT("seg_" + r.sg)) + '</small>' : "") + '</span>' +
                '<span class="ux-track"><i style="width:' + w + '%"></i></span></span><span class="ux-t">' + escapeHtml(uxDur(r[k])) + '</span></li>';
        }).join("") + '</ol>';
        h += '<div class="meta ux-foot">' + escapeHtml(uxT("people", {n:d.total})) + ' · ' + escapeHtml(uxT("updated", {t:new Date(d.now || Date.now()).toLocaleTimeString((window.AREI18N && window.AREI18N.tag) || "ja-JP", {hour:"2-digit", minute:"2-digit"})})) + (admin ? ' · ' + escapeHtml(uxT("adminOnly")) : "") + '</div>';
    }
    h += '<div class="row"><button type="button" class="button-secondary" data-t="ux:refresh"' + (ux.loading ? " disabled" : "") + '>' + escapeHtml(uxT("refresh")) + '</button></div></div>' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>';
    return h;
}
function uxCss(){
    if(document.getElementById("uxCss")) return;
    const s = document.createElement("style"); s.id = "uxCss";
    s.textContent =
        ".ux-root{display:flex;flex-direction:column;gap:10px;min-width:0}.ux-h{margin:0}" +
        ".ux-chips{display:flex;gap:6px;flex-wrap:wrap}.ux-chip{flex:1 1 0;min-width:64px;min-height:44px;border:1px solid var(--line,#2b3851);border-radius:12px;background:var(--panel2,#1b253a);color:inherit;font-weight:700;padding:8px 6px}" +
        ".ux-chip.on{background:var(--accent2,#5578ed);color:#fff;border-color:transparent}" +
        ".ux-me{border:1px solid var(--line,#2b3851);border-radius:14px;padding:12px 14px;background:var(--panel2,#1b253a)}" +
        ".ux-sub{font-size:12px;color:var(--muted,#9aa8c2);margin-bottom:2px}.ux-big{font-size:28px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}" +
        ".ux-rank{font-weight:800;margin-top:2px}.ux-rank small{font-weight:600;color:var(--muted,#9aa8c2)}" +
        ".ux-week{border:1px solid var(--line,#2b3851);border-radius:14px;padding:10px 12px}.ux-bars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;align-items:end;height:112px;margin-top:4px}" +
        ".ux-bar{display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}.ux-bart{flex:1 1 0;min-height:0;width:100%;display:flex;align-items:flex-end;justify-content:center}.ux-bar i{display:block;width:70%;min-height:0;background:var(--accent,#7c9cff);border-radius:4px 4px 0 0}" +
        ".ux-barv,.ux-bard{font-size:10px;color:var(--muted,#9aa8c2);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:clip}.ux-bard{margin-top:2px}" +
        ".ux-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}" +
        ".ux-row{display:grid;grid-template-columns:2.2em minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid var(--line,#2b3851);border-radius:12px;padding:8px 10px;min-height:48px}" +
        ".ux-row.me{border-color:var(--accent,#7c9cff);background:rgba(124,156,255,.12)}.ux-row.anon .ux-nm{color:var(--muted,#9aa8c2)}" +
        ".ux-no{font-weight:800;text-align:center}.ux-main{display:flex;flex-direction:column;gap:4px;min-width:0}" +
        ".ux-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}.ux-you{font-size:11px;background:var(--accent2,#5578ed);color:#fff;border-radius:999px;padding:1px 7px;margin-left:4px}" +
        ".ux-seg{color:var(--muted,#9aa8c2);font-weight:600;margin-left:4px}" +
        ".ux-track{display:block;height:6px;border-radius:3px;background:rgba(128,128,128,.25);overflow:hidden}.ux-track i{display:block;height:100%;background:var(--success,#5de0b0);border-radius:3px}" +
        ".ux-t{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap}" +
        ".ux-msg{padding:12px;border-radius:12px;background:rgba(128,128,128,.14);text-align:center;font-size:14px}.ux-err{background:rgba(255,119,119,.16);color:var(--danger,#ff7777)}" +
        "@media (max-width:420px){.ux-big{font-size:24px}.ux-chip{min-width:56px;font-size:13px}}";
    document.head.appendChild(s);
}
function uxRender(){
    if(!ux.open) return;
    const sheet = typeof el === "object" && el && el.profileSheet;
    const cur = sheet && sheet.querySelector(".ux-root");
    if(!cur || el.profileModal.hidden){ ux.open = false; return; }       // 閉じられた・ほかの画面に変わったときは、何もしない（ほかの画面を うばわない）
    // 開いたままの画面は、スクロールの位置をそのままに、中身だけ入れかえる
    const top = sheet.scrollTop;
    sheet.innerHTML = '<button type="button" class="sheet-x" data-pm="close" aria-label="閉じる">✕</button>' + uxHtml();
    dedupeSheetClose(sheet); sheet.scrollTop = top;
}
function onUsageAction(action, node){
    if(action === "period"){ const p = node && node.dataset && node.dataset.v; if(["day", "week", "month", "all"].includes(p)){ ux.period = p; uxRender(); } }
    else if(action === "refresh"){ uxLoad(); }
}

function initUsage(){
    registerTool("ux", onUsageAction);
    uxCss();
    uxWire();
    if(typeof segApplyTabs === "function"){
        const orig = segApplyTabs;
        segApplyTabs = function(){ const r = orig.apply(this, arguments); try{ uxSyncEntry(); }catch(_e){} return r; };   // 区分がわかった（変わった）ときに、入口の出し入れ
    }
    if(window.AREI18N && typeof window.AREI18N.onChange === "function") window.AREI18N.onChange(() => { if(ux.open) uxRender(); });
    // シートを閉じたら、開いている印を消す（✕・外側・戻る、どれでも）
    if(el && el.profileModal) new MutationObserver(() => { if(el.profileModal.hidden) ux.open = false; }).observe(el.profileModal, {attributes:true, attributeFilter:["hidden"]});
    if(!ux.timer) ux.timer = setInterval(uxTick, UX_TICK_MS);
    uxSyncEntry();
}
