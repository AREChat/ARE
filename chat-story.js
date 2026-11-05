"use strict";
// ===== ストーリー（24時間で見られる投稿）とアーカイブ =====
// ・いまのストーリー：見られるのは「自分」と「自分がフォローしている人」だけ（サーバー側のルールで制限）。
// ・アーカイブ：公開終了後の7日間、自分だけが見られるアーカイブに残ります。端末保存が確認できた投稿は、その後サーバーから削除されます。
// ・会話履歴のZIP保存（chat-history.js）には、自分のストーリー（アーカイブ含む）も入ります。

const STORY_BG = {blue:"#2d4fd6", pink:"#d63d8a", green:"#1f9d6b", orange:"#e0802a", purple:"#7b47d6"};
const STORY_BG_NAMES = {blue:"青", pink:"ピンク", green:"緑", orange:"オレンジ", purple:"紫"};
const STORY_COLUMNS = "id,user_id,body,image_path,bg,created_at,expires_at";
const ARCHIVE_PAGE = 30;
feat.story = {file:null, bg:"blue", body:"", archiveFrom:0, archiveTotal:0, archiveRows:[], localUrls:new Map()};

function storyDbOpen(){
    return new Promise((resolve,reject) => {
        const request = indexedDB.open("are-story-archive-v1",1);
        request.onupgradeneeded = () => { const db = request.result; if(!db.objectStoreNames.contains("stories")){ const store = db.createObjectStore("stories",{keyPath:"id"}); store.createIndex("user_id","user_id",{unique:false}); } };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("端末の保存領域を開けませんでした。"));
    });
}

async function storyLocalPut(story){
    const db = await storyDbOpen();
    await new Promise((resolve,reject) => { const tx = db.transaction("stories","readwrite"); tx.objectStore("stories").put(story); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || new Error("端末への保存に失敗しました。")); });
    db.close();
    if(navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
}

