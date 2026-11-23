"use strict";

const TABLES = Object.freeze({
    profiles: "profiles",
    rooms: "chat_rooms",
    members: "chat_room_members",
    messages: "messages"
});

const STORAGE_BUCKET = "chat-attachments";

const MAX_TEXT_LENGTH = 4000;

const MAX_IMAGES = 10;

const MAX_VIDEO_SECONDS = 300;

const MAX_FILE_BYTES = 50 * 1024 * 1024;   // Supabase Free プランは1ファイル50MBが上限（プロジェクト全体の絶対上限）なので、これより大きくしない。これをこえるファイルは、これまでどおりドライブへのリンクで送る

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const MAX_VIDEOS_AT_ONCE = 5;   // 動画をまとめて選べる本数（1本ずつ順番に送る）

function formatAttachmentSize(bytes){
    const size = Number(bytes) || 0;
    if(size < 1024) return Math.round(size) + "B";
    if(size < 1024 * 1024) return Math.round(size / 1024) + "KB";
    return (size / (1024 * 1024)).toFixed(1) + "MB";
}

async function compressChatImage(file){
    if(file.size < 800 * 1024 || !["image/jpeg","image/png","image/webp"].includes(file.type)) return file;
    let bitmap = null, objectUrl = "";
    try{
        if(window.createImageBitmap) bitmap = await createImageBitmap(file);
        else{
            objectUrl = URL.createObjectURL(file);
            bitmap = await new Promise((resolve,reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = objectUrl; });
        }
        const scale = Math.min(1,1600 / Math.max(bitmap.width,bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1,Math.round(bitmap.width * scale));
        canvas.height = Math.max(1,Math.round(bitmap.height * scale));
        canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve,"image/webp",0.82));
        if(!blob || blob.size >= file.size) return file;
        const extension = blob.type === "image/webp" ? "webp" : "png";
        const name = String(file.name || "image").replace(/\.[^.]+$/,"" ) + "." + extension;
        return new File([blob],name,{type:blob.type || "image/png",lastModified:Date.now()});
    }catch(_error){
        return file;
    }finally{
        if(bitmap && typeof bitmap.close === "function") bitmap.close();
        if(objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

// ===== 送れるファイルの種類（ホワイトリスト）：ここに書いた拡張子だけ送れます（約114種類） =====
// 追加するときは、保存先（Supabase の chat-attachments）の許可リストにも 同じ種類を足してください（sql/chat_attachments_mime_v2.sql）。
const FILE_MIME_BY_EXT = {
    // 画像・動画（ブラウザが教えてくれる種類をそのまま使う）
    jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp",heic:"image/heic",heif:"image/heif",
    mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",
    // 画像・動画（追加）
    bmp:"image/bmp",tif:"image/tiff",tiff:"image/tiff",avif:"image/avif",ico:"image/vnd.microsoft.icon",
    mkv:"video/x-matroska",avi:"video/x-msvideo",m4v:"video/mp4","3gp":"video/3gpp",wmv:"video/x-ms-wmv",
    // 文書
    pdf:"application/pdf",
    doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls:"application/vnd.ms-excel",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt:"application/vnd.ms-powerpoint",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt:"application/vnd.oasis.opendocument.text",ods:"application/vnd.oasis.opendocument.spreadsheet",odp:"application/vnd.oasis.opendocument.presentation",
    rtf:"application/rtf",epub:"application/epub+zip",
    pages:"application/vnd.apple.pages",numbers:"application/vnd.apple.numbers",key:"application/vnd.apple.keynote",
    // テキスト・データ
    txt:"text/plain",log:"text/plain",ini:"text/plain",cfg:"text/plain",conf:"text/plain",toml:"text/plain",yaml:"text/plain",yml:"text/plain",
    srt:"text/plain",vtt:"text/plain",lrc:"text/plain",tex:"text/plain",rst:"text/plain",sql:"text/plain",diff:"text/plain",patch:"text/plain",jsonl:"text/plain",
    md:"text/markdown",markdown:"text/markdown",json:"application/json",csv:"text/csv",tsv:"text/tab-separated-values",ics:"text/calendar",vcf:"text/vcard",
    // ソースコード（文字として送るだけ。js・svg・xml は 危険なので入れていません。html・htm は、保存先には「文字」として預け、見るときは 安全な枠（sandbox）の中でページとして表示します）
    html:"text/plain",htm:"text/plain",
    py:"text/plain",mjs:"text/plain",ts:"text/plain",jsx:"text/plain",tsx:"text/plain",css:"text/plain",scss:"text/plain",
    java:"text/plain",kt:"text/plain",c:"text/plain",h:"text/plain",cpp:"text/plain",hpp:"text/plain",cs:"text/plain",go:"text/plain",rs:"text/plain",
    rb:"text/plain",php:"text/plain",swift:"text/plain",lua:"text/plain",dart:"text/plain",gd:"text/plain",pl:"text/plain",r:"text/plain",scala:"text/plain",
    // ゲーム・3D
    glb:"model/gltf-binary",gltf:"model/gltf+json",stl:"model/stl",obj:"text/plain",tmx:"text/plain",ldtk:"text/plain",
    // フォント
    ttf:"font/ttf",otf:"font/otf",woff:"font/woff",woff2:"font/woff2",
    // 圧縮
    zip:"application/zip","7z":"application/x-7z-compressed",rar:"application/vnd.rar",tar:"application/x-tar",gz:"application/gzip",tgz:"application/gzip",bz2:"application/x-bzip2",xz:"application/x-xz",
    // 音声
    mp3:"audio/mpeg",m4a:"audio/mp4",aac:"audio/aac",wav:"audio/wav",flac:"audio/flac",ogg:"audio/ogg",opus:"audio/ogg",mid:"audio/midi",midi:"audio/midi",weba:"audio/webm"
};
// ブラウザが教える種類を信じてよい拡張子（それ以外は、拡張子から決めた種類を使う。例：.md や .json は ブラウザによって種類が空になる）
const FILE_TRUST_BROWSER_TYPE = new Set(["jpg","jpeg","png","gif","webp","heic","heif","mp4","mov","webm"]);
// 危険なので、送れない拡張子（ホワイトリストに無いものは すべて送れませんが、理由を はっきり伝えるための一覧）
const FILE_BLOCKED_EXT = new Set(["exe","msi","bat","cmd","com","scr","pif","ps1","psm1","vbs","vbe","js","jse","wsf","wsh","hta","cpl","reg","lnk","dll","sys","jar","apk","ipa","app","dmg","iso","sh","bash","command","xhtml","svg","xml","docm","xlsm","pptm","dotm","xlam"]);

function fileExt(file){ const m = /\.([A-Za-z0-9]+)$/.exec(file.name || ""); return m ? m[1].toLowerCase() : ""; }

function resolveMime(file){
    const ext = fileExt(file), byExt = FILE_MIME_BY_EXT[ext];
    if(byExt && !FILE_TRUST_BROWSER_TYPE.has(ext)) return byExt;
    if(file.type && file.type !== "application/octet-stream") return file.type;
    return byExt || "application/octet-stream";
}

// ファイルを送れるか調べる。送れないときは、理由の文を返す（送れるときは ""）
function fileRejectReason(file){
    const ext = fileExt(file);
    if(!ext) return "拡張子（.txt など）がないため送れません";
    if(FILE_BLOCKED_EXT.has(ext)) return "危険なため送れません（." + ext + "）";
    if(!FILE_MIME_BY_EXT[ext]) return "送れない形式です（." + ext + "）";
    return "";
}

// ---- 文字化けの自動なおし -------------------------------------------------------------
// （文字コードを調べる部分は textenc.js。ファイルを開く専用ページ fileview.html と共通）
// txt・md・csv・json などの「文字のファイル」は、送る前に中身の文字コードを調べる。
//  ・すでに UTF-8 のファイルは、中身にいっさい手を入れない（保存先に「UTF-8 です」と伝えるだけ）。
//  ・Shift_JIS・EUC-JP・JIS（ISO-2022-JP）・UTF-16（目印つき）のファイルは、UTF-8 に直して送る。
//  ・どれか決められない（読めない・バイナリ・ほかの言語など）ときは、何も変えずにそのまま送る。
const TEXT_FIX_MAX_BYTES = 10 * 1024 * 1024;                  // これより大きいファイルは、中身を調べずにそのまま送る
const textUtf8Files = new WeakSet();                           // 「中身は UTF-8」と確かめたファイル

function isTextFixTarget(file){
    return TEXT_FILE_EXT.has(fileExt(file));                   // 文字のファイルの一覧は textenc.js
}

// 戻り値: {file, changed, from}  changed が true のときだけ、file は UTF-8 に直した新しいファイル
async function fixTextEncoding(file){
    const same = {file, changed:false, from:""};
    if(!isTextFixTarget(file) || file.size === 0 || file.size > TEXT_FIX_MAX_BYTES) return same;
    let found;
    try{
        found = detectTextEncoding(new Uint8Array(await file.arrayBuffer()));
    }catch(error){
        return same;
    }
    if(found.enc === "utf-8" || found.enc === "utf-8-bom"){ textUtf8Files.add(file); return same; }
    if(typeof found.text !== "string") return same;
    const out = encodeUtf8Text(found.text,TEXT_FIX_BOM_EXT.has(fileExt(file)));
    const fixed = new File([out],file.name,{type:resolveMime(file), lastModified:file.lastModified});
    textUtf8Files.add(fixed);
    return {file:fixed, changed:true, from:TEXT_ENCODING_LABEL[found.enc] || found.enc};
}

const state = {
    client: null,
    user: null,
    profile: null,
    rooms: [],
    recommendations: [],
    currentRoom: null,
    currentPartner: null,
    messages: [],
    subscription: null,
    loadingMessages: false,
    sending: false,
    loadingRooms: false,
    loadingUsers: false,
    searchText: "",
    authSubscription: null
};

const el = {};

const $ = (id) => document.getElementById(id);

function cacheElements(){
    [
        "app","logoutButton","myAvatar","myName","myLoginStatus",
        "refreshUsersButton","userSearch","recommendedUsers","refreshRoomsButton",
        "roomList","backButton","chatAvatar","chatTitle","chatSubtitle",
        "refreshMessagesButton","pageStatus","messages","imageInput","fileInput",
        "videoInput","attachmentStatus","messageInput","sendButton","newlineButton","charCount","toast","delCard","delStatus","delRequestButton","delCancelButton","newGroupButton","exportOldButton","exportAllButton","postFilter","postVideo","toggleHiddenUsers","postBody","postImage","postImageName","postSubmit","postFeed","postMore","postsRefresh","profileText","profileEditButton","profileModal","profileSheet","sidebar","rail","readReceiptToggle","securityBanner","myStatus","scheduleButton","schedulePanel","scheduleAt","scheduleSubmit","scheduleList","scheduleClose","adminTabButton","adminBadge","adminPanel","adminBody","adminClose"
    ].forEach((id) => el[id] = $(id));
}

// スマホなど「指で操作する」端末かどうか（Shift+Enter が押しづらい端末では、キーボードの Enter を送信ではなく改行にする）
function isCoarsePointer(){
    try{ return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches); }catch(_e){ return false; }
}

// サイドバーの「更新」ボタン：パソコンの Shift+Ctrl+R（強制再読み込み）と同じ役わり。
// たまった控え（サービスワーカー・キャッシュ）をぜんぶ消してから、ページを読み直す＝いちばん確実に最新版になる。
async function hardRefreshPage(){
    try{
        if("caches" in window){
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        }
    }catch(_e){ /* 消せなくても、読み直しは続ける */ }
    try{
        if("serviceWorker" in navigator){
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((reg) => reg.unregister()));
        }
    }catch(_e){ /* 消せなくても、読み直しは続ける */ }
    location.reload();
}

