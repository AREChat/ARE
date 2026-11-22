-- ===== 未読の同期（端末どうし）v1 =====
-- どこかの端末でチャットを読んだら、ほかの端末の未読表示も消えるようにするための 2 つの関数。
-- ① get_my_reads()  … 自分の「どこまで読んだか」（部屋ごとの last_read_at）だけを返す。ほかの人の分は返さない。
-- ② mark_room_read() … これまでは 8 秒ごとの自動更新のたびに last_read_at を書き換えていた。
--                      新しいメッセージがあるときだけ書き換えるようにして、書き込み量を大きく減らす。
--                      （既読表示＝相手が読んだ時刻 ≧ メッセージの時刻 の判定は、これまでと同じ結果になる）
create or replace function public.get_my_reads()
returns table(room_id uuid, last_read_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.room_id, m.last_read_at
    from public.chat_room_members m
   where m.user_id = (select auth.uid())
     and m.last_read_at is not null
$$;
revoke all on function public.get_my_reads() from public, anon;
grant execute on function public.get_my_reads() to authenticated;

create or replace function public.mark_room_read(p_room_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  update public.chat_room_members m
     set last_read_at = now()
   where m.room_id = p_room_id
     and m.user_id = (select auth.uid())
     and (m.last_read_at is null
          or exists (select 1 from public.messages x where x.room_id = p_room_id and x.created_at > m.last_read_at));
end $$;
