-- お試し（ゲスト）：タブを閉じたら／ログアウトしたら、その場で消す 2026-11-22
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に流す。先に guest_cleanup_v1.sql が流してあること。
--
-- ① public.guest_delete_user_v1(uuid)
--    … 「タブを閉じた」ときに送られる合図（edge function guest-bye）から呼ぶ。service_role だけが実行できる。
--      お試しアカウントだけを消す（管理者・ふつうのユーザーには何も起きない）。
-- ② private.guest_purge_offline_v1(分)
--    … 合図が届かなかったとき（電波が切れた・ブラウザが落ちた等）の保険。
--      「在席の更新（30 秒ごと）」も「メッセージ」も N 分なかったお試しアカウントを消す。
-- ③ pg_cron「guest-offline-purge-v1」… 5 分ごとに②を実行（10 分以上 音沙汰のないお試しを消す）。
--    既存の「2日放置で消す（guest-purge-v1）」はそのまま残す。

create or replace function public.guest_delete_user_v1(p_user uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or not private.is_guest_user(p_user) or private.is_admin_user(p_user) then return false; end if;
  perform private.guest_purge_user_v1(p_user);
  return true;
end $$;
revoke all on function public.guest_delete_user_v1(uuid) from public, anon, authenticated;
grant execute on function public.guest_delete_user_v1(uuid) to service_role;

create or replace function private.guest_purge_offline_v1(p_minutes integer default 10)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare r record; n integer := 0;
begin
  for r in
    select g.user_id
      from private.guest_accounts g
      left join public.profiles p on p.id = g.user_id
     where not private.is_admin_user(g.user_id)
       and greatest(
             g.created_at,
             coalesce(p.last_seen_at, g.created_at),
             coalesce((select max(m.created_at) from public.messages m where m.sender_id = g.user_id), g.created_at)
           ) < now() - make_interval(mins => greatest(p_minutes, 3))
  loop
    begin
      perform private.guest_purge_user_v1(r.user_id);
      n := n + 1;
    exception when others then
      raise warning 'guest_offline_purge_failed % : %', r.user_id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke all on function private.guest_purge_offline_v1(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'guest-offline-purge-v1';
    perform cron.schedule('guest-offline-purge-v1', '*/5 * * * *', 'select private.guest_purge_offline_v1(10)');
  end if;
end $$;
