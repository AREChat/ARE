-- 管理者アカウントの表示名（社員などに見える名前）：何も登録されていない／「主人公」のままなら「坂井さん」にする。
-- すでに ほかの名前が登録されていれば、その名前のまま。
create or replace function private.admin_default_name_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if private.is_admin_user(new.id) and coalesce(nullif(btrim(new.display_name), ''), '主人公') = '主人公' then
    new.display_name := '坂井さん';
  end if;
  return new;
end $function$;

drop trigger if exists profiles_admin_default_name on public.profiles;
create trigger profiles_admin_default_name
  before insert or update of display_name on public.profiles
  for each row execute function private.admin_default_name_v1();

-- いま登録されている管理者のうち、「主人公」または空の人を「坂井さん」にする（トリガーが働く）
update public.profiles p set display_name = '坂井さん'
 where private.is_admin_user(p.id) and coalesce(nullif(btrim(p.display_name), ''), '主人公') = '主人公';
