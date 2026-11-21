-- =====================================================================
-- passby_v2_keys.sql  すれ違いタウン：「合いかぎ」（iPhone の「ショートカット」や Android の自動化アプリから、決まった時間に位置を送る）
--
--  ・先に sql/passby_v1.sql を実行してあること（そのあとに実行）
--  ・合いかぎは、画面で作ります（1人に1つ。作りなおすと、古いのは使えなくなる）。サーバーには「合いかぎの暗号（ハッシュ）」だけを保存します
--  ・合いかぎで送れるのは「位置を知らせる」ことだけ。メッセージ・プロフィール・ほかのデータには、さわれません
--  ・この方法だけは、緯度・経度をサーバーが受け取り、その場で「ざっくりの区画」の暗号に変えます（緯度・経度は保存しません・ログにも残しません）
--  ・何度実行しても同じ結果になる（再実行OK）
-- =====================================================================
begin;

-- ---------- 1. 合いかぎ（暗号だけ保存） ----------
create table if not exists private.passby_keys (
    user_id      uuid primary key references public.profiles(id) on delete cascade,
    key_hash     text not null unique,
    created_at   timestamptz not null default now(),
    last_used_at timestamptz,
    uses         integer not null default 0
);
alter table private.passby_keys enable row level security;
revoke all on private.passby_keys from anon, authenticated;

-- ---------- 2. 緯度・経度 → 区画の暗号（画面側 chat-passby.js の pbCells と、まったく同じ計算） ----------
create or replace function private.passby_cells_v1(p_lat double precision, p_lng double precision) returns text[]
language plpgsql stable set search_path = '' as $$
declare
    v_grid constant double precision := 0.003;
    v_m    constant double precision := 0.0007 / 0.003;
    v_day  text := to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD');
    fa double precision := p_lat / v_grid; fo double precision := p_lng / v_grid;
    ia bigint := floor(fa)::bigint; io bigint := floor(fo)::bigint;
    las bigint[] := array[ia]; los bigint[] := array[io];
    la bigint; lo bigint; out text[] := '{}';
begin
    if fa - ia < v_m then las := las || (ia - 1); elsif ia + 1 - fa < v_m then las := las || (ia + 1); end if;
    if fo - io < v_m then los := los || (io - 1); elsif io + 1 - fo < v_m then los := los || (io + 1); end if;
    foreach la in array las loop
        foreach lo in array los loop
            out := out || left(encode(sha256(convert_to('ARE-passby-v1|' || v_day || '|' || la::text || '|' || lo::text, 'UTF8')), 'hex'), 16);
        end loop;
    end loop;
    return out;
end $$;

-- ---------- 3. 「いまここ」の本体（画面から・合いかぎから、同じものを使う） ----------
create or replace function private.passby_ping_core_v1(me uuid, p_cells text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
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
    delete from private.passby_pings where seen_at < now() - interval '2 hours';

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
revoke all on function private.passby_cells_v1(double precision, double precision), private.passby_ping_core_v1(uuid, text[]) from public, anon, authenticated;

create or replace function public.passby_ping_v1(p_cells text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
    if me is null then raise exception 'authentication_required'; end if;
    return private.passby_ping_core_v1(me, p_cells);
end $$;

-- ---------- 4. 合いかぎの発行・確認・無効化（ログイン中の本人だけ） ----------
create or replace function public.passby_key_create_v1() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); v_key text; v_hash text;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    v_key := 'pbk_' || substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 40);
    v_hash := encode(sha256(convert_to(v_key, 'UTF8')), 'hex');
    insert into private.passby_keys (user_id, key_hash) values (me, v_hash)
    on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now(), last_used_at = null, uses = 0;
    return jsonb_build_object('ok', true, 'key', v_key);          -- 合いかぎは、このとき1回だけ見られる（サーバーには暗号しか残らない）
end $$;

create or replace function public.passby_key_status_v1() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); k private.passby_keys%rowtype;
begin
    if me is null then raise exception 'authentication_required'; end if;
    select * into k from private.passby_keys where user_id = me;
    if not found then return jsonb_build_object('ok', true, 'has_key', false); end if;
    return jsonb_build_object('ok', true, 'has_key', true, 'created_at', k.created_at, 'last_used_at', k.last_used_at, 'uses', k.uses);
end $$;

create or replace function public.passby_key_revoke_v1() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
    if me is null then raise exception 'authentication_required'; end if;
    delete from private.passby_keys where user_id = me;
    return jsonb_build_object('ok', true);
end $$;

-- ---------- 5. 合いかぎで「いまここ」を知らせる（ショートカット・自動化アプリから。ログインは要らない・合いかぎだけで本人確認） ----------
--  返すのは「何人とすれ違ったか」の数だけ（名前などは返さない）。合いかぎが合わないときは、理由を細かく教えず bad_key だけ返す。
create or replace function public.passby_key_ping_v1(p_key text, p_lat double precision, p_lng double precision, p_acc double precision default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid; v_res jsonb;
begin
    if p_key is null or p_key !~ '^pbk_[0-9a-f]{40}$' then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
    select user_id into me from private.passby_keys where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
    if me is null then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return jsonb_build_object('ok', false, 'error', 'bad_position'); end if;
    if p_acc is not null and p_acc > 1500 then return jsonb_build_object('ok', false, 'error', 'too_rough'); end if;     -- 位置があらすぎる（IPアドレスだけの推定など）ときは、まちがいのもと
    update private.passby_keys set last_used_at = now(), uses = uses + 1 where user_id = me;
    v_res := private.passby_ping_core_v1(me, private.passby_cells_v1(p_lat, p_lng));
    return jsonb_strip_nulls(jsonb_build_object(
        'ok', coalesce((v_res->>'ok')::boolean, false), 'error', v_res->>'error',
        'matched', coalesce(jsonb_array_length(v_res->'new'), 0),
        'throttled', (v_res->>'throttled')::boolean, 'enabled', (v_res->>'enabled')::boolean));
end $$;

-- ---------- 6. 「ぜんぶ消す」で、合いかぎも消す ----------
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
    delete from private.passby_keys       where user_id = me;
    insert into private.passby_settings (user_id, enabled) values (me, false)
    on conflict (user_id) do update set enabled = false, updated_at = now();
    return jsonb_build_object('ok', true);
end $$;

revoke all on function public.passby_ping_v1(text[]), public.passby_key_create_v1(), public.passby_key_status_v1(), public.passby_key_revoke_v1(),
    public.passby_key_ping_v1(text, double precision, double precision, double precision), public.passby_delete_my_data_v1() from public, anon;
grant execute on function public.passby_ping_v1(text[]), public.passby_key_create_v1(), public.passby_key_status_v1(), public.passby_key_revoke_v1(),
    public.passby_delete_my_data_v1() to authenticated;
grant execute on function public.passby_key_ping_v1(text, double precision, double precision, double precision) to anon, authenticated;

commit;
