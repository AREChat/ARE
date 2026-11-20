-- 試験3b：試験3で、前提がちがったところのやり直し（正しい種類名で）（巻き戻し）  2026-11-20
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）の SQL Editor に、全文を貼って Run します。
-- 最後に「ERROR: RESULT:…」と出ます。これは、わざと出している終わりの合図で、巻き戻しのしるしです（失敗ではありません）。
-- 出てきた「RESULT:」から後ろの文を、全部コピーして送ってください。
-- 試験用のユーザーは、この中で作って、最後に巻き戻します。本物のユーザーのデータは、1つも変わりません。
-- ○＝期待どおり ／ ×＝期待とちがう ／ ・＝記録（通った・止められた、どちらでもよいが、結果を知りたいもの）

do $t$
declare
  adm uuid := '9d660098-27f5-4933-bdce-d0ea7a6f08b4';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  rm uuid; item uuid; item2 uuid; ws uuid; ex uuid; ex2 uuid; board uuid; gm uuid; pts0 integer; pts1 integer; k text; rec record;
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
  r := r||E'\n\n【A ポイントを付ける（+500）—— 前回は、ふえた数の測りかたがまちがっていました】';
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.admin_grant_points(u1, 500); r := r||E'\n○ A1 管理者は、ポイントを付けられる（+500）'; exception when others then r := r||E'\n× A1 管理者は、ポイントを付けられる（+500） ← '||left(sqlerrm,90); end;
reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||case when pts1 - pts0 = 500 then E'\n○ A1b ちょうど500ふえた' else E'\n× A1b ふえた数がちがう（'||(pts1-pts0)::text||'）' end;
  r := r||E'\n\n【B ショップ（種類は video / story）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.admin_shop_upsert(null, 'story', '不正', '説明', 1, true, '本文', null); r := r||E'\n× B1 ふつうのユーザーは、商品を登録できない（通ってしまった）'; exception when others then r := r||E'\n○ B1 ふつうのユーザーは、商品を登録できない → '||left(sqlerrm,70); end;
