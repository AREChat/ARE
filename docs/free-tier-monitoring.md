# 無料枠のチェック（毎週）
Supabase の SQL エディタで実行します（読み取りだけ）。
```sql
-- DB全体の大きさ（無料枠 500MB）
select pg_size_pretty(pg_database_size(current_database())) as db_size;
-- 大きいテーブル上位10
select relname, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 10;
-- ストレージ（無料枠 1GB）
select pg_size_pretty(coalesce(sum((metadata->>'size')::bigint),0)) as storage from storage.objects;
```
目安：DB 400MB・ストレージ 800MB を超えたら古い投稿・画像の整理を。
# 開発用DBと本番DBの差分チェック（両方で実行して結果を比べる）
```sql
select 'functions', md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'columns', md5(string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name,column_name)) from information_schema.columns where table_schema='public'
union all select 'policies', md5(string_agg(tablename||'.'||policyname||':'||cmd, ',' order by tablename,policyname)) from pg_policies where schemaname='public'
union all select 'cron', md5(string_agg(jobname||':'||schedule, ',' order by jobname)) from cron.job;
```
2つの結果（md5）が同じなら同じ構成です。
# 週1自動メッセージの確認
```sql
select jobname, schedule from cron.job;
select status, start_time from cron.job_run_details order by start_time desc limit 5;
```
