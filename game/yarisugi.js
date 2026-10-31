"use strict";
// ===== 追加コンテンツ：やりすぎヒーロー伝説＆ドリームストーリー（全20話・長編）=====
//   ・本編クリア後、ゲートから ひらく。推奨Lv は 45 から 5ずつ あがり、さいごは Lv99 が つづく。
//   ・むずかしさは「イージー／ベーシック／ハード」に かかわらず ぜんぶ『ハードより むずかしい』で 固定。
//   ・1話ごとに 仲間が 2〜3人 くわわり、話が おわると はずれる。仲間は めっちゃ 強い！
//   ・ぜんぶ クリアすると 15の 職業が Lv99 に なり、16個目の職業『天才』が ひらく。
//   ・こわい 場面は「ゆめの アクション」ふう。ぶき・けが・いのちの 話は ありません（ノイズ・いたずら・ドッキリに おきかえ）。
//   ・NPC（仲間に できる ひと）は 本編＋追加コンテンツ ぜんぶで 100人（NPC001〜100）。
//   ※ 人名は 下の名前だけ。じっさいの 人物とは かんけい ありません（ゲームの なかの キャラクターです）。

// ---------------------------------------------------------------- 小さな 道具
const YKL = (a) => a.map((s) => { const i = s.indexOf("｜"); return i > 0 ? rpgS(s.slice(0, i), s.slice(i + 1)) : rpgN(s); });
function yHash(s){ let h = 11; for(const c of String(s)) h = (h * 33 + c.codePointAt(0)) % 1000003; return h; }

