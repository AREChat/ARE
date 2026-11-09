-- 管理者が画面から「削除ずみユーザーの残りチャット」を消せるようにする  2026-11-09
-- 先に orphan_chat_cleanup_v1.sql（private.purge_orphan_chat_v1 を作るもの）を流しておくこと。
-- 管理者だけが呼べる（それ以外は エラーになる）。

create or replace function public.admin_orphan_chat_count()
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare n integer;
begin
  if not public.is_current_user_admin() then raise exception 'forbidden'; end if;
  select count(*) into n from public.chat_rooms r
  where exists (select 1 from public.chat_room_members m where m.room_id = r.id and not exists (select 1 from auth.users u where u.id = m.user_id))
    and (select count(*) from public.chat_room_members o join auth.users u on u.id = o.user_id
         where o.room_id = r.id and not private.is_admin_user(o.user_id)) < 2;
  return n;
end $$;

create or replace function public.admin_purge_orphan_chat()
returns table (rooms_deleted int, members_deleted int, messages_deleted int, profiles_deleted int)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then raise exception 'forbidden'; end if;
  return query select * from private.purge_orphan_chat_v1();
end $$;

revoke all on function public.admin_orphan_chat_count() from public, anon;
revoke all on function public.admin_purge_orphan_chat() from public, anon;
grant execute on function public.admin_orphan_chat_count() to authenticated;
grant execute on function public.admin_purge_orphan_chat() to authenticated;
