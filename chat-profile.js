"use strict";

function statusLine(profile){
    return profile?.status_message ? '<small class="status-msg">' + escapeHtml(profile.status_message) + '</small>' : '';
}

function miniAvatar(profile){
    const url = safeHttpUrl(profile?.avatar_url || "");
    return '<span class="post-avatar">' + (url ? '<img src="' + escapeHtml(url) + '" alt="">' : escapeHtml(shortName(profileDisplayName(profile)))) + '</span>';
}

function renderProfileText(){
    const p = state.profile || {};
    el.profileText.innerHTML = '<div class="sm">' + (p.status_message ? escapeHtml(p.status_message) : '<span class="meta">ステータスメッセージ未設定</span>') + '</div>' +
        (p.bio ? '<div class="bio">' + escapeHtml(p.bio) + '</div>' : '') + '<div class="fl-counts" id="myFollowCounts" data-flcount="1"></div>';
    if(typeof qkPaintFollowCounts === "function") qkPaintFollowCounts();
    el.myName.textContent = profileDisplayName(p);
    setAvatar(el.myAvatar,p);
}

function resizeImage(file,maxSide,quality){
    return new Promise((resolve,reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(1,maxSide / Math.max(img.width,img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1,Math.round(img.width * scale)); canvas.height = Math.max(1,Math.round(img.height * scale));
            canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像を変換できませんでした。")),"image/jpeg",quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("この画像は読み込めません。JPEG・PNG・WebP・GIFを選んでください。")); };
        img.src = url;
    });
}

// どの画面も、「閉じる」ボタンは右上の「✕」1つだけにする（下の「閉じる／とじる」が重なって2つ出るのを防ぐ）。
// 「キャンセル」など、ほかの意味のボタンは そのまま残す。
function dedupeSheetClose(sh){
    if(!sh) return;
    const re = /^(閉じる|とじる|戻る|もどる|閉)$/;
    sh.querySelectorAll('[data-pm="close"]:not(.sheet-x),[data-t="ct:stop"],#aiStudioClose').forEach((b) => {
        if(!re.test((b.textContent || "").trim())) return;
        const row = b.parentElement;
        b.remove();
        if(row && row.classList && row.classList.contains("row") && !row.children.length && !row.textContent.trim()) row.remove();
    });
}

function openSheet(html){
    el.profileSheet.innerHTML = '<button type="button" class="sheet-x" data-pm="close" aria-label="閉じる">✕</button>' + html;
    dedupeSheetClose(el.profileSheet);
    el.profileModal.hidden = false;
}

function closeSheet(){ if(typeof stopCamera === "function") stopCamera(); try{ if(typeof ctStop === "function") ctStop(); if(typeof pbStop === "function") pbStop(); if(typeof aiStudioClearPreview === "function") aiStudioClearPreview(); }catch(_e){} if(window.stopProfile3D) window.stopProfile3D(); el.profileModal.hidden = true; el.profileSheet.innerHTML = ""; feat.avatarBlob = null; }

function bigAvatar(profile, ctxUser){
    const url = safeHttpUrl(profile?.avatar_url || "");
    return '<div class="big-avatar" id="pmPreview"' + (ctxUser ? ' data-ctx-user="' + escapeHtml(ctxUser) + '" title="長押し／右クリックでストーリー"' : '') + '>' + (url ? '<img src="' + escapeHtml(url) + '" alt="">' : escapeHtml(shortName(profileDisplayName(profile)))) + '</div>';
}

function openProfileEditor(){
    const p = state.profile || {};
    feat.avatarBlob = null; feat.avatarVideoFile = null;
    openSheet(bigAvatar(p) + '<div class="row" style="justify-content:center"><label class="button-secondary" style="cursor:pointer;padding:8px 14px;border-radius:10px;color:var(--text)">写真を変更<input id="pmAvatar" class="file-input" type="file" accept="image/*,video/*"></label></div><div class="meta" style="text-align:center">写真のほか、動画も選べます（アイコンは動画の最初の1コマ。プロフィールを開くと動画が見られます）。' + (p.avatar_video ? '　いまは動画つきです。' : '') + '</div>' +
        '<label for="pmName">表示名（30文字まで）</label><input id="pmName" type="text" maxlength="30" value="' + escapeHtml(p.display_name || "") + '">' +
        '<label for="pmStatus">ステータスメッセージ（60文字まで）</label><input id="pmStatus" type="text" maxlength="60" value="' + escapeHtml(p.status_message || "") + '" placeholder="例：勉強中📚">' +
        '<label for="pmBio">自己紹介（150文字まで）</label><textarea id="pmBio" rows="3" maxlength="150">' + escapeHtml(p.bio || "") + '</textarea>' +
        '<div class="row"><button type="button" class="button-secondary" data-pm="close">キャンセル</button><button type="button" class="button" data-pm="save">保存</button></div>');
}

function openProfileView(profile){
    if(!profile) return;
    openSheet(bigAvatar(profile, profile.id !== state.user.id ? profile.id : '') + '<h3 style="margin:0;text-align:center">' + escapeHtml(profileDisplayName(profile)) + '</h3>' +
        '<div style="text-align:center">' + presenceHtml(profile) + '</div>' +
        (profile.status_message ? '<div style="text-align:center;font-weight:700">' + escapeHtml(profile.status_message) + '</div>' : '') +
        (profile.bio ? '<div style="white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)">' + escapeHtml(profile.bio) + '</div>' : '') +
        '<div id="profile3dPreview" class="profile3d-preview" hidden><canvas></canvas><div>3Dプロフィールカード</div></div>' +
        '<div id="pmFollow" style="text-align:center"></div><div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
    renderProfile3DCard(profile.id);
    loadFollow(profile.id);
    showAvatarVideoLink(profile);
}

// プロフィール動画（ドライブ）があれば「動画を見る」リンクを、アイコンの下に出す
async function showAvatarVideoLink(profile){
    try{
        let vid = profile.avatar_video;
        if(vid === undefined){
            const r = await requireClient().from(TABLES.profiles).select("avatar_video").eq("id", profile.id).maybeSingle();
            vid = r && r.data ? r.data.avatar_video : null;
        }
        const box = document.getElementById("pmPreview");
        if(!vid || !DRIVE_ID_RE.test(String(vid)) || !box || document.getElementById("pmAvVideo")) return;
        const a = document.createElement("a");
        a.id = "pmAvVideo"; a.className = "button-secondary"; a.href = driveViewUrl(String(vid)); a.target = "_blank"; a.rel = "noopener noreferrer";
        a.style.cssText = "display:block;text-align:center;margin:6px auto;max-width:260px"; a.textContent = "🎬 プロフィール動画を見る";
        box.insertAdjacentElement("afterend", a);
    }catch(_e){ /* 動画が出せなくても、プロフィールは見られる */ }
}

async function saveProfile(button){
    const name = document.getElementById("pmName").value.trim();
    if(!name){ showToast("表示名を入力してください。"); return; }
    const client = requireClient();
    button.disabled = true;
    try{
        let avatarUrl = null, uploaded = null, avatarVideo = null;
        if(feat.avatarBlob){
            if(driveFirstOn()){   // プロフィールの写真・動画は、Googleドライブ（GAS）へ。Supabase には置かない
                try{
                    const dup = await driveStoreBlob(feat.avatarBlob, "avatar.jpg", "image/jpeg", "image", (t) => { button.textContent = "📷 " + t; });
                    avatarUrl = "https://lh3.googleusercontent.com/d/" + dup.id + "=s384";
                    if(feat.avatarVideoFile){
                        try{ avatarVideo = (await driveUploadSimple(feat.avatarVideoFile, "video", (t) => { button.textContent = "🎬 " + t; })).id; }
                        catch(videoError){ console.error("[ARE drive avatar video]", videoError); showToast("動画はドライブに置けなかったので、写真だけ保存します。"); }
                    }
                }catch(driveError){ console.error("[ARE drive avatar]", driveError); avatarUrl = null; showToast("ドライブに置けなかったので、そのまま保存します。"); }
            }
            if(!avatarUrl){
                uploaded = state.user.id + "/" + crypto.randomUUID() + ".jpg";
                const up = await client.storage.from("avatars").upload(uploaded,feat.avatarBlob,{contentType:"image/jpeg",upsert:false});
                if(up.error) throw up.error;
                avatarUrl = client.storage.from("avatars").getPublicUrl(uploaded).data.publicUrl;
            }
        }
        const result = await client.rpc("update_my_profile",{
            p_display_name:name,p_bio:document.getElementById("pmBio").value,p_status_message:document.getElementById("pmStatus").value,
            p_avatar_url:avatarUrl,p_clear_avatar:false,p_avatar_video:avatarVideo,p_clear_avatar_video:!!feat.avatarBlob && !avatarVideo});
        if(result.error){ if(uploaded) client.storage.from("avatars").remove([uploaded]); throw result.error; }
        const old = state.profile?.avatar_url;
        const fresh = await client.from(TABLES.profiles).select("*").eq("id",state.user.id).maybeSingle();
        if(!fresh.error && fresh.data) state.profile = fresh.data;
        if(avatarUrl && old && old.includes("/avatars/")){ client.storage.from("avatars").remove([decodeURIComponent(old.split("/avatars/")[1])]); }
        feat.avatarBlob = null; feat.avatarVideoFile = null;
        renderProfileText(); closeSheet(); showToast("プロフィールを更新しました。");
    }catch(error){ button.disabled = false; showToast(featError(error)); }
}

async function onSheetClick(event){
    const copy = event.target.closest("[data-copycode]");
    if(copy){ try{ await navigator.clipboard.writeText(copy.dataset.copycode); showToast("コピーしました。"); }catch(_e){ showToast("手動で選択してコピーしてください。"); } return; }
    // 背景（枠の外）をクリックしても閉じない：グループ作成中などに マウスを少しドラッグしただけで
    // 画面が消えてしまう不具合があったため。右上の「✕」か、各画面の「閉じる／キャンセル」ボタンでのみ閉じる。
    const button = event.target.closest("[data-pm]");
    if(!button) return;
    if(button.dataset.pm === "close") closeSheet();
    else if(button.dataset.pm === "save") await saveProfile(button);
    else if(button.dataset.pm === "follow") await toggleFollow(button);
    else if(button.dataset.pm === "approvefollow") await respondFollowRequest(button,true);
    else if(button.dataset.pm === "declinefollow") await respondFollowRequest(button,false);
}

// 動画の最初の1コマを、アイコン用の写真（JPEG）にする
function videoFirstFrameBlob(file, side, quality){
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file), v = document.createElement("video");
        let done = false;
        const finish = (fn, val) => { if(done) return; done = true; URL.revokeObjectURL(url); fn(val); };
        v.muted = true; v.playsInline = true; v.preload = "auto";
        v.onerror = () => finish(reject, new Error("この動画は読み込めません。別の動画を選んでください。"));
        v.onloadeddata = () => { try{ v.currentTime = Math.min(0.1, (v.duration || 1) / 2); }catch(_e){ draw(); } };
        const draw = () => {
            const scale = Math.min(1, side / Math.max(v.videoWidth || 1, v.videoHeight || 1)), c = document.createElement("canvas");
            c.width = Math.max(1, Math.round((v.videoWidth || side) * scale)); c.height = Math.max(1, Math.round((v.videoHeight || side) * scale));
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
            c.toBlob((b) => b ? finish(resolve, b) : finish(reject, new Error("動画から写真を作れませんでした。")), "image/jpeg", quality);
        };
        v.onseeked = draw;
        setTimeout(() => finish(reject, new Error("動画の読み込みに時間がかかっています。別の動画でお試しください。")), 15000);
        v.src = url;
    });
}

async function onSheetChange(event){
    if(event.target.id !== "pmAvatar" || !event.target.files[0]) return;
    const picked = event.target.files[0];
    try{
        if(/^video\//i.test(picked.type || "")){
            feat.avatarBlob = await videoFirstFrameBlob(picked, 384, 0.88);
            feat.avatarVideoFile = picked;
        }else{
            feat.avatarBlob = await resizeImage(picked,384,0.88);
            feat.avatarVideoFile = null;
        }
        document.getElementById("pmPreview").innerHTML = '<img src="' + URL.createObjectURL(feat.avatarBlob) + '" alt="">' + (feat.avatarVideoFile ? '<span class="meta">🎬 動画つき</span>' : "");
    }catch(error){ feat.avatarBlob = null; feat.avatarVideoFile = null; showToast(error.message); }
    event.target.value = "";
}