function safeHttpUrl(value){
    if(!String(value || "").trim()) return "";   // 空のときに「いま開いているページ（chat.html）」を返すと、アイコンが壊れた画像になるため
    try{
        const u = new URL(String(value || ""), window.location.href);
        return u.protocol === "https:" ? u.href : "";
    }catch(_error){ return ""; }
}

function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[char]);
}

function shortName(value){
    const name = String(value || "A").trim();
    return Array.from(name)[0] || "A";
}

// 日付の区切り（その日のはじめのメッセージの前に「今日」「昨日」「11月9日（月）」を出す）
function msgDayKey(value){
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}
function dateSeparator(value){
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return "";
    const w = "日月火水木金土"[d.getDay()], now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((today - day) / 86400000);
    const md = (d.getMonth() + 1) + "月" + d.getDate() + "日（" + w + "）";
    const label = diff === 0 ? "今日　" + md : diff === 1 ? "昨日　" + md : (d.getFullYear() === now.getFullYear() ? md : d.getFullYear() + "年" + md);
    return '<div class="date-sep" role="separator"><span>' + escapeHtml(label) + '</span></div>';
}

// 投稿・コメント用：日付と曜日つきの時刻（例：11月11日（水）11:11。去年以前は年も出す）
function formatDateTime(value){
    if(!value) return "";
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + "年" : "";
    return y + (d.getMonth() + 1) + "月" + d.getDate() + "日（" + "日月火水木金土"[d.getDay()] + "）" + formatDate(value);
}

function formatDate(value){
    if(!value) return "";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP",{hour:"2-digit",minute:"2-digit"}).format(date);
}