// ---------------------------------------------------------------- 見た目（名前から 自動で きめる／おもな 人は 手で きめる）
const Y_SKIN = ["#f6d2b0", "#f9d9bd", "#f3cfae", "#eebf98", "#f0c9a2"];
const Y_HAIR = ["#1b1b27", "#2d2118", "#4a2a1a", "#7a4a2a", "#2a1a14", "#3b2a20", "#5a3a22", "#8a5a2b", "#1f2a44", "#7a1fd1", "#e07a1f", "#9c4a2a"];
const Y_TOP = ["#2f6fdc", "#e8506b", "#4caf7a", "#f0a8c0", "#6fb4e8", "#8a5ab6", "#e07a1f", "#6b7280", "#14b8a6", "#f2c94c", "#c0475a", "#3a4a6b"];
const Y_BOT = ["#374151", "#4b5563", "#2e6b4a", "#4b3a6b", "#35507a", "#1f2937", "#6a4a7a"];
const Y_STY = ["short", "long", "bob", "twin", "spike", "bun", "short", "spike", "long", "bob"];
const Y_ACC = ["none", "none", "none", "glasses", "none", "tie", "none", "scarf", "none", "none"];
// [名前, ヒント: 男(m)/女(f)] ─ 手で きめる 見た目
const Y_HAND = {
    "紘":"ks_hiro", "渚":"ks_nagisa", "康介":"ks_kosuke", "羽鳥彦":"ks_hatori", "鳩子":"ks_hatoko", "多鹿":"ks_taka", "鷲郎":"ks_washi", "大翔":"ks_mag", "優":"ks_girl2", "愛海":"ks_girl", "芽衣":"ks_girl",
    "布武矢":"ks_boy", "南海":"ks_girl2", "村川":"ks_kosuke", "玲奈":"ks_girl2", "晴喜":"ks_boy", "内踝":"ks_elder", "春鳥":"ks_kosuke", "波止美":"ks_elderF",
    "玲也":"reiya", "蒼太":"aota", "竜也":"tatsuya", "美咲":"misaki", "健斗":"kento", "さえこ":"saeko", "龍之介":"ryu", "はるや":"haruya", "ミナ":"mina", "耕太":"kota", "弘樹":"hiroki", "サンタさん":"santa",
    "アナウンくん":"robo", "手品師マジック":"magician", "もりの ガイド":"forester", "ダイバー":"diver", "さいごの 案内人":"lastgirl"
};
const Y_PEOPLE = {
    // おもな 登場人物（見た目の くわしい 指定）
    "桃寧":["#f9d9bd", "#2a1a14", "long", "#f4a6c0", "#6a4a7a", "glasses"], "真里香":["#f9d9bd", "#3b2a20", "twin", "#8ad0ff", "#35507a", "none"], "恵美子":["#f9d9bd", "#5a3a22", "bob", "#c084fc", "#4b3a6b", "none"],
    "蒼井":["#f6d2b0", "#1f2a44", "short", "#4caf7a", "#2e6b4a", "none"], "愛梨":["#f9d9bd", "#7a4a2a", "bun", "#f2c94c", "#4b5563", "none"], "玲実":["#f9d9bd", "#1b1b27", "long", "#d946ef", "#1f2937", "none"],
    "泉":["#f9d9bd", "#4a2a1a", "twin", "#a78bfa", "#4b3a6b", "none"], "真花":["#f9d9bd", "#2a1a14", "long", "#fb7185", "#6a4a7a", "none"], "紘殿":["#f3cfae", "#d8d8d8", "short", "#6a7a5a", "#3a4a3a", "scarf"],
    "晴夏":["#f9d9bd", "#8a5a2b", "bob", "#fdba74", "#374151", "none"], "凪":["#f9d9bd", "#1b1b27", "long", "#38bdf8", "#1f2937", "none"], "智也":["#eebf98", "#2d2118", "short", "#6b7280", "#374151", "none"],
    "雄太":["#f3cfae", "#222", "spike", "#ef4444", "#374151", "glasses"], "秋弥":["#f6d2b0", "#1d3557", "short", "#457b9d", "#1d3557", "glasses"], "咲来":["#f9d9bd", "#9c4a2a", "twin", "#f48fb1", "#6a4a7a", "none"],
    "沙弥香":["#f9d9bd", "#2a1a14", "long", "#fde68a", "#4b5563", "none"], "創輝":["#f6d2b0", "#7a1fd1", "spike", "#14b8a6", "#1f2937", "none"], "藍里":["#f9d9bd", "#4a2a1a", "bun", "#60a5fa", "#374151", "tie"],
    "由美":["#f9d9bd", "#1b1b27", "bob", "#fb923c", "#4b5563", "none"], "大樹":["#eebf98", "#222", "spike", "#5a6b2f", "#2a3320", "none"], "和佐":["#f3cfae", "#3a2a1a", "short", "#9ca3af", "#374151", "glasses"],
    "原伊太士":["#f0c9a2", "#555", "bald", "#a16207", "#3a2a1a", "none"], "女将":["#f9d9bd", "#2a1a14", "bun", "#c0475a", "#6a4a5a", "none"], "拓也":["#f6d2b0", "#1b1b27", "short", "#374151", "#1f2937", "none"],
    "将也":["#f3cfae", "#111", "spike", "#7f1d1d", "#1b1b27", "scarf"], "ひなた":["#f9d9bd", "#7a4a2a", "twin", "#fbcfe8", "#6a4a7a", "none"], "夏海":["#f9d9bd", "#1f2a44", "bob", "#a7f3d0", "#2e6b4a", "glasses"],
    "垣内":["#f6d2b0", "#2d2118", "cap", "#1d4ed8", "#1f2937", "none"], "遠野さん":["#f9d9bd", "#555", "bun", "#9ca3af", "#4b5563", "none"], "翔也":["#f6d2b0", "#1d3557", "short", "#2563eb", "#1f2937", "tie"]
};
function yLookKey(name){
    if(Y_HAND[name]) return Y_HAND[name];
    const key = "y_" + yHash(name);
    if(!RPG_LOOKS[key]){
        const p = Y_PEOPLE[name], h = yHash(name);
        RPG_LOOKS[key] = p ? {skin:p[0], hair:p[1], style:p[2], top:p[3], bot:p[4], acc:p[5]}
            : {skin:Y_SKIN[h % 5], hair:Y_HAIR[(h >> 3) % 12], style:Y_STY[(h >> 5) % 10], top:Y_TOP[(h >> 7) % 12], bot:Y_BOT[(h >> 9) % 7], acc:Y_ACC[(h >> 11) % 10]};
    }
    return key;
}
function yPortrait(name){ TQ_PORTRAIT_LOOK[name] = yLookKey(name); }

