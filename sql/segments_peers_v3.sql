-- =====================================================================
-- segments_peers_v3.sql  おすすめ用：同じグループの人を最大300人まで返す（v1は20人まで）
--  ・友達・社員グループの人には、自分と同じグループの人
--  ・管理者には、友達グループと社員グループの全員（家庭・その他の人は含まない）
--  ・家庭・その他の人には空を返す。再実行OK（v1/v2を流していても、これだけ流せばOK）
-- =====================================================================
begin;
create or replace function public.my_segment_peers_v1() returns table (user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_seg text;
begin
    if v_me is null then raise exception 'authentication_required'; end if;
    if private.is_admin_user(v_me) then
      return query
        select s.user_id
          from private.user_segments s
          join public.profiles p on p.id = s.user_id
         where s.segment in ('work','friend') and s.user_id <> v_me and not private.seg_special(s.user_id)
         order by p.last_seen_at desc nulls last, p.display_name
         limit 300;
      return;
    end if;
    v_seg := private.seg_of(v_me);
    if v_seg not in ('work','friend') then return; end if;
    return query
      select s.user_id
        from private.user_segments s
        join public.profiles p on p.id = s.user_id
       where s.segment = v_seg and s.user_id <> v_me and not private.seg_special(s.user_id)
       order by p.last_seen_at desc nulls last, p.display_name
       limit 300;
end $$;
revoke all on function public.my_segment_peers_v1() from public, anon;
grant execute on function public.my_segment_peers_v1() to authenticated;
commit;
