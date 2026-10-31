"use strict";
// ===== 追加パック：画面（ハブ）=====
// G.mode = "pack"。左のメニューで「たんさく／ぼくじょう／かくとうじょう／カジノ／クエスト／ずかん／どうぐ・そうび／じゅもん／休憩所／イベント回想／実績／追加コンテンツ／強くてニューゲーム／コード／バックアップ」
const PK_TABS = [
    ["home", "🏠 ホーム", 0], ["ex", "🗺 たんさく", 3], ["mon", "🐾 ぼくじょう", 3], ["arena", "🏟 かくとうじょう", 3], ["cas", "🎰 カジノ", 2], ["quest", "📜 クエスト", 1],
    ["dex", "📖 ずかん", 0], ["bag", "🎒 どうぐ・そうび", 0], ["magic", "✨ じゅもん・とくぎ", 0], ["rest", "🛏 休憩所", 0], ["ev", "🎬 イベント回想", 0],
    ["ach", "🏆 実績・称号", 0], ["dlc", "🌟 追加コンテンツ", 5], ["ng", "🔄 強くてニューゲーム", 5], ["code", "🎁 プレゼントコード", 0], ["bk", "💾 バックアップ", 0]
];
function pkUI(){ G.pk = G.pk || {}; const u = G.pk; if(!u.tab){ u.tab = "home"; u.page = 0; u.msg = ""; u.sel = {}; u.q = {f:"all", k:"n"}; u.dex = "mon"; u.eqc = "hero"; } return u; }
function pkOpenHub(from){
    if(!G.S) return; const u = pkUI(); u.from = from || "menu"; u.restOnly = false; u.open = true; u.tab = "home"; u.page = 0; u.msg = ""; u.game = null; u.quiz = null;
    if(!PK.ready){ pkLoad().then(() => { if(G.mode === "pack") render(); }); }
    else pkGiveStarter();
    G.mode = "pack"; render();
}
function pkBack(){
    const u = pkUI();
    if(u.game){ if(window.pkCasAbort) pkCasAbort(); u.game = null; render(); return; }
    if(u.quiz){ u.quiz = null; render(); return; }
    if(u.restOnly){ u.restOnly = false; u.open = false; u.tab = "home"; tqAutoSave(); G.mode = "map"; G.say = null; render(); return; }   // 休憩所の おねえさん：もどると マップへ
    if(u.tab !== "home"){ u.tab = "home"; u.page = 0; u.msg = ""; render(); return; }
    u.open = false; tqAutoSave(); if(u.from === "map"){ G.mode = "map"; G.say = null; } else { G.mode = "menu"; G.menuTab = "main"; } render();
}
function pkKey(k, e){ if(G.pk && G.pk.game && window.pkCasKey) return pkCasKey(k, e); return false; }

const PK_EQ_ICON = {武器:"⚔️", 鎧:"🥋", 盾:"🛡️", 兜:"⛑️", 腕輪:"📿"};
const PK_IT_ICON = {回復:"💊", 収集:"🗿", 素材:"🧱", キーアイテム:"🗝️", 強化:"⚡", バフ:"🔥"};
function pkBtn(label, cmd, o){ o = o || {}; return '<button class="btn' + (o.sub ? " sub" : "") + '" data-a="pk" data-v="' + esc(cmd) + '"' + (o.dis ? " disabled" : "") + '>' + label + '</button>'; }
function pkPager(n, per){
    const u = pkUI(), pages = Math.max(1, Math.ceil(n / per)); if(u.page >= pages) u.page = pages - 1;
    return '<div class="row pkpg">' + pkBtn("◀", "page|" + (u.page - 1), {sub:1, dis:u.page <= 0}) + '<span class="meta">' + (u.page + 1) + ' / ' + pages + ' ページ（' + n + '件）</span>' + pkBtn("▶", "page|" + (u.page + 1), {sub:1, dis:u.page >= pages - 1}) + '</div>';
}
function pkSlice(list, per){ const u = pkUI(); return list.slice(u.page * per, u.page * per + per); }
function pkNum(n){ return Number(n).toLocaleString(); }

