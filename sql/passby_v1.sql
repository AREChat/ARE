-- =====================================================================
-- passby_v1.sql  すれ違いタウン（近くにいた人と、自動で「すれ違い」になる機能）
--
--  ・位置は「ざっくりの区画」を、端末で暗号のような文字（ハッシュ）にして送る。正確な場所は、サーバーに来ない・保存しない
--  ・区画の記録（passby_pings）は、最新の1件だけ。20分たつと すれ違いに使われず、2時間たつと 消える
--  ・すれ違いの記録（passby_encounters）には、場所を入れない（相手・回数・日時・もらったかけら だけ）
--  ・初期値は「オン」「知らない人ともOK」。ただし、位置の許可は 端末のブラウザが 聞く（アプリからは飛ばせない）
--  ・ゲスト（お試し）・管理者・ボットとは、すれ違わない。ブロック／ミュートした人（された人）とも すれ違わない
--  ・区分（家庭 ⇔ 家庭以外）の分離は、そのまま守る（private.seg_pair_ok）
--  ・ひとこと・気分は、決まった一覧から選ぶだけ（自由に書けない＝悪用されない）
--  ・かけらパズル：すれ違うたびに 1つもらえる（6まい × 9かけら）。1まい そろえると ポイント
--  ・何度実行しても同じ結果になる（再実行OK）
--  実行場所：Supabase ダッシュボード > SQL Editor に全文を貼って Run
-- =====================================================================
begin;

-- ---------- 1. テーブル（private：画面から直接は読めない） ----------
create table if not exists private.passby_settings (
    user_id     uuid primary key references public.profiles(id) on delete cascade,
    enabled     boolean not null default true,
    scope       text    not null default 'everyone' check (scope in ('friends','everyone')),
    greeting_id smallint not null default 0 check (greeting_id between 0 and 23),
    mood_id     smallint not null default 0 check (mood_id between 0 and 11),
    updated_at  timestamptz not null default now()
);

create table if not exists private.passby_pings (            -- 最新の区画（ハッシュ）1件だけ。数十分で意味がなくなる
    user_id uuid primary key references public.profiles(id) on delete cascade,
    cells   text[] not null,
    seen_at timestamptz not null default now()
);
create index if not exists passby_pings_seen_idx  on private.passby_pings (seen_at);
create index if not exists passby_pings_cells_gin on private.passby_pings using gin (cells);

create table if not exists private.passby_encounters (        -- 自分の側の記録（相手ごとに1行）。場所は入れない
    owner      uuid not null references public.profiles(id) on delete cascade,
    other      uuid not null references public.profiles(id) on delete cascade,
    first_at   timestamptz not null default now(),
    last_at    timestamptz not null default now(),
    count      integer not null default 1,
    kind       text not null default 'area' check (kind in ('area','qr')),
    seen       boolean not null default false,
    last_piece smallint,
    primary key (owner, other),
    check (owner <> other)
);
create index if not exists passby_enc_owner_last_idx on private.passby_encounters (owner, last_at desc);

create table if not exists private.passby_daily (             -- 1日ごとの数（上限・れんぞく日数に使う）
    owner      uuid not null references public.profiles(id) on delete cascade,
    day        date not null,
    meets      integer not null default 0,
    new_people integer not null default 0,
    primary key (owner, day)
);

create table if not exists private.passby_pieces (            -- もらったかけら（0〜53。9つで1まい）
    owner    uuid not null references public.profiles(id) on delete cascade,
    piece    smallint not null check (piece between 0 and 53),
    n        integer not null default 1,
    first_at timestamptz not null default now(),
    primary key (owner, piece)
);

create table if not exists private.passby_claims (            -- ポイントをもらった記録（1まいにつき1回）
    owner      uuid not null references public.profiles(id) on delete cascade,
    key        text not null,
    claimed_at timestamptz not null default now(),
    primary key (owner, key)
);

create table if not exists private.passby_codes (             -- かざし合いのコード（3分だけ有効）
    code       text primary key,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    expires_at timestamptz not null
);
create index if not exists passby_codes_user_idx on private.passby_codes (user_id);

