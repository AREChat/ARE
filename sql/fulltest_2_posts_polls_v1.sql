-- 試験2：投稿・ストーリー・アンケート・プロフィール・保存データ・待ち時間（巻き戻し）  2026-11-20
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）の SQL Editor に、全文を貼って Run します。
-- 最後に「ERROR: RESULT:…」と出ます。これは、わざと出している終わりの合図で、巻き戻しのしるしです（失敗ではありません）。
-- 出てきた「RESULT:」から後ろの文を、全部コピーして送ってください。
-- 試験用のユーザーは、この中で作って、最後に巻き戻します。本物のユーザーのデータは、1つも変わりません。
-- ○＝期待どおり ／ ×＝期待とちがう ／ ・＝記録（通った・止められた、どちらでもよいが、結果を知りたいもの）

do $t$
declare
  adm uuid := '9d660098-27f5-4933-bdce-d0ea7a6f08b4';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  rm uuid; pid uuid; pid2 uuid; sid uuid; o1 uuid; o2 uuid; k text; rec record;
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
  r := r||E'\n\n【A 投稿】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.create_post('はじめての投稿', null); r := r||E'\n○ A1 投稿できる（create_post）'; exception when others then r := r||E'\n× A1 投稿できる（create_post） ← '||left(sqlerrm,90); end;
  for k in select unnest(array['public','followers','private','friends','xxx']) loop
    begin perform public.create_post_with_visibility('投稿-'||k, null, k); r := r||E'\n・ A2 公開範囲 '||k||' → 作れた'; exception when others then r := r||E'\n・ A2 公開範囲 '||k||' → 止められた: '||left(sqlerrm,50); end;
  end loop;
