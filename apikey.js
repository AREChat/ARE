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
            recovery: "recover-account"
        }),
        requestTimeoutMs: 20000
    });
})();
