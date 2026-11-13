-- 「修正依頼」の部屋で 禁止用語を1回でも言ったときの ペナルティ（1回で即ウイルス画面）。  2026-11-13
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流す。何度流しても安全。先に sql/fix_request_account_v1.sql を流してください。
-- ・画面側（chat-ng.js）が、修正依頼の部屋の入力欄で禁止用語を見つけると、送信を止めて、この関数 ng_report_fixreq_v1 に知らせます。
-- ・この関数がやること：
--     ①直前（2分以内）に この部屋へ送られていた 同じ内容のメッセージがあれば 強制削除
--     ②その人を「削除待ち」にする（=次の画面で、すぐウイルス画面へ）
--     ③記録を残す：チャット内の管理者専用画面の「NG」（ユーザー別の回数／最近の記録）に表示されます
--   ※管理者は対象外です。まちがいのときは、その「NG」画面の「赦免」で、削除待ちを取り消せます。
-- ・メールは送りません（外部サービスは使いません）。

create or replace function public.ng_report_fixreq_v1(p_matched text, p_text text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room constant uuid := '7f1c0de0-5a1e-4f1c-8f1c-0000000f1c02';
  v_name text;
  v_m text := left(coalesce(p_matched, ''), 60);
  v_t text := left(coalesce(p_text, ''), 300);
  v_del integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if private.is_admin_user(v_uid) then return jsonb_build_object('ok', true, 'exempt', true); end if;   -- 管理者は対象外
  if not exists (select 1 from public.chat_room_members where room_id = v_room and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  select p.display_name into v_name from public.profiles p where p.id = v_uid;

  -- ① 直前（2分以内）に この部屋へ送った 同じ内容のメッセージは 強制削除
  begin
    with d as (
      delete from public.messages x
      where x.room_id = v_room and x.sender_id = v_uid and x.created_at > now() - interval '2 minutes'
        and ((v_t <> '' and position(v_t in x.content) > 0) or (v_m <> '' and position(v_m in x.content) > 0))
      returning 1)
    select count(*)::integer into v_del from d;
  exception when others then
    raise warning 'ng_report_fixreq_v1(delete): %', sqlerrm;
  end;

  -- ② 「削除待ち」にする（次に開く画面は、ウイルス画面）
  insert into public.ng_state (user_id, strikes, pending_erase, last_at, updated_at)
  values (v_uid, 11, true, now(), now())
  on conflict (user_id) do update
    set strikes = greatest(public.ng_state.strikes, 11), pending_erase = true, last_at = now(), updated_at = now();

  -- ③ 記録（管理者専用画面の「NG」に出ます）
  begin
    insert into public.ng_log (user_id, display_name, source, matched, snippet, strike, action)
    values (v_uid, v_name, 'fix-request-room', v_m, v_t, 11,
            '修正依頼の部屋で禁止用語（1回でウイルス画面）' || case when v_del > 0 then '・メッセージ強制削除' else '' end);
  exception when others then
    raise warning 'ng_report_fixreq_v1(log): %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'pending_erase', true, 'strikes', 11, 'deleted', v_del);
end $$;
revoke all on function public.ng_report_fixreq_v1(text, text) from public, anon;
grant execute on function public.ng_report_fixreq_v1(text, text) to authenticated;