reset role;
  for rec in select id, body, visibility from public.posts where author_id = u1 and body like '投稿-%' order by body loop
    r := r||E'\n・ A3 閲覧 '||rec.body||'（保存された公開範囲='||coalesce(rec.visibility,'(空)')||'）：本人='||public.can_view_post(rec.id,u1)::text||' 相互フォローの相手='||public.can_view_post(rec.id,u2)::text||' 他人='||public.can_view_post(rec.id,u3)::text;
  end loop;
  r := r||E'\n   （期待： public=全員true／followers=本人と相手がtrue・他人false／private=本人だけtrue／xxx=作れない）';
  select id into pid from public.posts where author_id = u1 and body = '投稿-public' limit 1;
  select id into pid2 from public.posts where author_id = u1 and body = '投稿-private' limit 1;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if pid is not null then
  begin insert into public.post_comments(post_id, author_id, body) values (pid, u2, 'コメント'); r := r||E'\n○ A4 見られる投稿に、コメントできる'; exception when others then r := r||E'\n× A4 見られる投稿に、コメントできる ← '||left(sqlerrm,90); end;
  begin insert into public.post_comments(post_id, author_id, body) values (pid, u3, 'なりすまし'); r := r||E'\n× A5 コメントの投稿者を、他人の名前にはできない（通ってしまった）'; exception when others then r := r||E'\n○ A5 コメントの投稿者を、他人の名前にはできない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ A4・A5（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if pid2 is not null then
  begin insert into public.post_comments(post_id, author_id, body) values (pid2, u3, 'のぞき'); r := r||E'\n× A6 見られない投稿（private）に、コメントできない（通ってしまった）'; exception when others then r := r||E'\n○ A6 見られない投稿（private）に、コメントできない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ A6（前の手順でIDが取れなかったので、とばした）'; end if;
  if pid2 is not null then
  begin select (select count(*) from public.posts where id = pid2) into n; r := r||case when n = 0 then E'\n○ ' else E'\n× ' end||'A7 見られない投稿は、一覧にも出ない （'||n||'件／期待 0）'; exception when others then r := r||E'\n× A7 見られない投稿は、一覧にも出ない ← '||left(sqlerrm,70); end;
  else r := r||E'\n・ A7（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.delete_my_post(pid); r := r||E'\n× A8 他人の投稿は、消せない（delete_my_post）（通ってしまった）'; exception when others then r := r||E'\n○ A8 他人の投稿は、消せない（delete_my_post） → '||left(sqlerrm,70); end;
  else r := r||E'\n・ A8（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.delete_my_post(pid); r := r||E'\n○ A9 自分の投稿は消せる'; exception when others then r := r||E'\n× A9 自分の投稿は消せる ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ A9（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  if pid is not null then
  begin v := ((select deleted_at from public.posts where id = pid))::text; r := r||E'\n・ A10 消した投稿の deleted_at（空でなければ、消えた印） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ A10 消した投稿の deleted_at（空でなければ、消えた印） → エラー: '||left(sqlerrm,70); end;
  else r := r||E'\n・ A10（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  if pid2 is not null then
  begin perform public.admin_delete_post(pid2, '試験'); r := r||E'\n○ A11 管理者は、他人の投稿を消せる（admin_delete_post）'; exception when others then r := r||E'\n× A11 管理者は、他人の投稿を消せる（admin_delete_post） ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ A11（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.create_post('', null); r := r||E'\n・ A12 空の投稿（文字も画像もなし） → 通った'; exception when others then r := r||E'\n・ A12 空の投稿（文字も画像もなし） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.create_post(repeat('あ',1000), null); r := r||E'\n・ A13 1000文字の投稿 → 通った'; exception when others then r := r||E'\n・ A13 1000文字の投稿 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.create_post(repeat('あ',5000), null); r := r||E'\n・ A14 5000文字の投稿 → 通った'; exception when others then r := r||E'\n・ A14 5000文字の投稿 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.create_post(repeat('あ',20000), null); r := r||E'\n・ A15 20000文字の投稿 → 通った'; exception when others then r := r||E'\n・ A15 20000文字の投稿 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.create_post('画像', '../../etc/passwd'); r := r||E'\n・ A16 画像の場所に ../ をふくむ → 通った'; exception when others then r := r||E'\n・ A16 画像の場所に ../ をふくむ → 止められた: '||left(sqlerrm,70); end;
  begin v := public.schedule_post('予約投稿', null, 'public', now() + interval '1 hour')::text; r := r||E'\n○ A17 予約投稿（1時間後）'; exception when others then r := r||E'\n× A17 予約投稿（1時間後） ← '||left(sqlerrm,90); end;
  begin v := (v)::text; r := r||E'\n・ A17b 返り値 = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ A17b 返り値 → エラー: '||left(sqlerrm,70); end;
  begin perform public.schedule_post('過去', null, 'public', now() - interval '1 hour'); r := r||E'\n・ A18 過去の時刻の予約投稿 → 通った'; exception when others then r := r||E'\n・ A18 過去の時刻の予約投稿 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.update_scheduled_post(v::uuid, '変更後', 'public', now() + interval '2 hours'); r := r||E'\n・ A19 予約の変更 → 通った'; exception when others then r := r||E'\n・ A19 予約の変更 → 止められた: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin perform public.update_scheduled_post(v::uuid, 'のっとり', 'public', now() + interval '2 hours'); r := r||E'\n・ A20 他人の予約の変更（止まるはず） → 通った'; exception when others then r := r||E'\n・ A20 他人の予約の変更（止まるはず） → 止められた: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.cancel_scheduled_post(v::uuid); r := r||E'\n・ A21 予約のとりけし → 通った'; exception when others then r := r||E'\n・ A21 予約のとりけし → 止められた: '||left(sqlerrm,70); end;
  r := r||E'\n\n【B ストーリー】';
  begin perform public.create_story('おはよう', null, 'blue'); r := r||E'\n・ B1 ストーリーを作る → 通った'; exception when others then r := r||E'\n・ B1 ストーリーを作る → 止められた: '||left(sqlerrm,70); end;
