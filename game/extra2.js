"use strict";
// ===== あたらしい 初心者ガイド／リプレイコード／追加チート =====
// ※ チート・リプレイの「コードそのもの」は ここには ありません（指紋だけ。 → replay-codes.js）

// ---------------------------------------------------------------- こまったときは？（初心者ガイド）
function tqGuideView(){
    const S = G.S, f = S.f;
    const story = [
        [true, "🕰 ラボで ARE が あと少しで完成…でも 6つの『大事なメモリ』が ノイズに もちさられ、過去の世界に ちらばった！ ラボの『ゲート』から 過去へ とんで メモリを とりもどそう。"],
        [f.e_sendai, "🥩 2026年9月の ホシミ台：ノイズに なやむ 人たちを たすけて ① のメモリを ゲット。"],
        [f.e_tokyo, "🌃 2025年12月の 夜のアカリ市：ある開発者の ひみつに ふれて ② のメモリを ゲット。"],
        [f.e_white, "⬜ まっしろルーム：ふしぎな 部屋で ③ のメモリを ゲット。"],
        [f.e_xmas, "🎄 2028年12月25日：クリスマスの アカリ市で ④ のメモリを ゲット。"],
        [f.e_labn, "🌙 ARE が 生まれた 夜：若い アキトと ハルキに あって ⑤ のメモリを ゲット。"],
        [f.e_n8, "🌲 ノイズの深層：第1層〜第4層。ノイズの ひみつに せまる！"],
        [f.e_future, "🏙 2035年 ARE タワー：さいごの メモリを かけて ノイズの 王と たいけつ。ARE かんせい！"],
        [f.e_ep10, "🍂 追加エピソード 10月：ウォークラリーと がけ。"], [f.e_ep11, "🍁 追加エピソード 11月21日：おんがくの はくぶつかんと スマホの なぞ。"],
        [f.e_ep11b, "🧹 追加エピソード 11月22日：おおそうじと となりの さわぎ。"], [f.e_ep12, "🎄 追加エピソード 12月：キラキラ ラウンジの わな。"], [f.e_ep01, "🎂 追加エピソード 1月：22さいへの みち。"],
        [f.e_ks1, "🔮 烏坂探偵事務所①：うらない師と マジックの なぞ。"], [f.e_ks2, "🎭 烏坂探偵事務所②：ニセテストの なぞ。"], [f.e_ks3, "✉️ 烏坂探偵事務所③：マジックショーと てがみ。"], [f.e_ks4, "🎩 烏坂探偵事務所④：さいごの マジック。"], [f.e_ks5, "🏝 烏坂探偵事務所⑤：SP 丹羽鳥島の ひみつ。"],
        [f.e_yh5, "🦸 やりすぎヒーロー伝説 ①：第1〜5話（ちいさな ヒーローの はじまり〜勉強の まほう）。"], [f.e_yh10, "🦸 やりすぎヒーロー伝説 ②：第6〜10話（ちょうせんじょう〜ちこく しそうな 試験日）。"], [f.e_yh15, "🦸 やりすぎヒーロー伝説 ③：第11〜15話（マジック たいけつ〜ロボット紘）。"], [f.e_kn10, "🎡 コイヌネランド（本編・全10話）：タカシと ケンジの 夏の 1日と なぞとき。"], [f.e_wn10, "🐶 ワンコロランド（任意・全10話）：4人の 全制覇ミッション。"], [f.e_us10, "🐰 ウサウサランド（任意・全10話）：雨と 氷点下の 45アトラクション と 脱出ゲーム。"], [f.e_ssa_all, "🗺️ Map1サブ『コード・オブ・デスティニー』（20話）：アプリ開発の善悪と ふしぎな運命。"], [f.e_ssb_all, "🗺️ Map2サブ『リプレイワールド』（20話）：タイムスリップと あやしい さそいを 見やぶる。"], [f.e_ssc_all, "🗺️ Map3サブ『人生2周目』（20話）：予言少年 紘と さえこの 物語。"], [f.e_sse_all, "🗺️ Map5サブ『楽しい時ほど、大さんじ！？』（10話）：だいち・まひろ・あかりの 大さわぎ デート。"], [f.e_ssf_all, "🗺️ Map6サブ『人生おにハードモード』（10話）：眠杉の 一週間。"], [f.e_ssg_all, "🗺️ Map7サブ『職業せんたく』（10話）：拓也くんの しごと さがし。"], [f.e_ssh_all, "🗺️ Map8サブ『デビルバイト』（10話）：うまい 話に ご用心。"], [f.e_ssi_all, "🗺️ Map9サブ『うそはるの はじまり』（10話）：転売ヤーと うそはる。"], [f.e_ssj_all, "🗺️ Map10サブ『7日間の 星の子』（10話）：翔太と 美月の 7日間。"], [f.e_dk10, "📖 出来事（おまけ）：主人公の 秋の 日々と AREChat 運用開始。 これで ARE QUEST は 完！"],
        [f.e_yh20, "🌙 やりすぎヒーロー伝説 ④：第16〜20話（遊園地の かなしみ〜ありがとう ぜんぶの 物語）。15職業 Lv99、天才が ひらいた！"],
        [f.e_xr, "🥽 おまけ：XRアドベンチャー体験会。"]
    ].filter((x) => x[0]).map((x) => "・" + x[1]).join("\n");
    const faq = [
        ["どこへ 行けば いいか わからない", "メニュー →『メモリ・もくてき』の「🎯 いまの もくてき」を 見てね。いちばん たしかな ヒントだよ。"],
        ["ラボの『ゲート』って？", "ラボの かべぎわの ゲート（Gの マス）を しらべると、過去の 時代へ いけます。ゲートで ラボに もどることも できるよ。"],
        ["たたかいが つらい", "①レベルを あげる（メニュー→『⚡ じどう（オート）』で じどうレベル上げ）②おにぎりや そうびを ととのえる ③『🔧 なまえ・むずかしさ』で イージーモードに。いつでも かえられます。"],
        ["ゲームオーバーに なったら？", "ラボの ソファで めがさめるよ（ゴールドが 半分に なるだけ）。データは きえません。"],
        ["セーブは どうするの？", "メニュー →『📖 ぼうけんのしょ』。3つまで。メニューを とじるたびに じどうセーブも されるよ。"],
        ["仲間が ふえない", "ストーリーを すすめると なかまが くわわります。ラボの アキト・ハルキに 話しかけてみよう。"],
        ["職業って？", "地図1(ホシミ台)を クリアして レベル10になると『👔 てんしょく』で 15しゅるいの 職業に つける。職業で おぼえた わざは、ずっと つかえるよ。"],
        ["称号って？", "『🏅 しょうごう』。もくひょうを たっせいすると もらえて、ごほうびの ゴールドも もらえる！"],
        ["スマホで そうさが むずかしい", "画面の 十字ボタンと Aボタンで あそべます。『せってい』で パッドの ON/OFF も できるよ。"],
        ["あそびは いつ ふえるの？", "メニュー『🎪 追加コンテンツ』は すすめるほど ふえます。はじめから：プレゼントコード・ずかん・実績／地図1(ホシミ台)クリア：転職・クエスト／地図2(アカリ市)クリア：カジノ／地図3(運命開発ビル)クリア：牧場・スカウト・配合・転生・格闘場／本編クリア：強くてニューゲームなど。地図2・地図4のあとは、レベル上げや ゴールド稼ぎが しやすい モンスターも でてくるよ。"],
        ["レベルが あがると？", "HPと MPが ぜんかいふく します（ハードモードは かいふくしません）。"]
    ];
    let h = '<h2>❓ こまったときは</h2>' +
        '<div class="card"><b>🎯 いま やること</b><div>' + esc(tqObjective()) + '</div></div>' +
        '<div class="card"><b>📖 ここまでの ものがたり</b><div class="meta" style="white-space:pre-wrap">' + esc(story) + '</div></div>' +
        '<div class="card"><b>🎮 そうさ</b><div class="meta">いどう：矢印キー／WASD／十字ボタン　はなす・しらべる：Enter／Z／Aボタン　メニュー：X／M　もどる：Esc／X</div></div>';
    faq.forEach((q) => { h += '<div class="card"><b>Q. ' + esc(q[0]) + '</b><div class="meta">' + esc(q[1]) + '</div></div>'; });
    h += '<div class="card meta">くわしい てじゅんしょは <a href="../help.html#rpg" target="_blank" style="color:#9fd0ff">help.html の「RPG 手順書」</a> に あります。</div>';
    return h;
}
(function(){
    const _h = helpText;
    helpText = function(){
        return _h.apply(this, arguments) + "\n\n【はじめての 人へ】\n・ゲームを はじめたら ラボの アキトと ハルキに 話しかけよう。\n・こまったら メニュー →『❓ こまったときは』。いま やることが わかるよ。\n・たたかいが つらい ときは『🔧 なまえ・むずかしさ』で イージーに！\n・クリアすると タイトルに『🔁 リプレイコード』が でるよ。\n・くわしい 手順書は help.html の『RPG 手順書』。";
    };
})();

