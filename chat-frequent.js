"use strict";
// ===== 最近よく使う機能を 数える（上のショートカットバーに 自動で入れるため）=====
// ・機能を開いた回数を、この端末の中だけに 数えます（アカウントごとの localStorage。古い分は だんだん軽くなる）。
// ・数えた結果は chat-quick.js の「自動」ショートカットが つかいます（qfFrequent）。
// ・おすすめの列・よく使う列は もう出しません（ショートカットに 一本化）。

const QF_MAX = 6, QF_LOG_MAX = 80, QF_HALF_DAYS = 14;
const qf = {data:null, uid:"", timer:null};

function qfKey(){ return "are_use_v1_" + (state && state.user ? state.user.id : "guest"); }
function qfLoad(){
    const uid = state && state.user ? state.user.id : "guest";
    if(qf.data && qf.uid === uid) return qf.data;
    let d = null;
    try{ d = JSON.parse(localStorage.getItem(qfKey()) || "null"); }catch(_e){ d = null; }
    if(!d || typeof d !== "object") d = {};
    if(!d.s || typeof d.s !== "object") d.s = {};
    if(!Array.isArray(d.log)) d.log = [];
    qf.data = d; qf.uid = uid; return d;
}
function qfSave(){ try{ localStorage.setItem(qfKey(), JSON.stringify(qf.data)); }catch(_e){ /* 保存できなくても使える */ } }
function qfDecay(score, ts, now){ return score * Math.pow(0.5, Math.max(0, now - ts) / (QF_HALF_DAYS * 86400000)); }

/** 開いた／見た記録（id は「tool:xxx」「shop」「tab:posts」など、ショートカットと同じ名前） */
function qfRecord(id){
    if(typeof id !== "string" || !id || typeof qkFind !== "function" || !qkFind(id)) return;
    const d = qfLoad(), now = Date.now(), cur = d.s[id];
    d.s[id] = [(cur ? qfDecay(cur[0], cur[1], now) : 0) + 1, now];
    d.log.push([id, now]); if(d.log.length > QF_LOG_MAX) d.log.splice(0, d.log.length - QF_LOG_MAX);
    const keys = Object.keys(d.s);
    if(keys.length > 120) keys.sort((a, b) => qfDecay(d.s[a][0], d.s[a][1], now) - qfDecay(d.s[b][0], d.s[b][1], now)).slice(0, keys.length - 100).forEach((k) => { delete d.s[k]; });
    qfSave(); qfSchedule();
}
function qfSchedule(){ clearTimeout(qf.timer); qf.timer = setTimeout(qfPaint, 350); }

function qfToolOf(id){ return id.startsWith("tool:") ? id.slice(5) : ""; }
/** いま つかえる機能か（「その他」タブに ボタンがあって、隠れていない） */
function qfAvailable(id){
    if(id === "shop") return typeof openPtShop === "function";
    const t = qfToolOf(id); if(!t) return false;
    const b = document.querySelector('.pane-more [data-tool="' + t + '"]');
    return !!b && !b.hidden && b.style.display !== "none";
}

function qfFrequent(min){
    const d = qfLoad(), now = Date.now();
    return Object.keys(d.s).filter((id) => !id.startsWith("tab:") && id !== "follow" && id !== "search:more" && qkFind(id) && qfAvailable(id))
        .map((id) => [id, qfDecay(d.s[id][0], d.s[id][1], now)]).filter((x) => x[1] >= (min || 0.8)).sort((a, b) => b[1] - a[1]).slice(0, QF_MAX).map((x) => x[0]);
}
/** 上のショートカットバーを 描きなおす（自動のときは よく使う順に 入れかわる） */
function qfPaint(){
    try{ if(state && state.user && typeof qkPaintBar === "function") qkPaintBar(); }catch(error){ console.error("[ARE frequent]", error); }
}

function initFrequent(){
    // 開いた回数を数える：画面を人が押したときだけ（プログラムからの押しは数えない）
    document.addEventListener("click", (e) => {
        if(!e.isTrusted) return;
        const t = e.target && e.target.closest ? e.target.closest("[data-tool]") : null;
        if(!t) return;
        qfRecord("tool:" + t.dataset.tool);
    }, true);
    if(typeof qkRun === "function"){ const orig = qkRun; qkRun = function(id){ if(typeof id === "string" && !id.startsWith("tab:") && id !== "search:more") qfRecord(id); return orig.apply(this, arguments); }; }
    if(typeof setTab === "function"){ const orig = setTab; setTab = function(tab){ qfRecord("tab:" + tab); return orig.apply(this, arguments); }; }
    qfPaint();
    feat.timers.push(setInterval(qfPaint, 4000));   // 並びの位置・「いま使えるか」の変化を 反映
}
