-- 管理者の表示名：ふだんは「主人公」。「社員」の区分の人にだけ「坂井さん」と見せる（admin_alias_v1。本番に適用ずみ）
-- ・管理者の名前（profiles.display_name）は「主人公」。トリガーも、空・「坂井さん」・「主人公」のときは「主人公」にそろえる
-- ・my_ui_flags() に admin_alias を足す：社員の区分の人にだけ {name:'坂井さん', ids:[管理者の番号]}、それ以外は null
--   → 画面（profileDisplayName）が、社員の人にだけ 管理者の名前を「坂井さん」と表示する
create or replace function private.admin_default_name_v1()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if private.is_admin_user(new.id) and coalesce(nullif(btrim(new.display_name), ''), '主人公') in ('主人公', '坂井さん') then
    new.display_name := '主人公';
  end if;
  return new;
end $function$;

update public.profiles set display_name = '主人公' where private.is_admin_user(id) and display_name = '坂井さん';

create or replace function public.my_ui_flags()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
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
        'quick', case when v_adm then null when v_seg = 'home' then 'q1' when v_seg = 'work' then 'q2' when v_seg = 'friend' then 'q3' else 'q4' end,
        'admin_alias', case when (not v_adm) and v_seg = 'work'
                            then (select jsonb_build_object('name', '坂井さん', 'ids', coalesce(jsonb_agg(p.id), '[]'::jsonb)) from public.profiles p where private.is_admin_user(p.id))
                            else null end);
end $function$;
