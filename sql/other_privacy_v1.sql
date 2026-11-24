-- other_privacy_v1.sql
-- 区分「その他」（新規登録の既定）だけを厳重に隔離する。家庭・社員・友人どうしの動きは変えない。
-- Supabase には migration 名 other_privacy_v1_core / other_privacy_v1_guards / other_privacy_v1_fixes として適用済み。
--
-- 1. 隔離：「その他」は管理者（とシステム）以外とは、プロフィール・投稿・フォロー・すれ違い・グループ・3D見た目・ランキングが見えない。
--          管理者が承認したリンク（segment_links）の相手とだけ個人チャットができる。
-- 2. 送信回数：「その他」の人は、管理者へ 5通まで／ほかの相手へ 1通まで（private.other_guard_cfg で変更可）
-- 3. 不正検知：危険な文・個人情報を聞き出す文・いたずら・NG語・禁止操作の試みで「ウイルス画面」フラグ（my_ui_flags().virus）
--          フラグが立つと送信不可（virus_locked）。管理者は admin_clear_virus_v1 で解除。
-- 4. 管理者の名前：「その他」の人には「主人公」、「社員」の人には「坂井さん」（my_ui_flags().admin_alias）

-- ===== core =====
create table if not exists private.other_guard_cfg (
  id int primary key default 1 check (id = 1),
  limit_admin int not null default 5,
  limit_user int not null default 1,
  client_reports boolean not null default true      -- false にすると、画面側からの禁止操作の報告を止められる（誤検知の非常口）
);
insert into private.other_guard_cfg (id) values (1) on conflict do nothing;

create table if not exists private.other_flags (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  virus boolean not null default false,
  strikes int not null default 0,
  reason text,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create table if not exists private.other_send_counts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  partner_key text not null,
  n int not null default 0,
  primary key (user_id, partner_key)
);
create table if not exists private.other_guard_rules (
  id serial primary key,
  kind text not null,
  rx text not null,
  scope text not null default 'all' check (scope in ('all','msg')),
  enabled boolean not null default true,
  unique (kind, rx)
);
alter table private.other_guard_cfg enable row level security;
alter table private.other_flags enable row level security;
alter table private.other_send_counts enable row level security;
alter table private.other_guard_rules enable row level security;
revoke all on private.other_guard_cfg, private.other_flags, private.other_send_counts, private.other_guard_rules from public, anon, authenticated;

create or replace function private.is_other_v1(p_user uuid) returns boolean
language sql stable security definer set search_path to '' as
$$ select p_user is not null and not private.seg_special(p_user) and private.seg_of(p_user) = 'other' $$;

create or replace function public.seg_is_other_v1() returns boolean
language sql stable security definer set search_path to '' as
$$ select private.is_other_v1((select auth.uid())) $$;

create or replace function private.seg_pair_ok(p_a uuid, p_b uuid, p_dm boolean) returns boolean
language plpgsql stable security definer set search_path to '' as $$
begin
    if p_a is null or p_b is null or p_a = p_b then return true; end if;
    if private.seg_special(p_a) or private.seg_special(p_b) then return true; end if;
    if private.seg_of(p_a) = 'other' or private.seg_of(p_b) = 'other' then
        if not p_dm then return false; end if;
        return exists (select 1 from private.segment_links l where l.a = least(p_a, p_b) and l.b = greatest(p_a, p_b));
    end if;
    if (private.seg_of(p_a) = 'home') = (private.seg_of(p_b) = 'home') then return true; end if;   -- 家庭どうし／家庭以外どうし
    if not p_dm then return false; end if;
    return exists (select 1 from private.segment_links l where l.a = least(p_a, p_b) and l.b = greatest(p_a, p_b));
end $$;

create or replace function private.other_gate_v1(p_me uuid, p_target uuid) returns boolean
language sql stable security definer set search_path to '' as
$$ select p_me is not distinct from p_target
       or not (private.is_other_v1(p_me) or private.is_other_v1(p_target))
       or private.seg_pair_ok(p_me, p_target, true) $$;

