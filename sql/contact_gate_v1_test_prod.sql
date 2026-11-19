-- フォローとチャットの決まり：本番での試験（最後に必ず巻き戻す。何も残らない）  2026-11-18
-- 流すと、最後に「ERROR: RESULT:…」と出ます。これは、わざと出している終わりの合図で、巻き戻しのしるしです（失敗ではありません）。
-- 出てきた「RESULT:」から後ろの文を、全部コピーして送ってください。
-- 使う人：しちきん／ゴエモン／田澤（どれも「友だち」区分。いま、おたがいの部屋が無い3人）。実際のデータは、1つも変わりません。

do $t$
declare
  a uuid := '1c99be8c-81ce-4242-96b2-29b4ada54acb';
  b uuid := 'd3fab674-e31f-4475-afef-3fe18cf7eef3';
  c uuid := '3a0e8c43-813a-4755-86b4-bfc087cb0d1d';
  adm uuid;
  r text := ''; rm uuid; rm2 uuid; g uuid; lg uuid; j jsonb; ap timestamptz; ap2 timestamptz; bb boolean; i integer;
begin
  select id into adm from public.profiles where private.is_admin_user(id) limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_or_get_direct_room(b); r := r||E'\nT1 NG(作れてしまった)'; exception when others then r := r||E'\nT1 '||sqlerrm; end;

  begin insert into public.follows(follower_id, followee_id, approved_at) values (a,b, now()); exception when others then r := r||E'\nT2 follow失敗 '||sqlerrm; end;
  reset role;
  select approved_at into ap from public.follows where follower_id=a and followee_id=b;
  r := r||E'\nT2 approved_at='||coalesce(ap::text,'null(承認まち)');
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  begin rm := public.create_or_get_direct_room(b); r := r||E'\nT2b 部屋作成OK'; exception when others then r := r||E'\nT2b '||sqlerrm; end;

  for i in 1..4 loop
    begin insert into public.messages(room_id,sender_id,content) values (rm,a,'テスト'||i); r := r||E'\nT3 A'||i||'=ok'; exception when others then r := r||E'\nT3 A'||i||'='||sqlerrm; end;
  end loop;
  j := public.contact_status_v1(b); r := r||E'\nT5 Aから見た状態 '||(j->>'state')||' 残り='||coalesce(j->>'trial_left','-');

  begin bb := public.approve_follow_v1(b); r := r||E'\nT6 A自分で承認 → '||bb::text; exception when others then r := r||E'\nT6 '||sqlerrm; end;
  begin update public.follows set approved_at = now() where follower_id=a; r := r||E'\nT6b 直接更新できてしまった(NG)'; exception when others then r := r||E'\nT6b 直接更新 → '||sqlerrm; end;

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  begin insert into public.messages(room_id,sender_id,content) values (rm,b,'返信'); r := r||E'\nT4 B送信 NG(送れた)'; exception when others then r := r||E'\nT4 B送信 → '||sqlerrm; end;
  j := public.contact_status_v1(a); r := r||E'\nT5b Bから見た状態 '||(j->>'state');

  begin bb := public.approve_follow_v1(a); r := r||E'\nT7 B承認 → '||bb::text; exception when others then r := r||E'\nT7 '||sqlerrm; end;
  begin insert into public.messages(room_id,sender_id,content) values (rm,b,'返信'); r := r||E'\nT7 B送信=ok'; exception when others then r := r||E'\nT7 B送信='||sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  for i in 1..3 loop
    begin insert into public.messages(room_id,sender_id,content) values (rm,a,'承認後'||i); r := r||E'\nT7 A承認後'||i||'=ok'; exception when others then r := r||E'\nT7 A承認後'||i||'='||sqlerrm; end;
  end loop;

  delete from public.follows where follower_id=a and followee_id=b;
  begin insert into public.messages(room_id,sender_id,content) values (rm,a,'解除後'); r := r||E'\nT8 A解除後 NG(送れた)'; exception when others then r := r||E'\nT8 A解除後 → '||sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  begin insert into public.messages(room_id,sender_id,content) values (rm,b,'解除後B'); r := r||E'\nT8 B解除後 NG(送れた)'; exception when others then r := r||E'\nT8 B解除後 → '||sqlerrm; end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  insert into public.follows(follower_id, followee_id) values (a,b);
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  insert into public.follows(follower_id, followee_id) values (b,a);
  reset role;
  select approved_at into ap from public.follows where follower_id=a and followee_id=b;
  select approved_at into ap2 from public.follows where follower_id=b and followee_id=a;
  r := r||E'\nT9 相互 A→B='||(ap is not null)::text||' B→A='||(ap2 is not null)::text;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into public.messages(room_id,sender_id,content) values (rm,a,'相互'); r := r||E'\nT9 A相互=ok'; exception when others then r := r||E'\nT9 A相互='||sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  begin insert into public.messages(room_id,sender_id,content) values (rm,b,'相互'); r := r||E'\nT9 B相互=ok'; exception when others then r := r||E'\nT9 B相互='||sqlerrm; end;
  delete from public.follows where follower_id=b and followee_id=a;
  reset role;
  select approved_at into ap from public.follows where follower_id=a and followee_id=b;
  r := r||E'\nT9b Bが解除後 A→Bの承認='||(ap is not null)::text;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into public.messages(room_id,sender_id,content) values (rm,a,'解除後2'); r := r||E'\nT9b A送信 NG(送れた)'; exception when others then r := r||E'\nT9b A送信 → '||sqlerrm; end;

  reset role;
  insert into public.chat_rooms(created_at) values (now() - interval '1 day') returning id into lg;
  insert into public.chat_room_members(room_id,user_id) values (lg,c),(lg,a);
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into public.messages(room_id,sender_id,content) values (lg,c,'古い部屋'); r := r||E'\nT10 古い部屋=ok'; exception when others then r := r||E'\nT10 古い部屋='||sqlerrm; end;

  begin rm2 := public.create_or_get_direct_room(adm); insert into public.messages(room_id,sender_id,content) values (rm2,c,'管理者へ'); r := r||E'\nT11 管理者=ok'; exception when others then r := r||E'\nT11 管理者='||sqlerrm; end;

  reset role;
  insert into public.chat_rooms(is_group,name) values (true,'テスト用グループ') returning id into g;
  insert into public.chat_room_members(room_id,user_id) values (g,a),(g,b),(g,c);
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into public.messages(room_id,sender_id,content) values (g,c,'グループ'); r := r||E'\nT12 グループ=ok'; exception when others then r := r||E'\nT12 グループ='||sqlerrm; end;

  reset role;
  insert into private.guest_accounts(user_id) values (c);
  j := private.contact_rule_v1(c, a, null); r := r||E'\nT13 ゲストC→A '||(j->>'state');
  delete from private.guest_accounts where user_id=c;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.follows(follower_id, followee_id) values (a,c);
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  begin bb := public.decline_follow_v1(a); r := r||E'\nT14 Cが断る → '||bb::text; exception when others then r := r||E'\nT14 '||sqlerrm; end;
  reset role;
  r := r||E'\nT14 A→Cのフォロー残り='||(select count(*) from public.follows where follower_id=a and followee_id=c)::text;

  update private.contact_gate_cfg set enabled=false;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into public.messages(room_id,sender_id,content) values (rm,a,'スイッチ切'); r := r||E'\nT15 切ったとき=ok'; exception when others then r := r||E'\nT15 切ったとき='||sqlerrm; end;
  reset role;
  update private.contact_gate_cfg set enabled=true;

  set local role anon;
  begin perform public.contact_status_v1(a); r := r||E'\nT16 anon NG'; exception when others then r := r||E'\nT16 anon → '||sqlerrm; end;
  reset role;

  raise exception E'RESULT:%', r;   -- わざと止めて、ぜんぶ巻き戻す
end $t$;
