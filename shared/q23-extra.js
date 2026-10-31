"use strict";
// ===== game2 / game3 共通のおまけ機能 =====
// ミニマップ・ボスの記録・称号一覧・プレイ記録・会話の履歴・戦闘ログ・会話の読み上げ・追加せってい
// main.js から createExtra(...) で つかう。ゲーム本体の せってい(cfg)に 値を 足すだけで、サーバーは つかいません。
export function createExtra(h){
    const {ctx, cfg, saveCfg, prefix} = h, UI = ctx.UI;
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"})[c]);
    const ls = {get(k, d){ try{ const v = localStorage.getItem(prefix + k); return v == null ? d : v; }catch(_e){ return d; } }, set(k, v){ try{ localStorage.setItem(prefix + k, v); }catch(_e){} }};
    // ---- 設定の 初期値 ----
    if(cfg.enc == null) cfg.enc = 1;      // 0 すくなめ / 1 ふつう / 2 おおめ
    if(cfg.cam == null) cfg.cam = 0;      // 0 ふつう / 1 ちかめ / 2 とおめ
    if(cfg.mini == null) cfg.mini = true;
    if(cfg.pen == null) cfg.pen = 0;      // 0 お金が はんぶん / 1 ペナルティなし
    if(cfg.voice == null) cfg.voice = false;

    // ---- 会話の れきし ----
    let LOG = []; try{ LOG = JSON.parse(ls.get("backlog", "[]")); if(!Array.isArray(LOG)) LOG = []; }catch(_e){ LOG = []; }
    const pushLog = (w, t) => { const last = LOG[LOG.length - 1]; if(last && last.w === w && last.t === t) return; LOG.push({w, t}); if(LOG.length > 150) LOG = LOG.slice(-150); ls.set("backlog", JSON.stringify(LOG)); };
    const origSay = UI.say.bind(UI);
    UI.say = function(who, text){
        try{ pushLog(who || "", String(text)); if(cfg.voice) speak(String(text), who); }catch(_e){}
        return origSay(who, text);
    };
    // ---- 会話の 読み上げ（ブラウザの こえ。男女で 声を えらぶ）----
    const MALE = /ichiro|otoya|takumi|hattori|keita|kenji|ryo|male|男|いちろう|おとや/i, FEMALE = /kyoko|haruka|ayumi|nanami|sayaka|mizuki|o-?ren|female|女|google|きょうこ|はるか/i;
    function speak(text, who){
        if(!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") return;
        let src = String(text); try{ const S = ctx.S; if(S && S.yomi && S.name) src = src.split(S.name).join(S.yomi); }catch(_e){}
        const clean = src.replace(/[「」『』（）()…♪★☆]/g, "、").replace(/\s+/g, ""); if(!clean.replace(/、/g, "")) return;
        const ss = window.speechSynthesis; ss.cancel();
        const u = new SpeechSynthesisUtterance(clean); u.lang = "ja-JP";
        const fem = /ミカ|女|ちゃん|さん$/.test(who || "") && !/くん/.test(who || "");
        const list = (ss.getVoices() || []).filter((x) => /^ja/i.test(x.lang));
        const v = fem ? (list.find((x) => FEMALE.test(x.name) || !MALE.test(x.name))) : list.find((x) => MALE.test(x.name) && !/female/i.test(x.name));
        if(v) u.voice = v; else u.pitch = fem ? 1.3 : .7;
        ss.speak(u);
    }
    // ---- 戦闘ログ（さいご の 戦いの ぶん）----
    let BLOG = [];
    function patchBattle(Battle){
        if(!Battle || !Battle.prototype || Battle.prototype.__q23) return; Battle.prototype.__q23 = true;
        const ol = Battle.prototype.log;
        Battle.prototype.log = function(t){ try{ BLOG.push(String(t)); if(BLOG.length > 120) BLOG = BLOG.slice(-120); }catch(_e){} return ol.apply(this, arguments); };
        const or = Battle.prototype.run;
        Battle.prototype.run = function(){ BLOG = []; try{ const S = ctx.S; S.stats = S.stats || {play: 0, battles: 0, wins: 0}; S.stats.battles++; }catch(_e){} const p = or.apply(this, arguments); return Promise.resolve(p).then((r) => { try{ if(r === "win") ctx.S.stats.wins++; }catch(_e){} return r; }); };
    }

    // ---- プレイ記録（時間）----
    let acc = 0;
    function tickPlay(dt){ const S = ctx.S; if(!S) return; S.stats = S.stats || {play: 0, battles: 0, wins: 0}; acc += dt; if(acc >= 1){ S.stats.play += Math.floor(acc); acc -= Math.floor(acc); } }

    // ---- ミニマップ ----
    const cv = document.createElement("canvas"); cv.id = "q23Mini"; cv.style.cssText = "position:fixed;right:8px;top:64px;z-index:6;border:2px solid rgba(255,255,255,.6);border-radius:8px;background:rgba(4,10,40,.55);pointer-events:none;display:none";
    document.body.appendChild(cv);
    const mbtn = document.createElement("button"); mbtn.type = "button"; mbtn.textContent = "🗺"; mbtn.setAttribute("aria-label", "ミニマップ");
    mbtn.style.cssText = "position:fixed;right:8px;top:34px;z-index:7;width:30px;height:28px;border-radius:8px;border:1px solid #8fb4ff;background:rgba(10,18,60,.8);color:#fff;font-size:15px;padding:0;display:none";
    mbtn.addEventListener("click", (e) => { e.stopPropagation(); cfg.mini = !cfg.mini; saveCfg(); }); document.body.appendChild(mbtn);
    function drawMini(){
        const st = h.getState(), md = h.getMap(), P = h.getP();
        const show = st === "field" && md && P;
        mbtn.style.display = show ? "block" : "none";
        if(!show || !cfg.mini){ cv.style.display = "none"; return; }
        const sz = md.size || [64, 64], b = md.interior && md.bounds ? md.bounds : [-sz[0] / 2, -sz[1] / 2, sz[0] / 2, sz[1] / 2];
        const W = b[2] - b[0], D = b[3] - b[1], k = Math.min(150 / W, 150 / D), pw = Math.max(40, Math.round(W * k)), ph = Math.max(40, Math.round(D * k));
        if(cv.width !== pw || cv.height !== ph){ cv.width = pw; cv.height = ph; } cv.style.display = "block";
        const g = cv.getContext("2d"), X = (x) => (x - b[0]) * k, Z = (z) => (z - b[1]) * k;
        g.clearRect(0, 0, pw, ph); g.fillStyle = md.interior ? "#3a3350" : "#2f6b3a"; g.fillRect(0, 0, pw, ph);
        (md.water || []).forEach((w) => { g.fillStyle = "#3a78c8"; g.fillRect(X(w[0]), Z(w[1]), (w[2] - w[0]) * k, (w[3] - w[1]) * k); });
        (md.paths || []).forEach((p) => { g.fillStyle = "#c9b27a"; g.fillRect(X(p[0]), Z(p[1]), (p[2] - p[0]) * k, (p[3] - p[1]) * k); });
        (md.trees || []).forEach((t) => { g.fillStyle = "#1f4a2a"; g.fillRect(X(t[0]) - 1, Z(t[1]) - 1, 2, 2); });
        (md.buildings || []).forEach((q) => { g.fillStyle = "#8a6a5a"; g.fillRect(X(q.x - q.w / 2), Z(q.z - q.d / 2), q.w * k, q.d * k); });
        (md.warps || []).forEach((w) => { g.fillStyle = "#6ad0ff"; g.beginPath(); g.arc(X(w.x), Z(w.z), 3, 0, 7); g.fill(); });
        (h.getNpcs() || []).forEach((n) => { g.fillStyle = "#ffd86b"; g.fillRect(X(n.x) - 1.5, Z(n.z) - 1.5, 3, 3); });
        (h.getBossSpots() || []).forEach((s) => { g.fillStyle = "#ff5a5a"; g.fillRect(X(s.x) - 2, Z(s.z) - 2, 4, 4); });
        g.fillStyle = "#fff"; g.beginPath(); g.arc(X(P.x), Z(P.z), 3.5, 0, 7); g.fill(); g.strokeStyle = "#f33"; g.lineWidth = 1.5; g.stroke();
        g.beginPath(); g.moveTo(X(P.x), Z(P.z)); g.lineTo(X(P.x) + Math.sin(P.yaw) * 9, Z(P.z) + Math.cos(P.yaw) * 9); g.stroke();
    }
    let mt = 0;
    function frame(dt){ tickPlay(dt); mt += dt; if(mt > .12){ mt = 0; try{ drawMini(); }catch(_e){} } }

    // ---- 記録の 画面 ----
    const fmt = (sec) => { const m = Math.floor(sec / 60); return Math.floor(m / 60) + "時間" + (m % 60) + "分"; };
    async function textCard(title, body){
        if(UI.menu){ await UI.menu(title, body.split("\n").map((l) => ({label: l})), {cancel: true}); }
    }
    function bossList(){
        const f = (ctx.data.maps.field && ctx.data.maps.field.bosses) || [];
        return f.map((b) => ({id: b.id, name: b.name, done: !!(ctx.S.flags && ctx.S.flags["fb_" + b.id]), rec: ctx.S.bossRec && ctx.S.bossRec[b.id]}));
    }
    async function menu(){
        const S = ctx.S;
        for(;;){
            const st = S.stats || {play: 0, battles: 0, wins: 0}, bl = bossList();
            const r = await UI.menu("おまけ・きろく", [
                {label: "プレイ きろく", meta: fmt(st.play || 0)},
                {label: "ボスの きろく", meta: bl.filter((b) => b.done).length + "/" + bl.length},
                {label: "しょうごう いちらん", meta: (S.titles || []).length + "こ"},
                {label: "かいわの れきし", meta: LOG.length + "こ"},
                {label: "さいごの 戦闘ログ", meta: BLOG.length + "行"},
                {label: "セーブを ファイルに（⚙ から）", meta: "かんたん"},
                {label: "主人公の よみがな", meta: S.yomi || "未設定"}
            ], {cancel: true});
            if(r < 0) return;
            if(r === 0) await textCard("プレイ きろく", ["プレイ時間：" + fmt(st.play || 0), "歩いた きょり：" + Math.round(S.steps || 0) + " m", "戦闘：" + (st.battles || 0) + "回（勝ち " + (st.wins || 0) + "回）", "いまの 章：第" + S.chapter + "話", "所持金：" + S.gold + "G"].join("\n"));
            else if(r === 1) await textCard("ボスの きろく", bl.length ? bl.map((b) => (b.done ? "✅ " : "⬜ ") + b.name + (b.rec ? "（" + b.rec.date + "　" + b.rec.n + "回）" : "")).join("\n") : "まだ ボスは いません");
            else if(r === 2) await textCard("しょうごう いちらん", (S.titles || []).length ? S.titles.map((t) => "🏅 " + t).join("\n") : "まだ しょうごうは ありません");
            else if(r === 3) await textCard("かいわの れきし（さいご20こ）", LOG.slice(-20).reverse().map((x) => (x.w ? x.w + "：" : "") + x.t.replace(/\n/g, " ")).join("\n") || "まだ ありません");
            else if(r === 4) await textCard("さいごの 戦闘ログ", BLOG.slice(-25).reverse().join("\n") || "まだ ありません");
            else if(r === 5) UI.toast("画面の左下の ⚙ →「📤 書き出す」で ファイルに できます。", 3500);
            else if(r === 6){ const v = prompt("主人公「" + S.name + "」の よみがな（ひらがな・かたかな）。空にすると 名前のまま よみます。", S.yomi || ""); if(v !== null){ const y = v.normalize("NFKC").replace(/\s+/g, ""); if(!y) S.yomi = ""; else if(/^[ぁ-ゖァ-ヺー・]{1,16}$/.test(y)) S.yomi = y; else UI.toast("ひらがな・かたかなで 16文字までです。", 3000); } }
        }
    }
    // ボスを たおしたとき
    function noteBoss(id){ const S = ctx.S; S.bossRec = S.bossRec || {}; const r = S.bossRec[id] || (S.bossRec[id] = {n: 0, date: ""}); r.n++; const d = new Date(); r.date = (d.getMonth() + 1) + "/" + d.getDate(); }

    // ---- 追加の せってい（settingsMenu に 足す）----
    const EN = ["すくなめ", "ふつう", "おおめ"], CM = ["ふつう", "ちかめ", "とおめ"];
    const settingsItems = () => [
        {label: "てきの でる かいすう", meta: EN[cfg.enc]},
        {label: "カメラの きょり", meta: CM[cfg.cam]},
        {label: "ミニマップ", meta: cfg.mini ? "ひょうじ" : "かくす"},
        {label: "まけた ときの ペナルティ", meta: cfg.pen ? "なし" : "お金が はんぶん"},
        {label: "かいわを 声で よむ", meta: cfg.voice ? "ON" : "OFF"}
    ];
    function settingsHandle(i){
        if(i === 0) cfg.enc = (cfg.enc + 1) % 3; else if(i === 1) cfg.cam = (cfg.cam + 1) % 3; else if(i === 2) cfg.mini = !cfg.mini;
        else if(i === 3) cfg.pen = cfg.pen ? 0 : 1; else if(i === 4){ cfg.voice = !cfg.voice; if(!cfg.voice){ try{ speechSynthesis.cancel(); }catch(_e){} } }
        saveCfg();
    }
    const encMul = () => [.5, 1, 1.6][cfg.enc] || 1;
    const camMul = () => [1, .78, 1.35][cfg.cam] || 1;

    // ---- はじめての 10分（ガイド）----
    const TUTO = [["うごく", "WASD／スティックで 歩きます。Shiftで ダッシュ。まわりの 人に ちかづいて Eキー（Aボタン）で 話せます。"], ["メニュー", "Esc／メニューボタンで つよさ・どうぐ・ずかん・セーブが ひらけます。"], ["てきが でる場所", "地面が 赤く 光る ところには モンスターが 出ます。町や 青い道は 安全です。"], ["戦闘", "コマンドを えらんで たたかいます。オートを ONに すると 自動で すすみます。"], ["迷ったら", "メニューの『もくてき』を 見ましょう。左下の ⚙ では 文字の 大きさや 動きの へらしかたを 変えられます。"]];
    function tutorial(force){
        if(!force && ls.get("tuto", "") === "1") return;
        if(document.getElementById("q23Tuto")) return;
        let i = 0; const d = document.createElement("div"); d.id = "q23Tuto";
        d.style.cssText = "position:fixed;inset:0;z-index:2000;background:rgba(0,0,20,.8);display:flex;align-items:center;justify-content:center";
        const paint = () => { d.innerHTML = '<div style="max-width:520px;width:88%;background:#0b1230;border:2px solid #8fb4ff;border-radius:14px;padding:18px;color:#fff;font:16px/1.7 system-ui,sans-serif"><div style="opacity:.7">' + (i + 1) + ' / ' + TUTO.length + '</div><h2 style="margin:4px 0 8px;color:#ffd86b">' + esc(TUTO[i][0]) + '</h2><div>' + esc(TUTO[i][1]) + '</div><div style="margin-top:14px;text-align:right"><button id="q23tp" style="margin-right:8px">◀</button><button id="q23tn">' + (i === TUTO.length - 1 ? "はじめる" : "つぎへ ▶") + '</button> <button id="q23tx" style="margin-left:8px">とじる</button></div></div>';
            d.querySelector("#q23tp").onclick = () => { if(i > 0){ i--; paint(); } }; d.querySelector("#q23tn").onclick = () => { if(i < TUTO.length - 1){ i++; paint(); } else close(); }; d.querySelector("#q23tx").onclick = close; };
        const close = () => { ls.set("tuto", "1"); d.remove(); };
        document.body.appendChild(d); paint();
    }
    return {frame, menu, settingsItems, settingsHandle, patchBattle, noteBoss, encMul, camMul, tutorial, pushLog};
}