alter table private.passby_settings   enable row level security;
alter table private.passby_pings      enable row level security;
alter table private.passby_encounters enable row level security;
alter table private.passby_daily      enable row level security;
alter table private.passby_pieces     enable row level security;
alter table private.passby_claims     enable row level security;
alter table private.passby_codes      enable row level security;
revoke all on private.passby_settings, private.passby_pings, private.passby_encounters, private.passby_daily,
              private.passby_pieces, private.passby_claims, private.passby_codes from anon, authenticated;

-- ---------- 2. 判定の部品（private） ----------
-- 相手の「ひとこと・気分」つきのカード（名前・アイコンは、いまのプロフィールから）
create or replace function private.passby_card_v1(p_other uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url,
        'greeting_id', coalesce(s.greeting_id, 0), 'mood_id', coalesce(s.mood_id, 0))
      from public.profiles p
      left join private.passby_settings s on s.user_id = p.id
     where p.id = p_other
$$;

-- 2人がすれ違ってよいか。p_ignore_scope=true は「かざし合い」（お互いに自分で出した・読んだので、相手の範囲設定は見ない）
create or replace function private.passby_pair_ok_v1(p_me uuid, p_other uuid, p_my_scope text, p_ignore_scope boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_their private.passby_settings%rowtype; v_friend boolean;
begin
    if p_me is null or p_other is null or p_me = p_other then return false; end if;
    if private.is_guest_user(p_other) or private.seg_special(p_other) or private.seg_special(p_me) then return false; end if;
    if not exists (select 1 from public.profiles where id = p_other) then return false; end if;
    select * into v_their from private.passby_settings where user_id = p_other;
    if found and not v_their.enabled then return false; end if;
    if exists (select 1 from public.user_blocks b
                where (b.user_id = p_me and b.target_id = p_other) or (b.user_id = p_other and b.target_id = p_me)) then return false; end if;
    if not private.seg_pair_ok(p_me, p_other, false) then return false; end if;
    if p_ignore_scope then return true; end if;
    v_friend := exists (select 1 from public.follows f
                         where (f.follower_id = p_me and f.followee_id = p_other) or (f.follower_id = p_other and f.followee_id = p_me));
    if v_friend then return true; end if;
    return coalesce(p_my_scope, 'everyone') = 'everyone' and coalesce(v_their.scope, 'everyone') = 'everyone';
end $$;

-- 1回のすれ違いを、両方の記録に入れる。回数の上限・同じ相手の間隔（p_cool）にかかったら null
create or replace function private.passby_record_v1(p_a uuid, p_b uuid, p_kind text, p_cool interval)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_today date := private.jst_today();
    v_row private.passby_encounters%rowtype;
    v_first_a boolean; v_first_b boolean;
    v_pa smallint; v_pb smallint;
    v_na integer; v_nb integer;
begin
    select coalesce(max(meets), 0) into v_na from private.passby_daily where owner = p_a and day = v_today;
    select coalesce(max(meets), 0) into v_nb from private.passby_daily where owner = p_b and day = v_today;
    if v_na >= 80 or v_nb >= 80 then return null; end if;           -- 1日80回まで（ふやしすぎ対策）

    select * into v_row from private.passby_encounters where owner = p_a and other = p_b;
    v_first_a := not found;
    if found and v_row.last_at > now() - p_cool then return null; end if;
    perform 1 from private.passby_encounters where owner = p_b and other = p_a;
    v_first_b := not found;

    v_pa := floor(random() * 54)::smallint;
    v_pb := floor(random() * 54)::smallint;

    insert into private.passby_encounters (owner, other, first_at, last_at, count, kind, seen, last_piece)
    values (p_a, p_b, now(), now(), 1, p_kind, false, v_pa)
    on conflict (owner, other) do update
       set last_at = now(), count = private.passby_encounters.count + 1, kind = excluded.kind, seen = false, last_piece = excluded.last_piece;
    insert into private.passby_encounters (owner, other, first_at, last_at, count, kind, seen, last_piece)
    values (p_b, p_a, now(), now(), 1, p_kind, false, v_pb)
    on conflict (owner, other) do update
       set last_at = now(), count = private.passby_encounters.count + 1, kind = excluded.kind, seen = false, last_piece = excluded.last_piece;

    insert into private.passby_pieces (owner, piece, n) values (p_a, v_pa, 1)
    on conflict (owner, piece) do update set n = private.passby_pieces.n + 1;
    insert into private.passby_pieces (owner, piece, n) values (p_b, v_pb, 1)
    on conflict (owner, piece) do update set n = private.passby_pieces.n + 1;

    insert into private.passby_daily (owner, day, meets, new_people) values (p_a, v_today, 1, case when v_first_a then 1 else 0 end)
    on conflict (owner, day) do update set meets = private.passby_daily.meets + 1,
        new_people = private.passby_daily.new_people + (case when v_first_a then 1 else 0 end);
    insert into private.passby_daily (owner, day, meets, new_people) values (p_b, v_today, 1, case when v_first_b then 1 else 0 end)
    on conflict (owner, day) do update set meets = private.passby_daily.meets + 1,
        new_people = private.passby_daily.new_people + (case when v_first_b then 1 else 0 end);

    perform private.award(p_a, case when v_first_a then 3 else 1 end, 'passby', 30);   -- 1日 30ポイントまで
    perform private.award(p_b, case when v_first_b then 3 else 1 end, 'passby', 30);

    return jsonb_build_object('first', v_first_a, 'piece', v_pa);
end $$;

revoke all on function private.passby_card_v1(uuid), private.passby_pair_ok_v1(uuid, uuid, text, boolean),
                       private.passby_record_v1(uuid, uuid, text, interval) from public, anon, authenticated;

-- ---------- 3. 画面から呼ぶ窓口（public） ----------
-- 設定を読む。まだ行がなければ「オン・知らない人もOK」の初期値を返す。あわせて、まだ見ていないすれ違いの数も返す
create or replace function public.passby_settings_get_v1() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); s private.passby_settings%rowtype; v_unseen integer;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    select * into s from private.passby_settings where user_id = me;
    select count(*) into v_unseen from private.passby_encounters where owner = me and not seen;
    return jsonb_build_object('ok', true,
        'enabled', coalesce(s.enabled, true), 'scope', coalesce(s.scope, 'everyone'),
        'greeting_id', coalesce(s.greeting_id, 0), 'mood_id', coalesce(s.mood_id, 0),
        'unseen', v_unseen);
