-- 管理者は、いつでも「取り込み中」（busy）にする。
--  ・set_my_presence：管理者（private.user_roles の role='admin'）が online / away / in_call を送っても、busy として保存する
--    （offline＝ログアウトだけは そのまま。画面側では、管理者はオフラインのときも「取り込み中」と表示する＝chat-presence.js）
--  ・通知（push_targets / call_push_targets / send-push / call-push）は、presence_status を いっさい見ない。
--    「取り込み中」でも通知は届く。止まるのは、本人が決めた「静かな時間」・ミュート・ブロックだけ。
create or replace function public.set_my_presence(p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text := p_status;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  if p_status is null or p_status not in ('online','away','busy','in_call','offline') then raise exception 'invalid_status'; end if;
  if v_status <> 'offline' and private.is_admin_user((select auth.uid())) then v_status := 'busy'; end if;
  update public.profiles set presence_status = v_status, last_seen_at = now() where id = (select auth.uid());
end $function$;
