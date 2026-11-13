"use strict";

feat.posts = []; feat.postProfiles = new Map(); feat.postImageFile = null; feat.postVideoFile = null; feat.postsLoadedAt = 0; feat.postReactions = new Map(); feat.postComments = new Map(); feat.commentProfiles = new Map(); feat.commentOpen = new Set();

async function loadPosts(reset){
    const client = requireClient();
    try{
        let query = client.from("posts").select("id,author_id,body,image_path,created_at,visibility").order("created_at",{ascending:false}).limit(20);
        if(el.postFilter.value === "following"){
            const mine = await client.from("follows").select("followee_id").eq("follower_id",state.user.id);
            query = query.in("author_id",(mine.data || []).map((row) => row.followee_id).concat(state.user.id));
        }
        if(!reset && feat.posts.length) query = query.lt("created_at",feat.posts[feat.posts.length - 1].created_at);
        const result = await query;
        if(result.error) throw result.error;
        const rows = result.data || [];
        feat.posts = reset ? rows : feat.posts.concat(rows);
        el.postMore.hidden = rows.length < 20;
        const need = [...new Set(rows.map((r) => r.author_id))].filter((id) => !feat.postProfiles.has(id) || reset);
        if(need.length){
            const profiles = await client.from(TABLES.profiles).select("*").in("id",need);
            (profiles.data || []).forEach((p) => feat.postProfiles.set(p.id,p));
        }
        await loadPostSocialState(feat.posts);
        const paths = rows.map((r) => r.image_path).filter(Boolean);
        if(paths.length){
            const signed = await client.storage.from("post-images").createSignedUrls(paths,3600);
            (signed.data || []).forEach((s) => { if(s.signedUrl) feat.signed.set(s.path,s.signedUrl); });
        }
        feat.postsLoadedAt = Date.now();
        renderPosts();
    }catch(error){ el.postFeed.innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

async function loadPostSocialState(posts){
    const ids = [...new Set(posts.map((post) => post.id))];
    if(!ids.length) return;
    const client = requireClient();
    const [reactions,comments] = await Promise.all([
        client.from("post_reactions").select("post_id,user_id,reaction").in("post_id",ids),
        client.from("post_comments").select("id,post_id,author_id,body,created_at").in("post_id",ids).order("created_at",{ascending:false}).limit(300)
    ]);
    if(reactions.error) throw reactions.error;
    if(comments.error) throw comments.error;
    feat.postReactions = new Map(); feat.postComments = new Map();
    for(const row of reactions.data || []){
        if(!feat.postReactions.has(row.post_id)) feat.postReactions.set(row.post_id,{counts:{},mine:""});
        const item = feat.postReactions.get(row.post_id); item.counts[row.reaction] = (item.counts[row.reaction] || 0) + 1;
        if(row.user_id === state.user.id) item.mine = row.reaction;
    }
    const commentRows = comments.data || [];
    for(const row of commentRows){ if(!feat.postComments.has(row.post_id)) feat.postComments.set(row.post_id,[]); feat.postComments.get(row.post_id).push(row); }
    const idsNeeded = [...new Set(commentRows.map((row) => row.author_id))].filter((id) => !feat.commentProfiles.has(id));
    if(idsNeeded.length){ const profiles = await client.from(TABLES.profiles).select("id,display_name,avatar_url").in("id",idsNeeded); (profiles.data || []).forEach((profile) => feat.commentProfiles.set(profile.id,profile)); }
}

feat.signed = new Map();

function renderPosts(){
    if(!feat.posts.length){ el.postFeed.innerHTML = '<div class="empty-list">まだ投稿がありません。最初の投稿をしてみましょう。</div>'; return; }
    el.postFeed.innerHTML = feat.posts.map((post) => {
        const author = feat.postProfiles.get(post.author_id) || {};
        const own = post.author_id === state.user.id;
        const img = post.image_path ? safeHttpUrl(feat.signed.get(post.image_path) || "") : "";
        const social = feat.postReactions.get(post.id) || {counts:{},mine:""};
        const comments = feat.postComments.get(post.id) || [];
        const visibleComments = comments.slice(0,3);
        const visibility = {public:"🌐 全体公開",followers:"👥 フォロワーのみ",private:"🔒 自分のみ"}[post.visibility] || "🌐 全体公開";
        return '<article class="post"><div class="post-head">' + miniAvatar(author) +
            '<div><button class="post-name" type="button" data-author="' + escapeHtml(post.author_id) + '">' + escapeHtml(profileDisplayName(author)) + '</button><div class="post-time">' + escapeHtml(formatDateTime(post.created_at)) + (own ? ' ・' + visibility : '') + '</div></div></div>' +
            (post.body ? '<div class="post-body">' + linkifyPostBody(post.body) + '</div>' : '') +
            (img ? (isPostPdfPath(post.image_path) ? '<a class="post-pdf" href="' + escapeHtml(img) + '" target="_blank" rel="noopener noreferrer">📄 <b>' + escapeHtml(postPdfName(post.image_path)) + '</b><span>PDFを開く</span></a>' : isPostVideoPath(post.image_path) ? '<video class="post-video" controls playsinline preload="metadata" src="' + escapeHtml(img) + '"></video>' : '<a href="' + escapeHtml(img) + '" target="_blank" rel="noopener noreferrer"><img class="post-img" src="' + escapeHtml(img) + '" alt="投稿画像" loading="lazy"></a>') : '') +
            '<div class="post-reactions">' + ["👍","❤️","😂","😮","😢","🎉"].map((emoji) => '<button type="button" class="post-reaction' + (social.mine === emoji ? ' on' : '') + '" data-reaction="' + emoji + '" data-post="' + escapeHtml(post.id) + '" aria-pressed="' + (social.mine === emoji) + '">' + emoji + '<span>' + (social.counts[emoji] || 0) + '</span></button>').join("") + '<button type="button" class="post-comment-toggle" data-comment-toggle="' + escapeHtml(post.id) + '">💬 ' + comments.length + '</button></div>' +
            (feat.commentOpen.has(post.id) ? '<div class="post-comments">' + visibleComments.map((comment) => '<div class="post-comment">' + miniAvatar(feat.commentProfiles.get(comment.author_id)) + '<div><button class="post-name" type="button" data-comment-author="' + escapeHtml(comment.author_id) + '">' + escapeHtml(profileDisplayName(feat.commentProfiles.get(comment.author_id))) + '</button> <span class="post-time">' + escapeHtml(formatDateTime(comment.created_at)) + '</span><div>' + escapeHtml(comment.body) + '</div></div>' + (comment.author_id === state.user.id ? '<button type="button" class="post-comment-delete" data-comment-delete="' + escapeHtml(comment.id) + '" aria-label="コメントを削除">×</button>' : '') + '</div>').join("") + (comments.length > 3 ? '<div class="meta">新しいコメント3件を表示しています</div>' : '') + '<div class="post-comment-compose"><textarea rows="2" maxlength="500" data-comment-input="' + escapeHtml(post.id) + '" placeholder="コメントを入力（500文字まで）"></textarea><button type="button" class="button-secondary" data-comment-post="' + escapeHtml(post.id) + '">送信</button></div></div>' : '') +
            '<div class="post-actions">' + (post.visibility !== "private" ? '<button type="button" data-postshare="' + escapeHtml(post.id) + '">🔗 共有</button>' : '') + (own ? '<button type="button" data-postdel="' + escapeHtml(post.id) + '">削除</button>' : (feat.isAdmin ? '<button type="button" data-postadmin="' + escapeHtml(post.id) + '">管理者として削除</button>' : '')) + '</div></article>';
    }).join("");
}

function isPostPdfPath(path){ return /\.pdf$/i.test(String(path || "")); }
function isPostPdfFile(file){ return !!file && (file.type === "application/pdf" || /\.pdf$/i.test(String(file.name || ""))); }
function postPdfName(path){
    const base = String(path || "").split("/").pop().replace(/\.pdf$/i,"");
    const m = base.match(/^[0-9a-f-]{36}-(.+)$/i);
    return (m ? m[1] : "PDF") + ".pdf";
}
function postPdfSafeName(file){
    return String(file.name || "").replace(/\.pdf$/i,"").normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,30) || "file";
}
function isPostVideoPath(path){ return /\.(mp4|m4v|mov|webm)$/i.test(String(path || "")); }

/** 投稿の文章の中の https:// を、押せるリンクにする（先に全体をエスケープしてから変換するので、HTMLは入りこめない） */
function linkifyPostBody(text){
    return escapeHtml(text).replace(/https:\/\/[^\s<>"']+/g,(raw) => {
        const trail = (raw.match(/[.,;:!?)\]、。）」]+$/) || [""])[0];
        const url = raw.slice(0,raw.length - trail.length);
        const safe = safeHttpUrl(url.replace(/&amp;/g,"&"));
        return safe ? '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + url + '</a>' + trail : raw;
    });
}

