"use strict";
// ===== 追加の しくみ：①チートの「使用中一覧／個別かいじょ／ぜんぶかいじょ」と複数同時入力
//        ②仲間の なまえ変更（ふだんから）  ③むずかしさ（イージー／ベーシック／ハード） =====
// ・チートを かいじょ すると、レベル・ステータス・そうび・なかま などが「いい感じ」に もどります。
//   レベルを チートで 上げていた あいだに もらった 経験値は、もとのレベルに ちゃんと つみかさなって いるので、そんしません。
// ・おかね／どうぐ／HP回復／ストーリーを すすめる コード（Clear など）は「プレゼント」あつかい。かいじょしても とりあげません。

// ---------------------------------------------------------------- なまえ（仲間）
function tqNm(){ const S = G.S; if(!S) return {}; return (S.nm = S.nm || {}); }
(function(){
    const _name = tqName;
    tqName = function(id){ if(id !== "hero" && G.S && G.S.nm && G.S.nm[id]) return G.S.nm[id]; return _name(id); };
})();
// ふきだしの なまえ／本文の なかの 元の なまえを、かえた なまえに おきかえる
function tqWho(w){
    const S = G.S; if(!S || !S.nm || !w) return w;
    for(const id of Object.keys(S.nm)){ if(RPG_CLASS[id] && RPG_CLASS[id].n === w) return S.nm[id]; }
    return w;
}
function tqRen(t){
    const S = G.S; if(!S || !S.nm || typeof t !== "string") return t;
    Object.keys(S.nm).forEach((id) => { const o = RPG_CLASS[id] && RPG_CLASS[id].n; if(o && S.nm[id] && o !== S.nm[id]) t = t.split(o).join(S.nm[id]); });
    return t;
}
function tqSetNick(id, raw){
    const S = G.S; if(!S || !S.party.includes(id) || id === "hero") return {ok:false, msg:"この なかまは なまえを かえられません。"};
    const v = Array.from(String(raw || "").normalize("NFKC").replace(/[<>&"'`]/g, "").trim()).slice(0, 8).join("");
    const nm = tqNm();
    if(!v || v === RPG_CLASS[id].n){ delete nm[id]; tqAutoSave(); return {ok:true, msg:RPG_CLASS[id].n + " の なまえを もとに もどした。"}; }
    if(S.party.some((x) => x !== id && tqName(x) === v) || v === S.name) return {ok:false, msg:"おなじ なまえの 仲間が いるよ。べつの なまえに しよう。"};
    nm[id] = v; tqAutoSave(); return {ok:true, msg:RPG_CLASS[id].n + " の なまえを「" + v + "」に した！"};
}

// ---------------------------------------------------------------- むずかしさ
const TQ_DIFFS = {
    easy:  {n:"イージー",   d:"てきが よわめ。ゆっくり ストーリーを たのしみたい人へ。", hp:0.7, atk:0.7, def:0.85, exp:1, g:1},
    basic: {n:"ベーシック", d:"ふつうの むずかしさ。（はじめは これ）", hp:1, atk:1, def:1, exp:1, g:1},
    hard:  {n:"ハード",     d:"てきが つよめ。そのぶん 経験値と おかねが 3割 おおい！", hp:1.4, atk:1.3, def:1.1, exp:1.3, g:1.3}
};
function tqDiff(){ const k = G.S && G.S.diff; return TQ_DIFFS[k] ? k : "basic"; }
function tqSetDiff(k){
    if(!G.S || !TQ_DIFFS[k]) return {ok:false, msg:"？"};
    G.S.diff = k; tqAutoSave();
    return {ok:true, msg:"むずかしさを「" + TQ_DIFFS[k].n + "」に した。" + (G.b ? "（つぎの たたかいから はんえい）" : "")};
}
(function(){
    const _bs = battleStart;
    battleStart = function(ids, after){
        _bs.apply(this, arguments);
        try{
            const k = tqDiff(), d = TQ_DIFFS[k]; if(k === "basic" || !G.b) return;
            G.b.foes.forEach((f) => {
                if(f._diff) return; f._diff = k;
                f.hp = Math.max(1, Math.round(f.hp * d.hp)); f.cur = f.hp; f.atk = Math.max(1, Math.round(f.atk * d.atk)); f.def = Math.max(0, Math.round(f.def * d.def));
                f.exp = Math.round(f.exp * d.exp); f.g = Math.round(f.g * d.g);
            });
        }catch(e){ console.error("[diff]", e); }
    };
})();

// ---------------------------------------------------------------- チート：使用中の管理
const TQ_TOGGLES = {god:"無敵モード", onehit:"ワンパンモード", infmp:"MPむげん", areall:"ARE！ゲージ MAX固定", noenc:"エンカウントなし", encx3:"エンカウント3倍", speed:"あるくの 2倍速", rainbow:"にじいろモード", showpos:"座標ひょうじ"};
function tqActs(){ const c = G.S.cx; if(!Array.isArray(c.act)) c.act = []; return c.act; }
function tqActFind(g){ return tqActs().find((a) => a.g === g); }
function tqActDrop(g){ const c = G.S.cx; c.act = tqActs().filter((a) => a.g !== g); }

// レベルチート中に もらった 経験値を「もとのレベル」にも つみかさねる
(function(){
    const _gain = tqGain;
    tqGain = function(exp){
        const a = G.S && G.S.cx && Array.isArray(G.S.cx.act) ? G.S.cx.act.find((x) => x.g === "lv") : null;
        if(a && a.snap && a.snap.lv < TQ_MAX_LV){
            a.snap.exp += Math.round(exp * (G.S.expmul || 1));
            while(a.snap.lv < TQ_MAX_LV && a.snap.exp >= rpgNeed(a.snap.lv)){ a.snap.exp -= rpgNeed(a.snap.lv); a.snap.lv++; }
            if(a.snap.lv >= TQ_MAX_LV) a.snap.exp = 0;
        }
        return _gain.apply(this, arguments);
    };
})();

function tqActOne(raw){
    const S = G.S, c = S.cx, f = tqFindCheat(raw), id = f && f.id;
    const before = {party:S.party.slice(), lv:S.lv, exp:S.exp, own:S.own.slice(), eq:Object.assign({}, S.eq), expmul:S.expmul || 1};
    const r = _tqApplyBase(raw);
    if(!r.ok || r.queued || !id) return r;
    const note = (extra) => { r.msg += "\n" + extra; };
    if(id === "off"){ const m = tqReleaseAll(true); if(m) r.msg += "\n" + m; return r; }
    if(id === "lvmax" || id === "lvset"){
        const had = tqActFind("lv");
        const lab = id === "lvmax" ? "レベル99" : "レベル" + S.lv;
        if(had){ had.label = lab; } else tqActs().push({g:"lv", label:lab, snap:{lv:before.lv, exp:before.exp}});
        note("（かいじょ すると もとの Lv" + tqActFind("lv").snap.lv + " に もどります。チート中に もらった 経験値は のこります）");
    }else if(id === "st999"){
        if(!tqActFind("st")) tqActs().push({g:"st", label:"ステータス999", snap:{}});
    }else if(id === "bestgear"){
        if(!tqActFind("gear")) tqActs().push({g:"gear", label:"さいきょうの そうび", snap:{own:before.own, eq:before.eq}});
    }else if(id === "expx10" || id === "expx100"){
        const had = tqActFind("exp"), lab = "経験値 ×" + (id === "expx10" ? 10 : 100);
        if(had) had.label = lab; else tqActs().push({g:"exp", label:lab, snap:{expmul:before.expmul}});
    }else if(id === "expx1"){ tqActDrop("exp"); }
    else if(id === "party5" || id === "party6" || id === "bossally" || id === "miraboss" || id === "miraally"){
        const added = S.party.filter((x) => !before.party.includes(x));
        if(added.length){
            const dropped = before.party.filter((x) => !S.party.includes(x));   // ミラ→ノイズクイーン への入れかえ
            tqActs().push({g:"party:" + added.join("+"), label:"なかま：" + added.map((x) => tqName(x)).join("・"), snap:{added, dropped}});
        }
    }else if(TQ_TOGGLES[id]){
        const key = id;
        if(c[key]){ if(!tqActFind("tg:" + key)) tqActs().push({g:"tg:" + key, label:TQ_TOGGLES[key], snap:{}}); } else tqActDrop("tg:" + key);
    }else if(id === "allgate"){
        if(!tqActFind("allgate")) tqActs().push({g:"allgate", label:"ゲート全開", snap:{}});
    }
    tqAutoSave();
    return r;
}

// 1つ かいじょ する。メッセージを かえす
function tqReleaseOne(g){
    const S = G.S, c = S.cx, a = tqActFind(g); if(!a) return "";
    let m = a.label + " を かいじょ した。";
    if(g === "lv"){
        const lv0 = S.lv, to = Math.max(1, a.snap.lv);
        S.lv = to; S.exp = a.snap.lv >= TQ_MAX_LV ? 0 : Math.min(a.snap.exp, rpgNeed(to) - 1);
        m = "レベルチートを かいじょ。Lv" + lv0 + " → Lv" + to + "（チート中に もらった 経験値も ちゃんと はんえい！）";
    }else if(g === "st"){ delete c.st999; m = "ステータス999を かいじょ。ほんらいの つよさに もどった。"; }
    else if(g === "gear"){
        S.own = S.own.filter((k) => a.snap.own.includes(k) || !["w6", "a6", "c4"].includes(k));
        ["w", "a", "c"].forEach((sl) => { if(["w6", "a6", "c4"].includes(S.eq[sl]) && !a.snap.own.includes(S.eq[sl])) S.eq[sl] = a.snap.eq[sl] && S.own.includes(a.snap.eq[sl]) ? a.snap.eq[sl] : (S.own.filter((k) => RPG_EQUIP[k].slot === sl).pop() || S.eq[sl]); });
        m = "さいきょうの そうびを かいじょ。もとの そうびに もどした。";
    }else if(g === "exp"){ S.expmul = a.snap.expmul || 1; m = "経験値の倍率を もとに もどした。（×" + S.expmul + "）"; }
    else if(g.indexOf("party:") === 0){
        const names = a.snap.added.map((x) => tqName(x)).join("・");
        S.party = S.party.filter((x) => !a.snap.added.includes(x) || x === "hero"); a.snap.added.forEach((x) => { delete S.m[x]; });
        (a.snap.dropped || []).forEach((x) => { if(!S.party.includes(x) && S.party.length < 6) tqAddMember(x, true); });
        if(S.party.length === 0) S.party = ["hero"];
        m = names + " は パーティから はなれた。";
    }
    else if(g.indexOf("tg:") === 0){ c[g.slice(3)] = false; }
    else if(g === "allgate"){ c.allgate = false; m = "ゲート全開を かいじょ。"; }
    tqActDrop(g);
    return m;
}
function tqReleaseAll(silent){
    if(!G.S) return "";
    const gs = tqActs().map((a) => a.g), out = [];
    // レベルは さいごに（ほかの かいじょで ステータスが かわるため）
    gs.sort((x, y) => (x === "lv") - (y === "lv"));
    gs.forEach((g) => { const m = tqReleaseOne(g); if(m) out.push(m); });
    TQ_TOGGLES && Object.keys(TQ_TOGGLES).forEach((k) => { G.S.cx[k] = false; });
    tqFixAfterRelease();
    tqAutoSave();
    return out.length ? out.join("\n") : (silent ? "" : "かいじょ する チートは ありません。");
}
// かいじょ のあと：HP/MPを あたらしい さいだい値に あわせ、のこりすぎ・へりすぎを おさえる
function tqFixAfterRelease(){
    const S = G.S;
    S.party.forEach((id) => { if(!S.m[id]) S.m[id] = {hp:1, mp:1}; });
    tqClamp();
    S.party.forEach((id) => { const m = S.m[id], st = tqStat(id); if(m.hp <= 0 && id === "hero") m.hp = 1; m.hp = Math.max(m.hp, Math.min(1, st.maxhp)); });
}
function tqRelease(g){ const m = tqReleaseOne(g); tqFixAfterRelease(); tqAutoSave(); return m || "かいじょ できる チートは ありません。"; }

// 複数同時入力（；／、／|で区切る）
let _tqApplyBase = tqApplyCheat;
tqApplyCheat = function(raw){
    const parts = String(raw == null ? "" : raw).split(/[;；、|｜\n]/).map((x) => x.trim()).filter(Boolean);
    if(parts.length <= 1){ return G.S ? tqActOne(parts[0] || raw) : _tqApplyBase(raw); }
    const msgs = []; let any = false;
    parts.forEach((p) => { const r = G.S ? tqActOne(p) : _tqApplyBase(p); any = any || r.ok; msgs.push((r.ok ? "◯ " : "× ") + r.msg.split("\n")[0]); });
    return {ok:any, msg:msgs.join("\n")};
};

// ---------------------------------------------------------------- 画面：チート／なまえ／むずかしさ
(function(){
    const _vc = viewCheat;
    viewCheat = function(){
        let h = _vc().replace('maxlength="40"', 'maxlength="300"').replace("コードを にゅうりょく", "コード（まとめて：；で区切る）");
        if(G.S){
            const a = tqActs();
            const list = '<div class="card"><b>🔧 いま つかっている チート</b>' + (a.length ? a.map((x) => '<div class="row" style="justify-content:space-between;align-items:center"><span>' + esc(x.label) + '</span><button class="btn sub" data-a="cRel" data-v="' + esc(x.g) + '">かいじょ</button></div>').join("") +
                '<div class="row"><button class="btn" data-a="cRelAll">ぜんぶ かいじょ</button></div>' : '<div class="meta">いまは ありません。</div>') +
                '<div class="meta">かいじょ すると、レベルや ステータス、そうび、なかまが いい感じに もどります。チート中に もらった 経験値は のこるので そんしません。おかね・どうぐ・ストーリーを すすめる コードは プレゼント あつかい（かいじょしても そのまま）。コードは「；」で 区切ると まとめて 入力できます。</div></div>';
            h = h.replace('<div class="meta">ヒント：', list + '<div class="meta">ヒント：');
        }
        return h;
    };
    ACT.cRel = (v) => { const m = tqRelease(v); G.cheatMsg = m; G.cheatOk = true; render(); };
    ACT.cRelAll = () => { const m = tqReleaseAll(false); G.cheatMsg = m; G.cheatOk = true; render(); };
})();

function tqCustomView(){
    const S = G.S, k = tqDiff();
    let h = '<h2>🔧 なまえ・むずかしさ</h2><div class="card"><b>むずかしさ</b>：' + esc(TQ_DIFFS[k].n) + '<div class="meta">' + esc(TQ_DIFFS[k].d) + '（あとから いつでも かえられる）</div><div class="row">' +
        Object.keys(TQ_DIFFS).map((x) => '<button class="btn' + (x === k ? "" : " sub") + '" data-a="dSet" data-v="' + x + '">' + esc(TQ_DIFFS[x].n) + '</button>').join("") + '</div></div>';
    h += '<div class="card"><b>なかまの なまえ</b><div class="meta">8文字まで。空にして「けってい」で もとの なまえに もどる。</div>' +
        S.party.filter((id) => id !== "hero").map((id) => '<div class="row" style="align-items:center"><span style="min-width:9cqw">' + esc(RPG_CLASS[id].n) + '</span><input id="nk_' + id + '" type="text" maxlength="8" value="' + esc(tqName(id) === RPG_CLASS[id].n ? "" : tqName(id)) + '" placeholder="' + esc(RPG_CLASS[id].n) + '" autocomplete="off" style="width:16cqw"><button class="btn sub" data-a="nkSet" data-v="' + id + '">けってい</button></div>').join("") +
        (S.party.length < 2 ? '<div class="meta">なかまが いません。</div>' : "") +
        '<div class="meta">' + esc(G.menuMsg || "") + '</div></div>';
    return h;
}
ACT.dSet = (v) => { const r = tqSetDiff(v); G.menuMsg = r.msg; render(); };
ACT.nkSet = (id) => { const r = tqSetNick(id, ($("nk_" + id) || {}).value || ""); G.menuMsg = r.msg; render(); };

// せってい画面にも むずかしさ
(function(){
    const _vs = viewSettings;
    viewSettings = function(){
        let h = _vs();
        if(G.S){
            const k = tqDiff();
            const card = '<div class="card"><div class="meta">むずかしさ（いつでも かえられる）</div><div class="row">' + Object.keys(TQ_DIFFS).map((x) => '<button class="btn' + (x === k ? "" : " sub") + '" data-a="sDiff" data-v="' + x + '">' + esc(TQ_DIFFS[x].n) + '</button>').join("") + '</div><div class="meta">' + esc(TQ_DIFFS[k].d) + '</div></div>';
            h = h.replace('<div class="row"><button class="btn" data-a="sBack">', card + '<div class="row"><button class="btn" data-a="sBack">');
        }
        return h;
    };
    ACT.sDiff = (v) => { tqSetDiff(v); render(); };
})();

// ---------------------------------------------------------------- ボスの イラスト（game/img/b_○○.webp）
// ある ボスだけ イラストで ひょうじ（ほかの てきは 今まで どおり 絵文字）
const TQ_BOSS_ART = ["gyutan", "panda", "anaun", "reindeer", "whale", "teddy", "spamking", "owl", "miraqueen", "skydragon", "omega"];
const TQ_BOSS_ART_PK = ["MON026", "MON040", "MON159", "MON173", "MON278", "MON292", "MON411", "MON425"];
TQ_BOSS_ART.forEach((k) => { if(RPG_FOES[k]) RPG_FOES[k].img = "b_" + k; });
(function(){
    if(typeof pkRegFoe !== "function") return;
    const _reg = pkRegFoe;
    pkRegFoe = function(monId){
        const key = _reg.apply(this, arguments);
        try{ if(key && RPG_FOES[key] && TQ_BOSS_ART_PK.includes(monId)) RPG_FOES[key].img = "b_" + monId; }catch(_e){}
        return key;
    };
})();
