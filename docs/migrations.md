# マイグレーションの連番ルール（T385）
このリポジトリでは、SQL は `sql/` に `内容_v番号.sql`（例：`passby_v1.sql`、`passby_v2_keys.sql`）の名前で置いています。Supabase 側の「Database → Migrations」には、適用した順に記録されます（古いものは `YYYYMMDDHHMMSS_内容` の形）。
- 一度本番に入れたファイルは **書き換えない**。直したいときは 新しいファイルを足す。
- 1ファイル＝1つのまとまり。何度実行しても壊れない書き方(`if not exists` など)にする。
