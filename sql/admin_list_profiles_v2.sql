-- =====================================================================
-- admin_list_profiles_v2.sql  管理者パネル「ユーザー管理」：グループ・使用頻度を追加
--  ・admin_list_profiles（既存）はそのまま残します。新しい関数を追加するだけです。再実行OK
--  ・segment：home/work/friend/other/null（管理者やグループに入っていない人は null）
--  ・msg_count：これまでに送った（削除ずみも含む）メッセージの総数。「使用頻度」の並べ替えに使います
-- =====================================================================
begin;
create or replace function public.admin_list_profiles_v2()
returns table(user_id uuid, display_name text, login_id text, created_at timestamptz, last_seen_at timestamptz, is_admin boolean, segment text, msg_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.display_name, l.login_id, p.created_at, p.last_seen_at,
         exists (select 1 from private.user_roles r where r.user_id = p.id and r.role = 'admin'),
         s.segment,
         coalesce((select count(*) from public.messages m where m.sender_id = p.id), 0)
  from public.profiles p
  left join private.user_login_ids l on l.user_id = p.id
  left join private.user_segments s on s.user_id = p.id
  order by p.created_at desc limit 500;
end $$;
revoke all on function public.admin_list_profiles_v2() from public, anon;
grant execute on function public.admin_list_profiles_v2() to authenticated;
commit;
