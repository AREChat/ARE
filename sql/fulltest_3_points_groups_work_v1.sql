-- 試験3：ポイント・ショップ・ゲーム・グループ・招待・退会・仕事ツール（巻き戻し）  2026-11-20
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）の SQL Editor に、全文を貼って Run します。
-- 最後に「ERROR: RESULT:…」と出ます。これは、わざと出している終わりの合図で、巻き戻しのしるしです（失敗ではありません）。
-- 出てきた「RESULT:」から後ろの文を、全部コピーして送ってください。
-- 試験用のユーザーは、この中で作って、最後に巻き戻します。本物のユーザーのデータは、1つも変わりません。
-- ○＝期待どおり ／ ×＝期待とちがう ／ ・＝記録（通った・止められた、どちらでもよいが、結果を知りたいもの）

do $t$
declare
  adm uuid := '9d660098-27f5-4933-bdce-d0ea7a6f08b4';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  rm uuid; grp uuid; item uuid; ws uuid; note uuid; proj uuid; ex uuid; mrm uuid; bk uuid; board uuid; gm uuid; inv uuid;
  pts0 integer; pts1 integer; k text; rec record;
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
  r := r||E'\n\n【A ポイント】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
  begin perform public.claim_daily_bonus(); r := r||E'\n○ A1 デイリーボーナスをもらう'; exception when others then r := r||E'\n× A1 デイリーボーナスをもらう ← '||left(sqlerrm,90); end;
reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||E'\n・ A1b デイリーボーナスで増えたポイント = '||(pts1 - pts0)::text;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
  begin perform public.claim_daily_bonus(); r := r||E'\n・ A2 同じ日に、もう一度もらう → 通った'; exception when others then r := r||E'\n・ A2 同じ日に、もう一度もらう → 止められた: '||left(sqlerrm,70); end;
reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||case when pts1 = pts0 then E'\n○ A2b 同じ日の2回目は、増えない' else E'\n× A2b 同じ日の2回目で増えた（+'||(pts1-pts0)::text||'）' end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
  for i in 1..3 loop begin insert into public.messages(room_id,sender_id,content) values (rm,u1,'ポイント確認'||i); exception when others then null; end; end loop;
reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||E'\n・ A3 メッセージ3通で増えたポイント = '||(pts1 - pts0)::text;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin v := ((select count(*) from public.point_history()))::text; r := r||E'\n・ A4 point_history の行数 = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ A4 point_history の行数 → エラー: '||left(sqlerrm,70); end;
  begin perform public.admin_grant_points(u1, 1000); r := r||E'\n× A5 ふつうのユーザーは、ポイントを付けられない（admin_grant_points）（通ってしまった）'; exception when others then r := r||E'\n○ A5 ふつうのユーザーは、ポイントを付けられない（admin_grant_points） → '||left(sqlerrm,70); end;
  begin update public.user_points set points = 999999 where user_id = u1; r := r||E'\n× A6 ポイントの表を直接書きかえられない（通ってしまった）'; exception when others then r := r||E'\n○ A6 ポイントの表を直接書きかえられない → '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
  begin perform public.admin_grant_points(u1, 500); r := r||E'\n○ A7 管理者は、ポイントを付けられる（+500）'; exception when others then r := r||E'\n× A7 管理者は、ポイントを付けられる（+500） ← '||left(sqlerrm,90); end;
reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||case when pts1 - pts0 = 500 then E'\n○ A7b 500ふえた' else E'\n× A7b ふえた数がちがう（'||(pts1-pts0)::text||'）' end;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.admin_grant_points(u1, -100000); r := r||E'\n・ A8 管理者が、ポイントを大きく引く（-100000） → 通った'; exception when others then r := r||E'\n・ A8 管理者が、ポイントを大きく引く（-100000） → 止められた: '||left(sqlerrm,70); end;
reset role;
  begin v := ((select points from public.user_points where user_id = u1))::text; r := r||E'\n・ A8b そのあとのポイント（0未満にならないのが望ましい） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ A8b そのあとのポイント（0未満にならないのが望ましい） → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin perform public.admin_grant_points(u1, 1000); r := r||E'\n・ A8c ポイントを戻す（+1000） → 通った'; exception when others then r := r||E'\n・ A8c ポイントを戻す（+1000） → 止められた: '||left(sqlerrm,70); end;
