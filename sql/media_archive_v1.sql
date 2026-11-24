-- 画像（チャット・投稿・ストーリー・アイコン）を、見えたまま Google ドライブへ移すための SQL（media_archive_v1）
-- ・private.media_archive_targets_v1()  … 移す対象（Supabase の Storage に残っていて、いまどこかで使われている画像）の一覧
-- ・private.media_archive_apply_v1(bucket, path, drive_id) … 使われている場所を ドライブの URL に書きかえる（メッセージ・投稿・予約投稿・ストーリー・アイコン）
-- どちらも サービスキー（Edge Function archive-media）だけが呼べます。画面（anon / authenticated）からは呼べません。
-- 消す処理は ここには ありません（Storage のファイル削除は Edge Function が、ドライブでの確認のあとにします）。

create or replace function private.media_archive_targets_v1()
returns table(bucket text, object_path text, kind text, ref_id text, owner_name text, created_at timestamptz, file_name text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path to '' as $$
  -- チャットの画像（消されていないメッセージが使っているもの）
  select o.bucket_id::text, o.name::text, 'chat'::text, m.id::text, coalesce(pr.display_name, '')::text, m.created_at,
         coalesce(private.file_archive_json_v1(m.content) ->> 'name', '')::text,
         coalesce(nullif(private.file_archive_json_v1(m.content) ->> 'mimeType', ''), o.metadata ->> 'mimetype', '')::text,
         (o.metadata ->> 'size')::bigint
    from storage.objects o
    join lateral (
      select m2.id, m2.created_at, m2.sender_id, m2.content
        from public.messages m2
       where m2.deleted_at is null
         and position(o.name in m2.content) > 0
         and private.file_archive_json_v1(m2.content) ->> 'path' = o.name
         and private.file_archive_json_v1(m2.content) ->> 'type' = 'image'
       order by m2.created_at limit 1
    ) m on true
    left join public.profiles pr on pr.id = m.sender_id
   where o.bucket_id = 'chat-attachments' and coalesce((o.metadata ->> 'size')::bigint, 0) > 0
  union all
  -- 投稿・ストーリー・予約投稿・予約ストーリーの画像
  select o.bucket_id::text, o.name::text, 'post'::text, ''::text, coalesce(pr.display_name, '')::text, o.created_at, ''::text,
         coalesce(o.metadata ->> 'mimetype', '')::text, (o.metadata ->> 'size')::bigint
    from storage.objects o
    left join public.profiles pr on pr.id::text = split_part(o.name, '/', 1)
   where o.bucket_id = 'post-images' and coalesce((o.metadata ->> 'size')::bigint, 0) > 0
     and (exists (select 1 from public.posts x where x.image_path = o.name)
       or exists (select 1 from public.stories x where x.image_path = o.name)
       or exists (select 1 from public.scheduled_posts x where x.image_path = o.name)
       or exists (select 1 from public.scheduled_stories x where x.image_path = o.name))
  union all
  -- アイコン（この Supabase の Storage の公開URLを使っているもの）
  select o.bucket_id::text, o.name::text, 'avatar'::text, pr.id::text, coalesce(pr.display_name, '')::text, o.created_at, ''::text,
         coalesce(o.metadata ->> 'mimetype', '')::text, (o.metadata ->> 'size')::bigint
    from storage.objects o
    join public.profiles pr on position('/storage/v1/object/public/avatars/' || o.name in coalesce(pr.avatar_url, '')) > 0
                           and pr.avatar_url like 'https://kzrrnuzzvwijujhlbtln.supabase.co/%'
   where o.bucket_id = 'avatars' and coalesce((o.metadata ->> 'size')::bigint, 0) > 0
$$;

create or replace function private.media_archive_apply_v1(p_bucket text, p_path text, p_drive text)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_msgs int := 0; v_posts int := 0; v_sposts int := 0; v_stories int := 0; v_sstories int := 0; v_avatars int := 0;
  v_uid text := split_part(coalesce(p_path, ''), '/', 1);
  v_ext text := lower(regexp_replace(coalesce(p_path, ''), '^.*\.([A-Za-z0-9]{1,5})$', '\1'));
  v_new text;
begin
  if p_drive is null or p_drive !~ '^[A-Za-z0-9_-]{10,100}$' then raise exception 'bad drive id'; end if;
  if p_path is null or p_path = '' or p_path like '%..%' then raise exception 'bad path'; end if;
  if v_ext !~ '^[a-z0-9]{1,5}$' or v_ext = lower(p_path) then v_ext := 'jpg'; end if;
  v_new := v_uid || '/drive-' || p_drive || '.' || v_ext;

  if p_bucket = 'chat-attachments' then
    -- メッセージ：保存先のパスを消して、ドライブの写真URLと番号（drive）を入れる（新しく送った写真と同じ形）
    update public.messages m
       set content = ((private.file_archive_json_v1(m.content) - 'path')
                      || jsonb_build_object('url', 'https://lh3.googleusercontent.com/d/' || p_drive || '=w1280', 'drive', p_drive))::text
     where position(p_path in m.content) > 0
       and private.file_archive_json_v1(m.content) ->> 'path' = p_path
       and private.file_archive_json_v1(m.content) ->> 'type' = 'image';
    get diagnostics v_msgs = row_count;
  elsif p_bucket = 'post-images' then
    update public.posts set image_path = v_new where image_path = p_path;                get diagnostics v_posts = row_count;
    update public.scheduled_posts set image_path = v_new where image_path = p_path;      get diagnostics v_sposts = row_count;
    update public.stories set image_path = v_new where image_path = p_path;              get diagnostics v_stories = row_count;
    update public.scheduled_stories set image_path = v_new where image_path = p_path;    get diagnostics v_sstories = row_count;
  elsif p_bucket = 'avatars' then
    update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/d/' || p_drive || '=s384'
     where position('/storage/v1/object/public/avatars/' || p_path in coalesce(avatar_url, '')) > 0
       and avatar_url like 'https://kzrrnuzzvwijujhlbtln.supabase.co/%';
    get diagnostics v_avatars = row_count;
  else
    raise exception 'bad bucket';
  end if;
  return jsonb_build_object('messages', v_msgs, 'posts', v_posts, 'scheduled_posts', v_sposts, 'stories', v_stories, 'scheduled_stories', v_sstories, 'avatars', v_avatars);
end $$;

revoke all on function private.media_archive_targets_v1() from public, anon, authenticated;
revoke all on function private.media_archive_apply_v1(text, text, text) from public, anon, authenticated;
grant execute on function private.media_archive_targets_v1() to service_role;
grant execute on function private.media_archive_apply_v1(text, text, text) to service_role;

-- Edge Function（サービスキー）が private スキーマの関数を直接呼べないため、public に「入り口」だけ作る（中身は上の2つ）
create or replace function public.media_archive_targets_v1()
returns table(bucket text, object_path text, kind text, ref_id text, owner_name text, created_at timestamptz, file_name text, mime_type text, size_bytes bigint)
language sql stable security invoker set search_path to '' as $$ select * from private.media_archive_targets_v1() $$;
create or replace function public.media_archive_apply_v1(p_bucket text, p_path text, p_drive text)
returns jsonb language sql security invoker set search_path to '' as $$ select private.media_archive_apply_v1(p_bucket, p_path, p_drive) $$;
revoke all on function public.media_archive_targets_v1() from public, anon, authenticated;
revoke all on function public.media_archive_apply_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.media_archive_targets_v1() to service_role;
grant execute on function public.media_archive_apply_v1(text, text, text) to service_role;
