"use strict";
// ===== 大富豪 〜本格ルール・全部入り〜 =====
// ・3〜6人（あなた＋CPU）。ジョーカー0〜2枚。大富豪／富豪／平民／貧民／大貧民の階級と、ラウンドごとのカード交換つき。
// ・数字（3〜2）ごとに「技」を自由にわりあて：切り・スキップ・リバース・バック・もう一度・渡し・捨て・ボンバー・蘇生・トレード。
// ・革命／革命返し／階段／縛り（2枚・3枚縛り）／スペ3返し／都落ち／反則上がり／ジョーカーのワイルド など、すべてON/OFFできます。
// ・出せるカードが1枚もないときは、パスを押さなくても自動でパスします。
(function(){
    const $ = (id) => document.getElementById(id);
    const SUITS = ["♠", "♥", "♦", "♣"], REDS = [false, true, true, false];
    const RL = {3:"3", 4:"4", 5:"5", 6:"6", 7:"7", 8:"8", 9:"9", 10:"10", 11:"J", 12:"Q", 13:"K", 14:"A", 15:"2", 16:"JK"};
    const TECHS = {"":"なし", clear:"切り（場を流す）", skip:"スキップ（枚数ぶん飛ばす）", reverse:"リバース（回る向きが逆）", back:"バック（場が流れるまで強さが逆転）", again:"もう一度（続けて自分の番）", give:"渡し（枚数ぶん次の人へ渡す）", discard:"捨て（枚数ぶん手札を捨てる）", bomb:"ボンバー（数字を言って全員が捨てる）", revive:"蘇生（捨て札から枚数ぶん拾う）", trade:"トレード（次の人と1枚こうかん）"};
    const NAMES = ["あなた", "ヒカリ", "ゴロー", "ミドリ", "ソラ", "レン"];
    const RANKSETS = {
        3: [["大富豪", "👑"], ["平民", "🙂"], ["大貧民", "💀"]],
        4: [["大富豪", "👑"], ["富豪", "💰"], ["貧民", "😟"], ["大貧民", "💀"]],
        5: [["大富豪", "👑"], ["富豪", "💰"], ["平民", "🙂"], ["貧民", "😟"], ["大貧民", "💀"]],
        6: [["大富豪", "👑"], ["富豪", "💰"], ["平民", "🙂"], ["平民", "🙂"], ["貧民", "😟"], ["大貧民", "💀"]]
    };
    const noTech = () => ({3:"", 4:"", 5:"", 6:"", 7:"", 8:"", 9:"", 10:"", 11:"", 12:"", 13:"", 14:"", 15:""});
    const BASE = {players:4, jokers:2, rounds:5, first:"d3", exchange:true, revolution:4, revCounter:true, stairRev:true, stairs:false, stairMin:3,
        lock:true, lockN:2, spade3:true, jokerWild:true, miyako:false, foulEight:false, foulJoker:false, foulTwo:false, foulRev:false,
        autoPass:true, speed:1, cpu:1, tech:Object.assign(noTech(), {8:"clear"})};
    const PRESETS = {
        standard:{label:"標準", set:{}},
        pro:{label:"本格（定番ルール）", set:{stairs:true, miyako:true, foulEight:true, tech:Object.assign(noTech(), {8:"clear", 11:"back"})}},
        maniac:{label:"マニア（全部入り）", set:{stairs:true, miyako:true, foulEight:true, foulJoker:true, foulTwo:true, lockN:3, tech:{3:"", 4:"revive", 5:"skip", 6:"trade", 7:"give", 8:"clear", 9:"reverse", 10:"discard", 11:"back", 12:"bomb", 13:"again", 14:"", 15:""}}},
        simple:{label:"シンプル", set:{lock:false, spade3:false, jokers:1, tech:noTech()}}
    };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    let R = clone(BASE);
    try{ const saved = JSON.parse(localStorage.getItem("are_df_rules") || "null"); if(saved) R = Object.assign(clone(BASE), saved, {tech:Object.assign(noTech(), saved.tech || {})}); }catch(_e){}
    const saveRules = () => { try{ localStorage.setItem("are_df_rules", JSON.stringify(R)); }catch(_e){} };

    // ---------------- 状態 ----------------
    let S = null;
    const sleep = (ms) => (S && S.fast) ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
    const spd = () => [260, 620, 1050][R.speed] ?? 620;
    const rnd = (n) => Math.floor(Math.random() * n);
    const shuffle = (a) => { for(let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const inv = () => S.rev !== S.back;
    const keyR = (r) => r === 16 ? 16 : (inv() ? 18 - r : r);           // 強さ（革命・バックで逆転。ジョーカーは常に最強）
    const natKey = (c) => c.j ? 16 : c.r;                                // ふつうの強さ（カード交換・並べかえ用）
    const cardKey = (c) => c.j ? 16 : keyR(c.r);
    const active = () => S.players.filter((p) => p.hand.length > 0 && !p.out);
    const alive = (i) => S.players[i].hand.length > 0 && !S.players[i].out;
    function nextAlive(i, dir){
        const n = S.players.length, d = dir || S.dir;
        for(let k = 1; k <= n; k++){ const j = (i + d * k + n * 10) % n; if(alive(j)) return j; }
        return i;
    }
    function log(t){ S.log.push(t); if(S.log.length > 60) S.log.shift(); if(S.logAll) S.logAll.push(t); }
    function setMsg(t){ if(S) S.msg = t; paint(); }

    function makeDeck(){
        const d = [];
        for(let s = 0; s < 4; s++) for(let r = 3; r <= 15; r++) d.push({id:"c" + s + "_" + r, s, r, j:false});
        for(let k = 0; k < R.jokers; k++) d.push({id:"j" + k, s:-1, r:16, j:true});
        return d;
    }
    const lab = (c) => c.j ? "JK" : SUITS[c.s] + RL[c.r];
    const sortHand = (h, mode) => h.sort(mode === "suit" ? ((a, b) => (a.j - b.j) || (a.s - b.s) || (natKey(a) - natKey(b))) : ((a, b) => (natKey(a) - natKey(b)) || (a.s - b.s)));

    // ---------------- 手の判定 ----------------
    function analyze(cards){
        const n = cards.length;
        if(!n) return null;
        const js = cards.filter((c) => c.j), ns = cards.filter((c) => !c.j);
        const sig = ns.map((c) => c.s).sort().join("");
        if(n === 1) return {type:"single", n:1, rank:cards[0].j ? 16 : cards[0].r, sig, hasJ:js.length > 0};
        const rset = new Set(ns.map((c) => c.r));
        if(rset.size <= 1 && (ns.length === 0 || R.jokerWild || js.length === 0)){
            if(!ns.length) return {type:"set", n, rank:16, sig:"", hasJ:true};
            return {type:"set", n, rank:ns[0].r, sig, hasJ:js.length > 0};
        }
        if(R.stairs && n >= R.stairMin && (js.length === 0 || R.jokerWild)){
            const suits = new Set(ns.map((c) => c.s));
            if(suits.size === 1 && rset.size === ns.length){
                const rs = ns.map((c) => c.r).sort((a, b) => a - b), lo = rs[0], hi = rs[rs.length - 1];
                const gaps = (hi - lo + 1) - rs.length;
                if(gaps <= js.length){
                    let extra = js.length - gaps, top = hi, bottom = lo;
                    while(extra > 0){ if(top < 15) top++; else bottom--; extra--; }
                    if(bottom >= 3 && top <= 15 && top - bottom + 1 === n) return {type:"stairs", n, rank:top, bottom, top, sig, hasJ:js.length > 0};
                }
            }
        }
        return null;
    }
    const keyOf = (a) => a.type === "stairs" ? (inv() ? 18 - a.bottom : a.top) : keyR(a.rank);
    function lockOk(a){
        if(!S.lock || !a.sig && !a.hasJ) return true;
        if(!a.hasJ) return a.sig === S.lock;
        const tmp = S.lock.split("");
        for(const ch of a.sig){ const k = tmp.indexOf(ch); if(k < 0) return false; tmp.splice(k, 1); }
        return true;
    }
    function judge(cards){
        const a = analyze(cards);
        if(!a) return {ok:false, why:R.stairs ? "その組み合わせは出せません（同じ数字、または同じマークの連番）" : "その組み合わせは出せません（同じ数字だけ）"};
        if(S.mustD3 && !cards.some((c) => !c.j && c.s === 2 && c.r === 3)) return {ok:false, why:"最初は ♦3 を含めて出します"};
        if(!lockOk(a)) return {ok:false, why:"縛り中です（" + S.lock.split("").join("") + " のマークだけ出せます）"};
        const f = S.field;
        if(!f) return {ok:true, a};
        if(R.spade3 && f.type === "single" && f.rank === 16 && a.type === "single" && !cards[0].j && cards[0].s === 0 && cards[0].r === 3) return {ok:true, a, spade3:true};
        if(a.type !== f.type || a.n !== f.n) return {ok:false, why:"場と同じ形・同じ枚数で出します（場：" + f.n + "枚" + (f.type === "stairs" ? "の階段" : "") + "）"};
        if(keyOf(a) <= keyOf(f)) return {ok:false, why:"場より強いカードを出してください" + (inv() ? "（いまは強さが逆転中）" : "")};
        return {ok:true, a};
    }
    function subsets(g){ const out = []; for(let m = 1; m < (1 << g.length); m++){ const s = []; g.forEach((c, i) => { if(m & (1 << i)) s.push(c); }); out.push(s); } return out; }
    function enumerate(hand){
        const out = [], js = hand.filter((c) => c.j), ns = hand.filter((c) => !c.j), by = {};
        ns.forEach((c) => (by[c.r] = by[c.r] || []).push(c));
        hand.forEach((c) => out.push([c]));
        Object.keys(by).forEach((r) => subsets(by[r]).forEach((sub) => {
            for(let jn = 0; jn <= (R.jokerWild ? js.length : 0); jn++){ if(sub.length + jn >= 2) out.push(sub.concat(js.slice(0, jn))); }
        }));
        for(let k = 2; k <= js.length; k++) out.push(js.slice(0, k));
        if(R.stairs && (R.stairMin <= hand.length)){
            for(let s = 0; s < 4; s++){
                const have = {}; ns.filter((c) => c.s === s).forEach((c) => { have[c.r] = c; });
                for(let lo = 3; lo <= 15; lo++) for(let len = R.stairMin; lo + len - 1 <= 15; len++){
                    const cs = []; let miss = 0;
                    for(let r = lo; r < lo + len; r++){ if(have[r]) cs.push(have[r]); else miss++; }
                    if(miss <= (R.jokerWild ? js.length : 0) && cs.length >= 1) out.push(cs.concat(js.slice(0, miss)));
                }
            }
        }
        const seen = new Set();
        return out.filter((cs) => { const k = cs.map((c) => c.id).sort().join(); if(seen.has(k)) return false; seen.add(k); return judge(cs).ok; });
    }

    // ---------------- 画面（かんたんな部品） ----------------
    function cardEl(c, cls){
        const d = document.createElement("div");
        d.className = "card" + (c.j ? " jk" : (REDS[c.s] ? " red" : "")) + (cls ? " " + cls : "");
        d.dataset.id = c.id;
        d.innerHTML = c.j ? '<span>JK</span><span class="big">🃏</span>' : '<span>' + RL[c.r] + '</span><span class="big">' + SUITS[c.s] + '</span>';
        return d;
    }
    function overlay(html){ const o = $("overlay"); o.innerHTML = '<div class="panel">' + html + '</div>'; o.hidden = false; return o; }
    function closeOverlay(){ const o = $("overlay"); o.hidden = true; o.innerHTML = ""; }
    function paint(){
        if(!S){ return; }
        const me = S.players[0];
        $("barInfo").textContent = "ラウンド " + S.round + " / " + R.rounds + "　" + R.players + "人";
        $("opps").innerHTML = S.players.slice(1).map((p, k) => {
            const i = k + 1, backs = Array.from({length:Math.min(p.hand.length, 14)}, () => '<span class="mini"></span>').join("");
            return '<div class="opp' + (S.turn === i && !S.over ? " turn" : "") + (p.hand.length === 0 ? " out" : "") + '"><div class="nm">' + p.name + '</div><div class="rk">' + (p.rk ? p.rk[1] + p.rk[0] : "　") + '　' + p.score + '点</div><div class="cnt">' + (p.out ? "あがり" : p.hand.length + "枚") + '</div><div class="backs">' + backs + '</div></div>';
        }).join("");
        const chips = [];
        if(S.rev) chips.push('<span class="chip rev">⚡革命中</span>');
        if(S.back) chips.push('<span class="chip back">↩バック中</span>');
        if(inv()) chips.push('<span class="chip rev">強さ逆転</span>');
        if(S.lock) chips.push('<span class="chip lock">🔒縛り ' + S.lock.split("").map((i) => SUITS[Number(i)]).join("") + '</span>');
        chips.push('<span class="chip dir">' + (S.dir === 1 ? "→ 回る向き" : "← 回る向き（逆）") + '</span>');
        $("chips").innerHTML = chips.join("");
        const f = $("field"); f.innerHTML = "";
        if(S.field){ S.field.cards.slice().sort((a, b) => natKey(a) - natKey(b)).forEach((c) => f.appendChild(cardEl(c))); }
        else f.innerHTML = '<span class="empty">場にカードはありません（好きなカードで始められます）</span>';
        $("msg").textContent = S.msg || "";
        $("logbox").innerHTML = S.log.slice(-3).map((t) => "・" + t).join("<br>");
        $("myinfo").textContent = (me.rk ? me.rk[1] + me.rk[0] + "　" : "") + me.name + "　" + me.score + "点　残り" + me.hand.length + "枚";
        const h = $("hand"); h.innerHTML = "";
        h.classList.toggle("few", me.hand.length <= 6);
        const playable = S.humanTurn ? new Set(enumerate(me.hand).flat().map((c) => c.id)) : null;
        sortHand(me.hand, S.sortMode).forEach((c) => {
            const e = cardEl(c, (S.sel.has(c.id) ? "sel" : "") + (playable && !playable.has(c.id) ? " dim" : ""));
            e.addEventListener("click", () => { if(!S.humanTurn && !S.picking) return; if(S.sel.has(c.id)) S.sel.delete(c.id); else S.sel.add(c.id); if(S.picking) S.picking(); paint(); });
            h.appendChild(e);
        });
        // 手札が多いときは、画面の幅に入るように、重ねかたを自動で調整する
        const kids = h.children, n = kids.length;
        if(n > 1){
            const cw = kids[0].offsetWidth || 46, avail = Math.max(120, h.clientWidth - 20);
            const step = Math.min(cw + 6, (avail - cw) / (n - 1));
            for(let i = 1; i < n; i++) kids[i].style.marginLeft = (step - cw) + "px";
        }
        $("btnPlay").disabled = !S.humanTurn; $("btnPass").disabled = !S.humanTurn || !S.field;
        $("btnHint").disabled = !S.humanTurn;
    }

    // ---------------- 選ぶ画面（渡す・捨てる・拾う・数字をえらぶ） ----------------
    function pickCards(title, pool, count){
        if(S.auto || S.fast) return Promise.resolve(autoPick(pool, count));
        return new Promise((resolve) => {
            const sel = new Set();
            const o = overlay('<h2>' + title + '</h2><p>' + count + '枚えらんでください</p><div class="pick" id="pk"></div><div class="row"><button type="button" class="primary" id="pkOk" disabled>決定</button></div>');
            const draw = () => {
                const box = o.querySelector("#pk"); box.innerHTML = "";
                sortHand(pool.slice(), "rank").forEach((c) => { const e = cardEl(c, sel.has(c.id) ? "sel" : ""); e.addEventListener("click", () => { if(sel.has(c.id)) sel.delete(c.id); else if(sel.size < count) sel.add(c.id); draw(); }); box.appendChild(e); });
                o.querySelector("#pkOk").disabled = sel.size !== count;
            };
            draw();
            o.querySelector("#pkOk").addEventListener("click", () => { closeOverlay(); resolve(pool.filter((c) => sel.has(c.id))); });
        });
    }
    function autoPick(pool, count){ return sortHand(pool.slice(), "rank").slice(0, count); }
    function pickRank(title){
        if(S.auto || S.fast) return Promise.resolve(null);
        return new Promise((resolve) => {
            const o = overlay('<h2>' + title + '</h2><div class="row">' + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((r) => '<button type="button" data-r="' + r + '">' + RL[r] + '</button>').join("") + '</div>');
            o.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { closeOverlay(); resolve(Number(b.dataset.r)); }));
        });
    }
    function waitButton(html, label){
        if(S.auto || S.fast) return Promise.resolve();
        return new Promise((resolve) => { const o = overlay(html + '<div class="row"><button type="button" class="primary" id="wbOk">' + (label || "OK") + '</button></div>'); o.querySelector("#wbOk").addEventListener("click", () => { closeOverlay(); resolve(); }); });
    }

    // ---------------- ゲームの準備 ----------------
    function newGame(){
        const N = R.players;
        S = {players:Array.from({length:N}, (_, i) => ({id:i, name:NAMES[i], human:i === 0, hand:[], out:false, rk:null, score:0, foul:false})),
            round:0, over:false, auto:false, fast:false, log:[], msg:"", sel:new Set(), sortMode:"rank", humanTurn:false, picking:null, prevOrder:null, order:[], fouled:[], grave:[], pile:[], field:null, lock:null, streak:{sig:"", count:0}};
        return S;
    }
    function setupRound(){
        S.round++; S.over = false; S.rev = false; S.back = false; S.dir = 1; S.field = null; S.lock = null; S.streak = {sig:"", count:0};
        S.order = []; S.fouled = []; S.grave = []; S.pile = []; S.passSeq = 0; S.lastBy = -1; S.revDone = false; S.sel = new Set(); S.msg = "";
        S.players.forEach((p) => { p.hand = []; p.out = false; });
        const deck = shuffle(makeDeck()); let i = 0;
        while(deck.length) S.players[i++ % S.players.length].hand.push(deck.pop());
        S.players.forEach((p) => sortHand(p.hand, S.sortMode));
        S.mustD3 = false;
    }
    function decideFirst(){
        const N = S.players.length, d3 = S.players.findIndex((p) => p.hand.some((c) => !c.j && c.s === 2 && c.r === 3));
        let first = d3 < 0 ? 0 : d3;
        if(R.first === "random") first = rnd(N);
        else if(S.prevOrder) first = (R.first === "rich") ? S.prevOrder[0] : S.prevOrder[S.prevOrder.length - 1];   // ♦3 と 大貧民 の指定は、2ラウンド目から大貧民が親
        S.mustD3 = (S.round === 1 && R.first === "d3");
        if(S.mustD3) first = d3 < 0 ? 0 : d3;
        S.turn = first;
        log(S.players[first].name + " から始めます");
    }
    async function exchange(){
        if(!R.exchange || !S.prevOrder) return;
        const N = S.players.length, ord = S.prevOrder, pairs = [[ord[0], ord[N - 1], N === 3 ? 1 : 2]];
        if(N >= 4) pairs.push([ord[1], ord[N - 2], 1]);
        for(const [rich, poor, k] of pairs){
            const P = S.players[poor], Rr = S.players[rich];
            const strong = P.hand.slice().sort((a, b) => natKey(b) - natKey(a)).slice(0, k);
            P.hand = P.hand.filter((c) => !strong.includes(c)); Rr.hand = Rr.hand.concat(strong);
            let give;
            if(Rr.human && !S.auto && !S.fast){
                await waitButton('<h2>カード交換</h2><p>' + P.name + '（' + (P.rk ? P.rk[0] : "") + '）から、強いカードを ' + k + '枚 もらいました：<b>' + strong.map(lab).join("　") + '</b></p><p>つぎに、あいてへ渡すカードを ' + k + '枚えらびます。</p>', "えらぶ");
                give = await pickCards("渡すカード（" + P.name + "へ）", Rr.hand, k);
            }else give = autoPick(Rr.hand, k);
            Rr.hand = Rr.hand.filter((c) => !give.includes(c)); P.hand = P.hand.concat(give);
            log(Rr.name + "と" + P.name + "が交換（" + k + "枚）");
            if(P.human && !S.auto && !S.fast) await waitButton('<h2>カード交換</h2><p>あなた（' + (P.rk ? P.rk[0] : "") + '）は、強いカード <b>' + strong.map(lab).join("　") + '</b> を ' + Rr.name + ' に取られ、<b>' + give.map(lab).join("　") + '</b> をもらいました。</p>', "つづける");
        }
        S.players.forEach((p) => sortHand(p.hand, S.sortMode));
    }

    // ---------------- 進行 ----------------
    function clearField(){
        S.grave.push(...S.pile); S.pile = [];
        S.field = null; S.lock = null; S.streak = {sig:"", count:0}; S.back = false; S.passSeq = 0; S.msg = "";
    }
    function needPass(){ const act = active(); return act.length - (alive(S.lastBy) ? 1 : 0); }
    async function doPass(pi){
        log(S.players[pi].name + "：パス");
        S.passSeq++;
        if(S.passSeq >= needPass()){
            const lead = alive(S.lastBy) ? S.lastBy : nextAlive(S.lastBy);
            clearField(); log("みんなパス。場が流れました"); S.turn = lead;
        }else S.turn = nextAlive(pi);
    }
    function revokeFinish(){ /* いまは使わない */ }
    function finishPlayer(pi, foul){
        const p = S.players[pi]; p.out = true;
        if(foul){ p.foul = true; S.fouled.push(pi); log("🚫 " + p.name + " は反則上がり！ 大貧民になります"); }
        else{ S.order.push(pi); log("🎉 " + p.name + " があがり！（" + S.order.length + "位）"); }
    }
    async function doPlay(pi, cards){
        const p = S.players[pi], j = judge(cards), a = j.a;
        p.hand = p.hand.filter((c) => !cards.includes(c));
        S.pile.push(...cards);
        const prev = S.field;
        S.field = {type:a.type, n:a.n, rank:a.rank, top:a.top, bottom:a.bottom, sig:a.sig, hasJ:a.hasJ, by:pi, cards:cards.slice()};
        S.lastBy = pi; S.passSeq = 0; S.mustD3 = false;
        log(p.name + "：" + cards.slice().sort((x, y) => natKey(x) - natKey(y)).map(lab).join(" ") + (a.type === "stairs" ? "（階段）" : ""));
        // 縛り
        if(R.lock && !S.lock){
            const sg = a.sig;
            if(prev && S.streak.sig === sg && sg) S.streak.count++; else S.streak = {sig:sg, count:1};
            if(sg && S.streak.count >= R.lockN){ S.lock = sg; log("🔒 縛り発動！（" + sg.split("").map((i) => SUITS[Number(i)]).join("") + "）"); }
        }
        // 革命
        let revNow = false;
        if(R.revolution > 0 && ((a.type === "set" && a.n >= R.revolution) || (a.type === "stairs" && R.stairRev && a.n >= 5))){
            if(R.revCounter || !S.revDone){ S.rev = !S.rev; S.revDone = true; revNow = true; log("⚡ 革命！ 強さが ひっくりかえった"); }
        }
        // 技
        let clear = false, skip = 0, again = false, spade3 = !!j.spade3, techUsed = "";
        if(spade3){ log("♠3返し！ ジョーカーに勝ちました"); clear = true; }
        const tech = (a.type !== "stairs" && a.rank <= 15) ? (R.tech[a.rank] || "") : "";
        const c = a.n;
        if(tech){
            techUsed = tech;
            if(tech === "clear"){ clear = true; log(RL[a.rank] + "切り！ 場が流れます"); }
            else if(tech === "skip"){ skip = c; log(RL[a.rank] + "スキップ！ " + c + "人とばします"); }
            else if(tech === "reverse"){ S.dir *= -1; log(RL[a.rank] + "リバース！ 回る向きが逆になりました"); }
            else if(tech === "back"){ S.back = !S.back; log(RL[a.rank] + "バック！ 強さが逆転"); }
            else if(tech === "again"){ again = true; log(RL[a.rank] + "：もう一度、自分の番"); }
        }
        paint(); await sleep(spd() / 2);
        if(tech === "give" && p.hand.length){ await techGive(pi, c); }
        else if(tech === "discard" && p.hand.length){ await techDiscard(pi, c); }
        else if(tech === "bomb"){ await techBomb(pi); }
        else if(tech === "revive" && p.hand.length && S.grave.length){ await techRevive(pi, c); }
        else if(tech === "trade" && p.hand.length){ await techTrade(pi); }
        // あがり判定（技で手札がなくなった人も）
        let finishedNow = false;
        if(p.hand.length === 0 && !p.out){
            const foul = (R.foulEight && tech === "clear") || (R.foulJoker && cards.some((x) => x.j)) || (R.foulTwo && a.rank === 15 && a.type !== "stairs") || (R.foulRev && revNow);
            finishPlayer(pi, foul); finishedNow = true;
        }
        S.players.forEach((q, qi) => { if(q.hand.length === 0 && !q.out) finishPlayer(qi, false); });
        if(roundOver()) return;
        if(clear){ clearField(); S.turn = p.out ? nextAlive(pi) : pi; return; }
        if(again && !p.out){ S.turn = pi; return; }
        let t = pi;
        for(let k = 0; k <= skip; k++) t = nextAlive(t);
        S.turn = t;
    }
    function roundOver(){ return active().length <= 1; }

    // ---------------- 技の本体 ----------------
    async function techGive(pi, c){
        const p = S.players[pi], to = S.players[nextAlive(pi)], k = Math.min(c, p.hand.length);
        let give = (p.human && !S.auto && !S.fast) ? await pickCards("7渡し：" + to.name + "へ渡すカード", p.hand, k) : autoPick(p.hand, k);
        p.hand = p.hand.filter((x) => !give.includes(x)); to.hand = to.hand.concat(give); sortHand(to.hand, S.sortMode);
        log(p.name + " が " + to.name + " に " + k + "枚 渡しました");
    }
    async function techDiscard(pi, c){
        const p = S.players[pi], k = Math.min(c, p.hand.length);
        let d = (p.human && !S.auto && !S.fast) ? await pickCards("捨てるカード", p.hand, k) : autoPick(p.hand, k);
        p.hand = p.hand.filter((x) => !d.includes(x)); S.grave.push(...d);
        log(p.name + " が " + k + "枚 捨てました");
    }
    async function techBomb(pi){
        const p = S.players[pi];
        let r;
        if(p.human && !S.auto && !S.fast) r = await pickRank("ボンバー！ 全員が捨てる数字をえらんでください");
        else{
            let best = -99; r = 3;
            for(let x = 3; x <= 15; x++){ let others = 0, mine = 0; S.players.forEach((q, qi) => { const n = q.hand.filter((cc) => !cc.j && cc.r === x).length; if(qi === pi) mine += n; else others += n; }); const sc = others * 2 - mine * 2 + (x >= 12 ? 1 : 0); if(sc > best){ best = sc; r = x; } }
        }
        let total = 0;
        S.players.forEach((q) => { const gone = q.hand.filter((cc) => !cc.j && cc.r === r); if(gone.length){ total += gone.length; S.grave.push(...gone); q.hand = q.hand.filter((cc) => !gone.includes(cc)); } });
        log("💣 ボンバー！ 全員の " + RL[r] + " を捨てました（" + total + "枚）");
    }
    async function techRevive(pi, c){
        const p = S.players[pi], k = Math.min(c, S.grave.length);
        if(!k) return;
        let get = (p.human && !S.auto && !S.fast) ? await pickCards("蘇生：捨て札から拾うカード", S.grave, k) : S.grave.slice().sort((a, b) => natKey(b) - natKey(a)).slice(0, k);
        S.grave = S.grave.filter((x) => !get.includes(x)); p.hand = p.hand.concat(get); sortHand(p.hand, S.sortMode);
        log("✨ " + p.name + " が捨て札から " + k + "枚 よみがえらせました");
    }
    async function techTrade(pi){
        const p = S.players[pi], to = S.players[nextAlive(pi)];
        if(to === p || !to.hand.length) return;
        let mine = (p.human && !S.auto && !S.fast) ? (await pickCards("トレード：" + to.name + "と交換するカード", p.hand, 1))[0] : autoPick(p.hand, 1)[0];
        const theirs = to.hand[rnd(to.hand.length)];
        p.hand = p.hand.filter((x) => x !== mine).concat(theirs); to.hand = to.hand.filter((x) => x !== theirs).concat(mine);
        sortHand(p.hand, S.sortMode); sortHand(to.hand, S.sortMode);
        log("🔁 " + p.name + " と " + to.name + " が 1枚 こうかん");
    }

    // ---------------- CPU ----------------
    function cpuPick(pi){
        const p = S.players[pi], opts = enumerate(p.hand);
        if(!opts.length) return null;
        const lv = R.cpu, N = p.hand.length;
        const danger = S.players.some((q, qi) => qi !== pi && alive(qi) && q.hand.length <= 2);
        const avgKey = (h) => h.length ? h.reduce((s, c) => s + cardKey(c), 0) / h.length : 0;
        const scored = opts.map((cs) => {
            const a = analyze(cs), k = a.type === "stairs" ? keyOf(a) : keyR(a.rank);
            let sc = k * 10 - cs.length * (S.field ? 4 : 12);
            if(cs.some((c) => c.j)) sc += 60;
            if(a.type !== "stairs" && a.rank <= 15 && R.tech[a.rank] === "clear") sc += (N <= 4 ? -6 : 14);
            if(R.revolution > 0 && a.type === "set" && a.n >= R.revolution){
                const after = p.hand.filter((c) => !cs.includes(c)); const cur = avgKey(after);
                const flipped = after.length ? after.reduce((s, c) => s + (c.j ? 16 : (inv() ? c.r : 18 - c.r)), 0) / after.length : 0;
                sc += (flipped < cur - 1.5 ? -45 : 30);
            }
            if(danger && S.field && lv >= 1) sc -= (k >= 11 ? 25 : 0);
            return {cs, sc};
        });
        scored.sort((x, y) => x.sc - y.sc);
        const best = scored[0];
        if(S.field && lv < 2 && N > 6 && keyOf(analyze(best.cs)) >= 13 && !danger && Math.random() < (lv === 0 ? 0.55 : 0.35)) return null;
        if(lv === 0 && scored.length > 1 && Math.random() < 0.18) return scored[Math.min(scored.length - 1, 1 + rnd(2))].cs;
        return best.cs;
    }
    async function cpuTurn(pi){
        S.msg = S.players[pi].name + " の番です…"; paint();
        await sleep(spd());
        const pick = cpuPick(pi);
        return pick ? {cards:pick} : {pass:true};
    }
    function humanTurn(){
        return new Promise((resolve) => {
            const me = S.players[0], opts = enumerate(me.hand);
            if(!opts.length && S.field){
                S.msg = "出せるカードがないので、自動でパスします"; S.humanTurn = false; paint();
                if(R.autoPass){ sleep(900).then(() => resolve({pass:true})); return; }
            }
            S.humanTurn = true; S.sel = new Set(); S.msg = S.mustD3 ? "あなたの番です（最初は ♦3 を含めて出します）" : "あなたの番です"; paint();
            S.resolveHuman = (r) => { S.humanTurn = false; S.resolveHuman = null; S.sel = new Set(); resolve(r); };
        });
    }
    function onPlay(){
        if(!S || !S.humanTurn) return;
        const cards = S.players[0].hand.filter((c) => S.sel.has(c.id));
        if(!cards.length){ setMsg("出すカードをえらんでください"); return; }
        const j = judge(cards);
        if(!j.ok){ setMsg("⚠ " + j.why); return; }
        S.resolveHuman({cards});
    }
    function onPass(){
        if(!S || !S.humanTurn) return;
        if(!S.field){ setMsg("最初の番はパスできません"); return; }
        S.resolveHuman({pass:true});
    }
    function onHint(){
        if(!S || !S.humanTurn) return;
        const pick = cpuPick(0);
        if(!pick){ setMsg("💡 パスがおすすめです"); return; }
        S.sel = new Set(pick.map((c) => c.id)); setMsg("💡 おすすめを選びました");
    }

    // ---------------- ラウンドと全体 ----------------
    async function playRound(){
        setupRound();
        S.players.forEach((p) => { p.foul = false; });
        if(S.round > 1 && S.prevOrder) S.players.forEach((p) => { const pos = S.prevOrder.indexOf(p.id); p.rk = RANKSETS[S.players.length][pos]; });
        paint();
        await exchange();
        decideFirst();
        paint();
        let guard = 0;
        while(!roundOver() && guard++ < 4000){
            const pi = S.turn, p = S.players[pi];
            if(!alive(pi)){ S.turn = nextAlive(pi); continue; }
            const act = (p.human && !S.auto) ? await humanTurn() : await cpuTurn(pi);
            if(act.pass) await doPass(pi); else await doPlay(pi, act.cards);
            paint();
            if(S.turn !== undefined && !roundOver()) await sleep(spd() / 3);
        }
        S.over = true;
        const rem = S.players.find((q) => !q.out && q.hand.length > 0);
        let order = S.order.slice();
        if(rem) order.push(rem.id);
        order = order.concat(S.fouled);
        S.players.forEach((q) => { if(!order.includes(q.id)) order.push(q.id); });
        const N = S.players.length;
        if(R.miyako && S.prevOrder && order[0] !== S.prevOrder[0]){
            const fallen = S.prevOrder[0]; order = order.filter((x) => x !== fallen); order.push(fallen); log("⬇ 都落ち！ " + S.players[fallen].name + " は大貧民に");
        }
        S.finalOrder = order;
        order.forEach((id, pos) => { S.players[id].score += (N - 1 - pos); S.players[id].rk = RANKSETS[N][pos]; });
        S.prevOrder = order.slice();
        paint();
    }
    function resultHtml(final){
        const N = S.players.length, ord = S.finalOrder;
        let h = '<h2>' + (final ? "🏆 最終けっか" : "ラウンド " + S.round + " けっか") + '</h2><table class="rk-table"><tr><th>順位</th><th>名前</th><th>階級</th><th>点</th></tr>' +
            ord.map((id, pos) => { const q = S.players[id]; return '<tr><td>' + (pos + 1) + '位</td><td>' + q.name + (q.foul ? "（反則）" : "") + '</td><td>' + q.rk[1] + q.rk[0] + '</td><td>+' + (N - 1 - pos) + '（計 ' + q.score + '）</td></tr>'; }).join("") + '</table>';
        if(final){
            const tot = S.players.slice().sort((a, b) => b.score - a.score);
            h += '<h3>合計点</h3><p>' + tot.map((q, i) => (i + 1) + "位 " + q.name + " " + q.score + "点").join("　／　") + '</p>';
        }
        return h;
    }
    async function runGame(){
        newGame();
        for(let r = 0; r < R.rounds; r++){
            await playRound();
            const final = (r === R.rounds - 1);
            if(!S.auto && !S.fast) await waitButton(resultHtml(final), final ? "おわる" : "つぎのラウンドへ");
            else await sleep(0);
        }
        S.finished = true;
        if(!S.auto && !S.fast) titleScreen();
        return S;
    }

    // ---------------- メニュー ----------------
    function titleScreen(){
        const o = overlay('<div class="bigtitle">👑 大富豪</div><div class="sub">本格ルール・全部入り（3〜2の技・縛り・革命・階級・カード交換）</div>' +
            '<div class="row"><button type="button" class="primary" id="tStart">▶ あそぶ（' + R.players + '人・' + R.rounds + 'ラウンド）</button></div>' +
            '<div class="row"><button type="button" id="tRule">⚙️ ルール設定</button><button type="button" id="tHelp">❓ あそびかた</button></div>' +
            '<div class="row">' + Object.keys(PRESETS).map((k) => '<button type="button" data-ps="' + k + '">' + PRESETS[k].label + '</button>').join("") + '</div>' +
            '<p class="sub">プリセットを押すと、ルールが一気に切りかわります。細かい設定は「ルール設定」で。</p>' +
            '<div class="row"><button type="button" id="tBack">← チャットにもどる</button></div>');
        o.querySelector("#tStart").addEventListener("click", () => { closeOverlay(); runGame(); });
        o.querySelector("#tRule").addEventListener("click", rulesScreen);
        o.querySelector("#tHelp").addEventListener("click", helpScreen);
        o.querySelector("#tBack").addEventListener("click", () => { location.href = "../chat.html"; });
        o.querySelectorAll("[data-ps]").forEach((b) => b.addEventListener("click", () => { applyPreset(b.dataset.ps); saveRules(); titleScreen(); }));
    }
    function applyPreset(k){ const base = clone(BASE); R = Object.assign(base, PRESETS[k].set || {}, {tech:Object.assign(noTech(), (PRESETS[k].set || {}).tech || (k === "standard" ? {8:"clear"} : {}))}); if(k === "standard") R.tech = Object.assign(noTech(), {8:"clear"}); }
    const SCHEMA = [
        ["players", "人数", "sel", [[3, "3人"], [4, "4人"], [5, "5人"], [6, "6人"]]],
        ["jokers", "ジョーカーの枚数", "sel", [[0, "0枚"], [1, "1枚"], [2, "2枚"]]],
        ["rounds", "ラウンド数", "sel", [[1, "1"], [3, "3"], [5, "5"], [10, "10"], [20, "20"]]],
        ["first", "さいしょの親", "sel", [["d3", "♦3（次から大貧民）"], ["rich", "大富豪から"], ["poor", "大貧民から"], ["random", "ランダム"]]],
        ["exchange", "カード交換（大富豪⇔大貧民、富豪⇔貧民）", "chk"],
        ["miyako", "都落ち（大富豪が1位でないと大貧民に）", "chk"],
        ["revolution", "革命（同じ数字を何枚以上で）", "sel", [[0, "なし"], [4, "4枚以上"], [5, "5枚以上"], [3, "3枚以上"]]],
        ["revCounter", "革命返し（革命中にもう一度革命できる）", "chk"],
        ["stairs", "階段（同じマークの連番）", "chk"],
        ["stairMin", "階段の最低枚数", "sel", [[3, "3枚"], [4, "4枚"], [5, "5枚"]]],
        ["stairRev", "階段革命（5枚以上の階段で革命）", "chk"],
        ["lock", "縛り（同じマークが続くとそのマークだけ）", "chk"],
        ["lockN", "縛りが発動する連続回数", "sel", [[2, "2回（ふつうの縛り）"], [3, "3回（3枚縛り）"], [4, "4回"]]],
        ["spade3", "スペ3返し（♠3でジョーカーに勝つ）", "chk"],
        ["jokerWild", "ジョーカーをワイルドカードに（ペア・階段で何にでも）", "chk"],
        ["foulEight", "反則上がり：8切りで上がり禁止", "chk"],
        ["foulJoker", "反則上がり：ジョーカーで上がり禁止", "chk"],
        ["foulTwo", "反則上がり：2で上がり禁止", "chk"],
        ["foulRev", "反則上がり：革命で上がり禁止", "chk"],
        ["autoPass", "出せるカードがないとき、自動でパス", "chk"],
        ["cpu", "CPUの強さ", "sel", [[0, "よわい"], [1, "ふつう"], [2, "つよい"]]],
        ["speed", "CPUの速さ", "sel", [[0, "はやい"], [1, "ふつう"], [2, "ゆっくり"]]]
    ];
    function rulesScreen(){
        let h = '<h2>⚙️ ルール設定</h2><div class="row">' + Object.keys(PRESETS).map((k) => '<button type="button" data-ps="' + k + '">' + PRESETS[k].label + '</button>').join("") + '</div>';
        SCHEMA.forEach(([key, label, kind, opts]) => {
            if(kind === "chk") h += '<label class="opt"><span>' + label + '</span><input type="checkbox" data-k="' + key + '"' + (R[key] ? " checked" : "") + '></label>';
            else h += '<label class="opt"><span>' + label + '</span><select data-k="' + key + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (String(R[key]) === String(o[0]) ? " selected" : "") + '>' + o[1] + '</option>').join("") + '</select></label>';
        });
        h += '<h3>数字ごとの「技」</h3><p>3〜2のどの数字にも、好きな技をわりあてられます（階段には技はつきません）。</p><div class="techgrid">' +
            [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((r) => '<b>' + RL[r] + '</b><select data-t="' + r + '">' + Object.keys(TECHS).map((t) => '<option value="' + t + '"' + ((R.tech[r] || "") === t ? " selected" : "") + '>' + TECHS[t] + '</option>').join("") + '</select>').join("") + '</div>' +
            '<div class="row"><button type="button" class="primary" id="rOk">決定してもどる</button></div>';
        const o = overlay(h);
        o.querySelectorAll("[data-ps]").forEach((b) => b.addEventListener("click", () => { applyPreset(b.dataset.ps); saveRules(); rulesScreen(); }));
        o.querySelector("#rOk").addEventListener("click", () => {
            o.querySelectorAll("[data-k]").forEach((e) => { const k = e.dataset.k; R[k] = e.type === "checkbox" ? e.checked : (isNaN(Number(e.value)) ? e.value : Number(e.value)); });
            o.querySelectorAll("[data-t]").forEach((e) => { R.tech[Number(e.dataset.t)] = e.value; });
            saveRules(); backFromMenu();
        });
    }
    const inGame = () => !!(S && S.round > 0 && !S.finished);
    function backFromMenu(){ if(inGame()) closeOverlay(); else titleScreen(); }
    function helpScreen(){
        const o = overlay('<h2>❓ あそびかた</h2>' +
            '<p>手札を先になくした人が勝ち。場のカードより強いカードを、同じ枚数で出します。出せない・出したくないときはパス（出せるカードがなければ自動でパス）。</p>' +
            '<p>強さ：<b>3 ＜ 4 ＜ … ＜ K ＜ A ＜ 2 ＜ ジョーカー</b>。革命・バック中は 3 が最強（ジョーカーは変わりません）。</p>' +
            '<h3>階級とカード交換</h3><p>1位＝大富豪👑、2位＝富豪💰、…、最下位＝大貧民💀。つぎのラウンドの最初に、大貧民は「いちばん強い2枚」を大富豪へ、貧民は「いちばん強い1枚」を富豪へ渡し、かわりに好きなカードを返してもらいます。</p>' +
            '<h3>おもな技（数字へのわりあては自由）</h3><ul>' +
            '<li><b>革命</b>：同じ数字を4枚（設定で変更）出すと、強さが逆転。もう一度出すと元に戻る（革命返し）。</li>' +
            '<li><b>切り</b>：出すと場が流れて、自分からもう一度。<b>スキップ</b>：次の人（枚数ぶん）を飛ばす。<b>リバース</b>：回る向きが逆。</li>' +
            '<li><b>バック</b>：場が流れるまで強さが逆転。<b>もう一度</b>：続けて自分の番。</li>' +
            '<li><b>渡し</b>：枚数ぶん手札を次の人へ。<b>捨て</b>：枚数ぶん手札を捨てる。<b>ボンバー</b>：数字を言うと全員がその数字を捨てる。</li>' +
            '<li><b>蘇生</b>：捨て札から枚数ぶん拾う。<b>トレード</b>：次の人と1枚こうかん（相手のカードはランダム）。</li></ul>' +
            '<h3>そのほか</h3><ul><li><b>縛り</b>：同じマークが続けて出ると、そのマークだけしか出せなくなる（3回続けで発動＝3枚縛り も選べます）。</li>' +
            '<li><b>階段</b>：同じマークの連番（3枚以上）。5枚以上で階段革命。</li><li><b>スペ3返し</b>：ジョーカー1枚には ♠3 が勝つ。</li>' +
            '<li><b>都落ち</b>：前回の大富豪が1位でなければ大貧民へ。<b>反則上がり</b>：禁止の出し方で上がると大貧民に。</li>' +
            '<li><b>ジョーカーのワイルド</b>：ペアや階段で、どのカードの代わりにもなる。</li></ul>' +
            '<div class="row"><button type="button" class="primary" id="hOk">とじる</button></div>');
        o.querySelector("#hOk").addEventListener("click", backFromMenu);
    }

    // ---------------- 起動 ----------------
    function init(){
        $("btnPlay").addEventListener("click", onPlay);
        $("btnPass").addEventListener("click", onPass);
        $("btnHint").addEventListener("click", onHint);
        $("btnSort").addEventListener("click", () => { if(!S) return; S.sortMode = S.sortMode === "rank" ? "suit" : "rank"; paint(); });
        $("btnHelp").addEventListener("click", helpScreen);
        $("btnSet").addEventListener("click", rulesScreen);
        // 端末の「戻る」：開いているメニュー（ルール・あそびかた）を、まず1つ閉じる
        window.AREGameBack = () => { const o = $("overlay"); if(!o.hidden && inGame() && !S.picking && !(S.humanTurn === false && S.auto)){ closeOverlay(); return true; } return false; };
        titleScreen();
    }
    // テスト用の入口（本番に残します）
    window.__df = {
        get S(){ return S; }, get R(){ return R; },
        setRules(o){ R = Object.assign(clone(BASE), o, {tech:Object.assign(noTech(), o.tech || {})}); },
        autoGame(o){ if(o) window.__df.setRules(o); newGame(); S.auto = true; S.fast = true; S.logAll = []; closeOverlay(); return (async () => { for(let r = 0; r < R.rounds; r++){ await playRound(); } S.finished = true; return {rounds:S.round, scores:S.players.map((p) => p.score), grave:S.grave.length, cards:S.players.reduce((n, p) => n + p.hand.length, 0)}; })(); },
        enumerate, judge, analyze
    };
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
