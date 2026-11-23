-- 予約送信（文章）も、ふつうの送信と同じ 4,000 文字まで（v1 の 1,000 文字から 戻す）。写真・動画・ファイルなどの予約（type が text 以外）には この制限は かけない。
create or replace function public.schedule_message(p_room_id uuid, p_content text, p_send_at timestamp with time zone)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_me uuid := (select auth.uid()); v_id uuid; v_content text := trim(coalesce(p_content, '')); v_json jsonb;
begin
  if v_me is null then raise exception 'authentication_required'; end if;
  if not exists (select 1 from public.chat_room_members m where m.room_id = p_room_id and m.user_id = v_me) then raise exception 'not_member'; end if;
  if exists (select 1 from public.chat_rooms r where r.id = p_room_id and r.suspended_at is not null) then raise exception 'room_suspended'; end if;
  if char_length(v_content) not between 1 and 12000 then raise exception 'message_length_invalid'; end if;
  begin v_json := v_content::jsonb; exception when others then v_json := null; end;
  if v_json is not null and jsonb_typeof(v_json) = 'object' and v_json->>'type' = 'text' and char_length(coalesce(v_json->>'text', '')) > 4000 then
    raise exception 'schedule_text_too_long';
  end if;
  if p_send_at is null or p_send_at < now() + interval '30 seconds' or p_send_at > now() + interval '30 days' then raise exception 'send_at_out_of_range'; end if;
  if (select count(*) from public.scheduled_messages s where s.sender_id = v_me and s.status = 'pending') >= 50 then raise exception 'too_many_scheduled'; end if;
  insert into public.scheduled_messages (room_id, sender_id, content, send_at) values (p_room_id, v_me, v_content, p_send_at) returning id into v_id;
  return v_id;
end $function$;