reset role;
  select id into sid from public.stories where user_id = u1 order by created_at desc limit 1;
  begin v := ((select expires_at - created_at from public.stories where id = sid))::text; r := r||E'\n・ B2 ストーリーの長さ（期限－作成。24時間のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ B2 ストーリーの長さ（期限－作成。24時間のはず） → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  begin v := ((select count(*) from public.stories where user_id = u1))::text; r := r||E'\n・ B3 他人（フォローなし）から見えるストーリーの数 = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ B3 他人（フォローなし）から見えるストーリーの数 → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if sid is not null then
  begin perform public.delete_story(sid); r := r||E'\n× B4 他人のストーリーは、消せない（通ってしまった）'; exception when others then r := r||E'\n○ B4 他人のストーリーは、消せない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ B4（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if sid is not null then
  begin perform public.delete_story(sid); r := r||E'\n○ B5 自分のストーリーは消せる'; exception when others then r := r||E'\n× B5 自分のストーリーは消せる ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ B5（前の手順でIDが取れなかったので、とばした）'; end if;
  begin v := public.schedule_story('予約ストーリー', null, 'blue', now() + interval '1 hour')::text; r := r||E'\n・ B6 ストーリーの予約 → 通った'; exception when others then r := r||E'\n・ B6 ストーリーの予約 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.cancel_scheduled_story(v::uuid); r := r||E'\n・ B7 ストーリー予約のとりけし → 通った'; exception when others then r := r||E'\n・ B7 ストーリー予約のとりけし → 止められた: '||left(sqlerrm,70); end;
  r := r||E'\n\n【C アンケート（相互フォローの部屋）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.create_poll(rm, '好きな色は？', array['赤','青']); r := r||E'\n○ C1 アンケートを作る（2択）'; exception when others then r := r||E'\n× C1 アンケートを作る（2択） ← '||left(sqlerrm,90); end;
  begin perform public.create_poll(rm, '1つだけ', array['ひとつ']); r := r||E'\n× C2 選択肢が1つだけは、ことわる（通ってしまった）'; exception when others then r := r||E'\n○ C2 選択肢が1つだけは、ことわる → '||left(sqlerrm,70); end;
  begin perform public.create_poll(rm, '多すぎ', array['1','2','3','4','5','6','7','8','9','10','11']); r := r||E'\n・ C3 選択肢が11個 → 通った'; exception when others then r := r||E'\n・ C3 選択肢が11個 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.create_poll(rm, repeat('あ',1000), array['a','b']); r := r||E'\n・ C4 質問が1000文字 → 通った'; exception when others then r := r||E'\n・ C4 質問が1000文字 → 止められた: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  begin perform public.create_poll(rm, '外から', array['a','b']); r := r||E'\n× C5 部屋の外の人は、アンケートを作れない（通ってしまった）'; exception when others then r := r||E'\n○ C5 部屋の外の人は、アンケートを作れない → '||left(sqlerrm,70); end;
reset role;
  select id into pid from public.polls where room_id = rm and question = '好きな色は？' limit 1;
  select id into o1 from public.poll_options where poll_id = pid order by position limit 1;
  select id into o2 from public.poll_options where poll_id = pid order by position desc limit 1;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.vote_poll(pid, o1); r := r||E'\n○ C6 投票できる'; exception when others then r := r||E'\n× C6 投票できる ← '||left(sqlerrm,90); end;
  begin perform public.vote_poll(pid, o2); r := r||E'\n・ C7 投票先を変える（もう一度投票） → 通った'; exception when others then r := r||E'\n・ C7 投票先を変える（もう一度投票） → 止められた: '||left(sqlerrm,70); end;
  begin v := ((select count(*) from public.get_poll_results(pid)))::text; r := r||E'\n・ C8 結果の行数（get_poll_results） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ C8 結果の行数（get_poll_results） → エラー: '||left(sqlerrm,70); end;
  begin insert into public.poll_votes(poll_id, user_id, option_id) values (pid, u2, o1); r := r||E'\n× C9 票を、表に直接書きこめない（通ってしまった）'; exception when others then r := r||E'\n○ C9 票を、表に直接書きこめない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ C6〜C9（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.vote_poll(pid, o1); r := r||E'\n× C10 部屋の外の人は、投票できない（通ってしまった）'; exception when others then r := r||E'\n○ C10 部屋の外の人は、投票できない → '||left(sqlerrm,70); end;
  begin perform public.get_poll_results(pid); r := r||E'\n× C11 部屋の外の人は、結果を見られない（通ってしまった）'; exception when others then r := r||E'\n○ C11 部屋の外の人は、結果を見られない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ C10・C11（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.close_poll(pid); r := r||E'\n・ C12 作った人でない人が、終了しようとする → 通った'; exception when others then r := r||E'\n・ C12 作った人でない人が、終了しようとする → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ C12（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.close_poll(pid); r := r||E'\n・ C13 作った人が終了する → 通った'; exception when others then r := r||E'\n・ C13 作った人が終了する → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ C13（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if pid is not null then
  begin perform public.vote_poll(pid, o1); r := r||E'\n・ C14 終了後の投票（止まるはず） → 通った'; exception when others then r := r||E'\n・ C14 終了後の投票（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ C14（前の手順でIDが取れなかったので、とばした）'; end if;
  r := r||E'\n\n【D プロフィール】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.update_my_profile('新しい名前', '自己紹介です', '元気', null, false); r := r||E'\n○ D1 プロフィールを変える'; exception when others then r := r||E'\n× D1 プロフィールを変える ← '||left(sqlerrm,90); end;
  begin perform public.update_my_profile('', null, null, null, false); r := r||E'\n・ D2 名前が空 → 通った'; exception when others then r := r||E'\n・ D2 名前が空 → 止められた: '||left(sqlerrm,70); end;