reset role;
  r := r||E'\n\n【B ショップ】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.admin_shop_upsert(null, 'text', '不正', '説明', 1, true, '本文', null); r := r||E'\n× B1 ふつうのユーザーは、商品を登録できない（通ってしまった）'; exception when others then r := r||E'\n○ B1 ふつうのユーザーは、商品を登録できない → '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin item := (public.admin_shop_upsert(null, 'text', '試験の品', '試験用', 50, true, 'ひみつの本文', null))::uuid; r := r||E'\n○ B2 管理者が商品を登録（50ポイント）'; exception when others then item := null; r := r||E'\n・ B2 管理者が商品を登録（50ポイント） → IDが取れなかった: '||left(sqlerrm,60); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin v := ((select count(*) from public.shop_list()))::text; r := r||E'\n・ B3 shop_list の行数（u1） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ B3 shop_list の行数（u1） → エラー: '||left(sqlerrm,70); end;
  if item is not null then
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts0;
  begin perform public.shop_buy(item); r := r||E'\n○ B4 ポイントが足りれば買える'; exception when others then r := r||E'\n× B4 ポイントが足りれば買える ← '||left(sqlerrm,90); end;
  reset role;
  select coalesce((select points from public.user_points where user_id = u1), 0) into pts1;
  r := r||E'\n・ B4b 買って減ったポイント（50のはず） = '||(pts0 - pts1)::text;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.shop_buy(item); r := r||E'\n・ B5 同じ商品を、もう一度買う → 通った'; exception when others then r := r||E'\n・ B5 同じ商品を、もう一度買う → 止められた: '||left(sqlerrm,70); end;
  begin perform public.shop_content(item); r := r||E'\n○ B6 買った人は、中身を見られる（shop_content）'; exception when others then r := r||E'\n× B6 買った人は、中身を見られる（shop_content） ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ B4〜B6（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if item is not null then
  begin perform public.shop_buy(item); r := r||E'\n× B7 ポイントが足りない人は、買えない（通ってしまった）'; exception when others then r := r||E'\n○ B7 ポイントが足りない人は、買えない → '||left(sqlerrm,70); end;
  begin perform public.shop_content(item); r := r||E'\n× B8 買っていない人は、中身を見られない（通ってしまった）'; exception when others then r := r||E'\n○ B8 買っていない人は、中身を見られない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ B7・B8（前の手順でIDが取れなかったので、とばした）'; end if;
  begin perform 1 from public.shop_item_content limit 1; r := r||E'\n× B9 中身の表を直接読めない（通ってしまった）'; exception when others then r := r||E'\n○ B9 中身の表を直接読めない → '||left(sqlerrm,70); end;
reset role;
  r := r||E'\n\n【C ゲームのスコア】';
  begin select game into k from public.game_scores limit 1; exception when others then k := null; end;
  k := coalesce(k, 'emoji_shiri');
  r := r||E'\n・ C0 使うゲーム名 = '||k;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.submit_game_score(k, 10); r := r||E'\n○ C1 スコアを送れる'; exception when others then r := r||E'\n× C1 スコアを送れる ← '||left(sqlerrm,90); end;
  begin perform public.submit_game_score(k, -5); r := r||E'\n・ C2 マイナスのスコア → 通った'; exception when others then r := r||E'\n・ C2 マイナスのスコア → 止められた: '||left(sqlerrm,70); end;
  begin perform public.submit_game_score(k, 2000000000); r := r||E'\n・ C3 とても大きいスコア（20億） → 通った'; exception when others then r := r||E'\n・ C3 とても大きいスコア（20億） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.submit_game_score('zzz_unknown_game', 1); r := r||E'\n・ C4 ないゲーム名 → 通った'; exception when others then r := r||E'\n・ C4 ないゲーム名 → 止められた: '||left(sqlerrm,70); end;
  begin perform public.submit_game_score('', 1); r := r||E'\n・ C5 ゲーム名が空 → 通った'; exception when others then r := r||E'\n・ C5 ゲーム名が空 → 止められた: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin v := ((select count(*) from public.game_ranking(k)))::text; r := r||E'\n・ C6 ランキングの行数（u2から） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ C6 ランキングの行数（u2から） → エラー: '||left(sqlerrm,70); end;
  begin v := ((select count(*) from public.my_game_stats()))::text; r := r||E'\n・ C7 自分の成績（my_game_stats）の行数 = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ C7 自分の成績（my_game_stats）の行数 → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin insert into public.game_scores(user_id, game, score) values (u1, k, 99999); r := r||E'\n× C8 スコアの表を直接書けない（通ってしまった）'; exception when others then r := r||E'\n○ C8 スコアの表を直接書けない → '||left(sqlerrm,70); end;
