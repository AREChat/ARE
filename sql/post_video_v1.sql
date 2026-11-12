-- 投稿の動画（post-images バケットで動画を受けつける）
-- Supabase の SQL Editor で 1回だけ実行してください。実行するまでは、動画は自動で「リンクで投稿」になります（壊れません）。
-- 上限は 50MB。もっと小さくしたいときは 52428800 を変えてください。
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = (
         select array_agg(distinct m)
           from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['video/mp4','video/webm','video/quicktime']) as m
       )
 where id = 'post-images'
   and allowed_mime_types is not null;   -- null（種類の制限なし）のバケットは、種類はそのまま・サイズだけ下で広げる
update storage.buckets set file_size_limit = 52428800 where id = 'post-images';