// ---------------------------------------------------------------- リプレイコード（クリア後の せかいを ひとあしさきに たいけん）
// コードの 指紋は replay-codes.js。いまの 画面には「名前」だけ ならぶ。
const TQ_REPLAYS = [
    {id:"rp_lab", n:"🏠 ARE かいはつラボ（クリア後）", era:null, map:"lab", pos:[8, 9], lv:40},
    {id:"rp_sendai", n:"🥩 2026年9月 ホシミ台（クリア後）", era:"sendai", lv:25},
    {id:"rp_tokyo", n:"🌃 夜のアカリ市（クリア後）", era:"tokyo", lv:30},
    {id:"rp_white", n:"⬜ まっしろルーム（クリア後）", era:"white", lv:34},
    {id:"rp_xmas", n:"🎄 クリスマスのアカリ市（クリア後）", era:"xmas", lv:38},
    {id:"rp_labn", n:"🌙 ARE 誕生の夜（クリア後）", era:"labn", lv:42},
    {id:"rp_future", n:"🏙 2035年 ARE タワー（クリア後）", era:"future", lv:50},
    {id:"rp_n8", n:"🌲 第1層 ノイズの森（クリア後）", era:"n8", lv:55},
    {id:"rp_n9", n:"🌊 第2層 ノイズの海ぞこ（クリア後）", era:"n9", lv:62},
    {id:"rp_n10", n:"🏰 第3層 サーバー城（クリア後）", era:"n10", lv:70},
    {id:"rp_n11", n:"👑 第4層 ノイズ王国（クリア後）", era:"n11", lv:80},
    {id:"rp_xr", n:"🥽 XRアドベンチャー体験会（クリア後）", era:"xr", lv:85}
];
function tqEverCleared(){
    try{ if(localStorage.getItem("tq_cleared") === "1") return true; }catch(_e){}
    for(let i = 1; i <= TQ_SLOTS; i++){ const r = tqReadSlot(i); if(r && !r.corrupted && r.data && r.data.f && r.data.f.e_future){ try{ localStorage.setItem("tq_cleared", "1"); }catch(_e){} return true; } }
    return false;
}
// クリアしたら 覚えておく（セーブを けしても リプレイコードは のこる）
(function(){
    const _a = tqAutoSave;
    tqAutoSave = function(){ try{ if(G.S && G.S.f && G.S.f.e_future) localStorage.setItem("tq_cleared", "1"); }catch(_e){} return _a.apply(this, arguments); };
})();
(function(){
    const _t = viewTitle;
    viewTitle = function(){
        let h = _t.apply(this, arguments);
        if(tqEverCleared()) h = h.replace('<button class="opt" data-a="tCheat">', '<button class="opt" data-a="tReplay">🔁 リプレイコード</button><button class="opt" data-a="tCheat">');
        return h;
    };
    const _fv = fieldView;
    fieldView = function(){ if(G.mode === "replay") return viewReplay(); return _fv.apply(this, arguments); };
})();
function tqReplayFlags(){
    const set = {}; const walk = (x) => { if(Array.isArray(x)){ if(x[0] === "set" && typeof x[1] === "string") set[x[1]] = 1; x.forEach(walk); } else if(x && typeof x === "object") Object.keys(x).forEach((k) => walk(x[k])); };
    walk(RPG_EV); return Object.keys(set);
}
function viewReplay(){
    const sel = G.rpSel && TQ_REPLAYS.find((r) => r.id === G.rpSel);
    let h = '<div class="win panel scroll"><h2>🔁 リプレイコード</h2>';
    if(!sel){
        h += '<div class="meta" style="margin-bottom:1cqw">どの リプレイコードを 使用しますか？（クリア後の せかいを ひとあしさきに たいけん！）</div>';
        TQ_REPLAYS.forEach((r) => { h += '<button class="opt" data-a="rpPick" data-v="' + r.id + '">' + esc(r.n) + '</button>'; });
        h += '<div class="row" style="margin-top:1cqw"><button class="btn sub" data-a="rpBack">もどる</button></div>';
    }else{
        h += '<div class="meta">「' + esc(sel.n) + '」を はじめます。どの 冒険の書に 記録しますか？（ここに ある データは 上書きされます）</div><div class="slots">';
        for(let i = 1; i <= TQ_SLOTS; i++){
            const r = tqReadSlot(i);
            h += '<div class="slot pick"><b>冒険の書 ' + i + '</b>' + (!r ? '<div class="meta" style="margin:2cqw 0">— あきわく —</div>' : r.corrupted ? '<div class="err">読み込めません</div>' : '<div class="meta">' + esc(r.name) + '　Lv' + r.data.lv + '</div>') + '<button class="btn" data-a="rpGo" data-v="' + i + '">ここに きろく</button></div>';
        }
        h += '</div><div class="row"><button class="btn sub" data-a="rpNo">べつの コードに する</button></div>';
    }
    return h + '</div>';
}
ACT.tReplay = () => { G.rpSel = null; G.mode = "replay"; render(); };
ACT.rpBack = () => { G.mode = "title"; render(); };
ACT.rpNo = () => { G.rpSel = null; render(); };
ACT.rpPick = (v) => { G.rpSel = v; render(); };
ACT.rpGo = (v) => {
    const i = Number(v), r = tqReadSlot(i);
    const go = (nm) => { const res = tqReplayStart(G.rpSel, i, nm); if(!res.ok){ toast(res.msg); } };
    let nm = "リプレイ"; for(let k = 1; k <= TQ_SLOTS; k++){ const x = tqReadSlot(k); if(x && !x.corrupted && x.data && x.data.name){ nm = x.data.name; break; } }
    if(r && !r.corrupted){ askConfirm("冒険の書 " + i + " を 上書きして はじめます。よろしいですか？", () => go(nm)); }
    else go(nm);
};
function tqReplayStart(id, slot, name){
    const rp = TQ_REPLAYS.find((x) => x.id === id); if(!rp) return {ok:false, msg:"そのリプレイは ありません。"};
    let prof = {name, sex:"m", pers:{name:"リプレイ", bonus:{}}};
    for(let k = 1; k <= TQ_SLOTS; k++){ const x = tqReadSlot(k); if(x && !x.corrupted && x.data && x.data.prof && x.data.f && x.data.f.e_future){ prof = JSON.parse(JSON.stringify(x.data.prof)); name = x.data.name || name; break; } }
    prof.name = name;
    const S = tqNewState(prof);
    G.S = S; G.slot = slot; G.saveName = name + "の リプレイ";
    tqReplayFlags().forEach((k) => { S.f[k] = 1; });
    ["e_sendai", "e_tokyo", "e_white", "e_xmas", "e_labn", "e_future", "intro_done", "xr_open", "e_n8", "e_n9", "e_n10", "e_n11"].forEach((k) => { S.f[k] = 1; });
    if(rp.id !== "rp_xr") delete S.f.e_xr;   // XRだけ 「はじめて」 を のこす
    S.mem = [1, 1, 1, 1, 1, 1]; S.cx.allgate = true; S.cx.replay = id;
    ["haruki", "akito", "kaito"].forEach((m) => { try{ tqAddMember(m, true); }catch(_e){} });
    S.lv = rp.lv; S.exp = 0; S.gold = 50000;
    ["w6", "a6", "c4"].forEach((k) => { if(RPG_EQUIP[k]){ if(!S.own.includes(k)) S.own.push(k); S.eq[RPG_EQUIP[k].slot] = k; } });
    S.items.onigiri = 20; S.items.coffee = 10;
    tqHealAll(); G.scripts = []; G.b = null; G.auto = false; G.grind = null; G.draft = null; G.rpSel = null;
    tqSaveTo(slot, G.saveName);
    enterGame("");
    const e = rp.era ? RPG_ERAS.find((x) => x.id === rp.era) : null;
    const map = e ? e.map : rp.map, pos = e ? e.pos : rp.pos;
    G.scripts.length = 0; G.mode = "map"; gotoMap(map, pos[0], pos[1]); G.info = "🔁 リプレイ：「" + rp.n + "」から はじまったよ！（Lv" + S.lv + "）"; tqAutoSave(); render();
    return {ok:true};
}
function askConfirm(text, fn){ if(typeof askYes === "function") askYes(text, fn); else if(confirm(text)) fn(); }

