"use strict";
// ===== はじめて開く画面・機能に、かんたんな案内ポップアップを出す（操作がむずかしいという声への対応） =====
// ・タブ（チャット／ユーザー／投稿／その他／マイページ）、チャットの部屋、グループ作成・検索・非表示の画面、
//   「その他」の各機能（カードを はじめて押したとき）で、その人が はじめて開いたときに1回だけ出します。
// ・「わかった」を押すとその画面の案内は二度と出ません。「案内を今後ぜんぶ出さない」でオフにできます。
// ・オフにしたあとは「その他」→「操作方法」の「案内をもう一度出す」で戻せます（localStorage：この端末だけ）。
// ・ほかのポップアップと重ならないよう、順番に1つずつ出します。

const ftip = { seen:{}, queue:[], showing:false, off:false, key:"", offKey:"" };

const FTIP_TABS = {
    chats:["💬 チャット", ["会話したい相手や部屋をタップすると、チャットが開きます。","一覧の「⋯」で、固定・フォルダ分け・非表示ができます。","「グループ作成」で、みんなで話せる部屋をつくれます。"]],
    users:["👥 ユーザー", ["人をタップすると、プロフィールを見たり、チャットを始めたりできます。","上の検索ボックスで、名前をさがせます。","「非表示のチャット」ボタンから、隠したチャットを元に戻せます。"]],
    posts:["📷 投稿", ["いまの出来事や写真を投稿できます。","「公開範囲」で、だれに見せるかを選べます。","「更新」を押すと、最新の投稿が表示されます。"]],
    more:["🧰 その他（便利機能・ゲーム）", ["便利な道具やゲームが並んでいます。タップすると使えます。","上の検索ボックスや、分類ボタンで探せます。","カード右上の ☆ を押すと、お気に入りとして上に並びます。","はじめて使う機能では、このような案内が出ます。"]],
    me:["👤 マイページ", ["名前・アイコン・自己紹介など、自分の情報を変えられます。","パスワードの変更や、表示・通知の設定もここです。","ログアウトは、画面の上の「ログアウト」ボタンです。"]]
};
const FTIP_ROOM = ["💬 チャットの使い方", ["下の入力欄に書いて「送信」を押すと、メッセージが送れます。","メッセージを長押し（パソコンは右クリック）すると、返信・コピー・削除などのメニューが出ます。","右上の 🔍 で、このチャットの中を検索できます。"]];
const FTIP_SHEETS = [
    [/グループを作成/, "tip:newgroup", ["👥 グループの作り方", ["グループの名前を入れて、入れたい人を選びます。","あとから人を追加したり、名前を変えたりもできます。"]]],
    [/メッセージを検索/, "tip:search", ["🔍 メッセージ検索", ["ことばを入れると、このチャットの中から探せます。","結果をタップすると、その場所へ移動します。"]]],
    [/非表示のチャット/, "tip:hidden", ["🙈 非表示のチャット", ["隠したチャットが並びます。メッセージは消えていません。","「開く」で読めて、「表示に戻す」で一覧に戻ります。","隠したチャットに新しいメッセージが来たときは、自動で一覧に戻ります。"]]]
];

function ftipLoad(){
    ftip.key = "are_tips_seen_" + (state && state.user ? state.user.id : "x"); ftip.offKey = "are_tips_off_" + (state && state.user ? state.user.id : "x");
    try{ ftip.seen = JSON.parse(localStorage.getItem(ftip.key) || "{}") || {}; }catch(_e){ ftip.seen = {}; }
    try{ ftip.off = localStorage.getItem(ftip.offKey) === "1"; }catch(_e){ ftip.off = false; }
}
function ftipSave(){ try{ localStorage.setItem(ftip.key, JSON.stringify(ftip.seen)); }catch(_e){ /* 保存できなくても続ける */ } }
function ftipReset(){ ftip.seen = {}; ftip.off = false; ftipSave(); try{ localStorage.removeItem(ftip.offKey); }catch(_e){} showToast("案内を もう一度 出すようにしました。"); }

