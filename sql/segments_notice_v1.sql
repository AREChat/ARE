-- =====================================================================
-- segments_notice_v1.sql  「その他」区分の依頼確認チャットへ、自動で案内メッセージを送る
--  ※ 先に segments_v1.sql を実行しておくこと。何度実行しても同じ結果（再実行OK）
--  ・今すぐ：案内メッセージを 1 通だけ入れる（すでにあれば入れない）
--  ・これから：新しいアカウントができるたびに「◯◯さん、ようこそ。…」を自動で送る
--  ・送り主は管理者アカウント（自動送信の印つき。ボットは使いません）
-- =====================================================================
begin;

create or replace function private.seg_other_say(p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_room uuid; v_admin uuid;
begin
    select room_id into v_room from private.segment_rooms where segment = 'other';
    select user_id into v_admin from private.user_roles where role = 'admin' order by user_id limit 1;
    if v_room is null or v_admin is null then return; end if;
    perform set_config('are.auto_reply', 'on', true);
    insert into public.messages (room_id, sender_id, content, is_auto_reply)
    values (v_room, v_admin, jsonb_build_object('type', 'text', 'text', p_text)::text, true);
    perform set_config('are.auto_reply', 'off', true);
exception when others then
    perform set_config('are.auto_reply', 'off', true);
    raise warning 'seg_other_say: %', sqlerrm;
end $$;

create or replace function private.seg_welcome_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if private.seg_of(new.id) = 'other' and not private.seg_special(new.id) then
        perform private.seg_other_say(coalesce(nullif(trim(new.display_name), ''), 'ユーザー') ||
            'さん、ようこそ。【ご案内】ご意見・ご要望・直してほしいところは、このチャットに書いて送ってください。管理者が確認して、すぐに対応します。');
    end if;
    return new;
end $$;
drop trigger if exists profiles_seg_welcome on public.profiles;
create trigger profiles_seg_welcome after insert on public.profiles
    for each row execute function private.seg_welcome_v1();

-- 今すぐ 1 通（案内）
do $$
declare v_room uuid;
begin
    select room_id into v_room from private.segment_rooms where segment = 'other';
    if v_room is not null and not exists (
        select 1 from public.messages m where m.room_id = v_room and m.is_auto_reply and m.content like '%【ご案内】%') then
        perform private.seg_other_say('【ご案内】ご意見・ご要望・直してほしいところは、このチャットに書いて送ってください。管理者が確認して、すぐに対応します。');
    end if;
end $$;

commit;
