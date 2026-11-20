-- 30日たった「送ったファイル」を、チャットから消して、Google ドライブの「ファイル保存フォルダ」に移す（SQL の部分）
--
-- 【実行のしかた】Supabase の SQL Editor に、このファイルを全部貼って Run（本番「ARE」。開発用 ARE-dev があれば、そちらにも）。
--   ・何回実行しても同じ結果になります（今ある記録は消えません）。
--   ・先に edge function「archive-old-files」を入れてから実行してください（Claude が入れます）。
--   ・このファイルだけでは、まだ何も消えません。Google ドライブの用意（docs/file-archive.md）ができるまで、ファイルは今までどおり残ります。
--
-- 【しくみ】
--   1) 毎時 41 分に、edge function が「30日たったファイル」を最大5件ずつ受け取る。
--   2) 1件ずつ、Google ドライブの専用の受け口（GAS）に保存を頼む。
--   3) Google ドライブに保存できたときだけ、チャットのメッセージを「30日たったので移しました」の表示に書きかえ、保存先のファイルを削除する。
--      （保存できなかったときは、何も消さず、あとでやり直す。5回失敗したら、そのファイルは止めて記録に残す）
--   ・対象は、いまは「ファイル」（txt・pdf・zip など）だけです。画像・動画・ボイスは対象外です。
--   ・日数（30）と一度に移す数（5）は、下の cron の body で変えられます。
--
-- 【安全のための決まり】
--   ・送ったとき 保存先に付く パス（部屋のID/送った人のID/…）が、メッセージの部屋・送った人と一致するファイルだけを対象にする
--     （メッセージの中身は送る人が自由に書けるので、他の人のファイルを指すメッセージを作られても、消せないようにするため）。
--   ・関数は、サービス用の鍵（service_role）からだけ呼べる。ふつうのユーザー・ログインしていない人は呼べない。

-- 1) 記録の表（どのメッセージを、いつ、どうしたか。画面には出ません）
create table if not exists private.file_archive_log_v1 (
  message_id   uuid primary key,
  object_path  text not null,
  status       text not null default 'pending' check (status in ('pending','done','failed')),
  attempts     integer not null default 0,
  drive_name   text,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);
alter table private.file_archive_log_v1 enable row level security;   -- 方針（policy）は作らない ＝ 外からは読めない（関数だけが読み書きする）

-- 2) メッセージの中身（文字）を JSON として読む。読めないものは null
create or replace function private.file_archive_json_v1(p_text text)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
begin
  if p_text is null or left(p_text, 1) <> '{' then return null; end if;
  return p_text::jsonb;
exception when others then
  return null;
end $$;

-- 3) 30日たったファイルの一覧（1回に出す数は p_limit まで。やり直しは5回まで）
create or replace function public.file_archive_candidates_v1(p_days integer default 30, p_limit integer default 5, p_types text[] default array['file'])
returns table (message_id uuid, room_id uuid, sender_id uuid, sender_name text, created_at timestamptz,
               object_path text, file_name text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select distinct on (x.object_path)
         m.id, m.room_id, m.sender_id, coalesce(pr.display_name, '')::text, m.created_at,
         x.object_path, coalesce(x.j ->> 'name', '')::text, coalesce(x.j ->> 'mimeType', '')::text,
         case when (x.j ->> 'size') ~ '^[0-9]{1,15}$' then (x.j ->> 'size')::bigint else null end
    from public.messages m
   cross join lateral (select private.file_archive_json_v1(m.content) as j) y
   cross join lateral (select y.j as j, (y.j ->> 'path')::text as object_path) x
    left join public.profiles pr on pr.id = m.sender_id
    left join private.file_archive_log_v1 l on l.message_id = m.id
   where m.deleted_at is null
     and m.content like '%"path"%'
     and m.created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 0))
     and x.j is not null and jsonb_typeof(x.j) = 'object'
     and (x.j ->> 'type') = any (p_types)
     and not (x.j ? 'archived')
     and coalesce(x.object_path, '') <> ''
     and x.object_path like (m.room_id::text || '/' || m.sender_id::text || '/%')   -- 送った人が、その部屋に上げたファイルだけ
     and (l.message_id is null or (l.status <> 'done' and l.attempts < 5))
   order by x.object_path, m.created_at
   limit greatest(least(coalesce(p_limit, 5), 50), 1)