// ---------------------------------------------------------------- 入口
function pkView(){
    const u = pkUI(), S = G.S;
    if(!PK.ready){
        return '<div id="mc" class="win pk" style="left:2cqw"><h2>🎪 追加コンテンツ</h2><div class="card">' + (PK.err ? '<div class="err">データを よみこめませんでした：' + esc(PK.err) + '</div>' : '<div class="meta">データを よみこみ中…</div>') + '</div><div class="row">' + pkBtn("もどる", "back") + '</div></div>';
    }
    const p = pkS(), open = pkOpen();
    const nav = '<div id="mm" class="win pk">' + PK_TABS.map((t) => '<button class="opt" data-a="pk" data-v="tab|' + t[0] + '"' + (u.tab === t[0] ? ' style="color:var(--gold)"' : '') + '>' + t[1] + (!pkGate(t[2]) ? " 🔒" : "") + '</button>').join("") + '<button class="opt" data-a="pk" data-v="back">もどる</button></div>';
    let body = "";
    if(u.game) body = pkCasGameView();
    else {
        const t = PK_TABS.find((x) => x[0] === u.tab);
        if(t && !pkGate(t[2])) body = '<h2>' + t[1] + '</h2><div class="card">' + pkGateMsg(t[2]) + '<div class="meta">（ストーリーは かわりません。すすめるほど あそびが ふえます）</div></div>';
        else body = ({home:pkHome, ex:pkTabEx, mon:pkTabMon, arena:pkTabArena, cas:pkTabCas, quest:pkTabQuest, dex:pkTabDex, bag:pkTabBag, magic:pkTabMagic, rest:pkTabRest, ev:pkTabEv, ach:pkTabAch, dlc:pkTabDlc, ng:pkTabNg, code:pkTabCode, bk:pkTabBk}[u.tab] || pkHome)();
    }
    const msg = u.msg ? '<div class="okc pkmsg" style="white-space:pre-wrap">' + esc(u.msg) + '</div>' : "";
    if(u.restOnly) return '<div id="mc" class="win pk" style="left:2cqw;width:94cqw">' + msg + body + '<div class="row">' + pkBtn("もどる", "back") + '</div></div>';
    return nav + '<div id="mc" class="win pk">' + msg + body + '</div>';
}
function pkTick(n){ return pkGate(n) ? " ✅" : ""; }
function pkHome(){
    const p = pkS(), S = G.S, qs = pkQSummary();
    return '<h2>🎪 追加コンテンツ</h2>' +
        '<div class="card"><b>' + esc(S.name) + '</b>　Lv' + S.lv + (p.title ? '　称号『' + esc(p.title) + '』' : '') + '<div class="meta">💰 ' + pkNum(S.gold) + 'G　🪙 ' + pkNum(p.coins) + ' コイン（1コイン＝' + PK.rate + 'G）</div></div>' +
        '<div class="card meta">モンスター はっけん ' + Object.keys(p.seen).length + '/550　どうぐ ' + Object.keys(p.itEver).length + '/100　実績 ' + Object.keys(p.ach).length + '/' + PK_ACH.length + '　クエスト クリア ' + qs.done + '/' + qs.total + '</div>' +
        (pkOpen() ? "" : '<div class="card"><b>ひらく じゅんばん</b><div class="meta">はじめから：プレゼントコード・ずかん・実績・どうぐ・じゅもん・休憩所・イベント回想・バックアップ<br>地図1（ホシミ台）クリア：転職（メニュー）・クエスト' + pkTick(1) + '<br>地図2（アカリ市）クリア：カジノ（4つのミニゲーム）・レベル上げしやすい モンスター' + pkTick(2) + '<br>地図3（運命開発ビル）クリア：ぼくじょう・スカウト・配合・転生・かくとうじょう・たんさく' + pkTick(3) + '<br>地図4（まっしろルーム）クリア：もっと レベル上げ・ゴールド稼ぎが しやすい モンスター' + pkTick(4) + '<br>本編 クリア：追加コンテンツ・強くてニューゲーム</div></div>') +
        '<div class="card meta">じゅもん・とくぎは ほんぺんで 90こずつ、のこり 10こずつは クリア後に おぼえます。</div>' +
        (p.ngp ? '<div class="card meta">強くてニューゲーム ' + p.ngp + '周目</div>' : "");
}

// ---------------------------------------------------------------- たんさく
function pkTabEx(){
    const lv = pkLv(), p = pkS(), onlyS = G.pk.onlyScout;
    return '<h2>🗺 たんさく</h2><div class="card meta">ノイズ大陸で モンスターを さがして たたかう！ ランクが 高いほど 強い（Sは 大ボスきゅう）。たおすと けいけんち・ドロップ・なかま入り（なかまは 60しゅるいだけ）。</div>' +
        '<div class="card"><label><input type="checkbox" id="pkOnly" data-a="pk" data-v="onlyscout"' + (onlyS ? " checked" : "") + '> なかまに できる 60しゅるいだけ さがす</label></div>' +
        PK_RANKS.map((r) => '<div class="card"><b>' + r + 'ランク</b>　<span class="meta">てきの つよさ ×' + PK_TIER[r] + '　すいしょう Lv' + Math.min(99, Math.round(8 + PK_RANKS.indexOf(r) * 11)) + '〜</span> ' + pkBtn("さがす", "ex|" + r) + '</div>').join("") +
        '<div class="meta">れんぞく たんさく：オート戦闘（メニュー⚡じどう）と あわせると らくちん。　これまで ' + p.cnt.explore + '回 たんさく</div>';
}

