"use strict";
// RPG「ARE 〜そういうときは、AREだ！〜」ランチャー。ゲーム本体は ./game/ にあります（別ページで全画面）。
function openRpg(){
    let nm = "";
    try{ nm = Array.from(String(profileDisplayName(state.profile) || "").replace(/\s+/g, "")).slice(0, 8).join(""); }catch(_e){}
    try{ if(nm) localStorage.setItem("tq_suggest_name", nm); else localStorage.removeItem("tq_suggest_name"); }catch(_e){}
    const href = "./game/index.html";   // 名前は URL に のせない（URLから個人情報が もれないように）
    openSheet(toolHead("🗡️ ARE 〜そういうときは、AREだ！〜", "王道ふうの2D RPG。セーブ3つ・自動戦闘・自動レベル上げ。スマホ・タブレットは横向き推奨、パソコンは大きな画面で") +
        '<div class="admin-card">プロフィールの名前「' + escapeHtml(nm || "主人公") + '」を主人公の名前に使えます（ゲーム内で変更もOK）。セーブはこの端末のブラウザに保存されます。</div>' +
        '<div class="row"><a class="button" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">▶ ゲームをひらく</a><button type="button" class="button-secondary" data-pm="close">閉じる</button></div>');
}
function initRpg(){ /* ゲーム本体は ./game/ に独立。チャット側の初期化は不要 */ }

// ---- ARE QUEST 2（./game2/）と ドリームフロンティア（./dream-frontier/）のランチャー ----
function openGame2(){
    let nm = "";
    try{ nm = Array.from(String(profileDisplayName(state.profile) || "").replace(/\s+/g, "")).slice(0, 8).join(""); }catch(_e){}
    const href = "./game2/index.html";   // 名前は URL に のせない
    openSheet(toolHead("📖 ARE QUEST 2", "ストーリー重視の3D・RPG。前日譚から後日談まで42話。スマホ・タブレットは横向き推奨") +
        '<div class="admin-card">セーブはこの端末のブラウザに保存されます。ゲーム内からRPG『ARE QUEST』やドリームフロンティアにも行けます。</div>' +
        '<div class="row"><a class="button" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">▶ ゲームをひらく</a><button type="button" class="button-secondary" data-pm="close">とじる</button></div>');
}
function openDream(){
    const href = "./dream-frontier/index.html";
    openSheet(toolHead("🎡 ドリームフロンティア", "3Dのテーマパーク。18のライド・アトラクションをめぐってスタンプを集めよう") +
        '<div class="admin-card">アカウント・ポイントは不要です。セーブはこの端末のブラウザに保存されます。スマホ・タブレットは横向き推奨。</div>' +
        '<div class="row"><a class="button" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">▶ パークにはいる</a><button type="button" class="button-secondary" data-pm="close">とじる</button></div>');
}
function openGame3(){
    const href = "./game3/index.html";
    openSheet(toolHead("🌙 ARE QUEST 3 〜月影のあしあと〜", "高画質の3D・学園ものRPG。PC推奨（スマホ・タブレットは横向き）") +
        '<div class="admin-card">セーブはこの端末のブラウザに保存されます。アカウント・ポイントは不要です。ゲーム内の「ひみつのコード」で、チートコードも使えます。</div>' +
        '<div class="row"><a class="button" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">▶ ゲームをひらく</a><button type="button" class="button-secondary" data-pm="close">とじる</button></div>');
}
function openGame4(){
    const href = "./game4/index.html";
    openSheet(toolHead("🃏 ARE CARD 〜そういうときは、AREだ！〜", "3Dの盤面で遊ぶカードバトル（土台版）") +
        '<div class="admin-card">デッキを組んでCPUと対戦。セーブはこの端末のブラウザに保存されます。アカウント・ポイントは不要です。</div>' +
        '<div class="row"><a class="button" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">▶ ゲームをひらく</a><button type="button" class="button-secondary" data-pm="close">とじる</button></div>');
}
function initGame3(){ /* ゲーム本体は ./game3/ に独立 */ }
function initGame4(){ /* ゲーム本体は ./game4/ に独立 */ }
function initGame2(){ /* ゲーム本体は ./game2/ に独立 */ }
function initDream(){ /* ゲーム本体は ./dream-frontier/ に独立 */ }