// ---------------------------------------------------------------- NPC 100人（NPC001〜100）
//   001〜015：本編から。 016〜100：追加コンテンツぶん（やりすぎヒーロー伝説の 仲間＝つよい／烏坂探偵事務所／本編の 人たち ほか）
//   [名前, 役わり(atk/mage/heal/tank/buff), 強さ（1=ふつう／1.5=めっちゃ つよい）]
const Y_ROSTER = [
    // やりすぎヒーロー伝説の おもな 仲間（めっちゃ強い）
    ["渚", "heal", 1.5], ["竜也", "mage", 1.5], ["桃寧", "buff", 1.5], ["真里香", "atk", 1.5], ["恵美子", "buff", 1.5], ["康介", "mage", 1.5], ["蒼井", "tank", 1.5], ["愛梨", "heal", 1.5], ["玲実", "atk", 1.5],
    ["泉", "heal", 1.5], ["真花", "buff", 1.5], ["紘殿", "mage", 1.5], ["晴夏", "atk", 1.5], ["凪", "mage", 1.5], ["智也", "tank", 1.5], ["雄太", "atk", 1.5], ["秋弥", "mage", 1.5], ["咲来", "atk", 1.5],
    ["沙弥香", "heal", 1.5], ["創輝", "tank", 1.5], ["藍里", "buff", 1.5], ["由美", "mage", 1.5], ["大樹", "tank", 1.5], ["和佐", "atk", 1.5], ["原伊太士", "tank", 1.5], ["女将", "heal", 1.5], ["拓也", "atk", 1.5],
    ["将也", "atk", 1.5], ["ひなた", "heal", 1.5], ["夏海", "mage", 1.5], ["垣内", "tank", 1.5], ["遠野さん", "mage", 1.5], ["翔也", "atk", 1.5],
    // 烏坂探偵事務所の 人たち
    ["羽鳥彦", "mage", 1.15], ["鳩子", "heal", 1.15], ["多鹿", "tank", 1.15], ["鷲郎", "atk", 1.15], ["大翔", "buff", 1.15], ["優", "heal", 1.15], ["愛海", "buff", 1.15], ["芽衣", "atk", 1.15], ["布武矢", "tank", 1.15],
    ["南海", "mage", 1.15], ["村川", "tank", 1.15], ["玲奈", "heal", 1.15], ["晴喜", "atk", 1.15], ["内踝", "buff", 1.15], ["春鳥", "mage", 1.15], ["波止美", "heal", 1.15],
    // 本編・追加エピソードの 人たち
    ["玲也", "atk", 1.1], ["蒼太", "tank", 1.1], ["美咲", "heal", 1.1], ["健斗", "atk", 1.1], ["さえこ", "buff", 1.1], ["龍之介", "tank", 1.1], ["はるや", "mage", 1.1], ["ミナ", "heal", 1.1], ["耕太", "atk", 1.1],
    ["弘樹", "tank", 1.1], ["サンタさん", "buff", 1.1], ["アナウンくん", "mage", 1.1], ["手品師マジック", "mage", 1.1], ["もりの ガイド", "heal", 1.1], ["ダイバー", "atk", 1.1], ["さいごの 案内人", "buff", 1.1],
    // 長編の ゆかいな 脇役たち
    ["ゆう", "atk", 1.2], ["さり", "heal", 1.2], ["あずま", "tank", 1.2], ["ゆうじ", "atk", 1.2], ["束", "buff", 1.2], ["大和", "tank", 1.2], ["梨音", "heal", 1.2], ["楓花", "mage", 1.2], ["しょう", "atk", 1.2],
    ["はやと", "tank", 1.2], ["校長先生", "buff", 1.2], ["教頭先生", "heal", 1.2], ["税関の 案内人", "buff", 1.2], ["郵便屋さん", "atk", 1.2], ["事務官", "mage", 1.2], ["国税局の 人", "tank", 1.2], ["店長さん", "atk", 1.2],
    ["運転手さん", "atk", 1.2], ["消防士さん", "tank", 1.2], ["おいしゃさん", "heal", 1.2]
];
const Y_NPC_ID = {};   // 名前 → "n016"…
(function(){
    const base = {atk:{hp:[28, 10.5], mp:[5, 2.2], atk:[9.5, 3.4], def:[5, 1.9], agi:[10, 0.8]}, mage:{hp:[22, 7.5], mp:[14, 5], atk:[9.5, 3.1], def:[3, 1.5], agi:[8, 0.55]},
        heal:{hp:[24, 8.8], mp:[12, 4.6], atk:[6.5, 2.4], def:[4, 1.7], agi:[8, 0.55]}, tank:{hp:[38, 13.5], mp:[4, 2], atk:[7.5, 2.7], def:[9, 2.7], agi:[5, 0.4]}, buff:{hp:[26, 9.2], mp:[11, 4.3], atk:[7, 2.5], def:[5, 1.8], agi:[10, 0.7]}};
    const sc = (a, k) => [Math.round(a[0] * k * 10) / 10, Math.round(a[1] * k * 100) / 100];
    Y_ROSTER.forEach((r, i) => {
        const id = "n" + String(16 + i).padStart(3, "0"), b = base[r[1]], k = r[2], lk = yLookKey(r[0]);
        Y_NPC_ID[r[0]] = id;
        RPG_CLASS[id] = {n:r[0], role:r[1], hp:sc(b.hp, k), mp:sc(b.mp, k), atk:sc(b.atk, k), def:sc(b.def, k), agi:sc(b.agi, 1 + (k - 1) * 0.5)};
        TQ_LOOK_OF[id] = lk; TQ_NPCS.push([id, r[0], lk]); yPortrait(r[0]);
    });
})();
const YA = (n) => Y_NPC_ID[n];

