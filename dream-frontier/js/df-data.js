// ===== ドリーム・フロンティアの データ（エンジンに よらない）=====
export const ZONES = {
    center: {fog: [.75, .88, 1], near: 46, far: 125, amb: [.56, .6, .72], light: [.4, .8, .45]},
    grove: {fog: [.42, .36, .7], near: 24, far: 90, amb: [.42, .44, .66], light: [.3, .8, .3]},
    sky: {fog: [.62, .84, 1], near: 60, far: 150, amb: [.6, .64, .76], light: [.5, .8, .3]},
    manor: {fog: [.14, .1, .22], near: 7, far: 42, amb: [.34, .3, .42], light: [.2, .7, .2]},
    lagoon: {fog: [.5, .85, .9], near: 36, far: 110, amb: [.58, .64, .74], light: [.4, .8, .5]},
    dark: {fog: [.07, .04, .16], near: 5, far: 34, amb: [.5, .44, .62], light: [.2, .7, .2]},
    night: {fog: [.04, .06, .2], near: 60, far: 200, amb: [.26, .3, .5], light: [.2, .8, .3]},
    space: {fog: [.01, .01, .05], near: 160, far: 420, amb: [.5, .5, .65], light: [.5, .6, .4]},
    ghost: {fog: [.05, .04, .1], near: 3, far: 18, amb: [.3, .26, .4], light: [.2, .6, .2]}
};
export const AREA_NAMES = {center: "セントラル・ガーデン", grove: "ファンタジー・グローブ", sky: "スカイ・コースト", manor: "ミステリー・マナー", lagoon: "ブルー・ラグーン"};
export const zoneAt = (x, z) => (x > 52 && Math.abs(z) < 40) ? "manor" : (x > 52 && z >= 40 && z < 56) ? "manor" : x < -30 ? "grove" : z < -30 ? "sky" : z > 56 ? "lagoon" : "center";
export const BGM = {center: "town", grove: "cave", sky: "field", manor: "demoncastle", lagoon: "sea"};

export const SKY_PTS = [[0, -50, 1.2], [14, -52, 1.2], [28, -60, 9], [34, -76, 18], [26, -92, 6], [8, -96, 2.5], [-10, -90, 10], [-26, -80, 15], [-30, -66, 5], [-18, -54, 1.8], [-6, -50, 1.2]];
export const MINE_PTS = [[-40, 22, 1.2], [-52, 28, 1.2], [-64, 36, 8], [-78, 32, 13], [-90, 22, 5], [-88, 10, 3], [-76, 14, 6], [-62, 18, 2.5], [-48, 16, 1.4]];
export const BOAT_PTS = (() => { const a = []; for(let i = 0; i < 12; i++){ const t = i / 12 * Math.PI * 2 + Math.PI / 2; a.push([Math.cos(t) * 16, 79 + Math.sin(t) * 9, .15]); } return a; })();
export const SPLASH_PTS = [[12, 60, .6], [28, 64, .6], [31, 76, 4], [30, 88, 10], [22, 96, 14], [6, 96, 14], [-2, 90, 12], [-6, 85, 2], [-8, 80, .5], [-20, 74, .5], [-24, 64, .6], [-12, 60, .6]];
export const GHOST_PTS = [[79, 17.5, .9], [79, 23, .9], [72, 27, .9], [70, 33, .9], [78, 34, .9], [86, 32, .9], [88, 26, .9], [84, 22, .9], [84, 17.5, .9]];
export const SAFARI_PTS = [[40, 60, .4], [52, 66, .4], [66, 64, .4], [80, 70, .4], [88, 80, .4], [80, 90, .4], [64, 92, .4], [50, 86, .4], [44, 74, .4]];

export const FAIRY_PTS = [[-55, -8.4, .6], [-55, -12, .6], [-51, -15, .6], [-47, -18.2, .6], [-51, -21.2, .6], [-58, -21.2, .6], [-62, -17.5, .6], [-59, -13.5, .6], [-56, -10.4, .6]];
export const SHIP_PTS = [[44, -18, 2], [48, -26, 12], [62, -34, 22], [72, -14, 28], [64, 12, 30], [60, 40, 28], [40, 54, 26], [14, 52, 24], [0, 34, 24], [0, 4, 26], [-14, -10, 24], [-10, 6, 22], [14, 14, 20], [30, 14, 13], [40, 2, 7], [44, -10, 4], [44, -18, 2]];

