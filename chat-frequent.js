"use strict";
// ===== 最近よく使う機能／おすすめ（どちらもアイコンだけ）=====
// ・チャット一覧の「📌 カスタマイズAIbot」の すぐ下に、アイコンだけの列を 2 本 出します。
//     🔥 最近よく使う機能 … 開いた回数が多い順（古い分は だんだん軽くなる＝最近のものが上に来る）
//     💡 おすすめ … 見た画面・開いた機能の履歴から、「まだあまり使っていない 似た機能」を 選ぶ（開くたび・使うたびに 更新）
// ・数えるのも 選ぶのも、この端末の中だけ。保存先はアカウントごとの localStorage（ほかの人の情報は 入らない／外へは 出ない）。
// ・ふだんの「ショートカット（☰）」は そのまま（こちらは 自動で 並びかわる もの）。

const QF_MAX = 6, QF_LOG_MAX = 80, QF_HALF_DAYS = 14;
// 機能のなかま分け（おすすめは「よく見ているなかまの、まだ使っていない機能」から選ぶ）
const QF_CAT = {
    plan:"itin planner sched board todo trip bday capsule habit", money:"budget split shop calc",
    note:"memo diary oneline secret stars", photo:"album imgedit draw mystamp ocr aistudio vframe imgc img2pdf exifclean avatar profile3d",
    file:"zip pdftool filedrop hashtool renametool textfix csvtool splittool", game:"rpg game2 game4 game5 game7 daifugo dream cards bj fun games omikuji",
    social:"share contact yose story archive passby live location geo announce", learn:"study124 quizmk aibot myai ai",
    comfort:"comfort easy quiet mood prefs push phrases folders autoreply", work:"work digest"
};
const QF_TAB_CAT = {"tab:posts":["social", "photo"], "tab:users":["social"], "tab:chats":["comfort", "learn"], "tab:me":["comfort"], "tab:more":[]};
const QF_SKIP_REC = new Set(["security", "fixreq", "usage", "storage", "lock"]);
const qf = {data:null, uid:"", sig:"", timer:null};

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
function qfCatsOf(id){
    if(QF_TAB_CAT[id]) return QF_TAB_CAT[id];
    const t = qfToolOf(id) || id, out = [];
    Object.keys(QF_CAT).forEach((c) => { if((" " + QF_CAT[c] + " ").includes(" " + t + " ")) out.push(c); });
    return out;
}
/** いま つかえる機能か（「その他」タブに ボタンがあって、隠れていない） */
function qfAvailable(id){
    if(id === "shop") return typeof openPtShop === "function";
    const t = qfToolOf(id); if(!t) return false;
    const b = document.querySelector('.pane-more [data-tool="' + t + '"]');
    return !!b && !b.hidden && b.style.display !== "none";
}

function qfFrequent(){
    const d = qfLoad(), now = Date.now();
    return Object.keys(d.s).filter((id) => !id.startsWith("tab:") && id !== "follow" && id !== "search:more" && qkFind(id) && qfAvailable(id))
        .map((id) => [id, qfDecay(d.s[id][0], d.s[id][1], now)]).filter((x) => x[1] >= 0.8).sort((a, b) => b[1] - a[1]).slice(0, QF_MAX).map((x) => x[0]);
}
function qfRecommend(freq){
    const d = qfLoad(), now = Date.now();
    const cands = (typeof qkItems === "function" ? qkItems() : []).map((it) => it[0]).filter((id) => id.startsWith("tool:") || id === "shop")
        .filter((id) => !QF_SKIP_REC.has(qfToolOf(id)) && !freq.includes(id) && qfAvailable(id));
    if(!d.log.length){   // 履歴がまだ無い人には、グループごとの「はじめのショートカット」をすすめる
        const start = (typeof qkDefaultList === "function" ? qkDefaultList() : []).filter((id) => cands.includes(id));
        return start.concat(cands.filter((id) => !start.includes(id))).slice(0, QF_MAX);
    }
    // 見た履歴から「どのなかまをよく見ているか」を点数にする（新しい履歴ほど重く）
    const weight = {}; const n = d.log.length;
    d.log.forEach((e, i) => { const w = 0.5 + 0.5 * (i + 1) / n; qfCatsOf(e[0]).forEach((c) => { weight[c] = (weight[c] || 0) + w; }); });
    const day = Math.floor(now / 86400000);
    const score = (id) => {
        const cats = qfCatsOf(id); let s = 0; cats.forEach((c) => { s += weight[c] || 0; });
        const used = d.s[id] ? qfDecay(d.s[id][0], d.s[id][1], now) : 0;
        s -= Math.min(used, 3) * 0.8;                      // もう よく使っているものは 下げる（まだ使っていないものを すすめる）
        let h = 0; for(const ch of id + day) h = (h * 31 + ch.charCodeAt(0)) % 997;   // 日がわりの ちいさなゆらぎ（毎日すこし入れかわる）
        return s + h / 997 * 0.6;
    };
    return cands.map((id) => [id, score(id)]).sort((a, b) => b[1] - a[1]).slice(0, QF_MAX).map((x) => x[0]);
}

