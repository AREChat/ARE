# SQL全適用手順（T413・T494）
1. `supabase/migrations/` の中を **ファイル名の番号の小さい順** に実行する（開発用DB → 動作確認 → 本番DB）。
2. 実行は Supabase の SQL Editor、または `supabase db push`。
3. 終わったら `docs/free-tier-monitoring.md` の「差分チェック」SQLを両方で実行し、md5が一致するか見る。
4. 消す操作(delete/drop)を含むものは、先に開発用で試し、バックアップ(`docs/backup.md`)を取ってから本番へ。
