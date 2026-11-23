-- pg_cron の「実行の記録」（cron.job_run_details）の そうじ。
-- 毎分うごく ジョブ（予約送信・自動消去 など）が 1回ごとに 1行ずつ 記録を ためていき、データベースの中で いちばん大きい 表になっていた（約19MB）。
-- 記録は 動作の確認にしか 使わないので、1日より古いものは 毎日 消す。（チャットの会話・ファイルには さわらない）

-- ① いまある 古い記録を 消す
delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '1 day';

-- ② これから 毎日（日本時間 午前3:31）、1日より古い記録を 自動で 消す
select cron.schedule(
  'purge-cron-run-details',
  '31 18 * * *',
  $$delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '1 day'$$
);
