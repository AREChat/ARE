-- お試し（ゲスト）アカウントを、ログアウトした時点で その場で完全に削除する  2026-11-16
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に、持ち主が SQL Editor で1回だけ流す。
-- ・ログアウトボタンを押した お試しアカウント本人だけが呼べる（管理者・ふつうのユーザーでは何も起きない）
-- ・中身は、7日たったゲストを消す仕組み（guest_cleanup_v1.sql の private.guest_purge_user_v1）と同じ。
--   ゲストが送ったメッセージ、ゲストと管理者だけの部屋とその中身、プロフィール、アカウントをすべて消す。
-- ・先に guest_cleanup_v1.sql が流してあること（流してあれば、そのまま実行してよい）。
create or replace function public.guest_delete_me_v1()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null or not private.is_guest_user(v_me) or private.is_admin_user(v_me) then return false; end if;
  perform private.guest_purge_user_v1(v_me);
  return true;
end $$;
revoke all on function public.guest_delete_me_v1() from public, anon;
grant execute on function public.guest_delete_me_v1() to authenticated;
