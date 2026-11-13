-- 「修正依頼」アカウントと、全員が見られる共通の部屋「修正依頼」を作る。  2026-11-13
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流す。データは消さない・追加だけ。何度流しても安全。
-- ・「修正依頼」アカウント：だれもパスワードでログインできません（パスワードは だれにも分からない ランダムな値）。
--   届いたメッセージは、管理者と、開発側（Claude）が読めます。返信は、Claude が データベースから「このアカウントの名前で」入れます。
-- ・共通の部屋「修正依頼」（グループ）：既存のユーザー全員・お試しアカウント・これから作られるアカウントが 自動で参加します。
--   だれが送った依頼も、ほかの参加者が読めます。部屋の持ち主は「修正依頼」アカウントなので、ふつうのユーザーは 名前の変更や メンバーの追加・削除は できません。
-- ・だれかが この部屋に送ると、自動で「◯◯さん、貴重なご意見ありがとうございました。すぐに対応いたします！」と返します
--   （同じ人へは 2分以内に返したあと 続けて返しません）。この自動返信は 失敗しても、送った人のメッセージ送信を止めません。
-- ・お試しアカウントの「管理者以外へは5件まで」には、この部屋への送信を数えません（guest_used_v1 / guest_limit_v1 を この部屋だけ除くように更新）。
-- ・番号（ID）は固定です：アカウント 7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01 ／ 部屋 7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02（chat-fixreq.js も同じ番号を使います）

do $$
declare
  v_id uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01';
  v_name text := '修正依頼';
  v_status text := '直してほしいところを、ここに送ってください';
  v_bio text := 'AREの「ここを直してほしい」「こうしてほしい」を受け付けるアカウントです。届いた依頼は、アプリを作っている人と、手伝いのAI（Claude）が確認して、返信します。この部屋は みんなが見られます。';
begin
  -- 1) 認証ユーザー（パスワードは ランダム。だれも知らない）
  if not exists (select 1 from auth.users where id = v_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'fix-request-inbox@login.are.invalid',
      extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_name, 'name', v_name, 'full_name', v_name),
      now(), now(), '', '', '', ''
    );
  end if;

  -- 2) 登録情報（ほかの人と同じ形にそろえる。使える方法で入れる）
  begin
    perform public.register_user_metadata(
      p_user_id := v_id, p_login_id := 'fix-request-inbox', p_login_id_normalized := 'fix-request-inbox',
      p_display_name := v_name, p_phone_number := '', p_contact_email := '',
      p_recovery_code_hash := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex')
    );
  exception when others then
    raise notice 'register_user_metadata は使わずに続けます: %', sqlerrm;
    begin
      insert into private.user_login_ids (user_id, login_id, login_id_normalized)
        values (v_id, 'fix-request-inbox', 'fix-request-inbox') on conflict do nothing;
      insert into private.user_private_info (user_id, recovery_code_hash)
        values (v_id, encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex')) on conflict do nothing;
    exception when others then
      raise notice 'ログイン用の名前の登録は 省きました: %', sqlerrm;
    end;
  end;

  -- 3) プロフィール（名前・ひとこと・自己紹介）
  insert into public.profiles (id, display_name, status_message, bio)
  values (v_id, v_name, v_status, v_bio)
  on conflict (id) do update
    set display_name = excluded.display_name,
        status_message = excluded.status_message,
        bio = excluded.bio,
        updated_at = now();
end $$;

-- 4) 共通の部屋「修正依頼」（グループ）。持ち主は「修正依頼」アカウント
insert into public.chat_rooms (id, is_group, name, notice, created_by)
values ('7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02', true, '修正依頼',
        'みんなの「ここを直してほしい」「こうしてほしい」を送る部屋です。この部屋の内容は、参加している全員が読めます。書き方の例：どこで（画面・ゲーム名）／どうなった／どうしてほしい',
        '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01')
on conflict (id) do update set name = excluded.name, notice = excluded.notice, is_group = true;

-- 5) 既存のユーザー全員（管理者・お試しアカウント・「修正依頼」アカウントを含む）を参加させる。これまでの書きこみは 未読にしない
insert into public.chat_room_members (room_id, user_id, last_read_at)
select '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02', p.id, now()
from public.profiles p
on conflict (room_id, user_id) do nothing;

-- 6) これから作られるアカウント（ふつうの登録・お試しアカウント）も、プロフィールができたとき 自動で参加させる
create or replace function private.fix_request_join_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  begin
    insert into public.chat_room_members (room_id, user_id, last_read_at)
    values ('7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02', new.id, now())
    on conflict (room_id, user_id) do nothing;
  exception when others then
    raise warning 'fix_request_join_v1: %', sqlerrm;   -- 失敗しても、登録そのものは止めない
  end;
  return new;
end $$;
revoke all on function private.fix_request_join_v1() from public, anon, authenticated;

drop trigger if exists profiles_fix_request_join on public.profiles;
create trigger profiles_fix_request_join after insert on public.profiles
for each row execute function private.fix_request_join_v1();

-- 7) 自動返信：この部屋に だれかが送ったら、名前つきで お礼を返す
create or replace function private.fix_request_ack_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_bot constant uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01';
  v_room constant uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02';
  v_name text;
  v_who text;
begin
  begin
    if new.room_id <> v_room then return new; end if;
    if new.sender_id is null or new.sender_id = v_bot or coalesce(new.is_auto_reply, false) then return new; end if;
    select p.display_name into v_name from public.profiles p where p.id = new.sender_id;
    v_who := coalesce(nullif(trim(v_name), ''), 'あなた');
    -- 同じ人へは、2分以内に返したばかりなら 続けて返さない
    if exists (select 1 from public.messages x
               where x.room_id = v_room and x.sender_id = v_bot and x.created_at > now() - interval '2 minutes'
                 and position((v_who || 'さん、') in x.content) > 0) then
      return new;
    end if;
    perform set_config('are.auto_reply', 'on', true);   -- messages の安全装置（自動返信のフラグは are.auto_reply=on のときだけ）を、入れる間だけ開ける
    insert into public.messages (room_id, sender_id, content, is_auto_reply)
    values (v_room, v_bot,
            jsonb_build_object('type', 'text', 'text', v_who || 'さん、貴重なご意見ありがとうございました。すぐに対応いたします！')::text,
            true);
    perform set_config('are.auto_reply', 'off', true);
  exception when others then
    perform set_config('are.auto_reply', 'off', true);
    raise warning 'fix_request_ack_v1: %', sqlerrm;   -- 失敗しても、送った人のメッセージは そのまま届ける
  end;
  return new;
end $$;
revoke all on function private.fix_request_ack_v1() from public, anon, authenticated;

drop trigger if exists messages_fix_request_ack on public.messages;
create trigger messages_fix_request_ack after insert on public.messages
for each row execute function private.fix_request_ack_v1();

-- 8) お試しアカウントの「5件まで」に、この部屋を数えない（guest_trial_v1.sql の関数を、この部屋だけ除いて作り直す）
create or replace function private.guest_used_v1(p_user uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.messages x
  where x.sender_id = p_user
    and x.room_id <> '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02'
    and exists (select 1 from public.chat_room_members m
                where m.room_id = x.room_id and m.user_id <> p_user and not private.is_admin_user(m.user_id))
$$;

create or replace function private.guest_limit_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_limit constant integer := 5;
begin
  if new.sender_id is null or coalesce(new.is_auto_reply, false) then return new; end if;
  if new.room_id = '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02' then return new; end if;   -- 「修正依頼」の部屋は 数えない
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
