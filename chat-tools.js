"use strict";
// ===== 第2弾ツールの入口（「その他」タブ）と、シート内ボタンの共通ルーター =====
// 各ツールは別ファイル。ここは「入口のカード」と「data-t="名前:動作"」の振り分けだけを担当します。

const TOOL_LIST = [
    ["story", "📖", "ストーリー（24時間）", "フォロー中の人と自分の、24時間で消える投稿", "openStory"],
    ["autoreply", "🤖", "自動応答", "言葉や曜日・時間帯に応じた固定メッセージを返信", "openAutoReply"],
    ["album", "🖼️", "アルバム", "チャットの写真を一覧で見る（チャットを選べます）", "openAlbum"],
    ["imgedit", "🎨", "画像編集", "回転・切り抜き・明るさ・文字入れをして送信", "openImgEdit"],
    ["aistudio", "✨", "AI画像・動画生成", "無料枠で生成して端末にダウンロード（回数・混雑の制限あり）", "openAiStudio"],
    ["location", "📍", "位置情報を送る", "いまいる場所を、いまのチャットに送信", "openLocationShare"],
    ["work", "🏢", "ワークスペース（仕事）", "出勤・経費・会議室・プロジェクト・文書・共同メモ・レポート", "openWork"],
    ["sched", "📆", "予定の空き時間を提案", "予定のすき間から会議に使える時間を計算", "openSchedSuggest"],
    ["health", "❤️", "ヘルス記録", "体重・睡眠・歩数・気分を記録（自分だけ）", "openHealth"],
    ["geo", "📍", "場所で送るメッセージ", "目的地で「到着しました」を押すと送信", "openGeoMessages"],
    ["mood", "🎭", "気分・時間帯でテーマ", "朝昼夕夜や気分の言葉で、画面の色が変わる", "openMood"],
    ["cards", "🂡", "カードゲーム（手札かくし）", "ババ抜き・大富豪・インディアンポーカー・ダウト", "openCardGames"],
    ["bj", "🃏", "ブラックジャック", "ディーラー(CPU)と1人で対戦。コインは端末だけ", "openBj"],
    ["memo", "📝", "自分専用メモ（Keep）", "自分だけが見られるメモ・チェックリスト", "openMemoView"],
    ["co2", "🌱", "CO2トラッカー", "移動・食事・電気のCO2をかんたん記録", "openCo2"],
    ["avatar", "🧑‍🎤", "アバター", "自分のキャラを作って画像として送る", "openAvatar"],
    ["profile3d", "🧊", "3Dプロフィールカード", "Three.jsのキャラクターを自分用に設定します", "openProfile3D"],
    ["myai", "🧠", "AREbot", "教えると覚える・自分の返し方を学ぶ（APIキー不要・無料）", "openMyAi"],
    ["ai", "🤖", "会話の分析", "要約・キーワード・感情・分類（端末内だけで処理）", "openAi"],
    ["archive", "🗂️", "ストーリーのアーカイブ", "24時間をすぎたストーリーの保存先", "openStoryArchive"],
    ["share", "🔗", "プロフィール共有・QR", "自分のQRコードとリンクを表示", "openShare"],
    ["games", "🎮", "ゲーム", "6種類のミニゲーム・ランキング・実績", "openGames"],
    ["planner", "📅", "タスク・カレンダー", "自分だけが見られる予定表", "openPlanner"],
    ["push", "🔔", "通知・ホーム画面", "閉じていても届く通知・チャットごとのミュート・ホーム画面に追加", "openPushSettings"],
    ["security", "🛡️", "管理者のTOTP認証", "管理者用の認証アプリを登録・確認します", "openAdminSecurity"],
    ["storage", "🗄️", "Storage使用量と整理", "容量と参照されていない画像を確認します", "openStorageAdmin"],
    ["stars", "⭐", "スター付きメッセージ", "あとで見返したいメッセージの一覧", "openStars"],
    ["folders", "📁", "チャットの整理", "フォルダ分け・固定・並び替え", "openFolders"],
    ["phrases", "💬", "定型文", "よく使う文を登録して、ワンタップで入力", "openPhrases"],
    ["comfort", "🔠", "見やすさ・読み上げ", "文字サイズ・高コントラスト・読み上げの速さ", "openComfort"],
    ["draw", "✏️", "お絵かき", "手書きの絵を画像にして、チャットに送る", "openDraw"],
    ["mystamp", "🖼️", "自作スタンプ", "自分の画像から作って、ワンタップで送る", "openMyStamps"],
    ["split", "💴", "割り勘計算", "合計と人数から計算して、チャットに貼る", "openSplit"],
    ["board", "📅", "日程調整ボード", "候補日に ○△× で投票して決める", "openBoardCreate"],
    ["live", "📍", "ライブ位置共有", "一定時間だけ、お互いの位置を地図で見る", "openLive"],
    ["ocr", "📝", "文字を読み取る", "画像の中の文字をテキストにする", "openOcr"],
    ["contact", "📷", "QRで友だち追加（スマホ限定）", "スマホ限定：カメラでQRを読み取ってチャットを始める（パソコンのカメラは読み取りにくいです）", "openQrScan"],
    ["diary", "📔", "日記", "気分つきで1日1つ。検索もできる", "openDiary"],
    ["habit", "✅", "習慣トラッカー", "毎日の習慣をチェック。連続日数がわかる", "openHabit"],
    ["budget", "💴", "家計簿", "収入と支出を記録して月ごとに集計", "openBudget"],
    ["timer", "⏱️", "タイマー", "カウントダウン・ポモドーロ", "openTimer"],
    ["calc", "🧮", "電卓・換算", "計算・単位換算・為替の目安", "openCalc"],
    ["zip", "🗜️", "ZIP 圧縮・解凍", "ファイルをZIPにまとめる／ZIPをほどく（端末の中だけで処理）", "openZip"],
    ["imgc", "🖼️", "画像まとめて変換", "小さく・サイズ変更・形式変換をまとめて", "openImgc"],
    ["img2pdf", "🧾", "画像→PDF", "写真やスキャンを1つのPDFにまとめる", "openImg2pdf"],
    ["pdftool", "📕", "PDFを操作", "結合・ページ抜き出し・分割・回転", "openPdfTool"],
    ["exifclean", "🛡️", "写真の位置情報を消す", "送る前に位置情報・撮影情報を取りのぞく", "openExifClean"],
    ["filedrop", "📲", "ファイル転送（スマホ↔PC）", "スマホで入れて、パソコンで受け取る（本人だけ・7日で消える）", "openFileDrop"],
    ["hashtool", "🔐", "ファイル照合（ハッシュ）", "ダウンロードしたファイルが本物か確かめる", "openHashTool"],
    ["renametool", "🏷️", "ファイル名まとめて変更", "連番・置きかえ・大文字小文字（ZIPで保存）", "openRenameTool"],
    ["textfix", "🔤", "文字化けなおし・改行変換", "Shift_JIS などを UTF-8 になおす", "openTextFix"],
    ["csvtool", "📊", "CSV変換・表示", "表で見る／JSON・TSV・Excel用に変換", "openCsvTool"],
    ["vframe", "🎞️", "動画から静止画", "動画の好きな場面を画像で保存", "openVideoFrame"],
    ["splittool", "📦", "大きいファイルの分割・結合", "送れない大きさのファイルを分けて送る", "openSplitTool"],
    ["shop", "🛒", "買い物リスト", "このチャットのみんなで共有", "openShop"],
    ["fun", "🎲", "じゃんけん・ルーレット・あみだ", "決めごとをみんなで", "openFun"],
    ["rpg", "🗡️", "ARE 〜そういうときは、AREだ！〜", "ゲーム一覧をひらく（RPG・カード・推理・ミニゲームなど）。2D・王道ふうRPGもここから（お試し期間のあとは ぼうけんパックで解放）", "openRpg"],
    ["game2", "📖", "ARE QUEST 2・3", "ストーリー重視の3D・RPG。AREを入手せよ／月影のあしあと（ARE QUEST 3）まで、ここから遊べます（お試し期間のあとは ぼうけんパックで解放）", "openGame2"],
    ["game4", "🃏", "ARE CARD 〜そういうときは、AREだ！〜", "3Dの盤面で遊ぶカードバトル（土台版）。デッキを組んでCPUと対戦（お試し期間のあとは ぼうけんパックで解放）", "openGame4"],
    ["game5", "🔍", "GAME5 推理ゲーム（表・裏）", "表＝会話と証言から推理する全10章／裏＝表に○×をつける推理ゲーム2。ブラウザですぐ あそべます（Windows版もあり）", "openGame5"],
    ["game7", "🎰", "OFFLINE PARADISE", "電波がなくても あそべる、ルーレットで選ばれる5つのミニゲーム（コイン・図鑑つき）", "openGame7"],
    ["daifugo", "👑", "大富豪（本格ルール）", "3〜2の技・縛り・革命・階級・カード交換。ルールは自由に変えられます", "openDaifugo"],
    ["dream", "🎡", "ドリームフロンティア", "3Dのテーマパーク。ライドを回ってスタンプを集めよう（お試し期間のあとは ぼうけんパックで解放）", "openDream"],
    ["study124", "📚", "学習サイト（LearnLab124）", "プログラミング学習サイト（用語集・クイズ・物語）を別のタブで開きます。ARE とは別のサイトです", "openStudy124"],
    ["lock", "🔒", "ロック・自動ログアウト", "PIN・放置したら画面ぼかし/ログアウト", "openLock"],
    ["announce", "📢", "お知らせ", "管理者からのお知らせ", "openAnnouncements"],
    ["prefs", "⚙️", "表示設定・言語", "気分テーマ・省データモード・English", "openPrefs"]
];