async function storyLocalGet(id){
    const db = await storyDbOpen();
    const value = await new Promise((resolve,reject) => { const request = db.transaction("stories","readonly").objectStore("stories").get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
    db.close();
    return value;
}

async function storyLocalList(userId){
    const db = await storyDbOpen();
    const values = await new Promise((resolve,reject) => { const request = db.transaction("stories","readonly").objectStore("stories").index("user_id").getAll(userId); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
    db.close();
    return values;
}

async function storyLocalRemove(id){
    const db = await storyDbOpen();
    await new Promise((resolve,reject) => { const tx = db.transaction("stories","readwrite"); tx.objectStore("stories").delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    const oldUrl = feat.story.localUrls.get(id); if(oldUrl) URL.revokeObjectURL(oldUrl); feat.story.localUrls.delete(id);
}

async function storyAckLocal(id){
    const result = await requireClient().rpc("ack_story_local_save",{p_story_id:id});
    if(result.error) throw result.error;
}

async function storyCacheRemote(row){
    if(row.user_id !== state.user.id) return null;
    const existing = await storyLocalGet(row.id);
    if(existing){ await storyAckLocal(row.id); return existing; }
    let blob = null;
    if(row.image_path){
        const signedUrl = feat.signed.get(row.image_path);
        if(!signedUrl) throw new Error("ストーリー画像の保存リンクを取得できませんでした。");
        const response = await fetch(signedUrl);
        if(!response.ok) throw new Error("ストーリー画像を端末へ保存できませんでした。");
        blob = await response.blob();
    }
    const record = {id:row.id,user_id:row.user_id,body:row.body || "",bg:row.bg || "blue",created_at:row.created_at,expires_at:row.expires_at,blob,content_type:blob?.type || "",saved_at:new Date().toISOString()};
    await storyLocalPut(record);
    await storyAckLocal(row.id);
    return record;
}

function storyObjectUrl(record){
    if(!record?.blob) return "";
    if(!feat.story.localUrls.has(record.id)) feat.story.localUrls.set(record.id,URL.createObjectURL(record.blob));
    return feat.story.localUrls.get(record.id);
}

function initStory(){ registerTool("story", onStoryAction); }

function storyTabs(active){
    return '<div class="row" style="justify-content:flex-start"><button type="button" class="' + (active === "now" ? "button" : "button-secondary") + '" data-t="story:list">📖 いまのストーリー</button>' +
        '<button type="button" class="' + (active === "archive" ? "button" : "button-secondary") + '" data-t="story:archive">🗂️ アーカイブ</button></div>';
}

function openStory(){
    openSheet(toolHead("📖 ストーリー", "24時間公開した後、7日間アーカイブに残ります。画像と本文は端末にも自動保存します。") +
        storyTabs("now") +
        '<div class="row" style="justify-content:flex-start"><button type="button" class="button" data-t="story:new">＋ ストーリーを投稿</button></div>' +
        '<div id="stList" class="st-list"><div class="empty-list">読み込み中...</div></div>' + toolClose());
    return loadStories();
}

async function signStoryImages(rows){
    const paths = [...new Set(rows.map((r) => r.image_path).filter(Boolean))];
    if(!paths.length) return;
    for(let index = 0; index < paths.length; index += 100){
        const signed = await requireClient().storage.from("post-images").createSignedUrls(paths.slice(index,index + 100),3600);
        (signed.data || []).forEach((item) => { if(item.signedUrl) feat.signed.set(item.path,item.signedUrl); });
    }
}

async function loadStories(){
    const box = $("stList");
    if(!box) return;
    const client = requireClient();
    try{
        const result = await client.from("stories").select(STORY_COLUMNS)
            .gt("expires_at", new Date().toISOString()).order("created_at", {ascending:false}).limit(60);
        if(result.error) throw result.error;
        const rows = result.data || [];
        const ids = [...new Set(rows.map((r) => r.user_id))].filter((id) => id !== state.user.id && !feat.known.has(id));
        if(ids.length){
            const profiles = await client.from(TABLES.profiles).select("*").in("id", ids);
            (profiles.data || []).forEach((p) => feat.known.set(p.id, p));
        }
        await signStoryImages(rows);
        const ownRows = rows.filter((row) => row.user_id === state.user.id);
        for(const row of ownRows){
            try{ const saved = await storyCacheRemote(row); if(saved?.blob) row.localBlob = saved.blob; }
            catch(error){ console.warn("ストーリーの端末保存を再試行します。",error); }
        }
        if(!$("stList")) return;
        $("stList").innerHTML = rows.length ? rows.map((r) => storyCard(r, false)).join("") : '<div class="empty-list">表示できるストーリーはありません。ユーザーをフォローするか、自分で投稿してみましょう。</div>';
    }catch(error){ if($("stList")) $("stList").innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

function storyDate(value){
    const d = new Date(value);
    return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function storyCard(story, archived){
    const own = story.user_id === state.user.id;
    const name = own ? "あなた" : profileDisplayName(feat.known.get(story.user_id));
    const color = STORY_BG[story.bg] || STORY_BG.blue;
    const imageUrl = story.localBlob ? storyObjectUrl({id:story.id,blob:story.localBlob}) : story.image_path ? safeHttpUrl(feat.signed.get(story.image_path) || "") : "";
    let foot;
    if(archived){
        foot = '<span>' + escapeHtml(storyDate(story.created_at)) + ' に投稿' + (story.localOnly ? ' ・端末に保存済み' : '') + '</span><span class="st-actions"><button type="button" class="button-secondary" data-t="story:repost" data-id="' + escapeHtml(story.id) + '">もう一度投稿</button>' +
            '<button type="button" class="button-secondary" data-t="story:del" data-id="' + escapeHtml(story.id) + '" data-from="archive"' + (story.localOnly ? ' data-local-only="true"' : '') + '>削除</button></span>';
    }else{
        const left = Math.max(0, new Date(story.expires_at).getTime() - Date.now());
        const hours = Math.floor(left / 3600000), mins = Math.floor((left % 3600000) / 60000);
        foot = '<span>' + escapeHtml(name) + ' ・ あと' + hours + '時間' + mins + '分</span>' +
            (own ? '<button type="button" class="button-secondary" data-t="story:del" data-id="' + escapeHtml(story.id) + '">削除</button>' : "");
    }
    return '<div class="st-card" style="background:' + color + '" data-sid="' + escapeHtml(story.id) + '">' +
        (imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="ストーリーの写真" loading="lazy">' : "") +
        (story.body ? '<div class="st-body">' + escapeHtml(story.body) + '</div>' : "") +
        '<div class="st-foot">' + foot + '</div></div>';
}

// ----- アーカイブ -----

async function openStoryArchive(){
    feat.story.archiveFrom = 0;
    openSheet(toolHead("🗂️ ストーリーのアーカイブ", "公開終了から7日間はサーバーに保管し、その後は端末の保存領域に残します。端末保存が確認できると、サーバー上の画像と投稿は自動削除されます。") +
        storyTabs("archive") + '<div id="stArcCount" class="meta"></div><div id="stList" class="st-list"><div class="empty-list">読み込み中...</div></div><div id="stMore"></div>' + toolClose());
    return loadArchive(true);
}

async function loadArchive(first){
    try{
        const box = $("stList");
        if(!box) return;
        if(first){
            const client = requireClient(), now = Date.now(), cutoff = new Date(now - 7 * 86400000).toISOString();
            const result = await client.from("stories").select(STORY_COLUMNS,{count:"exact"}).eq("user_id",state.user.id).lte("expires_at",new Date(now).toISOString()).gt("expires_at",cutoff).order("created_at",{ascending:false}).range(0,999);
            if(result.error) throw result.error;
            const serverRows = result.data || [];
            await signStoryImages(serverRows);
            const localRows = await storyLocalList(state.user.id).catch(() => []);
            const serverIds = new Set(serverRows.map((row) => row.id));
            const merged = serverRows.slice();
            for(const local of localRows) if(!serverIds.has(local.id) && !merged.some((row) => row.id === local.id)) merged.push({id:local.id,user_id:local.user_id,body:local.body,bg:local.bg,created_at:local.created_at,expires_at:local.expires_at,localBlob:local.blob,localOnly:true});
            merged.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            feat.story.archiveRows = merged;
            feat.story.archiveTotal = merged.length;
            feat.story.archiveFrom = 0;
        }
        const from = feat.story.archiveFrom, rows = feat.story.archiveRows.slice(from,from + ARCHIVE_PAGE);
        const remotePage = rows.filter((row) => !row.localOnly);
        await signStoryImages(remotePage);
        for(const row of remotePage){
            try{ const saved = await storyCacheRemote(row); if(saved?.blob) row.localBlob = saved.blob; }
            catch(error){ console.warn("ストーリーの端末保存を再試行します。",error); }
        }
        const html = rows.map((row) => storyCard(row,true)).join("");
        if(first) box.innerHTML = html || '<div class="empty-list">アーカイブはまだありません。ストーリーは公開終了後7日間ここに残り、その後は端末に保存されます。</div>';
        else box.insertAdjacentHTML("beforeend",html);
        feat.story.archiveFrom = from + rows.length;
        if($("stArcCount")) $("stArcCount").textContent = "全 " + feat.story.archiveTotal + " 件";
        if($("stMore")) $("stMore").innerHTML = feat.story.archiveFrom < feat.story.archiveTotal ? '<div class="row"><button type="button" class="button-secondary" data-t="story:more">さらに読み込む</button></div>' : "";
    }catch(error){ if($("stList")) $("stList").innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

async function repostStory(button){
    const client = requireClient();
    button.disabled = true;
    let copied = null;
    try{
        const got = await client.from("stories").select(STORY_COLUMNS).eq("id",button.dataset.id).maybeSingle();
        if(got.error) throw got.error;
        const local = !got.data ? await storyLocalGet(button.dataset.id) : null;
        const story = got.data || local;
        if(!story) throw new Error("このストーリーは端末にもサーバーにも見つかりません。");
        if(local?.blob){
            copied = state.user.id + "/" + crypto.randomUUID() + ".jpg";
            const copy = await client.storage.from("post-images").upload(copied,local.blob,{contentType:local.content_type || "image/jpeg",upsert:false});
            if(copy.error){ copied = null; throw copy.error; }
        }else if(story.image_path){
            copied = state.user.id + "/" + crypto.randomUUID() + ".jpg";
            const copy = await client.storage.from("post-images").copy(story.image_path, copied);
            if(copy.error){ copied = null; throw copy.error; }
        }
        const result = await client.rpc("create_story",{p_body:story.body || null,p_image_path:copied,p_bg:story.bg || "blue"});
        if(result.error) throw result.error;
        const created = await client.from("stories").select(STORY_COLUMNS).eq("id",result.data).single();
        if(!created.error) await storyCacheRemote(created.data);
        showToast("ストーリーをもう一度投稿しました。");
        await openStory();
    }catch(error){
        if(copied) client.storage.from("post-images").remove([copied]);
        showToast(featError(error));
        button.disabled = false;
    }
}

// ----- 投稿 -----

function onStoryAction(action, node){
    if(action === "new") return storyCompose(false);
    if(action === "list") return openStory();
    if(action === "archive") return openStoryArchive();
    if(action === "more") return loadArchive(false);
    if(action === "repost") return repostStory(node);
    if(action === "bg"){ feat.story.bg = node.dataset.bg; document.querySelectorAll("[data-t='story:bg']").forEach((b) => b.classList.toggle("on", b === node)); return; }
    if(action === "photo"){
        feat.story.body = $("stBody") ? $("stBody").value : "";
        return openPhotoChooser({multiple:false, allowEdit:false, onFiles:(files) => { feat.story.file = files[0] || null; storyCompose(true); }});
    }
    if(action === "unphoto"){ feat.story.file = null; feat.story.body = $("stBody") ? $("stBody").value : ""; return storyCompose(true); }
    if(action === "user") return openUserStories(node.dataset.id);
    if(action === "prev") return userStoryStep(-1);
    if(action === "next") return userStoryStep(1);
    if(action === "post") return postStory(node);
    if(action === "del") return deleteStory(node);
}

function storyCompose(keep){
    if(!keep) feat.story = {file:null, bg:"blue", body:"", archiveFrom:0, archiveTotal:0, archiveRows:[], localUrls:new Map()};
    const s = feat.story;
    openSheet(toolHead("📖 ストーリーを投稿", "24時間公開され、その後7日間アーカイブに残ります。本文と写真は端末にも自動保存します。") +
        '<textarea id="stBody" rows="3" maxlength="200" placeholder="ひとこと（200文字まで）">' + escapeHtml(s.body || "") + '</textarea>' +
        '<div class="row" style="justify-content:flex-start">' + Object.keys(STORY_BG).map((key) =>
            '<button type="button" class="st-dot' + (key === s.bg ? " on" : "") + '" data-t="story:bg" data-bg="' + key + '" style="background:' + STORY_BG[key] + '" aria-label="' + STORY_BG_NAMES[key] + '"></button>').join("") + '</div>' +
        '<div class="row" style="justify-content:flex-start;align-items:center"><button type="button" class="tool-button" data-t="story:photo">📷 写真を付ける</button>' +
        (s.file ? '<span class="meta">' + escapeHtml(s.file.name) + '</span><button type="button" class="button-secondary" data-t="story:unphoto">外す</button>' : "") + '</div>' +
        '<div class="row"><button type="button" class="button-secondary" data-t="story:list">キャンセル</button><button type="button" class="button" data-t="story:post">投稿する</button></div>');
}

async function postStory(button){
    const body = ($("stBody") ? $("stBody").value : "").trim();
    const file = feat.story.file;
    if(!body && !file){ showToast("ひとこと、または写真を入力してください。"); return; }
    if(Array.from(body).length > 200){ showToast("ひとことは200文字以内です。"); return; }
    button.disabled = true;
    const client = requireClient();
    let uploaded = null, localBlob = null, postedId = null;
    try{
        if(file){
            const blob = await resizeImage(file,1080,0.85); localBlob = blob;
            uploaded = state.user.id + "/" + crypto.randomUUID() + ".jpg";
            const up = await client.storage.from("post-images").upload(uploaded, blob, {contentType:"image/jpeg", upsert:false});
            if(up.error) throw up.error;
        }
        const result = await client.rpc("create_story",{p_body:body || null,p_image_path:uploaded,p_bg:feat.story.bg});
        if(result.error) throw result.error;
        postedId = result.data;
        const created = await client.from("stories").select(STORY_COLUMNS).eq("id",result.data).single();
        if(created.error) throw created.error;
        await storyLocalPut({id:created.data.id,user_id:created.data.user_id,body:created.data.body || "",bg:created.data.bg || "blue",created_at:created.data.created_at,expires_at:created.data.expires_at,blob:localBlob,content_type:localBlob?.type || "",saved_at:new Date().toISOString()});
        await storyAckLocal(created.data.id);
        showToast("ストーリーを投稿し、端末にも保存しました。");
        await openStory();
    }catch(error){
        if(uploaded && !postedId) client.storage.from("post-images").remove([uploaded]);
        showToast(postedId ? "投稿しましたが端末保存の確認ができませんでした。アーカイブを開いて再保存してください。" : featError(error));
        button.disabled = false;
    }
}

async function deleteStory(button){
    const archived = button.dataset.from === "archive";
    if(!confirm(archived ? "このストーリーをアーカイブから完全に削除しますか？（元に戻せません）" : "このストーリーを削除しますか？\n（アーカイブにも残りません）")) return;
    button.disabled = true;
    const client = requireClient();
    try{
        if(button.dataset.localOnly === "true"){
            await storyLocalRemove(button.dataset.id);
            button.closest(".st-card")?.remove();
            feat.story.archiveRows = feat.story.archiveRows.filter((row) => row.id !== button.dataset.id);
            feat.story.archiveTotal = Math.max(0,feat.story.archiveTotal - 1);
            feat.story.archiveFrom = Math.max(0,feat.story.archiveFrom - 1);
            if($("stArcCount")) $("stArcCount").textContent = "全 " + feat.story.archiveTotal + " 件";
            return;
        }
        const result = await client.rpc("delete_story", {p_id:button.dataset.id});
        if(result.error) throw result.error;
        if(result.data) client.storage.from("post-images").remove([result.data]);
        await storyLocalRemove(button.dataset.id).catch(() => {});
        const card = button.closest(".st-card");
        if(archived && card){ card.remove(); feat.story.archiveRows = feat.story.archiveRows.filter((row) => row.id !== button.dataset.id); feat.story.archiveTotal = Math.max(0, feat.story.archiveTotal - 1); feat.story.archiveFrom = Math.max(0, feat.story.archiveFrom - 1); if($("stArcCount")) $("stArcCount").textContent = "全 " + feat.story.archiveTotal + " 件"; }
        else await loadStories();
    }catch(error){ showToast(featError(error)); button.disabled = false; }
}


// ----- 他の人のストーリーを見る（プロフィール／ユーザーの長押し・右クリックから） -----
// 見られるのは「フォローしている人」の、投稿から24時間以内のストーリーだけ（サーバー側のルールで制限）。
feat.userStory = {rows:[], i:0, uid:""};

async function openUserStories(userId){
    if(!userId) return;
    if(userId === state.user.id) return openStory();
    openSheet(toolHead("📖 ストーリー", "読み込み中...") + '<div id="usView"><div class="empty-list">読み込み中...</div></div>' + toolClose());
    const client = requireClient();
    try{
        const result = await client.from("stories").select(STORY_COLUMNS).eq("user_id", userId)
            .gt("expires_at", new Date().toISOString()).order("created_at", {ascending:true}).limit(20);
        if(result.error) throw result.error;
        const rows = result.data || [];
        if(!feat.known.has(userId)){
            const p = await client.from(TABLES.profiles).select("*").eq("id", userId).maybeSingle();
            if(p.data) feat.known.set(userId, p.data);
        }
        await signStoryImages(rows);
        feat.userStory = {rows, i: Math.max(0, rows.length - 1), uid: userId};
        paintUserStory();
    }catch(error){ if($("usView")) $("usView").innerHTML = '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>'; }
}

function userStoryStep(d){
    const u = feat.userStory;
    u.i = Math.max(0, Math.min(u.rows.length - 1, u.i + d));
    paintUserStory();
}

function paintUserStory(){
    const box = $("usView"); if(!box) return;
    const u = feat.userStory, name = profileDisplayName(feat.known.get(u.uid));
    if(!u.rows.length){
        box.innerHTML = '<div class="empty-list">' + escapeHtml(name) + ' さんのストーリーはありません。<br><span class="meta">（24時間以内の投稿だけ、フォローしている人の分が見られます）</span></div>';
        return;
    }
    const bars = u.rows.map((r, k) => '<span style="flex:1;height:4px;border-radius:2px;background:' + (k <= u.i ? "#fff" : "#fff5") + '"></span>').join("");
    box.innerHTML = '<div style="display:flex;gap:4px;margin-bottom:8px">' + bars + '</div>' +
        '<div class="meta" style="margin-bottom:6px">' + escapeHtml(name) + ' さん ・ ' + (u.i + 1) + ' / ' + u.rows.length + '</div>' +
        storyCard(u.rows[u.i], false) +
        '<div class="row"><button type="button" class="button-secondary" data-t="story:prev"' + (u.i === 0 ? " disabled" : "") + '>◀ まえ</button>' +
        '<button type="button" class="button-secondary" data-t="story:next"' + (u.i >= u.rows.length - 1 ? " disabled" : "") + '>つぎ ▶</button></div>';
}