function formatBytes(bytes){
    if(!Number.isFinite(bytes) || bytes < 0) return "";
    if(bytes < 1024) return bytes + " B";
    if(bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if(bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function setStatus(message, type){
    el.pageStatus.textContent = message || "";
    el.pageStatus.className = "status" + (message ? " show " + (type || "info") : "");
    window.clearTimeout(setStatus.timeout);
    // エラー以外（「チャットに接続しました」などの一時的なお知らせ）は、5秒で自動的に消す
    if(message && type !== "error"){
        setStatus.timeout = window.setTimeout(() => {
            el.pageStatus.textContent = "";
            el.pageStatus.className = "status";
        },5000);
    }
}

function showToast(message){
    el.toast.textContent = message;
    el.toast.classList.add("show");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => el.toast.classList.remove("show"), 3500);
}

function setBusy(button, busy, busyText){
    if(!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? (busyText || "処理中...") : button.dataset.originalText;
}

function isMissingBackend(error){
    const code = String(error?.code || "");
    const text = String(error?.message || "") + " " + String(error?.details || "");
    // 42883 は「関数がない」と「演算子がない（型のまちがい＝サーバー側の不具合）」の両方に使われる。後者は「未実装」とは言わない
    return ["PGRST202","PGRST205","42P01"].includes(code) || (code === "42883" && !/operator/i.test(text)) ||
        /could not find the (function|table)|schema cache|function was not found|requested function was not found|relation .* does not exist|function .* does not exist/i.test(text);
}

function getErrorMessage(error){
    if(isMissingBackend(error)){
        return "この機能は未実装です（サーバー側の準備ができていません）。";
    }
    const message = error?.message || String(error || "不明なエラー");
    if(/segment_blocked/.test(message)){
        return "この方とは、いまは連絡できません。管理者の承認が必要です。";
    }
    if(/guest_limit/.test(message)){
        return "お試しアカウントは、管理者以外の人には5件までしかメッセージを送れません。登録すると制限なく使えます。";
    }
    if(/row-level security|permission denied|not allowed|42501/i.test(message)){
        return "データベースのアクセス権限で拒否されました。SupabaseのRLSポリシーを確認してください。";
    }
    if(/relation .* does not exist|could not find the table/i.test(message)){
        return "必要なテーブルが見つかりません。テーブル名とSupabaseの構造を確認してください。";
    }
    if(/bucket not found|no such bucket/i.test(message)){
        return "添付ファイル用のStorageバケットがありません。chat-attachmentsを作成してください。";
    }
    if(/JWT|auth session missing|not authenticated/i.test(message)){
        return "ログイン状態を確認できません。再度ログインしてください。";
    }
    if(/failed to fetch|networkerror|network request failed|load failed|aborterror|signal is aborted|timed? ?out|タイムアウト|サーバーに接続できません/i.test(message)){
        return "通信が不安定です。入力した文章は消えていません。少し待ってから、もう一度お試しください。";
    }
    return message;
}

function requireClient(){
    if(!state.client) throw new Error("Supabaseクライアントが初期化されていません。");
    return state.client;
}

async function getProfile(userId){
    const client = requireClient();
    const result = await client.from(TABLES.profiles).select("*").eq("id",userId).maybeSingle();
    if(result.error) throw result.error;
    return result.data;
}

function profileDisplayName(profile){
    return profile?.display_name || profile?.displayName || profile?.username || profile?.login_id || "ユーザー";
}

function setAvatar(target, profile){
    const name = profileDisplayName(profile);
    const avatarUrl = profile?.avatar_url || profile?.avatarUrl || profile?.photo_url || "";
    if(avatarUrl){
        target.innerHTML = '<img src="' + escapeHtml(safeHttpUrl(avatarUrl)) + '" alt="">';
    }else{
        target.textContent = shortName(name);
    }
}

function setTab(tab){
    el.sidebar.dataset.tab = tab;
    if(tab === "posts" && typeof feat !== "undefined" && el.postFeed && Date.now() - feat.postsLoadedAt > 10000) loadPosts(true);
    el.rail.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active",b.dataset.tab === tab));
}

function setChatEnabled(enabled){
    el.messageInput.disabled = !enabled;
    el.sendButton.disabled = !enabled;
    el.newlineButton.disabled = !enabled;
    el.refreshMessagesButton.disabled = !enabled;
    el.scheduleButton.disabled = !enabled;
    document.querySelectorAll("[data-needs-room]").forEach((node) => { node.disabled = !enabled; });
    if(!enabled) el.schedulePanel.hidden = true;
    if(!enabled) el.messageInput.value = "";
    updateCharCount();
}

/** 入力欄の高さの上限。スマホでキーボードが出ている間は、前の会話が見えるように 低くする（いっぱいになったら 入力欄の中でスクロール） */
function composerMaxHeight(){
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 700;
    if(document.body.classList.contains("kb-open")) return Math.max(72,Math.min(112,Math.round(vh * 0.24)));
    return vh < 520 ? Math.max(72,Math.round(vh * 0.26)) : 140;
}

function updateCharCount(){
    const length = Array.from(el.messageInput.value).length;
    el.charCount.textContent = String(length);
    el.charCount.style.color = length > MAX_TEXT_LENGTH ? "var(--danger)" : "var(--muted)";
    el.messageInput.style.height = "auto";
    el.messageInput.style.height = Math.min(el.messageInput.scrollHeight,composerMaxHeight()) + "px";
    el.sendButton.disabled = !state.currentRoom || state.sending || length > MAX_TEXT_LENGTH;
}

async function initialize(){
    cacheElements();
    // 左のメニュー（チャット・ユーザー・投稿・その他・マイページ）は、読み込み中でも切りかえられるよう、最初につなぐ
    el.rail.addEventListener("click",(event) => {
        const tab = event.target.closest("[data-tab]");
        if(tab) setTab(tab.dataset.tab);
    });

    try{
        if(!window.ARESystem || !window.AREAuth){
            throw new Error("system.jsが読み込まれていません。");
        }

        state.client = window.ARESystem.client;

        const session = await window.AREAuth.getSession();
        if(!session?.user){
            redirectToIndex();
            return;
        }

        state.user = session.user;
        // 読み込みを速くするため、「自分のプロフィール」「おすすめユーザー」「チャット一覧」は、順番に待たず、同時に取りに行く
        const profileTask = getProfile(state.user.id).catch(() => null).then((profile) => {
            state.profile = profile;
            el.myName.textContent = profileDisplayName(state.profile);
            el.myLoginStatus.textContent = "ログイン中";
            setAvatar(el.myAvatar,state.profile);
        });
        el.myLoginStatus.textContent = "ログイン中";

        bindEvents();
        await Promise.all([profileTask,loadRecommendations(),loadRooms(),Promise.race([prefSyncStart(),new Promise((r) => setTimeout(r,4000))])]);
        setStatus("チャットの準備ができました。ユーザーを選択してください。","success");
        startFeatures();

        state.authSubscription = window.AREAuth.onAuthStateChange((event, sessionValue) => {
            if(event === "SIGNED_OUT" || !sessionValue){
                redirectToIndex();
            }
        });
    }catch(error){
        console.error("ARE initialization error:",error);
        setStatus(getErrorMessage(error),"error");
        if(/ログイン|session|認証/i.test(error?.message || "")){
            window.setTimeout(redirectToIndex,1200);
        }
    }
}

function redirectToIndex(){
    const params = new URLSearchParams(location.search);
    const invite = params.get("invite");
    // 共有された投稿のリンク（?p=）をログインの前に開いたとき：ログインしたあとに、その投稿を開けるよう覚えておく（30分だけ・この画面だけ）
    const shared = params.get("p");
    if(shared && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shared)){
        try{ sessionStorage.setItem("are_pending_post", JSON.stringify({id:shared, t:Date.now()})); }catch(_e){}
    }
    window.location.replace("./index.html" + (invite ? "?invite=" + encodeURIComponent(invite) : ""));
}

function bindEvents(){
    el.logoutButton.addEventListener("click",logout);
    el.refreshUsersButton.addEventListener("click",loadRecommendations);
    el.refreshRoomsButton.addEventListener("click",hardRefreshPage);
    el.refreshMessagesButton.addEventListener("click",() => loadMessages(true));
    // 再生や全画面が終わったら、ためておいた描き直しを行う（renderMessages を参照）
    ["pause","ended"].forEach((type) => el.messages.addEventListener(type,flushDeferredRender,true));
    document.addEventListener("fullscreenchange",flushDeferredRender);
    document.addEventListener("webkitfullscreenchange",flushDeferredRender);
    el.messages.addEventListener("webkitendfullscreen",flushDeferredRender,true);
    let searchTimer = null;
    el.userSearch.addEventListener("input",() => {
        state.searchText = el.userSearch.value.trim().toLocaleLowerCase();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadRecommendations,250);
    });
    // スマホ（指で操作する端末）では「Enterで送信」ではなく「Enterで改行、送信は送信ボタン」にする。
    // 説明文を長く書くと、空のときの入力欄が 2〜3 行ぶんの高さになって 会話が狭くなるので、1 行におさめる（Enter は改行・送信は「送信」ボタン、は ↵ ボタンと「送信」ボタンの見た目で わかる）
    if(isCoarsePointer()){
        el.messageInput.placeholder = "メッセージを入力...";
        el.messageInput.rows = 1;
        el.messageInput.setAttribute("enterkeyhint","enter");
    }
    // スマホで文字を入力中（キーボードが出ている間）は、ツール行をたたんで、会話がより見えるようにする
    (function(){
        const composerEl = el.messageInput.closest(".composer");
        if(!composerEl) return;
        let kbTimer = 0;
        el.messageInput.addEventListener("focus",() => { if(isCoarsePointer()){ clearTimeout(kbTimer); composerEl.classList.add("kb-focus"); document.body.classList.add("kb-open"); updateCharCount(); } });
        el.messageInput.addEventListener("blur",() => {
            composerEl.classList.remove("kb-focus");
            // 画面のボタンを押した瞬間に 上のバーや入力欄の大きさが変わると、押したはずのボタンが ずれて 反応しなくなる。少しだけ待ってから もとの大きさにもどす
            clearTimeout(kbTimer);
            kbTimer = setTimeout(() => { if(document.activeElement !== el.messageInput){ document.body.classList.remove("kb-open"); updateCharCount(); } },450);
        });
        if(window.visualViewport) window.visualViewport.addEventListener("resize",() => { if(document.body.classList.contains("kb-open")) updateCharCount(); });
    })();
    el.sendButton.addEventListener("click",sendTextMessage);
    el.newlineButton.addEventListener("click",() => {
        // スマホでは Shift+Enter が使いづらいので、改行専用ボタンで確実に改行だけできるようにする（送信しない）
        const i = el.messageInput.selectionStart || el.messageInput.value.length;
        const j = el.messageInput.selectionEnd || i;
        el.messageInput.value = el.messageInput.value.slice(0,i) + "\n" + el.messageInput.value.slice(j);
        el.messageInput.selectionStart = el.messageInput.selectionEnd = i + 1;
        el.messageInput.focus();
        updateCharCount();
    });
    el.messageInput.addEventListener("input",updateCharCount);
    el.messageInput.addEventListener("keydown",(event) => {
        if(event.key === "Enter" && !event.shiftKey && !event.isComposing){
            // 「/c」だけ書いて Enter を押したときは、本文を書く途中とみなして改行だけ入れる（送信しない）。
            // そのまま送ってしまうと、コピーする文章が無い「/c」だけのメッセージになってしまうため。
            // （2行目以降を続けて書きたいときは、これまでどおり Shift+Enter でも改行できます）
            if(el.messageInput.value.trim() === "/c"){
                event.preventDefault();
                const i = el.messageInput.selectionStart || el.messageInput.value.length;
                el.messageInput.value = el.messageInput.value.slice(0,i) + "\n" + el.messageInput.value.slice(i);
                el.messageInput.selectionStart = el.messageInput.selectionEnd = i + 1;
                updateCharCount();
                return;
            }
            // スマホ（指で操作する端末）では、キーボードの Enter／改行キーを押しても送信せず、ふつうに改行だけ入れる。
            // （Shift+Enter が押しづらいスマホで「改行したいだけなのに送信してしまう」事故を防ぐため。
            //  送信は、送信ボタンを押したときだけ行う。パソコン（物理キーボード）では、これまでどおり Enter で送信する）
            if(isCoarsePointer()) return;
            event.preventDefault();
            sendTextMessage();
        }
    });
    el.imageInput.addEventListener("change",() => handleFiles(el.imageInput.files,"image"));
    el.fileInput.addEventListener("change",() => handleFiles(el.fileInput.files,"file"));
    el.videoInput.addEventListener("change",() => handleFiles(el.videoInput.files,"video"));
    el.backButton.addEventListener("click",() => el.app.classList.remove("chat-open"));
    if(window.visualViewport){
        const mobile = window.matchMedia("(max-width:700px)");
        const fit = () => {
            el.app.style.height = mobile.matches ? window.visualViewport.height + "px" : "";
            if(mobile.matches) window.scrollTo(0,0);
        };
        window.visualViewport.addEventListener("resize",fit);
        window.visualViewport.addEventListener("scroll",fit);
        fit();
    }
    window.addEventListener("beforeunload",cleanupSubscription);
}

const escLike = (text) => text.replace(/[\\%_]/g,(ch) => "\\" + ch);

async function loadRecommendations(){
    if(state.loadingUsers) return;
    state.loadingUsers = true;
    try{
        const client = requireClient();
        const hiddenResult = await client.from("hidden_recommendations").select("hidden_user_id");
        if(!hiddenResult.error) state.hiddenIds = new Set((hiddenResult.data || []).map((row) => row.hidden_user_id));
        const text = el.userSearch.value.trim();
        let result = {data:[]};
        if(text){
            result = await client.from(TABLES.profiles).select("*").ilike("display_name","%" + escLike(text) + "%").neq("id",state.user.id).order("display_name",{ascending:true}).limit(30);
        }else if(state.showHidden && state.hiddenIds.size){
            result = await client.from(TABLES.profiles).select("*").in("id",[...state.hiddenIds]).limit(100);
        }else if(typeof absActive === "function" && absActive()){
            // 管理者：グループ（家庭/友達/社員/その他/全員）を選んで一覧
            try{ result = {data: await absFetch(client)}; state.recommendedMode = false; }
            catch(error){ showToast(getErrorMessage(error)); result = {data: []}; }
        }else{
            // おすすめ：同じグループ（社員は社員、友人は友人）の人。SQL 未実行・該当なしなら今までどおり（検索のみ）
            try{
                const peers = await client.rpc("my_segment_peers_v1");
                const ids = (!peers.error && peers.data ? peers.data : []).map((r) => r.user_id).filter(Boolean);
                state.recommendedMode = ids.length > 0;
                if(ids.length) result = await client.from(TABLES.profiles).select("*").in("id",ids).limit(300);
                if(typeof rcPrepare === "function") await rcPrepare();
            }catch(_e){ state.recommendedMode = false; }
        }
        if(result.error) throw result.error;
        state.recommendations = result.data || [];
        renderRecommendations();
    }catch(error){
        console.error("User search error:",error);
        el.recommendedUsers.innerHTML = '<div class="empty-list">ユーザーを検索できませんでした。<br>' + escapeHtml(getErrorMessage(error)) + '</div>';
    }finally{
        state.loadingUsers = false;
    }
}

function renderRecommendations(){
    const list = state.recommendations.filter((profile) => {
        return state.showHidden || !state.hiddenIds.has(profile.id);
    });
    if(typeof rcPaintCount === "function") rcPaintCount();
    if(typeof absPaintBar === "function") absPaintBar();
    el.toggleHiddenUsers.textContent = state.showHidden ? "非表示を隠す" : "非表示（" + state.hiddenIds.size + "）";

    if(!list.length){
        el.recommendedUsers.innerHTML = '<div class="empty-list">' + (el.userSearch.value.trim()
            ? '該当するユーザーが見つかりません。'
            : '上の検索バーに名前を入力すると、ユーザーが表示されます。') + '</div>';
        return;
    }

    const absOn = typeof absActive === "function" && absActive() && !el.userSearch.value.trim() && !state.showHidden;
    let shown = list, recoTitle = "⭐ おすすめのユーザー";
    const recoOn = !absOn && state.recommendedMode && !el.userSearch.value.trim() && !state.showHidden;
    if(recoOn && typeof rcPick === "function"){ const r = rcPick(list); if(r){ shown = r.list; recoTitle = r.title; } }
    const recoHead = absOn ? (typeof absHeadHtml === "function" ? absHeadHtml(shown.length) : "") : (recoOn ? '<div class="meta" style="margin:4px 2px">' + recoTitle + '</div>' : "");
    el.recommendedUsers.innerHTML = recoHead + shown.map((profile) => {
        const name = profileDisplayName(profile);
        const avatar = safeHttpUrl(profile?.avatar_url || profile?.avatarUrl || profile?.photo_url || "");
        const hidden = state.hiddenIds.has(profile.id);
        const avatarHtml = avatar
            ? '<div class="avatar"><img src="' + escapeHtml(avatar) + '" alt=""></div>'
            : '<div class="avatar">' + escapeHtml(shortName(name)) + '</div>';

        return '<div class="person-wrap' + (hidden ? ' is-hidden' : '') + '"><button class="person" type="button" data-user-id="' + escapeHtml(profile.id) + '" data-ctx-user="' + escapeHtml(profile.id) + '">' +
            avatarHtml +
            '<span class="person-text"><strong>' + escapeHtml(name) + '</strong><small>' + presenceHtml(profile) + '</small>' + statusLine(profile) + '</span>' +
            '<span class="add" aria-hidden="true">＋</span></button>' +
            '<button class="hide-btn" type="button" data-hide="' + escapeHtml(profile.id) + '" data-action="' + (hidden ? 'show' : 'hide') + '">' + (hidden ? '再表示' : '非表示') + '</button></div>';
    }).join("");

    if(typeof qkPaintFollowCounts === "function") qkPaintFollowCounts();
    el.recommendedUsers.querySelectorAll("[data-user-id]").forEach((button) => {
        button.addEventListener("click",() => openOrCreateDirectChat(button.dataset.userId));
    });
    el.recommendedUsers.querySelectorAll("[data-hide]").forEach((button) => {
        button.addEventListener("click",() => toggleHideUser(button.dataset.hide,button.dataset.action === "hide"));
    });
}

async function loadRooms(){
    if(state.loadingRooms) return;
    state.loadingRooms = true;
    el.roomList.innerHTML = '<div class="empty-list">チャットを読み込んでいます...</div>';

    try{
        const client = requireClient();
        const membershipResult = await client.from(TABLES.members).select("room_id").eq("user_id",state.user.id);
        if(membershipResult.error) throw membershipResult.error;

        const roomIds = [...new Set((membershipResult.data || []).map((row) => row.room_id).filter(Boolean))];
        if(!roomIds.length){
            state.rooms = []; state.allRooms = [];
            renderRooms();
            return;
        }

        // 「部屋の情報」と「メンバー一覧」は、たがいに待つ必要がないので 同時に取る（問い合わせ 1 回ぶん速い）
        const [roomsResult,membersResult] = await Promise.all([
            client.from(TABLES.rooms).select("*").in("id",roomIds).order("created_at",{ascending:false}),
            client.from(TABLES.members).select("room_id,user_id").in("room_id",roomIds)
        ]);
        if(roomsResult.error) throw roomsResult.error;
        if(membersResult.error) throw membersResult.error;

        const roomRows = roomsResult.data || [];

        const otherIds = [...new Set((membersResult.data || []).map((row) => row.user_id).filter((id) => id && id !== state.user.id))];
        let profiles = [];

        if(otherIds.length){
            const profilesResult = await client.from(TABLES.profiles).select("*").in("id",otherIds);
            if(profilesResult.error) throw profilesResult.error;
            profiles = profilesResult.data || [];
        }

        profiles.forEach((p) => feat.known.set(p.id,p));
        state.allRooms = roomRows.map((room) => {
            const memberIds = (membersResult.data || []).filter((row) => row.room_id === room.id).map((row) => row.user_id);
            const partnerId = room.is_group ? null : (memberIds.find((id) => id !== state.user.id) || null);
            const partner = room.is_group ? null : (profiles.find((profile) => profile.id === partnerId) || null);
            return {...room,partner,partnerId,memberIds,orphan:!room.is_group && !partner};   // 相手のアカウントがすでに無いチャット
        });
        state.rooms = state.allRooms.filter((room) => !room.orphan || feat.isAdmin);   // 削除ずみユーザーとのチャットは、管理者以外には 出さない（他の画面の一覧にも出ない）

        renderRooms();
    }catch(error){
        console.error("Room list error:",error);
        el.roomList.innerHTML = '<div class="empty-list">チャット一覧を取得できませんでした。<br>' + escapeHtml(getErrorMessage(error)) + '</div>';
    }finally{
        state.loadingRooms = false;
    }
}

function renderRooms(){
    // 削除ずみユーザーとのチャットは、管理者にだけ見せる（ほかの人には表示しない）
    const rooms = state.rooms.filter((room) => !room.orphan || feat.isAdmin);
    if(!rooms.length){
        el.roomList.innerHTML = '<div class="empty-list">まだチャットがありません。<br>おすすめユーザーから相手を選ぶか、グループを作成してください。</div>';
        return;
    }

    el.roomList.innerHTML = rooms.map((room) => {
        const group = Boolean(room.is_group);
        const name = group ? (room.name || "グループ") : (room.orphan ? "削除ずみユーザー" : profileDisplayName(room.partner));
        const avatar = group ? "" : safeHttpUrl(room.partner?.avatar_url || room.partner?.avatarUrl || "");
        const avatarHtml = group
            ? '<div class="avatar">👥</div>'
            : (avatar ? '<div class="avatar"><img src="' + escapeHtml(avatar) + '" alt=""></div>' : '<div class="avatar">' + escapeHtml(shortName(name)) + '</div>');
        const active = state.currentRoom?.id === room.id ? " active" : "";
        const sub = group ? 'グループ ・ メンバー ' + (room.memberIds || []).length + '人' : presenceHtml(room.partner);

        return '<button class="room-item' + active + '" type="button" data-room-id="' + escapeHtml(room.id) + '">' +
            avatarHtml + '<span class="person-text"><strong>' + escapeHtml(name) + '</strong><small>' + sub + '</small>' + (group ? '' : statusLine(room.partner)) + '</span></button>';
    }).join("");

    el.roomList.querySelectorAll("[data-room-id]").forEach((button) => {
        button.addEventListener("click",() => {
            const room = state.rooms.find((item) => item.id === button.dataset.roomId);
            if(room) selectRoom(room,room.partner);
        });
    });
}

async function openOrCreateDirectChat(partnerId){
    if(!partnerId || partnerId === state.user.id) return;

    try{
        setStatus("チャットを開いています...","info");
        const client = requireClient();
        const partner = state.recommendations.find((profile) => profile.id === partnerId) || await getProfile(partnerId);
        if(!partner) throw new Error("相手のプロフィールが見つかりません。");

        const rpcResult = await client.rpc("create_or_get_direct_room",{p_partner_id:partnerId});
        if(rpcResult.error) throw rpcResult.error;

        const roomResult = await client.from(TABLES.rooms).select("*").eq("id",rpcResult.data).maybeSingle();
        if(roomResult.error) throw roomResult.error;
        if(!roomResult.data) throw new Error("ルームを取得できませんでした。");

        await loadRooms();
        const room = state.rooms.find((item) => item.id === roomResult.data.id) || {...roomResult.data,partner,partnerId};
        await selectRoom(room,partner);
    }catch(error){
        console.error("Open direct chat error:",error);
        if(/segment_blocked/.test(String(error?.message || "")) && typeof segRequestContact === "function"){ setStatus("","info"); segRequestContact(partnerId); return; }
        setStatus(getErrorMessage(error),"error");
    }
}

async function selectRoom(room,partner){
    if(!room?.id) return;
    cleanupSubscription();
    setTab("chats");

    state.currentRoom = room;
    state.currentPartner = partner || room.partner || null;
    state.messages = [];
    if(typeof runRoomHooks === "function") runRoomHooks();
    feat.partnerReadAt = null; feat.readTimes = []; feat.readKey = ""; feat.pending = new Set(); feat.editingId = null; el.schedulePanel.hidden = true;

    const name = room.is_group ? (room.name || "グループ") : profileDisplayName(state.currentPartner);
    el.chatTitle.textContent = name;
    if(room.suspended_at){ el.chatSubtitle.textContent = "このチャットは停止中です"; }else{ updateHeaderPresence(); }
    if(room.is_group){ el.chatAvatar.textContent = "👥"; }else{ setAvatar(el.chatAvatar,state.currentPartner); }
    await ensureMemberProfiles(room);
    el.app.classList.add("chat-open");

    const suspended = Boolean(room.suspended_at);
    setChatEnabled(!suspended);
    if(suspended){
        setStatus("このチャットルームは停止されているため、送信できません。","error");
    }else{
        setStatus("メッセージを読み込んでいます...","info");
    }

    renderRooms();
    subscribeToMessages();
    await loadMessages(false);
    markRead(); loadPartnerRead();
    setStatus(suspended ? "このチャットルームは停止中です。" : "チャットに接続しました。",suspended ? "error" : "success");
    el.messageInput.focus();
}

async function loadMessages(showFeedback,quiet){
    if(!state.currentRoom || state.loadingMessages) return;
    state.loadingMessages = true;
    const requestedRoomId = state.currentRoom.id;

    try{
        const result = await requireClient()
            .from(TABLES.messages)
            .select("id,room_id,sender_id,content,created_at,edited_at,expires_at,is_auto_reply")
            .eq("room_id",state.currentRoom.id)
            .order("created_at",{ascending:false})
            .limit(500);

        if(result.error) throw result.error;
        if(!state.currentRoom || state.currentRoom.id !== requestedRoomId) return;
        const loaded = (result.data || []).slice().reverse();
        const loadedIds = new Set(loaded.map((m) => m.id));
        const newest = loaded.length ? new Date(loaded[loaded.length - 1].created_at).getTime() : 0;
        const arrived = state.messages.filter((m) => !loadedIds.has(m.id) && new Date(m.created_at).getTime() > newest);
        state.messages = loaded.concat(arrived);
        await loadPending(requestedRoomId);
        if(!state.currentRoom || state.currentRoom.id !== requestedRoomId) return;
        renderMessages(!quiet, !!quiet);   // 自動の更新（quiet）で、変化がなければ作り直さない
        if(showFeedback) showToast("メッセージを更新しました。");
    }catch(error){
        console.error("Message loading error:",error);
        setStatus(getErrorMessage(error),"error");
    }finally{
        state.loadingMessages = false;
    }
}

let msgSubRetry = 0;
function subscribeToMessages(){
    if(!state.currentRoom) return;

    const roomId = state.currentRoom.id;
    state.subscription = requireClient()
        .channel("are-messages-" + roomId)
        .on("postgres_changes",{
            event:"INSERT",
            schema:"public",
            table:TABLES.messages,
            filter:"room_id=eq." + roomId
        },(payload) => {
            if(!payload.new) return;
            const exists = state.messages.some((message) => message.id === payload.new.id);
            if(!exists){
                state.messages.push(payload.new);
                state.messages.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                renderMessages(true);
                markRead();
            }
        })
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:TABLES.messages,filter:"room_id=eq." + roomId},(payload) => {
            if(!payload.new || feat.editingId !== null) return;
            const index = state.messages.findIndex((message) => message.id === payload.new.id);
            if(index >= 0 && !payload.new.deleted_at){ state.messages[index] = {...state.messages[index],...payload.new}; renderMessages(false); }
        })
        .subscribe((status) => {
            // つながったら：取りこぼしがないよう、念のため最新をいちど静かに読みこみなおす
            if(status === "SUBSCRIBED"){
                msgSubRetry = 0;
                if(state.currentRoom && state.currentRoom.id === roomId) loadMessages(false,true);
                return;
            }
            // 切れた・つながらなかった：すぐに自前でつなぎ直す（supabase-jsの自動再試行だけだと、へやの中身が
            // ずっと最新にならないことがあるため。8秒ごとの自動更新(pollRoom)だけに たよらない）
            if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
                console.warn("Realtime subscription status:",status);
                if(!state.currentRoom || state.currentRoom.id !== roomId) return;
                msgSubRetry++;
                const wait = Math.min(1000 * Math.pow(2,Math.min(msgSubRetry,5)),20000);
                setTimeout(() => {
                    if(!state.currentRoom || state.currentRoom.id !== roomId) return;
                    cleanupSubscription();
                    subscribeToMessages();
                },wait);
            }
        });
}

