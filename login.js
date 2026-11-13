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

    // お試しをはじめる前に、注意の画面を出す（「はじめる」を押したときだけ、お試しを作る）
    function askGuestNotice() {
        return new Promise((resolve) => {
            if (document.getElementById("guestNotice")) { resolve(false); return; }
            const opener = document.activeElement;
            const wrap = document.createElement("div");
            wrap.id = "guestNotice";
            wrap.setAttribute("role", "dialog");
            wrap.setAttribute("aria-modal", "true");
            wrap.setAttribute("aria-labelledby", "guestNoticeTitle");
            wrap.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box";
            const box = document.createElement("div");
            box.style.cssText = "background:#fff;color:#1b2540;border-radius:14px;max-width:420px;width:100%;max-height:calc(100dvh - 32px);overflow:auto;padding:18px 16px;box-sizing:border-box;font-size:14px;line-height:1.7;box-shadow:0 10px 40px rgba(0,0,0,.4)";
            box.innerHTML =
                '<h2 id="guestNoticeTitle" style="font-size:17px;margin:0 0 10px">お試しをはじめる前に</h2>' +
                '<p style="margin:0 0 10px"><strong>① 管理者に、自分の名前を伝えてください。</strong><br>お試しでは、名前が自動で「ゲスト＋数字」になります。はじめたら、チャット画面で自分の名前を確かめて、管理者に伝えてください。</p>' +
                '<p style="margin:0 0 14px"><strong>② ログアウトに注意してください。</strong><br>ログアウトすると、このお試しには戻れません。もう一度「お試し」を押すと、新しいアカウント（別の名前）が作られます。</p>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
                '<button type="button" id="guestNoticeNo" style="min-width:104px;min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #9aa3bd;background:#eef0f7;color:#1b2540;font-size:15px;font-weight:700;cursor:pointer">やめる</button>' +
                '<button type="button" id="guestNoticeYes" style="min-width:104px;min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #2b3fb5;background:#2f45c8;color:#fff;font-size:15px;font-weight:700;cursor:pointer">はじめる</button></div>';
            wrap.appendChild(box);
            document.body.appendChild(wrap);
            const yes = box.querySelector("#guestNoticeYes");
            const no = box.querySelector("#guestNoticeNo");
            let done = false;
            function finish(ok) {
                if (done) return;
                done = true;
                document.removeEventListener("keydown", onKey, true);
                wrap.remove();
                try { if (opener && opener.focus) opener.focus(); } catch (_e) {}
                resolve(ok);
            }
            function onKey(event) {
                if (event.key === "Escape") { event.preventDefault(); finish(false); return; }
                if (event.key === "Tab") {
                    const items = [no, yes];
                    const i = items.indexOf(document.activeElement);
                    event.preventDefault();
                    items[(i + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
                }
            }
            yes.addEventListener("click", () => finish(true));
            no.addEventListener("click", () => finish(false));
            wrap.addEventListener("click", (event) => { if (event.target === wrap) finish(false); });
            document.addEventListener("keydown", onKey, true);
            yes.focus();
        });
    }

    const guestButton = document.getElementById("startGuest");
    if (guestButton) {
        guestButton.addEventListener("click", async () => {
            if (guestButton.disabled) return;
            if (!(await askGuestNotice())) return;
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
            try { window.areIntruder && window.areIntruder.ok("login"); } catch (_e) {}
            window.location.replace(chatUrl);
        } catch (error) {
            try { window.areIntruder && window.areIntruder.miss("login"); } catch (_e) {}
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
