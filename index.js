(function () {
    "use strict";

    // 起動画面を5秒間表示してからログイン画面へ移動します。
    const redirectDelayMs = 5000;
    const invite = new URLSearchParams(window.location.search).get("invite");
    const loginPageUrl = "./login.html" + (invite ? "?invite=" + encodeURIComponent(invite) : "");

    window.setTimeout(function () {
        window.location.replace(loginPageUrl);
    }, redirectDelayMs);
})();
