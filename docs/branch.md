# ブランチ運用（T423）
- いまは、`main`（公開中・GitHub Pages）に **直接 push** しています（コミットメッセージは日本語で、何を直したかがわかるように）。push する前に `git fetch` して、ほかの変更とぶつからないか確かめます。
- 大きな機能を、公開前に試したいときだけ、`feature/名前` の枝を作って、まとまったら main へ。
- 公開の確認：Actions の「自動テスト」と「pages build and deployment」が緑になっていること。
