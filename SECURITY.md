# セキュリティについて
- 脆弱性や個人情報が見えてしまう不具合を見つけたら、**公開のIssueには書かず**、管理者へ直接連絡してください（チャットの問い合わせ）。
- 合言葉・キー(`SUPABASE_SERVICE_ROLE_KEY`、`STORY_CLEANUP_SECRET` など)は GitHub の Secrets にだけ置き、コードや画面には書きません。
- ゲーム(game〜game6)のセーブは端末内(localStorage)だけです。サーバーには送りません。
