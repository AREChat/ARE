-- スマホ↔パソコン ファイル転送用の保存場所（本人だけが 見る・入れる・消す）。上限50MB（無料枠の最大）
insert into storage.buckets (id, name, public, file_size_limit)
values ('file-drop', 'file-drop', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = null;

drop policy if exists file_drop_select on storage.objects;
drop policy if exists file_drop_insert on storage.objects;
drop policy if exists file_drop_delete on storage.objects;
create policy file_drop_select on storage.objects for select to authenticated
  using (bucket_id = 'file-drop' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy file_drop_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'file-drop' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy file_drop_delete on storage.objects for delete to authenticated
  using (bucket_id = 'file-drop' and (storage.foldername(name))[1] = (select auth.uid())::text);
