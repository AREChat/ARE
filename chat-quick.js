"use strict";
// ===== ショートカットバー（☰）／「その他」タブの検索／フォロー・フォロワー一覧 =====
// ・ヘッダーの下に、よく使う機能をアイコンだけで並べます（☰ から自分で入れかえられます）
// ・「その他」タブの上に検索バーを付けました（部分一致。ひらがな・カタカナ・全角半角のちがいは気にしません）
// ・フォロワー／フォロー中を押すと、一覧が開きます（チャットを始める・フォロー解除もできます）

const QK_MAX = 7;
const QK_DEFAULT = ["tool:rpg", "tab:chats", "shop", "search:more", "follow"];
const QK_LABEL = {rpg:"RPGゲーム", games:"ミニゲーム", prefs:"表示設定・言語"};
const QK_ALIAS = {
    rpg:"げーむ ゲーム rpg ぼうけん 冒険 あれ are", games:"げーむ ゲーム あそび 遊び", cards:"ゲーム トランプ ばばぬき", bj:"ゲーム トランプ かじの",
    budget:"お金 かけいぼ 家計 しゅうし 収支 支出 収入", diary:"にっき 日記 きおく", weather:"てんき 天気 あめ 雨 気温 予報", transit:"でんしゃ 電車 のりかえ 乗換 鉄道 交通",
    calc:"けいさん 計算 かわせ 為替 たんい 単位 換算", timer:"すとっぷ ぽもどーろ 時計", memo:"めも ノート keep きーぷ", planner:"よてい 予定 すけじゅーる かれんだー カレンダー たすく タスク",
    health:"たいじゅう 体重 すいみん 睡眠 ほすう 歩数 きぶん", split:"わりかん 割り勘 お金", shop:"かいもの 買い物 りすと", story:"すとーりー 24時間 投稿",
    album:"しゃしん 写真 がぞう 画像", imgedit:"しゃしん 写真 がぞう 画像 へんしゅう", draw:"おえかき らくがき 絵", location:"ばしょ 場所 ちず 地図 いち",
    push:"つうち 通知 ほーむがめん", lock:"ぱすわーど ろっく ぴん pin", phrases:"ていけいぶん 定型文 てんぷれ", folders:"せいり 整理 ふぉるだ ならびかえ",
    comfort:"もじ 文字 おおきく よみあげ 読み上げ", ocr:"もじ 文字 よみとり 読み取り", share:"きゅーあーる qr りんく", contact:"きゅーあーる qr ともだち 友だち"
};

// ---- 検索のための文字そろえ（全角→半角・カタカナ→ひらがな・小文字）----
function qkNorm(text){
    let s = "";
    try{ s = String(text == null ? "" : text).normalize("NFKC"); }catch(_e){ s = String(text == null ? "" : text); }
    s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    return s.toLowerCase();
}
function qkMatch(haystack, query){
    const terms = qkNorm(query).split(/\s+/).filter(Boolean);
    if(!terms.length) return true;
    const h = qkNorm(haystack);
    return terms.every((t) => h.includes(t));
}

// ---- 候補の一覧 ----
function qkItems(){
    const base = [
        ["tab:chats", "💬", "チャット", "会話の一覧を開く", "ちゃっと とーく"],
        ["tab:users", "🔎", "ユーザー検索", "ユーザーを探す", "ゆーざー ともだち さがす"],
        ["tab:posts", "📷", "投稿", "みんなの投稿", "とうこう"],
        ["tab:more", "🧰", "その他", "ツールの一覧", "つーる"],
        ["tab:me", "👤", "マイページ", "プロフィール・設定", "ぷろふぃーる せってい"],
        ["search:more", "🔍", "機能を検索", "「その他」の機能を名前で探す", "けんさく さがす"],
        ["shop", "🛍️", "AREShop", "ポイントと交換", "しょっぷ ぽいんと こうかん"],
        ["follow", "👥", "フォロー・フォロワー", "一覧を見る", "ふぉろー ふぉろわー ともだち"]
    ];
    const tools = (typeof TOOL_LIST !== "undefined" ? TOOL_LIST : []).map((t) => ["tool:" + t[0], t[1], QK_LABEL[t[0]] || t[2], t[3], QK_ALIAS[t[0]] || ""]);
    return base.concat(tools);
}
function qkFind(id){ return qkItems().find((x) => x[0] === id) || null; }

