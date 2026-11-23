"use strict";
// ===== ユーザー区分（家庭 / 社員 / 友人 / その他）による画面の出し分け =====
// ・区分そのものは、管理者以外には見えません（サーバー側で守っています。sql/segments_v1.sql）。
//   この画面は my_ui_flags() が返す「タブを出すか」だけを受け取ります（区分の名前は受け取りません）。
// ・sql/segments_v1.sql をまだ実行していない間は、何も変えずに今までどおり動きます。
// ・ここでやること
//    1) ユーザー／投稿タブの出し分け   2) 「📖 マニュアル」ボタン
//    3) 「➕ 友達追加」（QRコード／リンク）  4) 連絡の申請（家庭の人 ⇔ 家庭以外の人）
//    5) 管理者：ユーザーごとの区分の設定と、連絡の申請の承認

const SEG_LABELS = { home:"家庭", work:"社員", friend:"友人", other:"その他" };
const SEG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const segSt = { flags:null };

function segCss(){
    if(document.getElementById("segCss")) return;
    const s = document.createElement("style"); s.id = "segCss";
    s.textContent =
        "body.seg-no-users .rail-btn[data-tab=users],body.seg-no-users .pane-users{display:none!important}" +
        "body.seg-no-posts .rail-btn[data-tab=posts],body.seg-no-posts .pane-posts{display:none!important}" +
        ".seg-help{display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;width:100%;min-height:46px;margin:8px 0;padding:10px 14px;" +
        "border-radius:14px;font-weight:800;font-size:clamp(14px,3.6vw,17px);text-decoration:none;text-align:center;line-height:1.3}" +
        "@media (min-width:900px){.seg-help{min-height:40px;font-size:15px}}" +
        ".seg-addrow{display:flex;gap:8px;flex-wrap:wrap}.seg-addrow>button{flex:1 1 140px;min-height:48px}" +
        ".seg-sel{width:100%;min-height:44px;font-size:16px;margin-top:6px}" +
        "#segAddSheet .qr-box,.seg-qr{display:flex;justify-content:center;margin:10px 0}";
    document.head.appendChild(s);
}

function segCacheKey(){ return "are_ui_flags_" + (state.user ? state.user.id : "x"); }
async function segLoadFlags(){
    try{
        const r = await requireClient().rpc("my_ui_flags");
        if(!r.error && r.data && typeof r.data === "object"){
            segSt.flags = r.data;
            try{ localStorage.setItem(segCacheKey(), JSON.stringify({ show_users:r.data.show_users, show_posts:r.data.show_posts, request_room:r.data.request_room, is_admin:r.data.is_admin, restricted:r.data.restricted, quick:r.data.quick })); }catch(_e){}
            return;
        }
    }catch(_e){ /* SQL 未実行・通信失敗 */ }
    if(segSt.flags && segSt.flags.provisional) segSt.flags = null;      // 仮の状態のままだったら、今までどおりの表示に戻す
}
/** 起動直後（サーバーの答えを待つ間）の仮の出しわけ：前回の答え → なければ「ユーザー・投稿は隠す」（新しいアカウントは、その他だから） */
function segProvisional(){
    let c = null;
    try{ c = JSON.parse(localStorage.getItem(segCacheKey())); }catch(_e){}
    segSt.flags = c && typeof c === "object" ? Object.assign({ provisional:true }, c) : { provisional:true, show_users:false, show_posts:false };
}

function segApplyTabs(){
    const f = segSt.flags;
    document.body.classList.toggle("seg-no-users", !!f && f.show_users === false);
    document.body.classList.toggle("seg-no-posts", !!f && f.show_posts === false);
    const cur = el && el.sidebar && el.sidebar.dataset.tab;
    if(f && ((cur === "users" && f.show_users === false) || (cur === "posts" && f.show_posts === false))) setTab("chats");
}

function segRequestRoomId(){ return segSt.flags && segSt.flags.request_room || null; }

// ---------- 2) マニュアル（操作方法） ----------
function segAddHelpButton(){
    const pane = document.querySelector(".pane-chats");
    if(!pane || document.getElementById("segHelpLink")) return;
    const a = document.createElement("a");
    a.id = "segHelpLink"; a.className = "button seg-help"; a.href = "./help.html"; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "📖 マニュアル";
    const head = pane.querySelector(".section-heading");
    if(head) head.insertAdjacentElement("afterend", a); else pane.prepend(a);
}

