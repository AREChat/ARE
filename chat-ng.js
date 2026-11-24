"use strict";
// ===== NGワード制裁（画面側）=====
// ・チャット／AIボット／プロフィール欄など「文字を入れて送る」場所で、送る直前にNGワードを検査します（辞書：NG.json）
// ・見つかったら（1回目から毎回）：送信を止める（メッセージは保存しない＝強制削除）→ サーバーに申告（ポイント0・管理者へ即報告・NG記録・回数カウント）→ ウイルス画面（virus.html?warn=1＝演出だけ。アカウントは消えません）へ
// ・5回目から凍結：5回目＝1分、6回目＝2分、7回目＝4分…と、回数がふえるたびに2倍（サーバーが決めます）
// ・100回目：アカウントを強制削除（サーバーが消します）
// ・本当の判定とペナルティはサーバー（Supabase の SQL 関数）側で行います。画面側は「送る前に止める」ための案内役です。
// ・サーバー側で見つかったとき（画面側をすりぬけたとき）も、次の確認（ptRefresh）で回数がふえていれば ウイルス画面に移ります。
const NG_ALLOW = ["ばかり", "最低限", "最低気温", "最低賃金", "最低でも", "最低価格", "最悪の場合", "最悪でも", "カスタ", "カステラ", "カスピ", "カスケード", "カスミ", "かすてら", "かすみ", "かすかに", "かすれ", "かすり", "ごみ箱", "ゴミ箱", "ごみ出し", "ゴミ出し", "ごみ収集", "ゴミ収集", "ごみ袋", "ゴミ袋", "ごみ捨て", "ゴミ捨て", "ごみ処理", "ゴミ処理", "ごみ拾い", "ゴミ拾い", "ごみ分別", "ゴミ分別", "ごみの日", "ゴミの日", "活かす", "生かす", "驚かす", "脅かす", "動かす", "沸かす", "乾かす", "散らかす", "甘やかす", "ごまかす", "誤魔化す", "溶かす", "うごかす", "いかす", "おどかす", "おどろかす", "わかす", "かわかす", "ちらかす", "あまやかす", "とかす", "ぬかす", "しでかす", "やらかす", "ひけらかす", "みせびらかす", "見せびらかす", "くずもち", "くずれ", "くずす", "くずし", "くず湯", "ボケ防止", "ピンボケ", "ボケ味", "背景ボケ", "裸足", "裸眼", "裸一貫", "局部的", "風俗習慣", "脱げた", "脱げない", "脱げる", "脱げそう", "脱げちゃ", "脱げば", "ですか", "ますか", "ませんか", "ましたか", "でしたか", "おなかすい", "おなかすく", "どれかすべ", "いずれかすべ", "どうかする", "さんかする", "ぼかす", "ぼかし", "明かす", "フォーカス", "リンカス", "サブスク", "サブストーリ", "つぶす", "テストカ", "ラストカ", "ポストカ", "ゲストカ", "ベストカ", "ホストカ", "クイックソート", "やくそく", "やくそう", "ばくそう", "まんちょう", "ピエロ", "ぴえろ", "パンくず", "パンクズ", "考えろ", "覚えろ", "答えろ", "教えろ", "数えろ", "整えろ", "抑えろ", "加えろ", "備えろ", "構えろ", "訴えろ", "超えろ", "越えろ", "とびこえろ", "つかまえろ", "ふりかえろ", "かんがえろ", "おぼえろ", "こたえろ", "おしえろ", "かぞえろ", "ととのえろ", "そなえろ", "まちがえろ", "うったえろ", "わきまえろ", "ことばか", "ゆうざい", "プレイプ"];
// ↑ 後半の「ですか」「サブスク」「やくそく」「考えろ」などは、ふつうの会話で NGワードの一部と重なってしまう言葉（誤検知よけ）。サーバー側（private.ng_allow）にも同じものを入れています
const NG_STRIP = /[\s　・…〜~!！?？#＊*@_\-.,、。"'「」()（）]+/g;
const NG_SKIP_BTN = /(キャンセル|閉じる|やめる|戻る|クリア|消す|削除|×|✖|✕|close|cancel)/i;
const ng = {words:[], ascii:[], ready:false, busy:false, freezeTimer:0};  // ascii: [{w, rx}]

function ngNorm(s){ return String(s || "").normalize("NFKC").toLowerCase(); }
async function ngLoad(){
    try{
        const res = await fetch("./NG.json", {cache:"no-cache"});
        if(!res.ok) throw new Error("NG.json " + res.status);
        const data = await res.json();
        const seen = new Set();
        (data.words || []).forEach((w) => {
            const n = ngNorm(w).replace(NG_STRIP, "");
            if(!n || seen.has(n)) return; seen.add(n);
            if(/^[a-z0-9]+$/.test(n)) ng.ascii.push({w:n, rx:new RegExp("(^|[^a-z0-9])" + n.split("").join("[ \\u3000・…〜~!#*@_.\\-]*") + "($|[^a-z0-9])")});
            else ng.words.push(n);
        });
        ng.ready = true;
    }catch(error){ console.warn("[ARE ng]", error); }
}
function ngCheck(text){
    if(!ng.ready || !text) return null;
    let t = ngNorm(text);
    NG_ALLOW.forEach((a) => { if(t.includes(a)) t = t.split(a).join(""); });
    const s = t.replace(NG_STRIP, "");
    for(const w of ng.words){ if(s.includes(w)) return w; }
    for(const a of ng.ascii){ if(a.rx.test(t)) return a.w; }
    return null;
}

// ---------- 入力欄の見つけ方 ----------
function ngIsText(f){
    if(!f || f.disabled || f.readOnly || f.dataset.ngIgnore) return false;
    if(f.tagName === "TEXTAREA") return true;
    if(f.tagName !== "INPUT") return false;
    const t = (f.getAttribute("type") || "text").toLowerCase();
    return t === "text" || t === "search" || t === "url";
}
function ngVisible(f){ return !!(f.offsetWidth || f.offsetHeight || f.getClientRects().length); }
function ngFieldsAround(btn){
    let node = btn.parentElement;
    for(let i = 0; i < 5 && node; i++, node = node.parentElement){
        const list = Array.from(node.querySelectorAll("textarea,input")).filter((f) => ngIsText(f) && ngVisible(f) && String(f.value || "").trim());
        if(list.length) return list;
        if(node.tagName === "BODY") break;
    }
    return [];
}
function ngIsAdmin(){ try{ return !!(pt && pt.acc && pt.acc.admin); }catch(_e){ return false; } }
function ngFindHit(fields){
    for(const f of fields){ const w = ngCheck(f.value); if(w) return {field:f, word:w, text:f.value}; }
    return null;
}

// ---------- ペナルティ ----------
async function ngPenalty(hit){
    if(ng.busy) return; ng.busy = true;
    const f = hit.field, src = String(f.id || f.name || f.getAttribute("aria-label") || "input").slice(0, 40);
    try{ f.value = ""; f.dispatchEvent(new Event("input", {bubbles:true})); }catch(_e){}
    let res = null;
    // 「修正依頼」の部屋（みんなの部屋）の入力欄は 1回で即アウト：すぐウイルス画面へ。メッセージは送らず・強制削除し、管理者画面の「NG」に記録する（サーバー側 ng_report_fixreq_v1）
    const fixRoom = f.id === "messageInput" && typeof isFixReqRoom === "function" && state.currentRoom && isFixReqRoom(state.currentRoom);
    if(fixRoom){
        try{
            const r1 = await requireClient().rpc("ng_report_fixreq_v1", {p_matched:String(hit.word).slice(0, 60), p_text:String(hit.text).slice(0, 300)});
            if(!r1.error && r1.data && r1.data.pending_erase){ ng.busy = false; location.replace("./virus.html"); return; }
        }catch(_e){ /* サーバーの準備がまだなら、ふつうの申告にもどる */ }
    }
    try{ const r = await requireClient().rpc("ng_report", {p_source:src, p_text:String(hit.text).slice(0, 300)}); if(!r.error) res = r.data; }catch(_e){}
    ng.busy = false;
    if(res && res.hit !== false && res.strikes > 0) ngSeen(res.strikes);
    if(res && res.erased){ ngGone(); return; }   // 100回目：アカウントはサーバーで消えました
    ngShowWarning(hit.word, res);
    try{ if(typeof ptRefresh === "function") ptRefresh(); }catch(_e){}
    if(res && res.pending_erase){ setTimeout(() => location.replace("./virus.html"), 1500); }
    else if(res && res.strikes >= 1){
        // 1回目から毎回：ウイルス画面（演出だけ）へ。凍結（5回目から）は、チャットにもどったあとに表示される
        setTimeout(() => location.replace("./virus.html?warn=1&n=" + encodeURIComponent(res.strikes)), 1500);
    }
    else if(res && res.frozen_until){ ngShowFreeze(new Date(res.frozen_until).getTime()); }
}
// いま何回目まで 本人に知らせたか（サーバー側で見つかったときの合図に使う）
const ngSeenKey = () => "are_ng_seen_v1_" + ((typeof state !== "undefined" && state.user && state.user.id) || "");
function ngSeen(n){ try{ localStorage.setItem(ngSeenKey(), String(n)); }catch(_e){} }
// 100回目：アカウントが消えた → ログアウトして最初の画面へ
async function ngGone(){
    try{ await requireClient().auth.signOut({scope:"local"}); }catch(_e){}
    try{ localStorage.clear(); sessionStorage.clear(); }catch(_e){}
    document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;text-align:center;font-size:20px;padding:24px">不適切な発言が100回に達したため、アカウントを削除しました。<br>…さようなら。</div>';
    setTimeout(() => location.replace("./index.html"), 3500);
}
function ngShowWarning(word, res){
    let box = document.getElementById("ngWarn");
    if(!box){ box = document.createElement("div"); box.id = "ngWarn"; box.className = "ng-warn"; box.setAttribute("role", "alertdialog"); document.body.appendChild(box); }
    const n = res && res.strikes;
    let extra = "5回目から1分間、アカウントが使えなくなります（回数がふえるたびに2倍）。100回でアカウントが削除されます。";
    if(n >= 5 && res.freeze_minutes) extra = res.freeze_minutes + "分間、アカウントを凍結します。次はさらに2倍になります。100回でアカウントが削除されます。";
    else if(n >= 1) extra = "あと" + Math.max(0, 5 - n) + "回で、アカウントが一時的に使えなくなります（5回目は1分、そのあと回数がふえるたびに2倍）。100回でアカウントが削除されます。";
    if(res && res.pending_erase) extra = "アカウントの削除手続きに進みます。";
    box.innerHTML = '<div class="ng-warn-box"><div style="font-size:40px">⚠️</div><h3 style="margin:0">不適切な発言を検知しました</h3>' +
        '<div class="meta">検知した言葉：「' + escapeHtml(word) + '」</div>' +
        '<div>メッセージは<b>削除</b>され、<b>ポイントは0</b>になり、<b>管理者に報告</b>されました。' + (n ? '<br>（これで<b>' + n + '回目</b>です）' : '') + '</div>' +
        '<div class="meta">' + escapeHtml(extra) + '</div><button type="button" class="button" id="ngWarnOk" data-keep>わかりました</button></div>';
    box.hidden = false;
    document.getElementById("ngWarnOk").onclick = () => { box.hidden = true; };
}

// ---------- 凍結画面 ----------
function ngLeftText(ms){
    const sec = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if(d >= 1) return d + "日" + h + "時間";
    if(h >= 1) return h + "時間" + String(m).padStart(2, "0") + "分";
    return m + "分" + String(s).padStart(2, "0") + "秒";
}
function ngShowFreeze(untilMs){
    let ov = document.getElementById("ngFreeze");
    if(!ov){ ov = document.createElement("div"); ov.id = "ngFreeze"; ov.className = "pt-freeze"; ov.setAttribute("role", "alertdialog"); document.body.appendChild(ov); }
    clearInterval(ng.freezeTimer);
    const tick = () => {
        const left = Math.max(0, untilMs - Date.now());
        ov.innerHTML = '<div class="pt-freeze-box"><div style="font-size:44px">🧊</div><h3 style="margin:0">アカウントを凍結しています</h3>' +
            '<div class="meta">不適切な発言が5回をこえたため、一時的に使えません。<br>くり返すと、凍結の時間が2倍ずつ長くなり、100回でアカウントは削除されます。</div>' +
            '<div class="pt-count" style="font-size:36px">あと ' + ngLeftText(left) + '</div>' +
            '<button type="button" class="button" id="ngFreezeOut" data-keep>ログアウトする</button></div>';
        const b = document.getElementById("ngFreezeOut"); if(b) b.onclick = () => { if(typeof ptForceLogout === "function") ptForceLogout(); else location.replace("./index.html"); };
        if(left <= 0){ clearInterval(ng.freezeTimer); ng.every = 0; ov.remove(); try{ ptRefresh(); }catch(_e){} return; }
        // 1時間より長いときは 20秒ごと、短いときは 1秒ごとに数字を更新
        const want = left > 3600000 ? 20000 : 1000;
        if(ng.every !== want){ clearInterval(ng.freezeTimer); ng.every = want; ng.freezeTimer = setInterval(tick, want); }
    };
    ng.every = 0; tick();
}
// ptRefresh（chat-points.js）から呼ばれる：サーバーの状態に合わせて画面を切り替える
function ngOnAccess(acc){
    if(!acc || acc.admin) return;
    if(acc.ng_pending){ location.replace("./virus.html"); return; }
    // サーバー側で見つかったとき（回数がふえていたら）：ウイルス画面へ。はじめて見たとき・赦免で へったときは、合わせるだけ
    const n = Number(acc.ng_strikes) || 0; let seen = null;
    try{ seen = localStorage.getItem(ngSeenKey()); }catch(_e){}
    if(seen === null || n < Number(seen)){ ngSeen(n); }
    else if(n > Number(seen)){ ngSeen(n); location.replace("./virus.html?warn=1&n=" + encodeURIComponent(n)); return; }
    if(acc.ng_frozen_until && new Date(acc.ng_frozen_until) > new Date()) ngShowFreeze(new Date(acc.ng_frozen_until).getTime());
}

// ---------- 送信の直前に検査 ----------
function ngGuardEvent(event, fields){
    if(ngIsAdmin() || ng.busy) return false;
    const hit = ngFindHit(fields);
    if(!hit) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    ngPenalty(hit);
    return true;
}
function initNg(){
    ngLoad();
    document.addEventListener("keydown", (event) => {
        if(event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
        const f = event.target;
        if(!ngIsText(f)) return;
        // 複数行の入力欄は、送信に使うEnter（Shiftなし）か Ctrl/⌘+Enter のときだけ検査（ふつうの改行は対象外）
        if(f.tagName === "TEXTAREA" && event.shiftKey) return;
        if(f.tagName === "TEXTAREA" && f.id !== "messageInput" && !(event.ctrlKey || event.metaKey)) return;
        ngGuardEvent(event, [f]);
    }, true);
    document.addEventListener("click", (event) => {
        const b = event.target.closest && event.target.closest('button,[role="button"],input[type="button"],input[type="submit"]');
        if(!b || b.dataset.pm === "close" || NG_SKIP_BTN.test((b.textContent || "") + (b.getAttribute("aria-label") || ""))) return;
        ngGuardEvent(event, ngFieldsAround(b));
    }, true);
    document.addEventListener("submit", (event) => {
        const form = event.target;
        if(form && form.querySelectorAll) ngGuardEvent(event, Array.from(form.querySelectorAll("textarea,input")).filter((f) => ngIsText(f) && String(f.value || "").trim()));
    }, true);
}

// ---------- 管理者：NG制裁の一覧と赦免 ----------
async function renderAdminNg(client){
    const r = await client.rpc("admin_ng_list");
    if(r.error) throw r.error;
    const users = (r.data && r.data.users) || [], log = (r.data && r.data.log) || [];
    el.adminBody.innerHTML = '<div class="meta">NGワードを検知すると、ポイント0・通報（管理者通知）・回数カウントが自動で行われます。メッセージは保存せず削除し、本人はウイルス画面（演出だけ）に移ります（1回目から毎回）。5回目から凍結（5回目＝1分、6回目＝2分…と回数がふえるたびに2倍）、100回目でアカウントを強制削除します。誤検知のときは「赦免」で回数・凍結・削除待ちを解除できます。</div>' +
        '<b>ユーザー別の回数</b>' + (users.length ? users.map((u) => '<div class="admin-card"><b>' + escapeHtml(u.name || u.user_id) + '</b> ・ <b>' + u.strikes + '回</b>' +
            (u.pending_erase ? ' <span class="pending">削除待ち（謝罪画面）</span>' : (u.frozen_until && new Date(u.frozen_until) > new Date() ? ' <span class="pending">凍結中〜' + escapeHtml(formatDate(u.frozen_until)) + '</span>' : "")) +
            '<div class="meta">最後：' + escapeHtml(u.last_at ? formatDate(u.last_at) : "") + '</div><div class="row"><button type="button" class="button-secondary" data-ng-forgive="' + escapeHtml(u.user_id) + '">赦免（回数を0に戻す）</button></div></div>').join("") : '<div class="empty-list">該当するユーザーはいません。</div>') +
        '<b>最近の記録</b>' + (log.length ? log.map((l) => '<div class="admin-card"><div class="meta">' + escapeHtml(formatDate(l.created_at)) + ' ・ ' + escapeHtml(l.action || "") + ' ・ ' + escapeHtml(l.source || "") + '</div><div><b>' + escapeHtml(l.display_name || "（削除済み）") + '</b> ' + (l.strike ? l.strike + '回目' : "") + (l.matched ? ' 検知語「' + escapeHtml(l.matched) + '」' : "") + '</div>' + (l.snippet ? '<div class="meta" style="white-space:pre-wrap">' + escapeHtml(String(l.snippet).slice(0, 200)) + '</div>' : "") + '</div>').join("") : '<div class="empty-list">記録はまだありません。</div>');
}
document.addEventListener("click", (event) => {
    const b = event.target.closest && event.target.closest("[data-ng-forgive]");
    if(!b || !el.adminBody || !el.adminBody.contains(b)) return;
    runTool(async () => {
        if(!confirm("このユーザーのNG回数・凍結・削除待ちを解除しますか？")) return;
        const r = await requireClient().rpc("admin_ng_forgive", {p_user:b.dataset.ngForgive}); if(r.error) throw r.error;
        showToast("赦免しました。"); await renderAdminNg(requireClient());
    });
});