// ---------------------------------------------------------------- ぼくじょう
function pkMonRow(s, extra){
    const m = PK.MON[s.id], p = pkS(), st = pkInstStat(s);
    return '<div class="card"><b>' + m._e + ' ' + esc(m.name) + '</b> Lv' + s.lv + ' ' + m.rank + (m.size === "L" ? ' 〔Lサイズ・2わく〕' : "") + (s.plus ? ' <span class="okc">+' + s.plus + '</span>' : "") + (p.comp === s.u ? ' 🌟あいぼう' : "") +
        '<div class="meta">こうげき ' + st.atk + '　ぼうぎょ ' + st.def + '　スキル：' + ((s.sk || []).map((k) => PK.SK[k] ? PK.SK[k].name : k).join("・") || "なし") + '</div>' + (extra || "") + '</div>';
}
function pkTabMon(){
    const p = pkS(), u = G.pk, open = pkGate(3);
    let h = '<h2>🐾 ぼくじょう</h2><div class="meta">わく ' + pkStableSlots() + ' / ' + PK_STABLE_MAX + '（Lサイズは 2わく）　あいぼうは 戦闘で いっしょに たたかってくれる。</div>';
    if(!p.stable.length) h += '<div class="card">まだ モンスターが いない。たんさくで スカウトしよう！（性格しんだんの なかまは ここに いるよ）</div>';
    const list = p.stable, per = 6; h += pkPager(list.length, per);
    pkSlice(list, per).forEach((s) => {
        const m = PK.MON[s.id], ru = pkReincTarget(s.id);
        const bs = pkBtn(p.comp === s.u ? "あいぼうを はずす" : "あいぼうに する", "comp|" + (p.comp === s.u ? 0 : s.u), {sub:1}) +
            (open ? pkBtn(u.sel.a === s.u ? "配合A ✓" : "配合Aに", "bA|" + s.u, {sub:1}) + pkBtn(u.sel.b === s.u ? "配合B ✓" : "配合Bに", "bB|" + s.u, {sub:1}) + (ru ? pkBtn("転生（" + (p.kill[s.id] || 0) + "/5）", "reinc|" + s.u, {sub:1}) : "") : "") + pkBtn("にがす", "free|" + s.u, {sub:1});
        h += pkMonRow(s, '<div class="row">' + bs + '</div>');
    });
    if(open){
        const a = u.sel.a && pkFindMon(u.sel.a), b = u.sel.b && pkFindMon(u.sel.b);
        h += '<h3>配合</h3><div class="card">A：' + (a ? esc(PK.MON[a.id].name) : "—") + '　B：' + (b ? esc(PK.MON[b.id].name) : "—") + '　<span class="meta">『配合の雫』×' + (p.it.ITM024 || 0) + ' が ひつよう</span>' +
            (a && b && a !== b && pkInPool(a.id) && pkInPool(b.id) ? '<div class="meta">うまれる 候補（2パターン）：' + pkBreedPatterns(a, b).list.map((m) => m._e + m.name + '(' + m.rank + ')').join(" ／ ") + '</div>' : '<div class="meta">No.001〜060 の モンスター 2ひきを えらぼう。プラス値が たかいほど ランクの 高い 子が うまれる。</div>') +
            '<div class="row">' + pkBtn("配合する", "breed", {dis:!(a && b && a !== b)}) + '</div></div>';
    }
    return h;
}

// ---------------------------------------------------------------- かくとうじょう
function pkTabArena(){
    const p = pkS(); let h = '<h2>🏟 モンスター格闘場</h2><div class="card meta">なかまの モンスター同士で 3かいせん！ えらんだ モンスターの ランクの 大会に 出る。全勝で ゆうしょう（ごほうび 大）。</div>';
    if(!p.stable.length) return h + '<div class="card">ぼくじょうに モンスターが いない。</div>';
    h += '<div class="card meta">ゆうしょう かいすう：' + PK_RANKS.map((r) => r + ' ' + (p.arena[r] || 0)).join('　') + '　／　通算 ' + p.cnt.arena + '勝</div>';
    const per = 6; h += pkPager(p.stable.length, per);
    pkSlice(p.stable, per).forEach((s) => { h += pkMonRow(s, '<div class="row">' + pkBtn("この子で 出場（" + PK.MON[s.id].rank + "ランク大会）", "arena|" + s.u) + '</div>'); });
    if(G.pk.arenaRes){ const r = G.pk.arenaRes; h += '<div class="card"><b>' + esc(r.msg) + '</b>' + r.rounds.map((x, i) => '<div class="meta">第' + (i + 1) + '試合 vs ' + esc(x.foe) + ' Lv' + x.lv + '：' + (x.win ? "○ " : "× ") + esc(x.log) + '</div>').join("") + '<div class="meta">ごほうび：' + pkNum(r.gold) + 'G・' + pkNum(r.coins) + 'コイン・EXP ' + pkNum(r.exp) + '</div></div>'; }
    return h;
}

// ---------------------------------------------------------------- カジノ
function pkTabCas(){
    const p = pkS(), u = G.pk; let h = '<h2>🎰 カジノ</h2><div class="card">🪙 ' + pkNum(p.coins) + ' コイン　<span class="meta">💰 ' + pkNum(G.S.gold) + 'G</span>' +
        '<div class="meta">コイン こうかん：1コイン＝' + PK.rate + 'G（ゴールド⇔コイン どちらも OK）</div><div class="row">' +
        [10, 100, 1000].map((n) => pkBtn("🪙+" + n + "（" + pkNum(n * PK.rate) + "G）", "cbuy|" + n, {sub:1})).join("") + '</div><div class="row">' + [10, 100, 1000].map((n) => pkBtn("🪙-" + n + " → " + pkNum(n * PK.rate) + "G", "csell|" + n, {sub:1})).join("") + '</div></div>';
    h += '<h3>ゲーム</h3>' + pkCasMenuHtml();
    h += '<h3>けいひん こうかん</h3>';
    PK.L.prizes.forEach((pr) => {
        const st = pkPrizeState(pr);
        h += '<div class="card"><b>' + esc(pr.name) + '</b> <span class="meta">' + esc(pr.category) + '・🪙' + pkNum(pr.coin_cost) + '・' + esc(pr.limit) + (p.bought[pr.id] ? '・こうかん ' + p.bought[pr.id] + '回' : "") + '</span> ' + pkBtn(st === "こうかんずみ" ? "こうかんずみ" : "こうかん", "prize|" + pr.id, {dis:!!st}) + '</div>';
    });
    return h;
}