// 投稿の動画：50MB・5分までは そのまま投稿。大きすぎる／長すぎる／保存場所が容量でことわった動画は、リンクにして投稿する。
const POST_VIDEO_LIMIT_KEY = "are_post_video_limit";
function postVideoLimitBytes(){
    let learned = 0;
    try{ learned = Number(localStorage.getItem(POST_VIDEO_LIMIT_KEY)) || 0; }catch(_e){}
    return learned > 0 ? Math.min(MAX_VIDEO_BYTES,learned) : MAX_VIDEO_BYTES;
}
function rememberPostVideoRejected(bytes){
    try{ const cur = Number(localStorage.getItem(POST_VIDEO_LIMIT_KEY)) || Infinity; localStorage.setItem(POST_VIDEO_LIMIT_KEY,String(Math.min(cur,Math.max(1,bytes - 1)))); }catch(_e){}
}

function refreshPostAttachName(){
    el.postImageName.textContent = feat.postVideoFile ? (isPostPdfFile(feat.postVideoFile) ? "📄 " : "🎬 ") + feat.postVideoFile.name + "（" + formatAttachmentSize(feat.postVideoFile.size) + "）" : (feat.postImageFile ? feat.postImageFile.name : "");
}

// 保存場所（post-images）が動画の種類を受けつけない設定のとき：1時間のあいだは、アップロードを試さずに すぐリンク投稿にする
const POST_VIDEO_MIME_KEY = "are_post_video_mime_block";
function postVideoMimeBlocked(kind){ try{ return Date.now() - (Number(localStorage.getItem(POST_VIDEO_MIME_KEY + (kind === "pdf" ? "_pdf" : ""))) || 0) < 3600000; }catch(_e){ return false; } }
function postVideoErrorIsMime(error){ return /mime type|not supported|invalid_mime|unsupported/i.test(String((error && (error.message || error.error)) || error || "")); }

