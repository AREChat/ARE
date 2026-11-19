-- フォローとチャットの決まり（連絡先を交換するまで、ユーザー同士はチャットできない）  2026-11-14
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流す。何度流しても同じ結果になる（やり直しOK）。
--
-- 【決まり】
--  ・ふつうのユーザー同士（1対1のチャット）は、フォローしないとメッセージを送れない。
--  ・片方がフォローしただけ（承認まち）の間は、フォローした人だけが、お試しで3回まで送れる。
--  ・フォローされた人が「承認」するか、フォローし返して「相互フォロー」になったら、おたがい回数の制限なし。
--  ・フォローを解除すると、またもとの決まりにもどる。
-- 【今までどおり（この決まりの対象にならない）】
--  ・管理者との1対1／お試し（ゲスト）の人が入っている1対1（ゲストは、これまでの「5件まで」の決まり）
--  ・グループ（3人以上）／「修正依頼」の部屋／自動応答のメッセージ
--  ・この SQL を流す前に作られた1対1の部屋（いま続いているチャットは、そのまま続けられる）
-- 【ほかの決まりとの関係】グループ分け（家庭／仕事／友だち）の確認（segment_blocked）は、これまでどおり先に働く。両方を通った人だけが話せる。
-- 【やめたいとき】（すべて元に戻る）  update private.contact_gate_cfg set enabled = false;
-- 【お試しの回数を変えるとき】        update private.contact_gate_cfg set trial_limit = 5;

-- ① 設定の表（1行だけ）。since ＝ この決まりが始まった時刻（これより前に作られた部屋は、いままでどおり）
create table if not exists private.contact_gate_cfg (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  since timestamptz not null default now(),
  trial_limit integer not null default 3 check (trial_limit between 0 and 100)
);
alter table private.contact_gate_cfg enable row level security;
insert into private.contact_gate_cfg (id) values (1) on conflict (id) do nothing;

-- ② follows に「承認した日時」を足す（空 ＝ 承認まち）。いまあるフォローは、そのまま有効（承認ずみ）にする
-- 列を足す1回目のときだけ、いまあるフォローを「承認ずみ」にする（2回目以降に流しても、承認まちを勝手に承認しない）
do $b$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'follows' and column_name = 'approved_at') then
    alter table public.follows add column approved_at timestamptz;
    update public.follows set approved_at = created_at;
  end if;
end $b$;
create index if not exists follows_followee_pending_idx on public.follows (followee_id) where approved_at is null;

-- ③ フォローしたとき：相手もこちらをフォローしていたら、相互フォロー（おたがい承認ずみ）にする。
--    自分で「承認ずみ」にして入れることはできない（かならず空から始まる）
create or replace function private.follows_before_insert_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.approved_at := null;
  if exists (select 1 from public.follows f where f.follower_id = new.followee_id and f.followee_id = new.follower_id) then
    new.approved_at := now();
    update public.follows set approved_at = coalesce(approved_at, now())
     where follower_id = new.followee_id and followee_id = new.follower_id;
  end if;
  return new;
end $$;
drop trigger if exists follows_before_insert_v1 on public.follows;
create trigger follows_before_insert_v1 before insert on public.follows
  for each row execute function private.follows_before_insert_v1();

-- ④ フォローを解除したとき：相手のフォローが「相互だったから承認ずみ」のままにならないよう、承認まちにもどす
create or replace function private.follows_after_delete_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.follows set approved_at = null
   where follower_id = old.followee_id and followee_id = old.follower_id and approved_at is not null;
  return old;
end $$;
drop trigger if exists follows_after_delete_v1 on public.follows;
create trigger follows_after_delete_v1 after delete on public.follows
  for each row execute function private.follows_after_delete_v1();