// ---- 保存（この端末・ユーザーごと）----
function qkKey(){ return "are_quick_v1_" + (state && state.user ? state.user.id : "guest"); }
function qkLoad(){
    let list = null;
    try{ list = JSON.parse(localStorage.getItem(qkKey()) || "null"); }catch(_e){ list = null; }
    if(!Array.isArray(list)) list = QK_DEFAULT.slice();
    const seen = new Set();
    return list.filter((id) => typeof id === "string" && qkFind(id) && !seen.has(id) && seen.add(id)).slice(0, QK_MAX);
}
function qkSave(list){ try{ localStorage.setItem(qkKey(), JSON.stringify(list)); }catch(_e){ /* 保存できなくても使える */ } }

// ---- 実行 ----
function qkRun(id){
    if(id.startsWith("tab:")){ setTab(id.slice(4)); return; }
    if(id === "search:more"){
        setTab("more");
        const inp = document.getElementById("moreSearch");
        if(inp){ inp.focus(); try{ inp.select(); }catch(_e){ /* 何もしない */ } }
        return;
    }
    if(id === "shop"){ if(typeof openPtShop === "function") runTool(() => openPtShop()); else showToast("この機能は未実装です。"); return; }
    if(id === "follow"){ runTool(() => openFollowList("followers")); return; }
    if(id.startsWith("tool:")){
        const b = document.querySelector('.pane-more [data-tool="' + id.slice(5) + '"]');
        if(b) b.click(); else showToast("この機能は未実装です。");
    }
}

// ---- ショートカットバー ----
function qkPaintBar(){
    const bar = document.getElementById("quickBar"); if(!bar) return;
    const list = qkLoad();
    bar.innerHTML = '<button type="button" class="qb qb-menu" data-qk="menu" title="メニュー（ショートカットの編集）" aria-label="メニュー">☰</button>' +
        list.map((id) => { const it = qkFind(id); return '<button type="button" class="qb" data-qk="run:' + escapeHtml(id) + '" title="' + escapeHtml(it[2]) + '" aria-label="' + escapeHtml(it[2]) + '">' + it[1] + '</button>'; }).join("");
}

function qkRowsCur(list){
    if(!list.length) return '<div class="empty-list">まだありません。下の ☆ を押して追加しましょう。</div>';
    return list.map((id, i) => { const it = qkFind(id);
        return '<div class="qk-row"><span class="qk-ico">' + it[1] + '</span><span class="qk-name">' + escapeHtml(it[2]) + '</span>' +
            '<button type="button" class="button-secondary qk-mini" data-qk="up:' + escapeHtml(id) + '" aria-label="上へ"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
            '<button type="button" class="button-secondary qk-mini" data-qk="down:' + escapeHtml(id) + '" aria-label="下へ"' + (i === list.length - 1 ? " disabled" : "") + '>↓</button>' +
            '<button type="button" class="button-secondary qk-mini" data-qk="off:' + escapeHtml(id) + '" aria-label="外す">✕</button></div>'; }).join("");
}
function qkRowsAll(list, query){
    const rows = qkItems().filter((it) => qkMatch(it[1] + " " + it[2] + " " + it[3] + " " + it[4], query));
    if(!rows.length) return '<div class="empty-list">「' + escapeHtml(query) + '」に合う機能はありません。</div>';
    return rows.map((it) => { const on = list.includes(it[0]);
        return '<div class="qk-row"><button type="button" class="qk-open" data-qk="open:' + escapeHtml(it[0]) + '"><span class="qk-ico">' + it[1] + '</span><span class="qk-name">' + escapeHtml(it[2]) + '<small class="meta">' + escapeHtml(it[3]) + '</small></span></button>' +
            '<button type="button" class="button-secondary qk-mini' + (on ? " qk-on" : "") + '" data-qk="' + (on ? "off:" : "on:") + escapeHtml(it[0]) + '" aria-label="' + (on ? "ショートカットから外す" : "ショートカットに追加") + '">' + (on ? "★" : "☆") + '</button></div>'; }).join("");
}
function qkPaintMenu(keepQuery){
    const list = qkLoad(), inp = document.getElementById("qkSearch");
    const q = keepQuery !== undefined ? keepQuery : (inp ? inp.value : "");
    const cur = document.getElementById("qkCur"), all = document.getElementById("qkAll");
    if(cur) cur.innerHTML = qkRowsCur(list);
    if(all) all.innerHTML = qkRowsAll(list, q);
    const cnt = document.getElementById("qkCount"); if(cnt) cnt.textContent = list.length + " / " + QK_MAX;
    qkPaintBar();
}
function qkOpenMenu(){
    openSheet(toolHead("☰ メニュー・ショートカット", "よく使う機能を、ヘッダーの下にアイコンだけで出せます。自分で入れかえできます。") +
        '<input class="search" id="qkSearch" type="search" placeholder="🔍 機能を検索（部分一致）" autocomplete="off">' +
        '<div class="section-heading"><h2>いまのショートカット</h2><span class="meta" id="qkCount"></span></div><div id="qkCur"></div>' +
        '<div class="section-heading"><h2>すべての機能</h2></div><div class="meta">名前を押すと開きます。☆ を押すとショートカットに入ります。</div><div id="qkAll" class="qk-all"></div>' +
        '<div class="row"><button type="button" class="button-secondary" data-qk="reset">初期設定にもどす</button><button type="button" class="button" data-pm="close">閉じる</button></div>');
    qkPaintMenu("");
}
function qkAction(act, id){
    let list = qkLoad();
    if(act === "on"){ if(list.length >= QK_MAX){ showToast("ショートカットは " + QK_MAX + " つまでです。先に外してください。"); return; } if(!list.includes(id)) list.push(id); }
    else if(act === "off"){ list = list.filter((x) => x !== id); }
    else if(act === "up" || act === "down"){
        const i = list.indexOf(id), j = act === "up" ? i - 1 : i + 1;
        if(i < 0 || j < 0 || j >= list.length) return;
        const t = list[i]; list[i] = list[j]; list[j] = t;
    }else if(act === "reset"){ list = QK_DEFAULT.slice(); }
    qkSave(list); qkPaintMenu();
}

