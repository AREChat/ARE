# 開発者向け手順書（T493）
（2026-11-22 に、いまの作りに合わせて更新しました）
## 構成
- ルート：チャット（chat.html + chat-*.js をまとめた `chat.bundle.js`）、ログイン、管理画面、ヘルプ
- ゲームは別リポジトリ `game`（`arechat.github.io/game/`）に移っています。このリポジトリの `game*/` は、古い版の置き場所として残っているものがあります
- `shared/`：共通部品（オフライン表示・ゲームパッドなど）
- `sql/`：チャット用のSQL（Supabase の SQL Editor で実行。再実行できる形）、`edge-functions/`：Edge Functions のコード（本番は Supabase 側に入っているものが正）
- `tools/`：チェック用スクリプト、`docs/`：手順書
## 変更したら
0. **チャットの JS（`tools/chat-bundle-sources.txt` に並んでいる `chat-*.js` など）を直したら、必ず `node tools/build-bundle.js` を実行して `chat.bundle.js` を作り直し、`chat.bundle.js` と `chat.html` もいっしょにコミットする。**（`node tools/build-bundle.js --check` で、最新かどうか確かめられる）
1. `node tools/gen-precache.js` で `precache.json` と `precache-manifest.js` を作り直し、ルートの `sw.js` の `const CACHE` の番号を上げる（`bash tools/check-sw-bump.sh` で確認）。JS・CSS・画像は「控え先・裏で更新」なので、番号を上げると全員の控えが入れ替わる。ゲームのリポジトリも、同じく `sw.js` と `precache.json` を直す。
2. `node tools/check-words.js && node tools/linkcheck.js && node tools/smoke.js`（smokeは `python3 -m http.server 8080` を起動して BASE=http://localhost:8080）
3. GitHub の `main` に直接 push する（コミットメッセージは日本語で、何を直したかがわかるように）。zip は、push できないときの予備です（`sh tools/make-diff-zip.sh 出力名.zip`）。
4. SQL を足したら、開発用 ARE-dev で試してから 本番に適用する。適用したら `docs/sql-apply.md` のとおり記録する。
## ルール
- 実在の人物・地名・虫は出さない／チート一覧mdは置かない／ゲームはSupabaseを使わない（チャット内のものを除く）
