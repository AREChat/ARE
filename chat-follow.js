"use strict";

// ===== ユーザーの非表示 / フォロー =====
state.hiddenIds = new Set();
state.showHidden = false;

async function toggleHideUser(id,hide){
    try{
        const client = requireClient();
        const result = hide
            ? await client.from("hidden_recommendations").insert({user_id:state.user.id,hidden_user_id:id})
            : await client.from("hidden_recommendations").delete().eq("user_id",state.user.id).eq("hidden_user_id",id);
        if(result.error) throw result.error;
        if(hide) state.hiddenIds.add(id); else state.hiddenIds.delete(id);
        renderRecommendations();
        showToast(hide ? "検索結果に表示しないようにしました。" : "再表示しました。");
    }catch(error){ showToast(featError(error)); }
}

async function followCounts(uid){
    const client = requireClient();
    const [followers,following] = await Promise.all([
        client.from("follows").select("*",{count:"exact",head:true}).eq("followee_id",uid),
        client.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",uid)]);
    if(followers.error) throw followers.error;
    return {followers:followers.count || 0,following:following.count || 0};
}

async function loadMyFollowCounts(){
    try{
        const counts = await followCounts(state.user.id);
        if(typeof qkPaintFollowCounts === "function"){ qkCounts = counts; qkPaintFollowCounts(); }
        else{ const box = document.getElementById("myFollowCounts"); if(box) box.textContent = "フォロワー " + counts.followers + " ・ フォロー中 " + counts.following; }
    }catch(_e){ /* 数が出せなくても他の機能は続ける */ }
}

async function loadFollow(uid){
    const box = document.getElementById("pmFollow");
    if(!box || uid === state.user.id) return;
    try{
        const client = requireClient();
        const [counts,mine,theirs] = await Promise.all([
            followCounts(uid),
            client.from("follows").select("followee_id").eq("follower_id",state.user.id).eq("followee_id",uid).maybeSingle(),
            client.from("follows").select("approved_at").eq("follower_id",uid).eq("followee_id",state.user.id).maybeSingle()]);
        if(document.getElementById("pmFollow") !== box) return;
        const following = !!mine.data;
        const pendingFromThem = !!(theirs.data && !theirs.data.approved_at);
        let html = '<div class="meta">フォロワー ' + counts.followers + ' ・ フォロー中 ' + counts.following + '</div>' +
            '<button type="button" class="' + (following ? 'button-secondary' : 'button') + '" data-pm="follow" data-uid="' + escapeHtml(uid) + '" data-following="' + (following ? '1' : '0') + '" style="margin-top:6px">' + (following ? 'フォロー中（解除する）' : 'フォローする') + '</button>';
        if(pendingFromThem){
            html += '<div class="meta" style="margin-top:8px">この方がフォローを申請しています。承認すると、すぐにメッセージを送り合えるようになります。</div>' +
                '<div class="row"><button type="button" class="button" data-pm="approvefollow" data-uid="' + escapeHtml(uid) + '">承認する</button>' +
                '<button type="button" class="button-secondary" data-pm="declinefollow" data-uid="' + escapeHtml(uid) + '">見送る</button></div>';
        }
        box.innerHTML = html;
    }catch(error){
        if(document.getElementById("pmFollow") === box) box.innerHTML = '<div class="meta">' + escapeHtml(featError(error)) + '</div>';
    }
}

async function respondFollowRequest(button,approve){
    const uid = button.dataset.uid;
    const row = button.closest(".row") || button;
    const buttons = row.querySelectorAll ? row.querySelectorAll("button") : [button];
    buttons.forEach((b) => { b.disabled = true; });
    try{
        const client = requireClient();
        const result = await client.rpc(approve ? "approve_follow_v1" : "decline_follow_v1",{p_follower:uid});
        if(result.error) throw result.error;
        showToast(approve ? "フォローを承認しました。" : "フォローを見送りました。");
        await loadFollow(uid);
    }catch(error){
        buttons.forEach((b) => { b.disabled = false; });
        showToast(featError(error));
    }
}

async function toggleFollow(button){
    const uid = button.dataset.uid, following = button.dataset.following === "1";
    button.disabled = true;
    try{
        const client = requireClient();
        const result = following
            ? await client.from("follows").delete().eq("follower_id",state.user.id).eq("followee_id",uid)
            : await client.from("follows").insert({follower_id:state.user.id,followee_id:uid});
        if(result.error) throw result.error;
        await loadFollow(uid);
    }catch(error){ button.disabled = false; showToast(featError(error)); }
}
