"use strict";
// ===== しょうごう（称号）：もくひょうを たっせいすると もらえる =====
// 保存：S.cx.ti = {got:{id:1}, sel:"id"}
const TQ_TITLES = (function(){
    const F = (k) => () => !!G.S.f[k], J = () => tqJ(), cnt = () => G.S.party.length;
    const L = [
        // ものがたり
        ["t_first", "はじめの いっぽ", "はじめて てきを たおす", () => G.S.kills >= 1, 100],
        ["t_sendai", "ホシミ台の ヒーロー", "2026年の ホシミ台を クリア", F("e_sendai"), 300],
        ["t_tokyo", "夜のアカリ市の たんていさん", "2025年の 夜のアカリ市を クリア", F("e_tokyo"), 300],
        ["t_white", "まっしろの たびびと", "まっしろルームを クリア", F("e_white"), 400],
        ["t_xmas", "クリスマスの きせき", "クリスマスの アカリ市を クリア", F("e_xmas"), 400],
        ["t_labn", "ARE たんじょうの めいげきしゃ", "ARE が 生まれた 夜を クリア", F("e_labn"), 500],
        ["t_future", "ARE かんせい！", "本編を クリアする", F("e_future"), 2000],
        ["t_n8", "ノイズの森の しんにゅうしゃ", "第1層を クリア", F("e_n8"), 800],
        ["t_n9", "うみぞこの すくいぬし", "第2層を クリア", F("e_n9"), 800],
        ["t_n10", "サーバー城の ゆうしゃ", "第3層を クリア", F("e_n10"), 1000],
        ["t_n11", "ノイズ王国の へいわの もと", "第4層を クリア", F("e_n11"), 3000],
        ["t_xr", "XRたいけんの たつじん", "XRアドベンチャー体験会を クリア", F("e_xr"), 1500],
        ["t_mem3", "メモリ あつめ 中", "メモリを 3つ あつめる", () => tqMemCount() >= 3, 300],
        ["t_mem6", "メモリ コンプリート", "メモリを 6つ ぜんぶ あつめる", () => tqMemCount() >= 6, 1000],
        // なかま
        ["t_p2", "ふたりは なかよし", "仲間が 2人以上", () => cnt() >= 2, 100],
        ["t_p4", "4人の ドリームチーム", "パーティが 4人", () => cnt() >= 4, 400],
        ["t_p6", "6人の ちょうチーム", "パーティが 6人（チート）", () => cnt() >= 6, 100],
        // レベル
        ["t_l10", "ひよっこ ぼうけんか", "レベル 10", () => G.S.lv >= 10, 100],
        ["t_l30", "いちにんまえ", "レベル 30", () => G.S.lv >= 30, 400],
        ["t_l50", "ベテラン", "レベル 50", () => G.S.lv >= 50, 800],
        ["t_l70", "えいゆう", "レベル 70", () => G.S.lv >= 70, 1500],
        ["t_l99", "ちょうてん", "レベル 99", () => G.S.lv >= 99, 5000],
        // たたかい
        ["t_k10", "モンスター ハンター", "てきを 10たい たおす", () => G.S.kills >= 10, 100],
        ["t_k100", "100たい ぎり", "てきを 100たい たおす", () => G.S.kills >= 100, 500],
        ["t_k500", "せんとうの たつじん", "てきを 500たい たおす", () => G.S.kills >= 500, 1500],
        ["t_k2000", "ノイズ バスター", "てきを 2000たい たおす", () => G.S.kills >= 2000, 4000],
        ["t_g10", "こつこつ レベルあげ", "じどうレベル上げを 10回", () => (G.S.grinds || 0) >= 10, 200],
        ["t_g100", "レベルあげの おに", "じどうレベル上げを 100回", () => (G.S.grinds || 0) >= 100, 1500],
        ["t_gauge", "AREの ほのお", "ARE！ゲージを ためて ひっさつを だす準備", () => G.S.gauge >= 100, 100],
        // おかね・あるく
        ["t_gold1", "おこづかい もちもち", "10,000G もつ", () => G.S.gold >= 10000, 200],
        ["t_gold2", "おかねもち", "100,000G もつ", () => G.S.gold >= 100000, 600],
        ["t_gold3", "ミリオネア", "1,000,000G もつ", () => G.S.gold >= 1000000, 2000],
        ["t_step1", "さんぽ ずき", "5,000歩 あるく", () => G.S.steps >= 5000, 200],
        ["t_step2", "せかいの たびびと", "50,000歩 あるく", () => G.S.steps >= 50000, 1000],
        ["t_play1", "1じかん あそんだよ", "プレイ 1時間", () => G.S.play >= 3600, 200],
        ["t_play2", "ARE ジャンキー", "プレイ 10時間", () => G.S.play >= 36000, 2000],
        // 職業
        ["t_j1", "てんしょく デビュー", "はじめて 転職する", () => J().changes >= 1, 300],
        ["t_j5", "いろんな しごとを したよ", "5つの 職業を ためす", () => J().tried.length >= 5, 800],
        ["t_j10", "ジョブ コレクター", "10の 職業を ためす", () => J().tried.length >= 10, 1500],
        ["t_m1", "はじめての マスター", "職業を 1つ マスター（Lv99）", () => J().mast.length >= 1, 1000],
        ["t_m5", "マスター 5人前", "職業を 5つ マスター", () => J().mast.filter((x) => x !== "genius").length >= 5, 2500],
        ["t_m10", "ジョブの たつじん", "職業を 10こ マスター", () => J().mast.filter((x) => x !== "genius").length >= 10, 4000],
        ["t_m15", "ぜんしょくぎょう マスター", "15の 職業を ぜんぶ マスター", () => J().mast.filter((x) => x !== "genius").length >= 15, 10000],
        ["t_gen", "🌈 天才", "天才の 職業に たどりつく", () => J().tried.includes("genius"), 20000],
        ["t_gen99", "かみさま レベル", "天才を マスター（職業Lv99）", () => J().mast.includes("genius"), 50000],
        ["t_abil", "わざ ずかん", "職業の わざを 20こ おぼえる", () => Object.keys(J().learned).filter((k) => J().learned[k]).length >= 20, 1500],
        ["t_abil2", "わざ コンプリート", "職業の わざを 50こ おぼえる", () => Object.keys(J().learned).filter((k) => /^J(0\d|1[0-5])/.test(k) && J().learned[k]).length >= 50, 6000],
        // おまけ
        ["t_diff", "ちょうせんしゃ", "むずかしさを ハードに する", () => G.S.diff === "hard", 300],
        ["t_cheat", "…ひみつを しっている ひと", "チートを つかってみる", () => !!(G.S.cx.god || G.S.cx.st999 || G.S.cx.onehit || G.S.cx.infmp || G.S.cx.noenc || G.S.expmul > 1), 0]
    ];
    return L.map((a) => ({id:a[0], n:a[1], d:a[2], f:a[3], g:a[4]}));
})();
const TQ_TITLE_BY = {}; TQ_TITLES.forEach((t) => { TQ_TITLE_BY[t.id] = t; });
function tqTi(){ const S = G.S; if(!S) return {got:{}, sel:""}; const t = (S.cx.ti = S.cx.ti || {got:{}, sel:""}); if(!t.got) t.got = {}; return t; }
function tqTitleCheck(quiet){
    if(!G.S || !G.S.cx) return [];
    const ti = tqTi(), out = [];
    TQ_TITLES.forEach((t) => {
        if(ti.got[t.id]) return;
        let ok = false; try{ ok = !!t.f(); }catch(_e){}
        if(ok){ ti.got[t.id] = 1; out.push(t); if(t.g) G.S.gold = Math.min(TQ_MAX_GOLD, G.S.gold + t.g); if(!ti.sel) ti.sel = t.id; }
    });
    if(out.length && !quiet && typeof toast === "function") toast("🏅 称号『" + out[0].n + "』を てにいれた！" + (out.length > 1 ? "（ほか " + (out.length - 1) + "こ）" : "") + (out.reduce((a, t) => a + t.g, 0) ? "　ごほうび " + out.reduce((a, t) => a + t.g, 0).toLocaleString() + "G" : ""));
    return out;
}
function tqTitleNow(){ const ti = tqTi(); const t = TQ_TITLE_BY[ti.sel]; return t ? t.n : ""; }
(function(){
    const _save = tqAutoSave;
    let busy = false;
    tqAutoSave = function(){ if(!busy && G.S){ busy = true; try{ tqTitleCheck(); }catch(e){ console.error("[title]", e); } busy = false; } return _save.apply(this, arguments); };
})();
function tqTitleView(){
    const ti = tqTi(); tqTitleCheck(true);
    const got = TQ_TITLES.filter((t) => ti.got[t.id]).length;
    let h = '<h2>🏅 しょうごう</h2><div class="card"><b>あつめた しょうごう：' + got + ' / ' + TQ_TITLES.length + '</b><div class="meta">もくひょうを たっせいすると もらえるよ。えらぶと なまえの よこに ついて ステータスに ひょうじ！</div>' +
        '<div class="meta">いま：' + (tqTitleNow() ? "『" + esc(tqTitleNow()) + "』" : "なし") + '</div>' + (ti.sel ? '<div class="row"><button class="btn sub" data-a="tiSel" data-v="">はずす</button></div>' : "") + '</div>';
    TQ_TITLES.forEach((t) => {
        const ok = !!ti.got[t.id];
        h += '<div class="card"' + (ok ? "" : ' style="opacity:.7"') + '><b>' + (ok ? "🏅 " + esc(t.n) : "🔒 ？？？") + '</b>' + (ti.sel === t.id ? ' <span class="okc">◀ つけている</span>' : "") + '<div class="meta">もくひょう：' + esc(t.d) + (t.g ? '　ごほうび ' + t.g.toLocaleString() + 'G' : "") + '</div>' + (ok && ti.sel !== t.id ? '<div class="row"><button class="btn" data-a="tiSel" data-v="' + t.id + '">つける</button></div>' : "") + '</div>';
    });
    return h;
}
ACT.tiSel = (v) => { tqTi().sel = v || ""; tqAutoSave(); render(); };
