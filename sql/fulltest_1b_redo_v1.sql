-- 試験1b：試験1で予想とちがったところの確かめ直し（巻き戻し）  2026-11-20
-- 本番 Supabase（project: ARE / kzrrnuzzvwijujhlbtln）の SQL Editor に、全文を貼って Run します。
-- 最後に「ERROR: RESULT:…」と出ます。これは、わざと出している終わりの合図で、巻き戻しのしるしです（失敗ではありません）。
-- 出てきた「RESULT:」から後ろの文を、全部コピーして送ってください。
-- 試験用のユーザーは、この中で作って、最後に巻き戻します。本物のユーザーのデータは、1つも変わりません。
-- ○＝期待どおり ／ ×＝期待とちがう ／ ・＝記録（通った・止められた、どちらでもよいが、結果を知りたいもの）

do $t$
declare
  adm uuid := '9d660098-27f5-4933-bdce-d0ea7a6f08b4';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  rm uuid; grp uuid; msg1 uuid; n1 integer; n2 integer; t1 text; t2 text; ex1 boolean; ex2 boolean;
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
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  insert into public.messages(room_id,sender_id,content) values (rm,u1,'既読の試験') returning id into msg1;
reset role;
  r := r||E'\n\n【B18 部屋の外の人が mark_room_read を呼ぶと、何かが書きかわるか】';
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin perform public.mark_room_read(rm); r := r||E'\n○ B18a 部屋の人（u2）が既読をつける'; exception when others then r := r||E'\n× B18a 部屋の人（u2）が既読をつける ← '||left(sqlerrm,90); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  select count(*) into n1 from public.get_room_reads(rm); t1 := coalesce(public.get_partner_read_at(rm)::text,'(空)');
perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  set local role authenticated;
  begin perform public.mark_room_read(rm); r := r||E'\n・ B18b 部屋の外の人（u3）が既読をつける → 通った'; exception when others then r := r||E'\n・ B18b 部屋の外の人（u3）が既読をつける → 止められた: '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  select count(*) into n2 from public.get_room_reads(rm); t2 := coalesce(public.get_partner_read_at(rm)::text,'(空)');
  r := r||case when n1 = n2 and t1 = t2 then E'\n○ B18c 外の人が呼んでも、既読の記録は変わらない（行数 '||n1||'→'||n2||'）' else E'\n× B18c 既読の記録が変わった（行数 '||n1||'→'||n2||' ／ 相手の既読時刻 '||t1||'→'||t2||'）' end;
reset role;
  begin perform 1 from public.chat_room_members where room_id = rm and user_id = u3; if found then r := r||E'\n× B18d 外の人が部屋のメンバーになっている'; else r := r||E'\n○ B18d 外の人は、部屋のメンバーのまま増えていない'; end if; exception when others then r := r||E'\n・ B18d 確認できず: '||left(sqlerrm,50); end;
  r := r||E'\n\n【B33 リンクの追加（アプリはグループの部屋だけで使う）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin perform public.add_room_link(rm, 'ためし', 'https://example.com/'); r := r||E'\n・ B33a 1対1の部屋にリンクをのせる（前回 not_allowed だった） → 通った'; exception when others then r := r||E'\n・ B33a 1対1の部屋にリンクをのせる（前回 not_allowed だった） → 止められた: '||left(sqlerrm,70); end;
  begin grp := (public.create_group('試験グループ', array[u2], '案内文'))::uuid; r := r||E'\n○ B33b グループをつくる（u2 を入れる）'; exception when others then grp := null; r := r||E'\n・ B33b グループをつくる（u2 を入れる） → IDが取れなかった: '||left(sqlerrm,60); end;
  if grp is not null then
  begin perform public.add_room_link(grp, 'ためし', 'https://example.com/'); r := r||E'\n○ B33c つくった人は、グループにリンクをのせられる（https）'; exception when others then r := r||E'\n× B33c つくった人は、グループにリンクをのせられる（https） ← '||left(sqlerrm,90); end;
  begin perform public.add_room_link(grp, 'わな', 'javascript:alert(1)'); r := r||E'\n× B33d javascript: のリンクはことわる（通ってしまった）'; exception when others then r := r||E'\n○ B33d javascript: のリンクはことわる → '||left(sqlerrm,70); end;
  begin perform public.add_room_link(grp, 'わな2', 'data:text/html,<b>x</b>'); r := r||E'\n× B33e data: のリンクはことわる（通ってしまった）'; exception when others then r := r||E'\n○ B33e data: のリンクはことわる → '||left(sqlerrm,70); end;
  begin perform public.add_room_link(grp, 'http', 'http://example.com/'); r := r||E'\n・ B33f http: のリンク → 通った'; exception when others then r := r||E'\n・ B33f http: のリンク → 止められた: '||left(sqlerrm,70); end;
  begin perform public.add_room_link(grp, repeat('あ',300), 'https://example.com/x'); r := r||E'\n・ B33g 長いタイトル（300文字） → 通った'; exception when others then r := r||E'\n・ B33g 長いタイトル（300文字） → 止められた: '||left(sqlerrm,70); end;
  begin perform public.add_room_link(grp, 'なが', 'https://example.com/'||repeat('a',3000)); r := r||E'\n・ B33h 長いアドレス（3000文字） → 通った'; exception when others then r := r||E'\n・ B33h 長いアドレス（3000文字） → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ B33c〜h（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  if grp is not null then
  begin perform public.add_room_link(grp, 'メンバー', 'https://example.com/m'); r := r||E'\n・ B33i グループのメンバー（つくった人ではない）が、リンクをのせる → 通った'; exception when others then r := r||E'\n・ B33i グループのメンバー（つくった人ではない）が、リンクをのせる → 止められた: '||left(sqlerrm,70); end;
  else r := r||E'\n・ B33i（前の手順でIDが取れなかったので、とばした）'; end if;
perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u4::text, true);
  set local role authenticated;
  if grp is not null then
  begin perform public.add_room_link(grp, 'のぞき', 'https://example.com/z'); r := r||E'\n× B33j グループの外の人は、リンクをのせられない（通ってしまった）'; exception when others then r := r||E'\n○ B33j グループの外の人は、リンクをのせられない → '||left(sqlerrm,70); end;
  else r := r||E'\n・ B33j（前の手順でIDが取れなかったので、とばした）'; end if;
reset role;
  r := r||E'\n\n【C7・C8 お試し本人以外が guest_delete_me_v1 を呼んだとき（エラーではなく false を返すのが決まりのはず）】';
perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin v := (public.guest_delete_me_v1())::text; r := r||E'\n・ C7a ふつうのユーザーの返り値（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ C7a ふつうのユーザーの返り値（false のはず） → エラー: '||left(sqlerrm,70); end;
reset role;
  begin select (select count(*) from public.profiles where id = u1) into n; r := r||case when n = 1 then E'\n○ ' else E'\n× ' end||'C7b そのあとも、そのユーザーのプロフィールが残っている （'||n||'件／期待 1）'; exception when others then r := r||E'\n× C7b そのあとも、そのユーザーのプロフィールが残っている ← '||left(sqlerrm,70); end;
  begin select (select count(*) from auth.users where id = u1) into n; r := r||case when n = 1 then E'\n○ ' else E'\n× ' end||'C7c そのあとも、アカウントが残っている （'||n||'件／期待 1）'; exception when others then r := r||E'\n× C7c そのあとも、アカウントが残っている ← '||left(sqlerrm,70); end;
perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  begin v := (public.guest_delete_me_v1())::text; r := r||E'\n・ C8a 管理者の返り値（false のはず） = '||coalesce(v,'(空)'); exception when others then r := r||E'\n・ C8a 管理者の返り値（false のはず） → エラー: '||left(sqlerrm,70); end;
reset role;
  begin select (select count(*) from public.profiles where id = adm) into n; r := r||case when n = 1 then E'\n○ ' else E'\n× ' end||'C8b そのあとも、管理者のプロフィールが残っている （'||n||'件／期待 1）'; exception when others then r := r||E'\n× C8b そのあとも、管理者のプロフィールが残っている ← '||left(sqlerrm,70); end;
  begin select (select count(*) from auth.users where id = adm) into n; r := r||case when n = 1 then E'\n○ ' else E'\n× ' end||'C8c そのあとも、管理者のアカウントが残っている （'||n||'件／期待 1）'; exception when others then r := r||E'\n× C8c そのあとも、管理者のアカウントが残っている ← '||left(sqlerrm,70); end;
  r := r||E'\n\n【E6・E7 ログインしていない人（anon）が表を読もうとしたとき】';
set local role anon;
  begin select count(*) into n from public.messages; r := r||case when n = 0 then E'\n○ E6 anon が messages を数えても 0件' else E'\n× E6 anon に messages が見えた（'||n||'件）' end; exception when others then r := r||E'\n○ E6 anon は messages の表そのものを読めない（これは 0件より強い守り）→ '||left(sqlerrm,50); end;
  begin select count(*) into n from public.profiles; r := r||case when n = 0 then E'\n○ E7 anon が profiles を数えても 0件' else E'\n× E7 anon に profiles が見えた（'||n||'件）' end; exception when others then r := r||E'\n○ E7 anon は profiles の表そのものを読めない（これは 0件より強い守り）→ '||left(sqlerrm,50); end;
reset role;
  reset role;
  raise exception E'RESULT:%', r;   -- わざと止めて、ぜんぶ巻き戻す
end $t$;
