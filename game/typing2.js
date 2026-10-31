"use strict";
// ===== タイピングチャレンジ（作り直し）=====
// ジャンル：モンスター名／会話文／仲間キャラ／ランダム　×　むずかしさ：かんたん／ふつう／むずかしい／ランダム
// 文章（ローマ字）は これまでと同じ。画面には 日本語 と ローマ字 の りょうほうを 出す。ごほうび計算は pack-casino.js の pkTypingScore のまま。
const TY_CATS = [{id:"mon", n:"👾 モンスター名"}, {id:"talk", n:"💬 会話文"}, {id:"mate", n:"🧑‍🤝‍🧑 仲間キャラ"}, {id:"rand", n:"🎲 ランダム"}];
const TY_DIFFS = [{id:"easy", n:"かんたん"}, {id:"normal", n:"ふつう"}, {id:"hard", n:"むずかしい"}, {id:"random", n:"ランダム"}];
const TY_TALK = [
    ["そういうときは、AREだ！", "sou iu toki wa are da"], ["今日も一日がんばろう", "kyou mo ichinichi ganbarou"], ["AREを使って未来を変える", "are wo tsukatte mirai wo kaeru"],
    ["ノイズはこわくないよ", "noizu wa kowakunai yo"], ["友だちといっしょに遊ぼう", "tomodachi to issho ni asobou"], ["心に残った返事をさがす", "kokoro ni nokotta henji wo sagasu"],
    ["ありがとうを伝える奇跡", "arigatou wo tsutaeru kiseki"], ["夢の続きを見よう", "yume no tsuzuki wo miyou"], ["朝の光が窓に届く", "asa no hikari ga mado ni todoku"],
    ["おいしいおにぎりを食べよう", "oishii onigiri wo tabeyou"], ["空を飛ぶくじらの夢", "sora wo tobu kujira no yume"], ["星空の道を歩く", "hoshizora no michi wo aruku"],
    ["たこ焼き祭りに行こう", "takoyaki matsuri ni ikou"], ["花咲く丘でお昼寝", "hanasaku oka de ohirune"], ["魚たちのパレード", "sakana tachi no parade"],
    ["昨日の話をしよう", "kinoo no hanashi wo shiyou"], ["もう一度挑戦しよう", "mou ichido chousen shiyou"], ["勇気を出して一歩前へ", "yuuki wo dashite ippo mae he"],
    ["みんなでクリアをめざそう", "minna de kuria wo mezasou"], ["楽しい冒険の始まり", "tanoshii bouken no hajimari"], ["その気持ちを大切に", "sono kimochi wo taisetsu ni"],
    ["コイヌネランドで会いましょう", "koinune land de aimashou"], ["手紙の返事を書こう", "tegami no henji wo kakou"], ["最後まであきらめない", "saigo made akiramenai"]];
const TY_MATE_NAMES = [["ハルキ", "haruki"], ["アキト", "akito"], ["海斗", "kaito"], ["亜理紗", "arisa"], ["蒼太", "souta"], ["紘", "hiro"], ["ミナ", "mina"], ["ミラ", "mira"], ["玲也", "reiya"], ["羽奈", "hana"], ["りかり", "rikari"], ["ゆうざいくん", "yuuzaikun"], ["さえこ", "saeko"], ["健斗", "kento"]];
const TY_MATE_LINES = [
    ["アキト「そういうときは、AREだ！」", "akito sou iu toki wa are da"], ["アキト「ゲートを 守る！」", "akito geeto wo mamoru"], ["ハルキ「バックアップは まかせろ」", "haruki bakkuappu wa makasero"],
    ["ハルキ「おつかれ」", "haruki otsukare"], ["海斗「頭脳 貸すよ！」", "kaito zunou kasu yo"], ["海斗「XRグラスで 見えるんだ」", "kaito xr gurasu de mieru nda"],
    ["亜理紗「応援してる！」", "arisa ouen shiteru"], ["亜理紗「みんな ARE 使ってるよ」", "arisa minna are tsukatteru yo"], ["蒼太「だいじょうぶ。いっしょに行こう」", "souta daijoubu issho ni ikou"],
    ["紘「ひとつずつ 考えよう」", "hiro hitotsu zutsu kangaeyou"], ["ミナ「おにぎり あるよ♪」", "mina onigiri aru yo"], ["ミラ「ひとりじゃ ないよ」", "mira hitori ja nai yo"],
    ["羽奈「きょうも いい天気！」", "hana kyou mo ii tenki"], ["りかり「作戦会議だよ！」", "rikari sakusen kaigi da yo"], ["ゆうざいくん「いい作戦だね」", "yuuzaikun ii sakusen da ne"]];