set local role anon;
  begin perform public.submit_game_score(k, 1); r := r||E'\n× C9 ログインしていない人は、スコアを送れない（通ってしまった）'; exception when others then r := r||E'\n○ C9 ログインしていない人は、スコアを送れない → '||left(sqlerrm,70); end;
reset role;
  r := r||E'\n\n【D カードゲーム（対戦）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin gm := (public.cg_create(rm, 'daifugo'))::uuid; r := r||E'\n○ D1 対戦をつくる（daifugo）'; exception when others then gm := null; r := r||E'\n・ D1 対戦をつくる（daifugo） → IDが取れなかった: '||left(sqlerrm,60); end;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if gm is not null then
  begin perform public.cg_join(gm); r := r||E'\n・ D2 部屋の相手が参加 → 通った'; exception when others then r := r||E'\n・ D2 部屋の相手が参加 → 止められた: '||left(sqlerrm,70); end;
  begin v := (length(public.cg_view(gm)::text))::text; r := r||E'\n・ D3 盤の見え方（cg_view）の長さ = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ D3 盤の見え方（cg_view）の長さ → エラー: '||left(sqlerrm,70); end;
  else r := r||E'\n・ D2・D3（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if gm is not null then
  begin perform public.cg_join(gm); r := r||E'\n× D4 部屋の外の人は、参加できない（通ってしまった）'; exception when others then r := r||E'\n○ D4 部屋の外の人は、参加できない → '||left(sqlerrm,70); end;
  begin perform public.cg_view(gm); r := r||E'\n× D5 部屋の外の人は、盤を見られない（通ってしまった）'; exception when others then r := r||E'\n○ D5 部屋の外の人は、盤を見られない → '||left(sqlerrm,70); end;
  begin perform public.cg_act(gm, 'play', '{}'::jsonb); r := r||E'\n× D6 部屋の外の人は、手を打てない（通ってしまった）'; exception when others then r := r||E'\n○ D6 部屋の外の人は、手を打てない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ D4〜D6（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform 1 from public.card_game_hands limit 1; r := r||E'\n× D7 カードの手札の表を直接読めない（通ってしまった）'; exception when others then r := r||E'\n○ D7 カードの手札の表を直接読めない → '||left(sqlerrm,70); end;
  begin perform public.cg_create(rm, 'zzz_unknown'); r := r||E'\n・ D8 ないゲーム名で、対戦をつくる → 通った'; exception when others then r := r||E'\n・ D8 ないゲーム名で、対戦をつくる → 止められた: '||left(sqlerrm,70); end;
reset role;
  r := r||E'\n\n【E グループ】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.create_group('試験グループ', array[u2], '案内文'); r := r||E'\n・ E1 グループをつくる（u2を入れる） → 通った'; exception when others then r := r||E'\n・ E1 グループをつくる（u2を入れる） → 止められた: '||left(sqlerrm,70); end;
