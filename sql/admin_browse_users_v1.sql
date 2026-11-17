-- =====================================================================
-- admin_browse_users_v1.sql  管理者だけ：ユーザータブで、グループ（家庭/友達/社員/その他/全員）を選んで一覧できる
--  ・既存の my_segment_peers_v1（おすすめ用）とは別。管理者専用の「見て回る」ための一覧です
--  ・p_segment が null か 'all' のときは全員（管理者自身は含まない）
-- =====================================================================
begin;
create or replace function public.admin_browse_users_v1(p_segment text default null)
returns setof public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if not private.current_is_admin() then raise exception 'forbidden'; end if;
  if p_segment is null or p_segment = 'all' then
    return query select p.* from public.profiles p where p.id <> v_me order by p.display_name limit 500;
  else
    return query select p.* from public.profiles p
      join private.user_segments s on s.user_id = p.id
      where s.segment = p_segment and p.id <> v_me order by p.display_name limit 500;
  end if;
end $$;
revoke all on function public.admin_browse_users_v1(text) from public, anon;
grant execute on function public.admin_browse_users_v1(text) to authenticated;
commit;
