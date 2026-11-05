"use strict";
// ===== アルバム（いま開いているチャットの写真一覧）と、期限切れ画像の自動再取得 =====

feat.album = {items:[]};

function initAlbum(){
    registerTool("album", onAlbumAction);
    // 添付のURLは7日で切れるので、読み込みに失敗したらパスから取り直す
    document.addEventListener("error", async (event) => {
        const node = event.target;
        if(!node || !node.dataset || !node.dataset.path || node.dataset.retried) return;
        if(!["IMG", "AUDIO", "VIDEO"].includes(node.tagName)) return;
        node.dataset.retried = "1";
        try{
            const result = await requireClient().storage.from(STORAGE_BUCKET).createSignedUrl(node.dataset.path, 3600);
            if(result.data && result.data.signedUrl) node.src = result.data.signedUrl;
        }catch(_e){}
    }, true);
}

function openAlbumPicker(){
    const rooms = state.rooms || [];
    openSheet(toolHead("🖼️ アルバム", "どのチャットのアルバムを見ますか？") +
        (rooms.length ? '<div class="stack">' + rooms.map((r) => '<button type="button" class="admin-card more-item" data-t="album:pick" data-id="' + escapeHtml(r.id) + '">' + escapeHtml(roomTitle(r)) + '</button>').join("") + '</div>' : '<div class="empty-list">チャットがまだありません。</div>') + toolClose());
}

async function openAlbum(roomId){
    // チャットを開いていないときは、見たいチャットを選んでもらう
    const room = roomId ? (state.rooms || []).find((r) => r.id === roomId) : state.currentRoom;
    if(!room){ openAlbumPicker(); return; }
    let source;
    if(state.currentRoom && state.currentRoom.id === room.id) source = state.messages;
    else{
        openSheet(toolHead("🖼️ アルバム", "読み込み中...") + toolClose());
        const res = await requireClient().from(TABLES.messages).select("id,content,created_at,sender_id,deleted_at").eq("room_id", room.id).order("created_at", {ascending:false}).limit(300);
        if(res.error){ showToast("アルバムを読み込めませんでした。"); return; }
        source = res.data || [];
    }
    const entries = source.filter((m) => !m.deleted_at).map((m) => ({message:m, item:parseMessageContent(m.content)})).filter((x) => x.item.type === "image");
    openSheet(toolHead("🖼️ アルバム", escapeHtml(roomTitle(room)) + " の写真（" + entries.length + " 枚）") +
        '<div id="abBody"><div class="empty-list">読み込み中...</div></div>' + toolClose('<button type="button" class="button-secondary" data-t="album:choose">別のチャットを選ぶ</button>'));
    const client = requireClient();
    const paths = entries.map((x) => x.item.path).filter(Boolean);
    const fresh = new Map();
    if(paths.length){
        try{
            const signed = await client.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
            (signed.data || []).forEach((s) => { if(s.signedUrl) fresh.set(s.path, s.signedUrl); });
        }catch(_e){}
    }
    feat.album.items = entries.map((x) => ({
        url: safeHttpUrl(fresh.get(x.item.path) || x.item.url || ""), name: x.item.name || "画像",
        at: x.message.created_at, who: senderName(x.message)
    })).filter((x) => x.url).reverse();
    paintAlbum();
}

function paintAlbum(){
    const box = $("abBody");
    if(!box) return;
    const items = feat.album.items;
    box.innerHTML = items.length ? '<div class="ab-grid">' + items.map((x, i) =>
        '<button type="button" class="ab-thumb" data-t="album:view" data-i="' + i + '"><img src="' + escapeHtml(x.url) + '" alt="' + escapeHtml(x.name) + '" loading="lazy"></button>').join("") + '</div>'
        : '<div class="empty-list">このチャットには、まだ写真がありません。</div>';
}

function onAlbumAction(action, node){
    if(action === "pick"){ return openAlbum(node.dataset.id); }
    if(action === "choose"){ return openAlbumPicker(); }
    if(action === "view"){
        const x = feat.album.items[Number(node.dataset.i)];
        if(!x) return;
        $("abBody").innerHTML = '<img class="ab-big" src="' + escapeHtml(x.url) + '" alt="' + escapeHtml(x.name) + '">' +
            '<div class="meta">' + escapeHtml(x.who) + ' ・ ' + escapeHtml(new Date(x.at).toLocaleString("ja-JP")) + '</div>' +
            '<div class="row"><button type="button" class="button-secondary" data-t="album:back">← 一覧へ</button><a class="button" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener noreferrer" download="' + escapeHtml(x.name) + '" style="text-decoration:none">保存・開く</a></div>';
    }
    if(action === "back") paintAlbum();
}