function cleanupSubscription(){
    if(state.subscription && state.client){
        state.client.removeChannel(state.subscription);
        state.subscription = null;
    }
}

function parseMessageContent(content){
    if(typeof content !== "string") return {type:"text",text:String(content ?? "")};
    try{
        const parsed = JSON.parse(content);
        if(parsed && typeof parsed === "object" && ["text","image","file","video","audio","poll","location","game","board","contact","live","itin"].includes(parsed.type)){
            return parsed;
        }
    }catch(_error){}
    return {type:"text",text:content};
}

function renderMessageContent(content){
    const item = parseMessageContent(content);

    if(item.type === "text"){
        const escaped = escapeHtml(item.text || "");
        const html = (window.AREText && typeof window.AREText.format === "function") ? window.AREText.format(escaped,item) : escaped;
        return '<div class="bubble' + (item.stamp ? ' stamp' : '') + '">' + html + '</div>';
    }
    if(item.type === "poll"){
        return '<div class="bubble">📊 <b>アンケート</b><br>' + escapeHtml(item.question || "") + '<br><button type="button" class="button-secondary" data-openpoll="' + escapeHtml(item.pollId || "") + '">回答・結果を見る</button></div>';
    }

    if(item.type === "game"){
        return typeof renderGameBubble === "function" ? renderGameBubble(item) : '<div class="bubble">🎮 対戦</div>';
    }
    if(item.type === "board" || item.type === "contact" || item.type === "live" || item.type === "itin"){
        return typeof renderExtraBubble === "function" ? renderExtraBubble(item) : '<div class="bubble">（この版では表示できません）</div>';
    }
    if(item.type === "location"){
        return typeof renderLocationBubble === "function" ? renderLocationBubble(item) : '<div class="bubble">📍 位置情報</div>';
    }

    // 30日たって、運営の保管場所（Google ドライブ）に移したファイル：URL も保存先のパスも無いので、案内のカードだけ出す
    if(item.archived && (item.type === "file" || item.type === "image" || item.type === "video" || item.type === "audio")){
        return '<div class="bubble"><div class="attachment"><div class="file-card archived"><span class="file-icon">🗂</span><span><span class="file-name">' + escapeHtml(item.name || "添付ファイル") + '</span><div class="file-meta">30日たったので、チャットからは消えました。運営の保管場所（Google ドライブ）に移しています。</div></span></div></div></div>';
    }

    const url = item.url || "";
    const name = item.name || "添付ファイル";
    const dataPath = item.path ? ' data-path="' + escapeHtml(String(item.path)) + '"' : "";
    const safeUrl = escapeHtml(safeHttpUrl(url));
    if(!safeUrl){
        return '<div class="bubble">' + escapeHtml(name) + '（添付ファイルのURLが不正なため表示できません）</div>';
    }
    const safeName = escapeHtml(name);
    const size = item.size ? '<div class="file-meta">' + escapeHtml(formatBytes(Number(item.size))) + '</div>' : "";

    if(item.type === "audio"){
        return '<div class="bubble"><div class="attachment">🎤 ボイスメッセージ<audio controls preload="metadata"' + dataPath + ' src="' + safeUrl + '"></audio>' + size + '</div></div>';
    }

    if(item.type === "image"){
        return '<div class="bubble' + (item.stamp ? ' stamp-img' : '') + '"><div class="attachment"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer"' + dataPath + '><img' + dataPath + ' src="' + safeUrl + '" alt="' + safeName + '" loading="lazy"></a><div class="file-meta">' + safeName + '</div></div></div>';
    }

    if(item.type === "video"){
        return '<div class="bubble"><div class="attachment"><video controls preload="metadata"' + dataPath + ' src="' + safeUrl + '"></video><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer"' + dataPath + '>' + safeName + '</a>' + size + '</div></div>';
    }

    return '<div class="bubble"><div class="attachment"><a class="file-card" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" download="' + safeName + '"' + dataPath + '><span class="file-icon">📄</span><span><span class="file-name">' + safeName + '</span>' + size + '</span></a></div></div>';
}