function clearPostAttachments(){
    el.postBody.value = ""; el.postImage.value = ""; el.postVideo.value = ""; feat.postImageFile = null; feat.postVideoFile = null; el.postImageName.textContent = "";
}

async function submitPost(extra, sendAtArg){
    const linkText = typeof extra === "string" ? extra : "";
    // 予約投稿：日時は「🕒 予約」から渡される。大きい動画をリンクにする途中の画面をはさんでも、日時を覚えておく。
    let sendAt = sendAtArg instanceof Date ? sendAtArg : (linkText ? feat.postSendAt || null : null);
    feat.postSendAt = sendAt;
    let body = el.postBody.value;
    if(linkText) body = (body.trim() ? body.replace(/\s+$/,"") + "\n" : "") + linkText;
    const video = linkText ? null : feat.postVideoFile;
    if(!body.trim() && !feat.postImageFile && !video){ showToast("投稿の内容か写真・動画を入力してください。"); return; }
    if(Array.from(body).length > 500){ showToast(linkText ? "文章とリンクをあわせて500文字以内にしてください。" : "投稿は500文字以内で入力してください。"); return; }
    el.postSubmit.disabled = true;
    const client = requireClient();
    let uploaded = null;
    try{
        if(video){
            if(video.size > postVideoLimitBytes()){ openPostVideoLinkSheet(video,"size"); return; }
            const isPdf = isPostPdfFile(video);
            if(postVideoMimeBlocked(isPdf ? "pdf" : "video")){ openPostVideoLinkSheet(video,"upload"); return; }
            if(!isPdf){
                let duration = 0;
                try{ duration = await getVideoDuration(video); }catch(_e){ showToast("この動画は読み込めませんでした。別の動画を選んでください。"); return; }
                if(duration > MAX_VIDEO_SECONDS){ openPostVideoLinkSheet(video,"long"); return; }
            }
            const ext = isPdf ? "pdf" : ((fileExt(video) || "mp4").replace(/[^a-z0-9]/gi,"").toLowerCase() || "mp4");
            const path = state.user.id + "/" + crypto.randomUUID() + (isPdf ? "-" + postPdfSafeName(video) : "") + "." + ext;
            const up = await uploadVideoWithProgress(client,path,video,isPdf ? "application/pdf" : resolveMime(video),(text) => { el.postImageName.textContent = "🎬 " + text; },"post-images");
            if(up.error){
                if(videoLinkErrorIsSize(up.error)){ rememberPostVideoRejected(video.size); openPostVideoLinkSheet(video,"upload"); return; }
                if(postVideoErrorIsMime(up.error)){ try{ localStorage.setItem(POST_VIDEO_MIME_KEY + (isPdf ? "_pdf" : ""),String(Date.now())); }catch(_e){} openPostVideoLinkSheet(video,"upload"); return; }
                throw up.error;
            }
            uploaded = path;
        }else if(feat.postImageFile){
            const blob = await resizeImage(feat.postImageFile,1280,0.85);
            uploaded = state.user.id + "/" + crypto.randomUUID() + ".jpg";
            const up = await client.storage.from("post-images").upload(uploaded,blob,{contentType:"image/jpeg",upsert:false});
            if(up.error) throw up.error;
        }
        const visibility = document.getElementById("postVisibility")?.value || "public";
        const result = sendAt
            ? await client.rpc("schedule_post",{p_body:body,p_image_path:uploaded,p_visibility:visibility,p_send_at:sendAt.toISOString()})
            : await client.rpc("create_post_with_visibility",{p_body:body,p_image_path:uploaded,p_visibility:visibility});
        if(result.error){
            // 保存場所は受けとったのに、投稿の登録でことわられた動画は、リンクで投稿するよう案内する
            if(video && uploaded){ client.storage.from("post-images").remove([uploaded]); uploaded = null; openPostVideoLinkSheet(video,"upload"); return; }
            throw result.error;
        }
        clearPostAttachments();
        feat.postSendAt = null;
        if(sendAt){ showToast(formatDateTime(sendAt.toISOString()) + " に投稿を予約しました。（「📋 予約中」で確認・取り消しできます）"); return; }
        showToast("投稿しました。");
        await loadPosts(true);
    }catch(error){
        if(uploaded) client.storage.from("post-images").remove([uploaded]);
        showToast(featError(error));
    }finally{ el.postSubmit.disabled = false; refreshPostAttachName(); }
}

