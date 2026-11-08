-- =====================================================================
-- ポイント制：登録から365日後は、管理者いがいの全アカウントを「ポイントで解放」する方式にする
-- 作成：2026-11-08（AREDA／Supabase「ARE」プロジェクト）
--
-- 仕組み（すでに入っているものを使います。新しい仕組みは足しません）
--   ・登録から trial_days 日のあいだは、全機能が使える（お試し期間）
--   ・そのあとは、ポイントで「パック」を交換した機能だけ使える（交換ずみは ずっと無制限）
--   ・交換していない機能は、入口で「ポイントで解放します」の案内が出て、使えない
--   ・管理者は、何日たっても すべて無制限（private.is_admin_user で判定）
--
-- このSQLがすること
--   ① お試し期間を 90日 → 365日 にする
--   ② 「かしこいパック」に、通話の画面共有（screen）と AI画像・動画生成（aistudio）を入れる
--   ③ 新しい「ぼうけんパック」を作る（RPG・ARE QUEST 2/3・ARE CARD・推理ゲーム・ドリームフロンティア・大富豪）
--      ※これまで「ずっと無料」だったゲームも、365日のあとはポイント制になります
--
-- SQL Editor に貼って Run（何回 実行しても、同じ結果になります）
-- =====================================================================

-- ① お試し期間：365日
update private.pt_cfg set value = 365 where key = 'trial_days';

-- ② かしこいパック
update public.shop_items
   set features = array['myai','ai','work','screen','aistudio'],
       description = 'AIともぴー・会話の分析・ワークスペース・通話の画面共有・AI画像/動画生成'
 where key = 'pack_smart';

-- ③ ぼうけんパック（なければ作る／あれば中身をそろえる）
insert into public.shop_items (kind, key, title, description, price, features, active, sort)
select 'pack', 'pack_adventure', 'ぼうけんパック',
       'ARE（RPG）・ARE QUEST 2・ARE QUEST 3・ARE CARD・推理ゲーム・ドリームフロンティア・大富豪',
       500, array['rpg','game2','game3','game4','game5','dream','daifugo'], true, 35
where not exists (select 1 from public.shop_items where key = 'pack_adventure');

update public.shop_items
   set features = array['rpg','game2','game3','game4','game5','dream','daifugo'], active = true
 where key = 'pack_adventure';

-- 確認用（実行すると、いまの設定が見えます）
-- select key, value from private.pt_cfg where key = 'trial_days';
-- select key, title, price, features, active from public.shop_items order by sort;
