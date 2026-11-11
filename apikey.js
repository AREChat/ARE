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
        // 大きい動画を Googleドライブに置いてリンクにする GAS ウェブアプリのURL（https://script.google.com/macros/s/…/exec）。
        // 空のままなら、動画のリンクを自分で貼る画面になります。
        videoUploadUrl: "https://script.google.com/macros/s/AKfycbw5pEChZI4haKvsbFDUgnPHkTHb_oMGSAq_GlcogQ7XGN-yBLF2W5W1SrlXTGed15DsPg/exec",
        requestTimeoutMs: 20000
    });
})();
