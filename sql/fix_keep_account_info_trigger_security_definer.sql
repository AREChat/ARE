-- 【緊急】メッセージがまったく送れなくなる不具合の修正   2026-11-23
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）に1回だけ流してください。何度流しても同じ結果になります（やり直しOK）。
--
-- 【症状】send_message（個人チャット・グループチャットどちらも）を呼ぶと、必ず
--   {"code":"42501","message":"permission denied for schema private"}
-- になり、メッセージが1件も送れない。QAテスト中に、新規登録した2つのテストアカウントと
-- グループチャットの両方で再現を確認ずみ（個人チャット固有の問題ではない）。
--
-- 【原因】messages テーブルの BEFORE INSERT トリガー関数 private.keep_account_info_message_trg_v1() が
-- SECURITY DEFINER になっておらず（SECURITY INVOKER のまま）、本文中に private.is_account_info_message_v1(...)
-- を schema 修飾つきで呼んでいる。private スキーマには authenticated ロールの USAGE 権限がないため、
-- INSERT のたびに「private スキーマの関数を探す」こと自体が権限エラーになっていた。
-- 同じ private スキーマの他のトリガー関数（contact_gate_v1 / guest_limit_v1 / msg_before / msg_after /
-- push_notify / fix_request_ack_v1 など）はすべて SECURITY DEFINER になっており、この関数だけが
-- 取り残されていたためにアプリ全体の送信が止まっていたと考えられる。
--
-- 【直し方】関数の定義はそのままに、SECURITY DEFINER を付けるだけ（他のトリガー関数と同じ形にそろえる）。
create or replace function private.keep_account_info_message_trg_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.expires_at is not null and private.is_account_info_message_v1(new.content) then
    new.expires_at := null;
  end if;
  return new;
end
$function$;