function mediaBusyInMessages(){
    try{
        const fs = document.fullscreenElement || document.webkitFullscreenElement;
        if(fs && (el.messages.contains(fs) || fs.tagName === "VIDEO")) return true;
        return Array.prototype.some.call(el.messages.querySelectorAll("video,audio"), (m) => (!m.paused && !m.ended) || m.webkitDisplayingFullscreen);
    }catch(_e){ return false; }
}

function flushDeferredRender(){
    if(!state.renderPending) return;
    setTimeout(() => {
        if(!state.renderPending || mediaBusyInMessages()) return;
        const p = state.renderPending; state.renderPending = null;
        renderMessages(p.scroll);
    }, 400);
}

function renderMessages(scrollToBottom, onlyIfChanged){
    const nowMs = Date.now();
    state.messages = state.messages.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > nowMs);
    if(!state.messages.length){
        el.messages.innerHTML = '<div class="welcome"><div class="welcome-icon">✉️</div><h2>最初のメッセージを送ろう</h2><div>メッセージやファイルを送信すると、ここに表示されます。</div></div>';
        return;
    }

    // 動画・音声を再生中／全画面で見ているあいだは、一覧を作り直さない（作り直すと、再生が止まって全画面も解除されるため）。
    // 終わったら（止めた・全画面を閉じた）、ためておいた分をまとめて描く。
    if(mediaBusyInMessages()){
        state.renderPending = {scroll:!!scrollToBottom || !!(state.renderPending && state.renderPending.scroll)};
        return;
    }
    state.renderPending = null;

    const prevTop = el.messages.scrollTop;
    const stick = scrollToBottom || (el.messages.scrollHeight - prevTop - el.messages.clientHeight < 80);
    const readAt = feat.partnerReadAt ? new Date(feat.partnerReadAt).getTime() : 0;

    const html = state.messages.map((message, msgIdx) => {
        const own = message.sender_id === state.user.id;
        const profile = own ? state.profile : (feat.known.get(message.sender_id) || state.currentPartner);
        const name = own ? "あなた" : profileDisplayName(profile);
        const avatarUrl = profile?.avatar_url || profile?.avatarUrl || "";
        const avatar = avatarUrl
            ? '<div class="message-avatar"><img src="' + escapeHtml(safeHttpUrl(avatarUrl)) + '" alt=""></div>'
            : '<div class="message-avatar">' + escapeHtml(shortName(name)) + '</div>';
        const id = escapeHtml(message.id);
        const item = parseMessageContent(message.content);
        const editing = own && feat.editingId === message.id;

        const body = editing
            ? '<div class="bubble edit"><textarea class="edit-box" maxlength="8000">' + escapeHtml(item.text || "") + '</textarea><div class="edit-actions"><button type="button" class="button-secondary" data-act="cancel-edit" data-id="' + id + '">キャンセル</button><button type="button" class="button" data-act="save-edit" data-id="' + id + '">保存</button></div></div>'
            : renderMessageContent(message.content);

        let meta = escapeHtml(formatDate(message.created_at));
        if(message.edited_at) meta += " ・編集済み";
        if(message.is_auto_reply) meta += " ・自動応答";
        if(own){
            const created = new Date(message.created_at).getTime();
            const readers = feat.readTimes.filter((t) => t >= created).length;
            meta += readers > 0 ? (state.currentRoom?.is_group ? " ・既読 " + readers : " ・既読") : " ・送信済み";
        }

        let actions = "";
        if(!editing && (own || feat.isAdmin)){
            actions = '<div class="message-actions">' +
                (own ? (item.type === "text" ? '<button type="button" data-act="edit" data-id="' + id + '">編集</button>' : '') + (feat.pending.has(message.id) ? '<span class="pending">削除申請中（管理者の承認待ち）</span>' : '<button type="button" data-act="del" data-id="' + id + '">削除申請</button>') : '') +
                (feat.isAdmin ? '<button type="button" class="admin-message-delete" data-act="admin-del" data-id="' + id + '">管理者として削除</button>' : '') +
                '</div>';
        }

        const sep = (msgIdx === 0 || msgDayKey(state.messages[msgIdx - 1].created_at) !== msgDayKey(message.created_at)) ? dateSeparator(message.created_at) : "";
        return sep + '<article class="message-row' + (own ? ' own' : '') + '" data-mid="' + id + '">' +
            avatar +
            '<div class="message-body"><div class="message-sender">' + escapeHtml(name) + '</div>' +
            body + '<div class="message-time">' + meta + '</div>' + actions + '</div></article>';
    }).join("");

    // 8秒ごとの自動更新などで、中身が前とまったく同じなら、作り直さない。
    // （作り直すと、メッセージ全体が一瞬消えて また出るので、画面がチカチカ点滅して 目が疲れるため）
    if(onlyIfChanged && el.messages.__lastHtml === html && el.messages.__lastFirst && el.messages.__lastFirst === el.messages.firstElementChild) return;

    el.messages.innerHTML = html;
    if(typeof afterRenderMessages === "function") afterRenderMessages();
    el.messages.__lastHtml = html; el.messages.__lastFirst = el.messages.firstElementChild;
    el.messages.scrollTop = stick ? el.messages.scrollHeight : prevTop;
}

