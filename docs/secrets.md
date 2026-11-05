# GitHub Secrets・キーの棚卸し（T396）
| 名前 | どこに置く | 使うところ |
|---|---|---|
| `SUPABASE_URL` | GitHub Actions secrets | ストーリー整理・バックアップ |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions secrets / Edge Function | ストーリー整理（**ブラウザには置かない**） |
| `STORY_CLEANUP_SECRET` | Edge Function secrets + GitHub Actions secrets（同じ値） | cleanup-stories の合言葉。長いランダム文字列にする |
| `SUPABASE_DB_URL` | GitHub Actions secrets | 週1バックアップ(`backup.yml`) |
anonキー(公開用)は ブラウザのコードに 入ってよい。service_role は 絶対に 入れない。半年に1回、不要なものが無いか見直す。
