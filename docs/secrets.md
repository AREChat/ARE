# GitHub Secrets・キーの棚卸し（T396）
| 名前 | どこに置く | 使うところ |
|---|---|---|
| `SUPABASE_URL` | GitHub Actions secrets（使っている場合だけ） | バックアップ（ストーリー整理は、いまは Supabase の pg_cron が行うため、GitHub 側には不要） |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function（Supabase が自動で入れる） | ストーリー整理など（**ブラウザには置かない**） |
| `STORY_CLEANUP_SECRET`（合言葉） | Supabase の Vault（pg_cron が読む）と Edge Function secrets | cleanup-stories・refresh-info・archive-old-files を、pg_cron から呼ぶときの合言葉（ヘッダ `x-cleanup-secret`）。長いランダム文字列にする。GitHub には置かない |
| `DRIVE_ARCHIVE_URL`・`DRIVE_ARCHIVE_TOKEN` | Edge Function secrets（Supabase） | 30日たったファイルを Googleドライブへ移す `archive-old-files` が使う（受け口の URL と合言葉）。画面にも報告にも書かない |
| `SUPABASE_DB_URL` | GitHub Actions secrets（`backup.yml` を作ったときだけ。いまは使っていません） | 週1バックアップ(`backup.yml`) |
anonキー(公開用)は ブラウザのコードに 入ってよい。service_role は 絶対に 入れない。半年に1回、不要なものが無いか見直す。
