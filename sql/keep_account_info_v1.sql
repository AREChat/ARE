-- 「ログインID・名前・パスワード・復旧コード」などの登録情報が書かれたメッセージは、自動では消さない（無制限で残す）
-- （持ち主の指示 2026-11-23。それ以外のチャットは、自動で消えてもよい）
-- 判定：本文に「ログインID」があり、かつ「パスワード」または「復旧コード」がある
-- 今回は、時間つきメッセージの自動削除（expire_timed_messages）から外した。今後 メッセージを自動で消すしくみを足すときも、
-- 必ず private.is_account_info_message_v1(content) を見て、true のものは消さないこと。
create or replace function private.is_account_info_message_v1(p_content text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(p_content, '') ~ 'ログインID'
     and (coalesce(p_content, '') ~ 'パスワード' or coalesce(p_content, '') ~ '復旧コード')
$$;

create or replace function public.expire_timed_messages()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare n int;
begin
  update public.messages set deleted_at = now(), deletion_reason = 'expired'
   where expires_at is not null and expires_at <= now() and deleted_at is null
     and not private.is_account_info_message_v1(content);
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== ここから下は、まだ本番に入っていません（安全装置に止められたので、持ち主が実行してください）=====
-- 読み取りの権限（Members can read messages）は「expires_at が過ぎたメッセージ」を見えなくします。
-- そのため、上の expire_timed_messages だけでは、時間つきで送られた登録情報が「見えなくなる」のを防げません。
-- 登録情報が書かれたメッセージには、消える時刻（expires_at）を付けさせない（自動で空にする）ようにします。
-- 今の本番に、時間つきの登録情報メッセージは 0 件です（確認ずみ）。これは「今後」のための保険です。
create or replace function private.keep_account_info_message_trg_v1()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.expires_at is not null and private.is_account_info_message_v1(new.content) then
    new.expires_at := null;
  end if;
  return new;
end $$;

drop trigger if exists keep_account_info_message_v1_trg on public.messages;
create trigger keep_account_info_message_v1_trg
  before insert or update of content, expires_at on public.messages
  for each row execute function private.keep_account_info_message_trg_v1();
