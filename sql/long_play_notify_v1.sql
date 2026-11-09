-- チャット内ゲームの「長時間プレイ」見張り（2026-11-09）
-- ・チャット内の対戦ゲームが「始まってから 60分以上たち、まだ続いている」ものを見つける関数
-- ・同じゲームを 2回 通知しないための記録テーブル
-- 通知（メール）は、定期の見張り（スケジュールタスク）が この関数を 1時間ごとに呼んで送る。
-- データの削除・変更はしない（追加だけ）。

create table if not exists private.long_play_notified_v1 (
  gid         text primary key,
  notified_at timestamptz not null default now()
);
alter table private.long_play_notified_v1 enable row level security;   -- 方針なし＝API からは見えない

create or replace function private.safe_jsonb_v1(p text) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin return p::jsonb; exception when others then return null; end $$;

-- 「始まって p_minutes 分以上」＋「最後の動きが p_idle 分以内（＝いまも続いている）」＋「終了(resign/end)が出ていない」＋「まだ通知していない」
create or replace function private.long_play_due_v1(p_minutes int default 60, p_idle int default 30)
returns table (gid text, game text, room_name text, is_group boolean, started_at timestamptz, last_at timestamptz, minutes int, players text)
language sql stable security definer set search_path = '' as $$
  with g as (
    select m.id, m.room_id, m.sender_id, m.created_at, j->>'gid' as gid, j->>'game' as game, j->>'kind' as kind
    from public.messages m
    cross join lateral (select private.safe_jsonb_v1(m.content) as j) x
    where m.deleted_at is null
      and m.created_at > now() - interval '12 hours'
      and left(m.content, 14) = '{"type":"game"'
      and j->>'gid' is not null
  ), s as (
    select gid,
           (array_agg(game order by created_at))[1] as game,
           (array_agg(room_id order by created_at))[1] as room_id,
           min(created_at) filter (where kind = 'start') as started_at,
           max(created_at) as last_at,
           bool_or(kind in ('resign','end')) as ended,
           array_agg(distinct sender_id) as senders
    from g group by gid
  )
  select s.gid, s.game,
         (select r.name from public.chat_rooms r where r.id = s.room_id and r.is_group),
         coalesce((select r.is_group from public.chat_rooms r where r.id = s.room_id), false),
         s.started_at, s.last_at,
         (extract(epoch from (now() - s.started_at)) / 60)::int,
         (select string_agg(coalesce(p.display_name, '？'), '・') from public.profiles p where p.id = any(s.senders))
  from s
  where s.started_at is not null
    and not s.ended
    and s.started_at <= now() - make_interval(mins => p_minutes)
    and s.last_at >= now() - make_interval(mins => p_idle)
    and not exists (select 1 from private.long_play_notified_v1 n where n.gid = s.gid)
  order by s.started_at
$$;
revoke all on function private.long_play_due_v1(int, int) from public, anon, authenticated;
revoke all on function private.safe_jsonb_v1(text) from public, anon, authenticated;