// ---------- 3) 友達追加 ----------
function segAddButton(){
    const g = document.getElementById("newGroupButton");
    if(!g || document.getElementById("addFriendButton")) return;
    const b = document.createElement("button");
    b.type = "button"; b.id = "addFriendButton"; b.className = "button-secondary"; b.textContent = "➕ 友達追加";
    b.addEventListener("click", segOpenAdd);
    g.insertAdjacentElement("afterend", b);
}

function segMyUrl(){ return new URL("chat.html?u=" + encodeURIComponent(state.user.id), location.href).href; }

function segOpenAdd(){
    openSheet('<div id="segAddSheet"><h3 style="margin:0">➕ 友達追加</h3>' +
        '<div class="meta">追加のしかたを選んでください。</div>' +
        '<div class="seg-addrow"><button type="button" class="button" id="segQrBtn">📷 QRコードで追加</button>' +
        '<button type="button" class="button" id="segLinkBtn">🔗 リンクで追加</button></div>' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div></div>');
    document.getElementById("segQrBtn").addEventListener("click", segOpenQr);
    document.getElementById("segLinkBtn").addEventListener("click", segOpenLink);
}

function segOpenQr(){
    const url = segMyUrl();
    openSheet('<div id="segAddSheet"><h3 style="margin:0">📷 QRコードで追加</h3>' +
        '<div class="meta">相手のスマホのカメラ（または下の「相手のQRを読み取る」）で、このQRコードを読み取ってもらってください。</div>' +
        '<div class="seg-qr"><canvas id="segQr" aria-label="あなたのQRコード"></canvas></div>' +
        '<div class="meta" style="text-align:center">' + escapeHtml(profileDisplayName(state.profile)) + '</div>' +
        '<div class="seg-addrow"><button type="button" class="button" id="segScanBtn">📷 相手のQRを読み取る</button>' +
        '<button type="button" class="button-secondary" id="segBackBtn">← 戻る</button></div>' +
        '<video id="segVideo" playsinline muted style="display:none;width:100%;max-height:50vh;border-radius:12px;margin-top:8px"></video>' +
        '<div class="meta" id="segScanMsg"></div></div>');
    if(window.AREQR) window.AREQR.draw(document.getElementById("segQr"), url, 240);
    document.getElementById("segBackBtn").addEventListener("click", () => { segStopScan(); segOpenAdd(); });
    document.getElementById("segScanBtn").addEventListener("click", segStartScan);
}

let segStream = null, segScanTimer = 0;
function segStopScan(){
    clearInterval(segScanTimer); segScanTimer = 0;
    if(segStream){ try{ segStream.getTracks().forEach((t) => t.stop()); }catch(_e){} segStream = null; }
}
async function segStartScan(){
    const msg = document.getElementById("segScanMsg"), video = document.getElementById("segVideo");
    if(!("BarcodeDetector" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        if(msg) msg.textContent = "この端末では読み取り機能が使えません。スマホ標準のカメラでQRコードを読み取るか、「リンクで追加」を使ってください。";
        return;
    }
    try{
        const det = new window.BarcodeDetector({ formats:["qr_code"] });
        segStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } });
        video.srcObject = segStream; video.style.display = "block"; await video.play();
        if(msg) msg.textContent = "QRコードをカメラに映してください。";
        segScanTimer = setInterval(async () => {
            try{
                const codes = await det.detect(video);
                if(codes && codes.length){ const raw = codes[0].rawValue; segStopScan(); closeSheet(); segHandleText(raw); }
            }catch(_e){ /* 次の周期で再試行 */ }
        }, 400);
    }catch(_e){
        segStopScan();
        if(msg) msg.textContent = "カメラを使えませんでした。ブラウザのカメラ許可を確認するか、「リンクで追加」を使ってください。";
    }
}