async function sendTextMessage(){
    if(!state.currentRoom || state.sending) return;

    const text = el.messageInput.value;
    if(!text.trim()){
        showToast("メッセージを入力してください。");
        return;
    }

    if(Array.from(text).length > MAX_TEXT_LENGTH){
        showToast("メッセージは4,000文字以内で入力してください。");
        return;
    }

    await sendMessagePayload(buildTextPayload(text));
}

async function sendMessagePayload(payload,options){
    if(!state.currentRoom || state.sending) return;

    state.sending = true;
    el.sendButton.disabled = true;

    try{
        const client = requireClient();
        const content = JSON.stringify(payload);
        const result = await sendRpcContent(state.currentRoom.id,content);

        if(result.error) throw result.error;

        if(payload.type === "text" && !(options && options.keepInput)){
            el.messageInput.value = "";
            updateCharCount();
        }
        if(typeof afterPayloadSent === "function") afterPayloadSent(payload);

        await loadMessages(false);
    }catch(error){
        console.error("Send message error:",error);
        setStatus(typeof featError === "function" ? featError(error) : getErrorMessage(error),"error");
    }finally{
        state.sending = false;
        updateCharCount();
    }
}

async function handleFiles(fileList,kind){
    const files = Array.from(fileList || []);
    if(!files.length) return;

    if(!state.currentRoom){
        showToast("先にチャット相手を選択してください。");
        clearFileInputs();
        return;
    }

    if(kind === "image" && files.length > MAX_IMAGES){
        showToast("画像は一度に最大10枚まで選択できます。");
        clearFileInputs();
        return;
    }

    if(kind === "video" && files.length > MAX_VIDEOS_AT_ONCE){
        showToast("動画は一度に最大" + MAX_VIDEOS_AT_ONCE + "本まで選べます。");
        clearFileInputs();
        return;
    }

    if(kind === "image" && files.some((file) => !file.type.startsWith("image/"))){
        showToast("画像ファイルを選択してください。");
        clearFileInputs();
        return;
    }

    if(kind === "video" && files.some((file) => !file.type.startsWith("video/"))){
        showToast("動画ファイルを選択してください。");
        clearFileInputs();
        return;
    }

    if(kind === "file"){
        const rejected = files.filter((file) => fileRejectReason(file));
        if(rejected.length){
            showToast("送れないファイルがあります：" + rejected.map((f) => f.name + "（" + fileRejectReason(f) + "）").join("、") + "　送れる種類は、ヘルプの「送れるファイルの種類」で見られます。");
            clearFileInputs();
            return;
        }
    }

    if(kind === "image" && files.some((file) => file.type === "image/svg+xml")){
        showToast("SVG画像は安全上の理由で送信できません。");
        clearFileInputs();
        return;
    }

    // 📎で、写真や動画も いっしょに選んだとき：種類ごとに、いつもの送り方で 順番に送る（写真 → 動画 → ファイル）
    if(kind === "file" && typeof qsKind === "function"){
        const kinds = files.map((file) => qsKind(file) || "file");
        if(kinds.some((k) => k !== "file")){
            const of = (k) => files.filter((file, i) => kinds[i] === k);
            const imgs = of("image"), vids = of("video"), docs = of("file");
            if(imgs.length > MAX_IMAGES){ showToast("写真は一度に最大" + MAX_IMAGES + "枚までです。分けて選んでください。"); clearFileInputs(); return; }
            if(vids.length > MAX_VIDEOS_AT_ONCE){ showToast("動画は一度に最大" + MAX_VIDEOS_AT_ONCE + "本までです。分けて選んでください。"); clearFileInputs(); return; }
            clearFileInputs();   // 先に空にしても、選んだファイルは files に残っている
            showToast(files.length + "個を 順番に送ります（写真 → 動画 → ファイルの順）。");
            if(imgs.length) await handleFiles(imgs,"image");
            for(const v of vids) await handleFiles([v],"video");
            if(docs.length) await handleFiles(docs,"file");
            return;
        }
    }

    const tooBigVideos = [];   // 大きすぎて送れない動画（あとで「リンクで送る」画面を出す）
    const fixedNotes = [];     // 文字化けを直して送ったファイル（あとで画面にお知らせする）
    for(const file of files){
        let uploadFile = file;
        if(kind === "file"){
            const fixed = await fixTextEncoding(file);   // txt などの文字コードを調べ、Shift_JIS などなら UTF-8 に直す（textenc.js）
            if(fixed.changed){ uploadFile = fixed.file; fixedNotes.push({name:file.name, from:fixed.from}); }
        }
        if(kind === "image"){
            uploadFile = await compressChatImage(file);
            el.attachmentStatus.textContent = uploadFile === file
                ? file.name + " ・ " + formatAttachmentSize(file.size)
                : file.name + " ・ " + formatAttachmentSize(file.size) + " → " + formatAttachmentSize(uploadFile.size);
        }
        if(kind === "video"){
            if(file.size > MAX_VIDEO_BYTES){
                tooBigVideos.push({file, reason:"size"});
                continue;
            }

            try{
                const duration = await getVideoDuration(file);
                if(duration > MAX_VIDEO_SECONDS){
                    tooBigVideos.push({file, reason:"long"});
                    continue;
                }
            }catch(error){
                showToast(file.name + " の動画時間を確認できませんでした。");
                continue;
            }
        }else if(uploadFile.size > MAX_FILE_BYTES){
            // 50MBをこえるファイルも、動画と同じように ドライブに置いて リンクで送る
            if(typeof openVideoLinkSheet === "function") tooBigVideos.push({file:uploadFile, reason:"size", kind:"file"});
            else showToast(file.name + " は" + formatAttachmentSize(MAX_FILE_BYTES) + "を超えているため送信できません。");
            continue;
        }

        await uploadAndSend(uploadFile,kind,file.size, files.length > 1 ? (files.indexOf(file) + 1) + " / " + files.length + " 本目" : "");
    }

    clearFileInputs();
    if(fixedNotes.length){
        showToast(fixedNotes.length === 1
            ? "「" + fixedNotes[0].name + "」の文字コードは " + fixedNotes[0].from.replace(" → UTF-8 に直して表示","") + " でした。文字化けしないよう UTF-8 に直して送りました。"
            : "文字化けしないよう UTF-8 に直して送りました：" + fixedNotes.map((n) => n.name + "（" + n.from.replace(" → UTF-8 に直して表示","") + "）").join("、"));
    }
    if(tooBigVideos.length && typeof openVideoLinkSheet === "function") openVideoLinkSheet(null, "", tooBigVideos);
}

