(function () {
    "use strict";

    // Supabaseの接続設定です。ブラウザに公開してよいPublishable Keyのみを設定してください。
    // Service Role Keyや秘密鍵は絶対に記載しないでください。データ保護はSupabase側のRLSで行います。
    window.ARE_CONFIG = Object.freeze({
        supabaseUrl: "https://kzrrnuzzvwijujhlbtln.supabase.co",
        supabasePublishableKey: "sb_publishable_lO7m63Or44b-CIRWfYMcjA_z_WuONpi",
        functions: Object.freeze({
            register: "register-user",
            login: "login-user",
            recovery: "recover-account",
            guest: "guest-start"
        }),
        // 写真・音声・動画・ファイル・投稿・ストーリー・プロフィール・AI作品など「ぜんぶのファイル」を Googleドライブ（ファイル保存フォルダ）に置く GAS ウェブアプリのURL（https://script.google.com/macros/s/…/exec）。
        // 動画保存の GAS はやめて、ファイル保存の GAS 1本にまとめました（広告の配信も同じ GAS）。空のままなら、これまでどおり Supabase のストレージに置きます。
        videoUploadUrl: "https://script.google.com/macros/s/AKfycbzkKv7KJVTXZKR_sp70KLbu5j1AaSKiRpNwG8xRIMs2CQl5lVgrLuCmPgInHr7OrWdH3A/exec",
        // 広告の映像（Googleドライブの「広告」フォルダ）を配る GAS のURL（ファイル保存と同じ GAS）。空のままなら、ads/ フォルダの映像を使います。
        adsUrl: "https://script.google.com/macros/s/AKfycbzkKv7KJVTXZKR_sp70KLbu5j1AaSKiRpNwG8xRIMs2CQl5lVgrLuCmPgInHr7OrWdH3A/exec",
        requestTimeoutMs: 20000
    });
})();
