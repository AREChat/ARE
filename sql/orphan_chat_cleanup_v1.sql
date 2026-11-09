-- すでに削除されたユーザーの「チャットだけ残っている」ものを片づける  2026-11-09
-- 本番 Supabase の SQL Editor で、持ち主が流す。①で消える予定を見てから、②を流す。
-- 「消えたユーザー」＝ auth.users にいない user_id。

-- ① 消える予定を見る（何も消えない）
--   select 'room' as kind, r.id::text, null as note from public.chat_rooms r
--   where exists (select 1 from public.chat_room_members m where m.room_id = r.id and not exists (select 1 from auth.users u where u.id = m.user_id))
--     and (select count(*) from public.chat_room_members o join auth.users u on u.id = o.user_id
--          where o.room_id = r.id and not private.is_admin_user(o.user_id)) < 2;

-- ② 実行
create or replace function private.purge_orphan_chat_v1()
returns table (rooms_deleted int, members_deleted int, messages_deleted int, profiles_deleted int)
language plpgsql security definer set search_path = ''
as $$
declare v_rooms uuid[]; v_msgs text[]; v_orph text[]; a int := 0; b int := 0; c int := 0; d int := 0;
begin
  -- 消えたユーザーがいて、ふつうの参加者が 2人未満しか残っていない部屋（1対1・管理者だけ・空）→ 部屋ごと消す
  select coalesce(array_agg(r.id), '{}') into v_rooms from public.chat_rooms r
  where exists (select 1 from public.chat_room_members m where m.room_id = r.id and not exists (select 1 from auth.users u where u.id = m.user_id))
    and (select count(*) from public.chat_room_members o join auth.users u on u.id = o.user_id
         where o.room_id = r.id and not private.is_admin_user(o.user_id)) < 2;
  a := cardinality(v_rooms);

  -- 消す部屋の中のメッセージ ＋ 消えたユーザーが送ったメッセージ
  select coalesce(array_agg(x.id::text), '{}') into v_msgs from public.messages x
  where x.room_id = any(v_rooms) or (x.sender_id is not null and not exists (select 1 from auth.users u where u.id = x.sender_id));
  c := cardinality(v_msgs);
  perform private.guest_purge_refs_v1('public.messages'::regclass, v_msgs);
  delete from public.messages x where x.id::text = any(v_msgs);

  perform private.guest_purge_refs_v1('public.chat_rooms'::regclass, (select coalesce(array_agg(r::text), '{}') from unnest(v_rooms) r));
  delete from public.chat_room_members where room_id = any(v_rooms);
  delete from public.chat_rooms where id = any(v_rooms);

  -- 残った部屋に残っている、消えたユーザーの参加情報
  delete from public.chat_room_members m where not exists (select 1 from auth.users u where u.id = m.user_id);
  get diagnostics b = row_count;

  -- 持ち主のいないプロフィール
  select coalesce(array_agg(p.id::text), '{}') into v_orph from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id);
  if cardinality(v_orph) > 0 then
    perform private.guest_purge_refs_v1('public.profiles'::regclass, v_orph);
    delete from public.profiles p where p.id::text = any(v_orph);
    d := cardinality(v_orph);
  end if;

  return query select a, b, c, d;
end $$;
revoke all on function private.purge_orphan_chat_v1() from public, anon, authenticated;

select * from private.purge_orphan_chat_v1();