const toolHandlers = {};

function registerTool(ns, fn){ toolHandlers[ns] = fn; }

function toolHead(title, note){
    return '<h3 style="margin:0">' + title + '</h3>' + (note ? '<div class="meta">' + note + '</div>' : "");
}

function toolClose(extra){
    return '<div class="row">' + (extra || "") + '<button type="button" class="button-secondary" data-pm="close">閉じる</button></div>';
}

function initTools(){
    const pane = document.querySelector(".pane-more");
    if(!pane) throw new Error("「その他」タブが見つかりません。");
    pane.insertAdjacentHTML("beforeend", '<div class="section-heading" style="margin-top:10px"><h2>🧩 ツール</h2></div>' +
        TOOL_LIST.map((t) => '<button type="button" class="admin-card more-item" data-tool="' + t[0] + '" data-feature="' + t[0] + '">' + t[1] + ' ' + t[2] + '<small class="meta">' + t[3] + '</small></button>').join(""));
    pane.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tool]");
        if(!button) return;
        const tool = TOOL_LIST.find((t) => t[0] === button.dataset.tool);
        const opener = tool && window[tool[4]];
        if(typeof opener !== "function"){ showToast("この機能は未実装です。"); return; }
        runTool(() => opener());
    });
    ["click", "change", "input", "compositionend"].forEach((type) => el.profileModal.addEventListener(type, dispatchTool));
}

function runTool(fn){
    try{
        const result = fn();
        if(result && typeof result.catch === "function") result.catch((error) => { console.error("[ARE tool]", error); showToast(featError(error)); });
    }catch(error){ console.error("[ARE tool]", error); showToast(featError(error)); }
}

function dispatchTool(event){
    const node = event.target.closest("[data-t]");
    if(!node) return;
    const tag = node.tagName, type = node.type;
    if(event.type === "click"){ if(tag !== "BUTTON") return; }
    else if(event.type === "input"){ if(!(type === "range" || node.dataset.live)) return; if(event.isComposing) return; }          // 日本語変換中は まだ 処理しない（「りあ」が「rいあ」に なる 不具合の対策）
    else if(event.type === "compositionend"){ if(!node.dataset.live) return; }
    else if(event.type === "change"){ if(type === "range" || node.dataset.live || !(tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")) return; }
    const parts = String(node.dataset.t).split(":");
    const handler = toolHandlers[parts[0]];
    if(!handler) return;
    runTool(() => handler(parts[1], node, event));
}

function dayKey(date){
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