// ---------------------------------------------------------------- クエスト
function pkTabQuest(){
    const p = pkS(), u = G.pk, kind = u.q.k, f = u.q.f; const src = kind === "n" ? PK.L.quests : PK.L.pgquests;
    const stLabel = {new:"みじゅちゅう", act:"じゅちゅう中", done:"たっせい！", claimed:"クリア", idle:""};
    let list = src.filter((q) => f === "all" || (f === "act" && ["act", "done"].includes(pkQState(q))) || (f === "new" && ["new", "claimed"].includes(pkQState(q)) && !(pkQState(q) === "claimed" && !q.repeatable)) || (f === "clear" && pkQState(q) === "claimed"));
    const sm = pkQSummary();
    let h = '<h2>📜 クエスト</h2><div class="meta">クリア ' + sm.done + '/' + sm.total + '　じゅちゅう中 ' + sm.act + '</div><div class="row">' +
        pkBtn("冒険者の依頼（100）", "qk|n", {sub:kind !== "n"}) + pkBtn("クリア後の依頼（100）", "qk|p", {sub:kind !== "p"}) + '</div><div class="row">' +
        [["all", "ぜんぶ"], ["new", "うけられる"], ["act", "すすめ中"], ["clear", "クリアずみ"]].map((x) => pkBtn(x[1], "qf|" + x[0], {sub:f !== x[0]})).join("") + '</div>';
    const per = 8; h += pkPager(list.length, per);
    pkSlice(list, per).forEach((q) => {
        const s = pkQState(q), r = pkQRew(q), tg = pkQTarget(q), pr = pkQProg(q), kindLab = (q.objective.kind || q.objective.type);
        h += '<div class="card"><b>' + esc(q.name) + '</b> <span class="meta">[' + esc(kindLab) + '] ' + stLabel[s] + (q.repeatable ? '・くりかえし可' : '') + '</span>' +
            '<div class="meta">もくひょう：' + esc(kindLab) + ' ' + tg + '（' + (s === "act" || s === "done" ? pr : 0) + '/' + tg + '）　ほうしゅう：' + pkNum(r.gold) + 'G' + (r.coins ? '・🪙' + pkNum(r.coins) : "") + (r.item && PK.I[r.item] ? '・' + esc(PK.I[r.item].name) : "") + '</div><div class="row">' +
            (s === "new" || (s === "claimed" && q.repeatable) ? pkBtn("うける", "qacc|" + q.id) : s === "done" ? pkBtn("ほうしゅうを うけとる", "qclm|" + q.id) : s === "act" ? '<span class="meta">すすめ中…</span>' : '<span class="meta">クリアずみ</span>') + '</div></div>';
    });
    return h;
}

// ---------------------------------------------------------------- ずかん
function pkTabDex(){
    const p = pkS(), u = G.pk, cat = u.dex;
    const cats = [["mon", "モンスター"], ["item", "どうぐ"], ["eq", "そうび"], ["sp", "じゅもん"], ["sk", "とくぎ"]];
    let h = '<h2>📖 ずかん</h2><div class="row">' + cats.map((c) => pkBtn(c[1], "dex|" + c[0], {sub:cat !== c[0]})).join("") + '</div>';
    const per = 12;
    if(cat === "mon"){
        const L = PK.L.monsters; const seen = Object.keys(p.seen).length;
        h += '<div class="meta">はっけん ' + seen + '/550（通常 ' + Object.keys(p.seen).filter((i) => Number(i.slice(3)) <= 500).length + '/500・転生 ' + Object.keys(p.seen).filter((i) => Number(i.slice(3)) > 500).length + '/50）</div>' + pkPager(L.length, per);
        pkSlice(L, per).forEach((m) => { const sn = !!p.seen[m.id]; h += '<div class="card">No.' + m.id.slice(3) + ' ' + (sn ? m._e + ' <b>' + esc(m.name) + '</b> <span class="meta">' + esc(m.category) + '・' + m.rank + 'ランク・' + m.size + 'サイズ・たおした ' + (p.kill[m.id] || 0) + '回' + (pkScoutable(m.id) ? '・スカウト可' : "") + '</span>' : '<span class="meta">？？？</span>') + '</div>'; });
    }else if(cat === "item"){
        const L = PK.L.items; h += '<div class="meta">しゅうしゅう ' + Object.keys(p.itEver).length + '/100</div>' + pkPager(L.length, per);
        pkSlice(L, per).forEach((it) => { const sn = !!p.itEver[it.id]; h += '<div class="card">No.' + it.id.slice(3) + ' ' + (sn ? (PK_IT_ICON[it.category] || "") + ' <b>' + esc(it.name) + '</b> <span class="meta">' + esc(it.category) + '・' + esc(it.effect) + '・ドロップ ' + (p.drops[it.id] || 0) + '</span>' : '<span class="meta">？？？</span>') + '</div>'; });
    }else if(cat === "eq"){
        const L = PK.L.equipment; h += '<div class="meta">しゅとく ' + Object.keys(p.eqOwn).length + '/100</div>' + pkPager(L.length, per);
        pkSlice(L, per).forEach((e) => { const sn = !!p.eqOwn[e.id]; h += '<div class="card">No.' + e.id.slice(3) + ' ' + (sn ? PK_EQ_ICON[e.slot] + ' <b>' + esc(e.name) + '</b> <span class="meta">' + e.slot + '・こうげき+' + e._st.atk + '・ぼうぎょ+' + e._st.def + (e.cursed ? '・のろい' : '') + '</span>' : '<span class="meta">？？？（' + e.slot + '）</span>') + '</div>'; });
    }else{
        const L = cat === "sp" ? PK.L.spells : PK.L.skills, known = (cat === "sp" ? pkSpellsKnown() : pkSkillsKnown()).map((x) => x.id);
        h += '<div class="meta">おぼえた ' + known.length + '/100（ほんぺん 90・クリア後 10）</div>' + pkPager(L.length, per);
        pkSlice(L, per).forEach((d) => { const k = known.includes(d.id); h += '<div class="card">No.' + d.id.slice(3) + ' ' + (k ? '<b>' + esc(d.name) + '</b> <span class="meta">MP' + d.mp_cost + '・' + esc(d.effect) + '</span>' : '<span class="meta">？？？（Lv' + d.level_required + (Number(d.id.slice(3)) > PK_STORY_MAGIC ? '・クリア後' : "") + ' で おぼえる）</span>') + '</div>'; });
    }
    return h;
}

