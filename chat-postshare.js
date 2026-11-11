"use strict";
// ===== 投稿の共有（リンク・端末の共有・チャットに送る）=====
// 各投稿に「🔗 共有」ボタンを付けます。リンクは chat.html?p=投稿ID。
// 開いた人がその投稿を見られるかどうかは、サーバー側の公開設定（全体公開／フォロワーのみ）で決まります。
// 「自分のみ」の投稿には共有ボタンを出しません。

feat.postShareId = "";

function initPostShare(){
    registerTool("pshare", onPostShareAction);
    el.postFeed.addEventListener("click", (event) => {
        const button = event.target.closest("[data-postshare]");
        if(!button) return;
        runTool(() => openPostShare(button.dataset.postshare));
    });
    openSharedPostFromUrl();
}

function postShareUrl(postId){
    return new URL("chat.html?p=" + encodeURIComponent(postId), location.href).href;
}

function postShareSummary(post){
    const body = String((post && post.body) || "").replace(/\s+/g, " ").trim();
    const chars = Array.from(body);
    return chars.length > 40 ? chars.slice(0, 40).join("") + "…" : body;
}

function openPostShare(postId){
    const post = feat.posts.find((p) => p.id === postId);
    if(!post){ showToast("投稿が見つかりません。一覧を更新してください。"); return; }
    if(post.visibility === "private"){ showToast("「自分のみ」の投稿は共有できません。"); return; }
    feat.postShareId = postId;
    const url = postShareUrl(postId);
    const note = post.visibility === "followers"
        ? "この投稿は「フォロワーのみ」です。リンクを開けるのは、あなたをフォローしている人だけです。"
        : "リンクを開くと、この投稿が表示されます（相手もログインが必要です）。";
    const rooms = (state.rooms || []).filter((room) => !room.suspended_at);
    openSheet(toolHead("🔗 投稿を共有", escapeHtml(note)) +
        '<div class="bubble" style="margin-top:8px">' + escapeHtml(postShareSummary(post) || (post.image_path ? "（写真の投稿）" : "")) + '</div>' +
        '<input id="psUrl" type="text" readonly value="' + escapeHtml(url) + '">' +
        '<div class="row"><button type="button" class="button-secondary" data-t="pshare:copy">リンクをコピー</button><button type="button" class="button-secondary" data-t="pshare:native">端末の共有</button></div>' +
        (rooms.length
            ? '<div class="meta" style="margin-top:8px">チャットに送る</div><div class="pick">' + rooms.map((room) => '<button type="button" class="button-secondary" data-t="pshare:room" data-ps-room="' + escapeHtml(room.id) + '">' + escapeHtml(roomTitle(room)) + '</button>').join("") + '</div>'
            : '<div class="meta" style="margin-top:8px">送れるチャットがありません。</div>') +
        toolClose());
}

async function onPostShareAction(action, node){
    if(action === "gotoposts"){ closeSheet(); setTab("posts"); loadPosts(true); return; }
    const postId = feat.postShareId;
    if(!postId) return;
    const url = postShareUrl(postId);
    const post = feat.posts.find((p) => p.id === postId);
    if(action === "copy"){
        try{ await navigator.clipboard.writeText(url); showToast("リンクをコピーしました。"); }
        catch(_e){ const input = $("psUrl"); if(input){ input.select(); showToast("リンクを選択しました。コピーしてください。"); } }
    }else if(action === "native"){
        if(navigator.share){ try{ await navigator.share({title:"AREの投稿", text:postShareSummary(post), url}); }catch(_e){} }
        else showToast("このブラウザには共有機能がありません。「リンクをコピー」を使ってください。");
    }else if(action === "room"){
        const roomId = node && node.dataset.psRoom;
        if(!roomId) return;
        node.disabled = true;
        try{
            const summary = postShareSummary(post);
            const text = "📷 投稿を共有します" + (summary ? "：" + summary : "") + "\n" + url;
            const result = await sendPayloadToRoom(roomId, buildTextPayload(text));
            if(result.error) throw result.error;
            feat.postShareId = "";
            closeSheet();
            showToast("チャットに送りました。");
            if(state.currentRoom && state.currentRoom.id === roomId) await loadMessages(false, true);
        }catch(error){ node.disabled = false; showToast(featError(error)); }
    }
}

async function openSharedPostFromUrl(){
    let id = "";
    try{ id = new URLSearchParams(location.search).get("p") || ""; }catch(_e){}
    if(!id){
        // ログインの前に開いた共有リンクを、ログイン後に開く（chat-base.js の redirectToIndex が覚えたもの・30分まで）
        try{
            const saved = JSON.parse(sessionStorage.getItem("are_pending_post") || "null");
            sessionStorage.removeItem("are_pending_post");
            if(saved && saved.id && Date.now() - Number(saved.t || 0) < 30 * 60 * 1000) id = String(saved.id);
        }catch(_e){}
    }
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
    try{ history.replaceState(null, "", location.pathname); }catch(_e){}
    const client = requireClient();
    const result = await client.from("posts").select("id,author_id,body,image_path,created_at,visibility").eq("id", id).maybeSingle();
    if(result.error || !result.data){ showToast("共有された投稿が見つかりませんでした（削除されたか、見られない設定です）。"); return; }
    const post = result.data;
    const profile = await client.from(TABLES.profiles).select("*").eq("id", post.author_id).maybeSingle();
    const author = (profile && profile.data) || {};
    if(author.id) feat.postProfiles.set(author.id, author);
    let img = "";
    if(post.image_path){
        const signed = await client.storage.from("post-images").createSignedUrl(post.image_path, 3600);
        if(signed && signed.data && signed.data.signedUrl) img = safeHttpUrl(signed.data.signedUrl);
    }
    openSheet(toolHead("🔗 共有された投稿", "") +
        '<article class="post" style="margin-top:8px"><div class="post-head">' + miniAvatar(author) +
        '<div><div class="post-name">' + escapeHtml(profileDisplayName(author)) + '</div><div class="post-time">' + escapeHtml(formatDateTime(post.created_at)) + '</div></div></div>' +
        (post.body ? '<div class="post-body">' + escapeHtml(post.body) + '</div>' : '') +
        (img ? '<a href="' + escapeHtml(img) + '" target="_blank" rel="noopener noreferrer"><img class="post-img" src="' + escapeHtml(img) + '" alt="投稿画像" loading="lazy"></a>' : '') +
        '</article>' +
        toolClose('<button type="button" class="button-secondary" data-t="pshare:gotoposts">投稿一覧を開く</button>'));
}
