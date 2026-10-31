# バックアップ手順（無料）
## 1. ゲーム
セーブは各自のブラウザ内。GitHub のコードは git 履歴が自動バックアップ。
## 2. チャットのDB（Supabase 無料枠）
無料プランには自動の日次バックアップがありません。次のどちらかで取ります。
1. **手動**：PCで `supabase db dump --db-url "<接続文字列>" -f backup.sql`（Supabase CLI は無料）。接続文字列は Dashboard → Project Settings → Database。
2. **GitHub Actions で週1回**：`.github/workflows/backup.yml` を作り、Secret `SUPABASE_DB_URL` を登録して `pg_dump` を実行 → 成果物(artifact)として7日保存。※ Secret に接続文字列を入れる。リポジトリが公開でも Secret は見えません。
注意：dump ファイルには個人情報が入るので、**GitHub の公開リポジトリにコミットしない**こと。
## 3. 戻すとき
`psql "<接続文字列>" -f backup.sql`（先に開発用DBで試す）。
