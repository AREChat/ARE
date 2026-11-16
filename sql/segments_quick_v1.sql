-- ショートカットバーの「はじめのショートカット」をグループごとに変えるための追加  2026-11-16
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に、持ち主が SQL Editor で1回だけ流す。
-- ・my_ui_flags() に 'quick' を足します（q1=家庭 q2=社員 q3=友人 q4=その他。グループの名前そのものは返しません）
-- ・自分でショートカットを変えていない人だけ、グループに合ったものが はじめから並びます。管理者は今までどおり。
-- ・ほかの項目（is_admin / show_users / show_posts / restricted / request_room）は 変えていません。
-- ・先に segments_v1.sql が流してあること。
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
        'request_room', v_room,
        'quick', case when v_adm then null when v_seg = 'home' then 'q1' when v_seg = 'work' then 'q2' when v_seg = 'friend' then 'q3' else 'q4' end);
end $$;
revoke all on function public.my_ui_flags() from public, anon;
grant execute on function public.my_ui_flags() to authenticated;