reset role;
  select id into grp from public.chat_rooms where is_group and name = '試験グループ' limit 1;
  begin v := (grp)::text; r := r||E'\n・ E1b グループのID = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ E1b グループのID → エラー: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if grp is not null then
  begin perform public.add_group_members(grp, array[u3]); r := r||E'\n・ E2 u3（フォローしていない人）を追加 → 通った'; exception when others then r := r||E'\n・ E2 u3（フォローしていない人）を追加 → 止められた: '||left(sqlerrm,70); end;
  begin insert into public.messages(room_id,sender_id,content) values (grp,u1,'グループ最初'); r := r||E'\n○ E3 つくった人は、グループに書ける'; exception when others then r := r||E'\n× E3 つくった人は、グループに書ける ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ E2・E3（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if grp is not null then
  begin insert into public.messages(room_id,sender_id,content) values (grp,u2,'メンバーです'); r := r||E'\n○ E4 メンバーは、グループに書ける'; exception when others then r := r||E'\n× E4 メンバーは、グループに書ける ← '||left(sqlerrm,90); end;
  begin perform public.update_group_info(grp, '乗っ取り名', '案内'); r := r||E'\n・ E5 つくった人ではないメンバーが、グループ名を変える → 通った'; exception when others then r := r||E'\n・ E5 つくった人ではないメンバーが、グループ名を変える → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ E4・E5（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if grp is not null then
  begin insert into public.messages(room_id,sender_id,content) values (grp,u4,'のぞき'); r := r||E'\n× E6 メンバーでない人は、グループに書けない（通ってしまった）'; exception when others then r := r||E'\n○ E6 メンバーでない人は、グループに書けない → '||left(sqlerrm,70); end;
  begin select (select count(*) from public.messages where room_id = grp) into n; r := r||case when n = 0 then E'\n○ ' else E'\n× ' end||'E7 メンバーでない人は、グループのメッセージを読めない （'||n||'件／期待 0）'; exception when others then r := r||E'\n× E7 メンバーでない人は、グループのメッセージを読めない ← '||left(sqlerrm,70); end;
  begin perform public.add_group_members(grp, array[u4]); r := r||E'\n× E8 メンバーでない人は、メンバーを追加できない（通ってしまった）'; exception when others then r := r||E'\n○ E8 メンバーでない人は、メンバーを追加できない → '||left(sqlerrm,70); end;
  begin perform public.update_group_info(grp, 'x', 'y'); r := r||E'\n× E9 メンバーでない人は、グループ情報を変えられない（通ってしまった）'; exception when others then r := r||E'\n○ E9 メンバーでない人は、グループ情報を変えられない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ E6〜E9（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if grp is not null then
  begin perform public.leave_group(grp); r := r||E'\n○ E10 メンバーは、ぬけられる'; exception when others then r := r||E'\n× E10 メンバーは、ぬけられる ← '||left(sqlerrm,90); end;
  begin insert into public.messages(room_id,sender_id,content) values (grp,u2,'ぬけたあと'); r := r||E'\n× E11 ぬけたあとは、書けない（通ってしまった）'; exception when others then r := r||E'\n○ E11 ぬけたあとは、書けない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ E10・E11（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  begin perform public.create_group('だれもいない', array[u3], 'x'); r := r||E'\n・ E12 フォローしていない人だけで、グループをつくる → 通った'; exception when others then r := r||E'\n・ E12 フォローしていない人だけで、グループをつくる → 止められた: '||left(sqlerrm,70); end;
  begin perform public.create_group('おおぜい', (select array_agg(gen_random_uuid()) from generate_series(1,60)), 'x'); r := r||E'\n・ E13 実在しない人を60人入れる → 通った'; exception when others then r := r||E'\n・ E13 実在しない人を60人入れる → 止められた: '||left(sqlerrm,70); end;
  r := r||E'\n\n【F 招待リンク】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  k := encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  if grp is not null then
  begin perform public.create_room_invite(grp, k, 24); r := r||E'\n○ F1 招待をつくる（24時間）'; exception when others then r := r||E'\n× F1 招待をつくる（24時間） ← '||left(sqlerrm,90); end;
  begin v := ((select count(*) from public.list_room_invites(grp)))::text; r := r||E'\n・ F2 招待の一覧の行数（メンバー） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ F2 招待の一覧の行数（メンバー） → エラー: '||left(sqlerrm,70); end;
  else r := r||E'\n・ F1・F2（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if grp is not null then
  begin perform public.list_room_invites(grp); r := r||E'\n× F3 メンバーでない人は、招待の一覧を見られない（通ってしまった）'; exception when others then r := r||E'\n○ F3 メンバーでない人は、招待の一覧を見られない → '||left(sqlerrm,70); end;
  begin perform public.accept_room_invite('zzzz'); r := r||E'\n× F4 まちがった合言葉では入れない（通ってしまった）'; exception when others then r := r||E'\n○ F4 まちがった合言葉では入れない → '||left(sqlerrm,70); end;
  begin perform public.accept_room_invite(k); r := r||E'\n・ F5 正しい合言葉で入る → 通った'; exception when others then r := r||E'\n・ F5 正しい合言葉で入る → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ F3〜F5（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  if grp is not null then
  begin select (select count(*) from public.chat_room_members where room_id = grp and user_id = u4) into n; r := r||case when n = 1 then E'\n○ ' else E'\n× ' end||'F6 u4がメンバーになった （'||n||'件／期待 1）'; exception when others then r := r||E'\n× F6 u4がメンバーになった ← '||left(sqlerrm,70); end;
  else r := r||E'\n・ F6（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  k := encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  if grp is not null then
  begin perform public.create_room_invite(grp, k, 0); r := r||E'\n・ F7 期限0時間の招待をつくる → 通った'; exception when others then r := r||E'\n・ F7 期限0時間の招待をつくる → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ F7（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  if grp is not null then
  begin perform public.accept_room_invite(k); r := r||E'\n・ F8 期限0時間の招待で入ろうとする（止まるはず） → 通った'; exception when others then r := r||E'\n・ F8 期限0時間の招待で入ろうとする（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ F8（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  r := r||E'\n\n【G 退会の申しこみ】';
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin perform public.request_account_deletion('試験'); r := r||E'\n○ G1 退会を申しこめる'; exception when others then r := r||E'\n× G1 退会を申しこめる ← '||left(sqlerrm,90); end;
  begin perform public.cancel_account_deletion_request(); r := r||E'\n○ G2 申しこみを取り消せる'; exception when others then r := r||E'\n× G2 申しこみを取り消せる ← '||left(sqlerrm,90); end;
  begin perform public.admin_list_account_deletion_requests(); r := r||E'\n× G3 ふつうのユーザーは、申しこみの一覧を見られない（通ってしまった）'; exception when others then r := r||E'\n○ G3 ふつうのユーザーは、申しこみの一覧を見られない → '||left(sqlerrm,70); end;
