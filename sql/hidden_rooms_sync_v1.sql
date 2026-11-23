-- ===== 非表示チャットの同期（端末どうし）v1 =====
-- これまで「🙈 非表示にする」は、この端末のブラウザ（localStorage）だけに保存していて、
-- 別の端末（PC とスマホなど）には伝わらなかった（未読の同期とはちがう仕組みだった）。
-- ここで chat_room_members に「非表示かどうか」と「いつ変えたか」を追加し、
-- 未読の同期（sql/read_sync_v1.sql）と同じやり方（サーバーの変更通知＋定期確認）で、
-- どちらの端末で隠す／戻すを変えても、両方の端末が「あとから変えたほう」に揃うようにする。

alter table public.chat_room_members
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_changed_at timestamptz;

-- ① get_my_hidden_rooms() … 自分の「非表示にしたか・いつ変えたか」だけを返す（ほかの人の分は返さない）。
--    変えたことが一度もない部屋（hidden_changed_at が null）は返さない＝この端末のローカルの状態をそのまま使う。
create or replace function public.get_my_hidden_rooms()
returns table(room_id uuid, hidden boolean, hidden_changed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.room_id, m.hidden, m.hidden_changed_at
    from public.chat_room_members m
   where m.user_id = (select auth.uid())
     and m.hidden_changed_at is not null
$$;
revoke all on function public.get_my_hidden_rooms() from public, anon;
grant execute on function public.get_my_hidden_rooms() to authenticated;

-- ② set_room_hidden(p_room_id, p_hidden) … 自分の、その部屋の「非表示かどうか」を変える（本人の行だけ）。
create or replace function public.set_room_hidden(p_room_id uuid, p_hidden boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  update public.chat_room_members m
     set hidden = p_hidden,
         hidden_changed_at = now()
   where m.room_id = p_room_id
     and m.user_id = (select auth.uid());
end $$;
revoke all on function public.set_room_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_room_hidden(uuid, boolean) to authenticated;

-- ③ chat_room_members の変更通知（realtime）が有効になっていなければ有効にする。
--    すでに read_sync_v1.sql（未読の同期）で有効にしてある場合は、何もしない。
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'chat_room_members'
  ) then
    alter publication supabase_realtime add table public.chat_room_members;
  end if;
end $$;