reset role;
  begin v := ((select display_name from public.profiles where id = u1))::text; r := r||E'\n・ D2b そのあとの名前（『新しい名前』のまま＝空は無視／空になっていたら問題） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ D2b そのあとの名前（『新しい名前』のまま＝空は無視／空になっていたら問題） → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.update_my_profile(repeat('あ',31), null, null, null, false); r := r||E'\n・ D3 名前が31文字 → 通った'; exception when others then r := r||E'\n・ D3 名前が31文字 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.update_my_profile('新しい名前', repeat('あ',1000), null, null, false); r := r||E'\n・ D4 自己紹介が1000文字 → 通った'; exception when others then r := r||E'\n・ D4 自己紹介が1000文字 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.update_my_profile('新しい名前', null, null, 'javascript:alert(1)', false); r := r||E'\n・ D5 画像の場所に javascript: → 通った'; exception when others then r := r||E'\n・ D5 画像の場所に javascript: → 止められた: '||left(sqlerrm,70); end;
  begin perform public.change_my_display_name('別の名前'); r := r||E'\n・ D6 change_my_display_name → 通った'; exception when others then r := r||E'\n・ D6 change_my_display_name → 止められた: '||left(sqlerrm,70); end;
  begin perform public.change_my_display_name('試験B'); r := r||E'\n・ D7 ほかの人と同じ名前（試験B） → 通った'; exception when others then r := r||E'\n・ D7 ほかの人と同じ名前（試験B） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.set_my_presence('online'); r := r||E'\n・ D8 set_my_presence(''online'') → 通った'; exception when others then r := r||E'\n・ D8 set_my_presence(''online'') → 止められた: '||left(sqlerrm,70); end;
  begin perform public.set_my_presence('へんな値'); r := r||E'\n・ D9 set_my_presence(''へんな値'') → 通った'; exception when others then r := r||E'\n・ D9 set_my_presence(''へんな値'') → 止められた: '||left(sqlerrm,70); end;
  begin perform public.set_my_read_receipts(false); r := r||E'\n○ D10 既読の表示をオフ'; exception when others then r := r||E'\n× D10 既読の表示をオフ ← '||left(sqlerrm,90); end;
  begin update public.profiles set display_name = 'のっとり' where id = u2; r := r||E'\n× D11 他人のプロフィールを書きかえられない（通ってしまった）'; exception when others then r := r||E'\n○ D11 他人のプロフィールを書きかえられない → '||left(sqlerrm,70); end;
  r := r||E'\n\n【E 保存データ（user_prefs。予定表などが使う）】';
  begin insert into public.user_prefs(user_id, key, value) values (u1, 'itin:t', '{"a":1}'::jsonb); r := r||E'\n○ E1 自分の保存データを書ける'; exception when others then r := r||E'\n× E1 自分の保存データを書ける ← '||left(sqlerrm,90); end;
  begin insert into public.user_prefs(user_id, key, value) values (u2, 'itin:t', '{"a":1}'::jsonb); r := r||E'\n× E2 他人の名前では書けない（通ってしまった）'; exception when others then r := r||E'\n○ E2 他人の名前では書けない → '||left(sqlerrm,70); end;
  begin insert into public.user_prefs(user_id, key, value) values (u1, 'itin:big', jsonb_build_object('x', repeat('a',300000))); r := r||E'\n× E3 300KBの保存データはことわる（20KB未満）（通ってしまった）'; exception when others then r := r||E'\n○ E3 300KBの保存データはことわる（20KB未満） → '||left(sqlerrm,70); end;
  begin insert into public.user_prefs(user_id, key, value) values (u1, repeat('k',300), '{}'::jsonb); r := r||E'\n× E4 64文字をこえる名前（キー）はことわる（通ってしまった）'; exception when others then r := r||E'\n○ E4 64文字をこえる名前（キー）はことわる → '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin select (select count(*) from public.user_prefs where user_id = u1) into n; r := r||case when n = 0 then E'\n○ ' else E'\n× ' end||'E5 他人の保存データは読めない （'||n||'件／期待 0）'; exception when others then r := r||E'\n× E5 他人の保存データは読めない ← '||left(sqlerrm,70); end;
  begin update public.user_prefs set value = '{}'::jsonb where user_id = u1; get diagnostics n = row_count;
    r := r||case when n = 0 then E'\n○ E6 他人の保存データを書きかえようとしても、0行（何も変わらない）' else E'\n× E6 他人の保存データが書きかわった（'||n||'行）' end;
  exception when others then r := r||E'\n○ E6 他人の保存データの書きかえは止められた → '||left(sqlerrm,50); end;