// ---- かな → ローマ字（モンスター名用）
const TY_K = {あ:"a", い:"i", う:"u", え:"e", お:"o", か:"ka", き:"ki", く:"ku", け:"ke", こ:"ko", さ:"sa", し:"shi", す:"su", せ:"se", そ:"so", た:"ta", ち:"chi", つ:"tsu", て:"te", と:"to", な:"na", に:"ni", ぬ:"nu", ね:"ne", の:"no",
    は:"ha", ひ:"hi", ふ:"fu", へ:"he", ほ:"ho", ま:"ma", み:"mi", む:"mu", め:"me", も:"mo", や:"ya", ゆ:"yu", よ:"yo", ら:"ra", り:"ri", る:"ru", れ:"re", ろ:"ro", わ:"wa", を:"wo", ん:"n",
    が:"ga", ぎ:"gi", ぐ:"gu", げ:"ge", ご:"go", ざ:"za", じ:"ji", ず:"zu", ぜ:"ze", ぞ:"zo", だ:"da", ぢ:"ji", づ:"zu", で:"de", ど:"do", ば:"ba", び:"bi", ぶ:"bu", べ:"be", ぼ:"bo", ぱ:"pa", ぴ:"pi", ぷ:"pu", ぺ:"pe", ぽ:"po", ゔ:"vu"};
