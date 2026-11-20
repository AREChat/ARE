-- 行動予定表「みんなの待ち時間」（名前を伏せた集計）
-- ・使う人が「共有する」をONにしたときだけ、待ち時間が 1件ずつ（名前なしで）送られます。
-- ・送るのは「場所の名前（空白・大文字小文字をそろえたもの）」「待ち分」「時間帯（0〜23時）」だけです。
-- ・見られるのは「3人以上が記録した名前」の 平均・まん中の値・件数だけ（1〜2人の記録は 誰のものか 推測されやすいので 出しません）。
-- ・表には誰も直接さわれません（読み書きは、下の2つの関数だけ）。
-- ・これを実行するまで、アプリは「みんなの待ち時間」の画面を 出しません（実行すると、自動で 出るようになります）。
-- Supabase の SQL Editor に まるごと貼って、Run してください（何度 実行しても 大丈夫です）。

create table if not exists public.itin_wait_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name_key text not null check (char_length(name_key) between 2 and 40),
  wait_min int not null check (wait_min between 1 and 300),
  hour smallint not null check (hour between 0 and 23),
  created_at timestamptz not null default now()
);
create index if not exists itin_wait_reports_name_idx on public.itin_wait_reports (name_key, created_at desc);
create index if not exists itin_wait_reports_user_idx on public.itin_wait_reports (user_id, created_at desc);

alter table public.itin_wait_reports enable row level security;
-- 方針（ポリシー）を 1つも作らない ＋ 権限も外す ＝ 誰も表を直接 読み書きできない（関数だけが通れる）
revoke all on public.itin_wait_reports from anon, authenticated;

-- 1件 送る（ログイン必須。1人 1日 100件まで。同じ人が 同じ名前を 10分以内に くりかえしても 1件だけ）
create or replace function public.itin_report_wait(p_name text, p_wait int, p_hour int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  k text := left(coalesce(p_name, ''), 40);
  n int;
begin
  if uid is null then raise exception 'login required'; end if;
  if char_length(k) < 2 or p_wait is null or p_wait < 1 or p_wait > 300 or p_hour is null or p_hour < 0 or p_hour > 23 then
    return false;
  end if;
  select count(*) into n from public.itin_wait_reports where user_id = uid and created_at > now() - interval '1 day';
  if n >= 100 then return false; end if;
  if exists (select 1 from public.itin_wait_reports where user_id = uid and name_key = k and created_at > now() - interval '10 minutes') then
    return false;
  end if;
  insert into public.itin_wait_reports (user_id, name_key, wait_min, hour) values (uid, k, p_wait, p_hour::smallint);
  -- 90日より古い記録は、ときどき 掃除する
  if random() < 0.02 then
    delete from public.itin_wait_reports where created_at < now() - interval '90 days';
  end if;
  return true;
end;
$$;

-- みんなの目安を 見る（ログイン必須。直近60日。3人以上が記録した名前だけ）
create or replace function public.itin_wait_stats(p_names text[])
returns table(name_key text, n bigint, users bigint, avg_min numeric, median_min numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.name_key,
         count(*)::bigint,
         count(distinct r.user_id)::bigint,
         round(avg(r.wait_min)::numeric, 1),
         round((percentile_cont(0.5) within group (order by r.wait_min))::numeric, 1)
    from public.itin_wait_reports r
   where auth.uid() is not null
     and r.name_key = any (p_names[1:60])
     and r.created_at > now() - interval '60 days'
   group by r.name_key
  having count(distinct r.user_id) >= 3;
$$;

revoke all on function public.itin_report_wait(text, int, int) from public, anon;
revoke all on function public.itin_wait_stats(text[]) from public, anon;
grant execute on function public.itin_report_wait(text, int, int) to authenticated;
grant execute on function public.itin_wait_stats(text[]) to authenticated;

-- 確認（実行したあと、これを Run すると 「関数2つ」と「表の保護」が 見られます）
-- select proname from pg_proc where proname in ('itin_report_wait','itin_wait_stats');
-- select relrowsecurity from pg_class where relname = 'itin_wait_reports';
