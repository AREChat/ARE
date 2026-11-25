-- report_identity_v1.sql
-- 「利用時間レポート」用。GAS（gas/file-storage.gs の action=usage）が、ログインした本人の
--   ・表示名  ・区分（home 家庭 / work 社員 / friend 友人 / other その他）  ・管理者か  ・お試し（ゲスト）か
-- を、本人のログイン（JWT）で1回だけ聞くための関数。返すのは「呼んだ本人」の分だけ（他人の分は返さない）。
-- 区分の名前そのものは、管理者以外の画面には出ません（GAS の中でだけ使い、本名/匿名の出し分けに使う）。
-- Supabase には migration 名 report_identity_v1 として適用する。
create or replace function public.report_identity_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_name text;
begin
  if v_me is null then raise exception 'authentication_required'; end if;
  select p.display_name into v_name from public.profiles p where p.id = v_me;
  return jsonb_build_object(
    'uid',   v_me,
    'name',  coalesce(v_name, ''),
    'seg',   private.seg_of(v_me),
    'admin', private.is_admin_user(v_me),
    'guest', private.is_guest_user(v_me)
  );
end
$function$;

revoke all on function public.report_identity_v1() from public, anon;
grant execute on function public.report_identity_v1() to authenticated;