/** 動画が大きすぎるとき：YouTube・ドライブなどに置いた動画の https:// リンクを、投稿の文章に入れて投稿する */
function openPostVideoLinkSheet(file,reason){
    const why = reason === "long" ? "5分をこえているため" : reason === "upload" ? "保存場所がいっぱい（またはこの種類を受けつけない）ため" : "大きすぎて（" + formatAttachmentSize(postVideoLimitBytes()) + "をこえるため）";
    const pdf = isPostPdfFile(file);
    openSheet(toolHead(pdf ? "📄 PDFをリンクで投稿" : "🎬 動画をリンクで投稿","「" + escapeHtml(String(file.name || (pdf ? "PDF" : "動画")).slice(0,60)) + "」は、" + why + "そのまま投稿できません。") +
        '<div class="meta">' + (pdf ? "Googleドライブ・OneDrive などにPDFを置いて" : "YouTube（限定公開）・Googleドライブ・OneDrive などに動画を置いて") + ', その <b>https:// のリンク</b> を貼ってください。投稿の文章のあとに、押して開けるリンクとして入ります。</div>' +
        '<label for="pvUrl">動画のリンク（https://）</label><input id="pvUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://…">' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">やめる</button><button type="button" class="button" data-t="pvlink:send">リンクで投稿する</button></div>');
    setTimeout(() => { const i = document.getElementById("pvUrl"); if(i) i.focus(); },50);
}

async function onPostVideoLinkAction(action){
    if(action !== "send") return;
    const raw = String((document.getElementById("pvUrl") || {}).value || "").trim();
    if(!raw){ showToast("動画のリンクを貼ってください。"); return; }
    const url = safeHttpUrl(raw);
    if(!url || !/^https:\/\//i.test(raw)){ showToast("https:// で始まるリンクを入れてください。"); return; }
    const name = feat.postVideoFile ? String(feat.postVideoFile.name || "").slice(0,40) : "";
    closeSheet();
    await submitPost((isPostPdfFile(feat.postVideoFile) ? "📄 PDF" : "🎬 動画") + (name ? "（" + name + "）" : "") + "\n" + url);
}

async function onFeedClick(event){
    const author = event.target.closest("[data-author]");
    if(author){ openProfileView(feat.postProfiles.get(author.dataset.author)); return; }
    const commentAuthor = event.target.closest("[data-comment-author]");
    if(commentAuthor){ const profile = feat.commentProfiles.get(commentAuthor.dataset.commentAuthor) || await requireClient().from(TABLES.profiles).select("*").eq("id",commentAuthor.dataset.commentAuthor).maybeSingle().then((result) => result.data); if(profile) openProfileView(profile); return; }
    const reaction = event.target.closest("[data-reaction]");
    if(reaction){
        const postId = reaction.dataset.post, emoji = reaction.dataset.reaction, current = feat.postReactions.get(postId)?.mine;
        reaction.disabled = true;
        try{
            const client = requireClient();
            const result = current === emoji ? await client.from("post_reactions").delete().eq("post_id",postId).eq("user_id",state.user.id) : await client.from("post_reactions").upsert({post_id:postId,user_id:state.user.id,reaction:emoji},{onConflict:"post_id,user_id"});
            if(result.error) throw result.error;
            await loadPostSocialState(feat.posts); renderPosts();
        }catch(error){ showToast(featError(error)); reaction.disabled = false; }
        return;
    }
    const commentToggle = event.target.closest("[data-comment-toggle]");
    if(commentToggle){ const id = commentToggle.dataset.commentToggle; feat.commentOpen.has(id) ? feat.commentOpen.delete(id) : feat.commentOpen.add(id); renderPosts(); return; }
    const commentSubmit = event.target.closest("[data-comment-post]");
    if(commentSubmit){
        const postId = commentSubmit.dataset.commentPost, input = el.postFeed.querySelector('[data-comment-input="' + postId + '"]'), body = (input?.value || "").trim();
        if(!body){ showToast("コメントを入力してください。"); return; }
        if(Array.from(body).length > 500){ showToast("コメントは500文字以内で入力してください。"); return; }
        commentSubmit.disabled = true;
        try{ const result = await requireClient().from("post_comments").insert({post_id:postId,author_id:state.user.id,body}); if(result.error) throw result.error; await loadPostSocialState(feat.posts); feat.commentOpen.add(postId); renderPosts(); }
        catch(error){ showToast(featError(error)); commentSubmit.disabled = false; }
        return;
    }
    const commentDelete = event.target.closest("[data-comment-delete]");
    if(commentDelete){
        try{ const result = await requireClient().from("post_comments").delete().eq("id",commentDelete.dataset.commentDelete); if(result.error) throw result.error; await loadPostSocialState(feat.posts); renderPosts(); }
        catch(error){ showToast(featError(error)); }
        return;
    }
    const del = event.target.closest("[data-postdel]");
    const adm = event.target.closest("[data-postadmin]");
    try{
        if(del){
            if(!window.confirm("この投稿を削除しますか？")) return;
            const result = await requireClient().rpc("delete_my_post",{p_post_id:del.dataset.postdel});
            if(result.error) throw result.error;
            if(result.data) requireClient().storage.from("post-images").remove([result.data]);
            await loadPosts(true);
        }else if(adm){
            const reason = window.prompt("管理者として投稿を削除します。理由を入力してください（記録されます）。","");
            if(reason === null) return;
            const result = await requireClient().rpc("admin_delete_post",{p_post_id:adm.dataset.postadmin,p_reason:reason});
            if(result.error) throw result.error;
            await loadPosts(true);
        }
    }catch(error){ showToast(featError(error)); }
}
