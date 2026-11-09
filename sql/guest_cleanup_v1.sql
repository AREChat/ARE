-- お試し（ゲスト）アカウントの自動削除  2026-11-09
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に、持ち主が SQL Editor で1回だけ流す。
-- ・1週間（7日）まったく使われていないゲストを、毎日 日本時間 4:17 に自動で完全削除する
--   （アカウント・プロフィール・ゲストが送ったメッセージ・ゲストと管理者だけの部屋とその中身すべて）
-- ・「使った」とみなすもの：作成した日／最後のログイン／セッションの更新（開いて操作した）／最後に送ったメッセージ。この中で いちばん新しい日から7日。
-- ・消すのは private.guest_accounts にいる人だけ。管理者と ふつうのユーザーは消さない。
-- ・流す前に、下の「ためし：消える予定の人を見る」だけを先に動かすと、消えるゲストの一覧を確認できる（何も消えない）。
-- ・ほかのユーザーが入っている部屋では、ゲスト本人の発言と参加だけを消す（ほかの人の発言は残す）。
-- ・1人ぶんの削除が途中で失敗したら、その人は そのまま残り（巻きもどし）、次の日に また ためす。メッセージは Postgres の warning に出る。

create or replace function private.guest_inactive_v1(p_days integer default 7)
returns table (user_id uuid, last_active timestamptz)
language sql stable security definer set search_path = ''
as $$
  select g.user_id,
         greatest(
           g.created_at,
           coalesce(u.last_sign_in_at, g.created_at),
           coalesce((select max(greatest(s.updated_at, s.refreshed_at)) from auth.sessions s where s.user_id = g.user_id), g.created_at),
           coalesce((select max(m.created_at) from public.messages m where m.sender_id = g.user_id), g.created_at)
         ) as last_active
  from private.guest_accounts g
  join auth.users u on u.id = g.user_id
  where not private.is_admin_user(g.user_id)
    and greatest(
           g.created_at,
           coalesce(u.last_sign_in_at, g.created_at),
           coalesce((select max(greatest(s.updated_at, s.refreshed_at)) from auth.sessions s where s.user_id = g.user_id), g.created_at),
           coalesce((select max(m.created_at) from public.messages m where m.sender_id = g.user_id), g.created_at)
        ) < now() - make_interval(days => greatest(p_days, 1))
$$;

-- ほかの表から p_ids を さしている行を片づける（外部キーが「削除時に何もしない」型のものだけ。cascade の表は自動で消える）
create or replace function private.guest_purge_refs_v1(p_target regclass, p_ids text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  for r in
    select c.conrelid::regclass as rel, a.attname as col, a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = p_target and cardinality(c.conkey) = 1
      and c.confdeltype in ('a', 'r')
  loop
    if r.rel = 'public.messages'::regclass and not r.notnull then
      -- メッセージの「返信先」など、ほかの人のメッセージを消さないよう、さし先だけ はずす
      execute format('update %s set %I = null where %I::text = any($1)', r.rel, r.col, r.col) using p_ids;
    else
      execute format('delete from %s where %I::text = any($1)', r.rel, r.col) using p_ids;
    end if;
  end loop;
end $$;

-- ゲスト1人を完全に消す
create or replace function private.guest_purge_user_v1(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_rooms uuid[]; v_msgs text[];
begin
  if p_user is null or not private.is_guest_user(p_user) or private.is_admin_user(p_user) then return; end if;

  -- 「ゲスト本人と管理者（とゲスト）だけ」の部屋 → 部屋ごと全部消す
  select coalesce(array_agg(m.room_id), '{}') into v_rooms
  from public.chat_room_members m
  where m.user_id = p_user
    and not exists (select 1 from public.chat_room_members o
                    where o.room_id = m.room_id and o.user_id <> p_user
                      and not private.is_admin_user(o.user_id) and not private.is_guest_user(o.user_id));

  -- 消すメッセージ ＝ ゲストが送ったもの ＋ 上の部屋の中のもの（管理者の返信も含む）
  select coalesce(array_agg(x.id::text), '{}') into v_msgs
  from public.messages x where x.sender_id = p_user or x.room_id = any(v_rooms);
  perform private.guest_purge_refs_v1('public.messages'::regclass, v_msgs);
  delete from public.messages x where x.id::text = any(v_msgs);

  perform private.guest_purge_refs_v1('public.chat_rooms'::regclass, (select coalesce(array_agg(r::text), '{}') from unnest(v_rooms) r));
  delete from public.chat_room_members where room_id = any(v_rooms);
  delete from public.chat_rooms where id = any(v_rooms);

  -- ゲスト本人（ほかの部屋への参加・プロフィールなどは cascade で消える。残る分は参照をはずして消す）
  delete from public.chat_room_members where user_id = p_user;
  perform private.guest_purge_refs_v1('public.profiles'::regclass, array[p_user::text]);
  perform private.guest_purge_refs_v1('auth.users'::regclass, array[p_user::text]);
  delete from auth.users where id = p_user;
end $$;

-- 毎日の本体：p_days 日 使われていないゲストを、1人ずつ消す（1人が失敗しても ほかの人は続ける）
create or replace function private.guest_purge_inactive_v1(p_days integer default 7)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare r record; n integer := 0;
begin
  for r in select i.user_id from private.guest_inactive_v1(p_days) i loop
    begin
      perform private.guest_purge_user_v1(r.user_id);
      n := n + 1;
    exception when others then
      raise warning 'guest_purge_failed % : %', r.user_id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

revoke all on function private.guest_inactive_v1(integer) from public, anon, authenticated;
revoke all on function private.guest_purge_refs_v1(regclass, text[]) from public, anon, authenticated;
revoke all on function private.guest_purge_user_v1(uuid) from public, anon, authenticated;
revoke all on function private.guest_purge_inactive_v1(integer) from public, anon, authenticated;

-- 毎日 日本時間 4:17（UTC 19:17）に自動で動かす（pg_cron が入っているとき）
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'guest-purge-v1';
    perform cron.schedule('guest-purge-v1', '17 19 * * *', 'select private.guest_purge_inactive_v1(7)');
  end if;
end $$;

-- ためし：消える予定の人を見る（何も消えない）
--   select * from private.guest_inactive_v1(7) order by last_active;
-- 今すぐ1回動かす（消えるのは 上の一覧の人だけ）
--   select private.guest_purge_inactive_v1(7);
-- 自動実行の登録を確かめる
--   select jobname, schedule, active from cron.job where jobname = 'guest-purge-v1';
-- やめたいとき
--   select cron.unschedule('guest-purge-v1');
