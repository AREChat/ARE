"use strict";

let securityFactorId = "";
let securityEnrollData = null;
let securityVerified = false;

function initSecurity(){}

async function securityIsAdmin(){
    const result = await requireClient().rpc("current_user_is_admin");
    if(result.error) throw result.error;
    if(result.data !== true) throw new Error("管理者アカウントでログインしてください。");
}

function securityScreen(note,errorText){
    const status = errorText ? '<div class="admin-security-error">' + escapeHtml(errorText) + '</div>' : note ? '<div class="meta">' + escapeHtml(note) + '</div>' : "";
    const qr = securityEnrollData?.totp?.qr_code ? '<img class="admin-security-qr" src="' + escapeHtml(securityEnrollData.totp.qr_code) + '" alt="認証アプリ用QRコード">' : "";
    const secret = securityEnrollData?.totp?.secret ? '<div class="admin-security-secret"><b>手入力用コード</b><code>' + escapeHtml(securityEnrollData.totp.secret) + '</code></div>' : "";
    openSheet('<div class="admin-security"><h3>🛡️ 管理者のTOTP認証</h3><div class="meta">認証アプリの6桁コードで管理者機能を保護します。コードは端末外へ送信しません。</div>' + status + qr + secret + (!securityVerified ? '<label for="adminTotpCode">認証コード</label><input id="adminTotpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6桁のコード">' + (securityFactorId ? '<button type="button" class="button" id="adminTotpVerify">コードを確認</button>' : '<button type="button" class="button" id="adminTotpEnroll">認証アプリを登録</button>') : '') + (securityEnrollData ? '<button type="button" class="button-secondary" id="adminTotpRestart">QRコードを作り直す</button>' : '') + '<div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button></div></div>');
    const enroll = document.getElementById("adminTotpEnroll");
    if(enroll) enroll.addEventListener("click",securityEnroll);
    const verify = document.getElementById("adminTotpVerify");
    if(verify) verify.addEventListener("click",securityVerify);
    const restart = document.getElementById("adminTotpRestart");
    if(restart) restart.addEventListener("click",securityRestart);
}

async function securityEnroll(){
    try{
        await securityIsAdmin();
        const client = requireClient(), factors = await client.auth.mfa.listFactors();
        if(factors.error) throw factors.error;
        const pending = (factors.data?.totp || []).filter((factor) => factor.status !== "verified");
        for(const factor of pending) await client.auth.mfa.unenroll({factorId:factor.id});
        const result = await client.auth.mfa.enroll({factorType:"totp",friendlyName:"ARE管理者"});
        if(result.error) throw result.error;
        securityFactorId = result.data.id; securityEnrollData = result.data;
        securityScreen("QRコードを認証アプリで読み取り、表示された6桁のコードを入力してください。");
    }catch(error){ securityScreen("",featError(error)); }
}

async function securityVerify(){
    const input = document.getElementById("adminTotpCode"), code = (input?.value || "").trim();
    if(!/^\d{6,8}$/.test(code)){ securityScreen("","6桁または8桁の数字を入力してください。"); return; }
    try{
        await securityIsAdmin();
        const client = requireClient(), challenge = await client.auth.mfa.challenge({factorId:securityFactorId});
        if(challenge.error) throw challenge.error;
        const result = await client.auth.mfa.verify({factorId:securityFactorId,challengeId:challenge.data.id,code});
        if(result.error) throw result.error;
        const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if(aal.error) throw aal.error;
        if(aal.data?.currentLevel !== "aal2") throw new Error("認証レベルを確認できませんでした。もう一度お試しください。");
        if(typeof checkAdmin === "function") await checkAdmin();
        securityFactorId = ""; securityEnrollData = null; securityVerified = true;
        showToast("管理者の追加認証を確認しました。");
        securityScreen("認証アプリが有効です。管理者パネルを開けます。");
    }catch(error){ securityScreen("",featError(error)); }
}

async function securityRestart(){
    try{ const client = requireClient(); if(securityFactorId) await client.auth.mfa.unenroll({factorId:securityFactorId}); securityFactorId = ""; securityEnrollData = null; await securityEnroll(); }
    catch(error){ securityScreen("",featError(error)); }
}

async function openAdminSecurity(){
    securityFactorId = ""; securityEnrollData = null; securityVerified = false;
    try{
        await securityIsAdmin();
        const client = requireClient(), factors = await client.auth.mfa.listFactors();
        if(factors.error) throw factors.error;
        const verified = (factors.data?.totp || []).find((factor) => factor.status === "verified");
        if(verified){
            securityFactorId = verified.id;
            const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
            if(aal.error) throw aal.error;
            securityVerified = aal.data?.currentLevel === "aal2";
            securityScreen(securityVerified ? "認証済みです。管理者機能を利用できます。" : "登録済みの認証アプリで6桁のコードを確認してください。");
        }else securityScreen("認証アプリを登録して、管理者用の追加認証を有効にしてください。");
    }catch(error){ securityScreen("",featError(error)); }
}