function segOpenLink(){
    const url = segMyUrl();
    openSheet('<div id="segAddSheet"><h3 style="margin:0">🔗 リンクで追加</h3>' +
        '<div class="meta">あなたのリンクを相手に送ると、相手があなたを追加できます（相手もログインが必要です）。</div>' +
        '<input id="segUrl" type="text" readonly value="' + escapeHtml(url) + '">' +
        '<div class="seg-addrow"><button type="button" class="button" id="segCopy">リンクをコピー</button>' +
        '<button type="button" class="button-secondary" id="segShare">共有する</button></div>' +
        '<label style="margin-top:12px;display:block">相手からもらったリンクを貼って追加</label>' +
        '<input id="segPaste" type="text" inputmode="url" placeholder="https://…/chat.html?u=…" autocomplete="off">' +
        '<div class="seg-addrow"><button type="button" class="button" id="segGo">この人を追加</button>' +
        '<button type="button" class="button-secondary" id="segBackBtn2">← 戻る</button></div></div>');
    document.getElementById("segBackBtn2").addEventListener("click", segOpenAdd);
    document.getElementById("segCopy").addEventListener("click", async () => {
        try{ await navigator.clipboard.writeText(url); showToast("リンクをコピーしました。"); }
        catch(_e){ const i = document.getElementById("segUrl"); if(i){ i.select(); showToast("リンクを選択しました。コピーしてください。"); } }
    });
    document.getElementById("segShare").addEventListener("click", async () => {
        if(navigator.share){ try{ await navigator.share({ title:"AREで友達になろう", url }); }catch(_e){} }
        else showToast("このブラウザには共有機能がありません。「リンクをコピー」を使ってください。");
    });
    document.getElementById("segGo").addEventListener("click", () => {
        const raw = (document.getElementById("segPaste").value || "").trim();
        if(!segHandleText(raw)) showToast("リンクの形が違います。「…chat.html?u=…」のリンクを貼ってください。");
    });
}

/** リンク／QRの文字から相手を取り出して開く。取り出せたら true */
function segHandleText(raw){
    let id = "";
    try{ id = new URL(String(raw || ""), location.href).searchParams.get("u") || ""; }catch(_e){}
    if(!SEG_UUID.test(id)) return false;
    closeSheet();
    segOpenUser(id);
    return true;
}

async function segOpenUser(id){
    if(!state.user) return;
    if(id === state.user.id){ showToast("これはあなた自身です。"); return; }
    const r = await requireClient().from(TABLES.profiles).select("*").eq("id", id).maybeSingle();
    if(!r.error && r.data){
        if(typeof feat !== "undefined" && feat.known) feat.known.set(r.data.id, r.data);
        openProfileView(r.data);
        return;
    }
    await segRequestContact(id);
}

// ---------- 4) 連絡の申請 ----------
async function segRequestContact(id){
    try{
        const r = await requireClient().rpc("request_contact_v1", { p_target:id });
        if(r.error) throw r.error;
        if(r.data === "pending") showToast("この方とは、いまは直接つながれません。管理者に連絡を送りました。承認されるまでお待ちください（承認後は、個人チャットとゲームだけ使えます）。");
        else if(r.data === "not_found") showToast("共有されたユーザーが見つかりませんでした。");
        else if(r.data === "ok"){ const p = await requireClient().from(TABLES.profiles).select("*").eq("id", id).maybeSingle(); if(p.data) openProfileView(p.data); }
    }catch(error){
        showToast(/rate_limited/.test(String(error && error.message)) ? "申請が多すぎます。しばらくしてからお試しください。" : getErrorMessage(error));
    }
}