reset role;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin item := (public.admin_shop_upsert(null, 'story', '試験の物語', '試験用', 50, true, 'ひみつの本文', null))::uuid; r := r||E'\n○ B2 管理者が、物語の商品を登録（50ポイント）'; exception when others then item := null; r := r||E'\n・ B2 管理者が、物語の商品を登録（50ポイント） → IDが取れなかった: '||left(sqlerrm,60); end;
  begin perform public.admin_shop_upsert(null, 'story', 'マイナス', '説明', -10, true, '本文', null); r := r||E'\n・ B2b 値段がマイナスの商品 → 通った'; exception when others then r := r||E'\n・ B2b 値段がマイナスの商品 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.admin_shop_upsert(null, 'story', 'ただ', '説明', 0, true, '本文', null); r := r||E'\n・ B2c 値段が0の商品 → 通った'; exception when others then r := r||E'\n・ B2c 値段が0の商品 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.admin_shop_upsert(null, 'video', '動画', '説明', 50, true, null, null); r := r||E'\n・ B2d 動画の商品（動画の場所なし） → 通った'; exception when others then r := r||E'\n・ B2d 動画の商品（動画の場所なし） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.admin_shop_upsert(null, 'video', '動画2', '説明', 50, true, null, '../../x.mp4'); r := r||E'\n・ B2e 動画の商品（../ をふくむ場所） → 通った'; exception when others then r := r||E'\n・ B2e 動画の商品（../ をふくむ場所） → 止められた: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin v := ((select count(*) from public.shop_list()))::text; r := r||E'\n・ B3 shop_list の行数（u1） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ B3 shop_list の行数（u1） → エラー: '||left(sqlerrm,70); end;
  if item is not null then
  reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.shop_buy(item); r := r||E'\n○ B4 ポイントが足りれば、買える'; exception when others then r := r||E'\n× B4 ポイントが足りれば、買える ← '||left(sqlerrm,90); end;
  reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||case when pts0 - pts1 = 50 then E'\n○ B4b 50ポイント減った' else E'\n× B4b 減った数がちがう（'||(pts0-pts1)::text||'）' end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.shop_buy(item); r := r||E'\n・ B5 同じ商品を、もう一度買う → 通った'; exception when others then r := r||E'\n・ B5 同じ商品を、もう一度買う → 止められた: '||left(sqlerrm,70); end;
  reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
  r := r||E'\n・ B5b 2回めのあとのポイント（さらに減っていたら、二重に買えている） = '||pts0::text;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin v := public.shop_content(item)::text; r := r||E'\n○ B6 買った人は、中身を見られる'; exception when others then r := r||E'\n× B6 買った人は、中身を見られる ← '||left(sqlerrm,90); end;
  begin v := (v)::text; r := r||E'\n・ B6b 中身（ひみつの本文のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ B6b 中身（ひみつの本文のはず） → エラー: '||left(sqlerrm,70); end;
  else r := r||E'\n・ B4〜B6（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if item is not null then
  begin perform public.shop_buy(item); r := r||E'\n× B7 ポイントが足りない人は、買えない（通ってしまった）'; exception when others then r := r||E'\n○ B7 ポイントが足りない人は、買えない → '||left(sqlerrm,70); end;
  begin perform public.shop_content(item); r := r||E'\n× B8 買っていない人は、中身を見られない（通ってしまった）'; exception when others then r := r||E'\n○ B8 買っていない人は、中身を見られない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ B7・B8（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  if item is not null then
  begin perform public.admin_shop_upsert(item, 'story', '試験の物語', '試験用', 50, false, 'ひみつの本文', null); r := r||E'\n・ B9 管理者が、商品を非公開にする → 通った'; exception when others then r := r||E'\n・ B9 管理者が、商品を非公開にする → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ B9（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if item is not null then
  begin perform public.shop_buy(item); r := r||E'\n× B10 非公開の商品は、買えない（通ってしまった）'; exception when others then r := r||E'\n○ B10 非公開の商品は、買えない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ B10（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  if item is not null then
  begin perform public.admin_shop_delete(item); r := r||E'\n・ B11 管理者が、商品を消す → 通った'; exception when others then r := r||E'\n・ B11 管理者が、商品を消す → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ B11（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  r := r||E'\n\n【D カードゲーム（baba / tomo / indian / uso）】';
  for k in select unnest(array['baba','tomo','indian','uso']) loop
    gm := null;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
    begin gm := (public.cg_create(rm, k))::uuid; r := r||E'\n○ D1 '||k||' をつくる'; exception when others then r := r||E'\n× D1 '||k||' → '||left(sqlerrm,60); end;
    if gm is not null then
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
      begin perform public.cg_join(gm); r := r||E'\n○ D2 '||k||' に相手が参加'; exception when others then r := r||E'\n× D2 '||k||' 参加 → '||left(sqlerrm,60); end;
      begin v := length(public.cg_view(gm)::text)::text; r := r||E'\n・ D3 '||k||' 盤の見え方の長さ='||v; exception when others then r := r||E'\n× D3 '||k||' 盤を見る → '||left(sqlerrm,60); end;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
      begin perform public.cg_join(gm); r := r||E'\n× D4 '||k||' 部屋の外の人が参加できた'; exception when others then r := r||E'\n○ D4 '||k||' 部屋の外の人は参加できない → '||left(sqlerrm,40); end;
      begin perform public.cg_view(gm); r := r||E'\n× D5 '||k||' 部屋の外の人が盤を見られた'; exception when others then r := r||E'\n○ D5 '||k||' 部屋の外の人は盤を見られない → '||left(sqlerrm,40); end;
      begin perform public.cg_act(gm, 'play', '{}'::jsonb); r := r||E'\n× D6 '||k||' 部屋の外の人が手を打てた'; exception when others then r := r||E'\n○ D6 '||k||' 部屋の外の人は手を打てない → '||left(sqlerrm,40); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
      begin perform public.cg_act(gm, 'zzz_unknown_action', '{}'::jsonb); r := r||E'\n・ D7 '||k||' ないアクション → 通った'; exception when others then r := r||E'\n・ D7 '||k||' ないアクション → 止められた: '||left(sqlerrm,40); end;
      begin perform public.cg_create(rm, k); r := r||E'\n・ D8 '||k||' 続けて2つめをつくる → 通った'; exception when others then r := r||E'\n・ D8 '||k||' 続けて2つめ → 止められた: '||left(sqlerrm,40); end;
    end if;
  end loop;