// ---- フォロー・フォロワー ----
const qkFl = {kind:"followers", q:"", profiles:new Map(), followers:new Set(), following:new Set(), loaded:false};
let qkCounts = null;

function qkPaintFollowCounts(){
    document.querySelectorAll("[data-flcount]").forEach((box) => {
        const c = qkCounts;
        box.innerHTML = '<button type="button" class="fl-chip" data-keep="1" data-fl="followers"><b>' + (c ? c.followers : "–") + '</b> フォロワー</button>' +
            '<button type="button" class="fl-chip" data-keep="1" data-fl="following"><b>' + (c ? c.following : "–") + '</b> フォロー中</button>';
    });
}
async function qkLoadFollowData(){
    const c = requireClient(), me = state.user.id;
    const [a, b] = await Promise.all([
        c.from("follows").select("follower_id").eq("followee_id", me),
        c.from("follows").select("followee_id").eq("follower_id", me)]);
    if(a.error) throw a.error;
    if(b.error) throw b.error;
    qkFl.followers = new Set((a.data || []).map((r) => r.follower_id));
    qkFl.following = new Set((b.data || []).map((r) => r.followee_id));
    const ids = [...new Set([...qkFl.followers, ...qkFl.following])];
    qkFl.profiles = new Map();
    if(ids.length){
        const p = await c.from(TABLES.profiles).select("*").in("id", ids).limit(500);
        if(p.error) throw p.error;
        (p.data || []).forEach((row) => qkFl.profiles.set(row.id, row));
    }
    qkFl.loaded = true;
    qkCounts = {followers:qkFl.followers.size, following:qkFl.following.size};
    qkPaintFollowCounts();
}
function qkFlHtml(){
    const ids = [...(qkFl.kind === "followers" ? qkFl.followers : qkFl.following)];
    const rows = ids.map((id) => ({id, p:qkFl.profiles.get(id)})).filter((r) => r.p && qkMatch(profileDisplayName(r.p) + " " + (r.p.status_message || ""), qkFl.q));
    rows.sort((x, y) => profileDisplayName(x.p).localeCompare(profileDisplayName(y.p), "ja"));
    const tab = (k, label, n) => '<button type="button" class="' + (qkFl.kind === k ? "button" : "button-secondary") + '" data-t="fl:tab" data-k="' + k + '">' + label + '（' + n + '）</button>';
    let list;
    if(!rows.length){
        list = '<div class="empty-list">' + (qkFl.q ? "「" + escapeHtml(qkFl.q) + "」に合う人はいません。" : (qkFl.kind === "followers" ? "まだフォロワーはいません。" : "まだ誰もフォローしていません。「ユーザー」タブで探してみましょう。")) + '</div>';
    }else{
        list = rows.map((r) => { const f = qkFl.following.has(r.id), mutual = f && qkFl.followers.has(r.id);
            return '<div class="qk-row"><span class="qk-ava">' + miniAvatar(r.p) + '</span><span class="qk-name">' + escapeHtml(profileDisplayName(r.p)) + (mutual ? ' <small class="fl-badge">相互</small>' : "") + '</span>' +
                '<button type="button" class="button-secondary qk-mini" data-t="fl:chat" data-uid="' + escapeHtml(r.id) + '" aria-label="チャットする" title="チャットする">💬</button>' +
                '<button type="button" class="' + (f ? "button-secondary" : "button") + ' qk-mini qk-wide" data-t="fl:tog" data-uid="' + escapeHtml(r.id) + '" data-f="' + (f ? "1" : "0") + '">' + (f ? "解除" : "フォロー") + '</button></div>'; }).join("");
    }
    return '<div class="row" style="justify-content:flex-start">' + tab("followers", "フォロワー", qkFl.followers.size) + tab("following", "フォロー中", qkFl.following.size) + '</div>' +
        '<input class="search" type="search" id="flSearch" data-t="fl:q" data-live="1" placeholder="🔍 名前で絞り込み（部分一致）" autocomplete="off" value="' + escapeHtml(qkFl.q) + '">' +
        '<div id="flList">' + list + '</div>';
}
function qkFlPaint(){
    const box = document.getElementById("flBody"); if(!box) return;
    const had = document.activeElement && document.activeElement.id === "flSearch";
    box.innerHTML = qkFlHtml();
    if(had){ const i = document.getElementById("flSearch"); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length, i.value.length); }catch(_e){ /* 何もしない */ } } }
}
async function openFollowList(kind){
    qkFl.kind = kind === "following" ? "following" : "followers"; qkFl.q = "";
    openSheet(toolHead("👥 フォロー・フォロワー", "相手を押して、チャットやフォロー解除ができます") + '<div id="flBody"><div class="meta">読み込み中…</div></div>' + toolClose());
    try{ await qkLoadFollowData(); qkFlPaint(); }
    catch(error){ const b = document.getElementById("flBody"); if(b) b.innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}
async function qkFlAction(action, node){
    if(action === "tab"){ qkFl.kind = node.dataset.k === "following" ? "following" : "followers"; qkFlPaint(); return; }
    if(action === "q"){ qkFl.q = node.value; qkFlPaint(); return; }
    if(action === "chat"){ closeSheet(); await openOrCreateDirectChat(node.dataset.uid); return; }
    if(action === "tog"){
        const uid = node.dataset.uid, was = node.dataset.f === "1"; node.disabled = true;
        try{
            const c = requireClient();
            const r = was ? await c.from("follows").delete().eq("follower_id", state.user.id).eq("followee_id", uid)
                          : await c.from("follows").insert({follower_id:state.user.id, followee_id:uid});
            if(r.error) throw r.error;
            if(was) qkFl.following.delete(uid); else qkFl.following.add(uid);
            qkCounts = {followers:qkFl.followers.size, following:qkFl.following.size};
            qkPaintFollowCounts(); qkFlPaint();
            showToast(was ? "フォローを解除しました。" : "フォローしました。");
        }catch(error){ node.disabled = false; showToast(featError(error)); }
    }
}

// ---- 「その他」タブの検索 ----
function qkMoreFilter(){
    const pane = document.querySelector(".pane-more"), inp = document.getElementById("moreSearch"); if(!pane || !inp) return;
    const q = inp.value.trim();
    let shown = 0;
    pane.querySelectorAll(".more-item").forEach((item) => {
        const key = item.dataset.tool || item.dataset.extra || "";
        const ok = !q || qkMatch(item.textContent + " " + (QK_ALIAS[key] || ""), q);
        item.classList.toggle("qk-hide", !ok); if(ok) shown++;
    });
    pane.querySelectorAll(".section-heading").forEach((h, i) => { if(i > 0) h.classList.toggle("qk-hide", !!q); });
    const cnt = document.getElementById("moreCount"), empty = document.getElementById("moreEmpty");
    if(cnt) cnt.textContent = q ? shown + " 件" : "";
    if(empty){ empty.hidden = !(q && !shown); empty.textContent = "「" + q + "」に合う機能はありません。別の言葉で試してください。"; }
}
function qkInitMoreSearch(){
    const pane = document.querySelector(".pane-more"); if(!pane || document.getElementById("moreSearch")) return;
    const head = pane.querySelector(".section-heading");
    const extra = '<button type="button" class="admin-card more-item" data-qk="run:shop">🛍️ AREShop<small class="meta">ポイントと交換（動画・物語・パック）</small></button>' +
        '<button type="button" class="admin-card more-item" data-qk="run:follow">👥 フォロー・フォロワー<small class="meta">一覧を見る・チャットを始める・フォロー解除</small></button>';
    if(head) head.insertAdjacentHTML("afterend", '<div class="more-search"><input class="search" id="moreSearch" type="search" placeholder="🔍 機能を検索（例：家計 / ゲーム / てんき）" autocomplete="off" enterkeyhint="search"><div class="meta" id="moreCount"></div></div>' + extra + '<div class="empty-list" id="moreEmpty" hidden></div>');
    const inp = document.getElementById("moreSearch");
    inp.addEventListener("input", qkMoreFilter);
    inp.addEventListener("keydown", (e) => {
        if(e.key === "Escape"){ inp.value = ""; qkMoreFilter(); }
        else if(e.key === "Enter"){ e.preventDefault(); const first = pane.querySelector(".more-item:not(.qk-hide)"); if(first) first.click(); }
    });
    // 後から追加された項目（ツール一覧など）にも絞り込みを効かせる
    try{ new MutationObserver(() => { if(inp.value.trim()) qkMoreFilter(); }).observe(pane, {childList:true}); }catch(_e){ /* 何もしない */ }
}

// ---- 起動 ----
function initQuick(){
    const brand = document.querySelector(".sidebar .brand");
    if(brand && !document.getElementById("quickBar")){
        brand.insertAdjacentHTML("afterend", '<div class="quickbar" id="quickBar" role="toolbar" aria-label="よく使う機能"></div>');
    }
    const bar = document.getElementById("quickBar");
    qkPaintBar();
    if(bar) bar.addEventListener("click", (e) => { const b = e.target.closest("[data-qk]"); if(b) qkClick(b); });
    // 「その他」タブ内の追加項目・シート内のボタン
    document.querySelector(".pane-more").addEventListener("click", (e) => { const b = e.target.closest("[data-qk]"); if(b) qkClick(b); });
    el.profileModal.addEventListener("click", (e) => { const b = e.target.closest("[data-qk]"); if(b) qkClick(b); });
    el.profileModal.addEventListener("input", (e) => { if(e.target.id === "qkSearch") qkPaintMenu(e.target.value); });
    // フォロワー／フォロー中のボタン（マイページ・ユーザータブ）
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-fl]"); if(b) runTool(() => openFollowList(b.dataset.fl)); });
    const users = document.querySelector(".pane-users");
    if(users && !users.querySelector("[data-flcount]")){
        const bar2 = document.createElement("div"); bar2.className = "fl-counts"; bar2.setAttribute("data-flcount", "1"); users.insertBefore(bar2, users.children[1] || null);
    }
    registerTool("fl", qkFlAction);
    qkInitMoreSearch();
    qkPaintFollowCounts();
    if(typeof loadMyFollowCounts === "function") loadMyFollowCounts();
}
function qkClick(b){
    const v = String(b.dataset.qk), i = v.indexOf(":"), act = i < 0 ? v : v.slice(0, i), id = i < 0 ? "" : v.slice(i + 1);
    if(act === "menu"){ runTool(qkOpenMenu); return; }
    if(act === "run"){ runTool(() => qkRun(id)); return; }
    if(act === "open"){ closeSheet(); runTool(() => qkRun(id)); return; }
    qkAction(act, id);
}
