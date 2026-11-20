-- チャットの「送れるファイルの種類」を約110種類に増やす（chat-attachments バケットの許可リスト）
-- Supabase の SQL Editor で 1回だけ実行してください（本番「ARE」。開発用 ARE-dev があれば そちらにも）。
-- ・今ある種類は そのまま残り、足りない種類だけが足されます（何回実行しても同じ結果。消えるものはありません）。
-- ・アプリ側（chat-base.js の FILE_MIME_BY_EXT）と 同じ種類をそろえてあります。
-- ・実行する前に、アプリ側を公開しないでください（先に公開すると、txt などを送ったときに 保存先に断られます）。
-- ・危険な種類（exe・html・svg・xml・js・マクロつき文書など）は、わざと入れていません。
update storage.buckets
   set allowed_mime_types = (
         select array_agg(distinct m order by m)
           from unnest(coalesce(allowed_mime_types, array[]::text[]) || array[
              'application/epub+zip',
              'application/gzip',
              'application/json',
              'application/msword',
              'application/pdf',
              'application/rtf',
              'application/vnd.apple.keynote',
              'application/vnd.apple.numbers',
              'application/vnd.apple.pages',
              'application/vnd.ms-excel',
              'application/vnd.ms-powerpoint',
              'application/vnd.oasis.opendocument.presentation',
              'application/vnd.oasis.opendocument.spreadsheet',
              'application/vnd.oasis.opendocument.text',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.rar',
              'application/x-7z-compressed',
              'application/x-bzip2',
              'application/x-tar',
              'application/x-xz',
              'application/zip',
              'audio/aac',
              'audio/flac',
              'audio/midi',
              'audio/mp4',
              'audio/mpeg',
              'audio/ogg',
              'audio/wav',
              'audio/webm',
              'font/otf',
              'font/ttf',
              'font/woff',
              'font/woff2',
              'image/avif',
              'image/bmp',
              'image/gif',
              'image/heic',
              'image/heif',
              'image/jpeg',
              'image/png',
              'image/tiff',
              'image/vnd.microsoft.icon',
              'image/webp',
              'model/gltf+json',
              'model/gltf-binary',
              'model/stl',
              'text/calendar',
              'text/csv',
              'text/markdown',
              'text/plain',
              'text/tab-separated-values',
              'text/vcard',
              'video/3gpp',
              'video/mp4',
              'video/quicktime',
              'video/webm',
              'video/x-matroska',
              'video/x-ms-wmv',
              'video/x-msvideo'
           ]) as m
       )
 where id = 'chat-attachments'
   and allowed_mime_types is not null;   -- null（種類の制限なし）のバケットは、そのまま（すでに全部送れる）

-- 確認：件数が 18 → 61 になり、'text/plain' 'application/json' 'text/markdown' が入っていれば OK
select id, file_size_limit, array_length(allowed_mime_types, 1) as 件数,
       allowed_mime_types @> array['text/plain','application/json','text/markdown','application/zip'] as 追加ずみ
  from storage.buckets where id = 'chat-attachments';