reset role;
  r := r||E'\n\n【H 仕事ツール：経費・日程調整・メンバー一覧】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin ws := (public.ws_create('試験WS2'))::uuid; r := r||E'\n○ H1 ワークスペースをつくる'; exception when others then ws := null; r := r||E'\n・ H1 ワークスペースをつくる → IDが取れなかった: '||left(sqlerrm,60); end;
  if ws is not null then
  begin perform public.ws_add_member(ws, u2); r := r||E'\n○ H2 メンバー（u2）を追加'; exception when others then r := r||E'\n× H2 メンバー（u2）を追加 ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ H2（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if ws is not null then
  begin v := ((select count(*) from public.ws_members(ws)))::text; r := r||E'\n・ H3 メンバーでない人から見える、メンバー一覧の行数（0のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ H3 メンバーでない人から見える、メンバー一覧の行数（0のはず） → エラー: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H3（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if ws is not null then
  begin v := ((select count(*) from public.ws_members(ws)))::text; r := r||E'\n・ H4 メンバーから見える、メンバー一覧の行数（2のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ H4 メンバーから見える、メンバー一覧の行数（2のはず） → エラー: '||left(sqlerrm,70); end;
  begin ex := (public.exp_submit(ws, 1000, 'transport', '電車', current_date))::uuid; r := r||E'\n○ H5 経費を申請（交通費 1000円）'; exception when others then ex := null; r := r||E'\n・ H5 経費を申請（交通費 1000円） → IDが取れなかった: '||left(sqlerrm,60); end;
  begin ex2 := (public.exp_submit(ws, 500, 'meal', '昼食', current_date))::uuid; r := r||E'\n○ H5b 経費を申請（食事 500円）'; exception when others then ex2 := null; r := r||E'\n・ H5b 経費を申請（食事 500円） → IDが取れなかった: '||left(sqlerrm,60); end;
  begin perform public.exp_submit(ws, -5, 'transport', '電車', current_date); r := r||E'\n× H6 マイナスの金額は申請できない（通ってしまった）'; exception when others then r := r||E'\n○ H6 マイナスの金額は申請できない → '||left(sqlerrm,70); end;
  begin perform public.exp_submit(ws, 0, 'transport', '電車', current_date); r := r||E'\n× H7 0円は申請できない（通ってしまった）'; exception when others then r := r||E'\n○ H7 0円は申請できない → '||left(sqlerrm,70); end;
  begin perform public.exp_submit(ws, 100000000, 'transport', '電車', current_date); r := r||E'\n・ H8 とても大きい金額（1億円） → 通った'; exception when others then r := r||E'\n・ H8 とても大きい金額（1億円） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.exp_submit(ws, 100, 'zzz', '電車', current_date); r := r||E'\n× H9 ないカテゴリは、ことわる（通ってしまった）'; exception when others then r := r||E'\n○ H9 ないカテゴリは、ことわる → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H4〜H9（前の手順でIDが取れなかったので、とばした）'; end if;
  if ex is not null then
  begin perform public.exp_decide(ex, true, '自分で'); r := r||E'\n× H10 自分の申請を、自分で承認できない（通ってしまった）'; exception when others then r := r||E'\n○ H10 自分の申請を、自分で承認できない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H10（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if ex is not null then
  begin perform public.exp_decide(ex, true, 'よそから'); r := r||E'\n× H11 メンバーでない人は、承認できない（通ってしまった）'; exception when others then r := r||E'\n○ H11 メンバーでない人は、承認できない → '||left(sqlerrm,70); end;
  begin perform public.exp_withdraw(ex); r := r||E'\n× H12 メンバーでない人は、取り下げられない（通ってしまった）'; exception when others then r := r||E'\n○ H12 メンバーでない人は、取り下げられない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H11・H12（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if ex is not null then
  begin perform public.exp_decide(ex, true, 'OK'); r := r||E'\n○ H13 ワークスペースの管理者は、承認できる'; exception when others then r := r||E'\n× H13 ワークスペースの管理者は、承認できる ← '||left(sqlerrm,90); end;
  begin perform public.exp_decide(ex, false, 'やっぱりだめ'); r := r||E'\n・ H13b 承認ずみのものを、もう一度決める → 通った'; exception when others then r := r||E'\n・ H13b 承認ずみのものを、もう一度決める → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H13（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if ex is not null then
  begin perform public.exp_withdraw(ex); r := r||E'\n・ H14 承認ずみの申請を取り下げる（止まるはず） → 通った'; exception when others then r := r||E'\n・ H14 承認ずみの申請を取り下げる（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H14（前の手順でIDが取れなかったので、とばした）'; end if;
  if ex2 is not null then
  begin perform public.exp_withdraw(ex2); r := r||E'\n○ H15 まだ決まっていない申請は、取り下げられる'; exception when others then r := r||E'\n× H15 まだ決まっていない申請は、取り下げられる ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ H15（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin board := (public.sb_create(rm, '日程', array['月','火']))::uuid; r := r||E'\n○ H16 日程調整ボード'; exception when others then board := null; r := r||E'\n・ H16 日程調整ボード → IDが取れなかった: '||left(sqlerrm,60); end;
  if board is not null then
  begin perform public.sb_vote(board, 0, 'o'); r := r||E'\n○ H17 投票（0番・o）'; exception when others then r := r||E'\n× H17 投票（0番・o） ← '||left(sqlerrm,90); end;
  begin perform public.sb_vote(board, 1, 't'); r := r||E'\n○ H18 投票（1番・t）'; exception when others then r := r||E'\n× H18 投票（1番・t） ← '||left(sqlerrm,90); end;
  begin perform public.sb_vote(board, 0, 'x'); r := r||E'\n○ H19 投票（0番・x に変える）'; exception when others then r := r||E'\n× H19 投票（0番・x に変える） ← '||left(sqlerrm,90); end;
  begin perform public.sb_vote(board, 0, ''); r := r||E'\n○ H20 投票を消す（空）'; exception when others then r := r||E'\n× H20 投票を消す（空） ← '||left(sqlerrm,90); end;
  begin perform public.sb_vote(board, 0, 'q'); r := r||E'\n× H21 ない種類の投票（q）は、ことわる（通ってしまった）'; exception when others then r := r||E'\n○ H21 ない種類の投票（q）は、ことわる → '||left(sqlerrm,70); end;
  begin perform public.sb_vote(board, -1, 'o'); r := r||E'\n× H22 ない番号（-1）は、ことわる（通ってしまった）'; exception when others then r := r||E'\n○ H22 ない番号（-1）は、ことわる → '||left(sqlerrm,70); end;
  begin perform public.sb_vote(board, 5, 'o'); r := r||E'\n× H23 ない番号（5）は、ことわる（通ってしまった）'; exception when others then r := r||E'\n○ H23 ない番号（5）は、ことわる → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H17〜H23（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if board is not null then
  begin perform public.sb_vote(board, 0, 'o'); r := r||E'\n× H24 部屋の外の人は、投票できない（通ってしまった）'; exception when others then r := r||E'\n○ H24 部屋の外の人は、投票できない → '||left(sqlerrm,70); end;
  begin perform public.sb_close(board, true); r := r||E'\n× H25 部屋の外の人は、閉じられない（通ってしまった）'; exception when others then r := r||E'\n○ H25 部屋の外の人は、閉じられない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H24・H25（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if board is not null then
  begin perform public.sb_close(board, true); r := r||E'\n○ H26 つくった人は、閉じられる'; exception when others then r := r||E'\n× H26 つくった人は、閉じられる ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ H26（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if board is not null then
  begin perform public.sb_vote(board, 0, 'o'); r := r||E'\n× H27 閉じたあとは、投票できない（通ってしまった）'; exception when others then r := r||E'\n○ H27 閉じたあとは、投票できない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H27（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  reset role;
  raise exception E'RESULT:%', r;   -- わざと止めて、ぜんぶ巻き戻す
end $t$;
