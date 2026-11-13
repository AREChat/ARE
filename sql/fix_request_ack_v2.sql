-- 「修正依頼」の自動返信が 送れていなかった不具合の直し（④）  2026-11-13
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流す。何度流しても安全。データは消さない・関数1つの入れかえだけ。
-- 原因：messages には「自動返信のフラグは、are.auto_reply が on のときだけ入れられる」という安全装置（guard_auto_reply_flag_v1）があり、
--       fix_request_ack_v1 がそれを立てずに返信を入れようとして、毎回失敗していた（失敗しても送った人の投稿は届くので、気づきにくかった）。
-- 直し：返信を入れる間だけ are.auto_reply を on にして、すぐ off にもどす（既存の「自動返信」と同じやり方）。
create or replace function private.fix_request_ack_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_bot constant uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c01';
  v_room constant uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02';
  v_name text;
  v_who text;
begin
  begin
    if new.room_id <> v_room then return new; end if;
    if new.sender_id is null or new.sender_id = v_bot or coalesce(new.is_auto_reply, false) then return new; end if;
    select p.display_name into v_name from public.profiles p where p.id = new.sender_id;
    v_who := coalesce(nullif(trim(v_name), ''), 'あなた');
    -- 同じ人へは、2分以内に返したばかりなら 続けて返さない
    if exists (select 1 from public.messages x
               where x.room_id = v_room and x.sender_id = v_bot and x.created_at > now() - interval '2 minutes'
                 and position((v_who || 'さん、') in x.content) > 0) then
      return new;
    end if;
    perform set_config('are.auto_reply', 'on', true);
    insert into public.messages (room_id, sender_id, content, is_auto_reply)
    values (v_room, v_bot,
            jsonb_build_object('type', 'text', 'text', v_who || 'さん、貴重なご意見ありがとうございました。すぐに対応いたします！')::text,
            true);
    perform set_config('are.auto_reply', 'off', true);
  exception when others then
    perform set_config('are.auto_reply', 'off', true);
    raise warning 'fix_request_ack_v1: %', sqlerrm;   -- 失敗しても、送った人のメッセージは そのまま届ける
  end;
  return new;
end $$;
revoke all on function private.fix_request_ack_v1() from public, anon, authenticated;