$$;

-- 4) Google ドライブに保存できたあと：同じファイルを指すメッセージ（同じ部屋）を「移しました」の表示に書きかえる
create or replace function public.file_archive_done_v1(p_message uuid, p_drive_name text default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_path text; v_room uuid; v_changed integer := 0; r record;
begin
  select (private.file_archive_json_v1(m.content) ->> 'path'), m.room_id into v_path, v_room from public.messages m where m.id = p_message;
  if v_path is null or v_path = '' then return 0; end if;
  for r in
    select m.id, private.file_archive_json_v1(m.content) as j
      from public.messages m
     where m.room_id = v_room and position(v_path in m.content) > 0
  loop
    if r.j is null or (r.j ->> 'path') is distinct from v_path or (r.j ? 'archived') then continue; end if;
    update public.messages
       set content = ((r.j - 'url' - 'path') || jsonb_build_object('archived', jsonb_build_object('at', now(), 'to', 'drive')))::text
     where id = r.id;
    insert into private.file_archive_log_v1 as l (message_id, object_path, status, attempts, drive_name, archived_at)
    values (r.id, v_path, 'done', 1, left(p_drive_name, 200), now())
    on conflict (message_id) do update set status = 'done', drive_name = excluded.drive_name, last_error = null, archived_at = now(), updated_at = now();
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end $$;

-- 5) 保存に失敗したとき：回数を数える（5回で止める。理由は短く残す。鍵や URL は残さない）
create or replace function public.file_archive_failed_v1(p_message uuid, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_path text;
begin
  select (private.file_archive_json_v1(m.content) ->> 'path') into v_path from public.messages m where m.id = p_message;
  if v_path is null then return; end if;
  insert into private.file_archive_log_v1 as l (message_id, object_path, status, attempts, last_error)
  values (p_message, v_path, 'failed', 1, left(regexp_replace(coalesce(p_error, ''), 'https?://\S+', '(url)', 'g'), 200))
  on conflict (message_id) do update
    set status = case when l.status = 'done' then 'done' else 'failed' end,
        attempts = l.attempts + 1,
        last_error = excluded.last_error,
        updated_at = now();
end $$;

-- 6) 呼べる人を、サービス用の鍵（edge function）だけにする
revoke all on function private.file_archive_json_v1(text) from public, anon, authenticated;
revoke all on function public.file_archive_candidates_v1(integer, integer, text[]) from public, anon, authenticated;
revoke all on function public.file_archive_done_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.file_archive_failed_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.file_archive_candidates_v1(integer, integer, text[]) to service_role;
grant execute on function public.file_archive_done_v1(uuid, text) to service_role;
grant execute on function public.file_archive_failed_v1(uuid, text) to service_role;

-- 7) 毎時 41 分に、edge function「archive-old-files」を呼ぶ（合言葉は、ストーリー掃除と同じ Vault の story_cleanup_secret）
--    開発用 ARE-dev に流すときだけ、下の URL の kzrrnuzzvwijujhlbtln を ARE-dev のプロジェクト ID に変えてください。
select cron.unschedule('file-archive-hourly') where exists (select 1 from cron.job where jobname = 'file-archive-hourly');
select cron.schedule('file-archive-hourly', '41 * * * *', $cron$
  select net.http_post(
    url := 'https://kzrrnuzzvwijujhlbtln.supabase.co/functions/v1/archive-old-files',
    headers := jsonb_build_object('Content-Type','application/json','x-cleanup-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'story_cleanup_secret')),
    body := '{"days":30,"limit":5,"types":["file"]}'::jsonb, timeout_milliseconds := 120000);
$cron$);

-- 確認：
--   1行目（cron）：file-archive-hourly ／ 41 * * * * ／ active = true
--   2行目（関数）：file_archive_candidates_v1・file_archive_done_v1・file_archive_failed_v1・file_archive_json_v1 の4つ
--   3行目：いま「30日たったファイル」が何件あるか（いちばん古いファイルが 10/25 なので、最初の1件は 11/24 ごろから対象になります）
select jobname, schedule, active from cron.job where jobname = 'file-archive-hourly';
select p.proname as 関数 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname like 'file_archive_%' order by 1;
select count(*) as 今_30日たったファイル from public.file_archive_candidates_v1(30, 50, array['file']);
