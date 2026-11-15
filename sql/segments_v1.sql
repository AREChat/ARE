-- =====================================================================
-- segments_v1.sql  ユーザー区分（家庭 / 社員 / 友人 / その他）と完全分離
--
--  ・区分は private スキーマ（外部に公開されない）に置く。管理者だけが RPC で読み書きできる
--  ・家庭（home）のユーザーは、管理者・ボット以外の「家庭ではない人」と
--      話せない／見えない（プロフィール・投稿・グループ・フォローすべて）
--  ・家庭 ⇔ 他区分の個人チャットだけは、管理者が承認した組に限って許可（グループ・投稿は不可）
--  ・依頼確認チャット（名前はすべて同じ）を区分ごとに 1 つ：家庭 / 社員 / 友人 / その他
--      友人 = 既存の room 7f1c0de0-…-0000000f1c02（過去の履歴をそのまま使う）
--  ・何度実行しても同じ結果になる（再実行OK）
--  実行場所：Supabase ダッシュボード > SQL Editor に全文を貼って Run
-- =====================================================================
begin;

-- ---------- 1. テーブル（private） ----------
create table if not exists private.user_segments (
    user_id    uuid primary key references public.profiles(id) on delete cascade,
    segment    text not null default 'other' check (segment in ('home','work','friend','other')),
    updated_at timestamptz not null default now()
);
create table if not exists private.segment_links (          -- 管理者が承認した「家庭 ⇔ 他区分」の個人チャット許可
    a uuid not null references public.profiles(id) on delete cascade,
    b uuid not null references public.profiles(id) on delete cascade,
    approved_by uuid,
    created_at timestamptz not null default now(),
    primary key (a, b),
    check (a < b)
);
create table if not exists private.contact_requests (
    id uuid primary key default gen_random_uuid(),
    requester uuid not null references public.profiles(id) on delete cascade,
    target    uuid not null references public.profiles(id) on delete cascade,
    status    text not null default 'pending' check (status in ('pending','approved','denied')),
    created_at timestamptz not null default now(),
    decided_at timestamptz
);
create unique index if not exists contact_requests_pending_uq
    on private.contact_requests (least(requester, target), greatest(requester, target)) where status = 'pending';
create table if not exists private.segment_rooms (          -- 区分ごとの「依頼確認チャット」
    segment text primary key check (segment in ('home','work','friend','other')),
    room_id uuid not null unique references public.chat_rooms(id) on delete cascade
);
alter table private.user_segments   enable row level security;
alter table private.segment_links   enable row level security;
alter table private.contact_requests enable row level security;
alter table private.segment_rooms   enable row level security;
revoke all on private.user_segments, private.segment_links, private.contact_requests, private.segment_rooms from anon, authenticated;