create or replace function public.seg_other_gate_v1(p_other uuid) returns boolean
language sql stable security definer set search_path to '' as
$$ select private.other_gate_v1((select auth.uid()), p_other) $$;

revoke all on function public.seg_is_other_v1() from public, anon;
revoke all on function public.seg_other_gate_v1(uuid) from public, anon;
grant execute on function public.seg_is_other_v1() to authenticated;
grant execute on function public.seg_other_gate_v1(uuid) to authenticated;

drop policy if exists "Authenticated read follows" on public.follows;
drop policy if exists follows_read_v2 on public.follows;
create policy follows_read_v2 on public.follows for select to authenticated
  using ((select auth.uid()) in (follower_id, followee_id) or not (select public.seg_is_other_v1()));

drop policy if exists profile_3d_looks_read_authenticated on public.profile_3d_looks;
drop policy if exists profile_3d_looks_read_v2 on public.profile_3d_looks;
create policy profile_3d_looks_read_v2 on public.profile_3d_looks for select to authenticated
  using (user_id = (select auth.uid()) or (select public.seg_other_gate_v1(user_id)));

do $m$
declare d text;
begin
  d := pg_get_functiondef('public.game_ranking(text)'::regprocedure);
  if position('other_gate_v1' in d) = 0 then
    if position('where g.game = p_game' in d) = 0 then raise exception 'anchor_not_found_game_ranking'; end if;
    d := replace(d, 'where g.game = p_game', 'where g.game = p_game and private.other_gate_v1((select auth.uid()), g.user_id)');
    execute d;
  end if;
end $m$;

do $m$
declare d text; anchor text := 'if v_out.approved_at is not null or v_in.approved_at is not null then';
begin
  d := pg_get_functiondef('private.contact_rule_v1(uuid,uuid,uuid)'::regprocedure);
  if position('other_link_ok' in d) = 0 then
    if position(anchor in d) = 0 then raise exception 'anchor_not_found_contact_rule'; end if;
    d := replace(d, anchor,
      E'-- other_link_ok\n  if (private.seg_of(p_sender) = ''other'' or private.seg_of(p_other) = ''other'')\n     and exists (select 1 from private.segment_links l where l.a = least(p_sender, p_other) and l.b = greatest(p_sender, p_other)) then\n    return v_flags || jsonb_build_object(''state'', ''approved'', ''ok'', true);\n  end if;\n  ' || anchor);
    execute d;
  end if;
end $m$;