reset role;
  begin v := ((select value from public.user_prefs where user_id = u1 and key = 'itin:t'))::text; r := r||E'\n・ E6b u1 の保存データ（{"a":1} のままのはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ E6b u1 の保存データ（{"a":1} のままのはず） → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  r := r||E'\n\n【F みんなの待ち時間（予定表）  ※送る関数は、受けつけないとき false を返します（エラーにはなりません）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin v := (public.itin_report_wait('のりものa', 12, 10))::text; r := r||E'\n・ F1 待ち時間を送る（true のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F1 待ち時間を送る（true のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('のりものa', 0, 10))::text; r := r||E'\n・ F2 0分（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F2 0分（false のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('のりものa', 301, 10))::text; r := r||E'\n・ F3 301分（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F3 301分（false のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('a', 5, 10))::text; r := r||E'\n・ F4 名前が1文字（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F4 名前が1文字（false のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('のりものb', 5, 24))::text; r := r||E'\n・ F5 時間が24（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F5 時間が24（false のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('のりものb', 5, -1))::text; r := r||E'\n・ F6 時間が-1（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F6 時間が-1（false のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('のりものa', 20, 10))::text; r := r||E'\n・ F7 同じ人が、同じ名前を10分以内にもう一度（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F7 同じ人が、同じ名前を10分以内にもう一度（false のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.itin_report_wait('のりものc', 20, 10))::text; r := r||E'\n・ F7b 別の名前なら送れる（true のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F7b 別の名前なら送れる（true のはず） → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin v := (public.itin_report_wait('のりものa', 14, 10))::text; r := r||E'\n・ F8 2人めが送る（true のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F8 2人めが送る（true のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := ((select count(*) from public.itin_wait_stats(array['のりものa'])))::text; r := r||E'\n・ F9 2人だけの間は、集計が出ない（0のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F9 2人だけの間は、集計が出ない（0のはず） → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  begin v := (public.itin_report_wait('のりものa', 16, 11))::text; r := r||E'\n・ F10 3人めが送る（true のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F10 3人めが送る（true のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := ((select count(*) from public.itin_wait_stats(array['のりものa'])))::text; r := r||E'\n・ F11 3人になると、集計が出る（1のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F11 3人になると、集計が出る（1のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := ((select q.n::text||'件 '||q.users::text||'人 平均'||q.avg_min::text||' 中央'||q.median_min::text from public.itin_wait_stats(array['のりものa']) q limit 1))::text; r := r||E'\n・ F12 集計の中身（人数・平均・中央。3件／3人／平均14／中央14 のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F12 集計の中身（人数・平均・中央。3件／3人／平均14／中央14 のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := ((select count(*) from public.itin_wait_stats((select array_agg('のりもの'||g) from generate_series(1,61) g))))::text; r := r||E'\n・ F12b 61個の名前をまとめて聞く（エラーにならず、先頭60個だけ見る） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F12b 61個の名前をまとめて聞く（エラーにならず、先頭60個だけ見る） → エラー: '||left(sqlerrm,70); end;
set local role anon;
  begin perform public.itin_report_wait('のりものa', 5, 10); r := r||E'\n× F13 ログインしていない人は、送れない（通ってしまった）'; exception when others then r := r||E'\n○ F13 ログインしていない人は、送れない → '||left(sqlerrm,70); end;
  begin perform public.itin_wait_stats(array['のりものa']); r := r||E'\n× F14 ログインしていない人は、集計を見られない（通ってしまった）'; exception when others then r := r||E'\n○ F14 ログインしていない人は、集計を見られない → '||left(sqlerrm,70); end;
reset role;
  begin select (select count(*) from public.itin_wait_reports where user_id in (u1,u2,u3)) into n; r := r||case when n = 4 then E'\n○ ' else E'\n× ' end||'F15 表を直接読めない（ふつうのユーザー）— ここは postgres で確認：行は存在 （'||n||'件／期待 4）'; exception when others then r := r||E'\n× F15 表を直接読めない（ふつうのユーザー）— ここは postgres で確認：行は存在 ← '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform 1 from public.itin_wait_reports limit 1; r := r||E'\n× F16 ふつうのユーザーは、記録の表を直接読めない（通ってしまった）'; exception when others then r := r||E'\n○ F16 ふつうのユーザーは、記録の表を直接読めない → '||left(sqlerrm,70); end;
reset role;
  reset role;
  raise exception E'RESULT:%', r;   -- わざと止めて、ぜんぶ巻き戻す
end $t$;