reset role;
  r := r||E'\n\n【H 仕事ツール（ワークスペース・メモ・案件・勤怠・経費・会議室・日程調整）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin ws := (public.ws_create('試験WS'))::uuid; r := r||E'\n○ H1 ワークスペースをつくる'; exception when others then ws := null; r := r||E'\n・ H1 ワークスペースをつくる → IDが取れなかった: '||left(sqlerrm,60); end;
  if ws is not null then
  begin perform public.ws_add_member(ws, u2); r := r||E'\n○ H2 メンバーを追加'; exception when others then r := r||E'\n× H2 メンバーを追加 ← '||left(sqlerrm,90); end;
  begin v := ((select count(*) from public.ws_members(ws)))::text; r := r||E'\n・ H3 メンバー一覧の行数（2のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ H3 メンバー一覧の行数（2のはず） → エラー: '||left(sqlerrm,70); end;
  begin v := (public.ws_is_admin(ws))::text; r := r||E'\n・ H3b ws_is_admin（作った人はtrueのはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ H3b ws_is_admin（作った人はtrueのはず） → エラー: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H2・H3（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if ws is not null then
  begin perform public.ws_members(ws); r := r||E'\n× H4 メンバーでない人は、一覧を見られない（通ってしまった）'; exception when others then r := r||E'\n○ H4 メンバーでない人は、一覧を見られない → '||left(sqlerrm,70); end;
  begin perform public.ws_add_member(ws, u4); r := r||E'\n× H5 メンバーでない人は、メンバーを追加できない（通ってしまった）'; exception when others then r := r||E'\n○ H5 メンバーでない人は、メンバーを追加できない → '||left(sqlerrm,70); end;
  begin perform public.ws_set_role(ws, u4, 'admin'); r := r||E'\n× H6 メンバーでない人は、役を変えられない（通ってしまった）'; exception when others then r := r||E'\n○ H6 メンバーでない人は、役を変えられない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H4〜H6（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if ws is not null then
  begin note := (public.note_create(ws, '議事録'))::uuid; r := r||E'\n○ H7 メモをつくる'; exception when others then note := null; r := r||E'\n・ H7 メモをつくる → IDが取れなかった: '||left(sqlerrm,60); end;
  else r := r||E'\n・ H7（前の手順でIDが取れなかったので、とばした）'; end if;
  if note is not null then
  begin perform public.note_lock(note); r := r||E'\n○ H8 メモをロックして編集'; exception when others then r := r||E'\n× H8 メモをロックして編集 ← '||left(sqlerrm,90); end;
  begin perform public.note_save(note, '本文その1', 1, true); r := r||E'\n・ H9 ロック中に、同じ人がもう一度保存（version=1） → 通った'; exception when others then r := r||E'\n・ H9 ロック中に、同じ人がもう一度保存（version=1） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.note_save(note, '古い', 1, false); r := r||E'\n・ H10 古いバージョンでの保存（止まるはず） → 通った'; exception when others then r := r||E'\n・ H10 古いバージョンでの保存（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H8〜H10（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if note is not null then
  begin perform public.note_lock(note); r := r||E'\n・ H11 ほかの人がロックしようとする → 通った'; exception when others then r := r||E'\n・ H11 ほかの人がロックしようとする → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H11（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if note is not null then
  begin perform public.note_delete(note); r := r||E'\n× H12 メンバーでない人は、メモを消せない（通ってしまった）'; exception when others then r := r||E'\n○ H12 メンバーでない人は、メモを消せない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H12（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if ws is not null then
  begin proj := (public.proj_create(ws, '案件A'))::uuid; r := r||E'\n○ H13 案件をつくる'; exception when others then proj := null; r := r||E'\n・ H13 案件をつくる → IDが取れなかった: '||left(sqlerrm,60); end;
  else r := r||E'\n・ H13（前の手順でIDが取れなかったので、とばした）'; end if;
  if proj is not null then
  begin perform public.ptask_save(null, proj, 'やること', u2, current_date, 'todo'); r := r||E'\n・ H14 タスクを保存 → 通った'; exception when others then r := r||E'\n・ H14 タスクを保存 → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H14（前の手順でIDが取れなかったので、とばした）'; end if;
  if ws is not null then
  begin perform public.att_clock('in', ws); r := r||E'\n○ H15 出勤'; exception when others then r := r||E'\n× H15 出勤 ← '||left(sqlerrm,90); end;
  begin perform public.att_clock('in', ws); r := r||E'\n・ H16 もう一度、出勤（止まるはず） → 通った'; exception when others then r := r||E'\n・ H16 もう一度、出勤（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.att_clock('out', ws); r := r||E'\n○ H17 退勤'; exception when others then r := r||E'\n× H17 退勤 ← '||left(sqlerrm,90); end;
  begin perform public.att_clock('out', ws); r := r||E'\n・ H18 もう一度、退勤（止まるはず） → 通った'; exception when others then r := r||E'\n・ H18 もう一度、退勤（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H15〜H18（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if ws is not null then
  begin ex := (public.exp_submit(ws, 1000, '交通費', '電車', current_date))::uuid; r := r||E'\n○ H19 経費を申請（1000円）'; exception when others then ex := null; r := r||E'\n・ H19 経費を申請（1000円） → IDが取れなかった: '||left(sqlerrm,60); end;
  begin perform public.exp_submit(ws, -5, '交通費', '電車', current_date); r := r||E'\n・ H20 マイナスの金額の申請 → 通った'; exception when others then r := r||E'\n・ H20 マイナスの金額の申請 → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H19・H20（前の手順でIDが取れなかったので、とばした）'; end if;
  if ex is not null then
  begin perform public.exp_decide(ex, true, '自分で'); r := r||E'\n× H21 自分の申請を、自分で承認できない（通ってしまった）'; exception when others then r := r||E'\n○ H21 自分の申請を、自分で承認できない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H21（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if ex is not null then
  begin perform public.exp_decide(ex, true, 'OK'); r := r||E'\n○ H22 ワークスペースの管理者は、承認できる'; exception when others then r := r||E'\n× H22 ワークスペースの管理者は、承認できる ← '||left(sqlerrm,90); end;
  else r := r||E'\n・ H22（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if ex is not null then
  begin perform public.exp_withdraw(ex); r := r||E'\n・ H23 承認ずみの申請を取り下げる（止まるはず） → 通った'; exception when others then r := r||E'\n・ H23 承認ずみの申請を取り下げる（止まるはず） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H23（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  if ws is not null then
  begin mrm := (public.mr_create_room(ws, '会議室A'))::uuid; r := r||E'\n○ H24 会議室をつくる'; exception when others then mrm := null; r := r||E'\n・ H24 会議室をつくる → IDが取れなかった: '||left(sqlerrm,60); end;
  else r := r||E'\n・ H24（前の手順でIDが取れなかったので、とばした）'; end if;
  if mrm is not null then
  begin bk := (public.mr_book(mrm, '会議', now() + interval '1 hour', now() + interval '2 hours'))::uuid; r := r||E'\n○ H25 予約する（1〜2時間後）'; exception when others then bk := null; r := r||E'\n・ H25 予約する（1〜2時間後） → IDが取れなかった: '||left(sqlerrm,60); end;
  begin perform public.mr_book(mrm, '重なる', now() + interval '90 minutes', now() + interval '150 minutes'); r := r||E'\n× H26 重なる時間は、予約できない（通ってしまった）'; exception when others then r := r||E'\n○ H26 重なる時間は、予約できない → '||left(sqlerrm,70); end;
  begin perform public.mr_book(mrm, '逆', now() + interval '5 hours', now() + interval '4 hours'); r := r||E'\n× H27 終わりが始まりより前は、ことわる（通ってしまった）'; exception when others then r := r||E'\n○ H27 終わりが始まりより前は、ことわる → '||left(sqlerrm,70); end;
  else r := r||E'\n・ H25〜H27（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if bk is not null then
  begin perform public.mr_cancel(bk); r := r||E'\n・ H28 ほかの人の予約を取り消そうとする → 通った'; exception when others then r := r||E'\n・ H28 ほかの人の予約を取り消そうとする → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H28（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin board := (public.sb_create(rm, '日程', array['月','火']))::uuid; r := r||E'\n○ H29 日程調整ボード（sb_create）'; exception when others then board := null; r := r||E'\n・ H29 日程調整ボード（sb_create） → IDが取れなかった: '||left(sqlerrm,60); end;
  if board is not null then
  begin perform public.sb_vote(board, 0, 'yes'); r := r||E'\n・ H30 投票（0番・yes） → 通った'; exception when others then r := r||E'\n・ H30 投票（0番・yes） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.sb_vote(board, 5, 'yes'); r := r||E'\n× H31 ない番号（5番）には投票できない（通ってしまった）'; exception when others then r := r||E'\n○ H31 ない番号（5番）には投票できない → '||left(sqlerrm,70); end;
  begin perform public.sb_close(board, true); r := r||E'\n・ H32 閉じる → 通った'; exception when others then r := r||E'\n・ H32 閉じる → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ H30〜H32（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  reset role;
  raise exception E'RESULT:%', r;   -- わざと止めて、ぜんぶ巻き戻す
end $t$;