// ---------------------------------------------------------------- どうぐ・そうび
function pkTabBag(){
    const p = pkS(), S = G.S, u = G.pk, sub = u.bag || "item";
    let h = '<h2>🎒 どうぐ・そうび</h2><div class="row">' + pkBtn("どうぐ", "bag|item", {sub:sub !== "item"}) + pkBtn("そうび", "bag|eq", {sub:sub !== "eq"}) + '</div>';
    if(sub === "item"){
        const ids = Object.keys(p.it).sort(); h += pkPager(ids.length, 8);
        if(!ids.length) h += '<div class="card meta">パックの どうぐは まだ ない。（ドロップ・クエスト・けいひんで 手に入る）</div>';
        pkSlice(ids, 8).forEach((id) => {
            const it = PK.I[id], kd = pkItemKind(it);
            const targets = kd.k === "heal" || kd.k === "revive" ? S.party : ["hero"];
            h += '<div class="card"><b>' + (PK_IT_ICON[it.category] || "") + ' ' + esc(it.name) + '</b>×' + p.it[id] + ' <span class="meta">' + esc(it.effect) + '・うる ' + pkNum(it.sell_price) + 'G</span><div class="row">' +
                (pkItemUsable(it, false) ? (kd.k === "heal" || kd.k === "revive" ? S.party.map((c) => pkBtn(esc(tqName(c)) + "に", "use|" + id + "|" + c, {sub:1})).join("") : pkBtn("つかう", "use|" + id + "|hero", {sub:1})) : '<span class="meta">（つかえない）</span>') +
                pkBtn("1こ うる", "sell|" + id + "|1", {sub:1}) + (p.it[id] > 1 ? pkBtn("ぜんぶ うる", "sell|" + id + "|" + p.it[id], {sub:1}) : "") + '</div></div>';
        });
        h += '<div class="meta">バフの こうか：けいけんち×2 ' + p.buff.exp + '回・こうげき×2 ' + p.buff.atk + '回・ぼうぎょ×2 ' + p.buff.def + '回（のこり）</div>';
    }else{
        h += '<div class="row">' + S.party.map((c) => pkBtn(esc(tqName(c)), "eqc|" + c, {sub:u.eqc !== c})).join("") + '</div>';
        const cid = S.party.includes(u.eqc) ? u.eqc : "hero", set = pkEqOf(cid);
        h += '<div class="card"><b>' + esc(tqName(cid)) + '</b> <span class="meta">こうげき +' + pkEquipBonus(cid).atk + '・ぼうぎょ +' + pkEquipBonus(cid).def + (pkEquipBonus(cid).curse ? '　<span style="color:var(--red)">☠ のろわれている！（休憩所で とける）</span>' : "") + '</span>' +
            PK_SLOTS.map((sl) => { const e = PK.EQ[set[sl]]; return '<div class="meta">' + PK_EQ_ICON[sl] + ' ' + sl + '：' + (e ? esc(e.name) + (pkEqCursed(e, cid) ? " ☠" : "") + ' ' + pkBtn("はずす", "uneq|" + cid + "|" + sl, {sub:1}) : "なし") + '</div>'; }).join("") + '</div>';
        const owned = PK.L.equipment.filter((e) => p.eqOwn[e.id]); h += pkPager(owned.length, 8);
        if(!owned.length) h += '<div class="card meta">パックの そうびは まだ ない。（モンスターの ドロップ・カジノの けいひん・追加コンテンツで てにはいる）</div>';
        pkSlice(owned, 8).forEach((e) => { const on = set[e.slot] === e.id, bad = pkEqCursed(e, cid); h += '<div class="card">' + PK_EQ_ICON[e.slot] + ' <b>' + esc(e.name) + '</b> <span class="meta">' + e.slot + '・こうげき+' + e._st.atk + '・ぼうぎょ+' + e._st.def + '・Lv' + e.level_required + (e.cursed ? (bad ? '・☠ のろわれる！' : '・ハルキなら のろわれない！') : "") + '</span> ' + pkBtn(on ? "そうび中" : "そうびする", "eq|" + cid + "|" + e.id, {dis:on}) + '</div>'; });
    }
    return h;
}

