"use strict";

function initStorageAdmin(){}

async function storageAdminRequest(action){
    const result = await requireClient().functions.invoke("admin-storage",{body:{action}});
    if(result.error) throw result.error;
    if(result.data?.error) throw new Error(result.data.error);
    return result.data || {};
}

async function openStorageAdmin(){
    try{
        const admin = await requireClient().rpc("is_current_user_admin");
        if(admin.error) throw admin.error;
        if(admin.data !== true){
            const known = await requireClient().rpc("current_user_is_admin");
            if(known.data === true) throw new Error("この機能を使うには管理者TOTP認証が必要です。先に「管理者のTOTP認証」を開いてください。");
            throw new Error("管理者アカウントでログインしてください。");
        }
        const report = await storageAdminRequest("report");
        renderStorageAdmin(report);
    }catch(error){ openSheet(toolHead("🗄️ Storage使用量と整理","") + '<div class="empty-list">' + escapeHtml(featError(error)) + '</div>' + toolClose()); }
}

function renderStorageAdmin(report){
    const rows = report.rows || [];
    const totalBytes = rows.reduce((sum,row) => sum + Number(row.total_bytes || 0),0);
    const orphanBytes = rows.reduce((sum,row) => sum + Number(row.orphan_bytes || 0),0);
    openSheet(toolHead("🗄️ Storage使用量と整理","参照されていない画像だけを確認し、24時間以上経過したものを整理します。") +
        '<div class="storage-admin-summary"><b>使用量</b><span>' + escapeHtml(formatAttachmentSize(totalBytes)) + '</span><b>整理できる画像</b><span>' + escapeHtml(formatAttachmentSize(orphanBytes)) + '</span></div>' +
        '<div class="storage-admin-list">' + rows.map((row) => '<div class="storage-admin-row"><b>' + escapeHtml(row.bucket_id) + '</b><span>' + escapeHtml(formatAttachmentSize(row.total_bytes)) + '</span><small>画像 ' + Number(row.object_count || 0) + '件 / 整理候補 ' + Number(row.orphan_count || 0) + '件</small></div>').join("") + '</div>' +
        '<div id="storageAdminStatus" class="meta"></div><div class="row"><button type="button" class="button-secondary" id="storageAdminRefresh">更新</button><button type="button" class="button" id="storageAdminClean"' + (orphanBytes ? "" : " disabled") + '>不要画像を整理</button></div>' + toolClose());
    document.getElementById("storageAdminRefresh").addEventListener("click",openStorageAdmin);
    document.getElementById("storageAdminClean").addEventListener("click",storageAdminClean);
}

async function storageAdminClean(event){
    if(!confirm("24時間以上どの投稿・ストーリーからも参照されていない画像を削除します。続けますか？")) return;
    const button = event.currentTarget, status = document.getElementById("storageAdminStatus"); button.disabled = true;
    if(status) status.textContent = "整理しています…";
    try{ const result = await storageAdminRequest("clean-orphans"); showToast(Number(result.deleted || 0) + "件の不要画像を整理しました。"); await openStorageAdmin(); }
    catch(error){ if(status) status.textContent = featError(error); button.disabled = false; }
}
