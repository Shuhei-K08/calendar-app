-- ShareCal: TODO機能の削除 + URL一覧（行った場所）用の列追加
-- Supabase SQL エディタで実行してください。

-- 1) TODO機能を完全削除 -------------------------------------------------
drop policy if exists "users can view own todos" on public.todos;
drop policy if exists "users can insert own todos" on public.todos;
drop policy if exists "users can update own todos" on public.todos;
drop policy if exists "users can delete own todos" on public.todos;

drop index if exists public.todos_user_id_idx;

drop table if exists public.todos cascade;

-- 2) 予定に「場所」情報を追加 -------------------------------------------
-- prefecture: 都道府県（例: 東京都）, city: 市区町村（例: 渋谷区）
alter table public.events
  add column if not exists prefecture text;

alter table public.events
  add column if not exists city text;

-- URL一覧の検索・絞り込みを速くするための索引
create index if not exists events_url_idx
  on public.events(user_id)
  where url is not null;

create index if not exists events_prefecture_idx
  on public.events(prefecture)
  where prefecture is not null;
