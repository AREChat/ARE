-- 端末をまたぐ「その他」のお気に入り等の保存先（ユーザーごと・本人だけが読み書き）
create table if not exists public.user_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 64),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_prefs enable row level security;
drop policy if exists user_prefs_own_select on public.user_prefs;
drop policy if exists user_prefs_own_insert on public.user_prefs;
drop policy if exists user_prefs_own_update on public.user_prefs;
drop policy if exists user_prefs_own_delete on public.user_prefs;
create policy user_prefs_own_select on public.user_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy user_prefs_own_insert on public.user_prefs for insert to authenticated with check (user_id = (select auth.uid()) and pg_column_size(value) < 20000);
create policy user_prefs_own_update on public.user_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and pg_column_size(value) < 20000);
create policy user_prefs_own_delete on public.user_prefs for delete to authenticated using (user_id = (select auth.uid()));
