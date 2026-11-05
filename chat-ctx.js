"use strict";
// ===== 自分のプロフィールを「長押し」または「右クリック」したときのメニュー =====
// スマホ・タブレット：プロフィール（アイコン・名前の部分）を約0.5秒押し続ける。パソコン：右クリック。
// 内容：ストーリーを追加／アーカイブ／メモ／プロフィール編集／QR共有

const CTX_HOLD_MS = 520;
const CTX_MOVE_PX = 10;
feat.ctx = {timer:0, fired:0, x:0, y:0, menu:null};

function initCtx(){
    document.addEventListener("pointerdown", ctxDown, true);
    document.addEventListener("pointermove", ctxMove, true);
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => document.addEventListener(type, ctxCancel, true));
    document.addEventListener("contextmenu", ctxContext, true);
    // 長押しのあとに指を離すと「クリック」と判定されるので、メニューを出した直後のクリックは無視する
    document.addEventListener("click", (event) => {
        if(Date.now() - feat.ctx.fired < 700 && ctxTarget(event.target)){ event.preventDefault(); event.stopPropagation(); }
    }, true);
    document.addEventListener("pointerdown", (event) => { if(feat.ctx.menu && !feat.ctx.menu.contains(event.target)) hideCtx(); }, true);
    document.addEventListener("keydown", (event) => { if(event.key === "Escape") hideCtx(); });
    window.addEventListener("scroll", hideCtx, true);
    window.addEventListener("resize", hideCtx);
}

function ctxTarget(node){
    if(!node || !node.closest) return null;
    if(node.closest("select,input,textarea,[contenteditable='true']")) return null;
    return node.closest("[data-ctx='me'],[data-ctx-user]");
}

function ctxDown(event){
    if(event.pointerType === "mouse" && event.button !== 0) return;
    const target = ctxTarget(event.target);
    if(!target) return;
    clearTimeout(feat.ctx.timer);
    feat.ctx.x = event.clientX; feat.ctx.y = event.clientY;
    if(event.pointerType === "mouse") return; // マウスは右クリックで開く（左ボタンの長押しは使わない）
    feat.ctx.timer = setTimeout(() => { feat.ctx.fired = Date.now(); showCtx(feat.ctx.x, feat.ctx.y, target); if(navigator.vibrate){ try{ navigator.vibrate(15); }catch(_e){} } }, CTX_HOLD_MS);
}

function ctxMove(event){
    if(!feat.ctx.timer) return;
    if(Math.abs(event.clientX - feat.ctx.x) > CTX_MOVE_PX || Math.abs(event.clientY - feat.ctx.y) > CTX_MOVE_PX) ctxCancel();
}

function ctxCancel(){ clearTimeout(feat.ctx.timer); feat.ctx.timer = 0; }

function ctxContext(event){
    const target = ctxTarget(event.target);
    if(!target) return;
    event.preventDefault();
    ctxCancel();
    if(Date.now() - feat.ctx.fired < 900) return; // 長押しですでに開いている
    feat.ctx.fired = Date.now();
    showCtx(event.clientX, event.clientY, target);
}

const CTX_ITEMS = [
    ["story", "📖 ストーリーを追加", () => storyCompose(false)],
    ["archive", "🗂️ ストーリーのアーカイブ", () => openStoryArchive()],
    ["memo", "📝 自分専用メモ", () => openMemoView()],
    ["edit", "✏️ プロフィールを編集", () => openProfileEditor()],
    ["share", "🔗 プロフィールを共有（QR）", () => openShare()]
];

// 他の人のアイコン／プロフィールを長押し・右クリックしたとき（ユーザー画面・プロフィール画面）
function ctxUserItems(userId){
    return [
        ["ustory", "📖 この人のストーリーを見る", () => openUserStories(userId)],
        ["uprofile", "👤 プロフィールを見る", async () => {
            let p = feat.known && feat.known.get(userId);
            if(!p){ const r = await requireClient().from(TABLES.profiles).select("*").eq("id", userId).maybeSingle(); p = r.data; if(p && feat.known) feat.known.set(p.id, p); }
            if(p) openProfileView(p); else showToast("プロフィールを読み込めませんでした。");
        }]
    ];
}

function showCtx(x, y, target){
    hideCtx();
    const userId = target && target.dataset ? target.dataset.ctxUser : "";
    const items = userId ? ctxUserItems(userId) : CTX_ITEMS;
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML = items.map((item) => '<button type="button" role="menuitem" data-c="' + item[0] + '">' + item[1] + '</button>').join("");
    menu.addEventListener("click", (event) => {
        const button = event.target.closest("[data-c]");
        if(!button) return;
        const item = items.find((i) => i[0] === button.dataset.c);
        hideCtx();
        if(item) runTool(item[2]);
    });
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
    feat.ctx.menu = menu;
    const first = menu.querySelector("button");
    if(first) first.focus({preventScroll:true});
}

function hideCtx(){
    if(feat.ctx.menu){ feat.ctx.menu.remove(); feat.ctx.menu = null; }
}