-- ⑤ 「この2人は、いまチャットできる？」を決める関数（メッセージの保存時と、画面の表示の両方で使う）
--    返す値：{state, ok, error, trial_left, i_follow, they_follow, ...}
--      state：exempt（決まりの対象外）／approved（承認ずみ・相互）／sent（自分がフォロー中・承認まち）／
--             received（相手がフォロー中・自分が承認まち）／none（まだどちらもフォローしていない）
--      error：contact_required／approval_required／trial_exhausted
create or replace function private.contact_rule_v1(p_sender uuid, p_other uuid, p_room uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg private.contact_gate_cfg%rowtype;
  v_room uuid := p_room;
  v_created timestamptz;
  v_out public.follows%rowtype;
  v_in public.follows%rowtype;
  v_sent integer := 0;
  v_left integer;
  v_flags jsonb;
  v_have_cfg boolean;
begin
  select * into cfg from private.contact_gate_cfg where id = 1;
  v_have_cfg := found;
  select * into v_out from public.follows where follower_id = p_sender and followee_id = p_other;
  select * into v_in  from public.follows where follower_id = p_other  and followee_id = p_sender;
  v_flags := jsonb_build_object('i_follow', v_out.follower_id is not null, 'they_follow', v_in.follower_id is not null,
                                'i_follow_approved', v_out.approved_at is not null, 'they_follow_approved', v_in.approved_at is not null);

  if not v_have_cfg or not cfg.enabled or p_sender is null or p_other is null or p_sender = p_other
     or private.is_admin_user(p_sender) or private.is_admin_user(p_other)
     or private.is_guest_user(p_sender) or private.is_guest_user(p_other) then
    return v_flags || jsonb_build_object('state', 'exempt', 'ok', true);
  end if;

  if v_room is null then
    select m1.room_id into v_room
      from public.chat_room_members m1
      join public.chat_room_members m2 on m2.room_id = m1.room_id and m2.user_id = p_other
      join public.chat_rooms r on r.id = m1.room_id and not r.is_group
     where m1.user_id = p_sender
       and (select count(*) from public.chat_room_members x where x.room_id = m1.room_id) = 2
     order by m1.joined_at limit 1;
  end if;
  if v_room is not null then
    select created_at into v_created from public.chat_rooms where id = v_room;
    if v_created < cfg.since then
      return v_flags || jsonb_build_object('state', 'exempt', 'ok', true, 'legacy', true);
    end if;
  end if;

  if v_out.approved_at is not null or v_in.approved_at is not null then
    return v_flags || jsonb_build_object('state', 'approved', 'ok', true);
  end if;

  if v_out.follower_id is not null then
    if v_room is not null then
      select count(*)::integer into v_sent from public.messages where room_id = v_room and sender_id = p_sender;
    end if;
    v_left := greatest(cfg.trial_limit - v_sent, 0);
    return v_flags || jsonb_build_object('state', 'sent', 'ok', v_left > 0, 'trial_left', v_left,
             'error', case when v_left > 0 then null else 'trial_exhausted' end);
  end if;

  if v_in.follower_id is not null then
    return v_flags || jsonb_build_object('state', 'received', 'ok', false, 'error', 'approval_required');
  end if;
  return v_flags || jsonb_build_object('state', 'none', 'ok', false, 'error', 'contact_required');
end $$;

-- ⑥ メッセージを保存する前に、決まりを確かめる（どの経路で送っても、ここを通る）
create or replace function private.contact_gate_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_other uuid; v_cnt integer; v_res jsonb;
begin
  if new.sender_id is null or coalesce(new.is_auto_reply, false) then return new; end if;
  if new.room_id = '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02' then return new; end if;   -- 「修正依頼」の部屋
  if exists (select 1 from public.chat_rooms r where r.id = new.room_id and r.is_group) then return new; end if;
  select count(*)::integer into v_cnt from public.chat_room_members where room_id = new.room_id;
  if v_cnt <> 2 then return new; end if;                                                 -- 1対1のチャットだけが対象
  select user_id into v_other from public.chat_room_members where room_id = new.room_id and user_id <> new.sender_id limit 1;
  if v_other is null then return new; end if;
  v_res := private.contact_rule_v1(new.sender_id, v_other, new.room_id);
  if not (v_res ->> 'ok')::boolean then
    raise exception '%', v_res ->> 'error' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists messages_contact_gate on public.messages;
create trigger messages_contact_gate before insert on public.messages
  for each row execute function private.contact_gate_v1();

-- ⑦ 画面から呼ぶ関数
-- 相手との状態を教える（画面の表示に使う）
create or replace function public.contact_status_v1(p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  return private.contact_rule_v1((select auth.uid()), p_other, null);
end $$;

-- フォローを承認する（フォローされた本人だけ）
create or replace function public.approve_follow_v1(p_follower uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  update public.follows set approved_at = now()
   where follower_id = p_follower and followee_id = (select auth.uid()) and approved_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- フォローを断る（フォローされた本人だけ。相手のフォローが消える）
create or replace function public.decline_follow_v1(p_follower uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  delete from public.follows where follower_id = p_follower and followee_id = (select auth.uid());
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ⑧ 1対1の部屋をつくる関数に、「まだどちらもフォローしていない相手とは、新しい部屋を作れない」を1か所だけ足す。
--    ほかの確認（グループ分けの segment_blocked など）はそのまま残すため、いまの関数を読み取って、その1行だけ差し込む。
--    すでに入っていれば何もしない（やり直しOK）。うまく差し込めないときは、エラーで止まる（何も変わらない）。
do $m$
declare
  src text;
  marker constant text := 'insert into public.chat_rooms default values returning id into v_room;';
begin
  select pg_get_functiondef('public.create_or_get_direct_room(uuid)'::regprocedure) into src;
  if position('contact_required' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 or position('v_room uuid;' in src) = 0 then
    raise exception 'create_or_get_direct_room の中身が想定と違うため、差し込めませんでした（何も変更していません）';
  end if;
  src := replace(src, marker,
    'if (private.contact_rule_v1(v_me, p_partner_id, null) ->> ''state'') = ''none'' then raise exception ''contact_required'' using errcode = ''P0001''; end if;'
    || E'\r\n    ' || marker);
  if position('contact_required' in src) = 0 then
    raise exception '差し込みに失敗しました（何も変更していません）';
  end if;
  execute src;
end $m$;

-- ⑨ 権限：ログインしている人だけが呼べる（ログインしていない人・匿名には出さない）
revoke all on function public.contact_status_v1(uuid) from public, anon;
revoke all on function public.approve_follow_v1(uuid) from public, anon;
revoke all on function public.decline_follow_v1(uuid) from public, anon;
grant execute on function public.contact_status_v1(uuid) to authenticated;
grant execute on function public.approve_follow_v1(uuid) to authenticated;
grant execute on function public.decline_follow_v1(uuid) to authenticated;