function tyRomaji(src){
    const s = String(src).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)), out = []; let dbl = false;
    for(const ch of s){
        if(ch === "・" || ch === " " || ch === "　"){ out.push(" "); continue; }
        if(/[A-Za-z0-9]/.test(ch)){ out.push(ch.toLowerCase()); continue; }
        if(ch === "ー"){ out.push("-"); continue; }
        if(ch === "っ"){ dbl = true; continue; }
        const small = "ゃゅょぁぃぅぇぉ".indexOf(ch);
        if(small >= 0){
            const prev = out.pop() || "";
            const vv = ch === "ゃ" ? "a" : ch === "ゅ" ? "u" : ch === "ょ" ? "o" : "aiueo"["ぁぃぅぇぉ".indexOf(ch)] || "a";
            if(ch === "ゃ" || ch === "ゅ" || ch === "ょ") out.push(/(shi|chi|ji)$/.test(prev) ? prev.slice(0, -1) + vv : prev.replace(/i$/, "") + "y" + vv);
            else out.push(prev === "u" && vv !== "a" && vv !== "u" ? "w" + vv : prev === "fu" ? "f" + vv : prev === "vu" ? "v" + vv : /(te|de)$/.test(prev) && vv === "i" ? prev.slice(0, -1) + "i" : prev.replace(/[aiueo]$/, "") + vv);
            continue;
        }
        const r = TY_K[ch]; if(!r) return null;
        out.push(dbl ? r[0] + r : r); dbl = false;
    }
    return out.join("").replace(/\s+/g, " ").trim();
}
// ---- 文章の しなぞろえ
let TY_POOL = null;
function tyBuild(){
    const mon = [];
    try{ ((window.PK && PK.L && PK.L.monsters) || []).forEach((m) => { const r = tyRomaji(m.name); if(r && /^[a-z0-9\- ]+$/.test(r) && r.length >= 3 && r.length <= 30) mon.push([m.name, r]); }); }catch(_e){}
    try{ Object.keys(RPG_FOES).forEach((k) => { const f = RPG_FOES[k], r = f && f.n ? tyRomaji(f.n) : null; if(r && /^[a-z0-9\- ]+$/.test(r) && r.length >= 3 && r.length <= 30) mon.push([f.n, r]); }); }catch(_e){}
    const seen = {}, mons = mon.filter((x) => (seen[x[1]] ? false : (seen[x[1]] = 1)));
    const byLen = (a, lo, hi) => a.filter((x) => x[1].length >= lo && x[1].length <= hi);
    const talkS = TY_TALK.slice().sort((a, b) => a[1].length - b[1].length), mateAll = TY_MATE_NAMES.concat(TY_MATE_LINES);
    TY_POOL = {
        mon:{easy:byLen(mons, 3, 8), normal:byLen(mons, 9, 13), hard:byLen(mons, 14, 30)},
        talk:{easy:talkS.slice(0, 10), normal:talkS.slice(8), hard:null},
        mate:{easy:TY_MATE_NAMES, normal:TY_MATE_LINES.filter((x) => x[1].length <= 26), hard:TY_MATE_LINES.filter((x) => x[1].length > 26), all:mateAll}
    };
    ["easy", "normal", "hard"].forEach((d) => { if(!TY_POOL.mon[d].length) TY_POOL.mon[d] = mons.slice(); });
    if(!TY_POOL.mate.hard.length) TY_POOL.mate.hard = TY_MATE_LINES.slice();
    TY_POOL.mons = mons;
}
function tyPick(arr){ return arr[Math.floor(G.rnd() * arr.length)]; }
function tyNext(g){
    if(!TY_POOL) tyBuild();
    const cat = g.cat === "rand" ? tyPick(["mon", "talk", "mate"]) : g.cat, dif = g.diff === "random" ? tyPick(["easy", "normal", "hard"]) : g.diff;
    let p;
    if(cat === "talk" && dif === "hard"){ const a = tyPick(TY_TALK); let b = tyPick(TY_TALK); if(b === a) b = TY_TALK[(TY_TALK.indexOf(a) + 7) % TY_TALK.length]; p = [a[0] + "　" + b[0], a[1] + " " + b[1]]; }
    else if(cat === "mon" && dif === "hard" && G.rnd() < 0.5){ const a = tyPick(TY_POOL.mon.normal); let b = tyPick(TY_POOL.mon.normal); if(b === a) b = tyPick(TY_POOL.mon.easy); p = [a[0] + "　" + b[0], a[1] + " " + b[1]]; }
    else{ const L = TY_POOL[cat][dif]; p = tyPick(L && L.length ? L : TY_POOL[cat].normal); }
    if(g.cur && p[1] === g.cur[1]) p = tyPick((TY_POOL[cat].normal || []).concat(TY_POOL.mons));
    g.cur = p; g.pos = 0; g.curTag = TY_CATS.find((c) => c.id === cat).n + "・" + TY_DIFFS.find((d) => d.id === dif).n;
}
// ---- メニュー（ジャンル ＋ むずかしさ 4つ）
function tyMenuBtns(g, dis){
    const sel = G.pk.tyCat || "mon";
    return '<label class="meta">ジャンル：<select id="pkTyCat">' + TY_CATS.map((c) => '<option value="' + c.id + '"' + (sel === c.id ? " selected" : "") + '>' + c.n + '</option>').join("") + '</select></label> ' +
        TY_DIFFS.map((d) => pkBtn(d.n, "cas|CAS003|" + d.id, {dis})).join("");
}
(function(){
    const _do = pkCasDo;
    pkCasDo = function(c, a){
        if(c === "cas" && a[1] === "CAS003" && a[2] !== "help"){ const el = $("pkTyCat"); if(el) G.pk.tyCat = el.value; }
        return _do.apply(this, arguments);
    };
})();
// ---- ゲーム本体
pkTypeNew = function(did, token){
    const def = PK.GM.CAS003, lv = def.difficulty_levels, d0 = lv.find((x) => x.id === did) || lv[1];
    const label = (TY_DIFFS.find((x) => x.id === did) || TY_DIFFS[3]).n;
    const g = {id:"CAS003", diff:did || "random", d:Object.assign({}, d0, {name:label}), cat:(G.pk && G.pk.tyCat) || "mon", phase:"ready", token, pos:0, log:[], left:d0.duration_seconds, cur:null};
    if(!TY_POOL) tyBuild(); tyNext(g); return g;
};
pkTypeAfter = function(g){ if(g.phase === "play"){ const el = $("pkTyIn"); if(el){ el.value = g.cur[1].slice(0, g.pos); el.focus(); } } };
pkTypeInput = function(val){
    const g = G.pk && G.pk.game; if(!g || g.id !== "CAS003" || g.phase !== "play") return; const el = $("pkTyIn");
    const tgt = g.cur[1], now = performance.now() - g.t0;
    if(val.length > g.pos + 1){ if(el) el.value = tgt.slice(0, g.pos); g.pasted = (g.pasted || 0) + 1; return; }
    if(val.length < g.pos){ if(el) el.value = tgt.slice(0, g.pos); return; }
    if(val.length === g.pos) return;
    const ch = val[val.length - 1];
    if(ch === tgt[g.pos]){
        g.log.push([Math.round(now), 1]); g.pos++; pkBeep(660, 0.03, 0.02);
        if(g.pos >= tgt.length){ g.words = (g.words || 0) + 1; tyNext(g); if(el) el.value = ""; const t = $("pkTyBox"); if(t) t.innerHTML = tyTarget(g); return; }
    }else{ g.log.push([Math.round(now), 0]); pkBeep(180, 0.05, 0.03); if(el) el.value = tgt.slice(0, g.pos); }
    const t = $("pkTyBox"); if(t) t.innerHTML = tyTarget(g);
};
function tyTarget(g){
    const ro = g.cur[1];
    return '<div class="meta">' + esc(g.curTag || "") + '</div><div style="font-size:3.2cqw;font-weight:bold;margin:.6cqw 0">' + esc(g.cur[0]) + '</div>' +
        '<div style="font-size:2.6cqw;letter-spacing:.2cqw;font-family:monospace;white-space:pre-wrap"><span class="okc">' + esc(ro.slice(0, g.pos)) + '</span><span>' + esc(ro.slice(g.pos)) + '</span></div>';
}
pkTypeTarget = function(g){ return tyTarget(g); };
pkTypeView = function(g){
    const cat = TY_CATS.find((c) => c.id === g.cat) || TY_CATS[0];
    if(g.phase === "ready") return '<div class="card"><b>' + esc(cat.n) + '</b>　むずかしさ：<b>' + esc(g.d.name) + '</b>（' + g.d.duration_seconds + '秒）<div class="meta">上に でる 日本語を、下の ローマ字どおりに キーボードで うちこもう。まちがえた キーは ミスに なり、正しい キーを うつまで すすみません。ローマ字は スペースも いれてね。<br>ごほうび：せいかいした 文字ごとに 🪙1 ＋ せいかくさ95%いじょうで 🪙100 ＋ はやさボーナス。「ランダム」は 1もんごとに かわるよ。</div><div class="row">' + pkBtn("スタート！", "tgo") + '</div></div>';
    if(g.phase === "end"){ const r = g.res; return '<div class="card"><h3>けっか</h3><div>' + esc(cat.n) + '・' + esc(g.d.name) + '　うちきった もんだい ' + (g.words || 0) + '</div><div>せいかい ' + r.correct + '文字　ミス ' + r.miss + '　せいかくさ ' + r.acc.toFixed(1) + '%　スピード ' + Math.round(r.cpm) + '文字/分</div>' + (r.bad ? '<div class="err">むこうな 入力が ' + r.bad + 'こ ありました。</div>' : '') + '<div class="okc">🪙 ' + pkNum(r.coins) + ' コイン（もじ ' + r.base + ' ＋ せいかくボーナス ' + r.accB + ' ＋ はやさ ' + r.spd + '）</div><div class="row">' + pkBtn("もういちど", "cagain") + pkBtn("カジノへ もどる", "cend", {sub:1}) + '</div></div>'; }
    return '<div class="meta"><span id="pkTimer">のこり ' + Math.ceil(g.left) + '秒</span></div><div class="card" id="pkTyBox">' + tyTarget(g) + '</div><input id="pkTyIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;font-size:2.6cqw" data-ty="1">';
};
