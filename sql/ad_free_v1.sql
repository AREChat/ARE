-- =====================================================================
-- 広告なしパス：500ポイントで「30日間 広告なし」
-- 作成：2026-11-23（AREDA／Supabase「ARE」プロジェクト）
--
-- 決まり
--   ・広告は 2027年1月1日（日本時間）から、1時間ごとに 15秒の物語紹介映像が出ます
--   ・500ポイントで 30日間 広告が出なくなります（何回でも買えます。買うと その分だけ 後ろに のびます）
--   ・2027年1月1日より前に買った場合は、1月1日から 30日間 になります（もったいなくないように）
--   ・管理者は、いつも広告なしです
--
-- このSQLがすること
--   ① 表 public.ad_free（だれが いつまで 広告なしか）を作る。アプリから直接は見られない／書けない
--   ② public.ad_free_status()  … いま広告なしか、いつまでか
--   ③ public.ad_free_buy()     … 500ポイントを使って 30日ぶん買う（ポイントの履歴にも「ショップで交換」と出る）
--
-- SQL Editor に貼って Run（何回 実行しても、同じ結果になります）
-- =====================================================================

create table if not exists public.ad_free (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  until      timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.ad_free enable row level security;
revoke all on public.ad_free from anon, authenticated;

create or replace function public.ad_free_status()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare uid uuid := (select auth.uid()); adm boolean; u timestamptz;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  adm := private.is_admin_user(uid);
  select until into u from public.ad_free where user_id = uid;
  return jsonb_build_object(
    'free', adm or (u is not null and u > now()),
    'admin', adm,
    'until', u,
    'price', 500,
    'days', 30,
    'start', timestamptz '2027-01-01 00:00:00+09');
end $$;

create or replace function public.ad_free_buy()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare uid uuid := (select auth.uid()); have int; u timestamptz; base timestamptz; nu timestamptz;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if private.is_admin_user(uid) then raise exception 'not_for_points'; end if;
  insert into public.user_points(user_id) values(uid) on conflict do nothing;
  select points into have from public.user_points where user_id = uid for update;
  if have < 500 then raise exception 'not_enough_points'; end if;
  select until into u from public.ad_free where user_id = uid;
  base := greatest(coalesce(u, now()), now(), timestamptz '2027-01-01 00:00:00+09');
  nu := base + interval '30 days';
  update public.user_points set points = points - 500, updated_at = now() where user_id = uid;
  insert into public.point_log(user_id, delta, reason) values(uid, -500, 'shop:adfree');
  insert into public.ad_free(user_id, until) values(uid, nu)
    on conflict (user_id) do update set until = excluded.until, updated_at = now();
  return jsonb_build_object('points', have - 500, 'until', nu);
end $$;

revoke all on function public.ad_free_status() from public, anon;
revoke all on function public.ad_free_buy() from public, anon;
grant execute on function public.ad_free_status() to authenticated;
grant execute on function public.ad_free_buy() to authenticated;

-- 確認用
select 'ok' as result, to_regclass('public.ad_free') as table_name;
