# 開発者向け手順書（T493）
## 構成
- ルート：チャット（chat.html + chat-*.js）、ログイン、管理画面
- `game/`(game1)・`game2/`・`game3/`・`game4/`・`game6/`：ゲーム。`shared/` は共通部品
- `supabase/`：チャット用のSQL(migrations)とEdge Functions
- `tools/`：チェック用スクリプト、`docs/`：手順書
## 変更したら
0. **チャットの JS（`tools/chat-bundle-sources.txt` に並んでいる `chat-*.js` など）を直したら、必ず `node tools/build-bundle.js` を実行して `chat.bundle.js` を作り直し、`chat.bundle.js` と `chat.html` もいっしょにコミットする**（先に `npm i --no-save terser@5.51.2`）。chat.html は読み込みを速くするため、これらを1本にまとめた `chat.bundle.js` だけを読む。作り直し忘れは CI（`node tools/build-bundle.js --check`）が赤になって知らせる。新しい JS を足すときは `tools/chat-bundle-sources.txt` の正しい順番の所に1行足す。
1. `game/` を変えたら `game/sw.js` の `CACHE` の番号を上げる。チャットを変えたら ルートの `sw.js` も（JS・CSS・画像は「控え先・裏で更新」なので、番号を上げると全員の控えが入れ替わる）。
2. `node tools/check-words.js && node tools/linkcheck.js && node tools/smoke.js`（smokeは `python3 -m http.server 8080` を起動して BASE=http://localhost:8080）
3. 変更したファイルだけ zip：`sh tools/make-diff-zip.sh 出力名.zip`
## ルール
- 実在の人物・地名・虫は出さない／チート一覧mdは置かない／ゲームはSupabaseを使わない
