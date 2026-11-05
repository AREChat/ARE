# 開発者向け手順書（T493）
## 構成
- ルート：チャット（chat.html + chat-*.js）、ログイン、管理画面
- `game/`(game1)・`game2/`・`game3/`・`game4/`・`game6/`：ゲーム。`shared/` は共通部品
- `supabase/`：チャット用のSQL(migrations)とEdge Functions
- `tools/`：チェック用スクリプト、`docs/`：手順書
## 変更したら
1. `game/` を変えたら `game/sw.js` の `CACHE` の番号を上げる。チャットを変えたら ルートの `sw.js` も。
2. `node tools/check-words.js && node tools/linkcheck.js && node tools/smoke.js`（smokeは `python3 -m http.server 8080` を起動して BASE=http://localhost:8080）
3. 変更したファイルだけ zip：`sh tools/make-diff-zip.sh 出力名.zip`
## ルール
- 実在の人物・地名・虫は出さない／チート一覧mdは置かない／ゲームはSupabaseを使わない