// kind: track（レールの上を すすむ）／orbit（ぐるぐる）／wheel（かんらんしゃ）／drop（タワー）／shoot（ミニゲーム）／show（パレード）
export const ATTRACTIONS = [
    {id: "carousel", n: "ドリーム・カルーセル", area: "center", kind: "orbit", mode: "horse", c: [-21, -21], r: 4.2, w: .9, h0: .9, bob: .35, dur: 34, board: {x: -21, z: -14.6, r: 3.4}, coin: 10, desc: "ゆめの どうぶつに のって ゆったり ひとまわり。", ref: "メリーゴーランド系"},
    {id: "wheel", n: "ムーンホイール", area: "center", kind: "wheel", c: [21, -21], R: 11.5, cy: 13.5, dur: 50, board: {x: 16.6, z: -16.6, r: 3.6}, coin: 10, desc: "ゆっくり まわる おおきな かんらんしゃ。パークが ぜんぶ みわたせる。", ref: "観覧車系"},
    {id: "parade", n: "ドリーム・パレード", area: "center", kind: "show", dur: 70, period: 150, first: 35, coin: 10, desc: "ひろばを ぐるっと まわる 光の パレード。ちかくで みよう。", ref: "パレード"},
    {id: "balloon", n: "ふわふわバルーン", area: "grove", kind: "orbit", mode: "balloon", c: [-50, -32], r: 7, w: .28, h0: 2, h1: 14, dur: 50, board: {x: -50, z: -26.2, r: 3.4}, coin: 10, desc: "↑↓で たかさを かえられる ふうせんの のりもの。", ref: "空飛ぶゾウ系"},
    {id: "mine", n: "クリスタル・マインコースター", area: "grove", kind: "track", pts: MINE_PTS, closed: true, laps: 1, speed: {type: "energy", vmin: 6, g: 10, h0: 13.5, lift: 30}, eye: 1.0, style: "rails", color: "#7a5a3a", board: {x: -38, z: 18.6, r: 3.4}, coin: 10, desc: "ひかる水晶の ほら穴を ぬける トロッコ型 コースター。", ref: "鉱山トロッコ系"},
    {id: "sky", n: "スカイ・ライナー", area: "sky", kind: "track", pts: SKY_PTS, closed: true, laps: 2, speed: {type: "energy", vmin: 7, g: 12, h0: 18.5, lift: 55}, eye: 1.1, style: "rails", color: "#ff6a4a", manual: true, board: {x: 0, z: -42.2, r: 5.5}, coin: 20, desc: "いちばん たかい ところから かけおりる ジェットコースター。↑かそく ↓ブレーキ。", ref: "ジェットコースター系"},
    {id: "drop", n: "スカイ・ドロップ", area: "sky", kind: "drop", c: [30, -42], H: 48, y0: 2, board: {x: 30, z: -36.2, r: 3.4}, coin: 15, desc: "てっぺんまで ぐーんと のぼって、いっきに おちる タワー。", ref: "フリーフォール系"},
    {id: "swing", n: "ウィンド・スイング", area: "sky", kind: "orbit", mode: "chair", c: [-32, -44], r: 4, r1: 9, w: 1.0, w1: 1.6, h0: 6, h1: 12, dur: 36, board: {x: -32, z: -38.4, r: 3.4}, coin: 10, desc: "ぐるぐる まわりながら ひろがる 空中ブランコ。", ref: "スペースシップ・チェア系"},
    {id: "ghost", n: "ゴースト・ギャラリー", area: "manor", kind: "track", pts: GHOST_PTS, closed: false, laps: 1, speed: {type: "const", v: 2.3}, eye: 1.35, style: "none", vehicle: "cart", env: "ghost", board: {x: 79, z: 15.4, r: 3.2}, coin: 15, desc: "くらい おやしきを ゆっくり すすむ おばけ屋敷の のりもの。", ref: "ホーンテッド・ハウス系",
        scares: [{s: .16, ghost: [72, 27], text: "…ヒュウウ…"}, {s: .32, ghost: [70, 31], text: "うしろに だれか いる…？"}, {s: .5, ghost: [80, 33], text: "ガタガタ！"}, {s: .68, ghost: [88, 30], text: "ようこそ… わたしの おやしきへ…"}, {s: .86, ghost: [85, 23], text: "また おいで… ヒヒヒ"}]},
    {id: "puzzle", n: "ミステリー・マナーの きんこ", area: "manor", kind: "quest", coin: 0, desc: "やかたの 3つの てがかりで きんこを あける。", ref: "なぞとき"},
    {id: "boat", n: "ランタン・ボートクルーズ", area: "lagoon", kind: "track", pts: BOAT_PTS, closed: true, laps: 1, speed: {type: "const", v: 2.9}, eye: .95, style: "none", vehicle: "boat", board: {x: 0, z: 60.2, r: 3.5}, coin: 10, desc: "ランタンの うかぶ みずうみを ゆったり ひとまわり。", ref: "ボート・クルーズ系",
        events: [{s: .1, text: "みずうみに ランタンが ゆらゆら うかんでいる…"}, {s: .4, text: "ほとりの はしらに ランタンが かかっているよ。"}, {s: .7, text: "たきの おとが きこえてきた。"}]},
    {id: "splash", n: "ログ・スプラッシュ", area: "lagoon", kind: "track", pts: SPLASH_PTS, closed: true, laps: 1, speed: {type: "energy", vmin: 4.5, g: 14, h0: 14.5, lift: 70}, eye: 1.1, style: "trough", vehicle: "log", board: {x: 12, z: 57.6, r: 3.4}, coin: 15, desc: "まるたの ボートで すいろを すすみ、さいごは ざっぱーん！と おちる。", ref: "ログフルーム系",
        events: [{s: .55, text: "ガコン…ガコン…（のぼってる…）", ev: "climb"}, {s: .72, text: "うわあああ！！", ev: "drop"}, {s: .8, text: "ざっぱーん！", ev: "splash"}]},
    {id: "shoot", n: "スターライト・シューティング", area: "lagoon", kind: "shoot", board: {x: 18, z: 57.2, r: 3.2}, dur: 45, coin: 0, desc: "みずうみに うかぶ まとを ねらう シューティング。（Eで はっしゃ）", ref: "シューティング系"},
    {id: "safari", n: "ふしぎサファリ", area: "lagoon", kind: "track", pts: SAFARI_PTS, closed: true, laps: 1, speed: {type: "const", v: 3.4}, eye: 1.55, style: "none", vehicle: "jeep", board: {x: 40, z: 57.4, r: 3.4}, coin: 10, desc: "ジープで めぐる ふしぎな どうぶつの 国。", ref: "ジャングル・サファリ系",
        events: [{s: .12, text: "ながーい くびの ふしぎな どうぶつが いるよ！"}, {s: .4, text: "おおきな ぞうさんが みずあびを している。"}, {s: .65, text: "モコモコの どうぶつが ちかづいてきた！"}, {s: .85, text: "ライオンの こどもだ。あくびを している。"}]},
    {id: "fairy", n: "ひかりの もりの おとぎライド", area: "grove", kind: "track", pts: FAIRY_PTS, closed: false, laps: 1, speed: {type: "const", v: 1.9}, eye: 1.0, style: "none", vehicle: "cart", env: "dark", board: {x: -55, z: -2.4, r: 3.2}, coin: 10, desc: "ほしのこたちが うたう、ひかりの もりを めぐる おとぎ話の ダークライド。", ref: "おとぎ話のダークライド系",
        events: [{s: .1, text: "ようこそ… ひかりの もりへ。ランプの ようせいが あんないするよ。"}, {s: .28, text: "5ひきの ほしのこが おうたを うたっている♪"}, {s: .48, text: "…！ うしろから かげの まじょが ちかづいてきた！"}, {s: .66, text: "ひかりの ランプが まじょを てらすと…"}, {s: .8, text: "ガラスの おしろが あらわれた！"}, {s: .93, text: "めでたし めでたし。ゆめの おとぎ話は つづく…"}]},
    {id: "ship", n: "ムーンシップ・フライト", area: "center", kind: "track", pts: SHIP_PTS, closed: false, laps: 1, speed: {type: "const", v: 7.2}, eye: 1.2, style: "none", vehicle: "ship", env: "night", board: {x: 44, z: -14, r: 3.4}, coin: 15, desc: "ゆめの 空とぶ ふねで、ほしぞらの パークを 一周。（よるの そらの たび）", ref: "空飛ぶ海賊船系",
        events: [{s: .08, text: "ふねが ふわり…  パークが どんどん ちいさくなる！"}, {s: .28, text: "あれは ムーンホイール！ あかりが きれいだよ。"}, {s: .5, text: "まんなかの ふんすいが ほしみたいに ひかっている。"}, {s: .7, text: "みずうみの ランタンが ゆらゆら ゆれているね。"}, {s: .9, text: "そろそろ ちゃくりくの じかんだよ。"}]},
    {id: "spinner", n: "ポップタウン・スピナー", area: "sky", kind: "orbit", mode: "cup", c: [-52, -62], r: 5.6, w: .5, h0: .9, dur: 40, board: {x: -52, z: -53.2, r: 3.2}, coin: 10, desc: "カップが ぐるぐる まわる マンガの まち。A / D で じぶんの カップを もっと まわそう！", ref: "コーヒーカップ系の 回転ライド"},
    {id: "cosmo", n: "コスモ・クルーズ", area: "sky", kind: "sim", env: "space", dur: 56, board: {x: 62, z: -50, r: 3.2}, coin: 15, desc: "うちゅうせんの コックピットで ワープしながら わくせいの たびへ。", ref: "宇宙旅行シミュレーター系",
        events: [{s: .02, text: "コスモ・クルーズ、はっしん！ シートベルトを しめてね。"}, {s: .15, text: "ひだりに あおい わくせい「ルナリア」が みえる！"}, {s: .34, text: "ちゅうい！ がれきの おびだ！ おおきく ゆれるよ！"}, {s: .55, text: "ゲートを くぐるよ…！"}, {s: .7, text: "ワープ・かいし！"}, {s: .88, text: "とうちゃく。ステーションが みえてきた！"}]}
];
export const STAMPS = ATTRACTIONS.map((a) => a.id);
export const byId = (id) => ATTRACTIONS.find((a) => a.id === id);

