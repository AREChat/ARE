-- すれ違いタウン：ミッション（毎日 3つ＋ずっと続く目標）。ポイントは、サーバーが数を数えなおして確かめてから渡します。
-- ・追加のみ（新しい関数 4つ）。既存のテーブル・関数は変えません／消しません。
-- ・毎日のミッション … 日本時間の日づけごとに 1回ずつ（passby_claims に 'mis:D:日づけ:ID' を記録）
-- ・ずっと続く目標 … 1回だけ。「記録をぜんぶ消す」をしても、ポイント履歴（point_log）で受け取りずみを見分けるので、くり返しは もらえません
-- 実行方法: Supabase の SQL Editor に全文を貼って Run（または apply_migration）。

create or replace function private.passby_streak_v1(p_owner uuid)
returns integer language plpgsql stable security definer set search_path to '' as $$
declare v_today date := private.jst_today(); v_d date; v_streak integer := 0;
begin
    v_d := case when exists (select 1 from private.passby_daily where owner = p_owner and day = v_today and meets > 0) then v_today else v_today - 1 end;
    while exists (select 1 from private.passby_daily where owner = p_owner and day = v_d and meets > 0) and v_streak < 400 loop
        v_streak := v_streak + 1; v_d := v_d - 1;
    end loop;
    return v_streak;
end $$;

-- ミッション 1つぶんの「いまの数・必要な数・ごほうび・毎日かどうか」。IDが ちがうときは null
create or replace function private.passby_mission_progress_v1(p_owner uuid, p_id text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
    v_today date := private.jst_today();
    v_m integer := coalesce((select meets from private.passby_daily where owner = p_owner and day = v_today), 0);
    v_n integer := coalesce((select new_people from private.passby_daily where owner = p_owner and day = v_today), 0);
    v_have integer; v_need integer; v_reward integer; v_daily boolean := false;
begin
    case p_id
        when 'd_meet1' then v_daily := true; v_have := v_m; v_need := 1; v_reward := 5;
        when 'd_meet3' then v_daily := true; v_have := v_m; v_need := 3; v_reward := 10;
        when 'd_new1'  then v_daily := true; v_have := v_n; v_need := 1; v_reward := 10;
        when 'l_u1'   then v_have := (select count(*) from private.passby_encounters where owner = p_owner); v_need := 1;   v_reward := 10;
        when 'l_u5'   then v_have := (select count(*) from private.passby_encounters where owner = p_owner); v_need := 5;   v_reward := 20;
        when 'l_u15'  then v_have := (select count(*) from private.passby_encounters where owner = p_owner); v_need := 15;  v_reward := 40;
        when 'l_u30'  then v_have := (select count(*) from private.passby_encounters where owner = p_owner); v_need := 30;  v_reward := 60;
        when 'l_u60'  then v_have := (select count(*) from private.passby_encounters where owner = p_owner); v_need := 60;  v_reward := 100;
        when 'l_u120' then v_have := (select count(*) from private.passby_encounters where owner = p_owner); v_need := 120; v_reward := 150;
        when 'l_s3'  then v_have := private.passby_streak_v1(p_owner); v_need := 3;  v_reward := 15;
        when 'l_s7'  then v_have := private.passby_streak_v1(p_owner); v_need := 7;  v_reward := 40;
        when 'l_s30' then v_have := private.passby_streak_v1(p_owner); v_need := 30; v_reward := 150;
        when 'l_friend' then
            v_have := (select count(*) from private.passby_encounters e where e.owner = p_owner
                        and exists (select 1 from public.follows f where (f.follower_id = p_owner and f.followee_id = e.other) or (f.follower_id = e.other and f.followee_id = p_owner)));
            v_need := 1; v_reward := 15;
        when 'l_qr'  then v_have := (select count(*) from private.passby_encounters where owner = p_owner and kind = 'qr'); v_need := 1; v_reward := 10;
        when 'l_rep5' then v_have := coalesce((select max(count) from private.passby_encounters where owner = p_owner), 0); v_need := 5; v_reward := 20;
        else return null;
    end case;
    return jsonb_build_object('id', p_id, 'have', least(v_have, 100000), 'need', v_need, 'reward', v_reward, 'daily', v_daily);
end $$;

-- 一覧（いまの数・うけとりずみ）
create or replace function public.passby_missions_v1()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid := (select auth.uid()); v_today date := private.jst_today(); v_ids text[] := array['d_meet1','d_meet3','d_new1','l_u1','l_u5','l_u15','l_u30','l_u60','l_u120','l_s3','l_s7','l_s30','l_friend','l_qr','l_rep5'];
        v_id text; v_p jsonb; v_out jsonb := '[]'::jsonb; v_claimed boolean;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    foreach v_id in array v_ids loop
        v_p := private.passby_mission_progress_v1(me, v_id);
        if (v_p ->> 'daily')::boolean then
            v_claimed := exists (select 1 from private.passby_claims where owner = me and key = 'mis:D:' || v_today::text || ':' || v_id);
        else
            v_claimed := exists (select 1 from private.passby_claims where owner = me and key = 'mis:L:' || v_id)
                      or exists (select 1 from public.point_log where user_id = me and reason = 'passby_mis_' || v_id);
        end if;
        v_out := v_out || (v_p || jsonb_build_object('claimed', v_claimed));
    end loop;
    return jsonb_build_object('ok', true, 'missions', v_out);
end $$;

-- うけとり
create or replace function public.passby_claim_mission_v1(p_id text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare me uuid := (select auth.uid()); v_today date := private.jst_today(); v_p jsonb; v_key text; v_gain integer; v_daily boolean;
begin
    if me is null then raise exception 'authentication_required'; end if;
    if private.is_guest_user(me) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
    v_p := private.passby_mission_progress_v1(me, coalesce(p_id, ''));
    if v_p is null then return jsonb_build_object('ok', false, 'error', 'bad_value'); end if;
    if (v_p ->> 'have')::integer < (v_p ->> 'need')::integer then return jsonb_build_object('ok', false, 'error', 'not_complete'); end if;
    v_daily := (v_p ->> 'daily')::boolean;
    if v_daily then
        v_key := 'mis:D:' || v_today::text || ':' || p_id;
    else
        v_key := 'mis:L:' || p_id;
        if exists (select 1 from public.point_log where user_id = me and reason = 'passby_mis_' || p_id) then return jsonb_build_object('ok', false, 'error', 'already'); end if;
    end if;
    insert into private.passby_claims (owner, key) values (me, v_key) on conflict do nothing;
    if not found then return jsonb_build_object('ok', false, 'error', 'already'); end if;
    v_gain := private.award(me, (v_p ->> 'reward')::integer, case when v_daily then 'passby_mis_daily' else 'passby_mis_' || p_id end);
    return jsonb_build_object('ok', true, 'gained', v_gain);
end $$;

revoke all on function private.passby_streak_v1(uuid) from public, anon, authenticated;
revoke all on function private.passby_mission_progress_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.passby_missions_v1() from public, anon;
revoke all on function public.passby_claim_mission_v1(text) from public, anon;
grant execute on function public.passby_missions_v1() to authenticated;
grant execute on function public.passby_claim_mission_v1(text) to authenticated;
