-- カスタマイズAIbot：GAS の URL と 合言葉を、サーバー側の金庫（private.aibot_cfg）に置き、
-- 「その他」以外のログイン中の人にだけ my_aibot_config() で渡す（本番「ARE」に適用ずみ 2026-11-26）。
-- ※ 値（URL・合言葉）は この記録には 書きません。入れかた（SQL エディタで 1 回だけ）：
--    insert into private.aibot_cfg(id,url,token) values (1,'<GASの…/exec のURL>','<APP_TOKEN と同じ合言葉>')
--    on conflict (id) do update set url=excluded.url, token=excluded.token, updated_at=now();
create table if not exists private.aibot_cfg (
    id int primary key default 1 check (id = 1),
    url text not null default '',
    token text not null default '',
    updated_at timestamptz not null default now()
);
alter table private.aibot_cfg enable row level security;
revoke all on private.aibot_cfg from public, anon, authenticated;

create or replace function public.my_aibot_config()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_me uuid := (select auth.uid()); c private.aibot_cfg%rowtype;
begin
    if v_me is null then raise exception 'authentication_required'; end if;
    if private.is_other_v1(v_me) then return null; end if;          -- 区分「その他」（お試しを含む）には 渡さない
    select * into c from private.aibot_cfg where id = 1;
    if not found or c.url = '' or c.token = '' then return null; end if;
    return jsonb_build_object('url', c.url, 'token', c.token);
end $$;
revoke all on function public.my_aibot_config() from public, anon;
grant execute on function public.my_aibot_config() to authenticated;