// ---------------------------------------------------------------- 仲間の でいり（話ごとに 2〜3人が くわわり、おわると はずれる）
const Y_ALLY = {};   // 地図 id → [名前…]
const Y_MAXP = 6;
(function(){
    const _ts = tqTempSync;
    tqTempSync = function(map, quiet){
        const base = _ts.apply(this, arguments), S = G.S; if(!S) return base;
        const msgs = [], yh = (S.yh = S.yh || {joined:[], bench:[]}), want = (Y_ALLY[map] || []).map(YA).filter(Boolean);
        if(want.length && !S.cx.noTemp){
            want.forEach((id) => {
                if(S.party.includes(id)) return;
                while(S.party.length >= Y_MAXP){
                    const bi = S.party.map((x, i) => [x, i]).reverse().find(([x]) => x !== "hero" && !want.includes(x));
                    if(!bi) break; const [bid] = bi; S.party = S.party.filter((x) => x !== bid); yh.bench.push(bid); msgs.push(tqName(bid) + "は ちょっと ひとやすみ。（この話の あいだ だけ）");
                }
                if(S.party.length < Y_MAXP && tqAddMember(id, true)){ yh.joined.push(id); msgs.push(tqName(id) + " が なかまに くわわった！（この話の あいだ だけ・めっちゃ 強い！）"); }
            });
        }
        if(!want.length && (yh.joined.length || yh.bench.length)){
            yh.joined.forEach((id) => { if(S.party.includes(id)){ S.party = S.party.filter((x) => x !== id); msgs.push(tqName(id) + "は ようじが あって かえっていった。（また ゆめで 会おう！）"); } });
            yh.joined = [];
            yh.bench.forEach((id) => { if(!S.party.includes(id) && S.party.length < Y_MAXP) tqAddMember(id, true); });
            yh.bench = [];
        }else if(want.length){
            // 前の 話の 仲間が のこって いたら はずす
            yh.joined = yh.joined.filter((id) => { if(want.includes(id)) return true; if(S.party.includes(id)){ S.party = S.party.filter((x) => x !== id); msgs.push(tqName(id) + "は ゆめの なかへ 帰っていった。"); } return false; });
        }
        tqClamp();
        return base.concat(quiet ? [] : msgs);
    };
})();