-- ===== guards =====
-- ルール（正規表現）。足したいときは insert 1行。外したいときは enabled=false。
insert into private.other_guard_rules (kind, rx, scope) values
 ('url', $r$https?:|www\.|ftp:|ftps:|ssh:|sftp:$r$, 'all'),
 ('url_tld', $r$[a-z0-9-]{2,}\.(com|net|org|jp|io|me|ly|gl|cc|xyz|top|info|biz|ru|cn|kr|tk|ml|ga|cf|gq|site|online|shop|app|dev|ai|tv|link|click|club|live|vip|work|fun|asia)(/|[^a-z0-9]|$)$r$, 'all'),
 ('url_short', $r$bit\.ly|tinyurl|goo\.gl|t\.co/|discord\.gg|t\.me/|line\.me|wa\.me|lin\.ee|youtu\.be|is\.gd|ow\.ly$r$, 'all'),
 ('scheme', $r$\y(javascript|vbscript|mailto|intent|weixin|kakaotalk|blob|file):|\y(data|tel|sms|tg|market|whatsapp|skype|facetime):[^\s]$r$, 'all'),
 ('html', $r$<[/!]?[a-z][a-z0-9-]*[\s/>]$r$, 'all'),
 ('html_attr', $r$\yon[a-z]{3,12}\s*=|\ysrcdoc\s*=|\ystyle\s*=\s*["']$r$, 'all'),
 ('html_entity', $r$&#x?[0-9a-f]{2,6};|&(lt|gt|quot|amp);|%3c|%3e|%22%3e$r$, 'all'),
 ('template', $r$\{\{|\}\}|\$\{|<%|%>$r$, 'all'),
 ('sql_union', $r$\yunion\y.{0,20}\yselect\y$r$, 'all'),
 ('sql_select', $r$\yselect\y.{1,80}\yfrom\y$r$, 'all'),
 ('sql_ddl', $r$\y(drop|truncate|alter|create)\s+(table|database|schema|function|policy|role|user|index|trigger)\y$r$, 'all'),
 ('sql_dml', $r$\y(insert\s+into|delete\s+from|update\s+\S+\s+set)\y$r$, 'all'),
 ('sql_bool', $r$\y(or|and)\y\s*['"(]?\s*\d+\s*['"]?\s*=\s*['"]?\s*\d+$r$, 'all'),
 ('sql_comment', $r$;\s*--|/\*|\*/|\y(or|and)\y\s+['"]$r$, 'all'),
 ('sql_func', $r$pg_sleep|pg_catalog|information_schema|auth\.users|service_role|pg_read_file|\ycurrent_user\y|\ysession_user\y|supabase\.co|/rest/v1|\yapikey\y|\yanon[_ ]key\y$r$, 'all'),
 ('shell', $r$\.\./|/etc/passwd|/bin/(ba)?sh|\y(curl|wget|sudo|chmod|chown|powershell|cmd\.exe|eval|exec|base64)\y\s*[-(\s]|\yrm\s+-rf\y$r$, 'all'),
 ('secret_en', $r$\y(password|passwd|pwd|token|secret|bearer|jwt|api[_ -]?key|private[_ -]?key|credit card|card number|cvv|cvc|iban|ssn|passport)\y$r$, 'all'),
 ('secret_ja', $r$パスワード|暗証番号|認証コード|認証番号|ワンタイム|ログインid|合言葉|秘密の質問|セキュリティコード|カード番号|口座番号|口座|クレジット|マイナンバー|免許証|パスポート$r$, 'all'),
 ('secret_zh_ko', $r$密码|密碼|验证码|驗證碼|银行卡|銀行卡|身份证|身份證|信用卡|비밀번호|인증번호|카드번호|계좌|주민등록$r$, 'all'),
 ('phone', $r$(^|[^0-9])0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}([^0-9]|$)|(^|[^0-9])\+\d{1,3}[-\s]?\d{1,4}[-\s]?\d{2,4}[-\s]?\d{3,4}([^0-9]|$)$r$, 'all'),
 ('long_digits', $r$\d{9,}$r$, 'all'),
 ('email', $r$[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[a-z0-9._-]+\s*(@|アットマーク)\s*(gmail|yahoo|icloud|outlook|hotmail|docomo|softbank|ezweb)$r$, 'all'),
 ('sns', $r$(line|ライン|instagram|インスタ|insta|twitter|ツイッター|tiktok|ティックトック|kakao|カカオ|discord|ディスコ|telegram|テレグラム|wechat|ウィーチャット|snapchat|スナチャ|whatsapp|facebook|フェイスブック)\s*(の|を)?\s*(id|アイディー|交換|教えて|おしえて|やろ|やって|追加|[:@])|(id|アイディー|ライン|line|インスタ|カカオ|カトク|微信)\s*(を|の)?\s*(しよ|しない|やってる|交換|聞|教|おしえ)|라인|카톡|카카오톡|오픈채팅|微信|加我|私聊|加好友$r$, 'all'),
 ('meet', $r$会おう|会わない|会いませんか|会いたい|直接会|実際に会|オフ会|遊びませんか|どこ住み|どこに住|最寄り|何歳|年いくつ|何年生|\ymeet\y|meet ?up|how old|where do you live|which school|见面|見面|约出来|約出來|만나|몇 살|어디 살$r$, 'all'),
 ('personal_ask', $r$住所|電話番号|電話教えて|番号教えて|本名|フルネーム|生年月日|顔写真|写真送って|写真ちょうだい|写真見せて|自撮り|ヌード|裸|おっぱい|エロ|えっち|セックス|\ysex\y|porn|\ynude|naked|\ynsfw\y|\yaddress\y|phone number|real name|full name|birthday|selfie|住址|真名|真实姓名|电话号码|手机号|私密照|裸照|주소|본명|전화번호|실명|생년월일|셀카|야한|섹스$r$, 'all'),
 ('impersonate', $r$(管理者|運営者|運営|サポート|公式|スタッフ|オーナー|開発者)(です|だよ|より|から|の者)|\y(i am|i'm|this is)\s+(the |an? )?(admin|administrator|owner|staff|support|developer|moderator)\y|我是(管理员|管理員|客服|官方)|(관리자|운영자)입니다$r$, 'all'),
 ('alias_probe', $r$坂井|さかい|サカイ|sakai$r$, 'msg'),
 ('security', $r$ウイルス|ウィルス|virus|ハッキング|ハッカー|ハック|hack(er|ed|ing)?|クラッキング|cracker|ddos|dos攻撃|ランサム|ransom|マルウェア|malware|脆弱性|vulnerab|exploit|sql\s*injection|\yxss\y|csrf|ブルートフォース|brute ?force|バックドア|backdoor|ルート権限|root access|rootkit|トロイ|trojan|keylogger|phishing|フィッシング|不正アクセス|不正ログイン|乗っ取|なりすまし|スクレイピング|scrap(e|ing)\y$r$, 'all'),
 ('prompt_inj', $r$ignore (all |the )?(previous|above|prior) (instructions|prompts?)|system prompt|jailbreak|\ydan mode\y|developer mode|以前の指示を無視|システムプロンプト|プロンプトを教えて$r$, 'all'),
 ('repeat_char', $r$(.)\1{9,}$r$, 'all'),
 ('repeat_chunk', $r$(.{2,12})\1{5,}$r$, 'all'),
 ('zero_width', $r$[​-‏‪-‮⁠-⁤⁦-⁩﻿­᠎]$r$, 'all'),
 ('zalgo', $r$[̀-ͯ҃-҉⃐-⃿]{3,}$r$, 'all'),
 ('control', $r$[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]$r$, 'all'),
 ('emoji_flood', $r$([\U0001F300-\U0001FAFF☀-➿]\s*){12,}$r$, 'all'),
 ('uuid', $r$[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$r$, 'all'),
 ('scam', $r$ビットコイン|bitcoin|\ybtc\y|仮想通貨|暗号資産|crypto|投資|副業|儲か|稼げ|簡単に稼|無料プレゼント|プレゼント企画|当選|当たりました|クリック|登録はこちら|出会い|パパ活|ママ活|援助交際|援交|アダルト|ギャンブル|カジノ|casino|ブックメーカー|競馬予想|\yfx\y|ネットワークビジネス|マルチ商法|宗教|勧誘|詐欺|闇バイト|高収入|ワンクリック|無料登録|限定公開|紹介コード|招待コード|invite code|referral$r$, 'all'),
 ('abuse_trivial', $r$うんこ|うんち|ちんちん|ちんこ|まんこ|おしっこ|おなら|ばーか|バカ|馬鹿|ばかやろ|ばかじゃ|アホ|あほ|ハゲ|デブ|ブス|チビ|きもい|キモ|うざ|ウザ|うぜえ|うぜー|クソ|糞|くそ|ザコ|雑魚|死ね|氏ね|しねよ|殺す|殺して|殺される|くたばれ|消えろ|失せろ|黙れ|fuck|shit|bitch|asshole|damn|idiot|stupid|dumb|loser|suck|shut up|傻逼|笨蛋|滚|混蛋|白痴|垃圾|去死|시발|씨발|병신|바보|꺼져|죽어|멍청$r$, 'all'),
 ('test_prank', $r$いたずら|イタズラ|悪戯|荒らし|荒らす|ふざけ|あいうえお|ああああ|いいいい|うううう|ええええ|おおおお|aaaa|asdf|qwer|zxcv|hogehoge|ほげほげ|fugafuga|ふがふが|lorem ipsum|foo ?bar$r$, 'all')
on conflict do nothing;

do $m$
declare r record;
begin
  for r in select kind, rx from private.other_guard_rules loop
    perform ''::text ~* r.rx;      -- 壊れた正規表現があればここで止める
  end loop;
end $m$;

create or replace function private.other_scan_v1(p_text text, p_scope text default 'msg') returns text
language plpgsql stable security definer set search_path to '' as $$
declare t text; r record;
begin
    if p_text is null or btrim(p_text) = '' then return null; end if;
    if p_scope = 'msg' and char_length(p_text) > 500 then return 'length'; end if;
    t := lower(normalize(p_text, NFKC));
    for r in select kind, rx from private.other_guard_rules where enabled and (scope = 'all' or p_scope = 'msg') order by id loop
        if t ~* r.rx or p_text ~* r.rx then return r.kind; end if;
    end loop;
    return null;
exception when others then
    return null;
end $$;

create or replace function private.other_flag_v1(p_user uuid, p_reason text, p_snippet text default null, p_room uuid default null, p_report boolean default true) returns void
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
    if not private.is_other_v1(p_user) then return; end if;
    insert into private.other_flags as f (user_id, virus, strikes, reason, first_at, last_at)
    values (p_user, true, 1, left(p_reason, 200), now(), now())
    on conflict (user_id) do update set virus = true, strikes = f.strikes + 1, reason = left(excluded.reason, 200), last_at = now()
    returning f.strikes into n;
    if p_report and n <= 3 then
        insert into public.reports (reporter_id, target_user, room_id, reason, detail, snapshot)
        values (p_user, p_user, p_room, 'abuse', left('【その他・ウイルス画面】' || n || '回目／' || coalesce(p_reason, '?'), 300), left(coalesce(p_snippet, ''), 300));
    end if;
exception when others then
    raise warning 'other_flag_v1: %', sqlerrm;
end $$;

create or replace function private.other_msg_guard_v1() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
    cfg private.other_guard_cfg%rowtype; f private.other_flags%rowtype;
    txt text; hit text; v_others uuid[]; v_key text; v_limit int; v_n int; v_group boolean;
begin
    if new.sender_id is null or coalesce(new.is_auto_reply, false) then return new; end if;
    if not private.is_other_v1(new.sender_id) then return new; end if;
    select * into cfg from private.other_guard_cfg where id = 1;
    select * into f from private.other_flags where user_id = new.sender_id;
    if found and f.virus then raise exception 'virus_locked' using errcode = 'P0001'; end if;

    txt := private.ng_text_of(new.content);
    hit := private.other_scan_v1(txt, 'msg');
    if hit is not null then
        perform private.other_flag_v1(new.sender_id, 'msg:' || hit, txt, new.room_id);
        return null;
    end if;

    select coalesce(array_agg(m.user_id), '{}'::uuid[]) into v_others
      from public.chat_room_members m where m.room_id = new.room_id and m.user_id <> new.sender_id;
    select r.is_group into v_group from public.chat_rooms r where r.id = new.room_id;
    if exists (select 1 from unnest(v_others) u where not private.seg_special(u)) then
        v_limit := coalesce(cfg.limit_user, 1);
        v_key := case when array_length(v_others, 1) = 1 and not coalesce(v_group, false) then v_others[1]::text else 'room:' || new.room_id::text end;
    else
        v_limit := coalesce(cfg.limit_admin, 5);
        v_key := 'admin';
    end if;
    insert into private.other_send_counts (user_id, partner_key, n) values (new.sender_id, v_key, 0) on conflict do nothing;
    select c.n into v_n from private.other_send_counts c where c.user_id = new.sender_id and c.partner_key = v_key for update;
    if v_n >= v_limit then
        raise exception '%', case when v_key = 'admin' then 'other_limit_admin' else 'other_limit_user' end using errcode = 'P0001';
    end if;
    update private.other_send_counts c set n = c.n + 1 where c.user_id = new.sender_id and c.partner_key = v_key;
    return new;
end $$;

create or replace function private.other_msg_edit_guard_v1() returns trigger
language plpgsql security definer set search_path to '' as $$
declare txt text; hit text;
begin
    if new.content is not distinct from old.content or new.sender_id is null or not private.is_other_v1(new.sender_id) then return new; end if;
    txt := private.ng_text_of(new.content);
    hit := private.other_scan_v1(txt, 'msg');
    if hit is not null then
        perform private.other_flag_v1(new.sender_id, 'edit:' || hit, txt, new.room_id);
        new.content := old.content;
    end if;
    return new;
end $$;

create or replace function private.other_profile_guard_v1() returns trigger
language plpgsql security definer set search_path to '' as $$
declare hit text; v_txt text;
begin
    if not private.is_other_v1(new.id) then return new; end if;
    if new.display_name is distinct from old.display_name then
        hit := private.other_scan_v1(new.display_name, 'profile');
        if hit is not null then new.display_name := old.display_name; v_txt := old.display_name; end if;
    end if;
    if hit is null and new.bio is distinct from old.bio then
        hit := private.other_scan_v1(new.bio, 'profile');
        if hit is not null then new.bio := old.bio; end if;
    end if;
    if hit is null and new.status_message is distinct from old.status_message then
        hit := private.other_scan_v1(new.status_message, 'profile');
        if hit is not null then new.status_message := old.status_message; end if;
    end if;
    if hit is not null then perform private.other_flag_v1(new.id, 'profile:' || hit, null, null); end if;
    return new;
end $$;

drop trigger if exists a_other_guard_v1_trg on public.messages;
create trigger a_other_guard_v1_trg before insert on public.messages for each row execute function private.other_msg_guard_v1();
drop trigger if exists a_other_edit_guard_v1_trg on public.messages;
create trigger a_other_edit_guard_v1_trg before update of content on public.messages for each row execute function private.other_msg_edit_guard_v1();
drop trigger if exists a_other_profile_guard_v1_trg on public.profiles;
create trigger a_other_profile_guard_v1_trg before update of display_name, bio, status_message on public.profiles for each row execute function private.other_profile_guard_v1();

do $m$
declare d text; anchor text := 'insert into public.ng_state(user_id) values (p_user) on conflict do nothing;';
begin
  d := pg_get_functiondef('private.ng_strike(uuid,text,text,text,uuid)'::regprocedure);
  if position('other_flag_v1' in d) = 0 then
    if position(anchor in d) = 0 then raise exception 'anchor_not_found_ng_strike'; end if;
    d := replace(d, anchor, E'perform private.other_flag_v1(p_user, ''NG:'' || coalesce(p_word, ''?''), p_snippet, p_room, false);\n  ' || anchor);
    execute d;
  end if;
end $m$;

create or replace function public.my_ui_flags() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_me uuid := (select auth.uid()); v_adm boolean; v_seg text; v_room uuid; v_oth boolean; v_virus boolean := false;
        cfg private.other_guard_cfg%rowtype; v_left int := null;
begin
    if v_me is null then raise exception 'authentication_required'; end if;
    v_adm := private.is_admin_user(v_me);
    v_seg := private.seg_of(v_me);
    v_oth := private.is_other_v1(v_me);
    select r.room_id into v_room from private.segment_rooms r where r.segment = v_seg;
    if v_oth then
        select * into cfg from private.other_guard_cfg where id = 1;
        select coalesce(f.virus, false) into v_virus from private.other_flags f where f.user_id = v_me;
        v_virus := coalesce(v_virus, false);
        select greatest(coalesce(cfg.limit_admin, 5) - coalesce((select c.n from private.other_send_counts c where c.user_id = v_me and c.partner_key = 'admin'), 0), 0) into v_left;
    end if;
    return jsonb_build_object(
        'is_admin',   v_adm,
        'show_users', v_adm or v_seg in ('work','friend'),
        'show_posts', v_adm or v_seg in ('work','friend'),
        'restricted', (not v_adm) and v_seg = 'home',
        'request_room', v_room,
        'quick', case when v_adm then null when v_seg = 'home' then 'q1' when v_seg = 'work' then 'q2' when v_seg = 'friend' then 'q3' else 'q4' end,
        'admin_alias', case
            when (not v_adm) and v_seg = 'work'
              then (select jsonb_build_object('name', '坂井さん', 'ids', coalesce(jsonb_agg(p.id), '[]'::jsonb)) from public.profiles p where private.is_admin_user(p.id))
            when v_oth
              then (select jsonb_build_object('name', '主人公', 'ids', coalesce(jsonb_agg(p.id), '[]'::jsonb)) from public.profiles p where private.is_admin_user(p.id))
            else null end,
        'virus', v_virus,
        'other', case when v_oth then jsonb_build_object('limit_admin', coalesce(cfg.limit_admin, 5), 'limit_user', coalesce(cfg.limit_user, 1), 'admin_left', v_left) else null end);
end $$;

create or replace function public.report_violation_v1(p_kind text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_me uuid := (select auth.uid()); cfg private.other_guard_cfg%rowtype;
begin
    if v_me is null or not private.is_other_v1(v_me) then return; end if;
    select * into cfg from private.other_guard_cfg where id = 1;
    if found and not cfg.client_reports then return; end if;
    if p_kind is null or p_kind !~ '^(rls|blocked|admin_rpc|tamper|probe)(:[a-z0-9_./-]{0,60})?$' then return; end if;
    perform private.other_flag_v1(v_me, 'client:' || p_kind, null, null);
end $$;

create or replace function public.admin_clear_virus_v1(p_user uuid, p_reset_counts boolean default false) returns void
language plpgsql security definer set search_path to '' as $$
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    delete from private.other_flags where user_id = p_user;
    if p_reset_counts then delete from private.other_send_counts where user_id = p_user; end if;
end $$;

create or replace function public.admin_list_virus_v1() returns table (user_id uuid, display_name text, virus boolean, strikes integer, reason text, last_at timestamptz)
language plpgsql stable security definer set search_path to '' as $$
begin
    if not private.is_admin_user((select auth.uid())) then raise exception 'not_allowed'; end if;
    return query select f.user_id, p.display_name, f.virus, f.strikes, f.reason, f.last_at
                   from private.other_flags f join public.profiles p on p.id = f.user_id
                  order by f.last_at desc limit 200;
end $$;

revoke all on function public.report_violation_v1(text) from public, anon;
revoke all on function public.admin_clear_virus_v1(uuid, boolean) from public, anon;
revoke all on function public.admin_list_virus_v1() from public, anon;
grant execute on function public.report_violation_v1(text) to authenticated;
grant execute on function public.admin_clear_virus_v1(uuid, boolean) to authenticated;
grant execute on function public.admin_list_virus_v1() to authenticated;
revoke all on function private.other_scan_v1(text, text), private.other_flag_v1(uuid, text, text, uuid, boolean) from public, anon, authenticated;

-- ===== fixes =====
-- 「その他」は、管理者の投稿も含めて他人の投稿は一切見られない
create or replace function public.can_view_post(p_post_id uuid, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path to '' as $$
    select p_user_id = (select auth.uid()) and exists (
        select 1 from public.posts p
        where p.id = p_post_id and p.deleted_at is null
          and (p.author_id = p_user_id or (
               not private.is_other_v1(p_user_id)
               and private.seg_pair_ok(p_user_id, p.author_id, false)
               and (p.visibility = 'public'
                 or (p.visibility = 'followers' and exists (
                    select 1 from public.follows f where f.follower_id = p_user_id and f.followee_id = p.author_id)))))
    );
$$;
