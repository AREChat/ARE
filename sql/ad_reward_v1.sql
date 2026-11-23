-- ===== 広告を見たときのポイント =====
--  最後まで見た（広告が終わって、自動で閉じた）: 1000 ポイント
--  スキップした（はじまって10秒以降に スキップを押した）: 100 ポイント
--  途中で閉じた／ブラウザを強制終了した（「終わった」の連絡がこない）: 0 ポイント
-- ・ごまかし対策：サーバーが「はじまった時刻」を記録し、終わりの連絡までの時間が足りなければ 0 ポイント
--   （最後まで：13秒以上、スキップ：9秒以上）。1つの再生につき 1回だけ。9分以内に 2回もらうことはできない。
-- ・管理者・家庭（ポイントを使わない人）は 0 ポイント。
create table if not exists public.ad_view (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ad_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'started',   -- started / done / skipped / rejected
  paid integer not null default 0
);
create index if not exists ad_view_user_idx on public.ad_view (user_id, started_at desc);
alter table public.ad_view enable row level security;   -- 方針なし＝画面から直接は読み書きできない（下の関数だけが使う）

create or replace function public.ad_view_start(p_ad text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid := (select auth.uid()); v_id uuid;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  -- 古い「はじまっただけ」の記録は 1日たったら消す（たまりすぎ防止）
  delete from public.ad_view where user_id = uid and status = 'started' and started_at < now() - interval '1 day';
  insert into public.ad_view(user_id, ad_id) values (uid, left(coalesce(p_ad, ''), 40)) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.ad_view_finish(p_id uuid, p_kind text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid := (select auth.uid()); r public.ad_view; secs numeric; amt int := 0; need numeric; have int; st text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_kind not in ('done', 'skip') then raise exception 'invalid_kind'; end if;
  select * into r from public.ad_view where id = p_id and user_id = uid for update;
  if not found then return jsonb_build_object('paid', 0, 'reason', 'not_found'); end if;
  if r.status <> 'started' then return jsonb_build_object('paid', 0, 'reason', 'already'); end if;
  secs := extract(epoch from (now() - r.started_at));
  need := case when p_kind = 'done' then 13 else 9 end;
  st := case when p_kind = 'done' then 'done' else 'skipped' end;
  if secs < need then st := 'rejected';
  elsif private.is_admin_user(uid) or private.seg_of(uid) = 'home' then st := 'rejected';          -- ポイントを使わない人
  elsif exists (select 1 from public.ad_view v where v.user_id = uid and v.paid > 0 and v.finished_at > now() - interval '9 minutes') then st := 'rejected';
  else amt := case when p_kind = 'done' then 1000 else 100 end;
  end if;
  update public.ad_view set status = st, paid = amt, finished_at = now() where id = r.id;
  if amt > 0 then
    insert into public.user_points(user_id) values (uid) on conflict do nothing;
    update public.user_points set points = points + amt, updated_at = now() where user_id = uid returning points into have;
    insert into public.point_log(user_id, delta, reason) values (uid, amt, case when p_kind = 'done' then 'ad:watched' else 'ad:skipped' end);
  else
    select points into have from public.user_points where user_id = uid;
  end if;
  return jsonb_build_object('paid', amt, 'points', coalesce(have, 0), 'status', st);
end $function$;

revoke all on function public.ad_view_start(text) from public, anon;
revoke all on function public.ad_view_finish(uuid, text) from public, anon;
grant execute on function public.ad_view_start(text) to authenticated;
grant execute on function public.ad_view_finish(uuid, text) to authenticated;