// ---------------------------------------------------------------- むずかしさは 『ハードより むずかしい』で 固定
const Y_FOES = {};   // 敵 id → 話の 番号
(function(){
    const _bs = battleStart;
    battleStart = function(ids, after){
        const hit = ids.some((x) => Y_FOES[x]);
        if(!hit) return _bs.apply(this, arguments);
        const keep = G.S.diff; G.S.diff = "basic";
        try{ _bs.apply(this, arguments); }finally{ G.S.diff = keep; }
        try{
            const c = G.S.cx;
            if(G.b) G.b.foes.forEach((f) => {
                if(f._yh) return; f._yh = 1;
                const m = c.yw ? 0.25 : c.ys ? 2 : 1;
                if(m !== 1){ f.hp = Math.max(1, Math.round(f.hp * m)); f.cur = f.hp; f.atk = Math.max(1, Math.round(f.atk * m)); }
            });
        }catch(e){ console.error("[yh-diff]", e); }
    };
})();
const Y_POW = [1.00, 1.04, 1.08, 1.12, 1.16, 1.20, 1.25, 1.30, 1.36, 1.42, 1.50, 1.60, 1.70, 1.80, 1.90, 2.02, 2.14, 2.26, 2.40, 2.60];   // 話ごとの つよさの 上乗せ（Hardより むずかしい）
const Y_LV = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99, 99, 99, 99, 99, 99, 99, 99, 99];
function yMob(n, idx, name, emo, tier){
    const id = "yh" + n + "_m" + idx, lv = Y_LV[n - 1], st = tqFoeStat(lv, tier, false), pw = Y_POW[n - 1] * 1.25;
    RPG_FOES[id] = rpgE(name, emo, Math.round(st.hp * pw), Math.round(st.atk * pw), Math.round(st.def * (0.9 + pw * 0.1)), Math.round(st.exp * 1.4), Math.round(st.g * 2.2),
        [[name.split(" ").pop() + "の たいあたり", 0, 1, 1.2], ["ぐるぐる ノイズ", 0, 0.8, 1.0], ["ふしぎな ひかり", 1, 0.5, 0.7]], {yh:1});
    Y_FOES[id] = n; return id;
}
function yBoss(n, id, name, emo, img, acts, say, extra){
    const lv = Y_LV[n - 1], st = tqBossStat(lv), pw = Y_POW[n - 1];
    st.hp = Math.round(st.hp * pw * 1.5); st.atk = Math.round(st.atk * pw * 1.2); st.def = Math.round(st.def * (0.9 + pw * 0.12)); st.exp = Math.round(st.exp * (1.6 + n * 0.12)); st.g = Math.round(st.g * 5);
    RPG_FOES[id] = Object.assign(rpgE(name, emo, 10, 5, 1, 1, 1, acts, {boss:true, spar:false, img}), st, {bossLv:lv, say50:say, yh:1}, extra || {});
    Y_FOES[id] = n; TQ_PORTRAIT_IMG[name] = img; return id;
}

