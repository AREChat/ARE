"use strict";
// ===== お試しアカウントの案内（画面の上にのこり件数を出す）=====
// 件数の制限そのものはサーバー側（messages の guest_limit）で行います。ここは表示だけです。
(function guestBar(){
    let bar = null, timer = null;
    const client = () => window.ARESystem && window.ARESystem.client;
    function ensureBar(){
        if(bar) return bar;
        bar = document.createElement("div");
        bar.id = "guestBar";
        bar.setAttribute("role","status");
        bar.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:40;background:#1d2b4f;color:#fff;font-size:12px;height:30px;box-sizing:border-box;padding:0 8px;display:flex;gap:8px;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;border-bottom:1px solid #5b7cff";
        bar.innerHTML = '<span id="guestBarText"></span><button type="button" id="guestBarReg" class="button-secondary" style="padding:1px 8px;font-size:11px;min-height:0;flex:none">登録する</button>';
        document.body.appendChild(bar);
        document.body.classList.add("has-guest-bar");
        if(!document.getElementById("guestBarCss")){ const st = document.createElement("style"); st.id = "guestBarCss"; st.textContent = "body.has-guest-bar{padding-top:30px;box-sizing:border-box}body.has-guest-bar .app{height:calc(100dvh - 30px) !important}"; document.head.appendChild(st); }
        bar.querySelector("#guestBarReg").addEventListener("click", async () => {
            try{ if(window.AREAuth && window.AREAuth.logout) await window.AREAuth.logout(); }catch(_e){ /* 続行 */ }
            window.location.href = "./register.html";
        });
        return bar;
    }
    async function refresh(){
        const c = client();
        if(!c) return;
        try{
            const { data, error } = await c.rpc("guest_status_me");
            if(error || !data) return;
            if(!data.guest){ if(bar){ bar.remove(); bar = null; document.body.classList.remove("has-guest-bar"); } return; }
            const b = ensureBar();
            b.querySelector("#guestBarText").textContent = "お試し中：管理者以外へは あと " + data.remaining + " 件";
        }catch(_e){ /* 案内が出せなくても使える */ }
    }
    function start(){
        refresh();
        timer = setInterval(() => { if(!document.hidden) refresh(); }, 20000);
        document.addEventListener("visibilitychange", () => { if(!document.hidden) refresh(); });
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 1500));
    else setTimeout(start, 1500);
})();