// ---------------------------------------------------------------- 追加チート（指紋は replay-codes.js）
(function(){
    const _ac = _tqApplyBase;
    const NG = ["gcrit", "gflee", "gscout", "ggold", "gexp"];
    _tqApplyBase = function(raw){
        const f = tqFindCheat(raw);
        if(!f) return _ac.apply(this, arguments);
        if(/^rp_/.test(f.id)){
            if(G.S) return {ok:false, msg:"リプレイコードは タイトル画面の『チート』から 入れてね。（今の データを まもるため）"};
            G.rpSel = f.id; G.mode = "replay"; return {ok:true, msg:"🔁 リプレイコード かくにん！ 記録する 冒険の書を えらんでね。"};
        }
        if(!/^x_/.test(f.id)) return _ac.apply(this, arguments);
        if(!G.S) return _ac.apply(this, arguments);   // queue 側で処理
        const S = G.S, c = S.cx; let msg = "";
        const all = () => TQ_JOBS.filter((d) => !d.genius);
        switch(f.id){
            case "x_jobmaster": { const j = tqJ(); all().forEach((d) => { if(!j.mast.includes(d.id)) j.mast.push(d.id); j.best[d.id] = 99; if(!j.tried.includes(d.id)) j.tried.push(d.id); d.abil.forEach((a) => { j.learned[a.id] = 1; }); }); msg = "15の 職業を ぜんぶ マスターした！ …ふしぎな 力が めざめそう…"; break; }
            case "x_genius": { const j = tqJ(); all().forEach((d) => { if(!j.mast.includes(d.id)) j.mast.push(d.id); j.best[d.id] = 99; if(!j.tried.includes(d.id)) j.tried.push(d.id); d.abil.forEach((a) => { j.learned[a.id] = 1; }); }); if(S.lv < 10) tqSetLevel(10); const r = tqJobChange("genius"); msg = r.msg; break; }
            case "x_joblv": { const j = tqJ(); const d = TQ_JOB_BY[j.cur]; if(!d) return {ok:false, msg:"いま 職業に ついていません。"}; if(!(f.nums[0] >= 1 && f.nums[0] <= 99)) return {ok:false, msg:"職業レベルは 1〜99 です。"}; j.jlv = f.nums[0]; j.jexp = 0; d.abil.forEach((a) => { if(j.jlv >= a.lv) j.learned[a.id] = 1; }); if(j.jlv >= 99 && !j.mast.includes(d.id)) j.mast.push(d.id); j.best[d.id] = Math.max(j.best[d.id] || 0, j.jlv); msg = "職業レベルが " + j.jlv + " に なった！"; break; }
            case "x_jobreset": S.job = {}; tqJ(); tqClamp(); msg = "職業の データを まっさらに もどした。"; break;
            case "x_titleall": { const t = tqTi(); TQ_TITLES.forEach((x) => { t.got[x.id] = 1; }); msg = "しょうごうが ぜんぶ てにはいった！（" + TQ_TITLES.length + "こ）"; break; }
            case "x_titlereset": S.cx.ti = {got:{}, sel:""}; msg = "しょうごうを まっさらに もどした。"; break;
            case "x_crit": msg = tqToggle("gcrit", "いつでも かいしん"); break;
            case "x_flee": msg = tqToggle("gflee", "いつでも にげられる"); break;
            case "x_scout": msg = tqToggle("gscout", "スカウト 100%"); break;
            case "x_gold3": msg = tqToggle("ggold", "ゴールド ×3"); break;
            case "x_exp3": msg = tqToggle("gexp", "経験値 ×3"); break;
            case "x_gold1m": S.gold = Math.min(TQ_MAX_GOLD, S.gold + 1000000); msg = "1,000,000G を てにいれた！"; break;
            case "x_addexp": { if(!(f.nums[0] > 0)) return {ok:false, msg:"経験値を 指定してください。"}; const u = tqGain(f.nums[0]); msg = f.nums[0].toLocaleString() + "EXP を てにいれた！" + (u.length ? "\n" + u.join("\n") : ""); break; }
            case "x_lvup": { if(!(f.nums[0] > 0)) return {ok:false, msg:"あげる レベルを 指定してください。"}; tqSetLevel(Math.min(99, S.lv + f.nums[0])); msg = "レベルが " + S.lv + " に なった！"; break; }
            case "x_lvdown": { if(!(f.nums[0] > 0)) return {ok:false, msg:"さげる レベルを 指定してください。"}; tqSetLevel(Math.max(1, S.lv - f.nums[0])); msg = "レベルが " + S.lv + " に なった。"; break; }
            case "x_unlock": c.allgate = true; S.f.xr_open = 1; msg = "ゲートの 行き先が ぜんぶ ひらいた！（ストーリーは そのまま）"; break;
            case "x_offg": NG.forEach((k) => { c[k] = false; }); msg = "天才の ちから（ON/OFF）を ぜんぶ OFF に した。"; break;
            case "x_warp": { const e = RPG_ERAS.find((x) => x.id === TQ_WARP_IDS[f.nums[0]]); if(!e) return {ok:false, msg:"そんな 行き先は ありません。"}; G.scripts.length = 0; gotoMap(e.map, e.pos[0], e.pos[1]); msg = e.n + " へ ワープ！"; break; }
            default: return _ac.apply(this, arguments);
        }
        try{ tqTitleCheck(true); }catch(_e){}
        tqAutoSave(); return {ok:true, msg};
    };
})();
const TQ_WARP_IDS = {1:"sendai", 2:"tokyo", 3:"white", 4:"xmas", 5:"labn", 6:"future", 7:"n8", 8:"n9", 9:"n10", 10:"n11", 11:"xr"};
// 「off」で 天才の ちからも きれる
(function(){
    const _ac = _tqApplyBase;
    _tqApplyBase = function(raw){ const r = _ac.apply(this, arguments); try{ const f = tqFindCheat(raw); if(f && f.id === "off" && G.S) ["gcrit", "gflee", "gscout", "ggold", "gexp"].forEach((k) => { G.S.cx[k] = false; }); }catch(_e){} return r; };
})();
