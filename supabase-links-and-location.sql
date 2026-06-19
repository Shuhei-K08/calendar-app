-- ShareCal: TODO機能の削除 + URL一覧（行った場所）用の列追加
-- Supabase SQL エディタで実行してください。

-- 1) TODO機能を完全削除 -------------------------------------------------
-- テーブルを cascade で消すと、付随するポリシー・索引も自動で削除されます。
-- テーブルが存在しなくても if exists により安全に何もしません。
drop table if exists public.todos cascade;

-- 2) 予定に「場所」情報を追加 -------------------------------------------
-- prefecture: 都道府県（例: 東京都）, city: 市区町村（例: 渋谷区）
-- place_name: お店・場所の名前（リンク集で編集可能。未設定ならURLから自動取得した店名を表示）
alter table public.events
  add column if not exists prefecture text;

alter table public.events
  add column if not exists city text;

alter table public.events
  add column if not exists place_name text;

-- 地図表示用の緯度・経度（ジオコーディング結果のキャッシュ）
alter table public.events
  add column if not exists lat double precision;

alter table public.events
  add column if not exists lng double precision;

-- URL一覧の検索・絞り込みを速くするための索引
create index if not exists events_url_idx
  on public.events(user_id)
  where url is not null;

create index if not exists events_prefecture_idx
  on public.events(prefecture)
  where prefecture is not null;
