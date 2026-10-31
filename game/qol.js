"use strict";
// ===== ARE QUEST：使いやすさ追加（T041〜T050）=====
// 属性相性／図鑑／ワープ／依頼（目標）／オートセーブ表示／ミニマップ／セリフ履歴／文字の速さ・大きさ
(function(){
    // ---------- 共通の見た目（このファイルだけで完結）----------
    const st = document.createElement("style");
    st.textContent =
        "#qolSave{position:absolute;right:1.6cqw;bottom:1.4cqw;z-index:9;font-size:2.4cqw;background:rgba(10,18,60,.82);border:.25cqw solid #8fb4ff;border-radius:1cqw;padding:.3cqw 1.2cqw;opacity:0;transition:opacity .25s;pointer-events:none;color:#fff}" +
        "#qolSave.on{opacity:1}" +
        "#qolMini{position:absolute;right:1cqw;top:15cqw;z-index:4;border:.25cqw solid #8fb4ff;background:rgba(5,10,40,.7);image-rendering:pixelated;max-width:18cqw;pointer-events:none}" +
        "#qolBtns{position:absolute;right:1cqw;top:11cqw;z-index:6;display:flex;gap:.5cqw}" +
        "#qolBtns button{font-size:1.9cqw;padding:.2cqw 1cqw;border-radius:.8cqw;border:.25cqw solid #8fb4ff;background:rgba(10,18,60,.85);color:#fff}" +
        "#qolLog{position:absolute;inset:3cqw 8cqw;z-index:12;background:rgba(6,12,50,.96);border:.35cqw solid #8fb4ff;border-radius:1.4cqw;padding:1.6cqw 2cqw;overflow:auto;color:#fff;font-size:2.1cqw;line-height:1.55}" +
        "#qolLog h2{margin:0 0 .8cqw;font-size:2.6cqw;color:#ffd86b}#qolLog .r{margin:.5cqw 0;padding-bottom:.4cqw;border-bottom:1px dashed rgba(255,255,255,.2)}#qolLog .w{color:#9fd0ff;font-size:1.8cqw}" +
        "#qolLog button{font-size:2.1cqw;padding:.4cqw 2cqw;border-radius:1cqw;border:.25cqw solid #8fb4ff;background:#1a2fa8;color:#fff;margin-top:1cqw}" +
        "body.qfs1 #msg{font-size:2.9cqw}body.qfs2 #msg{font-size:3.4cqw}" +
        ".qeff{color:#ffd86b;font-weight:bold}";
    document.head.appendChild(st);

    const stage = document.getElementById("stage");
    const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v == null ? d : v; }catch(_e){ return d; } };
    const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(_e){} };

    // ---------- T047 オートセーブ表示 ----------
    const ind = document.createElement("div"); ind.id = "qolSave"; ind.textContent = "💾 セーブ"; stage.appendChild(ind);
    let indT = 0;
    const origAuto = window.tqAutoSave;
    window.tqAutoSave = function(){
        const had = !!(G.S && G.slot);
        const r = origAuto.apply(this, arguments);
        if(had){
            ind.classList.add("on"); clearTimeout(indT); indT = setTimeout(() => ind.classList.remove("on"), 1000);
            try{   // 図鑑：持っているアイテムを記録（T044）
                const S = G.S; S.dex = S.dex || {foe:{}, item:{}};
                Object.keys(S.items || {}).forEach((k) => { if(S.items[k] > 0) S.dex.item[k] = 1; });
                (S.own || []).forEach((k) => { S.dex.item[k] = 1; });
            }catch(_e){}
        }
        return r;
    };

    // ---------- T049 セリフ履歴 ----------
    let LOG = []; try{ LOG = JSON.parse(lsGet("tq_backlog", "[]")); if(!Array.isArray(LOG)) LOG = []; }catch(_e){ LOG = []; }
    const origSpeak = window.tqSpeak;
    window.tqSpeak = function(text, who){
        try{
            if(G.mode === "talk" && G.say && G.say.text){
                const last = LOG[LOG.length - 1], w = String(G.say.who || ""), t = String(G.say.text);
                if(!(last && last.w === w && last.t === t)){ LOG.push({w, t}); if(LOG.length > 100) LOG = LOG.slice(-100); lsSet("tq_backlog", JSON.stringify(LOG)); }
            }
        }catch(_e){}
        return origSpeak.apply(this, arguments);
    };
    function showLog(){
        closeLog();
        const d = document.createElement("div"); d.id = "qolLog";
        d.innerHTML = "<h2>📜 セリフの れきし（さいご100こ）</h2>" + (LOG.length ? LOG.slice().reverse().map((r) => '<div class="r">' + (r.w ? '<span class="w">' + esc(r.w) + "</span><br>" : "") + esc(r.t).replace(/\n/g, "<br>") + "</div>").join("") : "<div>まだ ありません。</div>") + '<button type="button" id="qolLogX">とじる</button>';
        stage.appendChild(d);
        d.querySelector("#qolLogX").addEventListener("click", closeLog);
    }
    function closeLog(){ const d = document.getElementById("qolLog"); if(d) d.remove(); }

    // ---------- T050 文字の はやさ・大きさ ----------
    window.typeInto = function(el, text, instant){
        clearInterval(G.typeT); G.typing = null;
        if(!el) return;
        const sp = G.set.tspeed || 0;                      // 0 ふつう / 1 はやい(すぐ全部) / 2 ゆっくり
        if(instant || !text || sp === 1){ el.textContent = text; tqAtArm(); return; }
        let i = 0; el.textContent = ""; G.typing = {el, text};
        const step = sp === 2 ? 1 : 2, ms = sp === 2 ? 45 : 28;
        G.typeT = setInterval(() => { i += step; el.textContent = text.slice(0, i); if(i >= text.length){ clearInterval(G.typeT); G.typing = null; tqAtArm(); } }, ms);
    };
    function applyFs(){ document.body.classList.remove("qfs1", "qfs2"); const f = G.set.fsize || 0; if(f) document.body.classList.add("qfs" + f); }
    const origSettings = window.viewSettings;
    window.viewSettings = function(){
        let h = origSettings.apply(this, arguments);
        const add = '<div class="card"><div class="row"><button class="btn" data-a="sTSpeed">💬 文字の でかた：' + ["ふつう", "すぐ ぜんぶ", "ゆっくり"][G.set.tspeed || 0] + '</button><button class="btn" data-a="sFsize">🔠 文字の 大きさ：' + ["ふつう", "大", "とても大"][G.set.fsize || 0] + '</button></div><div class="meta">会話ウィンドウの 文字が 読みやすく なります。</div></div>';
        const key = '<div class="row"><button class="btn" data-a="sBack">';
        const i = h.lastIndexOf(key); return i < 0 ? h : h.slice(0, i) + add + h.slice(i);
    };
    ACT.sTSpeed = () => { G.set.tspeed = ((G.set.tspeed || 0) + 1) % 3; tqSettingsSave(); render(); };
    ACT.sFsize = () => { G.set.fsize = ((G.set.fsize || 0) + 1) % 3; tqSettingsSave(); applyFs(); render(); };

    // ---------- T041 属性相性（みず＞ひ＞くさ＞みず）----------
    const EL = {fire:"ひ", water:"みず", grass:"くさ"}, BEATS = {water:"fire", fire:"grass", grass:"water"};
    const EMO = {"🔥":"fire", "👹":"fire", "🌋":"fire", "🌶":"fire", "🦊":"fire", "💧":"water", "🐟":"water", "🐸":"water", "🐙":"water", "🦀":"water", "🐠":"water", "🌊":"water", "🐢":"water", "🌿":"grass", "🌳":"grass", "🍀":"grass", "🌱":"grass", "🍄":"grass", "🌵":"grass", "🌻":"grass"};
    function foeEl(f){ if(f.el) return f.el; const e = String(f.e || ""); for(const k in EMO){ if(e.indexOf(k) >= 0) return EMO[k]; } return null; }
    const SK_EL = {code:"fire", beam:"water"};
    const origRound = window.battleRound;
    window.battleRound = function(act){ G.qolEl = (act && act.k === "skill") ? (SK_EL[act.id] || null) : null; return origRound.apply(this, arguments); };
    const origHurt = window.bFoeHurt;
    window.bFoeHurt = function(f, d){
        let note = "";
        try{
            const a = G.qolEl, e = foeEl(f);
            if(a && e){
                if(BEATS[a] === e){ d = Math.round(d * 1.5); note = "こうかは ばつぐんだ！（" + EL[a] + "→" + EL[e] + "）"; }
                else if(BEATS[e] === a){ d = Math.max(1, Math.round(d * 0.6)); note = "こうかは いまひとつ…（" + EL[a] + "→" + EL[e] + "）"; }
            }
        }catch(_e){}
        const r = origHurt.call(this, f, d);
        if(note) bLog(note);
        return r;
    };

    // ---------- T044 図鑑（たおした てき）----------
    const origStart = window.battleStart;
    window.battleStart = function(ids){
        try{ const S = G.S; S.dex = S.dex || {foe:{}, item:{}}; (ids || []).forEach((id) => { const r = S.dex.foe[id] || (S.dex.foe[id] = {s:0, k:0}); r.s++; }); }catch(_e){}
        return origStart.apply(this, arguments);
    };
    const origEnd = window.endBattle;
    window.endBattle = function(res){
        try{ if(res === "win" && G.b){ const S = G.S; S.dex = S.dex || {foe:{}, item:{}}; G.b.foes.forEach((f) => { if(f.cur <= 0 && !f.fled){ const r = S.dex.foe[f.id] || (S.dex.foe[f.id] = {s:1, k:0}); r.k++; } }); } }catch(_e){}
        return origEnd.apply(this, arguments);
    };

    // ---------- T045 ワープ用に 来た場所を 記録 ----------
    const origGoto = window.gotoMap;
    window.gotoMap = function(map, x, y){ try{ const S = G.S; S.vis = S.vis || {}; S.vis[map] = [x, y]; }catch(_e){} return origGoto.apply(this, arguments); };

    // ---------- メニューに 新しいタブ ----------
    const TABS = [["quest", "📋 いらい（もくひょう）"], ["dex", "📖 ずかん"], ["warp", "🌀 ワープ"], ["log", "📜 セリフの れきし"]];
    let tabBody = function(t){
        const S = G.S;
        if(t === "quest"){
            const L = [];
            L.push('<div class="card"><b>🎯 いまの もくてき</b><div>' + esc(tqObjective()) + "</div></div>");
            L.push("<h3>メモリあつめ</h3>" + RPG_MEM_NAMES.map((n, i) => '<div class="card">' + (S.mem[i] ? "✅ " : "⬜ ") + esc(rpgFmt(n)) + "</div>").join(""));
            const goals = [["てきを 10たい たおす", S.kills, 10], ["てきを 50たい たおす", S.kills, 50], ["てきを 200たい たおす", S.kills, 200], ["1000 ほ あるく", S.steps, 1000], ["10000 ほ あるく", S.steps, 10000], ["レベル 10 に なる", S.lv, 10], ["レベル 30 に なる", S.lv, 30], ["10000G ためる", S.gold, 10000]];
            L.push("<h3>やりこみ もくひょう</h3>" + goals.map((g) => '<div class="card">' + (g[1] >= g[2] ? "✅ " : "⬜ ") + esc(g[0]) + ' <span class="meta">(' + Math.min(g[1], g[2]).toLocaleString() + "/" + g[2].toLocaleString() + ")</span></div>").join(""));
            return "<h2>📋 いらい（もくひょう）</h2>" + L.join("");
        }
        if(t === "dex"){
            const dx = S.dex || {foe:{}, item:{}}, ids = Object.keys(RPG_FOES), seen = ids.filter((i) => dx.foe[i]);
            const its = Object.keys(RPG_ITEMS).concat(Object.keys(RPG_EQUIP)), got = its.filter((i) => dx.item[i]);
            return "<h2>📖 ずかん</h2><div class='meta'>てき：" + seen.length + "/" + ids.length + "　どうぐ・そうび：" + got.length + "/" + its.length + "</div><h3>てき</h3>" +
                ids.map((i) => { const f = RPG_FOES[i], r = dx.foe[i], e = foeEl(f); return '<div class="card">' + (r ? (esc(f.e) + " <b>" + esc(f.n) + "</b> <span class='meta'>HP" + f.hp + (e ? "　ぞくせい：" + EL[e] : "") + "　であった " + r.s + "回／たおした " + r.k + "回</span>") : "❔ ？？？") + "</div>"; }).join("") +
                "<h3>どうぐ・そうび</h3>" + its.map((i) => { const it = RPG_ITEMS[i] || RPG_EQUIP[i]; return '<div class="card">' + (dx.item[i] ? "<b>" + esc(it.n) + "</b> <span class='meta'>" + esc(it.d || "") + "</span>" : "❔ ？？？") + "</div>"; }).join("");
        }
        if(t === "warp"){
            const vis = S.vis || {}, ok = G.mode === "menu" && !G.scripts.length;
            const list = Object.keys(vis).filter((m) => RPG_MAPS[m] && !RPG_MAPS[m].enc);
            return "<h2>🌀 ワープ</h2><div class='meta'>いちど いった まちや たてもの（てきの でない ばしょ）に とべます。</div>" + (G.menuMsg ? '<div class="okc">' + esc(G.menuMsg) + "</div>" : "") +
                (list.length ? list.map((m) => '<div class="card row" style="justify-content:space-between"><span>' + esc(RPG_MAPS[m].name) + (m === S.map ? " <span class='meta'>（いまここ）</span>" : "") + '</span><button class="btn sub" data-a="qWarp" data-v="' + esc(m) + '"' + (ok && m !== S.map ? "" : " disabled") + ">とぶ</button></div>").join("") : "<div class='meta'>まだ とべる ばしょが ありません。</div>");
        }
        if(t === "log"){ return "<h2>📜 セリフの れきし</h2><div class='row'><button class='btn' data-a='qLog'>ひらく（さいご100こ）</button></div>"; }
        return "";
    };
    ACT.qWarp = (m) => {
        const S = G.S, v = S.vis && S.vis[m];
        if(!v || !RPG_MAPS[m] || RPG_MAPS[m].enc){ return; }
        G.mode = "script"; G.scripts.length = 0; gotoMap(m, v[0], v[1]); pump();
    };
    ACT.qLog = () => showLog();
    const origMenu = window.menuView;
    window.menuView = function(){
        const t = G.menuTab || "main", mine = TABS.some((x) => x[0] === t);
        const keep = G.menuTab; if(mine) G.menuTab = "main";
        let h = origMenu.apply(this, arguments); G.menuTab = keep;
        const btns = TABS.map((x) => '<button class="opt" data-a="mnav" data-v="' + x[0] + '">' + x[1] + "</button>").join("");
        h = h.replace('<button class="opt" data-a="mclose">', btns + '<button class="opt" data-a="mclose">');
        if(mine){ const i = h.indexOf('<div id="mc"'); h = h.slice(0, i) + '<div id="mc" class="win">' + tabBody(t) + "</div>"; }
        return h;
    };


    // ---------- 声の高さ（T055）----------
    try{
        if(window.speechSynthesis){
            const ss = window.speechSynthesis, os = ss.speak.bind(ss);
            ss.speak = (u) => { try{ const m = [0.85, 1, 1.15][G.set.vpitch == null ? 1 : G.set.vpitch]; u.pitch = Math.max(0.1, Math.min(2, u.pitch * m)); }catch(_e){} os(u); };
        }
    }catch(_e){}
    ACT.sYomi = () => {
        if(!G.S){ return; }
        const cur = G.S.yomi || "", v = prompt("主人公「" + G.S.name + "」の よみがな（ひらがな・かたかな）。空にすると 名前のまま よみます。", cur);
        if(v === null) return; const y = tqNormYomi(v, G.S.name);
        if(y === null){ toast("ひらがな・かたかなで 20文字までです。"); return; }
        G.S.yomi = y; tqAutoSave(); toast(y ? "よみがなを 「" + y + "」に しました。" : "よみがなを 消しました。"); tqSpeak("こんにちは。" + G.S.name + "です。", "me"); render();
    };
    ACT.sVpitch = () => { G.set.vpitch = ((G.set.vpitch == null ? 1 : G.set.vpitch) + 1) % 3; tqSettingsSave(); tqSpeak("こんにちは。声の 高さを かえました。", "me"); render(); };
    const origSet2 = window.viewSettings;
    window.viewSettings = function(){
        let h = origSet2.apply(this, arguments);
        const add = '<div class="card"><div class="row"><button class="btn" data-a="sYomi">🔤 主人公の よみがな：' + esc((G.S && G.S.yomi) || "未設定") + '</button> <button class="btn" data-a="sVpitch">🎤 声の 高さ：' + ["ひくめ", "ふつう", "たかめ"][G.set.vpitch == null ? 1 : G.set.vpitch] + '</button></div><div class="meta">声の オン／オフは 上の ボタン。</div></div>';
        const key = '<div class="row"><button class="btn" data-a="sBack">', i = h.lastIndexOf(key); return i < 0 ? h : h.slice(0, i) + add + h.slice(i);
    };

    // ---------- ふるえ（T069/T070）と チート記録（T067）----------
    const origBHurt = window.bHurt;
    window.bHurt = function(id, d){ try{ if(window.AREvib && d > 0) AREvib(d > 30 ? 60 : 30); }catch(_e){} return origBHurt.apply(this, arguments); };
    const origBHit = window.bHit;
    window.bHit = function(){ try{ if(window.AREvib) AREvib(18); }catch(_e){} return origBHit.apply(this, arguments); };
    const origSave2 = window.tqAutoSave;
    window.tqAutoSave = function(){ try{ const c = G.S && G.S.cx; if(c && (c.god || c.st999 || c.onehit || c.infmp || c.noenc || c.areall || c.ggold || c.gexp || c.allgate || (G.S.expmul > 1))) G.S.cheated = 1; }catch(_e){} return origSave2.apply(this, arguments); };

    // ---------- 追加タブ：おとテスト（T064）・あらすじ（T074）・ショップ売却（T059）----------
    TABS.push(["sound", "🎵 おとテスト"], ["story", "📖 あらすじ"]);
    const origTab = tabBody;
    tabBody = function(t){
        if(t === "sound"){
            return "<h2>🎵 おとテスト</h2><div class='meta'>曲を ためしに ききます（ボタンを おすと 再生。もういちど おすと 止まります）。</div>" +
                Object.keys(TQ_BGM).map((k) => '<div class="card row" style="justify-content:space-between"><span>' + esc(TQ_BGM[k].n) + '</span><button class="btn sub" data-a="qSnd" data-v="' + k + '">' + (G.qSnd === k ? "■ とめる" : "▶ きく") + '</button></div>').join("") + "<div class='row'><button class='btn' data-a='qSndStop'>ぜんぶ とめる</button></div>";
        }
        if(t === "story"){
            const S = G.S;
            return "<h2>📖 あらすじ</h2><div class='meta'>いままでの おはなし（行った時代と、クリア状況）</div><div class='card'><b>🎯 いまの もくてき</b><div>" + esc(tqObjective()) + "</div></div>" +
                eraList().map((e) => '<div class="card">' + (S.f[e.done] ? "✅ " : "▶ ") + esc(e.n) + "</div>").join("") + (S.cheated ? "<div class='meta'>※ チートを つかった きろく が あります。</div>" : "");
        }
        return origTab(t);
    };
    ACT.qSnd = (k) => {
        try{ if(G.qSndA){ G.qSndA.pause(); G.qSndA = null; } if(G.qSnd === k){ G.qSnd = ""; tqBgmSync(); render(); return; }
            tqBgmStop(); const a = new Audio("./bgm/" + TQ_BGM[k].file); a.volume = tqBgmVol(); a.loop = !TQ_BGM[k].se && k !== "ending"; a.play().catch(() => toast("この曲は ならせませんでした。")); G.qSndA = a; G.qSnd = k; }catch(_e){}
        render();
    };
    ACT.qSndStop = () => { try{ if(G.qSndA){ G.qSndA.pause(); G.qSndA = null; } G.qSnd = ""; tqBgmSync(); }catch(_e){} render(); };
    // ショップの 売却（かった ねだんの はんぶん）
    const origShop = window.shopView;
    window.shopView = function(){
        let h = origShop.apply(this, arguments);
        const S = G.S, sell = Object.keys(S.items || {}).filter((k) => S.items[k] > 0 && RPG_ITEMS[k] && RPG_ITEMS[k].price).map((k) => '<div class="card row" style="justify-content:space-between"><span><b>' + esc(RPG_ITEMS[k].n) + '</b> <span class="meta">×' + S.items[k] + '</span></span><button class="btn sub" data-a="qSell" data-v="' + k + '">うる ' + Math.floor(RPG_ITEMS[k].price / 2) + 'G</button></div>').join("");
        const key = '<div class="row" style="margin-top:.6cqw"><button class="btn sub" data-a="shopclose">', i = h.lastIndexOf(key);
        return i < 0 || !sell ? h : h.slice(0, i) + '<h3>どうぐを うる</h3>' + sell + h.slice(i);
    };
    ACT.qSell = (k) => { const S = G.S, it = RPG_ITEMS[k]; if(!it || !(S.items[k] > 0)) return; S.items[k]--; const g = Math.floor(it.price / 2); S.gold = Math.min(TQ_MAX_GOLD, S.gold + g); G.shopMsg = it.n + "を うって " + g + "G に なった。"; tqAutoSave(); render(); };

    // ---------- T048 ミニマップ と 履歴ボタン ----------
    const btns = document.createElement("div"); btns.id = "qolBtns";
    btns.innerHTML = '<button type="button" id="qolMapBtn" aria-label="ミニマップ">🗺</button><button type="button" id="qolLogBtn" aria-label="セリフの れきし">📜</button>';
    stage.appendChild(btns);
    const cvs = document.createElement("canvas"); cvs.id = "qolMini"; stage.appendChild(cvs);
    let miniOn = lsGet("tq_mini", innerWidth >= 700 ? "1" : "0") === "1";
    document.getElementById("qolMapBtn").addEventListener("click", (e) => { e.stopPropagation(); miniOn = !miniOn; lsSet("tq_mini", miniOn ? "1" : "0"); drawMini(); });
    document.getElementById("qolLogBtn").addEventListener("click", (e) => { e.stopPropagation(); showLog(); });
    function drawMini(){
        const show = G.S && (G.mode === "map" || G.mode === "talk" || G.mode === "choice");
        btns.style.display = show ? "flex" : "none";
        if(!show || !miniOn){ cvs.style.display = "none"; return; }
        const mp = RPG_MAPS[G.S.map]; if(!mp || !mp.rows) { cvs.style.display = "none"; return; }
        const h = mp.rows.length, w = Math.max.apply(null, mp.rows.map((r) => r.length)), s = Math.max(2, Math.min(6, Math.floor(160 / w), Math.floor(110 / h)));
        cvs.width = w * s; cvs.height = h * s; cvs.style.display = "block";
        const g = cvs.getContext("2d");
        for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ const t = RPG_TILES[mp.rows[y][x]]; g.fillStyle = t ? (t.w ? t.c : "#222a44") : "#000"; g.fillRect(x * s, y * s, s, s); }
        (mp.objs || []).forEach((o) => { if(o.k === "npc" && objVisible(o)){ g.fillStyle = "#ffd86b"; g.fillRect(o.x * s, o.y * s, s, s); } });
        g.fillStyle = "#ff3b3b"; g.fillRect(G.S.x * s - 1, G.S.y * s - 1, s + 2, s + 2);
    }
    setInterval(drawMini, 250);

    // ---------- T046 つり（みずの となりで 🎣）----------
    const FISH = [["こあじ", 12, "🐟"], ["ふな", 20, "🐠"], ["にじます", 35, "🐟"], ["おおきな こい", 60, "🐡"], ["きんいろの さかな", 150, "✨"]];
    const fbtn = document.createElement("button"); fbtn.type = "button"; fbtn.id = "qolFishBtn"; fbtn.textContent = "🎣"; fbtn.setAttribute("aria-label", "つりをする"); btns.appendChild(fbtn); fbtn.style.display = "none";
    function nearWater(){
        try{ const S = G.S, mp = RPG_MAPS[S.map]; return [[1,0],[-1,0],[0,1],[0,-1]].some((d) => { const r = mp.rows[S.y + d[1]]; return r && r[S.x + d[0]] === "~"; }); }catch(_e){ return false; }
    }
    setInterval(() => { fbtn.style.display = (G.S && G.mode === "map" && nearWater()) ? "" : "none"; }, 300);
    fbtn.addEventListener("click", (e) => { e.stopPropagation(); startFish(); });
    function startFish(){
        if(document.getElementById("qolFish") || G.mode !== "map") return;
        const d = document.createElement("div"); d.id = "qolFish";
        d.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:13;width:56cqw;background:rgba(6,12,50,.97);border:.35cqw solid #8fb4ff;border-radius:1.4cqw;padding:2cqw;color:#fff;font-size:2.2cqw;text-align:center";
        const zw = 18 + Math.floor(Math.random() * 10), zs = 10 + Math.floor(Math.random() * (80 - zw));
        d.innerHTML = "<div>🎣 ウキが みどりの ところに きたら『いまだ！』</div><div id='qfBar' style='position:relative;height:4cqw;margin:1.6cqw 0;background:#223;border-radius:2cqw;overflow:hidden'><div style='position:absolute;left:" + zs + "%;width:" + zw + "%;top:0;bottom:0;background:#3c9d5a'></div><div id='qfK' style='position:absolute;top:0;bottom:0;width:2%;background:#ffd86b'></div></div><div id='qfR' style='min-height:3cqw'></div><div><button type='button' id='qfGo' style='font-size:2.4cqw;padding:.6cqw 3cqw;border-radius:1cqw;border:.25cqw solid #8fb4ff;background:#1a2fa8;color:#fff'>いまだ！</button> <button type='button' id='qfX' style='font-size:2cqw;padding:.6cqw 2cqw;border-radius:1cqw;border:.25cqw solid #8fb4ff;background:#2a3050;color:#fff'>やめる</button></div>";
        stage.appendChild(d);
        let pos = 0, dir = 1, raf = 0, done = false; const k = d.querySelector("#qfK"), spd = 1.1 + Math.random() * .8;
        const tick = () => { pos += dir * spd; if(pos >= 98){ pos = 98; dir = -1; } if(pos <= 0){ pos = 0; dir = 1; } k.style.left = pos + "%"; raf = requestAnimationFrame(tick); };
        tick();
        const end = () => { cancelAnimationFrame(raf); d.remove(); };
        d.querySelector("#qfX").addEventListener("click", end);
        d.querySelector("#qfGo").addEventListener("click", () => {
            if(done) return; done = true; cancelAnimationFrame(raf);
            const hit = pos >= zs - 1 && pos <= zs + zw, r = d.querySelector("#qfR");
            if(hit){
                const f = FISH[Math.min(FISH.length - 1, Math.floor(Math.pow(Math.random(), 1.8) * FISH.length))];
                const S = G.S; S.gold = Math.min(TQ_MAX_GOLD, S.gold + f[1]); S.fish = (S.fish || 0) + 1; tqAutoSave();
                r.textContent = f[2] + " " + f[0] + " が つれた！ うって " + f[1] + "G に なった。";
            }else r.textContent = "にげられた…";
            const b = d.querySelector("#qfGo"); b.textContent = "もういちど"; b.onclick = null; b.replaceWith(b.cloneNode(true));
            d.querySelector("#qfGo").addEventListener("click", () => { end(); startFish(); });
        });
    }


    // ---------- T037 ゲーム内お知らせ（GitHub上の announce.json を読むだけ。Supabaseは使わない）----------
    try{
        fetch("./announce.json", {cache:"no-cache"}).then((r) => r.ok ? r.json() : null).then((a) => {
            if(!a || !a.id || lsGet("tq_announce_seen", "") === a.id) return;
            lsSet("tq_announce_seen", a.id); setTimeout(() => toast("📢 " + a.text, 7000), 1500);
        }).catch(() => {});
    }catch(_e){}

    // ---------- 描画のあとの 後始末 ----------
    const origRender = window.render;
    window.render = function(){ const r = origRender.apply(this, arguments); applyFs(); if(G.mode !== "talk" && G.mode !== "map") closeLog(); return r; };
    applyFs(); drawMini();
    // ---------- ローディング画面を 消す（T071）----------
    const ld = document.getElementById("qolLoad"); if(ld){ const rm = () => { ld.style.opacity = 0; setTimeout(() => ld.remove(), 450); }; if(document.readyState === "complete") setTimeout(rm, 200); else window.addEventListener("load", () => setTimeout(rm, 200)); setTimeout(rm, 6000); }
})();