// ---------------------------------------------------------------- じゅもん・とくぎ
function pkTabMagic(){
    const S = G.S, u = G.pk, sub = u.mg || "sp";
    let h = '<h2>✨ じゅもん・とくぎ</h2><div class="meta">主人公が おぼえた もの。MP ' + S.m.hero.mp + '/' + tqStat("hero").maxmp + '（戦闘では コマンドから つかう）</div><div class="row">' + pkBtn("じゅもん", "mg|sp", {sub:sub !== "sp"}) + pkBtn("とくぎ", "mg|sk", {sub:sub !== "sk"}) + '</div>';
    const L = sub === "sp" ? pkSpellsKnown() : pkSkillsKnown(); h += pkPager(L.length, 8);
    pkSlice(L, 8).forEach((d) => {
        h += '<div class="card"><b>' + esc(d.name) + '</b> <span class="meta">MP' + d.mp_cost + '・' + esc(d.effect) + (d.success_rate ? '・せいこうりつ ' + d.success_rate + '%' : '') + '</span>';
        if(sub === "sp" && d.usable_outside_battle && (d._k.k === "heal" || d._k.k === "warp")){
            h += '<div class="row">' + (d._k.k === "warp" ? pkBtn("瞬間移動（" + (pkS().lastTown ? PK_TOWNS[pkS().lastTown.map] : "きろくなし") + "）", "cast|" + d.id + "|hero", {sub:1}) : d._k.all ? pkBtn("みんなに", "cast|" + d.id + "|hero", {sub:1}) : S.party.map((c) => pkBtn(esc(tqName(c)) + "に", "cast|" + d.id + "|" + c, {sub:1})).join("")) + '</div>';
        }
        h += '</div>';
    });
    return h;
}

// ---------------------------------------------------------------- 休憩所
function pkTabRest(){
    const S = G.S, cost = pkRestCost(); let h = '<h2>🛏 休憩所</h2><div class="card">受付の おねえさん「いらっしゃいませ。のろいを とく のも、たおれた なかまを ふっかつさせる のも、1人 <b>' + pkNum(cost) + 'G</b>（レベル×10G）です。」<div class="meta">💰 ' + pkNum(S.gold) + 'G</div></div>';
    S.party.forEach((c) => {
        const cursed = pkEquipBonus(c).curse, dead = S.m[c].hp <= 0;
        h += '<div class="card"><b>' + esc(tqName(c)) + '</b> <span class="meta">HP ' + S.m[c].hp + '/' + tqStat(c).maxhp + (cursed ? '　☠ のろわれている' : '') + (dead ? '　💀 たおれている' : '') + '</span><div class="row">' + pkBtn("のろいを とく", "rcure|" + c, {dis:!cursed}) + pkBtn("ぜんかいふくで ふっかつ", "rrev|" + c, {dis:!dead}) + '</div></div>';
    });
    return h + '<div class="meta">ほかに 通常の かいふくは ラボの ソファや おにぎり・どうぐ・じゅもんで。</div>';
}

// ---------------------------------------------------------------- イベント回想
function pkTabEv(){
    const L = pkEventList(), seen = L.filter((x) => x.seen).length;
    let h = '<h2>🎬 イベント回想</h2><div class="meta">みた イベント ' + seen + '/' + L.length + '　さいせい中は ほうしゅうや フラグは もう一度 もらえません。（この きのうの かいほう以前に みた イベントは、もういちど 見ると とうろくされます）</div>';
    const per = 10; h += pkPager(L.length, per);
    pkSlice(L, per).forEach((x) => { h += '<div class="card">' + (x.seen ? '✅' : '⬜') + ' ' + esc(x.title) + (x.seen ? ' <span class="meta">（' + x.n + '回）</span> ' + pkBtn("みる", "evp|" + x.id, {sub:1}) : "") + '</div>'; });
    return h;
}

// ---------------------------------------------------------------- 実績・称号
function pkTabAch(){
    const p = pkS(); let h = '<h2>🏆 実績・称号</h2><div class="card">いまの 称号：' + (p.title ? '『' + esc(p.title) + '』' : 'なし') + '<div class="row">' + pkBtn("はずす", "title|", {sub:1}) + p.titles.map((t) => pkBtn(esc(t), "title|" + t, {sub:p.title !== t})).join("") + '</div></div>';
    PK_ACH.forEach((a) => { h += '<div class="card">' + (p.ach[a.id] ? '🏅' : '⬜') + ' <b>' + esc(a.name) + '</b> <span class="meta">' + esc(a.desc) + (a.title ? '（称号『' + esc(a.title) + '』）' : '') + '</span></div>'; });
    return h;
}

