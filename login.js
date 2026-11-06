document.addEventListener("DOMContentLoaded", () => {
    const elements = {
        form: document.getElementById("loginForm"),
        button: document.getElementById("loginButton"),
        status: document.getElementById("loginStatus"),
        loginId: document.getElementById("loginId"),
        password: document.getElementById("loginPassword")
    };
    const invite = new URLSearchParams(window.location.search).get("invite");
    const chatUrl = "./chat.html" + (invite ? "?invite=" + encodeURIComponent(invite) : "");
    const registerUrl = "./register.html" + (invite ? "?invite=" + encodeURIComponent(invite) : "");

    function showStatus(message, isError = false) {
        elements.status.textContent = message;
        elements.status.dataset.state = isError ? "error" : "success";
    }

    document.getElementById("showRegister").addEventListener("click", () => {
        window.location.href = registerUrl;
    });
    document.getElementById("showRecovery").addEventListener("click", () => {
        window.location.href = "./recovery.html";
    });

    const guestButton = document.getElementById("startGuest");
    if (guestButton) {
        guestButton.addEventListener("click", async () => {
            if (guestButton.disabled) return;
            if (!window.AREAuth || typeof window.AREAuth.guestStart !== "function") {
                showStatus("お試しの機能を読み込めませんでした。ページを再読み込みしてください。", true);
                return;
            }
            guestButton.disabled = true;
            showStatus("お試しを用意しています...");
            try {
                const result = await window.AREAuth.guestStart();
                const user = result?.user || result?.session?.user;
                if (!user?.id) throw new Error("お試しの開始に失敗しました。もう一度お試しください。");
                window.location.replace(chatUrl);
            } catch (error) {
                showStatus(error?.message || "お試しを始められませんでした。時間をおいてもう一度お試しください。", true);
                guestButton.disabled = false;
            }
        });
    }

    elements.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (elements.button.disabled) return;

        if (!window.AREAuth || typeof window.AREAuth.login !== "function") {
            showStatus("system.js の読み込み、またはログイン機能の初期化に失敗しました。", true);
            return;
        }

        elements.button.disabled = true;
        showStatus("ログインしています...");

        try {
            const result = await window.AREAuth.login(elements.loginId.value.trim(), elements.password.value);
            const user = result?.user || result?.session?.user;
            if (!user?.id) {
                throw new Error("ログイン結果からユーザー情報を取得できませんでした。");
            }
            elements.password.value = "";
            window.location.replace(chatUrl);
        } catch (error) {
            showStatus(error?.message || "ログインに失敗しました。", true);
            elements.button.disabled = false;
        }
    });

    // 保存済みセッションがあればチャット画面へ移動する
    (async () => {
        try {
            const session = window.AREAuth ? await window.AREAuth.getSession() : null;
            if (session?.user?.id) window.location.replace(chatUrl);
        } catch (error) {
            showStatus("保存済みのログイン状態を確認できませんでした。再度ログインしてください。", true);
        }
    })();
});