end $$;

create or replace function public.passby_settings_set_v1(p_enabled boolean, p_scope text, p_greeting integer, p_mood integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    if p_scope not in ('friends', 'everyone') or p_greeting not between 0 and 23 or p_mood not between 0 and 11 or p_enabled is null then
        return jsonb_build_object('ok', false, 'error', 'bad_value');
    end if;
    insert into private.passby_settings (user_id, enabled, scope, greeting_id, mood_id, updated_at)
    values (me, p_enabled, p_scope, p_greeting::smallint, p_mood::smallint, now())
    on conflict (user_id) do update
       set enabled = excluded.enabled, scope = excluded.scope, greeting_id = excluded.greeting_id, mood_id = excluded.mood_id, updated_at = now();
    if not p_enabled then
        delete from private.passby_pings where user_id = me;          -- オフにしたら、すぐ区画の記録を消す
        delete from private.passby_codes where user_id = me;
    end if;
    return jsonb_build_object('ok', true);
end $$;

-- 位置（ざっくりの区画のハッシュ 1〜4個）を知らせる。同じ区画に 20分以内にいた人がいれば、すれ違いになる
create or replace function public.passby_ping_v1(p_cells text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    me uuid := (select auth.uid());
    s private.passby_settings%rowtype;
    v_prev timestamptz; v_out jsonb := '[]'::jsonb; v_rec jsonb; r record; c text; v_today record;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    if p_cells is null or cardinality(p_cells) < 1 or cardinality(p_cells) > 4 then return jsonb_build_object('ok', false, 'error', 'bad_cells'); end if;
    foreach c in array p_cells loop
        if c is null or c !~ '^[0-9a-f]{16}$' then return jsonb_build_object('ok', false, 'error', 'bad_cells'); end if;
    end loop;

    select * into s from private.passby_settings where user_id = me;
    if found and not s.enabled then
        delete from private.passby_pings where user_id = me;
        return jsonb_build_object('ok', true, 'enabled', false, 'new', '[]'::jsonb);
    end if;

    select seen_at into v_prev from private.passby_pings where user_id = me;
    if v_prev is not null and v_prev > now() - interval '20 seconds' then
        return jsonb_build_object('ok', true, 'throttled', true, 'new', '[]'::jsonb);   -- 20秒に1回まで
    end if;
    insert into private.passby_pings (user_id, cells, seen_at) values (me, p_cells, now())
    on conflict (user_id) do update set cells = excluded.cells, seen_at = excluded.seen_at;
    delete from private.passby_pings where seen_at < now() - interval '2 hours';          -- 古い区画の記録は、ここで掃除

    for r in
        select pg.user_id as other from private.passby_pings pg
         where pg.user_id <> me and pg.seen_at > now() - interval '20 minutes' and pg.cells && p_cells
         order by pg.seen_at desc limit 30
    loop
        if not private.passby_pair_ok_v1(me, r.other, coalesce(s.scope, 'everyone'), false) then continue; end if;
        v_rec := private.passby_record_v1(me, r.other, 'area', interval '60 minutes');
        if v_rec is null then continue; end if;
        v_out := v_out || jsonb_build_array(private.passby_card_v1(r.other) || v_rec);
    end loop;

    select meets, new_people into v_today from private.passby_daily where owner = me and day = private.jst_today();
    return jsonb_build_object('ok', true, 'new', v_out,
        'today', jsonb_build_object('meets', coalesce(v_today.meets, 0), 'new_people', coalesce(v_today.new_people, 0)));
end $$;

-- すれ違った人の一覧（新しい順）
create or replace function public.passby_inbox_v1(p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); v_lim integer := greatest(1, least(coalesce(p_limit, 60), 200));
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return '[]'::jsonb; end if;
    return coalesce((
        select jsonb_agg(t.x order by t.last_at desc)
          from (
            select e.last_at,
                   private.passby_card_v1(e.other) || jsonb_build_object(
                       'first_at', e.first_at, 'last_at', e.last_at, 'count', e.count, 'seen', e.seen, 'kind', e.kind, 'piece', e.last_piece,
                       'friend', exists (select 1 from public.follows f where (f.follower_id = me and f.followee_id = e.other) or (f.follower_id = e.other and f.followee_id = me))) as x
              from private.passby_encounters e
             where e.owner = me
               and not exists (select 1 from public.user_blocks b where (b.user_id = me and b.target_id = e.other) or (b.user_id = e.other and b.target_id = me))
               and private.seg_pair_ok(me, e.other, false)
               and exists (select 1 from public.profiles p where p.id = e.other)
             order by e.last_at desc limit v_lim
          ) t), '[]'::jsonb);
end $$;

create or replace function public.passby_mark_seen_v1(p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
    if me is null then raise exception 'authentication_required'; end if;
    update private.passby_encounters set seen = true where owner = me and not seen and (p_ids is null or other = any (p_ids));
    return jsonb_build_object('ok', true);
end $$;

-- 数・れんぞく日数・もっているかけら・ポイントをもらったかけらの組
create or replace function public.passby_stats_v1() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    me uuid := (select auth.uid()); v_today date := private.jst_today();
    v_unique integer; v_meets bigint; v_streak integer := 0; v_d date; v_t record;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    select count(*), coalesce(sum(count), 0) into v_unique, v_meets from private.passby_encounters where owner = me;
    select meets, new_people into v_t from private.passby_daily where owner = me and day = v_today;
    v_d := case when exists (select 1 from private.passby_daily where owner = me and day = v_today and meets > 0) then v_today else v_today - 1 end;
    while exists (select 1 from private.passby_daily where owner = me and day = v_d and meets > 0) and v_streak < 400 loop
        v_streak := v_streak + 1; v_d := v_d - 1;
    end loop;
    return jsonb_build_object('ok', true,
        'unique', v_unique, 'meets', v_meets, 'streak', v_streak,
        'today_meets', coalesce(v_t.meets, 0), 'today_new', coalesce(v_t.new_people, 0),
        'pieces', coalesce((select jsonb_agg(jsonb_build_object('piece', pc.piece, 'n', pc.n) order by pc.piece) from private.passby_pieces pc where pc.owner = me), '[]'::jsonb),
        'claims', coalesce((select jsonb_agg(cl.key order by cl.key) from private.passby_claims cl where cl.owner = me), '[]'::jsonb));
end $$;

-- 1まい（9かけら）そろえたらポイント（1まいにつき1回）
create or replace function public.passby_claim_set_v1(p_set integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); v_have integer; v_gain integer;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    if p_set is null or p_set not between 0 and 5 then return jsonb_build_object('ok', false, 'error', 'bad_value'); end if;
    select count(*) into v_have from private.passby_pieces where owner = me and piece between p_set * 9 and p_set * 9 + 8;
    if v_have < 9 then return jsonb_build_object('ok', false, 'error', 'not_complete'); end if;
    insert into private.passby_claims (owner, key) values (me, 'set:' || p_set) on conflict do nothing;
    if not found then return jsonb_build_object('ok', false, 'error', 'already'); end if;
    v_gain := private.award(me, 40, 'passby_set');
    return jsonb_build_object('ok', true, 'gained', v_gain);
end $$;

-- かざし合いのコードを作る（3分だけ有効）
create or replace function public.passby_make_code_v1() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    me uuid := (select auth.uid()); s private.passby_settings%rowtype;
    v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_code text; v_try integer := 0; i integer;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    select * into s from private.passby_settings where user_id = me;
    if found and not s.enabled then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;
    delete from private.passby_codes where user_id = me or expires_at < now();
    loop
        v_code := '';
        for i in 1..8 loop v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::integer, 1); end loop;
        begin
            insert into private.passby_codes (code, user_id, expires_at) values (v_code, me, now() + interval '3 minutes');
            exit;
        exception when unique_violation then
            v_try := v_try + 1; if v_try > 5 then raise; end if;
        end;
    end loop;
    return jsonb_build_object('ok', true, 'code', v_code, 'seconds', 180);
end $$;

-- 相手のコードを読んで、すぐすれ違いになる
create or replace function public.passby_scan_v1(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); v_code text; v_other uuid; v_rec jsonb;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    v_code := upper(regexp_replace(coalesce(p_code, ''), '^\s*ARE-PB:', '', 'i'));
    v_code := regexp_replace(v_code, '[\s-]', '', 'g');
    if v_code !~ '^[A-Z0-9]{8}$' then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
    select user_id into v_other from private.passby_codes where code = v_code and expires_at > now();
    if v_other is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
    if v_other = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;
    if not private.passby_pair_ok_v1(me, v_other, 'everyone', true) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    v_rec := private.passby_record_v1(me, v_other, 'qr', interval '5 minutes');
    return jsonb_build_object('ok', true, 'already', v_rec is null,
        'card', private.passby_card_v1(v_other) || coalesce(v_rec, '{}'::jsonb));
end $$;

-- 自分のすれ違いの記録を、すべて消す（相手の側の記録は消えない）。あわせて、すれ違いをオフにする
create or replace function public.passby_delete_my_data_v1() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
    if me is null then raise exception 'authentication_required'; end if;
    delete from private.passby_pings      where user_id = me;
    delete from private.passby_codes      where user_id = me;
    delete from private.passby_encounters where owner = me;
    delete from private.passby_pieces     where owner = me;
    delete from private.passby_claims     where owner = me;
    delete from private.passby_daily      where owner = me;
    insert into private.passby_settings (user_id, enabled) values (me, false)
    on conflict (user_id) do update set enabled = false, updated_at = now();
    return jsonb_build_object('ok', true);
end $$;

revoke all on function public.passby_settings_get_v1(), public.passby_settings_set_v1(boolean, text, integer, integer),
    public.passby_ping_v1(text[]), public.passby_inbox_v1(integer), public.passby_mark_seen_v1(uuid[]), public.passby_stats_v1(),
    public.passby_claim_set_v1(integer), public.passby_make_code_v1(), public.passby_scan_v1(text), public.passby_delete_my_data_v1()
    from public, anon;
grant execute on function public.passby_settings_get_v1(), public.passby_settings_set_v1(boolean, text, integer, integer),
    public.passby_ping_v1(text[]), public.passby_inbox_v1(integer), public.passby_mark_seen_v1(uuid[]), public.passby_stats_v1(),
    public.passby_claim_set_v1(integer), public.passby_make_code_v1(), public.passby_scan_v1(text), public.passby_delete_my_data_v1()
    to authenticated;

commit;