function clearFileInputs(){
    el.imageInput.value = "";
    el.fileInput.value = "";
    el.videoInput.value = "";
    el.attachmentStatus.textContent = "";
}

function getVideoDuration(file){
    return new Promise((resolve,reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(file);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration = video.duration;
            URL.revokeObjectURL(objectUrl);
            resolve(duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("動画メタデータを読み込めません。"));
        };
        video.src = objectUrl;
    });
}

async function uploadAndSend(file,kind,originalBytes,nthLabel){
    const sizeLabel = formatAttachmentSize(file.size) + (originalBytes !== undefined && originalBytes !== file.size ? "（元 " + formatAttachmentSize(originalBytes) + "）" : "");
    const nthPrefix = nthLabel ? "[" + nthLabel + "] " : "";
    el.attachmentStatus.textContent = nthPrefix + file.name + " ・ " + sizeLabel + " ・ アップロード中...";
    el.app.classList.add("loading");

    try{
        const client = requireClient();
        // Storageのキーは英数字のみ（日本語などを含むと "Invalid key" になる）。表示名はメッセージ側に保持する。
        const ext = fileExt(file);
        const objectPath = state.currentRoom.id + "/" + state.user.id + "/" + crypto.randomUUID() + (ext ? "." + ext : "");

        // 動画は、進み具合と「あと何秒」を表示しながらアップロードする（chat-videolink.js）。ほかは今までどおり。
        // supabase-js は、ファイルをそのまま渡すと「ファイルの種類」をブラウザ任せにするため、.md や .json などが空の種類で断られることがある。
        // そこで、拡張子から決めた種類つきの Blob にして渡す（中身は同じ。コピーはしない）。
        // 中身が UTF-8 と確かめた文字のファイルは、「文字コードは UTF-8」と保存先に伝える（ブラウザが Shift_JIS と読み違えて文字化けするのを防ぐ）
        const baseMime = resolveMime(file);
        const sendMime = baseMime.indexOf("text/") === 0 && textUtf8Files.has(file) ? baseMime + ";charset=utf-8" : baseMime;
        const sendBody = file.type === sendMime ? file : file.slice(0,file.size,sendMime);
        const plainUpload = () => client.storage.from(STORAGE_BUCKET).upload(objectPath,sendBody,{
            cacheControl:"3600",
            contentType:sendMime,
            upsert:false
        });
        if(file.size >= 5 * 1024 * 1024 && typeof freshAccessToken === "function") await freshAccessToken(client);   // 大きいファイルは、送っている間にログインの期限が切れないよう、先に更新しておく
        let uploadResult;
        if(kind === "video" && typeof uploadVideoWithProgress === "function"){
            uploadResult = await uploadVideoWithProgress(client,objectPath,file,resolveMime(file),(text) => { el.attachmentStatus.textContent = nthPrefix + file.name + " ・ " + sizeLabel + " ・ " + text; });
            // 進み具合つきの送り方でうまくいかなかった（容量エラー以外）ときは、今までの送り方でもう一度試す
            if(uploadResult.error && !(typeof videoLinkErrorIsSize === "function" && videoLinkErrorIsSize(uploadResult.error))) uploadResult = await plainUpload();
        }else{
            uploadResult = await plainUpload();
        }

        if(uploadResult.error) throw uploadResult.error;

        const signedResult = await client.storage.from(STORAGE_BUCKET).createSignedUrl(objectPath,60 * 60 * 24 * 7);
        if(signedResult.error) throw signedResult.error;

        let payload = {
            type:kind,
            name:String(file.name || "attachment").slice(0,120),
            url:signedResult.data.signedUrl,
            path:objectPath,
            mimeType:resolveMime(file),
            size:file.size
        };
        if(feat.pendingStamp && kind === "image") payload.stamp = true;
        if(feat.pendingGame && kind === "image") payload = Object.assign({}, feat.pendingGame, {type:"game", name:payload.name, url:payload.url, path:payload.path, size:payload.size});

        await sendMessagePayload(payload);
    }catch(error){
        console.error("Attachment upload error:",error);
        if(kind === "video" && typeof openVideoLinkSheet === "function" && typeof videoLinkErrorIsSize === "function" && videoLinkErrorIsSize(error)){
            openVideoLinkSheet(file, "upload");
        }else{
            setStatus(getErrorMessage(error),"error");
        }
    }finally{
        el.app.classList.remove("loading");
        el.attachmentStatus.textContent = "";
    }
}

async function logout(){
    const logoutMsg = (window.AREAuth && window.AREAuth.logoutConfirmText) ? await window.AREAuth.logoutConfirmText() : "ログアウトしますか？";
    if(!confirm(logoutMsg)) return;

    setBusy(el.logoutButton,true,"ログアウト中...");
    try{
        feat.timers.forEach(clearInterval);
        try{ await requireClient().rpc("set_my_presence",{p_status:"offline"}); }catch(_e){}
        cleanupSubscription();
        if(state.authSubscription){
            state.authSubscription.unsubscribe();
            state.authSubscription = null;
        }
        await window.AREAuth.logout({deleteGuest:true});
        redirectToIndex();
    }catch(error){
        console.error("Logout error:",error);
        setStatus(getErrorMessage(error),"error");
        setBusy(el.logoutButton,false);
    }
}

// ===== 追加機能：在席状況 / 既読 / 編集・削除申請 / 予約送信 / 管理者パネル =====
