"use strict";
// ===== ゲームを おわる ボタン ＋ コントローラー対応（Switch Proコントローラー／Xbox／PS 等。ブラウザの Gamepad API）=====
(function(){
    // ---- おわる：自動セーブ → BGM停止 → タブを閉じる（閉じられない時は ホームへ）
    function quitNow(){
        try{ if(G.S && window.tqAutoSave) tqAutoSave(); }catch(_e){}
        try{ if(window.tqBgmStop) tqBgmStop(); if(window.tqSpeakStop) tqSpeakStop(); }catch(_e){}
        try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(_e){}
        try{ window.close(); }catch(_e){}
        // ブラウザの決まりで 閉じられない場合は、ホーム（ログイン画面）へ もどる
        setTimeout(() => { try{ location.href = "../login.html"; }catch(_e){} }, 350);
    }
    ACT.tQuit = ACT.quit = () => {
        const inGame = !!(G.S && G.mode !== "title");
        askYes((inGame ? "ここまでの 冒険を 自動で 記録して、\n" : "") + "ゲームを おわりますか？\n（ブラウザの タブが とじます。とじないときは ホームへ もどります）", quitNow);
    };
    const bq = document.getElementById("btnQuit");
    if(bq) bq.addEventListener("click", () => { if(!G.dlg) ACT.quit(); });

    // ---- コントローラー
    // 標準配置: 0=下(Switchの B) 1=右(Switchの A) 2=左(Y) 3=上(X) 4=L 5=R 8=− 9=＋ 12-15=十字キー
    const pressed = {}, nextAt = {};
    let started = false, seen = false, prevDown = [], lastT = 0;
    function fire(k){
        try{ handleKey(k); }catch(e){ console.error("[pad]", e); }
        try{ if(window.tqBgmSync) tqBgmSync(); }catch(_e){}
    }
    function poll(){
        const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
        const now = performance.now();
        const want = {}, down = [], axs = {lx:0, ly:0, rx:0, ry:0};
        for(const gp of pads){
            if(!gp || !gp.connected) continue;
            const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
            const ax = gp.axes || [];
            const lx = ax[0] || 0, ly = ax[1] || 0;
            for(let i = 0; i < 17; i++) if(b(i)) down[i] = true;
            if(Math.abs(lx) > Math.abs(axs.lx)) axs.lx = lx; if(Math.abs(ly) > Math.abs(axs.ly)) axs.ly = ly;
            if(Math.abs(ax[2] || 0) > Math.abs(axs.rx)) axs.rx = ax[2] || 0; if(Math.abs(ax[3] || 0) > Math.abs(axs.ry)) axs.ry = ax[3] || 0;
            if(b(12) || ly < -0.6) want.up = 1;
            if(b(13) || ly > 0.6) want.down = 1;
            if(b(14) || lx < -0.6) want.left = 1;
            if(b(15) || lx > 0.6) want.right = 1;
            if(b(1)) want.ok = 1;                          // A
            if(b(0) || b(2)) want.cancel = 1;              // B / Y
            if(b(3) || b(9)) want.menu = 1;                // X / ＋
            if(b(8)) want.cancel = 1;                      // −
        }
        // ミニゲーム中（AREの達人・シューティング）は 専用の入力（ボタンを そのまま わたす）
        const edge = []; for(let i = 0; i < 17; i++) edge[i] = !!down[i] && !prevDown[i];
        const dtp = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016; lastT = now; prevDown = down.slice();
        const hook = window.TQ_PAD && window.TQ_PAD.game;
        if(hook){
            let used = false; try{ used = hook(down, edge, axs, dtp) === true; }catch(e){ console.error("[pad-game]", e); }
            if(used){ ["up", "down", "left", "right", "ok", "cancel", "menu"].forEach((k) => { pressed[k] = want[k] ? 1 : 0; }); requestAnimationFrame(poll); return; }
        }
        ["up", "down", "left", "right", "ok", "cancel", "menu"].forEach((k) => {
            if(want[k]){
                const move = k === "up" || k === "down" || k === "left" || k === "right";
                if(!pressed[k]){ pressed[k] = 1; nextAt[k] = now + 320; fire(k); }
                else if(move && now >= nextAt[k]){ nextAt[k] = now + (G.mode === "map" ? 130 : 200); fire(k); }
            } else pressed[k] = 0;
        });
        requestAnimationFrame(poll);
    }
    function start(){ if(started) return; started = true; requestAnimationFrame(poll); }
    window.addEventListener("gamepadconnected", (e) => {
        start();
        if(!seen){ seen = true; try{ toast("🎮 コントローラーを みつけました！（A=けってい B=もどる X/＋=メニュー）"); }catch(_e){} }
    });
    window.addEventListener("gamepaddisconnected", () => { try{ toast("🎮 コントローラーが はずれました"); }catch(_e){} });
    // すでに つながっていて イベントが来ない場合に そなえて、最初の操作でも調べる
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, () => {
        try{ const l = navigator.getGamepads ? navigator.getGamepads() : []; for(const g of l){ if(g){ start(); return; } } }catch(_e){}
    }, {passive:true}));
    window.TQ_PAD = Object.assign(window.TQ_PAD || {}, {start});
})();
