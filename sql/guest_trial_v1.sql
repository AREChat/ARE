-- お試しアカウント（登録不要の無料体験）  2026-11-06
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流す。データは消さない・追加だけ。
-- ・管理者とのチャットは無制限
-- ・管理者以外の人がいる部屋へは、お試しアカウントあわせて5件まで（5を変えるときは 3か所の "5" と guest_status_me を直す）

create table if not exists private.guest_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.guest_accounts enable row level security;

create or replace function private.is_guest_user(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.guest_accounts g where g.user_id = p_user) $$;

-- お試しアカウントが「管理者以外の人がいる部屋」に送ったメッセージの数（削除したものも数える）
create or replace function private.guest_used_v1(p_user uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.messages x
  where x.sender_id = p_user
    and exists (select 1 from public.chat_room_members m
                where m.room_id = x.room_id and m.user_id <> p_user and not private.is_admin_user(m.user_id))
$$;

create or replace function private.guest_limit_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_limit constant integer := 5;
begin
  if new.sender_id is null or coalesce(new.is_auto_reply, false) then return new; end if;
  if not private.is_guest_user(new.sender_id) then return new; end if;
  if not exists (select 1 from public.chat_room_members m
                 where m.room_id = new.room_id and m.user_id <> new.sender_id and not private.is_admin_user(m.user_id)) then
    return new;  -- 管理者だけの部屋は無制限
  end if;
  if private.guest_used_v1(new.sender_id) >= v_limit then
    raise exception 'guest_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists messages_guest_limit on public.messages;
create trigger messages_guest_limit before insert on public.messages
for each row execute function private.guest_limit_v1();

-- 自分がお試しアカウントか、あと何件送れるか（画面の上の案内に使う）
create or replace function public.guest_status_me()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); v_used integer;
begin
  if v_me is null or not private.is_guest_user(v_me) then return jsonb_build_object('guest', false); end if;
  v_used := private.guest_used_v1(v_me);
  return jsonb_build_object('guest', true, 'limit', 5, 'used', v_used, 'remaining', greatest(0, 5 - v_used));
end $$;
revoke all on function public.guest_status_me() from public, anon;
grant execute on function public.guest_status_me() to authenticated;

-- お試しアカウントを作る（Edge Function guest-start からだけ呼ぶ。管理者との1対1の部屋もここで作る）
create or replace function public.register_guest_v1(p_user_id uuid, p_display_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_admin uuid; v_room uuid; v_login text;
begin
  if p_user_id is null then raise exception 'invalid_user_id'; end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 30 then raise exception 'invalid_display_name'; end if;
  v_login := 'guest-' || substr(replace(p_user_id::text, '-', ''), 1, 12);
  insert into public.profiles (id, display_name) values (p_user_id, trim(p_display_name));
  insert into private.user_login_ids (user_id, login_id, login_id_normalized) values (p_user_id, v_login, v_login);
  insert into private.user_private_info (user_id, recovery_code_hash)
    values (p_user_id, encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'));
  insert into private.guest_accounts (user_id) values (p_user_id);
  select r.user_id into v_admin from private.user_roles r where r.role = 'admin' order by r.created_at limit 1;
  if v_admin is not null then
    insert into public.chat_rooms default values returning id into v_room;
    insert into public.chat_room_members (room_id, user_id) values (v_room, p_user_id), (v_room, v_admin);
  end if;
end $$;
revoke all on function public.register_guest_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.register_guest_v1(uuid, text) to service_role;
