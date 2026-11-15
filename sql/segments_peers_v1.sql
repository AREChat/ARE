-- =====================================================================
-- segments_peers_v1.sql  「おすすめのユーザー」＝同じグループのユーザー（社員は社員、友人は友人）
--  ※ 先に segments_v1.sql を実行しておくこと。何度実行しても同じ結果（再実行OK）
--  ・返すのは「自分と同じグループの人の ID」だけ（グループの名前は返さない）
--  ・家庭・その他の人、管理者には空を返す（家庭・その他はユーザータブがないため）
--  ・最近オンラインだった人を上に、最大 20 人
-- =====================================================================
begin;
create or replace function public.my_segment_peers_v1() returns table (user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_seg text;
begin
    if v_me is null then raise exception 'authentication_required'; end if;
    if private.is_admin_user(v_me) then return; end if;
    v_seg := private.seg_of(v_me);
    if v_seg not in ('work','friend') then return; end if;
    return query
      select s.user_id
        from private.user_segments s
        join public.profiles p on p.id = s.user_id
       where s.segment = v_seg and s.user_id <> v_me and not private.seg_special(s.user_id)
       order by p.last_seen_at desc nulls last, p.display_name
       limit 20;
end $$;
revoke all on function public.my_segment_peers_v1() from public, anon;
grant execute on function public.my_segment_peers_v1() to authenticated;
commit;
