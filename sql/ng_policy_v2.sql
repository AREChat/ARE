-- NGワード：新しい対応ルール（2026-11-24）
--   1回目から毎回 … ウイルス画面（演出）／そのメッセージは強制削除（保存しない）／管理者に通報＋NG記録／ポイント0
--   5回目以降     … 凍結。5回目=1分、6回目=2分、7回目=4分…と、回数が1つふえるたびに ×2倍
--   100回目       … アカウント強制削除（失敗したときは「削除待ち」にもどし、おしおき画面→あやまると消える）
-- ・関数を置きかえるだけです（テーブルは そのまま・データは消しません）。「修正依頼の部屋は1回で即アウト」の規則（ng_report_fixreq_v1）は変えません。
-- ・凍結の長さは 2の30乗分（約2000年）で頭打ち（数があふれないように）。
-- 実行方法: Supabase の SQL Editor に全文を貼って Run（または apply_migration）。

create or replace function private.ng_strike(p_user uuid, p_source text, p_word text, p_snippet text, p_room uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  n int; old_pts int; nm text; st public.ng_state; note text := ''; v_act text := 'strike'; v_min int; v_erased boolean := false; v_pending boolean := false;
begin
  if p_user is null or private.is_admin_user(p_user) then return jsonb_build_object('hit', false); end if;
  insert into public.ng_state(user_id) values (p_user) on conflict do nothing;
  update public.ng_state set strikes = strikes + 1, last_at = now(), updated_at = now() where user_id = p_user returning strikes into n;

  -- ポイントは0に
  select points into old_pts from public.user_points where user_id = p_user;
  if coalesce(old_pts, 0) > 0 then
    update public.user_points set points = 0, updated_at = now() where user_id = p_user;
    insert into public.point_log(user_id, delta, reason) values (p_user, -old_pts, 'ng_penalty');
  end if;

  -- 5回目から凍結（1分、2分、4分…）
  if n >= 5 then
    v_min := (1::bigint << least(n - 5, 30))::int;
    update public.ng_state set frozen_until = now() + make_interval(mins => v_min) where user_id = p_user;
    note := '／' || v_min || '分凍結'; v_act := 'freeze';
  end if;
  if n >= 100 then note := '／アカウント強制削除'; v_act := 'erased'; end if;

  select display_name into nm from public.profiles where id = p_user;
  insert into public.reports(reporter_id, target_user, room_id, reason, detail, snapshot)
    values (p_user, p_user, p_room, 'abuse', left('【NG自動検知】' || n || '回目／' || coalesce(p_source, '?') || '／検知語「' || p_word || '」' || note, 300), left(coalesce(p_snippet, ''), 300));
  insert into public.ng_log(user_id, display_name, source, matched, snippet, strike, action)
    values (p_user, nm, p_source, p_word, left(coalesce(p_snippet, ''), 300), n, v_act);
  select * into st from public.ng_state where user_id = p_user;

  -- 100回目：アカウント強制削除（ログは ng_log に残ります）
  if n >= 100 then
    begin
      perform private.erase_user(p_user);
      v_erased := true;
    exception when others then
      update public.ng_state set pending_erase = true where user_id = p_user;
      v_pending := true;
      raise warning 'ng_strike(erase): %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('hit', true, 'word', p_word, 'strikes', n, 'frozen_until', st.frozen_until,
                            'freeze_minutes', v_min, 'pending_erase', coalesce(st.pending_erase, false) or v_pending, 'erased', v_erased, 'points', 0);
end $$;

-- メッセージ：NGワードがあったら、保存しないで取り消す（強制削除）。凍結中・削除待ちは、これまでどおり送れません
create or replace function private.msg_before()
returns trigger language plpgsql security definer set search_path to '' as $$
declare st public.ng_state; w text; txt text;
begin
  if coalesce(new.is_auto_reply, false) or new.sender_id is null or private.is_admin_user(new.sender_id) then return new; end if;
  select * into st from public.ng_state where user_id = new.sender_id;
  if found and (st.pending_erase or (st.frozen_until is not null and st.frozen_until > now())) then raise exception 'account_frozen'; end if;
  txt := private.ng_text_of(new.content);
  w := private.ng_match(txt);
  if w is not null then
    perform private.ng_strike(new.sender_id, 'chat', w, txt, new.room_id);
    return null;   -- このメッセージは保存しない（強制削除）
  end if;
  return new;
end;
$$;