export const QUARTET = [
    {id: "rihito", name: "理人（りひと）", look: {shirt: "#3b6fd8", hair: "#2a2a30", style: "short", accent: "#ffd24a"}, at: [-13, 17], yaw: 1.2,
        lines: ["ワンコロランド、ネコネランド、ウサウサランド… ぼくたち 4人で ぜんぶ 全制覇してきたんだ。", "ここ ドリーム・フロンティアは 18この スタンプが そろえば 全制覇だって。 のこりは メニューの『スタンプちょう』で かくにんできるよ。"]},
    {id: "satoshi", name: "智司（さとし）", look: {shirt: "#e0793a", hair: "#3a2a20", style: "spiky", accent: "#ffffff"}, at: [-11.4, 18.4], yaw: 2.2,
        lines: ["高いところは にがてなんだけど… スカイ・ドロップは のらないと 全制覇に ならないんだよなあ。", "ウサウサランドの 脱出ゲームみたいに、ここの きんこも ばんごうを あわせるらしいよ。"]},
    {id: "akane", name: "赤音（あかね）", look: {shirt: "#d94a6a", hair: "#5a2a1a", style: "long", accent: "#ffe9a0"}, at: [-14.6, 18.6], yaw: .6,
        lines: ["完璧な スケジュール、できてるよ！ パレードは 150びょうごとに 1かい。のがさないでね。", "ファストパスは いらない。ここは まちじかんが ゼロだから！"]},
    {id: "maika", name: "舞華（まいか）", look: {shirt: "#6a4ad8", hair: "#caa070", style: "bun", accent: "#ffb0c8"}, at: [-12.4, 20], yaw: 3.0,
        lines: ["わたし ぜっきょうけいは にがてだけど、ボートと カルーセルは だいすき！", "シューティングは ぜんぶ あてると いいことが あるって うわさだよ。"]}
];
