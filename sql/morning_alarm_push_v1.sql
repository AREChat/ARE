-- 毎朝7時（日本時間）の「おはようございます」プッシュ通知
-- ・送り先：プッシュ通知をオンにしている人のうち、管理者と「家庭」の人を除く全員（本人が設定した おやすみ時間中の人も除く）
-- ・文面：未読があれば「未読のメッセージが◯件あります」
-- ・しくみ：cron（毎日 22:00 UTC ＝ 7:00 JST）→ Edge Function「morning-push」→ 各端末へ Web Push
-- ・ふだんのメッセージ通知（send-push）には触りません

create or replace function public.push_morning_targets()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare res jsonb;
begin
    select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
        'unread', coalesce(u.n, 0))), '[]'::jsonb)
    into res
    from public.push_subscriptions s
    left join lateral (
        select count(*)::int as n
        from public.chat_room_members rm
        join public.messages m on m.room_id = rm.room_id
        where rm.user_id = s.user_id
          and m.sender_id <> s.user_id
          and m.deleted_at is null
          and (rm.last_read_at is null or m.created_at > rm.last_read_at)
          and not exists (select 1 from public.room_mutes x where x.user_id = s.user_id and x.room_id = rm.room_id)
    ) u on true
    where not private.is_admin_user(s.user_id)
      and coalesce(private.seg_of(s.user_id), 'other') <> 'home'
      and not private.in_quiet_hours_v1(s.user_id);
    return res;
end;
$function$;

revoke all on function public.push_morning_targets() from public, anon, authenticated;
grant execute on function public.push_morning_targets() to service_role;

-- cron：毎日 22:00 UTC（＝ 日本時間 7:00）
select cron.schedule('morning-alarm-push', '0 22 * * *', $cron$
  select net.http_post(
    url := 'https://kzrrnuzzvwijujhlbtln.supabase.co/functions/v1/morning-push',
    headers := jsonb_build_object('Content-Type','application/json','x-cleanup-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'story_cleanup_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cron$);
