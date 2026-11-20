-- 試験2c：投稿の見え方を、見る人ごとに確かめ直す（巻き戻し）  2026-11-21
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）の SQL Editor に、全文を貼って Run します。
-- 最後に「ERROR: RESULT:…」と出ます。これは、わざと出している終わりの合図で、巻き戻しのしるしです（失敗ではありません）。
-- 出てきた「RESULT:」から後ろの文を、全部コピーして送ってください。
-- 試験用のユーザーは、この中で作って、最後に巻き戻します。本物のユーザーのデータは、1つも変わりません。
-- ○＝期待どおり ／ ×＝期待とちがう ／ ・＝記録（通った・止められた、どちらでもよいが、結果を知りたいもの）

do $t$
declare
  adm uuid := '9d660098-27f5-4933-bdce-d0ea7a6f08b4';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  rm uuid; pp uuid; pf uuid; pv uuid; who uuid; nm text; vis boolean; cnt integer; k text;
  r text := ''; v text; n integer; i integer; b boolean; j jsonb;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data) values (u1,'authenticated','authenticated','tst-'||u1||'@login.are.invalid', now(), now(), now(), '{}');
  insert into public.profiles(id, display_name) values (u1, '試験A');
  insert into private.user_login_ids(user_id, login_id, login_id_normalized) values (u1, 'tst'||substr(u1::text,1,8), 'tst'||substr(u1::text,1,8));
  insert into private.user_private_info(user_id, recovery_code_hash) values (u1, 'x');
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data) values (u2,'authenticated','authenticated','tst-'||u2||'@login.are.invalid', now(), now(), now(), '{}');
  insert into public.profiles(id, display_name) values (u2, '試験B');
  insert into private.user_login_ids(user_id, login_id, login_id_normalized) values (u2, 'tst'||substr(u2::text,1,8), 'tst'||substr(u2::text,1,8));
  insert into private.user_private_info(user_id, recovery_code_hash) values (u2, 'x');
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data) values (u3,'authenticated','authenticated','tst-'||u3||'@login.are.invalid', now(), now(), now(), '{}');
  insert into public.profiles(id, display_name) values (u3, '試験C');
  insert into private.user_login_ids(user_id, login_id, login_id_normalized) values (u3, 'tst'||substr(u3::text,1,8), 'tst'||substr(u3::text,1,8));
  insert into private.user_private_info(user_id, recovery_code_hash) values (u3, 'x');
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data) values (u4,'authenticated','authenticated','tst-'||u4||'@login.are.invalid', now(), now(), now(), '{}');
  insert into public.profiles(id, display_name) values (u4, '試験D');
  insert into private.user_login_ids(user_id, login_id, login_id_normalized) values (u4, 'tst'||substr(u4::text,1,8), 'tst'||substr(u4::text,1,8));
  insert into private.user_private_info(user_id, recovery_code_hash) values (u4, 'x');
  insert into private.user_segments(user_id, segment) values (u1,'friend'),(u2,'friend'),(u3,'friend') on conflict (user_id) do update set segment = 'friend';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  insert into public.follows(follower_id, followee_id) values (u1, u2);
  rm := public.create_or_get_direct_room(u2);
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  insert into public.follows(follower_id, followee_id) values (u2, u1);
reset role;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.create_post_with_visibility('見え方-public', null, 'public'); r := r||E'\n○ A1 公開の投稿'; exception when others then r := r||E'\n× A1 公開の投稿 ← '||left(sqlerrm,90); end;
  begin perform public.create_post_with_visibility('見え方-followers', null, 'followers'); r := r||E'\n○ A2 フォロワー限定の投稿'; exception when others then r := r||E'\n× A2 フォロワー限定の投稿 ← '||left(sqlerrm,90); end;
  begin perform public.create_post_with_visibility('見え方-private', null, 'private'); r := r||E'\n○ A3 自分だけの投稿'; exception when others then r := r||E'\n× A3 自分だけの投稿 ← '||left(sqlerrm,90); end;
reset role;
  select id into pp from public.posts where author_id = u1 and body = '見え方-public' limit 1;
  select id into pf from public.posts where author_id = u1 and body = '見え方-followers' limit 1;
  select id into pv from public.posts where author_id = u1 and body = '見え方-private' limit 1;
  r := r||E'\n\n【V 見る人ごとの見え方（左から 公開／フォロワー限定／自分だけ。can_view_post ＋ 一覧に出るか）】';
  for i in 1..4 loop
    who := case i when 1 then u1 when 2 then u2 when 3 then u3 else u4 end;
    nm := case i when 1 then 'u1（投稿者）' when 2 then 'u2（相互フォロー・友人）' when 3 then 'u3（フォローなし・友人）' else 'u4（フォローなし・区分その他）' end;
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', who::text, true);
    set local role authenticated;
    begin
      r := r||E'\n・ V '||nm||'：公開='||public.can_view_post(pp, who)::text||'/'||(select count(*) from public.posts where id = pp)::text||' ／ フォロワー限定='||public.can_view_post(pf, who)::text||'/'||(select count(*) from public.posts where id = pf)::text||' ／ 自分だけ='||public.can_view_post(pv, who)::text||'/'||(select count(*) from public.posts where id = pv)::text;
    exception when others then r := r||E'\n・ V '||nm||' → エラー: '||left(sqlerrm,60); end;
    reset role;
  end loop;
  r := r||E'\n   （期待：u1＝true/1 が3つ。u2＝公開true/1・フォロワー限定true/1（相互フォローなので）・自分だけfalse/0。u3＝公開true/1・ほか false/0。「true/1」は 見られる/一覧に出る）';
  r := r||E'\n\n【W フォロー申請中の人（u3 → u1 をフォロー、まだ承認前）から、フォロワー限定は見えるか】';
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  begin insert into public.follows(follower_id, followee_id) values (u3, u1); r := r||E'\n・ W1 u3 が u1 をフォロー（承認まち） → 通った'; exception when others then r := r||E'\n・ W1 u3 が u1 をフォロー（承認まち） → 止められた: '||left(sqlerrm,70); end;
  begin v := (public.can_view_post(pf, u3))::text; r := r||E'\n・ W2 フォロー申請中の u3 から、フォロワー限定が見えるか（true/false） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ W2 フォロー申請中の u3 から、フォロワー限定が見えるか（true/false） → エラー: '||left(sqlerrm,70); end;
reset role;
  reset role;
  raise exception E'RESULT:%', r;   -- わざと止めて、ぜんぶ巻き戻す
end $t$;
