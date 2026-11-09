-- 管理者がユーザーのアカウントを削除したとき、そのユーザーのチャット履歴・メッセージも すべて消す  2026-11-09
-- 本番 Supabase（project: ARE）に、持ち主が SQL Editor で1回だけ流す。
-- ・「管理者による削除」（admin-delete-user）も「7日たったゲストの自動削除」も、最後は auth.users の行を消す。
--   その直前に動く"仕掛け（トリガー）"で チャットの中身を先に消すので、どちらの削除でも同じ結果になる（関数の作り直し不要）。
-- ・消すもの：そのユーザーが送ったメッセージ／参加（メンバー）情報／そのユーザーとの 1対1 の部屋（部屋の中身ぜんぶ）／
--   管理者としか話していない部屋。3人以上のグループ部屋は、本人の発言と参加だけ消し、ほかの人の発言は残す。
-- ・管理者アカウントは何があっても消さない（関数が何もせず戻る）。
-- ・ゲストの自動削除（guest_cleanup_v1.sql）も、この関数を使うほうが 範囲が広いが、そのままでも 動く。先にそちらを流していること。
-- ・途中で失敗したら Postgres の warning に出して 先へ進む（その場合は 外部キーのエラーで 削除そのものが止まり、巻きもどされる）。

create or replace function private.purge_user_chat_v1(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_rooms uuid[]; v_msgs text[];
begin
  if p_user is null or private.is_admin_user(p_user) then return; end if;

  -- 部屋ごと消す：ほかに「ふつうの参加者」が 2人以上 いない部屋（＝1対1・管理者だけ・ゲストだけ）
  select coalesce(array_agg(m.room_id), '{}') into v_rooms
  from public.chat_room_members m
  where m.user_id = p_user
    and (select count(*) from public.chat_room_members o
         where o.room_id = m.room_id and o.user_id <> p_user
           and not private.is_admin_user(o.user_id)) < 2;

  select coalesce(array_agg(x.id::text), '{}') into v_msgs
  from public.messages x where x.sender_id = p_user or x.room_id = any(v_rooms);
  perform private.guest_purge_refs_v1('public.messages'::regclass, v_msgs);
  delete from public.messages x where x.id::text = any(v_msgs);

  perform private.guest_purge_refs_v1('public.chat_rooms'::regclass, (select coalesce(array_agg(r::text), '{}') from unnest(v_rooms) r));
  delete from public.chat_room_members where room_id = any(v_rooms);
  delete from public.chat_rooms where id = any(v_rooms);

  delete from public.chat_room_members where user_id = p_user;
  perform private.guest_purge_refs_v1('public.profiles'::regclass, array[p_user::text]);
  perform private.guest_purge_refs_v1('auth.users'::regclass, array[p_user::text]);
end $$;

create or replace function private.on_auth_user_delete_v1()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform private.purge_user_chat_v1(old.id);
  exception when others then
    raise warning 'purge_user_chat_failed % : %', old.id, sqlerrm;
  end;
  return old;
end $$;

revoke all on function private.purge_user_chat_v1(uuid) from public, anon, authenticated;
revoke all on function private.on_auth_user_delete_v1() from public, anon, authenticated;

drop trigger if exists trg_purge_user_chat_v1 on auth.users;
create trigger trg_purge_user_chat_v1 before delete on auth.users
  for each row execute function private.on_auth_user_delete_v1();

-- 確かめる：  select tgname, tgenabled from pg_trigger where tgname = 'trg_purge_user_chat_v1';
-- やめたいとき：  drop trigger trg_purge_user_chat_v1 on auth.users;
