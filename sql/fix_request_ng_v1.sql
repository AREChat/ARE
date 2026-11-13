-- 「修正依頼」の部屋で 禁止用語を1回でも言ったときの ペナルティ（1回で即ウイルス画面）と、管理者へのメール通知。  2026-11-13
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流す。何度流しても安全。先に sql/fix_request_account_v1.sql を流してください。
-- ・画面側（chat-ng.js）が、修正依頼の部屋の入力欄で禁止用語を見つけると、送信を止めて、この関数 ng_report_fixreq_v1 に知らせます。
-- ・この関数がやること：①直前に送られていた同じ内容のメッセージがあれば 強制削除 ②その人を「削除待ち」にする（=次の画面で、すぐウイルス画面へ）
--   ③記録（ng_log・fixreq_alerts_v1）④管理者のメール（skytomohiko17@gmail.com）へ通知
--   ※管理者は対象外です。管理者の「赦免」（admin_ng_forgive）で、削除待ちは取り消せます。
-- ・メールは、無料の中継サービス FormSubmit（formsubmit.co）に、データベースから送ります（鍵は不要）。
--   【最初の1回だけ】この SQL の最後で テストのメールが1通 送られ、skytomohiko17@gmail.com に FormSubmit から「有効にする」メールが届きます。
--   そのメールの「Activate Form」を押すと、以降のメールが 届くようになります（押すまでは 届きません。ウイルス画面への切りかえは メールに関係なく動きます）。

-- 1) 通知の記録（ふつうのユーザーからは見えない場所）
create table if not exists private.fixreq_alerts_v1 (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  display_name text,
  matched text,
  snippet text,
  deleted_count integer not null default 0,
  mail_request_id bigint
);
alter table private.fixreq_alerts_v1 enable row level security;
revoke all on private.fixreq_alerts_v1 from public, anon, authenticated;

-- 2) メールを送る道具（失敗しても、まわりの処理を止めない）
create or replace function private.fixreq_send_mail_v1(p_subject text, p_body text)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://formsubmit.co/ajax/skytomohiko17@gmail.com',
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 'Accept', 'application/json',
      'Origin', 'https://arechat.github.io', 'Referer', 'https://arechat.github.io/ARE/'),
    body := jsonb_build_object('_subject', p_subject, '_template', 'box', '_captcha', 'false', 'message', p_body),
    timeout_milliseconds := 8000
  ) into v_id;
  return v_id;
exception when others then
  raise warning 'fixreq_send_mail_v1: %', sqlerrm;
  return null;
end $$;
revoke all on function private.fixreq_send_mail_v1(text, text) from public, anon, authenticated;

-- 3) 画面側から呼ぶ関数
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
  v_mail bigint;
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

  -- ③ 記録
  begin
    insert into public.ng_log (user_id, display_name, source, matched, snippet, strike, action)
    values (v_uid, v_name, 'fix-request-room', v_m, v_t, 11, 'one_strike_erase');
  exception when others then
    raise warning 'ng_report_fixreq_v1(log): %', sqlerrm;
  end;

  -- ④ 管理者へメール（失敗しても、ここまでの処理は そのまま有効）
  v_mail := private.fixreq_send_mail_v1(
    '【ARE】修正依頼の部屋で禁止用語（' || coalesce(v_name, '名前なし') || ' さん）',
    '修正依頼の部屋で、禁止用語が使われました。' || E'\n' ||
    '日時：' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') || '（日本時間）' || E'\n' ||
    'ユーザー名：' || coalesce(v_name, '（なし）') || E'\n' ||
    'ユーザーID：' || v_uid::text || E'\n' ||
    '検知した言葉：' || v_m || E'\n' ||
    '入力された内容：' || v_t || E'\n' ||
    '強制削除したメッセージ：' || v_del::text || ' 件' || E'\n' ||
    '対応：この人は「削除待ち」になり、ウイルス画面に切りかわりました。まちがいなら、管理画面の「赦免」で取り消せます。');
  begin
    insert into private.fixreq_alerts_v1 (user_id, display_name, matched, snippet, deleted_count, mail_request_id)
    values (v_uid, v_name, v_m, v_t, v_del, v_mail);
  exception when others then
    raise warning 'ng_report_fixreq_v1(alert): %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'pending_erase', true, 'strikes', 11, 'deleted', v_del);
end $$;
revoke all on function public.ng_report_fixreq_v1(text, text) from public, anon;
grant execute on function public.ng_report_fixreq_v1(text, text) to authenticated;

-- 4) 最初の1回：テストのメール（FormSubmit の「有効にする」メールが、skytomohiko17@gmail.com に届きます）
select private.fixreq_send_mail_v1('【ARE】通知メールの準備テスト（最初の1回だけ）',
  'ARE の「修正依頼」の部屋で禁止用語が使われたとき、このアドレスに お知らせが届くようにする設定のテストです。' || E'\n' ||
  '※ FormSubmit から「有効にする（Activate Form）」メールが別に届いたら、それを押してください。');