// ---------------------------------------------------------------- 地図（テーマごとの 見た目）
//   歩ける マスだけ 人を おく。かざりは 上の 段（y=1〜2）と ふち だけ。
const Y_THEMES = {
    park:{fill:".", b:"T", ops:[["r", 1, 5, 16, 2, ","], ["r", 2, 1, 4, 1, "f"], ["r", 11, 1, 5, 1, "f"]], tint:"rgba(255,230,160,0.08)"},
    school:{fill:"=", b:"#", ops:[["r", 2, 1, 3, 2, "L"], ["r", 7, 1, 3, 2, "L"], ["r", 12, 1, 3, 2, "L"]], tint:"rgba(180,200,255,0.08)"},
    night:{fill:"n", b:"m", ops:[["r", 2, 1, 3, 2, "N"], ["r", 13, 1, 3, 2, "N"], ["r", 7, 1, 4, 1, "m"]], tint:"rgba(40,40,110,0.20)"},
    snow:{fill:"S", b:"t", ops:[["r", 1, 5, 16, 2, "s"], ["r", 3, 1, 3, 1, "t"], ["r", 12, 1, 3, 1, "t"]], tint:"rgba(190,215,255,0.12)"},
    rink:{fill:"i", b:"Q", ops:[["r", 2, 1, 14, 1, "Q"], ["r", 6, 4, 6, 1, "w"]], tint:"rgba(150,220,255,0.12)"},
    lab:{fill:"q", b:"z", ops:[["r", 2, 1, 3, 2, "P"], ["r", 8, 1, 3, 2, "P"], ["r", 13, 1, 3, 2, "z"]], tint:"rgba(120,200,255,0.10)"},
    stage:{fill:"c", b:"N", ops:[["r", 3, 1, 12, 1, "p"], ["r", 7, 5, 4, 2, "w"]], tint:"rgba(150,60,170,0.14)"},
    port:{fill:"M", b:"Q", ops:[["r", 2, 1, 3, 2, "Q"], ["r", 13, 1, 3, 2, "Q"], ["r", 6, 1, 6, 1, "b"]], tint:"rgba(150,190,255,0.10)"},
    lake:{fill:".", b:"T", ops:[["r", 12, 1, 4, 3, "~"], ["r", 1, 5, 16, 2, ","]], tint:"rgba(120,200,255,0.10)"},
    town:{fill:",", b:"#", ops:[["r", 2, 1, 4, 2, "H"], ["r", 2, 3, 4, 1, "h"], ["r", 12, 1, 4, 2, "H"], ["r", 12, 3, 4, 1, "h"]], tint:"rgba(255,180,120,0.10)"},
    shop:{fill:"=", b:"#", ops:[["r", 2, 1, 3, 2, "K"], ["r", 8, 1, 3, 2, "K"], ["r", 13, 1, 3, 2, "K"]], tint:"rgba(255,210,150,0.10)"},
    dream:{fill:"n", b:"m", ops:[["r", 3, 1, 12, 1, "m"], ["r", 7, 5, 4, 2, "c"]], tint:"rgba(120,60,180,0.22)"}
};
const Y_SLOT = [[3, 5], [7, 5], [11, 5], [15, 5], [3, 8], [7, 8], [11, 8], [15, 8]];   // 人を おく 場所（ぜんぶ 歩ける）
const Y_GUIDE = [5, 10];
function yMap(theme, objs, name){
    const T = Y_THEMES[theme] || Y_THEMES.park, R = [["b", T.b]].concat(T.ops, [["p", 9, 11, "G"]]);
    return {name, tint:T.tint, start:[9, 10], enc:null, rows:rpgMk(18, 12, T.fill, R), tev:{G:["gate_back", 1], b:["seat"]}, objs};
}
const yNpc = (id, x, y, name, ev) => NPC(id, x, y, yLookKey(name), name, ev);

