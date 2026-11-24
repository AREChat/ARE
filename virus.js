"use strict";
// ===== おしおき画面（演出）=====
// ・「削除待ち」のとき（修正依頼の部屋での即アウトなど）：「ごめんなさい、申しません」を押すと、サーバー側でアカウントが完全に消えます。
// ・NG発言のあと（1回目から毎回。?warn=1）：同じ画面の「演出だけ」。数秒あとにボタンが押せるようになり、押すとチャットにもどります（アカウントは消えません）
// ・押すまでは：ページを離れる操作に確認を出す／全画面化を試みる／キー操作・右クリックを止める（ブラウザの仕様上、タブを閉じる操作そのものは止められません）
// ・閉じても、サーバー側が「削除待ち」のままなので、次にログインしたとき必ずこの画面に戻ります
(function(){
    var params = new URLSearchParams(location.search), preview = params.get("preview") === "1";
    var warn = params.get("warn") === "1", warnN = parseInt(params.get("n"), 10) || 0;
    var other = params.get("other") === "1";   // 区分「その他」の人の不正検知（管理者が解除するまで。アカウントは消えません）
    var soft = preview || warn;   // 演出だけ（アカウントは消えない・画面ロックもゆるめる）。サーバーが「削除待ち」のときだけ、あとで false にもどす
    var $ = function(id){ return document.getElementById(id); };
    var done = false, locked = false;
    var client = null;

    function msg(t){ $("vxMsg").textContent = t || ""; }

    // ---- 見た目の演出 ----
    var files = 0, inf = 0, tick = 0;
    var LOG = ["C:\\おしおき\\うざい.exe を検出","メモリ領域 0x7F3A を書きかえ中…","「ごめんなさい」が見つかりません","きょうの反省ポイント: 0","ARE警察が あなたを みています","言葉づかい.dll が こわれています","やさしさ.dat が みつかりません","感染を ひろげています…"];
    setInterval(function(){
        files += Math.floor(Math.random() * 480) + 90; inf += Math.floor(Math.random() * 17) + 2; tick++;
        $("vxFiles").textContent = files.toLocaleString("ja-JP"); $("vxInf").textContent = inf.toLocaleString("ja-JP");
        $("vxBar").style.width = Math.min(99, (tick * 3) % 140) + "%";
        var log = $("vxLog"); log.textContent += (log.textContent ? "\n" : "") + LOG[Math.floor(Math.random() * LOG.length)];
        var lines = log.textContent.split("\n"); if(lines.length > 6) log.textContent = lines.slice(-6).join("\n");
    }, 450);

    // 赤い文字の雨（0と1とHEXだけ。30fps・非表示の間は止まる・「動きを減らす」設定のときは出さない）
    (function(){
        try{
            var h1 = document.querySelector("h1"); if(h1) h1.setAttribute("data-t", h1.textContent);
            if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            var cv = $("vxRain"), ctx = cv && cv.getContext("2d"); if(!ctx) return;
            var chars = "01ABCDEF▮▯", cols = 0, drops = [], last = 0;
            function fit(){ cv.width = cv.clientWidth || innerWidth; cv.height = cv.clientHeight || innerHeight; cols = Math.ceil(cv.width / 16); drops = []; for(var i = 0; i < cols; i++) drops.push(Math.random() * -40); }
            fit(); addEventListener("resize", fit);
            (function tick(now){
                requestAnimationFrame(tick);
                if(document.hidden || now - last < 33) return; last = now;
                ctx.fillStyle = "rgba(20,0,0,.16)"; ctx.fillRect(0, 0, cv.width, cv.height);
                ctx.font = "14px ui-monospace,Menlo,Consolas,monospace";
                for(var i = 0; i < cols; i++){
                    ctx.fillStyle = Math.random() < .06 ? "#ffd0d0" : "#ff2a2a";
                    ctx.fillText(chars[(Math.random() * chars.length) | 0], i * 16, drops[i] * 16);
                    if(drops[i] * 16 > cv.height && Math.random() > .975) drops[i] = 0;
                    drops[i] += 1;
                }
            })(0);
        }catch(_e){ /* 雨が出なくても、警告画面は出る */ }
    })();

    // ---- 他の操作ができないようにする ----
    window.addEventListener("beforeunload", function(e){ if(done || soft) return; e.preventDefault(); e.returnValue = "ウイルスが残っています。反省して あやまるまで 閉じられません。"; return e.returnValue; });
    ["contextmenu","selectstart","dragstart","copy","cut","paste"].forEach(function(t){ document.addEventListener(t, function(e){ e.preventDefault(); }, true); });
    document.addEventListener("keydown", function(e){
        if(done || soft) return;
        var onBtn = e.target === $("vxSorry");
        if(onBtn && (e.key === "Enter" || e.key === " ")) return; // ボタンはキーボードでも押せる
        e.preventDefault(); e.stopPropagation();
    }, true);
    function goFull(){
        var d = document.documentElement;
        try{
            if(!document.fullscreenElement && d.requestFullscreen){
                d.requestFullscreen().then(function(){ if(navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape","F5","F11","KeyW","KeyT","KeyN","KeyR"]).catch(function(){}); }).catch(function(){});
            }
        }catch(_e){}
    }
    ["pointerdown","touchstart"].forEach(function(t){ document.addEventListener(t, function(){ if(!done && !soft) goFull(); }, true); });
    document.addEventListener("fullscreenchange", function(){ if(!document.fullscreenElement && !done && !soft) msg("画面を もどします。どこかを タップしてください。"); });
    document.addEventListener("visibilitychange", function(){ if(!document.hidden && !done) $("vxSorry").focus(); });

    // ---- サーバーとの連携 ----
    async function init(){
        try{
            client = window.ARESystem.client;
            var s = await client.auth.getSession();
            if(!s.data || !s.data.session){ location.replace("./index.html"); return; }
            var r = await client.rpc("my_access");
            if(r.error) throw r.error;
            var a = r.data || {};
            if(other){
                var fr = await client.rpc("my_ui_flags");
                var fd = fr.data || {};
                if(fr.error || !(fd.virus === true && fd.other)){ location.replace("./chat.html"); return; }
                soft = true;
                var lead = document.querySelector(".vx-lead"), warn2 = document.querySelector(".vx-warn");
                if(lead) lead.innerHTML = "不正な操作を 検知しました。<br><b>「保護モード」</b>に 入ります。";
                if(warn2) warn2.innerHTML = "管理者が 解除するまで、メッセージは 送れません。<br>解除されたら「もう一度確認する」を 押してください。";
                $("vxPrev").textContent = "（区分「その他」の保護モードです。管理者が解除するまで、この画面になります。アカウントは消えません）";
                locked = true;
                $("vxSorry").textContent = "もう一度確認する"; $("vxSorry").style.animation = "none"; $("vxSorry").disabled = false; $("vxOut").hidden = false;
                msg(""); return;
            }
            if(preview){
                if(!a.admin){ location.replace("./chat.html"); return; }
                $("vxPrev").textContent = "（管理者プレビュー：ボタンを押してもアカウントは消えません）";
            }else if(a.ng_pending){
                soft = false;   // 本物（削除待ち）：これまでどおり
            }else if(warn && !a.admin){
                $("vxPrev").textContent = "（警告の演出です。これで" + (warnN || "1") + "回目です。アカウントは消えません。5回目から1分間の凍結（回数がふえるたびに2倍）、100回でアカウントが削除されます）";
            }else{
                location.replace("./chat.html"); return;
            }
            locked = true;
            if(warn && soft && !preview){
                // 演出だけの警告：5秒ほど反省してから、ボタンが押せるようになる
                var left = 5; $("vxSorry").disabled = true;
                var timer = setInterval(function(){
                    left--; if(left > 0){ $("vxSorry").textContent = "反省しています… " + left; return; }
                    clearInterval(timer); $("vxSorry").textContent = "ごめんなさい、申しません"; $("vxSorry").disabled = false; $("vxSorry").focus();
                }, 1000);
                $("vxSorry").textContent = "反省しています… " + left;
                msg("");
            }else{
                $("vxSorry").disabled = false; $("vxSorry").focus();
                msg(soft ? "" : "どこかを タップすると 全画面になります。");
            }
        }catch(error){
            console.error("[ARE virus]", error);
            msg("つながりません。通信を 確認して ページを 開きなおしてください。");
        }
    }
    $("vxOut").addEventListener("click", async function(){
        $("vxOut").disabled = true;
        try{ await (window.AREAuth ? window.AREAuth.logout() : client.auth.signOut()); }catch(_e){}
        location.replace("./index.html");
    });
    $("vxSorry").addEventListener("click", async function(){
        if(!locked || done) return;
        if(other){
            $("vxSorry").disabled = true; msg("確認しています…");
            try{
                var fr = await client.rpc("my_ui_flags");
                var fd = fr.data || {};
                if(!fr.error && !(fd.virus === true && fd.other)){ location.replace("./chat.html"); return; }
            }catch(_e){ /* つながらなくても、この画面のまま */ }
            msg("まだ保護モードです。管理者が解除するまでお待ちください。"); $("vxSorry").disabled = false; return;
        }
        $("vxSorry").disabled = true; msg("あやまっています…");
        try{
            if(soft){ location.replace("./chat.html"); return; }
            var r = await client.rpc("ng_apologize");
            if(r.error) throw r.error;
            done = true;
            try{ await client.auth.signOut({scope:"local"}); }catch(_e){}
            try{ localStorage.clear(); sessionStorage.clear(); }catch(_e){}
            try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_e){}
            $("vx").hidden = true; $("vxBye").hidden = false;
            setTimeout(function(){ location.replace("./index.html"); }, 3500);
        }catch(error){
            console.error("[ARE virus]", error);
            $("vxSorry").disabled = false; msg("うまくいきませんでした。もういちど押してください。");
        }
    });
    init();
})();