// ---------------------------------------------------------------- 追加コンテンツ
function pkTabDlc(){
    const p = pkS(), u = G.pk;
    if(u.quiz){
        const qz = u.quiz, Q = PK_DLC_RULES.__quiz[qz.i];
        return '<h2>🌟 入園ゲートの なぞなぞ</h2><div class="card"><b>だい' + (qz.i + 1) + '問</b><div>' + esc(Q.q) + '</div>' + '<div class="row">' + Q.c.map((c, i) => pkBtn(esc(c), "quiz|" + i)).join("") + '</div></div>';
    }
    let h = '<h2>🌟 追加コンテンツ</h2><div class="meta">本編クリア後の おたのしみ 5本。ストーリーは かわりません。</div>';
    PK.L.dlc.forEach((d) => {
        const done = d.chapters.filter((c) => p.dlc[c.id] === "done").length;
        h += '<div class="card"><b>' + esc(d.id) + ' ' + esc(d.name) + '</b> <span class="meta">[' + esc(d.type) + '] ' + done + '/' + d.chapters.length + '章</span><div class="meta">' + esc(d.summary) + '</div>';
        d.chapters.forEach((c, i) => {
            const rule = PK_DLC_RULES[c.id], st = pkDlcState(c.id), open = pkDlcChapterOpen(d, i); let btn = "";
            if(st === "done") btn = '<span class="okc">✔ クリア</span>';
            else if(!open) btn = '<span class="meta">🔒 まえの 章を クリアしよう</span>';
            else if(rule.kind === "cond"){ const ok = !!rule.f(); btn = pkBtn(ok ? "たっせい！ うけとる" : "もくひょう：" + esc(rule.text), "dlcdone|" + c.id, {dis:!ok}); }
            else if(rule.kind === "visit"){ const v = Object.keys(p.flags.dlcVisit || {}).length; btn = ["haruki", "akito", "kaito", "n001", "mira"].map((cid) => pkBtn((p.flags.dlcVisit && p.flags.dlcVisit[cid] ? "✓" : "") + esc(RPG_CLASS[cid] ? RPG_CLASS[cid].n || cid : cid) + "を たずねる", "dlcgo|" + c.id + "|" + cid, {sub:1})).join("") + '<span class="meta">（' + v + '/' + rule.need + '人）</span>'; }
            else if(rule.kind === "rematch" || rule.kind === "limit") btn = rule.bosses.map((b) => pkBtn(esc(RPG_FOES[b].n), "dlcgo|" + c.id + "|" + b, {sub:1})).join("");
            else btn = pkBtn("ちょうせん", "dlcgo|" + c.id);
            h += '<div class="card"><b>第' + (i + 1) + '章 ' + esc(c.title) + '</b><div class="meta">' + esc(c.objective) + (rule.turns ? '（' + rule.turns + 'ターン以内）' : '') + '　ほうしゅう：' + esc(c.rewards.join("・")) + '</div><div class="row">' + btn + '</div></div>';
        });
        h += '</div>';
    });
    return h;
}

// ---------------------------------------------------------------- 強くてニューゲーム
function pkTabNg(){
    const pv = pkNgPreview(); let h = '<h2>🔄 強くてニューゲーム</h2><div class="card">クリア後に もういちど 最初から あそべます。<div class="meta">引きつぐ もの：<b>主人公の レベル</b>（Lv' + pv.lv + '）・<b>じゅもん</b>（' + pv.spells + 'こ）・<b>とくぎ</b>（' + pv.skills + 'こ）だけ。ゴールド・どうぐ・そうび・モンスター・クエストは 引きつぎません。</div><div class="meta">いまの 冒険の書（枠' + G.slot + '）は そのまま まもられます。べつの 枠に あたらしく つくります。</div></div>';
    for(let i = 1; i <= TQ_SLOTS; i++){
        const r = tqReadSlot(i), here = i === G.slot;
        h += '<div class="card"><b>枠 ' + i + '</b>　<span class="meta">' + (here ? "いま あそんでいる 枠（えらべません）" : r ? (r.corrupted ? "よみこめない データ" : esc(r.name) + "　" + esc(r.saved_at) + "　<span style='color:var(--red)'>※ うわがき されます</span>") : "からっぽ") + '</span> ' + pkBtn(r && !here ? "うわがきして つくる" : "つくる", "ng|" + i, {dis:here}) + '</div>';
    }
    return h;
}

// ---------------------------------------------------------------- コード
function pkTabCode(){
    const p = pkS(); return '<h2>🎁 プレゼントコード</h2><div class="card"><div class="meta">コードを いれると ぼうけんに やくだつ プレゼントが もらえます。（1つの コードは 1かいだけ）</div><div class="row"><input id="pkCode" type="text" maxlength="40" placeholder="コード" style="width:30cqw"> ' + pkBtn("つかう", "code") + '</div><div class="meta">つかったコード：' + Object.keys(p.codes).length + '/10</div></div>';
}
// ---------------------------------------------------------------- バックアップ
function pkTabBk(){
    return '<h2>💾 バックアップ</h2><div class="card"><div class="meta">冒険の書（3枠）を 文字列にして コピーできます。べつの 端末や ブラウザへ うつすときに つかおう。</div><div class="row">' + pkBtn("文字列を つくる", "bkexp") + pkBtn("文字列から ふっかつ", "bkimp") + '</div>' +
        '<textarea id="pkBk" rows="5" style="width:100%;margin-top:.6cqw;font-size:1.4cqw;background:#071056;color:#fff;border:.2cqw solid #fff8;border-radius:.6cqw;-webkit-user-select:text;user-select:text">' + esc(G.pk.bk || "") + '</textarea></div>' +
        '<div class="meta">オートセーブは 30秒ごと／メニューを とじたとき／画面を はなれたとき に 行われます。</div>';
}

