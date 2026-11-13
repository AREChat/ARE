-- user_prefs に「ログイン済みの人が読み書きする権限」を付ける（これが無いと、お気に入りのクラウド同期は「権限がありません」で失敗し、
-- アプリは静かに端末内保存だけに切りかわる）。行の絞りこみは RLS（user_prefs_own_*）が行うので、本人の行しか触れない。何度実行しても安全。
grant select, insert, update, delete on public.user_prefs to authenticated;