-- ---------- 2. 判定の部品（private） ----------
create or replace function private.seg_special(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select p_user = '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01'::uuid or private.is_admin_user(p_user)
$$;

create or replace function private.seg_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
    select coalesce((select s.segment from private.user_segments s where s.user_id = p_user), 'other')
$$;

-- 2人が関われるか。p_dm=true なら「管理者が承認した個人チャット」も許す
create or replace function private.seg_pair_ok(p_a uuid, p_b uuid, p_dm boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
    if p_a is null or p_b is null or p_a = p_b then return true; end if;
    if private.seg_special(p_a) or private.seg_special(p_b) then return true; end if;
    if (private.seg_of(p_a) = 'home') = (private.seg_of(p_b) = 'home') then return true; end if;   -- 家庭どうし／家庭以外どうし
    if not p_dm then return false; end if;
    return exists (select 1 from private.segment_links l where l.a = least(p_a, p_b) and l.b = greatest(p_a, p_b));
end $$;

create or replace function private.seg_bot_say(p_room uuid, p_sender uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
    perform set_config('are.auto_reply', 'on', true);
    insert into public.messages (room_id, sender_id, content, is_auto_reply)
    values (p_room, p_sender,
            jsonb_build_object('type', 'text', 'text', p_text)::text, true);
    perform set_config('are.auto_reply', 'off', true);
exception when others then
    perform set_config('are.auto_reply', 'off', true);
    raise warning 'seg_bot_say: %', sqlerrm;
end $$;

-- ---------- 3. 画面・ポリシーから呼ぶ窓口（自分から見た true/false だけ返す） ----------
create or replace function public.seg_can_see_v1(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select private.seg_pair_ok((select auth.uid()), p_other, true)
$$;
create or replace function public.seg_can_see_post_v1(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select private.seg_pair_ok((select auth.uid()), p_other, false)
$$;
revoke all on function public.seg_can_see_v1(uuid), public.seg_can_see_post_v1(uuid) from public, anon;
grant execute on function public.seg_can_see_v1(uuid), public.seg_can_see_post_v1(uuid) to authenticated;

-- 自分の画面の出し分け（区分の名前そのものは返さない）
create or replace function public.my_ui_flags() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_adm boolean; v_seg text; v_room uuid;
begin
    if v_me is null then raise exception 'authentication_required'; end if;
    v_adm := private.is_admin_user(v_me);
    v_seg := private.seg_of(v_me);
    select r.room_id into v_room from private.segment_rooms r where r.segment = v_seg;
    return jsonb_build_object(
        'is_admin',   v_adm,
        'show_users', v_adm or v_seg in ('work','friend'),
        'show_posts', v_adm or v_seg in ('work','friend'),
        'restricted', (not v_adm) and v_seg = 'home',
        'request_room', v_room);
end $$;
revoke all on function public.my_ui_flags() from public, anon;
grant execute on function public.my_ui_flags() to authenticated;

-- ---------- 4. 管理者用 RPC ----------
create or replace function public.admin_list_segments() returns table (user_id uuid, segment text)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    return query select p.id, private.seg_of(p.id) from public.profiles p;
end $$;

create or replace function public.admin_set_segment(p_user uuid, p_segment text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_removed integer := 0; v_room uuid;
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    if p_segment not in ('home','work','friend','other') then raise exception 'invalid_segment'; end if;
    if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user_not_found'; end if;
    if private.seg_special(p_user) then raise exception 'cannot_change_admin'; end if;

    insert into private.user_segments (user_id, segment, updated_at) values (p_user, p_segment, now())
    on conflict (user_id) do update set segment = excluded.segment, updated_at = now();

    -- 承認済みの許可は、区分が変わったらいったん白紙に戻す
    delete from private.segment_links where a = p_user or b = p_user;

    -- 依頼確認チャットを、新しい区分のものに移す
    delete from public.chat_room_members m
     where m.user_id = p_user and m.room_id in (select room_id from private.segment_rooms);
    select room_id into v_room from private.segment_rooms where segment = p_segment;
    if v_room is not null then
        insert into public.chat_room_members (room_id, user_id, last_read_at) values (v_room, p_user, now())
        on conflict do nothing;
    end if;

    -- 家庭になった人は、家庭以外の人がいる部屋・フォローから外す
    if p_segment = 'home' then
        with bad as (
            select m.room_id from public.chat_room_members m
              join public.chat_rooms r on r.id = m.room_id
             where m.user_id = p_user
               and m.room_id not in (select room_id from private.segment_rooms)
               and exists (select 1 from public.chat_room_members o
                            where o.room_id = m.room_id and o.user_id <> p_user
                              and not private.seg_pair_ok(p_user, o.user_id, false))
        ), del as (
            delete from public.chat_room_members m using bad
             where m.user_id = p_user and m.room_id = bad.room_id returning 1
        ) select count(*) into v_removed from del;
    end if;
    delete from public.follows f
     where (f.follower_id = p_user or f.followee_id = p_user)
       and not private.seg_pair_ok(f.follower_id, f.followee_id, false);
    return v_removed;
end $$;

create or replace function public.admin_list_contact_requests() returns table
    (id uuid, requester uuid, requester_name text, target uuid, target_name text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    return query
      select c.id, c.requester, rp.display_name, c.target, tp.display_name, c.status, c.created_at
        from private.contact_requests c
        join public.profiles rp on rp.id = c.requester
        join public.profiles tp on tp.id = c.target
       order by (c.status = 'pending') desc, c.created_at desc limit 200;
end $$;

create or replace function public.admin_decide_contact_request(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c private.contact_requests%rowtype; v_room uuid; v_tname text;
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    select * into c from private.contact_requests where id = p_id and status = 'pending' for update;
    if not found then raise exception 'request_not_found'; end if;
    update private.contact_requests
       set status = case when p_approve then 'approved' else 'denied' end, decided_at = now() where id = p_id;
    if p_approve then
        insert into private.segment_links (a, b, approved_by)
        values (least(c.requester, c.target), greatest(c.requester, c.target), (select auth.uid()))
        on conflict do nothing;
    end if;
    select room_id into v_room from private.segment_rooms where segment = private.seg_of(c.requester);
    select display_name into v_tname from public.profiles where id = c.target;
    if v_room is not null then
        perform private.seg_bot_say(v_room, (select auth.uid()), case when p_approve
            then '管理者が承認しました。' || coalesce(v_tname, 'その方') || 'さんとの個人チャットとゲームが使えます（グループチャット・投稿は使えません）。'
            else '今回は、' || coalesce(v_tname, 'その方') || 'さんとの連絡は見送りになりました。' end);
    end if;
end $$;

create or replace function public.admin_revoke_contact_link(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    delete from private.segment_links where a = least(p_a, p_b) and b = greatest(p_a, p_b);
    delete from public.chat_room_members m
     using public.chat_rooms r
     where r.id = m.room_id and not r.is_group and m.user_id in (p_a, p_b)
       and exists (select 1 from public.chat_room_members o where o.room_id = m.room_id and o.user_id in (p_a, p_b) and o.user_id <> m.user_id)
       and private.seg_of(m.user_id) = 'home';
end $$;

revoke all on function public.admin_list_segments(), public.admin_set_segment(uuid, text),
    public.admin_list_contact_requests(), public.admin_decide_contact_request(uuid, boolean),
    public.admin_revoke_contact_link(uuid, uuid) from public, anon;
grant execute on function public.admin_list_segments(), public.admin_set_segment(uuid, text),
    public.admin_list_contact_requests(), public.admin_decide_contact_request(uuid, boolean),
    public.admin_revoke_contact_link(uuid, uuid) to authenticated;

-- ---------- 5. 利用者の「話したい」申請（家庭 ⇔ 他区分） ----------
create or replace function public.request_contact_v1(p_target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_room uuid; v_mn text; v_tn text;
begin
    if v_me is null then raise exception 'authentication_required'; end if;
    if p_target is null or p_target = v_me then raise exception 'invalid_partner'; end if;
    if not exists (select 1 from public.profiles where id = p_target) then return 'not_found'; end if;
    if private.seg_pair_ok(v_me, p_target, true) then return 'ok'; end if;
    if exists (select 1 from private.contact_requests c
                where c.status = 'pending' and least(c.requester, c.target) = least(v_me, p_target)
                  and greatest(c.requester, c.target) = greatest(v_me, p_target)) then
        return 'pending';
    end if;
    if (select count(*) from private.contact_requests c where c.requester = v_me and c.created_at > now() - interval '1 day') >= 10 then
        raise exception 'rate_limited';
    end if;
    insert into private.contact_requests (requester, target) values (v_me, p_target);
    select room_id into v_room from private.segment_rooms where segment = private.seg_of(v_me);
    select display_name into v_mn from public.profiles where id = v_me;
    select display_name into v_tn from public.profiles where id = p_target;
    if v_room is not null then
        perform private.seg_bot_say(v_room, v_me,
            '【連絡の申請】' || coalesce(v_mn, '利用者') || 'さんが ' || coalesce(v_tn, 'ほかの方') ||
            'さんとの個人チャット・ゲームを希望しています。管理者の承認をお待ちください。');
    end if;
    return 'pending';
end $$;
revoke all on function public.request_contact_v1(uuid) from public, anon;
grant execute on function public.request_contact_v1(uuid) to authenticated;

-- ---------- 6. 既存の関数を差し替え ----------
create or replace function public.create_or_get_direct_room(p_partner_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_me uuid := (select auth.uid()); v_room uuid;
begin
  if v_me is null then raise exception 'authentication_required'; end if;
  if p_partner_id is null or p_partner_id = v_me then raise exception 'invalid_partner'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_partner_id) then raise exception 'partner_not_found'; end if;
  if not private.seg_pair_ok(v_me, p_partner_id, true) then raise exception 'segment_blocked'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(v_me, p_partner_id)::text || ':' || greatest(v_me, p_partner_id)::text, 0));
  select m1.room_id into v_room from public.chat_room_members m1
  join public.chat_room_members m2 on m2.room_id = m1.room_id and m2.user_id = p_partner_id
  join public.chat_rooms r on r.id = m1.room_id and not r.is_group
  where m1.user_id = v_me and (select count(*) from public.chat_room_members x where x.room_id = m1.room_id) = 2
  order by m1.joined_at limit 1;
  if v_room is null then
    insert into public.chat_rooms default values returning id into v_room;
    insert into public.chat_room_members (room_id, user_id) values (v_room, v_me), (v_room, p_partner_id);
  end if;
  return v_room;
end $function$;

create or replace function public.can_view_post(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $function$
    select p_user_id = (select auth.uid()) and exists (
        select 1 from public.posts p
        where p.id = p_post_id and p.deleted_at is null
          and (p.author_id = p_user_id or (
               private.seg_pair_ok(p_user_id, p.author_id, false)
               and (p.visibility = 'public'
                 or (p.visibility = 'followers' and exists (
                    select 1 from public.follows f where f.follower_id = p_user_id and f.followee_id = p.author_id)))))
    );
$function$;

-- 新しいアカウントは「その他」。その区分の依頼確認チャットに入れる
create or replace function private.fix_request_join_v1() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare v_room uuid;
begin
  begin
    insert into private.user_segments (user_id, segment) values (new.id, 'other') on conflict do nothing;
    select r.room_id into v_room from private.segment_rooms r
     where r.segment = private.seg_of(new.id);
    if v_room is not null then
      insert into public.chat_room_members (room_id, user_id, last_read_at) values (v_room, new.id, now())
      on conflict (room_id, user_id) do nothing;
    end if;
  exception when others then
    raise warning 'fix_request_join_v1: %', sqlerrm;   -- 失敗しても、登録そのものは止めない
  end;
  return new;
end $function$;

-- 依頼確認チャットなら、どの区分のものでも ボットが受け付けの返事を返す
create or replace function private.fix_request_ack_v1() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_bot constant uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01';
  v_name text; v_who text;
begin
  begin
    if not exists (select 1 from private.segment_rooms r where r.room_id = new.room_id) then return new; end if;
    if new.sender_id is null or new.sender_id = v_bot or coalesce(new.is_auto_reply, false) then return new; end if;
    select p.display_name into v_name from public.profiles p where p.id = new.sender_id;
    v_who := coalesce(nullif(trim(v_name), ''), 'あなた');
    if exists (select 1 from public.messages x
               where x.room_id = new.room_id and x.sender_id = v_bot and x.created_at > now() - interval '2 minutes'
                 and position((v_who || 'さん、') in x.content) > 0) then
      return new;
    end if;
    perform set_config('are.auto_reply', 'on', true);
    insert into public.messages (room_id, sender_id, content, is_auto_reply)
    values (new.room_id, v_bot,
            jsonb_build_object('type', 'text', 'text', v_who || 'さん、貴重なご意見ありがとうございました。すぐに対応いたします！')::text,
            true);
    perform set_config('are.auto_reply', 'off', true);
  exception when others then
    perform set_config('are.auto_reply', 'off', true);
    raise warning 'fix_request_ack_v1: %', sqlerrm;
  end;
  return new;
end $function$;

-- ---------- 7. 書き込みの門番（トリガー） ----------
create or replace function private.seg_member_guard_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_group boolean; o record;
begin
    if exists (select 1 from private.segment_rooms r where r.room_id = new.room_id) then return new; end if;   -- 依頼確認チャットは対象外
    select r.is_group into v_group from public.chat_rooms r where r.id = new.room_id;
    for o in select user_id from public.chat_room_members where room_id = new.room_id and user_id <> new.user_id loop
        if not private.seg_pair_ok(new.user_id, o.user_id, not coalesce(v_group, false)) then
            raise exception 'segment_blocked' using errcode = 'P0001';
        end if;
    end loop;
    return new;
end $$;
drop trigger if exists chat_room_members_seg_guard on public.chat_room_members;
create trigger chat_room_members_seg_guard before insert on public.chat_room_members
    for each row execute function private.seg_member_guard_v1();

create or replace function private.seg_post_guard_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if private.seg_special(new.author_id) then return new; end if;
    if private.seg_of(new.author_id) in ('home','other') then
        raise exception 'segment_blocked' using errcode = 'P0001';
    end if;
    return new;
end $$;
drop trigger if exists posts_seg_guard on public.posts;
create trigger posts_seg_guard before insert on public.posts
    for each row execute function private.seg_post_guard_v1();

create or replace function private.seg_follow_guard_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if not private.seg_pair_ok(new.follower_id, new.followee_id, false) then
        raise exception 'segment_blocked' using errcode = 'P0001';
    end if;
    return new;
end $$;
drop trigger if exists follows_seg_guard on public.follows;
create trigger follows_seg_guard before insert on public.follows
    for each row execute function private.seg_follow_guard_v1();

-- ---------- 8. プロフィールの見え方（家庭は家庭だけ） ----------
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists profiles_visible_seg_v1 on public.profiles;
create policy profiles_visible_seg_v1 on public.profiles for select to authenticated
    using (id = (select auth.uid()) or public.seg_can_see_v1(id));

-- ---------- 9. 初期データ ----------
-- 既存ユーザー：ゲスト＝その他、それ以外＝友人（今までの見え方のまま）。管理者が後から画面で変更
insert into private.user_segments (user_id, segment)
select p.id, case when private.is_guest_user(p.id) then 'other' else 'friend' end
  from public.profiles p
 where not private.seg_special(p.id)
on conflict do nothing;

-- 区分ごとの「依頼確認チャット」（名前は全部おなじ）
insert into public.chat_rooms (id, is_group, name, created_by) values
    ('7f1c0de0-5a1e-4f1c-8f1c-0000000f1c11', true, '依頼確認チャット', null),
    ('7f1c0de0-5a1e-4f1c-8f1c-0000000f1c12', true, '依頼確認チャット', null),
    ('7f1c0de0-5a1e-4f1c-8f1c-0000000f1c14', true, '依頼確認チャット', null)
on conflict (id) do nothing;
update public.chat_rooms set name = '依頼確認チャット' where id = '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02';

insert into private.segment_rooms (segment, room_id) values
    ('home',   '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c11'),
    ('work',   '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c12'),
    ('friend', '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02'),
    ('other',  '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c14')
on conflict (segment) do nothing;

-- 管理者とボットは 4 つ全部に入る
insert into public.chat_room_members (room_id, user_id, last_read_at)
select r.room_id, u.id, now()
  from private.segment_rooms r
  cross join (select id from public.profiles where private.seg_special(id)) u
on conflict do nothing;

-- 一般ユーザーは自分の区分の部屋だけ（ゲストは 友人の部屋 → その他の部屋 へ移す）
delete from public.chat_room_members m
 using private.segment_rooms r
 where m.room_id = r.room_id and not private.seg_special(m.user_id)
   and r.segment <> private.seg_of(m.user_id);
insert into public.chat_room_members (room_id, user_id, last_read_at)
select r.room_id, s.user_id, now()
  from private.user_segments s join private.segment_rooms r on r.segment = s.segment
on conflict do nothing;

commit;