// ---------------------------------------------------------------- 1話ぶんを つくる
const Y_EPS = [];
const Y_LET = "ゆうきとちえとやさしさでじんせいはかわる";   // 20話 ぶんの 手紙の もじ（さいごに 1つの ことばに なる）
const yLetter = (n) => (n >= 20 ? [] : ["（空から 1まいの 手紙が ひらひらと おちて きた…）", "手紙｜『挑戦状 No." + n + " ── 人生を 大逆転 させたければ、さきへ 進め。 きょうの もじは「" + Y_LET[n - 1] + "」。』", "紘｜…だれが 書いたんだろう。つぎの 話へ いこう！"]);
function yq(id, o){
    // o = {chk, set, intro:[…], done:[…], steps:[{q, a:[正解, まちがい…], hint:[…], ok:[…]}…]}
    const n = o.steps.length, sid = (i) => (i ? id + "_s" + (i + 1) : id + "_q");
    o.steps.forEach((s, i) => {
        const last = i === n - 1, okOps = YKL(s.ok).concat(last ? (o.fin ? YKL(o.fin) : []).concat([["set", o.set]]) : [["run", sid(i + 1)]]);
        const h = yHash(id + i), opts = s.a.map((t, k) => [t, k === 0 ? okOps : YKL(s.hint).concat([["run", sid(i)]])]), rot = h % opts.length;
        const shuf = opts.slice(rot).concat(opts.slice(0, rot));
        RPG_EV[sid(i)] = [rpgN(s.q), ["choice", shuf]];
    });
    RPG_EV[id] = [["if", o.chk, YKL(o.done || ["（この なぞは もう とけたよ！）"]), YKL(o.intro).concat([["run", sid(0)]])]];
}
function YE(n, c){
    const m = "yh" + n, L = "abcd", lv = Y_LV[n - 1], flags = c.qs.map((_q, i) => m + L[i]);
    Y_EPS.push({n, title:c.title, sub:c.sub, lv, learn:c.learn});
    // --- なぞ
    c.qs.forEach((q, i) => yq(m + "_" + L[i], {chk:flags[i], set:flags[i], intro:q.intro, done:q.done, fin:q.fin, steps:q.steps}));
    // --- 司令塔（案内役）
    const labels = c.qs.map((q) => q.label || q.steps[0].q.slice(0, 12));
    const list = flags.map((f, i) => ["if", f, [], [rpgN("・なぞ" + (i + 1) + "『" + labels[i] + "』は まだ とけて いないよ")]]);
    RPG_EV[m + "_hq"] = [["if", "e_" + m, YKL(c.after || ["紘｜この 話は もう クリアしたね。ゲートから つぎの 話へ すすもう！"]),
        [["if", flags.join("&"), [["run", m + "_boss"]], YKL(c.guide).concat(list)]]]];
    // --- ざつだん
    (c.talks || []).forEach((t, i) => { RPG_EV[m + "_t" + (i + 1)] = YKL(t[1]); });
    // --- 敵
    const mobIds = (c.mobs || []).map((mb, i) => yMob(n, i + 1, mb[1], mb[0], [1, 1.35, 1.8][i] || 1));
    // --- わな（おまけの たたかい）
    if(c.trap){
        const tid = m + "_trap";
        RPG_EV[tid] = [["if", m + "tr", YKL(["（わなは もう こわしたよ。）"]), YKL(c.trap.pre).concat([["battle", [mobIds[2] || mobIds[0]], YKL(c.trap.post).concat([["gold", 300 + n * 40], ["item", "special", 2], ["set", m + "tr"]])]])]];
    }
    // --- ボス
    const b = c.boss, bid = m + "_boss";
    yBoss(n, bid, b.name, b.emo, b.img, b.acts, b.say);
    const reward = [["gold", 2000 + n * 700], ["item", "special", 6], ["item", "omamori", 3], rpgN((2000 + n * 700) + "G と スペシャルおにぎり 6こ・ふっかつのおまもり 3こ を てにいれた！"), rpgN("📖 今回の まなび：" + c.learn)];
    RPG_EV[bid] = YKL(c.pre).concat([["battle", [bid], YKL(c.post).concat(reward, c.end ? YKL(c.end) : [], YKL(yLetter(n)), [["set", "e_" + m], ["run", n === 20 ? "yh_final" : "lab_ret_go"]])]]);
    RPG_EV[m + "_enter"] = [["if", "!" + m + "_in", [["set", m + "_in"], ["set", "yh_started"]].concat(YKL(c.intro)), []]];
    // --- 地図
    const objs = [yNpc(m + "_hq", Y_GUIDE[0], Y_GUIDE[1], c.guideName || "紘", m + "_hq")];
    c.qs.forEach((q, i) => objs.push(yNpc(m + "_" + L[i], Y_SLOT[i][0], Y_SLOT[i][1], q.who, m + "_" + L[i])));
    (c.talks || []).forEach((t, i) => objs.push(yNpc(m + "_t" + (i + 1), Y_SLOT[c.qs.length + i][0], Y_SLOT[c.qs.length + i][1], t[0], m + "_t" + (i + 1))));
    if(c.trap) objs.push(NPC(m + "_trap", Y_SLOT[7][0], Y_SLOT[7][1], "y_trap", c.trap.name, m + "_trap"));
    RPG_MAPS[m] = yMap(c.theme, objs, "やりすぎヒーロー伝説 第" + n + "話　" + c.title);
    if(mobIds.length) RPG_MAPS[m].enc = {rate:0.05, f:[[[mobIds[0]], 4], [[mobIds[1]], 3], [[mobIds[0], mobIds[1]], 2], [[mobIds[2] || mobIds[1]], 1]]};
    Y_ALLY[m] = c.allies;
    RPG_ENTER[m] = m + "_enter";
    if(c.bgm) TQ_BGM_MAP[m] = c.bgm;
    RPG_LOOKS.y_trap = RPG_LOOKS.y_trap || {skin:"#e9ddf2", hair:"#7c3aed", style:"spike", top:"#4c1d95", bot:"#1b1b27", acc:"xr"};
}