// ---------- 5) 管理者：区分の設定と申請の承認 ----------
async function segDecorateAdminUsers(client){
    let rows = [];
    try{
        const r = await client.rpc("admin_list_segments");
        if(r.error) throw r.error;
        rows = r.data || [];
    }catch(_e){ return; }          // SQL 未実行なら 何も足さない
    const segOf = new Map(rows.map((x) => [x.user_id, x.segment]));
    el.adminBody.querySelectorAll(".admin-card").forEach((card) => {
        const btn = card.querySelector("[data-contact]"); if(!btn || card.querySelector(".seg-sel")) return;
        const uid = btn.dataset.contact;
        if(card.querySelector('[data-edituser="' + uid + '"]') === null && !segOf.has(uid)) return;
        const isAdminCard = /管理者アカウント/.test(card.textContent || "");
        if(isAdminCard) return;
        const wrap = document.createElement("div");
        wrap.innerHTML = '<label class="meta" style="display:block;margin-top:8px">このユーザーの区分（管理者だけに表示されます）</label>' +
            '<select class="seg-sel" data-segsel="' + escapeHtml(uid) + '">' +
            Object.keys(SEG_LABELS).map((k) => '<option value="' + k + '"' + (segOf.get(uid) === k ? " selected" : "") + ">" + SEG_LABELS[k] + "</option>").join("") + "</select>";
        card.appendChild(wrap);
        const sel = wrap.querySelector("select");
        sel.dataset.prev = sel.value;
        sel.addEventListener("change", async () => {
            const next = sel.value, prev = sel.dataset.prev;
            if(next === "home" && !window.confirm("「家庭」にすると、この人は家庭以外の人（管理者を除く）と、グループ・投稿・個人チャットがすべて切り離されます。\n家庭以外の人がいる部屋からも外れます。よろしいですか？")){ sel.value = prev; return; }
            sel.disabled = true;
            try{
                const r = await client.rpc("admin_set_segment", { p_user:uid, p_segment:next });
                if(r.error) throw r.error;
                sel.dataset.prev = next;
                showToast("区分を「" + SEG_LABELS[next] + "」にしました。" + (r.data ? "（" + r.data + "件の部屋から外しました）" : ""));
            }catch(error){ sel.value = prev; showToast(featError(error)); }
            sel.disabled = false;
        });
    });
    // 連絡の申請
    try{
        const q = await client.rpc("admin_list_contact_requests");
        if(q.error) throw q.error;
        const list = q.data || [];
        const box = document.createElement("div"); box.className = "admin-card"; box.id = "segReqBox";
        box.innerHTML = '<b>🔔 連絡の申請（家庭の人 ⇔ ほかの人）</b>' +
            (list.length ? list.map((x) =>
                '<div class="admin-card" style="margin-top:8px"><div>' + escapeHtml(x.requester_name || "ユーザー") + ' → ' + escapeHtml(x.target_name || "ユーザー") +
                '</div><div class="meta">' + escapeHtml(formatDate(x.created_at)) + ' ・ ' + (x.status === "pending" ? "承認待ち" : x.status === "approved" ? "承認済み" : "見送り") + '</div>' +
                (x.status === "pending" ? '<div class="row"><button type="button" class="button" data-segdec="1" data-id="' + escapeHtml(x.id) + '">承認（個人チャット・ゲームのみ）</button>' +
                    '<button type="button" class="button-secondary" data-segdec="0" data-id="' + escapeHtml(x.id) + '">見送る</button></div>'
                    : x.status === "approved" ? '<div class="row"><button type="button" class="button-secondary" data-segrev="' + escapeHtml(x.requester) + '" data-b="' + escapeHtml(x.target) + '">許可を取り消す</button></div>' : "") +
                '</div>').join("") : '<div class="meta">申請はありません。</div>');
        el.adminBody.prepend(box);
        box.addEventListener("click", async (ev) => {
            const d = ev.target.closest("[data-segdec]"), rv = ev.target.closest("[data-segrev]");
            if(!d && !rv) return;
            try{
                if(d){
                    const r = await client.rpc("admin_decide_contact_request", { p_id:d.dataset.id, p_approve:d.dataset.segdec === "1" });
                    if(r.error) throw r.error;
                    showToast(d.dataset.segdec === "1" ? "承認しました。" : "見送りました。");
                }else{
                    const r = await client.rpc("admin_revoke_contact_link", { p_a:rv.dataset.segrev, p_b:rv.dataset.b });
                    if(r.error) throw r.error;
                    showToast("許可を取り消しました。");
                }
                renderAdmin();
            }catch(error){ showToast(featError(error)); }
        });
    }catch(_e){ /* SQL 未実行 */ }
}

// ---------- 初期化 ----------
function initSegments(){
    segCss();
    segAddHelpButton();
    segAddButton();
    // タブ切りかえ：隠したタブには行かせない
    const origSetTab = setTab;
    setTab = function(tab){
        const f = segSt.flags;
        if(f && ((tab === "users" && f.show_users === false) || (tab === "posts" && f.show_posts === false))) tab = "chats";
        return origSetTab.call(this, tab);
    };
    // 管理者のユーザー一覧に、区分の選択を足す
    if(typeof renderAdminUsers === "function"){
        const origAU = renderAdminUsers;
        renderAdminUsers = async function(client){
            await origAU.apply(this, arguments);
            try{ await segDecorateAdminUsers(client); }catch(e){ console.error("[ARE seg]", e); }
        };
    }
    segProvisional(); segApplyTabs();
    segLoadFlags().then(() => {
        segApplyTabs();
        try{ if(typeof qkPaintBar === "function") qkPaintBar(); }catch(_e){ /* ショートカットの描き直し */ }
        if(typeof loadRecommendations === "function") loadRecommendations();     // おすすめ（同じグループの人）を出す
        if(typeof renderRooms === "function" && state.rooms && state.rooms.length) try{ renderRooms(); }catch(_e){}
    });
}