function ftipEnsureUi(){
    if(document.getElementById("ftipModal")) return;
    const css = document.createElement("style");
    css.textContent = "#ftipModal{position:fixed;inset:0;z-index:5000;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px}#ftipModal[hidden]{display:none}" +
        "#ftipModal .ftip-card{background:var(--panel,#16213a);color:var(--text,#fff);border:1px solid var(--line,#33415f);border-radius:16px;max-width:420px;width:100%;padding:18px 18px 14px;box-shadow:0 12px 40px #000a;max-height:88vh;overflow:auto}" +
        "#ftipModal h3{margin:0 0 4px;font-size:1.15rem}#ftipModal .ftip-sub{font-size:.8rem;opacity:.7;margin:0 0 8px}#ftipModal ul{margin:8px 0 12px;padding-left:1.2em;line-height:1.7}" +
        "#ftipModal .ftip-ok{width:100%;min-height:46px;font-size:1rem}#ftipModal .ftip-off{display:block;margin:10px auto 0;background:none;border:0;color:inherit;opacity:.65;text-decoration:underline;font-size:.8rem;cursor:pointer;padding:6px}";
    document.head.appendChild(css);
    const m = document.createElement("div"); m.id = "ftipModal"; m.hidden = true; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "ftipTitle");
    m.innerHTML = '<div class="ftip-card"><h3 id="ftipTitle"></h3><p class="ftip-sub">はじめて開く画面の案内です</p><div id="ftipBody"></div><button type="button" class="button ftip-ok" id="ftipOk">わかった</button><button type="button" class="ftip-off" id="ftipOff">案内を今後ぜんぶ出さない</button></div>';
    document.body.appendChild(m);
    document.getElementById("ftipOk").addEventListener("click", ftipNext);
    document.getElementById("ftipOff").addEventListener("click", () => { ftip.off = true; ftip.queue = []; try{ localStorage.setItem(ftip.offKey, "1"); }catch(_e){} ftipNext(); showToast("案内をオフにしました。「その他」→「操作方法」から、もう一度出せます。"); });
    m.addEventListener("keydown", (e) => { if(e.key === "Escape") ftipNext(); });
}
function ftipNext(){
    const m = document.getElementById("ftipModal"); if(m) m.hidden = true; ftip.showing = false;
    setTimeout(ftipPump, 250);
}
function ftipPump(){
    if(ftip.showing || ftip.off || !ftip.queue.length) return;
    const t = ftip.queue.shift(); ftipEnsureUi();
    document.getElementById("ftipTitle").textContent = t.title;
    document.getElementById("ftipBody").innerHTML = (t.lead ? '<p style="margin:6px 0">' + escapeHtml(t.lead) + '</p>' : '') + '<ul>' + t.lines.map((l) => "<li>" + escapeHtml(l) + "</li>").join("") + "</ul>";
    const m = document.getElementById("ftipModal"); m.hidden = false; ftip.showing = true;
    const ok = document.getElementById("ftipOk"); try{ ok.focus(); }catch(_e){}
}
/** id の案内を、まだ見ていなければ順番待ちに入れる（出すのは1回だけ） */
function ftipOnce(id, title, lines, lead, delay){
    if(ftip.off || ftip.seen[id]) return;
    ftip.seen[id] = Date.now(); ftipSave();
    setTimeout(() => { if(ftip.off) return; ftip.queue.push({title, lines, lead}); ftipPump(); }, delay == null ? 400 : delay);
}

function ftipMoreCard(item){
    const id = item.dataset.moId || item.dataset.tool || item.dataset.extra || item.dataset.qk || "";
    if(!id || id === "help") return;
    if(ftip.off || ftip.seen["more:" + id]) return;
    const meta = item.querySelector(".meta, small");
    const clone = item.cloneNode(true); clone.querySelectorAll(".mo-star,.meta,small,.nf-badge").forEach((n) => n.remove());
    const name = (clone.textContent || "").replace(/\s+/g, " ").trim() || "この機能";
    const desc = meta ? (meta.textContent || "").replace(/\s+/g, " ").trim() : "";
    ftipOnce("more:" + id, name, [
        "画面に出るボタンを、上から順に押せば使えます。",
        "困ったら、右上の ✕ で閉じれば、何も変わりません。",
        "☆ を押すと お気に入りにして、いつでも上から開けます。"
    ], desc ? "【どんな機能？】" + desc : "はじめて使う機能です。", 900);
}

function initFirstTips(){
    ftipLoad();
    // タブ
    if(typeof setTab === "function"){
        const origSetTab = setTab;
        setTab = function(tab){
            const r = origSetTab.apply(this, arguments);
            try{ const t = FTIP_TABS[tab]; if(t && tab !== "chats") ftipOnce("tab:" + tab, t[0], t[1], "", 500); }catch(e){ console.error("[ARE tips]", e); }
            return r;
        };
    }
    // はじめにチャット画面
    setTimeout(() => { try{ const t = FTIP_TABS.chats; ftipOnce("tab:chats", t[0], t[1], "ようこそ！はじめて開く画面では、こんな案内が出ます。", 0); }catch(e){} }, 2500);
    // チャットの部屋
    if(typeof selectRoom === "function"){
        const origSel = selectRoom;
        selectRoom = function(){
            const r = origSel.apply(this, arguments);
            try{ ftipOnce("room", FTIP_ROOM[0], FTIP_ROOM[1], "", 700); }catch(e){ console.error("[ARE tips]", e); }
            return r;
        };
    }
    // シート（グループ作成・検索・非表示）
    if(typeof openSheet === "function"){
        const origSheet = openSheet;
        openSheet = function(html){
            const r = origSheet.apply(this, arguments);
            try{ const h = String(html || ""); for(const s of FTIP_SHEETS){ if(s[0].test(h.slice(0, 300))){ ftipOnce(s[1], s[2][0], s[2][1], "", 500); break; } } }catch(e){ console.error("[ARE tips]", e); }
            return r;
        };
    }
    // 「その他」の各機能
    const pane = document.querySelector(".pane-more");
    if(pane) pane.addEventListener("click", (e) => {
        if(e.target.closest(".mo-star,[data-mo-cat]")) return;
        const item = e.target.closest(".more-item"); if(item) ftipMoreCard(item);
    }, true);
    window.AREFirstTips = { reset: ftipReset };
}