function qfEnsureCss(){
    if(document.getElementById("qfCss")) return;
    const s = document.createElement("style"); s.id = "qfCss";
    s.textContent = ".qf-wrap{display:flex;flex-direction:column;gap:4px;margin:2px 0 6px;padding:0 6px}" +
        ".qf-row{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:2px 2px;scrollbar-width:none}.qf-row::-webkit-scrollbar{display:none}" +
        ".qf-mark{flex:0 0 auto;font-size:15px;opacity:.75;width:22px;text-align:center}" +
        ".qf-b{flex:0 0 auto;width:42px;height:42px;border-radius:14px;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.12);color:inherit;font-size:22px;line-height:1;padding:0;cursor:pointer}" +
        ".qf-b:active{transform:scale(.94)}.qf-rec .qf-b{border-style:dashed}";
    document.head.appendChild(s);
}
function qfWrap(){
    let w = document.getElementById("qfWrap");
    const list = el && el.roomList; if(!list) return w;
    if(!w){
        w = document.createElement("div"); w.id = "qfWrap"; w.className = "qf-wrap";
        w.addEventListener("click", (e) => { const b = e.target.closest("[data-qf]"); if(b && typeof qkRun === "function") runTool(() => qkRun(b.dataset.qf)); });
    }
    const pin = document.getElementById("aibotPin");
    // 並び：AIbot のピン → このアイコン列 → チャット一覧（すれ違いタウン ほか）
    if(pin && pin.parentNode){ if(pin.nextElementSibling !== w) pin.insertAdjacentElement("afterend", w); }
    else if(list.previousElementSibling !== w) list.insertAdjacentElement("beforebegin", w);
    return w;
}
function qfRow(cls, mark, markTitle, ids){
    if(!ids.length) return "";
    return '<div class="qf-row ' + cls + '"><span class="qf-mark" title="' + markTitle + '" aria-label="' + markTitle + '">' + mark + "</span>" +
        ids.map((id) => { const it = qkFind(id); return '<button type="button" class="qf-b" data-qf="' + escapeHtml(id) + '" title="' + escapeHtml(it[2]) + '" aria-label="' + escapeHtml(it[2]) + '">' + it[1] + "</button>"; }).join("") + "</div>";
}
function qfPaint(){
    try{
        if(!state || !state.user || typeof qkFind !== "function") return;
        qfEnsureCss();
        const w = qfWrap(); if(!w) return;
        const freq = qfFrequent(), rec = qfRecommend(freq);
        const sig = freq.join(",") + "|" + rec.join(",");
        w.hidden = !freq.length && !rec.length;
        if(sig !== qf.sig || !w.firstChild){
            qf.sig = sig;
            w.innerHTML = qfRow("qf-freq", "🔥", "最近よく使う機能", freq) + qfRow("qf-rec", "💡", "おすすめ（見た履歴から更新）", rec);
        }
    }catch(error){ console.error("[ARE frequent]", error); }
}

function initFrequent(){
    // 開いた回数を数える：画面を人が押したときだけ（プログラムからの押しは数えない）
    document.addEventListener("click", (e) => {
        if(!e.isTrusted) return;
        const t = e.target && e.target.closest ? e.target.closest("[data-tool], #aibotPin") : null;
        if(!t || t.closest("#qfWrap")) return;
        qfRecord(t.id === "aibotPin" ? "tool:aibot" : "tool:" + t.dataset.tool);
    }, true);
    if(typeof qkRun === "function"){ const orig = qkRun; qkRun = function(id){ if(typeof id === "string" && !id.startsWith("tab:") && id !== "search:more") qfRecord(id); return orig.apply(this, arguments); }; }
    if(typeof setTab === "function"){ const orig = setTab; setTab = function(tab){ qfRecord("tab:" + tab); return orig.apply(this, arguments); }; }
    qfPaint();
    feat.timers.push(setInterval(qfPaint, 4000));   // 並びの位置・「いま使えるか」の変化を 反映
}