// ---------------------------------------------------------------- 操作
ACT.pk = (v, el) => {
    const u = pkUI(), a = String(v).split("|"), c = a[0]; let r = null; u.msg = "";
    const say = (x) => { u.msg = x && x.msg ? x.msg : ""; };
    if(c === "back"){ pkBack(); return; }
    if(c === "tab"){ u.tab = a[1]; u.page = 0; u.game = null; u.quiz = null; u.arenaRes = null; render(); return; }
    if(c === "page"){ u.page = Math.max(0, Number(a[1])); render(); return; }
    if(c === "onlyscout"){ u.onlyScout = !u.onlyScout; render(); return; }
    if(c === "ex"){ r = pkExplore(a[1], u.onlyScout); if(!r.ok){ say(r); render(); } return; }
    if(c === "comp"){ say(pkSetComp(Number(a[1]) || null)); }
    else if(c === "free"){ const s = pkFindMon(Number(a[1])); if(s){ askYes(PK.MON[s.id].name + " を ぼくじょうから にがします。\nいいですか？", () => { const p = pkS(); p.stable = p.stable.filter((x) => x !== s); if(p.comp === s.u) p.comp = null; G.pk.msg = "にがした。"; render(); }); return; } }
    else if(c === "bA"){ u.sel.a = Number(a[1]); }
    else if(c === "bB"){ u.sel.b = Number(a[1]); }
    else if(c === "breed"){ r = pkBreed(u.sel.a, u.sel.b); say(r); if(r.ok) u.sel = {}; }
    else if(c === "reinc"){ askYes("この モンスターを 転生させます。\n（元の モンスターは いなくなり、転生モンスターが なかまに なります）", () => { G.pk.msg = pkReinc(Number(a[1])).msg; render(); }); return; }
    else if(c === "arena"){ r = pkArena(Number(a[1])); if(r.ok) u.arenaRes = r; say(r); }
    else if(c === "cbuy"){ say(pkGoldToCoin(Number(a[1]))); }
    else if(c === "csell"){ say(pkCoinToGold(Number(a[1]))); }
    else if(c === "prize"){ say(pkBuyPrize(a[1])); pkAchCheck(); }
    else if(c === "qk"){ u.q.k = a[1]; u.page = 0; }
    else if(c === "qf"){ u.q.f = a[1]; u.page = 0; }
    else if(c === "qacc"){ say(pkQAccept(a[1])); }
    else if(c === "qclm"){ say(pkQClaim(a[1])); }
    else if(c === "dex"){ u.dex = a[1]; u.page = 0; }
    else if(c === "bag"){ u.bag = a[1]; u.page = 0; }
    else if(c === "eqc"){ u.eqc = a[1]; u.page = 0; }
    else if(c === "use"){ say(pkUseItem(a[1], a[2], false)); tqAutoSave(); }
    else if(c === "sell"){ say(pkSell(a[1], Number(a[2]))); }
    else if(c === "eq"){ say(pkEquip(a[1], a[2])); tqAutoSave(); }
    else if(c === "uneq"){ say(pkUnequip(a[1], a[2])); }
    else if(c === "mg"){ u.mg = a[1]; u.page = 0; }
    else if(c === "cast"){ r = pkCastField(a[1], a[2]); if(r.ok && r.warp){ u.open = false; const w = pkDoWarp(); return; } say(r); }
    else if(c === "rcure"){ say(pkRestCure(a[1])); }
    else if(c === "rrev"){ say(pkRestRevive(a[1])); }
    else if(c === "evp"){ r = pkReplay(a[1]); if(r.ok) return; say(r); }
    else if(c === "title"){ const p = pkS(); if(!a[1] || p.titles.includes(a[1])) p.title = a[1] || ""; }
    else if(c === "dlcgo"){ r = pkDlcStart(a[1], a[2]); if(r.ok) return; say(r); }
    else if(c === "dlcdone"){ say(pkDlcComplete(a[1])); }
    else if(c === "quiz"){ r = pkDlcQuizAnswer(Number(a[1])); say(r); if(r.end) u.quiz = null; }
    else if(c === "ng"){ const slot = Number(a[1]), ex = tqReadSlot(slot), go = () => { const rr = pkNgStart(slot); G.pk.msg = rr.msg; if(rr.ok){ askYes(rr.msg + "\nいますぐ はじめますか？", () => { pkNgEnter(slot); }); return; } render(); }; if(ex && !ex.corrupted){ askYes("枠 " + slot + " の データは きえて しまいます。\nそれでも つくりますか？", go); return; } go(); return; }
    else if(c === "code"){ const inp = $("pkCode"); say(pkCodeTry(inp ? inp.value : "")); }
    else if(c === "bkexp"){ u.bk = pkBackupExport(); u.msg = "文字列を つくりました。ぜんぶ コピーして ほぞんしてね。"; }
    else if(c === "bkimp"){ const ta = $("pkBk"); const txt = ta ? ta.value : ""; askYes("冒険の書を バックアップから ふっかつ します。\nいまの データは うわがき されます。\nいいですか？", () => { const rr = pkBackupImport(txt); G.pk.msg = rr.msg; render(); }); return; }
    else if(window.pkCasDo && pkCasDo(c, a)) return;
    pkAchCheck(); render();
};
// ---- 画面のあとしまつ（ゲームのキャンバスなど）
(function(){
    const _far = window.fieldAfterRender;
    window.fieldAfterRender = function(){ if(_far) _far(); if(G.mode === "pack" && G.pk && G.pk.game && window.pkCasAfterRender) pkCasAfterRender(); };
})();
// ---- 起動時の よみこみ・インストールボタン
(function(){
    pkLoad();
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); G.installEv = e; if(G.mode === "title" && window.render) render(); });
    window.addEventListener("appinstalled", () => { G.installEv = null; if(G.mode === "title") render(); });
    const _enter = enterGame;
    enterGame = function(msg){ try{ if(PK.ready) pkGiveStarter(); else pkLoad().then(() => { if(G.S) pkGiveStarter(); }); }catch(_e){} _enter(msg); };
})();
